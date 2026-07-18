import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { getConfig } from './config.js'
import { requireAuth } from './middleware/auth.js'
import { errorHandler, notFound } from './middleware/errors.js'
import { healthRouter } from './routes/health.js'
import { meRouter } from './routes/me.js'
import { menuRouter } from './routes/menu.js'
import { teamRouter } from './routes/team.js'
import { kitchenRouter } from './routes/kitchen.js'
import { deliveriesRouter } from './routes/deliveries.js'
import { ordersRouter } from './routes/orders.js'
import { inventoryRouter } from './routes/inventory.js'
import { reportsRouter } from './routes/reports.js'
import { settingsRouter } from './routes/settings.js'
import { auditRouter } from './routes/audit.js'

export function createApp() {
  const config = getConfig()
  const app = express()

  if (config.trustProxy) app.set('trust proxy', 1)

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.webOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('This web origin is not allowed by the API.'))
    },
    credentials: true
  }))
  app.use(express.json({ limit: '256kb' }))
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }))

  app.use('/api/health', healthRouter)
  app.use('/api/me', requireAuth, meRouter)
  app.use('/api/menu', requireAuth, menuRouter)
  app.use('/api/team', requireAuth, teamRouter)
  app.use('/api/kitchen', requireAuth, kitchenRouter)
  app.use('/api/deliveries', requireAuth, deliveriesRouter)
  app.use('/api/orders', requireAuth, ordersRouter)
  app.use('/api/inventory', requireAuth, inventoryRouter)
  app.use('/api/reports', requireAuth, reportsRouter)
  app.use('/api/settings', requireAuth, settingsRouter)
  app.use('/api/audit', requireAuth, auditRouter)

  app.use(notFound)
  app.use(errorHandler)
  return app
}

export default createApp()
