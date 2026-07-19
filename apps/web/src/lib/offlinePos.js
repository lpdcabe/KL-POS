const DATABASE_NAME = 'kl-pos-offline'
const DATABASE_VERSION = 1
const ORDER_STORE = 'pending-orders'
const CACHE_STORE = 'app-cache'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(ORDER_STORE)) database.createObjectStore(ORDER_STORE, { keyPath: 'clientOrderId' })
      if (!database.objectStoreNames.contains(CACHE_STORE)) database.createObjectStore(CACHE_STORE)
    }
  })
}

async function useStore(storeName, mode, operation) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

export function cacheMenu(categories) {
  return useStore(CACHE_STORE, 'readwrite', (store) => store.put({ categories, cachedAt: new Date().toISOString() }, 'menu'))
}

export function getCachedMenu() {
  return useStore(CACHE_STORE, 'readonly', (store) => store.get('menu'))
}

export function queueOfflineOrder(payload, total) {
  const queued = {
    clientOrderId: payload.clientOrderId,
    payload,
    total,
    queuedAt: new Date().toISOString(),
    syncError: ''
  }
  return useStore(ORDER_STORE, 'readwrite', (store) => store.put(queued)).then(() => queued)
}

export function getPendingOrders() {
  return useStore(ORDER_STORE, 'readonly', (store) => store.getAll())
}

export function removePendingOrder(clientOrderId) {
  return useStore(ORDER_STORE, 'readwrite', (store) => store.delete(clientOrderId))
}

export function updatePendingOrder(order) {
  return useStore(ORDER_STORE, 'readwrite', (store) => store.put(order))
}
