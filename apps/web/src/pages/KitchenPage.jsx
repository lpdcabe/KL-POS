import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChefHat, Clock3, RefreshCw, Utensils } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const channelLabels = {
  dine_in: 'Dine-in',
  takeout: 'Takeout',
  store_delivery: 'Store delivery',
  grabfood: 'GrabFood'
}

const columns = [
  { id: 'incoming', title: 'Incoming', description: 'Confirm and start new tickets', statuses: ['confirmed', 'accepted'] },
  { id: 'preparing', title: 'Preparing', description: 'Orders currently in the kitchen', statuses: ['preparing'] },
  { id: 'ready', title: 'Ready', description: 'Waiting for service or pickup', statuses: ['ready'] }
]

const actions = {
  confirmed: { label: 'Accept order', next: 'accepted' },
  accepted: { label: 'Start preparing', next: 'preparing' },
  preparing: { label: 'Mark as ready', next: 'ready' }
}

const readyActions = {
  dine_in: { label: 'Mark as served', next: 'served' },
  takeout: { label: 'Release order', next: 'released' },
  grabfood: { label: 'Confirm rider pickup', next: 'picked_up' }
}

function quantityLabel(quantity) {
  const value = Number(quantity)
  return Number.isInteger(value) ? value : value.toFixed(1)
}

function elapsedMinutes(ticket, now) {
  const startedAt = ticket.confirmed_at || ticket.created_at
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000))
}

function TicketCard({ ticket, now, updating, onAdvance }) {
  const minutes = elapsedMinutes(ticket, now)
  const urgency = minutes >= 20 ? 'late' : minutes >= 10 ? 'warning' : 'normal'
  const action = actions[ticket.status] || (ticket.status === 'ready' ? readyActions[ticket.channel] : null)

  return (
    <article className={`kitchen-ticket kitchen-ticket--${urgency}`}>
      <header>
        <div><span className="kitchen-ticket__number">#{ticket.order_number}</span><span className={`channel-tag channel-tag--${ticket.channel}`}>{channelLabels[ticket.channel]}</span></div>
        <span className="kitchen-ticket__time"><Clock3 size={15} />{minutes} min</span>
      </header>
      <div className="kitchen-ticket__meta">
        <strong>{ticket.table_number ? `Table ${ticket.table_number}` : ticket.customer_name || channelLabels[ticket.channel]}</strong>
        <span>{ticket.status === 'accepted' ? 'Accepted' : ticket.status === 'preparing' ? 'Cooking' : ticket.status === 'ready' ? 'Ready' : 'New order'}</span>
      </div>
      <div className="kitchen-ticket__items">
        {ticket.order_items.map((item) => (
          <div className="kitchen-item" key={item.id}>
            <span>{quantityLabel(item.quantity)}×</span>
            <div><strong>{item.product_name}</strong>{item.order_item_modifiers?.map((modifier) => <small key={modifier.id}>+ {modifier.modifier_name}{Number(modifier.quantity) > 1 ? ` ×${quantityLabel(modifier.quantity)}` : ''}</small>)}{item.notes && <small className="kitchen-item__note">Note: {item.notes}</small>}</div>
          </div>
        ))}
      </div>
      {ticket.special_instructions && <div className="kitchen-ticket__instructions"><AlertTriangle size={15} /><span>{ticket.special_instructions}</span></div>}
      {action && <button className="primary-button kitchen-ticket__action" type="button" onClick={() => onAdvance(ticket, action.next)} disabled={updating}>{updating ? 'Updating...' : action.label}</button>}
      {!action && <div className="kitchen-ticket__ready"><CheckCircle2 size={18} />Ready for delivery dispatch</div>}
    </article>
  )
}

export function KitchenPage({ accessToken }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [now, setNow] = useState(Date.now())

  const loadTickets = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true)
    try {
      const result = await apiRequest('/api/kitchen/tickets', { accessToken })
      setTickets(result.tickets)
      setLastUpdated(new Date(result.refreshedAt))
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [accessToken])

  useEffect(() => {
    loadTickets({ quiet: true })
    const refreshTimer = window.setInterval(() => loadTickets({ quiet: true }), 10_000)
    const clockTimer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer) }
  }, [loadTickets])

  const groupedTickets = useMemo(() => Object.fromEntries(columns.map((column) => [column.id, tickets.filter((ticket) => column.statuses.includes(ticket.status))])), [tickets])

  async function advanceTicket(ticket, status) {
    setUpdatingId(ticket.id)
    setError('')
    try {
      await apiRequest(`/api/kitchen/tickets/${ticket.id}/status`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      await loadTickets({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
      await loadTickets({ quiet: true })
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="page kitchen-page">
      <header className="page-header kitchen-header">
        <div><span className="eyebrow">Kitchen display</span><h1>Kitchen</h1><p>Live preparation queue across every active sales channel.</p></div>
        <div className="kitchen-header__actions"><span className="live-indicator"><i />Live · refreshes every 10 sec</span><button className="secondary-button" type="button" onClick={() => loadTickets()} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'is-spinning' : ''} />Refresh</button></div>
      </header>

      {error && <div className="notice notice--error">{error}</div>}
      <section className="kitchen-stats">
        <div><Utensils size={20} /><span>Active tickets</span><strong>{tickets.length}</strong></div>
        <div><ChefHat size={20} /><span>Preparing</span><strong>{groupedTickets.preparing.length}</strong></div>
        <div><CheckCircle2 size={20} /><span>Ready</span><strong>{groupedTickets.ready.length}</strong></div>
        <small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}` : 'Connecting to kitchen queue...'}</small>
      </section>

      {loading ? <div className="kitchen-board-loading"><div className="spinner" /><span>Loading kitchen tickets...</span></div> : (
        <section className="kitchen-board">
          {columns.map((column) => (
            <div className={`kitchen-column kitchen-column--${column.id}`} key={column.id}>
              <header><div><h2>{column.title}<span>{groupedTickets[column.id].length}</span></h2><p>{column.description}</p></div></header>
              <div className="kitchen-column__tickets">
                {groupedTickets[column.id].map((ticket) => <TicketCard key={ticket.id} ticket={ticket} now={now} updating={updatingId === ticket.id} onAdvance={advanceTicket} />)}
                {!groupedTickets[column.id].length && <div className="kitchen-column__empty"><CheckCircle2 size={22} /><span>No {column.title.toLowerCase()} tickets</span></div>}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
