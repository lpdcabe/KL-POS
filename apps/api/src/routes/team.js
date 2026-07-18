import { Router } from 'express'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase.js'
import { allowPermission, allowRoles } from '../middleware/auth.js'
import { permissionKeys } from '../lib/permissions.js'

const employeeSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(10).max(128),
  role: z.enum(['owner_admin', 'manager', 'cashier', 'kitchen', 'rider']),
  employeeCode: z.string().trim().max(30).optional().default(''),
  permissions: z.array(z.enum(permissionKeys)).max(permissionKeys.length).default([])
})

export const teamRouter = Router()

teamRouter.get('/', allowPermission('team', 'owner_admin', 'manager'), async (req, res, next) => {
  try {
    const admin = createAdminClient()
    const [{ data: authData, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from('profiles').select('id, full_name, role, permissions, employee_code, is_active, created_at').order('full_name')
    ])

    if (authError) return res.status(400).json({ error: authError.message })
    if (profileError) return res.status(400).json({ error: profileError.message })

    const authUsers = new Map(authData.users.map((user) => [user.id, user]))
    const employees = profiles.map((profile) => ({
      ...profile,
      email: authUsers.get(profile.id)?.email || 'No email',
      last_sign_in_at: authUsers.get(profile.id)?.last_sign_in_at || null
    }))

    return res.json({ employees })
  } catch (error) {
    return next(error)
  }
})

teamRouter.post('/', allowRoles('owner_admin'), async (req, res, next) => {
  const parsed = employeeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid employee details.' })
  }

  const { fullName, email, password, role, employeeCode, permissions } = parsed.data
  const admin = createAdminClient()
  let createdUserId = null

  try {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role }
    })

    if (authError) {
      const status = /already|registered|exists/i.test(authError.message) ? 409 : 400
      return res.status(status).json({ error: authError.message })
    }

    createdUserId = authData.user.id
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .insert({
        id: createdUserId,
        full_name: fullName,
        role,
        permissions: [...new Set(permissions)],
        employee_code: employeeCode || null,
        is_active: true
      })
      .select('id, full_name, role, permissions, employee_code, is_active, created_at')
      .single()

    if (profileError) {
      await admin.auth.admin.deleteUser(createdUserId)
      createdUserId = null
      return res.status(400).json({ error: profileError.message })
    }

    await admin.from('audit_logs').insert({
      actor_id: req.user.id,
      action: 'employee.created',
      entity_type: 'profile',
      entity_id: createdUserId,
      metadata: { email, role, permissions, employee_code: employeeCode || null }
    })

    return res.status(201).json({ employee: { ...profile, email } })
  } catch (error) {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId)
    return next(error)
  }
})
