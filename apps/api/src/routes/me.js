import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { createAdminClient, createPublicClient } from '../lib/supabase.js'

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(72)
    .regex(/[a-z]/, 'Password needs a lowercase letter.')
    .regex(/[A-Z]/, 'Password needs an uppercase letter.')
    .regex(/[0-9]/, 'Password needs a number.')
    .regex(/[^A-Za-z0-9]/, 'Password needs a symbol.')
}).refine((value) => value.currentPassword !== value.newPassword, { message: 'Choose a password different from the current password.' })

const passwordLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many password attempts. Try again in 15 minutes.' } })

export const meRouter = Router()

meRouter.get('/', (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email
    },
    profile: req.profile
  })
})

meRouter.post('/password', passwordLimiter, async (req, res, next) => {
  const parsed = passwordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter a valid password.' })

  try {
    const verifier = createPublicClient()
    const { error: verificationError } = await verifier.auth.signInWithPassword({ email: req.user.email, password: parsed.data.currentPassword })
    if (verificationError) return res.status(400).json({ error: 'The current password is incorrect.' })

    const admin = createAdminClient()
    const { error: updateError } = await admin.auth.admin.updateUserById(req.user.id, { password: parsed.data.newPassword })
    if (updateError) return res.status(400).json({ error: updateError.message })

    const { data: store } = await admin.from('stores').select('id').eq('is_active', true).order('created_at').limit(1).maybeSingle()
    await admin.from('audit_logs').insert({ store_id: store?.id || null, actor_id: req.user.id, action: 'settings.password_changed', entity_type: 'profile', entity_id: req.user.id, metadata: {} })
    return res.json({ message: 'Password changed successfully.' })
  } catch (error) {
    return next(error)
  }
})
