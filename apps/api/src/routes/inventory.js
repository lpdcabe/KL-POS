import { Router } from 'express'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase.js'
import { allowPermission, allowRoles } from '../middleware/auth.js'

const itemSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sku: z.string().trim().max(40).optional().or(z.literal('')),
  unit: z.string().trim().min(1).max(20),
  quantityOnHand: z.coerce.number().min(0).max(999999).default(0),
  reorderLevel: z.coerce.number().min(0).max(999999).default(0)
})

const movementSchema = z.object({
  type: z.enum(['receiving', 'return', 'wastage', 'staff_meal', 'count_adjustment']),
  quantity: z.coerce.number().min(0).max(999999),
  reason: z.string().trim().min(2).max(200)
})

async function activeStore(admin) {
  const { data, error } = await admin.from('stores').select('id, name').eq('is_active', true).order('created_at').limit(1).maybeSingle()
  if (error) throw error
  return data
}

export const inventoryRouter = Router()

inventoryRouter.get('/', allowPermission('inventory', 'owner_admin', 'manager', 'kitchen'), async (req, res, next) => {
  try {
    const admin = createAdminClient()
    const store = await activeStore(admin)
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })

    const { data: items, error: itemError } = await admin.from('inventory_items').select('id, sku, name, unit, quantity_on_hand, reorder_level, updated_at').eq('store_id', store.id).eq('is_active', true).order('name')
    if (itemError) return res.status(400).json({ error: itemError.message })
    const lowStock = items.filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)).length
    const outOfStock = items.filter((item) => Number(item.quantity_on_hand) <= 0).length

    return res.json({
      store,
      items,
      summary: { totalItems: items.length, lowStock, outOfStock }
    })
  } catch (error) {
    return next(error)
  }
})

inventoryRouter.post('/items', allowPermission('inventory', 'owner_admin', 'manager'), allowRoles('owner_admin', 'manager'), async (req, res, next) => {
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid item name, unit, quantity, and reorder level.' })

  try {
    const admin = createAdminClient()
    const store = await activeStore(admin)
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })

    const input = parsed.data
    const { data: item, error: itemError } = await admin.from('inventory_items').insert({
      store_id: store.id,
      name: input.name,
      sku: input.sku || null,
      unit: input.unit,
      quantity_on_hand: input.quantityOnHand,
      reorder_level: input.reorderLevel
    }).select('id, sku, name, unit, quantity_on_hand, reorder_level, updated_at').single()

    if (itemError) {
      const message = itemError.code === '23505' ? 'That SKU is already in use.' : itemError.message
      return res.status(400).json({ error: message })
    }

    if (input.quantityOnHand > 0) {
      const { error: movementError } = await admin.from('inventory_movements').insert({
        store_id: store.id,
        inventory_item_id: item.id,
        movement_type: 'receiving',
        quantity_delta: input.quantityOnHand,
        reason: 'Opening stock',
        created_by: req.user.id
      })
      if (movementError) {
        await admin.from('inventory_items').delete().eq('id', item.id)
        return res.status(500).json({ error: 'The opening stock record could not be created.' })
      }
    }

    await admin.from('audit_logs').insert({ store_id: store.id, actor_id: req.user.id, action: 'inventory.item_created', entity_type: 'inventory_item', entity_id: item.id, metadata: { name: item.name, opening_stock: input.quantityOnHand } })
    return res.status(201).json({ item })
  } catch (error) {
    return next(error)
  }
})

inventoryRouter.patch('/items/:id/movement', allowPermission('inventory', 'owner_admin', 'manager'), allowRoles('owner_admin', 'manager'), async (req, res, next) => {
  const parsed = movementSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a movement type, enter a valid quantity, and provide a reason.' })

  try {
    const admin = createAdminClient()
    const { data: item, error: itemError } = await admin.from('inventory_items').select('id, store_id, name, unit, quantity_on_hand, is_active').eq('id', req.params.id).maybeSingle()
    if (itemError || !item?.is_active) return res.status(404).json({ error: 'Inventory item not found.' })

    const input = parsed.data
    const current = Number(item.quantity_on_hand)
    let delta = input.quantity
    if (input.type === 'wastage' || input.type === 'staff_meal') delta = -input.quantity
    if (input.type === 'count_adjustment') delta = input.quantity - current
    if (delta === 0) return res.status(400).json({ error: 'The entered quantity does not change the current stock.' })

    const nextQuantity = current + delta
    if (nextQuantity < 0) return res.status(409).json({ error: `Only ${current} ${item.unit} is available.` })

    const { data: updated, error: updateError } = await admin.from('inventory_items')
      .update({ quantity_on_hand: nextQuantity })
      .eq('id', item.id)
      .eq('quantity_on_hand', item.quantity_on_hand)
      .select('id, sku, name, unit, quantity_on_hand, reorder_level, updated_at')
      .maybeSingle()

    if (updateError) return res.status(400).json({ error: updateError.message })
    if (!updated) return res.status(409).json({ error: 'Another user changed this item. Refresh and try again.' })

    const { data: movement, error: movementError } = await admin.from('inventory_movements').insert({
      store_id: item.store_id,
      inventory_item_id: item.id,
      movement_type: input.type,
      quantity_delta: delta,
      reason: input.reason,
      created_by: req.user.id
    }).select('id, inventory_item_id, movement_type, quantity_delta, reason, created_by, created_at').single()

    if (movementError) {
      await admin.from('inventory_items').update({ quantity_on_hand: current }).eq('id', item.id).eq('quantity_on_hand', nextQuantity)
      return res.status(500).json({ error: 'The stock movement could not be recorded.' })
    }

    await admin.from('audit_logs').insert({ store_id: item.store_id, actor_id: req.user.id, action: 'inventory.stock_changed', entity_type: 'inventory_item', entity_id: item.id, metadata: { movement_type: input.type, quantity_delta: delta, previous_quantity: current, new_quantity: nextQuantity, reason: input.reason } })
    return res.json({ item: updated, movement })
  } catch (error) {
    return next(error)
  }
})
