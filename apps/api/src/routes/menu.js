import { Router } from 'express'
import { allowPermission } from '../middleware/auth.js'

export const menuRouter = Router()

menuRouter.get('/', allowPermission('pos', 'owner_admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('menu_categories')
      .select(`
        id,
        name,
        display_order,
        products (
          id,
          name,
          description,
          base_price,
          requires_flavor,
          is_available,
          product_recipes (inventory_item_id),
          product_channel_prices (channel, price),
          product_modifiers (
            is_required,
            min_select,
            max_select,
            modifier:modifiers (id, name, modifier_type, price_delta, is_active)
          )
        )
      `)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .order('display_order')

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ categories: data })
  } catch (error) {
    return next(error)
  }
})
