import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDollarSign, Cloud, Database, Eye, EyeOff, KeyRound, MonitorCog, PackageCheck, Plus, ReceiptText, Save, Settings2, ShieldCheck, ShoppingBag, Store, UtensilsCrossed, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { hasPermission } from '../lib/permissions.js'

const tabs = [
  { id: 'store', label: 'Store profile', icon: Store, permission: 'settings.store' },
  { id: 'terminals', label: 'Terminals', icon: MonitorCog, permission: 'settings.terminals' },
  { id: 'menu', label: 'Menu management', icon: UtensilsCrossed, permission: 'settings.menu' },
  { id: 'operations', label: 'Operations', icon: Settings2, permission: 'settings.operations' },
  { id: 'security', label: 'Password', icon: KeyRound, permission: 'settings.security' },
  { id: 'system', label: 'System', icon: Cloud, permission: 'settings.system' }
]

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function TerminalModal({ submitting, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', code: '' })
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="employee-modal settings-modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Point of sale device</span><h2>Add terminal</h2><p>Register a counter or order-taking device for this store.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header><form onSubmit={(event) => { event.preventDefault(); onSubmit(form) }}><div className="employee-form-grid"><label><span>Terminal name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Main counter" required minLength={2} /></label><label><span>Terminal code</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="POS-01" required minLength={2} /></label></div><div className="employee-modal__actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Adding...' : 'Add terminal'}</button></div></form></section></div>
}

function MenuItemModal({ categories, submitting, onClose, onSubmit }) {
  const [form, setForm] = useState({ categoryId: categories[0]?.id || '', name: '', sku: '', description: '', basePrice: '', requiresFlavor: false, flavors: '', isAvailable: true })
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="employee-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="menu-item-title"><header><div><span className="eyebrow">Menu catalog</span><h2 id="menu-item-title">Add menu item</h2><p>Create a product that cashiers can add to new orders.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header><form onSubmit={(event) => { event.preventDefault(); onSubmit(form) }}><div className="employee-form-grid"><label><span>Item name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="6-pc Wings" required minLength={2} /></label><label><span>Category</span><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} required><option value="">Choose category</option>{categories.filter((entry) => entry.is_active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label><span>Base price</span><input type="number" min="0" step="0.01" value={form.basePrice} onChange={(event) => setForm({ ...form, basePrice: event.target.value })} placeholder="189.00" required /></label><label><span>SKU <small>Optional</small></span><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="WINGS-6" /></label><label className="employee-form-grid__wide"><span>Description <small>Optional</small></span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Short menu description" /></label><label className="menu-item-check"><input type="checkbox" checked={form.requiresFlavor} onChange={(event) => setForm({ ...form, requiresFlavor: event.target.checked })} /><span>Requires flavor selection</span></label><label className="menu-item-check"><input type="checkbox" checked={form.isAvailable} onChange={(event) => setForm({ ...form, isAvailable: event.target.checked })} /><span>Available for new orders</span></label>{form.requiresFlavor && <label className="employee-form-grid__wide"><span>Flavor choices</span><textarea value={form.flavors} onChange={(event) => setForm({ ...form, flavors: event.target.value })} placeholder="Buffalo, Garlic Parmesan, Honey BBQ" required /><small>Separate each flavor with a comma.</small></label>}</div><div className="employee-modal__actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={submitting || !categories.length}><Plus size={17} />{submitting ? 'Adding...' : 'Add menu item'}</button></div></form></section></div>
}

function FlavorManagerModal({ product, submitting, onClose, onSubmit }) {
  const current = (product.product_modifiers || []).filter((link) => link.modifier?.modifier_type === 'flavor').map((link) => link.modifier.name).join(', ')
  const [flavors, setFlavors] = useState(current)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="employee-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="manage-flavors-title"><header><div><span className="eyebrow">Flavor choices</span><h2 id="manage-flavors-title">{product.name}</h2><p>These choices appear when the product is selected on New Order.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header><form onSubmit={(event) => { event.preventDefault(); onSubmit(flavors.split(',').map((flavor) => flavor.trim()).filter(Boolean)) }}><div className="employee-form-grid"><label className="employee-form-grid__wide"><span>Flavors</span><textarea value={flavors} onChange={(event) => setFlavors(event.target.value)} placeholder="Buffalo, Garlic Parmesan, Honey BBQ" required /><small>Separate each flavor with a comma.</small></label></div><div className="employee-modal__actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save flavors'}</button></div></form></section></div>
}

export function SettingsPage({ accessToken, profile }) {
  const allowedTabs = useMemo(() => tabs.filter((tab) => hasPermission(profile, tab.permission)), [profile])
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState(() => allowedTabs[0]?.id || '')
  const [storeForm, setStoreForm] = useState({ name: '', address: '', timezone: 'Asia/Manila', currencyCode: 'PHP' })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showTerminal, setShowTerminal] = useState(false)
  const [showMenuItem, setShowMenuItem] = useState(false)
  const [flavorProduct, setFlavorProduct] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [showPasswords, setShowPasswords] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest('/api/settings', { accessToken })
      setData(result)
      if (result.store) setStoreForm({ name: result.store.name, address: result.store.address || '', timezone: result.store.timezone, currencyCode: result.store.currency_code })
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { if (!allowedTabs.some((tab) => tab.id === activeTab)) setActiveTab(allowedTabs[0]?.id || '') }, [activeTab, allowedTabs])

  const visibleProducts = useMemo(() => (data?.products || []).filter((product) => {
    const matchesSearch = `${product.name} ${product.sku || ''}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesSearch && (category === 'all' || product.category_id === category)
  }), [data, search, category])

  async function saveStore(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const result = await apiRequest('/api/settings/store', { accessToken, method: 'PATCH', body: JSON.stringify(storeForm) })
      setData({ ...data, store: result.store })
      setSuccess('Store profile saved.')
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function addTerminal(form) {
    setSubmitting(true)
    try {
      const result = await apiRequest('/api/settings/terminals', { accessToken, method: 'POST', body: JSON.stringify(form) })
      setData({ ...data, terminals: [...data.terminals, result.terminal] })
      setShowTerminal(false)
      setSuccess('Terminal added.')
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleTerminal(terminal) {
    setSubmitting(true)
    try {
      const result = await apiRequest(`/api/settings/terminals/${terminal.id}`, { accessToken, method: 'PATCH', body: JSON.stringify({ name: terminal.name, isActive: !terminal.is_active }) })
      setData({ ...data, terminals: data.terminals.map((entry) => entry.id === terminal.id ? result.terminal : entry) })
      setSuccess(`Terminal ${result.terminal.is_active ? 'enabled' : 'disabled'}.`)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleProduct(product) {
    try {
      const result = await apiRequest(`/api/settings/products/${product.id}/availability`, { accessToken, method: 'PATCH', body: JSON.stringify({ isAvailable: !product.is_available }) })
      setData({ ...data, products: data.products.map((entry) => entry.id === product.id ? { ...entry, ...result.product } : entry) })
      setSuccess(`${product.name} is now ${result.product.is_available ? 'available' : 'unavailable'}.`)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function addMenuItem(form) {
    setSubmitting(true)
    try {
      const result = await apiRequest('/api/settings/products', { accessToken, method: 'POST', body: JSON.stringify({ ...form, flavors: form.flavors.split(',').map((flavor) => flavor.trim()).filter(Boolean) }) })
      setData({ ...data, products: [...data.products, result.product].sort((a, b) => a.name.localeCompare(b.name)) })
      setShowMenuItem(false)
      setSuccess(`${result.product.name} was added to the menu.`)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function saveFlavors(flavors) {
    setSubmitting(true)
    try {
      const result = await apiRequest(`/api/settings/products/${flavorProduct.id}/flavors`, { accessToken, method: 'PATCH', body: JSON.stringify({ flavors }) })
      setData({ ...data, products: data.products.map((product) => product.id === flavorProduct.id ? { ...product, ...result.product } : product) })
      setFlavorProduct(null)
      setSuccess('Flavor choices saved.')
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('The new password and confirmation do not match.')
      return
    }
    setSubmitting(true)
    try {
      const result = await apiRequest('/api/me/password', { accessToken, method: 'POST', body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }) })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSuccess(result.message)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !data) return <div className="page"><div className="settings-loading"><div className="spinner" />Loading settings...</div></div>

  return <div className="page settings-page">
    <header className="page-header"><div><span className="eyebrow">Owner administration</span><h1>Settings</h1><p>Configure the store, POS terminals, menu availability, and operational environment.</p></div></header>
    {error && <div className="notice notice--error">{error}</div>}
    {success && <div className="notice notice--success">{success}</div>}
    {data && <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Settings sections">{allowedTabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <main className="settings-content">
        {activeTab === 'store' && <section className="settings-panel"><header><div><span className="eyebrow">Business identity</span><h2>Store profile</h2><p>Details printed and displayed across the POS workspace.</p></div><span className="settings-code">{data.store.code}</span></header><form className="settings-form" onSubmit={saveStore}><div className="settings-form-grid"><label><span>Store name</span><input value={storeForm.name} onChange={(event) => setStoreForm({ ...storeForm, name: event.target.value })} required minLength={2} /></label><label><span>Store code</span><input value={data.store.code} disabled /><small>The store code cannot be changed.</small></label><label className="settings-form-wide"><span>Address</span><textarea value={storeForm.address} onChange={(event) => setStoreForm({ ...storeForm, address: event.target.value })} placeholder="Angeles City, Pampanga" /></label><label><span>Timezone</span><select value={storeForm.timezone} onChange={(event) => setStoreForm({ ...storeForm, timezone: event.target.value })}><option value="Asia/Manila">Asia/Manila</option><option value="Asia/Singapore">Asia/Singapore</option><option value="UTC">UTC</option></select></label><label><span>Currency</span><select value={storeForm.currencyCode} onChange={(event) => setStoreForm({ ...storeForm, currencyCode: event.target.value })}><option value="PHP">PHP — Philippine peso</option><option value="USD">USD — US dollar</option></select></label></div><footer><span>Last updated {new Date(data.store.updated_at).toLocaleString('en-PH')}</span><button className="primary-button" type="submit" disabled={submitting}><Save size={17} />{submitting ? 'Saving...' : 'Save profile'}</button></footer></form></section>}

        {activeTab === 'terminals' && <section className="settings-panel"><header><div><span className="eyebrow">Counter devices</span><h2>POS terminals</h2><p>Register and control devices that can open cashier shifts.</p></div><button className="primary-button" type="button" onClick={() => setShowTerminal(true)}><Plus size={17} />Add terminal</button></header><div className="terminal-grid">{data.terminals.map((terminal) => <article key={terminal.id} className={!terminal.is_active ? 'is-disabled' : ''}><div className="terminal-icon"><MonitorCog size={22} /></div><div><strong>{terminal.name}</strong><code>{terminal.code}</code><span>Created {new Date(terminal.created_at).toLocaleDateString('en-PH')}</span></div><label className="switch"><input type="checkbox" checked={terminal.is_active} onChange={() => toggleTerminal(terminal)} disabled={submitting} /><i /></label></article>)}</div>{!data.terminals.length && <div className="settings-empty"><MonitorCog size={30} /><strong>No terminals registered</strong><span>Add the main counter terminal to begin.</span></div>}</section>}

        {activeTab === 'menu' && <section className="settings-panel"><header><div><span className="eyebrow">Product catalog</span><h2>Menu management</h2><p>Add products and temporarily hide sold-out items from new orders.</p></div><div className="menu-settings-actions"><div className="menu-settings-summary"><strong>{data.products.filter((product) => product.is_available).length}</strong><span>of {data.products.length} available</span></div><button className="primary-button" type="button" onClick={() => setShowMenuItem(true)} disabled={!data.categories.length}><Plus size={17} />Add menu item</button></div></header><div className="menu-settings-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu item or SKU" /><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{data.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>{visibleProducts.length ? <div className="menu-settings-list">{visibleProducts.map((product) => <article key={product.id} className={!product.is_available ? 'is-unavailable' : ''}><div className="menu-settings-art">{product.name.slice(0, 2).toUpperCase()}</div><div><strong>{product.name}</strong><span>{product.category?.name || 'Uncategorized'} · {product.sku || 'No SKU'}</span></div><b>{money(product.base_price)}</b>{product.requires_flavor && <button className="menu-flavor-button" type="button" onClick={() => setFlavorProduct(product)}>Flavors</button>}<label className="switch"><input type="checkbox" checked={product.is_available} onChange={() => toggleProduct(product)} /><i /></label></article>)}</div> : <div className="settings-empty"><ShoppingBag size={30} /><strong>No menu items found</strong><span>{data.products.length ? 'Try another search or category.' : 'Use Add menu item to create your first product.'}</span></div>}</section>}

        {activeTab === 'operations' && <section className="settings-panel"><header><div><span className="eyebrow">Current safeguards</span><h2>Operational policies</h2><p>Rules enforced by the POS workflow and permission model.</p></div><ShieldCheck size={26} /></header><div className="operations-grid"><article><ShoppingBag size={20} /><div><span>Sales channels</span><strong>{data.operations.salesChannels.join(', ')}</strong></div></article><article><CircleDollarSign size={20} /><div><span>Manager approval</span><strong>{data.operations.managerApproval.join(', ')}</strong></div></article><article><PackageCheck size={20} /><div><span>Inventory deduction</span><strong>{data.operations.inventoryDeduction}</strong></div></article><article><ReceiptText size={20} /><div><span>Currency and timezone</span><strong>{data.operations.currency} · {data.operations.timezone}</strong></div></article></div><div className={`open-shift-warning ${data.operations.openShifts ? 'has-open-shift' : ''}`}><CheckCircle2 size={18} /><div><strong>{data.operations.openShifts ? `${data.operations.openShifts} open shift(s)` : 'No open shifts'}</strong><span>{data.operations.openShifts ? 'Close active shifts before disabling their terminals.' : 'Terminal changes can be applied safely.'}</span></div></div></section>}

        {activeTab === 'security' && <section className="settings-panel"><header><div><span className="eyebrow">Account security</span><h2>Change password</h2><p>Update the password for your signed-in owner account.</p></div><KeyRound size={26} /></header><form className="password-settings-form" onSubmit={changePassword}><div className="password-security-banner"><ShieldCheck size={21} /><div><strong>Your password is never stored by the POS</strong><span>Supabase Auth securely hashes passwords. This form requires your current password before accepting a change.</span></div></div><div className="password-field"><label htmlFor="current-password">Current password</label><div><input id="current-password" type={showPasswords ? 'text' : 'password'} value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} autoComplete="current-password" required /><button type="button" onClick={() => setShowPasswords(!showPasswords)} aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}>{showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div><div className="password-form-grid"><div className="password-field"><label htmlFor="new-password">New password</label><div><input id="new-password" type={showPasswords ? 'text' : 'password'} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} autoComplete="new-password" required minLength={10} maxLength={72} /></div></div><div className="password-field"><label htmlFor="confirm-password">Confirm new password</label><div><input id="confirm-password" type={showPasswords ? 'text' : 'password'} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} autoComplete="new-password" required minLength={10} maxLength={72} /></div></div></div><div className="password-requirements"><strong>Password requirements</strong><span>At least 10 characters with uppercase, lowercase, number, and symbol.</span></div><footer><span>After changing it, use the new password on your next sign-in.</span><button className="primary-button" type="submit" disabled={submitting}><KeyRound size={17} />{submitting ? 'Changing...' : 'Change password'}</button></footer></form></section>}

        {activeTab === 'system' && <section className="settings-panel"><header><div><span className="eyebrow">Connection health</span><h2>System status</h2><p>Read-only information about the current POS environment.</p></div><span className="system-online"><i />Online</span></header><div className="system-grid"><article><Cloud size={22} /><div><span>Express API</span><strong>{data.system.api}</strong></div><CheckCircle2 size={18} /></article><article><Database size={22} /><div><span>Supabase database</span><strong>{data.system.database}</strong></div><CheckCircle2 size={18} /></article><article><ShieldCheck size={22} /><div><span>Authentication</span><strong>{data.system.authentication}</strong></div><CheckCircle2 size={18} /></article><article><Settings2 size={22} /><div><span>Environment</span><strong>{data.system.environment}</strong></div><CheckCircle2 size={18} /></article></div><div className="system-security-note"><ShieldCheck size={20} /><div><strong>Secrets stay on the server</strong><span>Database secret keys and credentials are never returned to this page.</span></div></div></section>}
      </main>
    </div>}
    {showTerminal && <TerminalModal submitting={submitting} onClose={() => setShowTerminal(false)} onSubmit={addTerminal} />}
    {showMenuItem && <MenuItemModal categories={data?.categories || []} submitting={submitting} onClose={() => setShowMenuItem(false)} onSubmit={addMenuItem} />}
    {flavorProduct && <FlavorManagerModal product={flavorProduct} submitting={submitting} onClose={() => setFlavorProduct(null)} onSubmit={saveFlavors} />}
  </div>
}
