import { Router } from 'express'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase.js'
import { allowPermission, allowRoles } from '../middleware/auth.js'

const deliveryStatuses = ['confirmed', 'accepted', 'preparing', 'ready', 'ready_for_dispatch', 'out_for_delivery', 'delivered']
const assignSchema = z.object({ riderId: z.uuid() })
const completionSchema = z.object({ confirmation: z.string().trim().min(2).max(200) })

export const deliveriesRouter = Router()

deliveriesRouter.get('/', allowPermission('deliveries', 'owner_admin', 'manager', 'rider'), async (req, res, next) => {
  try {
    const admin = createAdminClient()
    let orderQuery = admin
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        assigned_rider_id,
        customer_name,
        customer_mobile,
        total,
        created_at,
        updated_at,
        store_delivery_details (
          address_line,
          barangay,
          landmark,
          delivery_instructions,
          delivery_zone,
          dispatched_at,
          delivered_at,
          delivery_confirmation,
          cod_amount,
          cod_remitted_amount,
          cod_remitted_at,
          failure_reason
        )
      `)
      .eq('channel', 'store_delivery')
      .in('status', deliveryStatuses)
      .order('created_at', { ascending: true })
      .limit(100)

    if (req.profile.role === 'rider') orderQuery = orderQuery.eq('assigned_rider_id', req.user.id)

    const [{ data: orders, error: orderError }, { data: riders, error: riderError }] = await Promise.all([
      orderQuery,
      admin.from('profiles').select('id, full_name, employee_code').eq('role', 'rider').eq('is_active', true).order('full_name')
    ])

    if (orderError) return res.status(400).json({ error: orderError.message })
    if (riderError) return res.status(400).json({ error: riderError.message })

    const riderMap = new Map(riders.map((rider) => [rider.id, rider]))
    const deliveries = orders.map((order) => ({ ...order, rider: riderMap.get(order.assigned_rider_id) || null }))
    return res.json({ deliveries, riders, refreshedAt: new Date().toISOString() })
  } catch (error) {
    return next(error)
  }
})

deliveriesRouter.patch('/:id/assign', allowPermission('deliveries', 'owner_admin', 'manager'), allowRoles('owner_admin', 'manager'), async (req, res, next) => {
  const parsed = assignSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose an active rider.' })

  try {
    const admin = createAdminClient()
    const [{ data: rider }, { data: order, error: orderError }] = await Promise.all([
      admin.from('profiles').select('id, full_name').eq('id', parsed.data.riderId).eq('role', 'rider').eq('is_active', true).maybeSingle().then(({ data }) => ({ data })),
      admin.from('orders').select('id, store_id, status, channel, assigned_rider_id').eq('id', req.params.id).single()
    ])

    if (!rider) return res.status(400).json({ error: 'The selected rider is not active.' })
    if (orderError || !order || order.channel !== 'store_delivery') return res.status(404).json({ error: 'Store delivery not found.' })
    if (['out_for_delivery', 'delivered', 'completed', 'cancelled'].includes(order.status)) return res.status(409).json({ error: 'This delivery can no longer be reassigned.' })

    const status = order.status === 'ready' ? 'ready_for_dispatch' : order.status
    const { data: updated, error: updateError } = await admin
      .from('orders')
      .update({ assigned_rider_id: rider.id, status })
      .eq('id', order.id)
      .eq('status', order.status)
      .select('id, assigned_rider_id, status')
      .maybeSingle()

    if (updateError) return res.status(400).json({ error: updateError.message })
    if (!updated) return res.status(409).json({ error: 'Another user updated this delivery. Refresh and try again.' })

    if (status !== order.status) {
      await admin.from('order_status_history').insert({ order_id: order.id, from_status: order.status, to_status: status, changed_by: req.user.id })
    }
    await admin.from('audit_logs').insert({ store_id: order.store_id, actor_id: req.user.id, action: 'delivery.rider_assigned', entity_type: 'order', entity_id: order.id, metadata: { rider_id: rider.id, previous_rider_id: order.assigned_rider_id } })
    return res.json({ delivery: updated })
  } catch (error) {
    return next(error)
  }
})

deliveriesRouter.patch('/:id/dispatch', allowPermission('deliveries', 'owner_admin', 'manager', 'rider'), async (req, res, next) => {
  try {
    const admin = createAdminClient()
    const { data: order, error: orderError } = await admin.from('orders').select('id, store_id, status, channel, assigned_rider_id').eq('id', req.params.id).single()
    if (orderError || !order || order.channel !== 'store_delivery') return res.status(404).json({ error: 'Store delivery not found.' })
    if (req.profile.role === 'rider' && order.assigned_rider_id !== req.user.id) return res.status(403).json({ error: 'This delivery is assigned to another rider.' })
    if (!order.assigned_rider_id) return res.status(409).json({ error: 'Assign a rider before dispatching this order.' })
    if (!['ready', 'ready_for_dispatch'].includes(order.status)) return res.status(409).json({ error: 'Only ready orders can be dispatched.' })

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await admin.from('orders').update({ status: 'out_for_delivery' }).eq('id', order.id).eq('status', order.status).select('id, status').maybeSingle()
    if (updateError) return res.status(400).json({ error: updateError.message })
    if (!updated) return res.status(409).json({ error: 'Another user updated this delivery. Refresh and try again.' })

    const { error: detailError } = await admin.from('store_delivery_details').update({ dispatched_at: now }).eq('order_id', order.id)
    if (detailError) {
      await admin.from('orders').update({ status: order.status }).eq('id', order.id).eq('status', 'out_for_delivery')
      return res.status(500).json({ error: 'Dispatch could not be recorded. Please try again.' })
    }

    await admin.from('order_status_history').insert({ order_id: order.id, from_status: order.status, to_status: 'out_for_delivery', changed_by: req.user.id })
    await admin.from('audit_logs').insert({ store_id: order.store_id, actor_id: req.user.id, action: 'delivery.dispatched', entity_type: 'order', entity_id: order.id, metadata: { rider_id: order.assigned_rider_id } })
    return res.json({ delivery: updated })
  } catch (error) {
    return next(error)
  }
})

deliveriesRouter.patch('/:id/complete', allowPermission('deliveries', 'owner_admin', 'manager', 'rider'), async (req, res, next) => {
  const parsed = completionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a delivery confirmation.' })

  try {
    const admin = createAdminClient()
    const { data: order, error: orderError } = await admin.from('orders').select('id, store_id, status, channel, assigned_rider_id').eq('id', req.params.id).single()
    if (orderError || !order || order.channel !== 'store_delivery') return res.status(404).json({ error: 'Store delivery not found.' })
    if (req.profile.role === 'rider' && order.assigned_rider_id !== req.user.id) return res.status(403).json({ error: 'This delivery is assigned to another rider.' })
    if (order.status !== 'out_for_delivery') return res.status(409).json({ error: 'Only dispatched orders can be marked delivered.' })

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await admin.from('orders').update({ status: 'delivered', completed_at: now }).eq('id', order.id).eq('status', 'out_for_delivery').select('id, status').maybeSingle()
    if (updateError) return res.status(400).json({ error: updateError.message })
    if (!updated) return res.status(409).json({ error: 'Another user updated this delivery. Refresh and try again.' })

    const { error: detailError } = await admin.from('store_delivery_details').update({ delivered_at: now, delivery_confirmation: parsed.data.confirmation }).eq('order_id', order.id)
    if (detailError) {
      await admin.from('orders').update({ status: 'out_for_delivery', completed_at: null }).eq('id', order.id).eq('status', 'delivered')
      return res.status(500).json({ error: 'Delivery confirmation could not be recorded. Please try again.' })
    }

    await admin.from('order_status_history').insert({ order_id: order.id, from_status: 'out_for_delivery', to_status: 'delivered', changed_by: req.user.id })
    await admin.from('audit_logs').insert({ store_id: order.store_id, actor_id: req.user.id, action: 'delivery.completed', entity_type: 'order', entity_id: order.id, metadata: { confirmation: parsed.data.confirmation } })
    return res.json({ delivery: updated })
  } catch (error) {
    return next(error)
  }
})
