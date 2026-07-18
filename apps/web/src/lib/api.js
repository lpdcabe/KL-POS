function resolveApiUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'

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

  const response = await fetch(`${apiUrl}${path}`, { ...options, headers })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) throw new Error(body.error || 'The request failed.')
  return body
}
