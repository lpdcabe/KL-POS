import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const profileCacheKey = 'kl-pos-profile'

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
        localStorage.setItem(profileCacheKey, JSON.stringify(result.profile))
        if (active) setProfile(result.profile)
      } catch (requestError) {
        const cachedProfile = JSON.parse(localStorage.getItem(profileCacheKey) || 'null')
        if (active && requestError.isNetworkError && cachedProfile?.id === nextSession.user.id) {
          setProfile(cachedProfile)
          setError('Offline mode: using the saved cashier profile.')
        } else if (active) setError(requestError.message)
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
    localStorage.removeItem(profileCacheKey)
    await supabase?.auth.signOut()
  }

  return { session, profile, loading, error, signIn, signOut, isConfigured: isSupabaseConfigured }
}
