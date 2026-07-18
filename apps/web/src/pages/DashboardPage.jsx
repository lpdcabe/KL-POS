import { ArrowUpRight, Bike, Clock3, CookingPot, PhilippinePeso, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'

const channelCards = [
  { label: 'Dine-in', value: '0', note: 'No open tables', tone: 'wine' },
  { label: 'Takeout', value: '0', note: 'No orders waiting', tone: 'amber' },
  { label: 'Store delivery', value: '0', note: 'No riders dispatched', tone: 'sage' },
  { label: 'GrabFood', value: '0', note: 'No active orders', tone: 'green' }
]

export function DashboardPage() {
  const date = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{date}</span>
          <h1>Good day, team.</h1>
          <p>Here is what is happening across the store right now.</p>
        </div>
        <Link className="primary-button primary-button--compact" to="/pos"><ShoppingBag size={18} />New order</Link>
      </header>

      <section className="metric-grid" aria-label="Daily summary">
        <article className="metric-card metric-card--primary">
          <div className="metric-card__icon"><PhilippinePeso size={21} /></div>
          <span>Net sales today</span>
          <strong>₱0.00</strong>
          <small>Open a shift to start selling</small>
        </article>
        <article className="metric-card">
          <div className="metric-card__icon"><CookingPot size={21} /></div>
          <span>Kitchen queue</span>
          <strong>0</strong>
          <small>All caught up</small>
        </article>
        <article className="metric-card">
          <div className="metric-card__icon"><Bike size={21} /></div>
          <span>Active deliveries</span>
          <strong>0</strong>
          <small>No riders out</small>
        </article>
        <article className="metric-card">
          <div className="metric-card__icon"><Clock3 size={21} /></div>
          <span>Current shift</span>
          <strong>Closed</strong>
          <small>Opening cash not recorded</small>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div><span className="eyebrow">Live channels</span><h2>Orders by channel</h2></div>
          <Link to="/orders">View all orders <ArrowUpRight size={16} /></Link>
        </div>
        <div className="channel-grid">
          {channelCards.map((channel) => (
            <article className={`channel-card channel-card--${channel.tone}`} key={channel.label}>
              <span>{channel.label}</span>
              <strong>{channel.value}</strong>
              <small>{channel.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="empty-state">
        <div className="empty-state__art"><ShoppingBag size={28} /></div>
        <div><h2>No orders yet today</h2><p>New dine-in, takeout, store delivery, and GrabFood orders will appear here.</p></div>
        <Link className="secondary-button" to="/pos">Create first order</Link>
      </section>
    </div>
  )
}
