export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  const status = error.status || 500
  const message = status >= 500 ? 'An unexpected server error occurred.' : error.message

  if (status >= 500) console.error(error)
  return res.status(status).json({ error: message })
}
