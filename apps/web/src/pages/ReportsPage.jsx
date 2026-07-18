import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, CalendarDays, Download, Funnel, PhilippinePeso, ReceiptText, RefreshCw, ShoppingBag, WalletCards, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const channelLabels = { dine_in: 'Dine-in', takeout: 'Takeout', store_delivery: 'Store delivery', grabfood: 'GrabFood' }

function localDate(date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date - offset).toISOString().slice(0, 10)
}

function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  return { from: localDate(from), to: localDate(to) }
}

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function number(value) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

function shortDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function dateTime(value) {
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function MetricCard({ icon: Icon, label, value, note, tone = '' }) {
  return <article className={`report-metric ${tone ? `report-metric--${tone}` : ''}`}><Icon size={21} /><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>
}

function EmptyReport({ text }) {
  return <div className="report-empty"><BarChart3 size={28} /><span>{text}</span></div>
}

function ReportFilterModal({ filters, onChange, onApply, onPreset, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="audit-filter-modal report-filter-modal" role="dialog" aria-modal="true" aria-labelledby="report-filter-title">
        <header><div><span className="eyebrow">Reporting period</span><h2 id="report-filter-title">Filter reports</h2><p>Choose a custom date range or use one of the quick ranges.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close filters"><X size={19} /></button></header>
        <form onSubmit={onApply}>
          <div className="audit-filter-fields">
            <label><span>From date</span><input type="date" required value={filters.from} max={filters.to} onChange={(event) => onChange({ ...filters, from: event.target.value })} /></label>
            <label><span>To date</span><input type="date" required value={filters.to} min={filters.from} onChange={(event) => onChange({ ...filters, to: event.target.value })} /></label>
            <div className="audit-filter-wide report-preset-options"><span>Quick range</span><div><button type="button" onClick={() => onPreset(1)}>Today</button><button type="button" onClick={() => onPreset(7)}>Last 7 days</button><button type="button" onClick={() => onPreset(30)}>Last 30 days</button></div></div>
          </div>
          <footer><span /><div><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Funnel size={16} />Apply range</button></div></footer>
        </form>
      </section>
    </div>
  )
}

export function ReportsPage({ accessToken }) {
  const [filters, setFilters] = useState(defaultRange)
  const [appliedRange, setAppliedRange] = useState(defaultRange)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(appliedRange)
      const result = await apiRequest(`/api/reports?${params}`, { accessToken })
      setReport(result)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken, appliedRange])

  useEffect(() => { loadReport() }, [loadReport])

  useEffect(() => {
    function handleOpenFilters(event) {
      if (event.detail?.route !== '/reports') return
      setFilters({ ...appliedRange })
      setShowFilters(true)
    }
    window.addEventListener('kl:open-filters', handleOpenFilters)
    return () => window.removeEventListener('kl:open-filters', handleOpenFilters)
  }, [appliedRange])

  const maxDailySales = useMemo(() => Math.max(1, ...(report?.daily || []).map((day) => day.sales)), [report])
  const maxChannelSales = useMemo(() => Math.max(1, ...(report?.channels || []).map((channel) => channel.sales)), [report])

  function applyRange(event) {
    event.preventDefault()
    setAppliedRange({ ...filters })
    setShowFilters(false)
  }

  function usePreset(days) {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - (days - 1))
    const next = { from: localDate(from), to: localDate(to) }
    setFilters(next)
    setAppliedRange(next)
    setShowFilters(false)
  }

  function exportCsv() {
    if (!report) return
    const rows = [
      ['KL Chicken Wings Sales Report'],
      ['From', report.range.from, 'To', report.range.to],
      [],
      ['Summary', 'Value'],
      ['Gross sales', report.summary.grossSales],
      ['Discounts', report.summary.discounts],
      ['Refunds', report.summary.refunds],
      ['Net sales', report.summary.netSales],
      ['Orders', report.summary.orders],
      ['Average ticket', report.summary.averageTicket],
      [],
      ['Date', 'Orders', 'Sales'],
      ...report.daily.map((day) => [day.date, day.orders, day.sales]),
      [],
      ['Channel', 'Orders', 'Sales'],
      ...report.channels.map((channel) => [channel.label, channel.orders, channel.sales]),
      [],
      ['Top product', 'Quantity', 'Sales'],
      ...report.products.map((product) => [product.name, product.quantity, product.sales])
    ]
    const csv = rows.map((row) => row.map((cell = '') => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `kl-wings-report-${report.range.from}-to-${report.range.to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page reports-page">
      <header className="page-header report-header"><div><span className="eyebrow">Business intelligence</span><h1>Reports</h1><p>Sales, payments, products, exceptions, shifts, and GrabFood reconciliation.</p></div><div><button className="secondary-button" type="button" onClick={loadReport} disabled={loading}><RefreshCw size={17} className={loading ? 'is-spinning' : ''} />Refresh</button><button className="primary-button" type="button" onClick={exportCsv} disabled={!report}><Download size={17} />Export CSV</button></div></header>

      {error && <div className="notice notice--error">{error}</div>}

      {loading && !report ? <div className="report-loading"><div className="spinner" />Preparing report...</div> : report && <>
        <div className="report-range-note"><CalendarDays size={15} /><span>{shortDate(report.range.from)} – {shortDate(report.range.to)} · {report.range.days} {report.range.days === 1 ? 'day' : 'days'}</span></div>
        <section className="report-metrics">
          <MetricCard icon={PhilippinePeso} label="Net sales" value={money(report.summary.netSales)} note={`${money(report.summary.discounts)} discounts`} tone="primary" />
          <MetricCard icon={ShoppingBag} label="Completed orders" value={number(report.summary.orders)} note={`${report.summary.exceptions} exceptions`} />
          <MetricCard icon={ReceiptText} label="Average ticket" value={money(report.summary.averageTicket)} note={`${money(report.summary.grossSales)} gross sales`} />
          <MetricCard icon={WalletCards} label="Refunds" value={money(report.summary.refunds)} note="Deducted from net sales" />
        </section>

        <section className="report-grid report-grid--wide">
          <article className="report-card sales-trend-card"><header><div><span className="eyebrow">Sales performance</span><h2>Daily net sales</h2></div><strong>{money(report.summary.netSales)}</strong></header>{report.daily.some((day) => day.orders) ? <div className="sales-chart">{report.daily.map((day) => <div className="sales-chart__column" key={day.date}><div className="sales-chart__value">{money(day.sales)}</div><div className="sales-chart__track"><i style={{ height: `${Math.max(day.sales ? 7 : 0, (day.sales / maxDailySales) * 100)}%` }} /></div><strong>{shortDate(day.date)}</strong><span>{day.orders} orders</span></div>)}</div> : <EmptyReport text="No completed sales in this date range." />}</article>
          <article className="report-card channel-report"><header><div><span className="eyebrow">Four sales channels</span><h2>Sales by channel</h2></div></header><div>{report.channels.map((channel) => <section key={channel.key}><div><strong>{channel.label}</strong><span>{channel.orders} orders · {money(channel.sales)}</span></div><div className={`channel-bar channel-bar--${channel.key}`}><i style={{ width: `${(channel.sales / maxChannelSales) * 100}%` }} /></div></section>)}</div></article>
        </section>

        <section className="report-grid report-grid--three">
          <article className="report-card"><header><div><span className="eyebrow">Menu performance</span><h2>Top products</h2></div></header>{report.products.length ? <div className="report-list report-list--ranked">{report.products.map((product, index) => <div key={`${product.name}-${product.sku || index}`}><b>{index + 1}</b><div><strong>{product.name}</strong><span>{number(product.quantity)} sold</span></div><em>{money(product.sales)}</em></div>)}</div> : <EmptyReport text="No product sales yet." />}</article>
          <article className="report-card"><header><div><span className="eyebrow">Collections</span><h2>Payments</h2></div></header>{report.payments.length ? <div className="report-list">{report.payments.map((payment) => <div key={payment.method}><div><strong>{payment.label}</strong><span>{payment.transactions} transactions</span></div><em>{money(payment.net)}</em></div>)}</div> : <EmptyReport text="No paid transactions yet." />}</article>
          <article className="report-card"><header><div><span className="eyebrow">Cash control</span><h2>Shifts</h2></div></header><div className="shift-summary"><div><span>Total shifts</span><strong>{report.shifts.total}</strong></div><div><span>Open</span><strong>{report.shifts.open}</strong></div><div><span>Closed</span><strong>{report.shifts.closed}</strong></div><div><span>Cash variance</span><strong className={report.shifts.variance < 0 ? 'is-negative' : ''}>{money(report.shifts.variance)}</strong></div></div></article>
        </section>

        <section className="report-grid report-grid--split">
          <article className="report-card grab-report"><header><div><span className="eyebrow">Platform settlement</span><h2>GrabFood reconciliation</h2></div><span className={`settlement-pill ${report.grabfood.unsettledOrders ? 'settlement-pill--warning' : ''}`}>{report.grabfood.unsettledOrders} unsettled</span></header><div className="grab-report__numbers"><div><span>Gross orders</span><strong>{money(report.grabfood.gross)}</strong></div><div><span>Commission</span><strong>− {money(report.grabfood.commission)}</strong></div><div><span>Other deductions</span><strong>− {money(report.grabfood.deductions)}</strong></div><div className="grab-report__net"><span>Net receivable</span><strong>{money(report.grabfood.net)}</strong></div><div><span>Settled amount</span><strong>{money(report.grabfood.settled)}</strong></div></div></article>
          <article className="report-card"><header><div><span className="eyebrow">Attention needed</span><h2>Exceptions</h2></div><AlertTriangle size={20} /></header>{report.exceptions.length ? <div className="exception-list">{report.exceptions.map((order) => <div key={order.id}><div><strong>Order #{order.orderNumber}</strong><span>{channelLabels[order.channel]} · {dateTime(order.createdAt)}</span></div><span className={`order-status order-status--${order.status}`}>{order.status}</span><em>{order.reason || 'No reason recorded'}</em><b>{money(order.total)}</b></div>)}</div> : <EmptyReport text="No cancelled, failed, or returned orders." />}</article>
        </section>
      </>}
      {showFilters && <ReportFilterModal filters={filters} onChange={setFilters} onApply={applyRange} onPreset={usePreset} onClose={() => setShowFilters(false)} />}
    </div>
  )
}
