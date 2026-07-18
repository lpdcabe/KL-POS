import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bike, CheckCircle2, Clock3, MapPin, PackageCheck, Phone, RefreshCw, UserRound, WalletCards, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const activeStatuses = ['confirmed', 'accepted', 'preparing']

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function DeliveryCard({ delivery, riders, canAssign, busy, onAssign, onDispatch, onComplete }) {
  const details = delivery.store_delivery_details
  const [riderId, setRiderId] = useState(delivery.assigned_rider_id || '')
  const ready = ['ready', 'ready_for_dispatch'].includes(delivery.status)

  return (
    <article className="delivery-card">
      <header><div><strong>#{delivery.order_number}</strong><span>{delivery.customer_name || 'Store delivery'}</span></div><span className={`delivery-status delivery-status--${delivery.status}`}>{delivery.status.replaceAll('_', ' ')}</span></header>
      <div className="delivery-card__contact"><span><Phone size={14} />{delivery.customer_mobile || 'No mobile number'}</span><span><MapPin size={14} />{[details?.address_line, details?.barangay].filter(Boolean).join(', ') || 'No address'}</span>{details?.landmark && <small>Landmark: {details.landmark}</small>}</div>
      {details?.delivery_instructions && <p className="delivery-card__note">{details.delivery_instructions}</p>}
      <div className="delivery-card__money"><span><WalletCards size={15} />COD</span><strong>{money(details?.cod_amount)}</strong><small>Order total {money(delivery.total)}</small></div>
      <div className="delivery-card__rider"><UserRound size={16} /><div><span>Assigned rider</span><strong>{delivery.rider?.full_name || 'Not assigned'}</strong></div></div>
      {canAssign && !['out_for_delivery', 'delivered'].includes(delivery.status) && <div className="rider-assignment"><select value={riderId} onChange={(event) => setRiderId(event.target.value)}><option value="">Choose rider</option>{riders.map((rider) => <option value={rider.id} key={rider.id}>{rider.full_name}{rider.employee_code ? ` · ${rider.employee_code}` : ''}</option>)}</select><button className="secondary-button" type="button" disabled={!riderId || busy} onClick={() => onAssign(delivery.id, riderId)}>{delivery.assigned_rider_id ? 'Reassign' : 'Assign'}</button></div>}
      {ready && delivery.assigned_rider_id && <button className="primary-button delivery-card__action" type="button" disabled={busy} onClick={() => onDispatch(delivery.id)}><Bike size={17} />{busy ? 'Updating...' : 'Dispatch order'}</button>}
      {delivery.status === 'out_for_delivery' && <button className="primary-button delivery-card__action" type="button" disabled={busy} onClick={() => onComplete(delivery)}><PackageCheck size={17} />Confirm delivery</button>}
      {delivery.status === 'delivered' && <div className="delivery-card__complete"><CheckCircle2 size={17} /><span>Delivered {details?.delivered_at ? new Date(details.delivered_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></div>}
    </article>
  )
}

export function DeliveriesPage({ accessToken, profile }) {
  const [deliveries, setDeliveries] = useState([])
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [confirmationDelivery, setConfirmationDelivery] = useState(null)
  const [confirmation, setConfirmation] = useState('Delivered to customer')

  const loadDeliveries = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true)
    try {
      const result = await apiRequest('/api/deliveries', { accessToken })
      setDeliveries(result.deliveries)
      setRiders(result.riders)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [accessToken])

  useEffect(() => {
    loadDeliveries({ quiet: true })
    const timer = window.setInterval(() => loadDeliveries({ quiet: true }), 15_000)
    return () => window.clearInterval(timer)
  }, [loadDeliveries])

  const groups = useMemo(() => ({
    pending: deliveries.filter((delivery) => activeStatuses.includes(delivery.status) || (delivery.status === 'ready' && !delivery.assigned_rider_id)),
    dispatch: deliveries.filter((delivery) => ['ready', 'ready_for_dispatch'].includes(delivery.status) && delivery.assigned_rider_id),
    road: deliveries.filter((delivery) => delivery.status === 'out_for_delivery'),
    completed: deliveries.filter((delivery) => delivery.status === 'delivered').sort((a, b) => new Date(b.store_delivery_details?.delivered_at || b.updated_at) - new Date(a.store_delivery_details?.delivered_at || a.updated_at))
  }), [deliveries])

  async function runAction(id, path, body) {
    setBusyId(id)
    setError('')
    try {
      await apiRequest(`/api/deliveries/${id}/${path}`, { accessToken, method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
      await loadDeliveries({ quiet: true })
      return true
    } catch (requestError) {
      setError(requestError.message)
      await loadDeliveries({ quiet: true })
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function completeDelivery(event) {
    event.preventDefault()
    const completed = await runAction(confirmationDelivery.id, 'complete', { confirmation })
    if (completed) setConfirmationDelivery(null)
  }

  const canAssign = ['owner_admin', 'manager'].includes(profile.role)

  return (
    <div className="page deliveries-page">
      <header className="page-header delivery-header"><div><span className="eyebrow">Store dispatch</span><h1>Deliveries</h1><p>Assign riders, dispatch orders, and confirm customer handoff.</p></div><div><span className="live-indicator"><i />Live · refreshes every 15 sec</span><button className="secondary-button" type="button" onClick={() => loadDeliveries()} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'is-spinning' : ''} />Refresh</button></div></header>
      {error && <div className="notice notice--error">{error}</div>}
      <section className="delivery-stats"><article><Bike size={21} /><div><strong>{groups.road.length}</strong><span>On the road</span></div></article><article><Clock3 size={21} /><div><strong>{groups.pending.length}</strong><span>Pending assignment</span></div></article><article><PackageCheck size={21} /><div><strong>{groups.completed.length}</strong><span>Delivered</span></div></article><article><WalletCards size={21} /><div><strong>{money(groups.road.reduce((sum, item) => sum + Number(item.store_delivery_details?.cod_amount || 0), 0))}</strong><span>COD in transit</span></div></article></section>
      {loading ? <div className="delivery-loading"><div className="spinner" />Loading delivery queue...</div> : <>
        <section className="delivery-board">
          {[{ id: 'pending', title: 'Preparing / Unassigned', note: 'Assign riders before orders leave the store' }, { id: 'dispatch', title: 'Ready to dispatch', note: 'Packed orders with assigned riders' }, { id: 'road', title: 'Out for delivery', note: 'Orders currently with riders' }].map((column) => <div className={`delivery-column delivery-column--${column.id}`} key={column.id}><header><h2>{column.title}<span>{groups[column.id].length}</span></h2><p>{column.note}</p></header><div>{groups[column.id].map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} riders={riders} canAssign={canAssign} busy={busyId === delivery.id} onAssign={(id, riderId) => runAction(id, 'assign', { riderId })} onDispatch={(id) => runAction(id, 'dispatch')} onComplete={(item) => { setConfirmation('Delivered to customer'); setConfirmationDelivery(item) }} />)}{!groups[column.id].length && <div className="delivery-column__empty"><CheckCircle2 size={22} />No deliveries here</div>}</div></div>)}
        </section>
        <section className="completed-deliveries"><div className="section-heading"><div><span className="eyebrow">Delivery history</span><h2>Recently delivered</h2></div></div>{groups.completed.length ? <div className="completed-delivery-list">{groups.completed.slice(0, 8).map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} riders={riders} canAssign={false} busy={false} onAssign={() => {}} onDispatch={() => {}} onComplete={() => {}} />)}</div> : <div className="delivery-history-empty">Completed deliveries will appear here.</div>}</section>
      </>}
      {confirmationDelivery && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmationDelivery(null) }}><section className="delivery-confirm-modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Customer handoff</span><h2>Confirm delivery #{confirmationDelivery.order_number}</h2></div><button className="icon-button" type="button" onClick={() => setConfirmationDelivery(null)} aria-label="Close"><X size={19} /></button></header><form onSubmit={completeDelivery}><label><span>Delivery confirmation</span><textarea value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="e.g. Delivered to customer" required minLength={2} /></label><div className="delivery-confirm-summary"><span>COD to collect</span><strong>{money(confirmationDelivery.store_delivery_details?.cod_amount)}</strong></div><div className="employee-modal__actions"><button className="secondary-button" type="button" onClick={() => setConfirmationDelivery(null)}>Cancel</button><button className="primary-button" type="submit" disabled={busyId === confirmationDelivery.id}>Confirm delivered</button></div></form></section></div>}
    </div>
  )
}
