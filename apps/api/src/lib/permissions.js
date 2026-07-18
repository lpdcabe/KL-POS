export const permissionKeys = [
  'dashboard', 'pos', 'kitchen', 'deliveries', 'orders', 'inventory', 'reports', 'team', 'audit',
  'settings.store', 'settings.terminals', 'settings.menu', 'settings.operations', 'settings.security', 'settings.system'
]

export const rolePermissionDefaults = {
  owner_admin: permissionKeys,
  manager: ['dashboard', 'pos', 'kitchen', 'deliveries', 'orders', 'inventory', 'reports', 'team', 'audit', 'settings.operations', 'settings.system'],
  cashier: ['dashboard', 'pos', 'orders'],
  kitchen: ['dashboard', 'kitchen', 'orders', 'inventory'],
  rider: ['dashboard', 'deliveries', 'orders']
}
