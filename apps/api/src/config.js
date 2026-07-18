import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })
loadEnv({ quiet: true })

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']

export function getConfig() {
  const missing = required.filter((key) => !process.env[key])

  return {
    port: Number(process.env.PORT || 3001),
    webOrigins: (process.env.WEB_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: process.env.TRUST_PROXY === 'true',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || '',
    isSupabaseConfigured: missing.length === 0,
    missing
  }
}
