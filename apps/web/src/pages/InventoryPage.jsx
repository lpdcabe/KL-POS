import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, ClipboardClock, PackagePlus, Search, ShieldCheck, TrendingDown, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const movementLabels = {
  receiving: 'Receiving',
  return: 'Return to stock',
  wastage: 'Wastage',
  staff_meal: 'Staff meal',
  count_adjustment: 'Stock count'
}

function quantity(value) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function stockState(item) {
  const onHand = Number(item.quantity_on_hand)
  if (onHand <= 0) return 'out'
  if (onHand <= Number(item.reorder_level)) return 'low'
  return 'healthy'
}

function InventoryModal({ mode, items, initialItem, submitting, onClose, onSubmit }) {
  const [itemForm, setItemForm] = useState({ name: '', sku: '', unit: 'kg', quantityOnHand: 0, reorderLevel: 0 })
  const [movementForm, setMovementForm] = useState({ itemId: initialItem?.id || items[0]?.id || '', type: 'receiving', quantity: '', reason: '' })
  const isCount = movementForm.type === 'count_adjustment'

  function submit(event) {
    event.preventDefault()
    onSubmit(mode === 'item' ? itemForm : movementForm)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="employee-modal inventory-modal" role="dialog" aria-modal="true">
        <header><div><span className="eyebrow">Inventory control</span><h2>{mode === 'item' ? 'Add inventory item' : 'Record stock movement'}</h2><p>{mode === 'item' ? 'Create an ingredient, supply, or packaging item.' : 'Update stock and keep an auditable reason.'}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <form onSubmit={submit}>
          {mode === 'item' ? <div className="employee-form-grid">
            <label className="employee-form-grid__wide"><span>Item name</span><input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} placeholder="e.g. Chicken wings" required minLength={2} /></label>
            <label><span>SKU (optional)</span><input value={itemForm.sku} onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })} placeholder="RAW-001" /></label>
            <label><span>Unit</span><input value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} placeholder="kg, bottle, piece" required /></label>
            <label><span>Opening stock</span><input type="number" min="0" step="0.001" value={itemForm.quantityOnHand} onChange={(event) => setItemForm({ ...itemForm, quantityOnHand: event.target.value })} required /></label>
            <label><span>Low-stock level</span><input type="number" min="0" step="0.001" value={itemForm.reorderLevel} onChange={(event) => setItemForm({ ...itemForm, reorderLevel: event.target.value })} required /></label>
          </div> : <div className="employee-form-grid">
            <label className="employee-form-grid__wide"><span>Inventory item</span><select value={movementForm.itemId} onChange={(event) => setMovementForm({ ...movementForm, itemId: event.target.value })} required><option value="" disabled>Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {quantity(item.quantity_on_hand)} {item.unit}</option>)}</select></label>
            <label><span>Movement type</span><select value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value })}>{Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>{isCount ? 'Counted quantity' : 'Quantity'}</span><input type="number" min={isCount ? '0' : '0.001'} step="0.001" value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })} required /></label>
            <label className="employee-form-grid__wide"><span>Reason / reference</span><textarea value={movementForm.reason} onChange={(event) => setMovementForm({ ...movementForm, reason: event.target.value })} placeholder={isCount ? 'Physical stock count' : 'Supplier, receipt, or explanation'} required minLength={2} /></label>
          </div>}
          <div className="employee-modal__actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving...' : mode === 'item' ? 'Add item' : 'Record movement'}</button></div>
        </form>
      </section>
    </div>
  )
}

export function InventoryPage({ accessToken, profile }) {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ totalItems: 0, lowStock: 0, outOfStock: 0 })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const canManage = ['owner_admin', 'manager'].includes(profile.role)

  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest('/api/inventory', { accessToken })
      setItems(result.items)
      setSummary(result.summary)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { loadInventory() }, [loadInventory])

  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesSearch = `${item.name} ${item.sku || ''}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesSearch && (filter === 'all' || stockState(item) === filter)
  }), [items, search, filter])

  async function saveItem(form) {
    setSubmitting(true)
    try {
      await apiRequest('/api/inventory/items', { accessToken, method: 'POST', body: JSON.stringify(form) })
      setModal(null)
      setSuccess('Inventory item added.')
      await loadInventory()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function saveMovement(form) {
    setSubmitting(true)
    try {
      await apiRequest(`/api/inventory/items/${form.itemId}/movement`, { accessToken, method: 'PATCH', body: JSON.stringify({ type: form.type, quantity: form.quantity, reason: form.reason }) })
      setModal(null)
      setSuccess('Stock movement recorded.')
      await loadInventory()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page inventory-page">
      <header className="page-header"><div><span className="eyebrow">Stock control</span><h1>Inventory</h1><p>Monitor ingredients, packaging, receiving, wastage, and stock counts.</p></div>{canManage && <div className="inventory-header-actions"><button className="secondary-button" type="button" disabled={!items.length} onClick={() => setModal({ mode: 'movement' })}><ClipboardClock size={18} />Stock movement</button><button className="primary-button" type="button" onClick={() => setModal({ mode: 'item' })}><PackagePlus size={18} />Add item</button></div>}</header>
      {error && <div className="notice notice--error">{error}</div>}
      {success && <div className="notice notice--success">{success}</div>}
      {!canManage && <div className="inventory-readonly"><ShieldCheck size={17} /><span>Kitchen access is read-only. Ask a manager to record stock changes.</span></div>}

      <section className="inventory-summary"><article><Boxes size={21} /><div><strong>{summary.totalItems}</strong><span>Active items</span></div></article><article><AlertTriangle size={21} /><div><strong>{summary.lowStock}</strong><span>Low stock</span></div></article><article><TrendingDown size={21} /><div><strong>{summary.outOfStock}</strong><span>Out of stock</span></div></article></section>

      <section className="inventory-workspace">
        <div className="inventory-stock-card"><div className="inventory-card-heading"><div><span className="eyebrow">Current stock</span><h2>Stock levels</h2></div><div className="inventory-tools"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item or SKU" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All stock</option><option value="healthy">Healthy</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div></div>
          {loading ? <div className="inventory-empty"><div className="spinner" />Loading inventory...</div> : visibleItems.length ? <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Item</th><th>SKU</th><th>On hand</th><th>Reorder at</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>{visibleItems.map((item) => { const state = stockState(item); return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.unit}</small></td><td>{item.sku || '—'}</td><td><strong>{quantity(item.quantity_on_hand)} {item.unit}</strong></td><td>{quantity(item.reorder_level)} {item.unit}</td><td><span className={`stock-pill stock-pill--${state}`}>{state === 'out' ? 'Out of stock' : state === 'low' ? 'Low stock' : 'Healthy'}</span></td><td>{dateTime(item.updated_at)}</td><td>{canManage && <button className="inventory-row-action" type="button" onClick={() => setModal({ mode: 'movement', item })}>Update</button>}</td></tr> })}</tbody></table></div> : <div className="inventory-empty"><Boxes size={32} /><strong>No inventory items found</strong><span>{items.length ? 'Try another search or stock filter.' : canManage ? 'Add the first item to begin tracking stock.' : 'No inventory has been configured yet.'}</span></div>}
        </div>

      </section>

      {modal && <InventoryModal key={`${modal.mode}-${modal.item?.id || ''}`} mode={modal.mode} items={items} initialItem={modal.item} submitting={submitting} onClose={() => setModal(null)} onSubmit={modal.mode === 'item' ? saveItem : saveMovement} />}
    </div>
  )
}
