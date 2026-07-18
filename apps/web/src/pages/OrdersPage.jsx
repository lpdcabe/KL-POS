import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Eye, FilterX, Funnel, PackageSearch, Search, ShoppingBag, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const channelLabels = { dine_in: 'Dine-in', takeout: 'Takeout', store_delivery: 'Store delivery', grabfood: 'GrabFood' }
const statuses = ['draft', 'confirmed', 'accepted', 'preparing', 'ready', 'ready_for_dispatch', 'out_for_delivery', 'served', 'released', 'picked_up', 'delivered', 'cancelled', 'failed', 'returned', 'completed']
const emptyFilters = { search: '', channel: '', status: '', from: '', to: '' }

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function StatusBadge({ status }) {
  return <span className={`order-status order-status--${status}`}>{status.replaceAll('_', ' ')}</span>
}

function OrdersFilterModal({ filters, onChange, onApply, onClear, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="audit-filter-modal" role="dialog" aria-modal="true" aria-labelledby="orders-filter-title">
        <header><div><span className="eyebrow">Find a transaction</span><h2 id="orders-filter-title">Filter orders</h2><p>Search orders and narrow the history by channel, status, or date.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close filters"><X size={19} /></button></header>
        <form onSubmit={onApply}>
          <div className="audit-filter-fields">
            <label className="audit-filter-wide"><span>Search orders</span><div className="audit-modal-search"><Search size={17} /><input value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} placeholder="Order number or customer name" autoFocus /></div></label>
            <label><span>Sales channel</span><select value={filters.channel} onChange={(event) => onChange({ ...filters, channel: event.target.value })}><option value="">All channels</option>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Order status</span><select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
            <label><span>From date</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => onChange({ ...filters, from: event.target.value })} /></label>
            <label><span>To date</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => onChange({ ...filters, to: event.target.value })} /></label>
          </div>
          <footer><button className="secondary-button" type="button" onClick={onClear}><FilterX size={16} />Clear all</button><div><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Funnel size={16} />Apply filters</button></div></footer>
        </form>
      </section>
    </div>
  )
}

function OrderDrawer({ order, loading, onClose }) {
  if (!order && !loading) return null
  return (
    <div className="order-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="order-drawer" role="dialog" aria-modal="true" aria-label="Order details">
        {loading ? <div className="order-drawer__loading"><div className="spinner" />Loading order...</div> : <>
          <header><div><span className="eyebrow">Transaction details</span><h2>Order #{order.order_number}</h2><div><span className={`channel-tag channel-tag--${order.channel}`}>{channelLabels[order.channel]}</span><StatusBadge status={order.status} /></div></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
          <div className="order-drawer__body">
            <section className="order-detail-grid"><div><span>Created</span><strong>{dateTime(order.created_at)}</strong></div><div><span>Cashier</span><strong>{order.cashier?.full_name || '—'}</strong></div><div><span>Customer</span><strong>{order.customer_name || 'Walk-in'}</strong></div><div><span>{order.channel === 'dine_in' ? 'Table' : 'Mobile'}</span><strong>{order.table_number || order.customer_mobile || '—'}</strong></div></section>
            {order.special_instructions && <div className="order-special-note"><strong>Order note</strong><span>{order.special_instructions}</span></div>}
            <section className="order-detail-section"><div className="order-detail-section__heading"><h3>Items</h3><span>{order.order_items.length} line items</span></div><div className="order-detail-items">{order.order_items.map((item) => <div key={item.id}><span>{Number(item.quantity)}×</span><div><strong>{item.product_name}</strong>{item.order_item_modifiers.map((modifier) => <small key={modifier.id}>+ {modifier.modifier_name}</small>)}{item.notes && <small>Note: {item.notes}</small>}</div><b>{money(item.line_total)}</b></div>)}</div></section>
            <section className="order-totals"><div><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div><div><span>Discount</span><strong>− {money(order.discount_total)}</strong></div><div><span>Delivery fee</span><strong>{money(order.delivery_fee)}</strong></div><div className="order-totals__total"><span>Total</span><strong>{money(order.total)}</strong></div></section>
            <section className="order-detail-section"><div className="order-detail-section__heading"><h3>Payments</h3></div>{order.payments.length ? <div className="order-payment-list">{order.payments.map((payment) => <div key={payment.id}><span>{payment.method.toUpperCase()} · {payment.status}</span><strong>{money(payment.amount)}</strong><small>{dateTime(payment.paid_at)}</small></div>)}</div> : <p className="order-detail-empty">No payment record available.</p>}</section>
            {order.store_delivery_details && <section className="order-fulfillment"><h3>Store delivery</h3><p>{[order.store_delivery_details.address_line, order.store_delivery_details.barangay].filter(Boolean).join(', ')}</p><span>Rider: {order.rider?.full_name || 'Not assigned'} · COD {money(order.store_delivery_details.cod_amount)}</span></section>}
            {order.grabfood_details && <section className="order-fulfillment"><h3>GrabFood</h3><p>Reference {order.grabfood_details.grab_reference}</p><span>Net receivable: {money(order.grabfood_details.net_receivable)}</span></section>}
            <section className="order-detail-section"><div className="order-detail-section__heading"><h3>Status history</h3></div>{order.order_status_history.length ? <div className="order-timeline">{order.order_status_history.map((entry) => <div key={entry.id}><i /><div><strong>{entry.to_status.replaceAll('_', ' ')}</strong><span>{entry.changed_by_profile?.full_name || 'System'} · {dateTime(entry.changed_at)}</span>{entry.reason && <small>{entry.reason}</small>}</div></div>)}</div> : <p className="order-detail-empty">No status changes recorded.</p>}</section>
          </div>
        </>}
      </aside>
    </div>
  )
}

export function OrdersPage({ accessToken }) {
  const [orders, setOrders] = useState([])
  const [summary, setSummary] = useState({ today: 0, active: 0, completed: 0 })
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(filters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const filterCount = Object.values(appliedFilters).filter(Boolean).length

  const loadOrders = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      Object.entries(appliedFilters).forEach(([key, value]) => { if (value) params.set(key, value) })
      const result = await apiRequest(`/api/orders?${params}`, { accessToken })
      setOrders(result.orders)
      setSummary(result.summary)
      setPagination(result.pagination)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken, appliedFilters])

  useEffect(() => { loadOrders(1) }, [loadOrders])

  useEffect(() => {
    function handleOpenFilters(event) {
      if (event.detail?.route !== '/orders') return
      setFilters({ ...appliedFilters })
      setShowFilters(true)
    }
    window.addEventListener('kl:open-filters', handleOpenFilters)
    return () => window.removeEventListener('kl:open-filters', handleOpenFilters)
  }, [appliedFilters])

  function applyFilters(event) {
    event.preventDefault()
    setAppliedFilters({ ...filters })
    setShowFilters(false)
  }

  function clearFilters() {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setShowFilters(false)
  }

  async function openOrder(id) {
    setDetailLoading(true)
    setSelectedOrder({ id })
    try {
      const result = await apiRequest(`/api/orders/${id}`, { accessToken })
      setSelectedOrder(result.order)
    } catch (requestError) {
      setError(requestError.message)
      setSelectedOrder(null)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="page orders-page">
      <header className="page-header"><div><span className="eyebrow">Transaction history</span><h1>Orders</h1><p>Search and review orders from every supported sales channel.</p></div></header>
      {error && <div className="notice notice--error">{error}</div>}
      <section className="orders-summary"><article><ShoppingBag size={21} /><div><strong>{pagination.total}</strong><span>Accessible orders</span></div></article><article><CalendarDays size={21} /><div><strong>{summary.today}</strong><span>Today</span></div></article><article><Clock3 size={21} /><div><strong>{summary.active}</strong><span>Active</span></div></article><article><CheckCircle2 size={21} /><div><strong>{summary.completed}</strong><span>Completed</span></div></article></section>
      {filterCount > 0 && <section className="audit-active-filters"><span>Active filters</span>{appliedFilters.search && <b>Search: {appliedFilters.search}</b>}{appliedFilters.channel && <b>Channel: {channelLabels[appliedFilters.channel]}</b>}{appliedFilters.status && <b>Status: {appliedFilters.status.replaceAll('_', ' ')}</b>}{appliedFilters.from && <b>From: {appliedFilters.from}</b>}{appliedFilters.to && <b>To: {appliedFilters.to}</b>}<button type="button" onClick={clearFilters}><X size={14} />Clear</button></section>}
      <section className="orders-table-card"><div className="orders-table-card__heading"><div><span className="eyebrow">All channels</span><h2>Order history</h2></div><span>{pagination.total} results</span></div>{loading ? <div className="orders-loading"><div className="spinner" />Loading orders...</div> : orders.length ? <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Channel</th><th>Cashier</th><th>Status</th><th>Total</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id} onClick={() => openOrder(order.id)}><td><strong>#{order.order_number}</strong></td><td>{dateTime(order.created_at)}</td><td><strong>{order.customer_name || 'Walk-in'}</strong><small>{order.table_number ? `Table ${order.table_number}` : order.customer_mobile || ''}</small></td><td><span className={`channel-tag channel-tag--${order.channel}`}>{channelLabels[order.channel]}</span></td><td>{order.cashier?.full_name || '—'}</td><td><StatusBadge status={order.status} /></td><td><strong>{money(order.total)}</strong></td><td><button className="icon-button" type="button" aria-label={`View order ${order.order_number}`}><Eye size={17} /></button></td></tr>)}</tbody></table></div> : <div className="orders-empty"><PackageSearch size={34} /><strong>No orders found</strong><span>Try changing the search or filters.</span></div>}<footer className="orders-pagination"><span>Page {pagination.page} of {pagination.pages}</span><div><button className="secondary-button" type="button" disabled={pagination.page <= 1 || loading} onClick={() => loadOrders(pagination.page - 1)}><ArrowLeft size={16} />Previous</button><button className="secondary-button" type="button" disabled={pagination.page >= pagination.pages || loading} onClick={() => loadOrders(pagination.page + 1)}>Next<ArrowRight size={16} /></button></div></footer></section>
      <OrderDrawer order={selectedOrder} loading={detailLoading} onClose={() => setSelectedOrder(null)} />
      {showFilters && <OrdersFilterModal filters={filters} onChange={setFilters} onApply={applyFilters} onClear={clearFilters} onClose={() => setShowFilters(false)} />}
    </div>
  )
}
