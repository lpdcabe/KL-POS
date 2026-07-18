import { useCallback, useEffect, useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, Download, Eye, FilterX, Funnel, RefreshCw, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const moduleLabels = { delivery: 'Deliveries', employee: 'Team', inventory: 'Inventory', kitchen: 'Kitchen', settings: 'Settings' }
const emptyFilters = { search: '', module: '', from: '', to: '' }

function dateTime(value) {
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium' })
}

function actionLabel(value) {
  return value.split('.').pop().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function moduleName(action) {
  const module = action.split('.')[0]
  return moduleLabels[module] || module.replaceAll('_', ' ')
}

function valueText(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function FilterModal({ filters, onChange, onApply, onClear, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="audit-filter-modal" role="dialog" aria-modal="true" aria-labelledby="audit-filter-title">
        <header><div><span className="eyebrow">Narrow activity records</span><h2 id="audit-filter-title">Filter audit trail</h2><p>Search by action or entity, then limit results by module and date.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close filters"><X size={19} /></button></header>
        <form onSubmit={onApply}>
          <div className="audit-filter-fields">
            <label className="audit-filter-wide"><span>Search records</span><div className="audit-modal-search"><Search size={17} /><input value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} placeholder="Action, entity, ID, or reason" autoFocus /></div></label>
            <label className="audit-filter-wide"><span>Module</span><select value={filters.module} onChange={(event) => onChange({ ...filters, module: event.target.value })}><option value="">All modules</option>{Object.entries(moduleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>From date</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => onChange({ ...filters, from: event.target.value })} /></label>
            <label><span>To date</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => onChange({ ...filters, to: event.target.value })} /></label>
          </div>
          <footer><button className="secondary-button" type="button" onClick={onClear}><FilterX size={16} />Clear all</button><div><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Funnel size={16} />Apply filters</button></div></footer>
        </form>
      </section>
    </div>
  )
}

function AuditDetail({ log, onClose }) {
  if (!log) return null
  const details = Object.entries(log.metadata || {})
  return (
    <div className="audit-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="audit-drawer" role="dialog" aria-modal="true" aria-label="Audit record details">
        <header><div><span className="eyebrow">Immutable activity record</span><h2>{actionLabel(log.action)}</h2><span className={`audit-module audit-module--${log.action.split('.')[0]}`}>{moduleName(log.action)}</span></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <div className="audit-drawer__body">
          <section className="audit-detail-grid"><div><span>Date and time</span><strong>{dateTime(log.created_at)}</strong></div><div><span>Performed by</span><strong>{log.actor?.full_name || 'System'}</strong><small>{log.actor?.role?.replaceAll('_', ' ') || 'Automated action'}</small></div><div><span>Entity</span><strong>{log.entity_type.replaceAll('_', ' ')}</strong></div><div><span>Entity ID</span><code>{log.entity_id || '—'}</code></div></section>
          {log.reason && <section className="audit-reason"><span>Reason</span><strong>{log.reason}</strong></section>}
          <section className="audit-metadata"><div><span className="eyebrow">Recorded changes</span><h3>Event details</h3></div>{details.length ? <dl>{details.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><pre>{valueText(value)}</pre></dd></div>)}</dl> : <div className="audit-no-metadata">No additional metadata was recorded.</div>}</section>
          <section className="audit-integrity"><ShieldCheck size={18} /><div><strong>Read-only record</strong><span>This activity cannot be edited from the POS.</span></div></section>
        </div>
      </aside>
    </div>
  )
}

export function AuditTrailPage({ accessToken }) {
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [summary, setSummary] = useState({ today: 0, actorsOnPage: 0, actionsOnPage: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const filterCount = Object.values(appliedFilters).filter(Boolean).length

  const loadLogs = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' })
      Object.entries(appliedFilters).forEach(([key, value]) => { if (value) params.set(key, value) })
      const result = await apiRequest(`/api/audit?${params}`, { accessToken })
      setLogs(result.logs)
      setPagination(result.pagination)
      setSummary(result.summary)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken, appliedFilters])

  useEffect(() => { loadLogs(1) }, [loadLogs])

  useEffect(() => {
    function handleOpenFilters(event) {
      if (event.detail?.route !== '/audit') return
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

  function exportCsv() {
    const rows = [['Date', 'User', 'Role', 'Module', 'Action', 'Entity', 'Entity ID', 'Reason'], ...logs.map((log) => [log.created_at, log.actor?.full_name || 'System', log.actor?.role || '', moduleName(log.action), actionLabel(log.action), log.entity_type, log.entity_id || '', log.reason || ''])]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `kl-wings-audit-page-${pagination.page}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page audit-page">
      <header className="page-header audit-header"><div><span className="eyebrow">Accountability and security</span><h1>Audit trail</h1><p>Review protected records of important actions across every POS module.</p></div><div><button className="secondary-button" type="button" onClick={() => loadLogs(pagination.page)} disabled={loading}><RefreshCw size={17} className={loading ? 'is-spinning' : ''} />Refresh</button><button className="primary-button" type="button" onClick={exportCsv} disabled={!logs.length}><Download size={17} />Export page</button></div></header>
      {error && <div className="notice notice--error">{error}</div>}
      {filterCount > 0 && <section className="audit-active-filters"><span>Active filters</span>{appliedFilters.search && <b>Search: {appliedFilters.search}</b>}{appliedFilters.module && <b>Module: {moduleLabels[appliedFilters.module]}</b>}{appliedFilters.from && <b>From: {appliedFilters.from}</b>}{appliedFilters.to && <b>To: {appliedFilters.to}</b>}<button type="button" onClick={clearFilters}><X size={14} />Clear</button></section>}
      <section className="audit-summary"><article><ClipboardCheck size={21} /><div><strong>{pagination.total}</strong><span>Filtered records</span></div></article><article><CalendarDays size={21} /><div><strong>{summary.today}</strong><span>Actions today</span></div></article><article><UserRound size={21} /><div><strong>{summary.actorsOnPage}</strong><span>Users on this page</span></div></article><article><Activity size={21} /><div><strong>{summary.actionsOnPage}</strong><span>Action types</span></div></article></section>
      <section className="audit-table-card"><div className="audit-table-card__heading"><div><span className="eyebrow">Protected records</span><h2>System activity</h2></div><span>Newest first</span></div>{loading ? <div className="audit-empty"><div className="spinner" />Loading audit records...</div> : logs.length ? <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Date and time</th><th>User</th><th>Module</th><th>Action</th><th>Entity</th><th>Reason</th><th /></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{dateTime(log.created_at)}</td><td><strong>{log.actor?.full_name || 'System'}</strong><small>{log.actor?.role?.replaceAll('_', ' ') || 'Automated'}</small></td><td><span className={`audit-module audit-module--${log.action.split('.')[0]}`}>{moduleName(log.action)}</span></td><td><strong>{actionLabel(log.action)}</strong><small>{log.action}</small></td><td><span className="audit-entity">{log.entity_type.replaceAll('_', ' ')}</span><code>{log.entity_id?.slice(0, 12) || '—'}</code></td><td className="audit-reason-cell">{log.reason || '—'}</td><td><button className="icon-button" type="button" onClick={() => setSelected(log)} aria-label={`View ${actionLabel(log.action)} details`}><Eye size={17} /></button></td></tr>)}</tbody></table></div> : <div className="audit-empty"><ClipboardCheck size={34} /><strong>No audit records found</strong><span>Important actions will appear here as the team uses the POS.</span></div>}<footer className="orders-pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><div><button className="secondary-button" type="button" disabled={pagination.page <= 1 || loading} onClick={() => loadLogs(pagination.page - 1)}><ArrowLeft size={16} />Previous</button><button className="secondary-button" type="button" disabled={pagination.page >= pagination.pages || loading} onClick={() => loadLogs(pagination.page + 1)}>Next<ArrowRight size={16} /></button></div></footer></section>
      {showFilters && <FilterModal filters={filters} onChange={setFilters} onApply={applyFilters} onClear={clearFilters} onClose={() => setShowFilters(false)} />}
      <AuditDetail log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
