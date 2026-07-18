import { Router } from 'express'
import { createAdminClient } from '../lib/supabase.js'
import { allowPermission } from '../middleware/auth.js'

const allowedModules = ['delivery', 'employee', 'inventory', 'kitchen', 'settings']

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function escapeSearch(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll(',', '')
}

export const auditRouter = Router()

auditRouter.get('/', allowPermission('audit', 'owner_admin', 'manager'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(50, Math.max(10, Number.parseInt(req.query.pageSize, 10) || 25))
    const search = String(req.query.search || '').trim().slice(0, 100)
    const module = allowedModules.includes(req.query.module) ? req.query.module : ''
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : ''
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : ''
    const start = (page - 1) * pageSize
    const admin = createAdminClient()
    const { data: store, error: storeError } = await admin.from('stores').select('id').eq('is_active', true).order('created_at').limit(1).maybeSingle()
    if (storeError) return res.status(400).json({ error: storeError.message })
    if (!store) return res.status(404).json({ error: 'No active store is configured.' })

    let query = admin.from('audit_logs').select('id, actor_id, action, entity_type, entity_id, reason, metadata, created_at', { count: 'exact' }).eq('store_id', store.id).order('created_at', { ascending: false }).range(start, start + pageSize - 1)
    if (module) query = query.like('action', `${module}.%`)
    if (from) query = query.gte('created_at', `${from}T00:00:00+08:00`)
    if (to) query = query.lte('created_at', `${to}T23:59:59.999+08:00`)
    if (search) {
      const term = escapeSearch(search)
      query = query.or(`action.ilike.%${term}%,entity_type.ilike.%${term}%,entity_id.ilike.%${term}%,reason.ilike.%${term}%`)
    }

    const today = manilaDate()
    const [{ data: logs, count, error }, { count: todayCount, error: todayError }] = await Promise.all([
      query,
      admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('store_id', store.id).gte('created_at', `${today}T00:00:00+08:00`)
    ])
    if (error) return res.status(400).json({ error: error.message })
    if (todayError) return res.status(400).json({ error: todayError.message })

    const actorIds = [...new Set(logs.map((log) => log.actor_id).filter(Boolean))]
    const { data: actors, error: actorError } = actorIds.length ? await admin.from('profiles').select('id, full_name, role, employee_code').in('id', actorIds) : { data: [], error: null }
    if (actorError) return res.status(400).json({ error: actorError.message })
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]))

    return res.json({
      logs: logs.map((log) => ({ ...log, actor: actorMap.get(log.actor_id) || null })),
      pagination: { page, pageSize, total: count || 0, pages: Math.max(1, Math.ceil((count || 0) / pageSize)) },
      summary: { today: todayCount || 0, actorsOnPage: actorIds.length, actionsOnPage: new Set(logs.map((log) => log.action)).size },
      modules: allowedModules
    })
  } catch (error) {
    return next(error)
  }
})
