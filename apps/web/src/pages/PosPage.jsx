import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, Minus, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const channels = ['Dine-in', 'Takeout', 'Store delivery', 'GrabFood']
const maxItemQuantity = 20
const channelValues = { 'Dine-in': 'dine_in', Takeout: 'takeout', 'Store delivery': 'store_delivery', GrabFood: 'grabfood' }
const paymentOptions = {
  'Dine-in': [['cash', 'Cash'], ['gcash', 'GCash'], ['maya', 'Maya'], ['card', 'Card']],
  Takeout: [['cash', 'Cash'], ['gcash', 'GCash'], ['maya', 'Maya'], ['card', 'Card']],
  'Store delivery': [['store_delivery_cod', 'Cash on delivery'], ['store_delivery_prepaid', 'Prepaid']],
  GrabFood: [['grabfood_prepaid', 'GrabFood prepaid']]
}

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function FlavorModal({ item, onClose, onAdd }) {
  const [selectedId, setSelectedId] = useState('')
  const selected = item.flavors.find((flavor) => flavor.id === selectedId)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="flavor-modal" role="dialog" aria-modal="true" aria-labelledby="flavor-modal-title"><header><div><span className="eyebrow">Choose flavor</span><h2 id="flavor-modal-title">{item.name}</h2><p>Select one flavor for this item. Add another item to order a different flavor.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close flavor selection"><X size={19} /></button></header>{item.flavors.length ? <><div className="flavor-selection-count"><span>{selected ? '1 flavor selected' : 'Select a flavor'}</span></div><div className="flavor-options" role="radiogroup" aria-label={`Flavor for ${item.name}`}>{item.flavors.map((flavor) => <button key={flavor.id} type="button" role="radio" aria-checked={selectedId === flavor.id} className={selectedId === flavor.id ? 'active' : ''} onClick={() => setSelectedId(flavor.id)}><span>{flavor.name}</span>{Number(flavor.priceDelta) > 0 && <small>+ {money(flavor.priceDelta)}</small>}<CheckCircle2 size={18} /></button>)}</div></> : <div className="flavor-empty"><strong>No flavors configured</strong><span>Add flavor choices in Settings → Menu management.</span></div>}<footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" disabled={!selected} onClick={() => onAdd([selected])}>Add to order</button></footer></section></div>
}

function CheckoutModal({ channel, cart, total, form, onChange, onClose, onSubmit, submitting, error, completedOrder, onDone }) {
  if (completedOrder) {
    return (
      <div className="modal-backdrop">
        <section className="checkout-modal checkout-success" role="dialog" aria-modal="true" aria-labelledby="checkout-success-title">
          <CheckCircle2 size={48} />
          <span className="eyebrow">Payment recorded</span>
          <h2 id="checkout-success-title">Order #{completedOrder.order_number} confirmed</h2>
          <p>The order was sent to the kitchen and is now available in order history.</p>
          <div><span>Total paid</span><strong>{money(completedOrder.total)}</strong></div>
          {completedOrder.change > 0 && <div><span>Cash change</span><strong>{money(completedOrder.change)}</strong></div>}
          <button className="primary-button" type="button" onClick={onDone}>Start a new order</button>
        </section>
      </div>
    )
  }

  const isCash = form.paymentMethod === 'cash'
  const change = isCash ? Math.max(0, Number(form.tenderedAmount || 0) - total) : 0
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <header><div><span className="eyebrow">Confirm transaction</span><h2 id="checkout-title">Review and pay</h2><p>{channel} · {cart.reduce((sum, item) => sum + item.quantity, 0)} items</p></div><button className="icon-button" type="button" onClick={onClose} disabled={submitting} aria-label="Close checkout"><X size={19} /></button></header>
        <form onSubmit={onSubmit}>
          <div className="checkout-body">
            <section className="checkout-review"><h3>Order summary</h3>{cart.map((item) => <div key={item.lineId}><span>{item.quantity}× {item.name}{item.modifiers?.length ? ` · ${item.modifiers.map((modifier) => modifier.name).join(' + ')}` : ''}</span><strong>{money(item.price * item.quantity)}</strong></div>)}<footer><span>Total</span><strong>{money(total)}</strong></footer></section>
            <section className="checkout-fields">
              <h3>Order details</h3>
              <div className="checkout-field-grid">
                <label><span>Customer name <small>Optional</small></span><input value={form.customerName} onChange={(event) => onChange({ ...form, customerName: event.target.value })} placeholder="Customer name" /></label>
                <label><span>Mobile number <small>Optional</small></span><input value={form.customerMobile} onChange={(event) => onChange({ ...form, customerMobile: event.target.value })} placeholder="09xx xxx xxxx" /></label>
                {channel === 'Dine-in' && <label className="checkout-field-wide"><span>Table number</span><input value={form.tableNumber} onChange={(event) => onChange({ ...form, tableNumber: event.target.value })} placeholder="Example: T-04" /></label>}
                {channel === 'Store delivery' && <><label className="checkout-field-wide"><span>Delivery address</span><input required value={form.address} onChange={(event) => onChange({ ...form, address: event.target.value })} placeholder="House number, street, subdivision" /></label><label className="checkout-field-wide"><span>Barangay</span><input value={form.barangay} onChange={(event) => onChange({ ...form, barangay: event.target.value })} placeholder="Barangay" /></label></>}
                {channel === 'GrabFood' && <label className="checkout-field-wide"><span>GrabFood reference</span><input required value={form.grabReference} onChange={(event) => onChange({ ...form, grabReference: event.target.value })} placeholder="Enter Grab order reference" /></label>}
                <label className="checkout-field-wide"><span>Special instructions <small>Optional</small></span><textarea value={form.specialInstructions} onChange={(event) => onChange({ ...form, specialInstructions: event.target.value })} placeholder="Kitchen or fulfillment notes" /></label>
              </div>
              <h3>Payment</h3>
              <div className="checkout-payment-options">{paymentOptions[channel].map(([value, label]) => <button key={value} className={form.paymentMethod === value ? 'active' : ''} type="button" onClick={() => onChange({ ...form, paymentMethod: value })}><CreditCard size={17} />{label}</button>)}</div>
              {isCash && <div className="checkout-cash"><label><span>Cash received</span><input type="number" min={total} step="0.01" required value={form.tenderedAmount} onChange={(event) => onChange({ ...form, tenderedAmount: event.target.value })} placeholder={total.toFixed(2)} /></label><div><span>Change</span><strong>{money(change)}</strong></div></div>}
              {['gcash', 'maya', 'card', 'store_delivery_prepaid'].includes(form.paymentMethod) && <label className="checkout-reference"><span>Payment reference <small>Optional</small></span><input value={form.externalReference} onChange={(event) => onChange({ ...form, externalReference: event.target.value })} placeholder="Receipt or transaction reference" /></label>}
            </section>
          </div>
          {error && <div className="notice notice--error checkout-error">{error}</div>}
          <footer className="checkout-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>Back to order</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Processing payment…' : `Confirm ${money(total)}`}</button></footer>
        </form>
      </section>
    </div>
  )
}

export function PosPage({ accessToken }) {
  const [channel, setChannel] = useState('Takeout')
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutForm, setCheckoutForm] = useState({ customerName: '', customerMobile: '', tableNumber: '', address: '', barangay: '', specialInstructions: '', grabReference: '', paymentMethod: 'cash', tenderedAmount: '', externalReference: '' })
  const [checkoutError, setCheckoutError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [completedOrder, setCompletedOrder] = useState(null)
  const [menuCategories, setMenuCategories] = useState([])
  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState('')
  const [cartNotice, setCartNotice] = useState('')
  const [flavorItem, setFlavorItem] = useState(null)

  const loadMenu = useCallback(async () => {
    setMenuLoading(true)
    try {
      const result = await apiRequest('/api/menu', { accessToken })
      setMenuCategories(result.categories || [])
      setMenuError('')
    } catch (requestError) {
      setMenuError(requestError.message)
    } finally {
      setMenuLoading(false)
    }
  }, [accessToken])

  useEffect(() => { loadMenu() }, [loadMenu])

  const categories = useMemo(() => ['All', ...menuCategories.map((entry) => entry.name)], [menuCategories])
  const menuItems = useMemo(() => menuCategories.flatMap((entry) => (entry.products || []).filter((product) => product.is_available).map((product) => {
    const channelPrice = product.product_channel_prices?.find((price) => price.channel === channelValues[channel])
    const flavors = (product.product_modifiers || []).filter((link) => link.modifier?.is_active && link.modifier.modifier_type === 'flavor').map((link) => ({ id: link.modifier.id, name: link.modifier.name, priceDelta: Number(link.modifier.price_delta || 0) }))
    return { id: product.id, name: product.name, category: entry.name, price: Number(channelPrice?.price ?? product.base_price), requiresFlavor: product.requires_flavor, flavors, recipeConfigured: Boolean(product.product_recipes?.length) }
  })), [menuCategories, channel])
  const items = useMemo(() => menuItems.filter((item) => {
    const matchesCategory = category === 'All' || item.category === category
    return matchesCategory && item.name.toLowerCase().includes(query.toLowerCase())
  }), [menuItems, category, query])

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  function addItem(item, modifiers = []) {
    const sortedModifiers = [...modifiers].sort((a, b) => a.id.localeCompare(b.id))
    const lineId = sortedModifiers.length ? `${item.id}:${sortedModifiers.map((modifier) => modifier.id).join(':')}` : item.id
    const unitPrice = item.price + sortedModifiers.reduce((sum, modifier) => sum + Number(modifier.priceDelta || 0), 0)
    setCart((current) => {
      const existing = current.find((entry) => entry.lineId === lineId)
      if (existing?.quantity >= maxItemQuantity) {
        setCartNotice(`${item.name} is limited to ${maxItemQuantity} per order.`)
        return current
      }
      setCartNotice('')
      if (existing) return current.map((entry) => entry.lineId === lineId ? { ...entry, quantity: entry.quantity + 1 } : entry)
      return [...current, { ...item, lineId, price: unitPrice, modifiers: sortedModifiers, quantity: 1 }]
    })
  }

  function chooseItem(item) {
    if (item.requiresFlavor) {
      setFlavorItem(item)
      return
    }
    addItem(item)
  }

  function changeQuantity(id, delta) {
    setCart((current) => current.map((item) => {
      if (item.lineId !== id) return item
      const next = item.quantity + delta
      if (next > maxItemQuantity) {
        setCartNotice(`${item.name} is limited to ${maxItemQuantity} per order.`)
        return item
      }
      setCartNotice('')
      return { ...item, quantity: next }
    }).filter((item) => item.quantity > 0))
  }

  function beginCheckout() {
    const paymentMethod = paymentOptions[channel][0][0]
    setCheckoutForm((current) => ({ ...current, paymentMethod, tenderedAmount: paymentMethod === 'cash' ? subtotal.toFixed(2) : '' }))
    setCheckoutError('')
    setShowCheckout(true)
  }

  async function submitCheckout(event) {
    event.preventDefault()
    setSubmitting(true)
    setCheckoutError('')
    try {
      const result = await apiRequest('/api/orders', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ ...checkoutForm, channel: channelValues[channel], items: cart.map((item) => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity, modifiers: item.modifiers || [] })) })
      })
      setCompletedOrder(result.order)
      setCart([])
    } catch (requestError) {
      setCheckoutError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function finishCheckout() {
    setShowCheckout(false)
    setCompletedOrder(null)
    setCheckoutForm({ customerName: '', customerMobile: '', tableNumber: '', address: '', barangay: '', specialInstructions: '', grabReference: '', paymentMethod: 'cash', tenderedAmount: '', externalReference: '' })
  }

  return (
    <div className="pos-layout">
      <section className="pos-catalog">
        <header className="pos-header">
          <div><span className="eyebrow">New order</span><h1>Build the order</h1></div>
          <div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the menu" /></div>
        </header>

        <div className="segmented-control" aria-label="Order channel">
          {channels.map((item) => <button key={item} className={channel === item ? 'active' : ''} onClick={() => setChannel(item)}>{item}</button>)}
        </div>

        <div className="category-tabs">
          {categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
        </div>

        <div className="menu-grid">
          {menuLoading ? <div className="pos-menu-state"><div className="spinner" /><span>Loading menu...</span></div> : menuError ? <div className="pos-menu-state"><ShoppingCart size={28} /><strong>Menu unavailable</strong><span>{menuError}</span><button className="secondary-button" type="button" onClick={loadMenu}>Try again</button></div> : items.length ? items.map((item) => (
            <button className="menu-item" key={item.id} onClick={() => chooseItem(item)} disabled={!item.recipeConfigured} title={!item.recipeConfigured ? 'Configure this product recipe in Settings before selling it.' : ''}>
              <span className="menu-item__category">{item.category}</span>
              <strong>{item.name}</strong>
              {!item.recipeConfigured && <small>Recipe required</small>}
              <b>₱{item.price.toFixed(2)}</b>
            </button>
          )) : <div className="pos-menu-state"><ShoppingCart size={28} /><strong>No menu items found</strong><span>Add products in Settings → Menu management.</span></div>}
        </div>
      </section>

      <aside className="order-panel">
        <div className="order-panel__header">
          <div><span className="eyebrow">Current order</span><h2>{channel}</h2></div>
          <button className="icon-button" onClick={() => { setCart([]); setCartNotice('') }} aria-label="Clear order"><Trash2 size={18} /></button>
        </div>

        <div className="cart-items">
          {cartNotice && <div className="cart-limit-note">{cartNotice}</div>}
          {cart.length === 0 ? (
            <div className="cart-empty"><ShoppingCart size={28} /><strong>Your order is empty</strong><span>Select an item to add it here.</span></div>
          ) : cart.map((item) => (
            <div className="cart-item" key={item.lineId}>
              <div><strong>{item.name}</strong>{item.modifiers?.length > 0 && <small>{item.modifiers.map((modifier) => modifier.name).join(' + ')}</small>}<span>₱{item.price.toFixed(2)} each</span></div>
              <div className="quantity-control">
                <button onClick={() => changeQuantity(item.lineId, -1)}><Minus size={14} /></button>
                <span>{item.quantity}</span>
                <button onClick={() => changeQuantity(item.lineId, 1)} disabled={item.quantity >= maxItemQuantity} title={item.quantity >= maxItemQuantity ? `Maximum ${maxItemQuantity} per order` : 'Add one'}><Plus size={14} /></button>
              </div>
              <b>₱{(item.price * item.quantity).toFixed(2)}</b>
            </div>
          ))}
        </div>

        <div className="order-summary">
          <div><span>Subtotal</span><strong>₱{subtotal.toFixed(2)}</strong></div>
          <div><span>Discount</span><strong>₱0.00</strong></div>
          <div className="order-summary__total"><span>Total</span><strong>₱{subtotal.toFixed(2)}</strong></div>
          <button className="primary-button" type="button" disabled={!cart.length} onClick={beginCheckout}>Review and pay</button>
          <small>Menu products are managed in Settings → Menu management.</small>
        </div>
      </aside>
      {showCheckout && <CheckoutModal channel={channel} cart={cart} total={subtotal} form={checkoutForm} onChange={setCheckoutForm} onClose={() => setShowCheckout(false)} onSubmit={submitCheckout} submitting={submitting} error={checkoutError} completedOrder={completedOrder} onDone={finishCheckout} />}
      {flavorItem && <FlavorModal item={flavorItem} onClose={() => setFlavorItem(null)} onAdd={(flavors) => { addItem(flavorItem, flavors); setFlavorItem(null) }} />}
    </div>
  )
}
