import { createClient } from '@supabase/supabase-js'
import { getConfig } from '../config.js'

export function createUserClient(accessToken) {
  const config = getConfig()

  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  })
}

export function createPublicClient() {
  const config = getConfig()

  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  })
}

export function createAdminClient() {
  const config = getConfig()

  if (!config.supabaseSecretKey) {
    throw new Error('SUPABASE_SECRET_KEY is required for this server operation.')
  }

  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  })
}
