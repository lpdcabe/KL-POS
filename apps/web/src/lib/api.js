function resolveApiUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL
    || (import.meta.env.DEV ? 'http://localhost:3001' : '')

  // Production uses the same Vercel origin for both the browser and /api.
  if (!configuredUrl) return ''

  try {
    const url = new URL(configuredUrl)
    const pageHost = window.location.hostname
    const pageIsRemote = pageHost && !['localhost', '127.0.0.1', '::1'].includes(pageHost)

    // A Vite value is baked into the browser bundle. When a LAN workstation
    // opens the POS, "localhost" would point to that workstation instead of
    // the machine hosting the API, so use the page's host in that situation.
    if (pageIsRemote && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      url.hostname = pageHost
    }

    return url.toString().replace(/\/$/, '')
  } catch {
    return configuredUrl.replace(/\/$/, '')
  }
}

const apiUrl = resolveApiUrl()

export async function apiRequest(path, { accessToken, ...options } = {}) {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let response
  try {
    response = await fetch(`${apiUrl}${path}`, { ...options, headers })
  } catch (error) {
    const networkError = new Error('No connection to the POS server.')
    networkError.isNetworkError = true
    networkError.cause = error
    throw networkError
  }
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const requestError = new Error(body.error || 'The request failed.')
    requestError.status = response.status
    throw requestError
  }
  return body
}
