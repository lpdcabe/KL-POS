import { Router } from 'express'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase.js'
import { allowAnyPermission, allowPermission } from '../middleware/auth.js'
import { rolePermissionDefaults } from '../lib/permissions.js'

const storeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  timezone: z.string().trim().min(3).max(60),
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase())
})
const terminalSchema = z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()) })
const terminalUpdateSchema = z.object({ name: z.string().trim().min(2).max(80), isActive: z.boolean() })
const availabilitySchema = z.object({ isAvailable: z.boolean() })
const productSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(2).max(150),
  sku: z.string().trim().max(60).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  basePrice: z.coerce.number().min(0).max(100000),
  requiresFlavor: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  flavors: z.array(z.string().trim().min(1).max(80)).max(30).default([])
})
const flavorsSchema = z.object({ flavors: z.array(z.string().trim().min(1).max(80)).min(1).max(30) })
const recipeSchema = z.object({
  components: z.array(z.object({
    inventoryItemId: z.uuid(),
    quantityRequired: z.coerce.number().positive().max(999999)
  })).min(1).max(50)
})

async function getStore(admin) {
  const { data, error } = await admin.from('stores').select('id, name, code, address, timezone, currency_code, is_active, updated_at').eq('is_active', true).order('created_at').limit(1).maybeSingle()
  if (error) throw error
  return data
}

export const settingsRouter = Router()

settingsRouter.get('/', allowAnyPermission('settings.store', 'settings.terminals', 'settings.menu', 'settings.operations', 'settings.security', 'settings.system'), async (req, res, next) => {
  try {
    const admin = createAdminClient()
    const store = await getStore(admin)
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })

    const [{ data: terminals, error: terminalError }, { data: categories, error: categoryError }, { data: products, error: productError }, { data: inventoryItems, error: inventoryError }, { count: openShifts, error: shiftError }] = await Promise.all([
      admin.from('terminals').select('id, name, code, is_active, created_at').eq('store_id', store.id).order('created_at'),
      admin.from('menu_categories').select('id, name, display_order, is_active').eq('store_id', store.id).order('display_order'),
      admin.from('products').select('id, category_id, name, sku, base_price, requires_flavor, is_available, is_active, updated_at, product_modifiers (modifier:modifiers (id, name, modifier_type, is_active)), product_recipes (inventory_item_id, quantity_required, inventory_item:inventory_items (id, name, unit, is_active))').eq('store_id', store.id).eq('is_active', true).order('name'),
      admin.from('inventory_items').select('id, name, unit, is_active').eq('store_id', store.id).eq('is_active', true).order('name'),
      admin.from('shifts').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('status', 'open')
    ])
    const dataError = terminalError || categoryError || productError || inventoryError || shiftError
    if (dataError) return res.status(400).json({ error: dataError.message })

    const assigned = req.profile.permissions || []
    const can = (permission) => req.profile.role === 'owner_admin' || assigned.includes(permission) || (!assigned.length && rolePermissionDefaults[req.profile.role]?.includes(permission))
    const categoryMap = new Map(categories.map((category) => [category.id, category]))
    const response = {}
    if (can('settings.store')) response.store = store
    if (can('settings.terminals')) response.terminals = terminals
    if (can('settings.menu')) {
      response.categories = categories
      response.products = products.map((product) => ({ ...product, category: categoryMap.get(product.category_id) || null }))
      response.inventoryItems = inventoryItems
    }
    if (can('settings.operations')) response.operations = {
        salesChannels: ['Dine-in', 'Takeout', 'Store delivery', 'GrabFood'],
        timezone: store.timezone,
        currency: store.currency_code,
        managerApproval: ['Discount override', 'Order void', 'Refund'],
        inventoryDeduction: 'Strictly at order confirmation',
        openShifts: openShifts || 0
      }
    if (can('settings.system')) response.system = { api: 'Connected', database: 'Connected', authentication: 'Supabase Auth', environment: process.env.NODE_ENV === 'production' ? 'Production' : 'Development' }
    return res.json(response)
  } catch (error) {
    return next(error)
  }
})

settingsRouter.patch('/store', allowPermission('settings.store', 'owner_admin'), async (req, res, next) => {
  const parsed = storeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid store name, address, timezone, and three-letter currency code.' })
  try {
    const admin = createAdminClient()
    const store = await getStore(admin)
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })
    const input = parsed.data
    const { data: updated, error } = await admin.from('stores').update({ name: input.name, address: input.address || null, timezone: input.timezone, currency_code: input.currencyCode }).eq('id', store.id).select('id, name, code, address, timezone, currency_code, is_active, updated_at').single()
    if (error) return res.status(400).json({ error: error.message })
    await admin.from('audit_logs').insert({ store_id: store.id, actor_id: req.user.id, action: 'settings.store_updated', entity_type: 'store', entity_id: store.id, metadata: { previous: { name: store.name, address: store.address, timezone: store.timezone, currency_code: store.currency_code } } })
    return res.json({ store: updated })
  } catch (error) {
    return next(error)
  }
})

settingsRouter.post('/terminals', allowPermission('settings.terminals', 'owner_admin'), async (req, res, next) => {
  const parsed = terminalSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a terminal name and an alphanumeric terminal code.' })
  try {
    const admin = createAdminClient()
    const store = await getStore(admin)
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })
    const { data: terminal, error } = await admin.from('terminals').insert({ store_id: store.id, name: parsed.data.name, code: parsed.data.code }).select('id, name, code, is_active, created_at').single()
    if (error) return res.status(400).json({ error: error.code === '23505' ? 'That terminal code already exists.' : error.message })
    await admin.from('audit_logs').insert({ store_id: store.id, actor_id: req.user.id, action: 'settings.terminal_created', entity_type: 'terminal', entity_id: terminal.id, metadata: { name: terminal.name, code: terminal.code } })
    return res.status(201).json({ terminal })
  } catch (error) {
    return next(error)
  }
})

settingsRouter.patch('/terminals/:id', allowPermission('settings.terminals', 'owner_admin'), async (req, res, next) => {
  const parsed = terminalUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid terminal name and status.' })
  try {
    const admin = createAdminClient()
    const { data: terminal, error: findError } = await admin.from('terminals').select('id, store_id, name, code, is_active').eq('id', req.params.id).maybeSingle()
    if (findError || !terminal) return res.status(404).json({ error: 'Terminal not found.' })
    if (!parsed.data.isActive && terminal.is_active) {
      const { count } = await admin.from('shifts').select('id', { count: 'exact', head: true }).eq('terminal_id', terminal.id).eq('status', 'open')
      if (count) return res.status(409).json({ error: 'Close the active shift before disabling this terminal.' })
    }
    const { data: updated, error } = await admin.from('terminals').update({ name: parsed.data.name, is_active: parsed.data.isActive }).eq('id', terminal.id).select('id, name, code, is_active, created_at').single()
    if (error) return res.status(400).json({ error: error.message })
    await admin.from('audit_logs').insert({ store_id: terminal.store_id, actor_id: req.user.id, action: 'settings.terminal_updated', entity_type: 'terminal', entity_id: terminal.id, metadata: { previous_name: terminal.name, previous_active: terminal.is_active } })
    return res.json({ terminal: updated })
  } catch (error) {
    return next(error)
  }
})

settingsRouter.patch('/products/:id/availability', allowPermission('settings.menu', 'owner_admin'), async (req, res, next) => {
  const parsed = availabilitySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid availability status.' })
  try {
    const admin = createAdminClient()
    const { data: product, error: findError } = await admin.from('products').select('id, store_id, name, is_available, is_active').eq('id', req.params.id).maybeSingle()
    if (findError || !product?.is_active) return res.status(404).json({ error: 'Menu item not found.' })
    const { data: updated, error } = await admin.from('products').update({ is_available: parsed.data.isAvailable }).eq('id', product.id).select('id, is_available, updated_at').single()
    if (error) return res.status(400).json({ error: error.message })
    await admin.from('audit_logs').insert({ store_id: product.store_id, actor_id: req.user.id, action: 'settings.product_availability_changed', entity_type: 'product', entity_id: product.id, metadata: { name: product.name, previous_available: product.is_available, is_available: parsed.data.isAvailable } })
    return res.json({ product: updated })
  } catch (error) {
    return next(error)
  }
})

settingsRouter.post('/products', allowPermission('settings.menu', 'owner_admin'), async (req, res, next) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a name, category, and valid menu price.' })
  try {
    const admin = createAdminClient()
    const store = await getStore(admin)
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })
    const { data: category } = await admin.from('menu_categories').select('id, name, display_order, is_active').eq('id', parsed.data.categoryId).eq('store_id', store.id).eq('is_active', true).maybeSingle()
    if (!category) return res.status(400).json({ error: 'Choose an active menu category.' })

    const input = parsed.data
    const flavors = [...new Set(input.flavors.map((flavor) => flavor.trim()).filter(Boolean))]
    if (input.requiresFlavor && !flavors.length) return res.status(400).json({ error: 'Add at least one flavor for this menu item.' })
    const { data: product, error } = await admin.from('products').insert({
      store_id: store.id,
      category_id: category.id,
      name: input.name,
      sku: input.sku || null,
      description: input.description || null,
      base_price: input.basePrice,
      requires_flavor: input.requiresFlavor,
      is_available: input.isAvailable
    }).select('id, category_id, name, sku, description, base_price, requires_flavor, is_available, is_active, updated_at').single()
    if (error) return res.status(400).json({ error: error.code === '23505' ? 'That SKU is already in use.' : error.message })

    if (flavors.length) {
      const { data: modifiers, error: modifierError } = await admin.from('modifiers').upsert(flavors.map((name) => ({ store_id: store.id, modifier_type: 'flavor', name, price_delta: 0, is_active: true })), { onConflict: 'store_id,modifier_type,name' }).select('id, name')
      if (modifierError) {
        await admin.from('products').delete().eq('id', product.id)
        return res.status(400).json({ error: 'The flavor choices could not be saved.' })
      }
      const { error: linkError } = await admin.from('product_modifiers').insert(modifiers.map((modifier) => ({ product_id: product.id, modifier_id: modifier.id, is_required: true, min_select: 1, max_select: 1 })))
      if (linkError) {
        await admin.from('products').delete().eq('id', product.id)
        return res.status(400).json({ error: 'The flavors could not be linked to this menu item.' })
      }
    }

    await admin.from('audit_logs').insert({ store_id: store.id, actor_id: req.user.id, action: 'settings.product_created', entity_type: 'product', entity_id: product.id, metadata: { name: product.name, sku: product.sku, category: category.name, base_price: product.base_price } })
    return res.status(201).json({ product: { ...product, category } })
  } catch (error) {
    return next(error)
  }
})

settingsRouter.patch('/products/:id/recipe', allowPermission('settings.menu', 'owner_admin'), async (req, res, next) => {
  const parsed = recipeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Add at least one ingredient with a quantity greater than zero.' })

  try {
    const admin = createAdminClient()
    const components = parsed.data.components.map((component) => ({
      inventory_item_id: component.inventoryItemId,
      quantity_required: component.quantityRequired
    }))
    const { error } = await admin.rpc('replace_product_recipe', {
      target_product_id: req.params.id,
      components
    })
    if (error) return res.status(400).json({ error: error.message })

    const { data: recipe, error: recipeError } = await admin
      .from('product_recipes')
      .select('inventory_item_id, quantity_required, inventory_item:inventory_items (id, name, unit, is_active)')
      .eq('product_id', req.params.id)
    if (recipeError) return res.status(400).json({ error: recipeError.message })

    await admin.from('audit_logs').insert({
      actor_id: req.user.id,
      action: 'settings.product_recipe_updated',
      entity_type: 'product',
      entity_id: req.params.id,
      metadata: { components }
    })
    return res.json({ recipe })
  } catch (error) {
    return next(error)
  }
})

settingsRouter.patch('/products/:id/flavors', allowPermission('settings.menu', 'owner_admin'), async (req, res, next) => {
  const parsed = flavorsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter at least one valid flavor.' })
  try {
    const admin = createAdminClient()
    const { data: product, error: productError } = await admin.from('products').select('id, store_id, name, is_active').eq('id', req.params.id).maybeSingle()
    if (productError || !product?.is_active) return res.status(404).json({ error: 'Menu item not found.' })
    const flavors = [...new Set(parsed.data.flavors.map((flavor) => flavor.trim()).filter(Boolean))]
    const { data: existingLinks } = await admin.from('product_modifiers').select('modifier_id, modifier:modifiers (modifier_type)').eq('product_id', product.id)
    const flavorIds = (existingLinks || []).filter((link) => link.modifier?.modifier_type === 'flavor').map((link) => link.modifier_id)
    if (flavorIds.length) await admin.from('product_modifiers').delete().eq('product_id', product.id).in('modifier_id', flavorIds)

    const { data: modifiers, error: modifierError } = await admin.from('modifiers').upsert(flavors.map((name) => ({ store_id: product.store_id, modifier_type: 'flavor', name, price_delta: 0, is_active: true })), { onConflict: 'store_id,modifier_type,name' }).select('id, name, modifier_type, is_active')
    if (modifierError) return res.status(400).json({ error: 'The flavor choices could not be saved.' })
    const { error: linkError } = await admin.from('product_modifiers').insert(modifiers.map((modifier) => ({ product_id: product.id, modifier_id: modifier.id, is_required: true, min_select: 1, max_select: 1 })))
    if (linkError) return res.status(400).json({ error: 'The flavors could not be linked to this menu item.' })
    await admin.from('products').update({ requires_flavor: true }).eq('id', product.id)
    await admin.from('audit_logs').insert({ store_id: product.store_id, actor_id: req.user.id, action: 'settings.product_flavors_updated', entity_type: 'product', entity_id: product.id, metadata: { name: product.name, flavors } })
    return res.json({ product: { id: product.id, requires_flavor: true, product_modifiers: modifiers.map((modifier) => ({ modifier })) } })
  } catch (error) {
    return next(error)
  }
})
