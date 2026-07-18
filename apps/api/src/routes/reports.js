import { Router } from 'express'
import { createAdminClient } from '../lib/supabase.js'
import { allowPermission } from '../middleware/auth.js'

const saleStatuses = new Set(['served', 'released', 'picked_up', 'delivered', 'completed'])
const exceptionStatuses = new Set(['cancelled', 'failed', 'returned'])
const channelLabels = { dine_in: 'Dine-in', takeout: 'Takeout', store_delivery: 'Store delivery', grabfood: 'GrabFood' }
const paymentLabels = { cash: 'Cash', gcash: 'GCash', card: 'Card', grabfood: 'GrabFood' }

function manilaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function parseRange(query) {
  const today = manilaDate()
  const defaultFrom = new Date(`${today}T00:00:00+08:00`)
  defaultFrom.setDate(defaultFrom.getDate() - 6)
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : manilaDate(defaultFrom)
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : today
  const fromDate = new Date(`${from}T00:00:00+08:00`)
  const toDate = new Date(`${to}T23:59:59.999+08:00`)
  if (Number.isNaN(fromDate.valueOf()) || Number.isNaN(toDate.valueOf()) || fromDate > toDate) return null
  const days = Math.floor((toDate - fromDate) / 86_400_000) + 1
  if (days > 366) return null
  return { from, to, fromIso: fromDate.toISOString(), toIso: toDate.toISOString(), days }
}

async function fetchAll(makeQuery, pageSize = 1000) {
  const rows = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await makeQuery().range(start, start + pageSize - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

async function fetchForOrderIds(admin, table, columns, orderIds) {
  const rows = []
  for (let start = 0; start < orderIds.length; start += 300) {
    const ids = orderIds.slice(start, start + 300)
    const { data, error } = await admin.from(table).select(columns).in('order_id', ids)
    if (error) throw error
    rows.push(...data)
  }
  return rows
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export const reportsRouter = Router()

reportsRouter.get('/', allowPermission('reports', 'owner_admin', 'manager'), async (req, res, next) => {
  const range = parseRange(req.query)
  if (!range) return res.status(400).json({ error: 'Choose a valid date range of up to 366 days.' })

  try {
    const admin = createAdminClient()
    const { data: store, error: storeError } = await admin.from('stores').select('id, name').eq('is_active', true).order('created_at').limit(1).maybeSingle()
    if (storeError) return res.status(400).json({ error: storeError.message })
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })

    const [orders, shifts] = await Promise.all([
      fetchAll(() => admin.from('orders').select('id, order_number, channel, status, subtotal, discount_total, delivery_fee, total, cancellation_reason, created_at').eq('store_id', store.id).gte('created_at', range.fromIso).lte('created_at', range.toIso).order('created_at')),
      fetchAll(() => admin.from('shifts').select('id, status, opening_cash, expected_cash, actual_cash, variance, opened_at, closed_at, cashier_id').eq('store_id', store.id).gte('opened_at', range.fromIso).lte('opened_at', range.toIso).order('opened_at', { ascending: false }))
    ])

    const salesOrders = orders.filter((order) => saleStatuses.has(order.status))
    const salesIds = salesOrders.map((order) => order.id)
    const grabIds = salesOrders.filter((order) => order.channel === 'grabfood').map((order) => order.id)
    const [items, payments, grabRows] = await Promise.all([
      salesIds.length ? fetchForOrderIds(admin, 'order_items', 'order_id, product_id, product_name, sku, quantity, line_total', salesIds) : [],
      salesIds.length ? fetchForOrderIds(admin, 'payments', 'order_id, method, status, amount, refunded_amount, paid_at', salesIds) : [],
      grabIds.length ? fetchForOrderIds(admin, 'grabfood_details', 'order_id, grab_reference, gross_amount, commission_amount, other_deductions, net_receivable, settlement_reference, settled_at', grabIds) : []
    ])

    const grossSales = salesOrders.reduce((sum, order) => sum + Number(order.subtotal) + Number(order.delivery_fee), 0)
    const discounts = salesOrders.reduce((sum, order) => sum + Number(order.discount_total), 0)
    const netSales = salesOrders.reduce((sum, order) => sum + Number(order.total), 0)
    const refunds = payments.reduce((sum, payment) => sum + Number(payment.refunded_amount || 0), 0)

    const channels = Object.entries(channelLabels).map(([key, label]) => {
      const channelOrders = salesOrders.filter((order) => order.channel === key)
      return { key, label, orders: channelOrders.length, sales: round(channelOrders.reduce((sum, order) => sum + Number(order.total), 0)) }
    })

    const paymentMap = new Map()
    for (const payment of payments.filter((entry) => entry.status === 'paid')) {
      const current = paymentMap.get(payment.method) || { method: payment.method, label: paymentLabels[payment.method] || payment.method, transactions: 0, amount: 0, refunds: 0 }
      current.transactions += 1
      current.amount += Number(payment.amount)
      current.refunds += Number(payment.refunded_amount || 0)
      paymentMap.set(payment.method, current)
    }

    const productMap = new Map()
    for (const item of items) {
      const key = item.product_id || `${item.product_name}:${item.sku || ''}`
      const current = productMap.get(key) || { name: item.product_name, sku: item.sku, quantity: 0, sales: 0 }
      current.quantity += Number(item.quantity)
      current.sales += Number(item.line_total)
      productMap.set(key, current)
    }

    const dailyMap = new Map()
    for (let day = new Date(`${range.from}T12:00:00+08:00`); manilaDate(day) <= range.to; day.setDate(day.getDate() + 1)) {
      dailyMap.set(manilaDate(day), { date: manilaDate(day), orders: 0, sales: 0 })
    }
    for (const order of salesOrders) {
      const date = manilaDate(new Date(order.created_at))
      const current = dailyMap.get(date)
      if (current) {
        current.orders += 1
        current.sales += Number(order.total)
      }
    }

    const exceptionOrders = orders.filter((order) => exceptionStatuses.has(order.status))
    const exceptions = exceptionOrders.map((order) => ({ id: order.id, orderNumber: order.order_number, channel: order.channel, status: order.status, total: Number(order.total), reason: order.cancellation_reason, createdAt: order.created_at })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30)
    const grabfood = grabRows.reduce((summary, row) => ({
      orders: summary.orders + 1,
      gross: summary.gross + Number(row.gross_amount),
      commission: summary.commission + Number(row.commission_amount),
      deductions: summary.deductions + Number(row.other_deductions),
      net: summary.net + Number(row.net_receivable),
      settled: summary.settled + (row.settled_at ? Number(row.net_receivable) : 0),
      unsettledOrders: summary.unsettledOrders + (row.settled_at ? 0 : 1)
    }), { orders: 0, gross: 0, commission: 0, deductions: 0, net: 0, settled: 0, unsettledOrders: 0 })

    return res.json({
      store,
      range: { from: range.from, to: range.to, days: range.days },
      summary: { grossSales: round(grossSales), discounts: round(discounts), netSales: round(netSales - refunds), refunds: round(refunds), orders: salesOrders.length, averageTicket: salesOrders.length ? round((netSales - refunds) / salesOrders.length) : 0, exceptions: exceptionOrders.length },
      channels,
      payments: [...paymentMap.values()].map((payment) => ({ ...payment, amount: round(payment.amount), refunds: round(payment.refunds), net: round(payment.amount - payment.refunds) })).sort((a, b) => b.net - a.net),
      products: [...productMap.values()].map((product) => ({ ...product, quantity: round(product.quantity), sales: round(product.sales) })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      daily: [...dailyMap.values()].map((day) => ({ ...day, sales: round(day.sales) })),
      shifts: { total: shifts.length, open: shifts.filter((shift) => shift.status === 'open').length, closed: shifts.filter((shift) => shift.status !== 'open').length, variance: round(shifts.reduce((sum, shift) => sum + Number(shift.variance || 0), 0)) },
      grabfood: Object.fromEntries(Object.entries(grabfood).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value])),
      exceptions
    })
  } catch (error) {
    return next(error)
  }
})
