import { Router } from 'express'
import { getConfig } from '../config.js'

export const healthRouter = Router()

healthRouter.get('/', (req, res) => {
  const config = getConfig()

  res.json({
    status: 'ok',
    service: 'kl-chicken-wings-pos-api',
    supabase: config.isSupabaseConfigured ? 'configured' : 'configuration-required',
    timestamp: new Date().toISOString()
  })
})
