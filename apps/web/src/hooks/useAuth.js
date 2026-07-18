import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return undefined

    let active = true

    async function hydrate(nextSession) {
      setSession(nextSession)
      setProfile(null)
      setError('')

      if (!nextSession) {
        setLoading(false)
        return
      }

      try {
        const result = await apiRequest('/api/me', { accessToken: nextSession.access_token })
        if (active) setProfile(result.profile)
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event !== 'INITIAL_SESSION') hydrate(nextSession)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  return { session, profile, loading, error, signIn, signOut, isConfigured: isSupabaseConfigured }
}
