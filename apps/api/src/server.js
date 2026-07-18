import { createApp } from './app.js'
import { getConfig } from './config.js'

const config = getConfig()
const app = createApp()

app.listen(config.port, () => {
  console.log(`KL Chicken Wings POS API listening on http://localhost:${config.port}`)
  if (!config.isSupabaseConfigured) {
    console.warn(`Supabase configuration missing: ${config.missing.join(', ')}`)
  }
})
