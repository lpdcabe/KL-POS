import { Router } from 'express'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase.js'
import { allowPermission } from '../middleware/auth.js'

const activeStatuses = ['confirmed', 'accepted', 'preparing', 'ready']
const nextStatus = {
  confirmed: 'accepted',
  accepted: 'preparing',
  preparing: 'ready'
}
const readyStatusByChannel = { dine_in: 'served', takeout: 'released', grabfood: 'picked_up' }
const completionStatuses = ['served', 'released', 'picked_up']
const statusSchema = z.object({ status: z.enum(['accepted', 'preparing', 'ready', 'served', 'released', 'picked_up']) })

export const kitchenRouter = Router()

kitchenRouter.get('/tickets', allowPermission('kitchen', 'owner_admin', 'manager', 'kitchen'), async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('orders')
      .select(`
        id,
        order_number,
        channel,
        status,
        table_number,
        customer_name,
        special_instructions,
        confirmed_at,
        created_at,
        order_items (
          id,
          product_name,
          quantity,
          notes,
          order_item_modifiers (id, modifier_name, quantity)
        )
      `)
      .in('status', activeStatuses)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ tickets: data, refreshedAt: new Date().toISOString() })
  } catch (error) {
    return next(error)
  }
})

kitchenRouter.patch('/tickets/:id/status', allowPermission('kitchen', 'owner_admin', 'manager', 'kitchen'), async (req, res, next) => {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid kitchen status.' })

  try {
    const admin = createAdminClient()
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, store_id, status, channel')
      .eq('id', req.params.id)
      .single()

    if (orderError || !order) return res.status(404).json({ error: 'Kitchen ticket not found.' })
    const expectedStatus = order.status === 'ready' ? readyStatusByChannel[order.channel] : nextStatus[order.status]
    if (expectedStatus !== parsed.data.status) {
      return res.status(409).json({ error: `This ticket cannot move from ${order.status} to ${parsed.data.status}. Refresh the board and try again.` })
    }

    const completed = completionStatuses.includes(parsed.data.status)
    const { data: updated, error: updateError } = await admin
      .from('orders')
      .update({ status: parsed.data.status, completed_at: completed ? new Date().toISOString() : null })
      .eq('id', order.id)
      .eq('status', order.status)
      .select('id, status, updated_at')
      .maybeSingle()

    if (updateError) return res.status(400).json({ error: updateError.message })
    if (!updated) return res.status(409).json({ error: 'Another user already updated this ticket. Refresh the board.' })

    const { error: historyError } = await admin.from('order_status_history').insert({
      order_id: order.id,
      from_status: order.status,
      to_status: parsed.data.status,
      changed_by: req.user.id
    })

    if (historyError) {
      await admin.from('orders').update({ status: order.status, completed_at: null }).eq('id', order.id).eq('status', parsed.data.status)
      return res.status(500).json({ error: 'The ticket update could not be recorded. Please try again.' })
    }

    await admin.from('audit_logs').insert({
      store_id: order.store_id,
      actor_id: req.user.id,
      action: 'kitchen.status_changed',
      entity_type: 'order',
      entity_id: order.id,
      metadata: { from_status: order.status, to_status: parsed.data.status }
    })

    return res.json({ ticket: updated })
  } catch (error) {
    return next(error)
  }
})
