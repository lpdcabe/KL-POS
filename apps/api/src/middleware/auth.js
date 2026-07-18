import { createUserClient } from '../lib/supabase.js'
import { rolePermissionDefaults } from '../lib/permissions.js'

export async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || ''
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'A valid bearer token is required.' })
  }

  try {
    const supabase = createUserClient(token)
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return res.status(401).json({ error: 'Your session is invalid or expired.' })
    }

    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, permissions, is_active')
      .eq('id', data.user.id)
      .single()

    // Keep existing users able to sign in while the permissions migration is being deployed.
    if (profileError && /permissions.*does not exist|column.*permissions/i.test(profileError.message)) {
      const legacyResult = await supabase
        .from('profiles')
        .select('id, full_name, role, is_active')
        .eq('id', data.user.id)
        .single()
      profile = legacyResult.data ? { ...legacyResult.data, permissions: [] } : null
      profileError = legacyResult.error
    }

    if (profileError) {
      console.error('Profile lookup failed:', profileError.message)
      return res.status(500).json({ error: 'Employee access could not be checked. Apply the latest database migrations and try again.' })
    }

    if (!profile?.is_active) {
      return res.status(403).json({ error: 'Your employee account is not active.' })
    }

    req.accessToken = token
    req.supabase = supabase
    req.user = data.user
    req.profile = profile
    return next()
  } catch (error) {
    return next(error)
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    }

    return next()
  }
}

export function allowPermission(permission, ...legacyRoles) {
  return (req, res, next) => {
    if (!req.profile) return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    if (req.profile.role === 'owner_admin') return next()
    const permissions = req.profile.permissions || []
    if (permissions.includes(permission)) return next()
    // Profiles created before custom permissions were introduced keep their role access.
    if (!permissions.length && legacyRoles.includes(req.profile.role)) return next()
    return res.status(403).json({ error: 'You do not have permission to perform this action.' })
  }
}

export function allowAnyPermission(...permissions) {
  return (req, res, next) => {
    if (req.profile?.role === 'owner_admin' || permissions.some((permission) => req.profile?.permissions?.includes(permission))) return next()
    if (!req.profile?.permissions?.length && permissions.some((permission) => rolePermissionDefaults[req.profile?.role]?.includes(permission))) return next()
    return res.status(403).json({ error: 'You do not have permission to perform this action.' })
  }
}
