export const permissionGroups = [
  {
    label: 'Workspace features',
    permissions: [
      ['dashboard', 'Overview dashboard'], ['pos', 'New order'], ['kitchen', 'Kitchen'],
      ['deliveries', 'Deliveries'], ['orders', 'Order history'], ['inventory', 'Inventory'],
      ['reports', 'Reports'], ['team', 'Team management'], ['audit', 'Audit trail']
    ]
  },
  {
    label: 'Settings access',
    permissions: [
      ['settings.store', 'Store profile'], ['settings.terminals', 'POS terminals'],
      ['settings.menu', 'Menu management'], ['settings.operations', 'Operations'],
      ['settings.security', 'Password'], ['settings.system', 'System status']
    ]
  }
]

export const allPermissions = permissionGroups.flatMap((group) => group.permissions.map(([key]) => key))

export const rolePermissionDefaults = {
  owner_admin: allPermissions,
  manager: ['dashboard', 'pos', 'kitchen', 'deliveries', 'orders', 'inventory', 'reports', 'team', 'audit', 'settings.operations', 'settings.system'],
  cashier: ['dashboard', 'pos', 'orders'],
  kitchen: ['dashboard', 'kitchen', 'orders', 'inventory'],
  rider: ['dashboard', 'deliveries', 'orders']
}

export function hasPermission(profile, permission) {
  if (profile?.role === 'owner_admin') return true
  const assigned = profile?.permissions || []
  return assigned.length ? assigned.includes(permission) : (rolePermissionDefaults[profile?.role] || []).includes(permission)
}

export function hasAnySettingsPermission(profile) {
  return allPermissions.filter((key) => key.startsWith('settings.')).some((key) => hasPermission(profile, key))
}
