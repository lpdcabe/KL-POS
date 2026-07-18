import { Router } from 'express'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase.js'
import { allowPermission } from '../middleware/auth.js'

const allowedRoles = ['owner_admin', 'manager', 'cashier', 'kitchen', 'rider']
const validChannels = ['dine_in', 'takeout', 'store_delivery', 'grabfood']
const validStatuses = ['draft', 'confirmed', 'accepted', 'preparing', 'ready', 'ready_for_dispatch', 'out_for_delivery', 'served', 'released', 'picked_up', 'delivered', 'cancelled', 'failed', 'returned', 'completed']
const activeStatuses = ['confirmed', 'accepted', 'preparing', 'ready', 'ready_for_dispatch', 'out_for_delivery']
const completedStatuses = ['served', 'released', 'picked_up', 'delivered', 'completed']
const checkoutSchema = z.object({
  channel: z.enum(['dine_in', 'takeout', 'store_delivery', 'grabfood']),
  items: z.array(z.object({
    id: z.string().trim().max(100).optional(),
    name: z.string().trim().min(1).max(150),
    price: z.coerce.number().min(0).max(100000),
    quantity: z.coerce.number().int().min(1).max(20),
    modifiers: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(100), priceDelta: z.coerce.number().min(0).max(100000).default(0) })).max(10).default([])
  })).min(1).max(100),
  customerName: z.string().trim().max(120).optional().default(''),
  customerMobile: z.string().trim().max(30).optional().default(''),
  tableNumber: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  barangay: z.string().trim().max(100).optional().default(''),
  specialInstructions: z.string().trim().max(500).optional().default(''),
  grabReference: z.string().trim().max(100).optional().default(''),
  paymentMethod: z.enum(['cash', 'gcash', 'maya', 'card', 'grabfood_prepaid', 'store_delivery_prepaid', 'store_delivery_cod']),
  tenderedAmount: z.coerce.number().min(0).max(1000000).optional(),
  externalReference: z.string().trim().max(120).optional().default('')
})

function dateInManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export const ordersRouter = Router()

ordersRouter.post('/', allowPermission('pos', 'owner_admin', 'manager', 'cashier'), async (req, res, next) => {
  const parsed = checkoutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Review the order, customer details, and payment information.' })

  try {
    const input = parsed.data
    if (input.channel === 'store_delivery' && !input.address) return res.status(400).json({ error: 'A delivery address is required.' })
    if (input.channel === 'grabfood' && !input.grabReference) return res.status(400).json({ error: 'A GrabFood reference is required.' })
    if (input.channel !== 'dine_in' && input.tableNumber) return res.status(400).json({ error: 'Table number is only available for dine-in orders.' })

    const allowedMethods = {
      dine_in: ['cash', 'gcash', 'maya', 'card'],
      takeout: ['cash', 'gcash', 'maya', 'card'],
      store_delivery: ['store_delivery_prepaid', 'store_delivery_cod'],
      grabfood: ['grabfood_prepaid']
    }
    if (!allowedMethods[input.channel].includes(input.paymentMethod)) return res.status(400).json({ error: 'Choose a payment method available for this sales channel.' })

    const subtotal = Number(input.items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2))
    if (subtotal <= 0) return res.status(400).json({ error: 'The order total must be greater than zero.' })
    if (input.paymentMethod === 'cash' && Number(input.tenderedAmount || 0) < subtotal) return res.status(400).json({ error: 'The cash received is less than the order total.' })

    const admin = createAdminClient()
    const { data: store, error: storeError } = await admin.from('stores').select('id').eq('is_active', true).order('created_at').limit(1).maybeSingle()
    if (storeError) throw storeError
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })

    const now = new Date().toISOString()
    const { data: order, error: orderError } = await admin.from('orders').insert({
      store_id: store.id,
      cashier_id: req.user.id,
      channel: input.channel,
      status: 'confirmed',
      table_number: input.channel === 'dine_in' ? input.tableNumber || null : null,
      customer_name: input.customerName || null,
      customer_mobile: input.customerMobile || null,
      special_instructions: input.specialInstructions || null,
      subtotal,
      discount_total: 0,
      delivery_fee: 0,
      total: subtotal,
      confirmed_at: now
    }).select('id, order_number, channel, status, total, created_at').single()
    if (orderError) return res.status(400).json({ error: orderError.message })

    const failOrder = async (message) => {
      await admin.from('orders').update({ status: 'failed', cancellation_reason: message }).eq('id', order.id)
      return res.status(500).json({ error: message })
    }

    const { data: savedItems, error: itemError } = await admin.from('order_items').insert(input.items.map((item) => ({
      order_id: order.id,
      product_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id || '') ? item.id : null,
      product_name: item.name,
      sku: item.id || null,
      quantity: item.quantity,
      unit_price: item.price,
      line_total: Number((item.price * item.quantity).toFixed(2))
    }))).select('id')
    if (itemError) return failOrder('The order items could not be saved.')

    const savedModifiers = input.items.flatMap((item, index) => item.modifiers.map((modifier) => ({ order_item_id: savedItems[index].id, modifier_id: modifier.id, modifier_name: modifier.name, price_delta: modifier.priceDelta, quantity: 1 })))
    if (savedModifiers.length) {
      const { error: modifierError } = await admin.from('order_item_modifiers').insert(savedModifiers)
      if (modifierError) return failOrder('The selected flavors could not be saved.')
    }

    if (input.channel === 'store_delivery') {
      const { error } = await admin.from('store_delivery_details').insert({ order_id: order.id, address_line: input.address, barangay: input.barangay || null, cod_amount: input.paymentMethod === 'store_delivery_cod' ? subtotal : 0 })
      if (error) return failOrder('The delivery details could not be saved.')
    }
    if (input.channel === 'grabfood') {
      const { error } = await admin.from('grabfood_details').insert({ order_id: order.id, grab_reference: input.grabReference, gross_amount: subtotal })
      if (error) return failOrder(error.code === '23505' ? 'That GrabFood reference is already in use.' : 'The GrabFood details could not be saved.')
    }

    const isCod = input.paymentMethod === 'store_delivery_cod'
    const tendered = input.paymentMethod === 'cash' ? Number(input.tenderedAmount) : null
    const { error: paymentError } = await admin.from('payments').insert({
      order_id: order.id,
      method: input.paymentMethod,
      status: isCod ? 'pending' : 'paid',
      amount: subtotal,
      tendered_amount: tendered,
      change_amount: tendered === null ? null : Number((tendered - subtotal).toFixed(2)),
      external_reference: input.externalReference || input.grabReference || null,
      received_by: isCod ? null : req.user.id,
      paid_at: isCod ? null : now
    })
    if (paymentError) return failOrder('The payment record could not be saved.')

    await admin.from('order_status_history').insert({ order_id: order.id, from_status: null, to_status: 'confirmed', changed_by: req.user.id })
    await admin.from('audit_logs').insert({ store_id: store.id, actor_id: req.user.id, action: 'order.created', entity_type: 'order', entity_id: order.id, metadata: { order_number: order.order_number, channel: order.channel, total: subtotal, payment_method: input.paymentMethod } })
    return res.status(201).json({ order: { ...order, paymentMethod: input.paymentMethod, change: tendered === null ? 0 : Number((tendered - subtotal).toFixed(2)) } })
  } catch (error) {
    return next(error)
  }
})

ordersRouter.get('/', allowPermission('orders', ...allowedRoles), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(50, Math.max(10, Number.parseInt(req.query.pageSize, 10) || 20))
    const search = String(req.query.search || '').trim().slice(0, 100)
    const channel = validChannels.includes(req.query.channel) ? req.query.channel : ''
    const status = validStatuses.includes(req.query.status) ? req.query.status : ''
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : ''
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : ''
    const start = (page - 1) * pageSize

    let query = req.supabase
      .from('orders')
      .select('id, order_number, cashier_id, assigned_rider_id, channel, status, table_number, customer_name, customer_mobile, subtotal, discount_total, delivery_fee, total, confirmed_at, completed_at, cancelled_at, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(start, start + pageSize - 1)

    if (channel) query = query.eq('channel', channel)
    if (status) query = query.eq('status', status)
    if (from) query = query.gte('created_at', `${from}T00:00:00+08:00`)
    if (to) query = query.lt('created_at', `${to}T23:59:59.999+08:00`)
    if (search) {
      if (/^#?\d+$/.test(search)) query = query.eq('order_number', Number(search.replace('#', '')))
      else query = query.ilike('customer_name', `%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
    }

    const today = dateInManila()
    const countQuery = (configure) => configure(req.supabase.from('orders').select('id', { count: 'exact', head: true }))
    const [{ data, count, error }, todayResult, activeResult, completedResult] = await Promise.all([
      query,
      countQuery((builder) => builder.gte('created_at', `${today}T00:00:00+08:00`)),
      countQuery((builder) => builder.in('status', activeStatuses)),
      countQuery((builder) => builder.in('status', completedStatuses))
    ])

    if (error) return res.status(400).json({ error: error.message })
    const countError = todayResult.error || activeResult.error || completedResult.error
    if (countError) return res.status(400).json({ error: countError.message })

    const profileIds = [...new Set(data.flatMap((order) => [order.cashier_id, order.assigned_rider_id]).filter(Boolean))]
    const staff = new Map()
    if (profileIds.length) {
      const admin = createAdminClient()
      const { data: profiles } = await admin.from('profiles').select('id, full_name, role').in('id', profileIds)
      for (const profile of profiles || []) staff.set(profile.id, profile)
    }

    const orders = data.map((order) => ({ ...order, cashier: staff.get(order.cashier_id) || null, rider: staff.get(order.assigned_rider_id) || null }))
    return res.json({ orders, pagination: { page, pageSize, total: count || 0, pages: Math.max(1, Math.ceil((count || 0) / pageSize)) }, summary: { today: todayResult.count || 0, active: activeResult.count || 0, completed: completedResult.count || 0 } })
  } catch (error) {
    return next(error)
  }
})

ordersRouter.get('/:id', allowPermission('orders', ...allowedRoles), async (req, res, next) => {
  try {
    const { data: order, error } = await req.supabase
      .from('orders')
      .select(`
        *,
        order_items (*, order_item_modifiers (*)),
        payments (*),
        grabfood_details (*),
        store_delivery_details (*),
        order_status_history (*)
      `)
      .eq('id', req.params.id)
      .single()

    if (error || !order) return res.status(404).json({ error: 'Order not found or unavailable to your role.' })

    const profileIds = [...new Set([order.cashier_id, order.assigned_rider_id, order.approved_by, ...order.order_status_history.map((entry) => entry.changed_by)].filter(Boolean))]
    const admin = createAdminClient()
    const { data: profiles } = profileIds.length ? await admin.from('profiles').select('id, full_name, role, employee_code').in('id', profileIds) : { data: [] }
    const staff = new Map((profiles || []).map((profile) => [profile.id, profile]))

    return res.json({
      order: {
        ...order,
        cashier: staff.get(order.cashier_id) || null,
        rider: staff.get(order.assigned_rider_id) || null,
        approver: staff.get(order.approved_by) || null,
        order_status_history: order.order_status_history
          .map((entry) => ({ ...entry, changed_by_profile: staff.get(entry.changed_by) || null }))
          .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
      }
    })
  } catch (error) {
    return next(error)
  }
})
