import type { Role } from './constants'
import { ROLES } from './constants'

export type Permission =
  | 'view:dashboard'
  | 'view:clientes'
  | 'view:pedidos'
  | 'view:productos'
  | 'view:casos'
  | 'view:produccion'
  | 'view:insumos'
  | 'view:embarques'
  | 'view:rutas'
  | 'view:repartidor'
  | 'view:facturas'
  | 'view:cierre'
  | 'view:gastos'
  | 'view:compras'
  | 'view:nomina'
  | 'view:reportes'
  | 'view:trabajadores'
  | 'view:proveedores'
  | 'view:usuarios'
  | 'view:configuracion'
  | 'view:mi-perfil'
  | 'view:deudas'
  | 'view:recurrentes'
  | 'view:resumen-facturas'

const ALL_PERMISSIONS: Permission[] = [
  'view:dashboard', 'view:clientes', 'view:pedidos', 'view:productos',
  'view:casos', 'view:produccion', 'view:insumos', 'view:embarques',
  'view:rutas', 'view:repartidor', 'view:facturas', 'view:cierre',
  'view:gastos', 'view:compras', 'view:nomina', 'view:reportes',
  'view:trabajadores', 'view:proveedores', 'view:usuarios',
  'view:configuracion', 'view:mi-perfil', 'view:deudas',
  'view:recurrentes', 'view:resumen-facturas',
]

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [ROLES.ADMIN]: ALL_PERMISSIONS,
  [ROLES.ASISTENTE]: [
    'view:dashboard', 'view:clientes', 'view:pedidos', 'view:productos',
    'view:casos', 'view:produccion', 'view:insumos', 'view:embarques',
    'view:rutas', 'view:cierre', 'view:mi-perfil', 'view:recurrentes',
  ],
  [ROLES.CONTADOR]: [
    'view:dashboard', 'view:clientes', 'view:pedidos', 'view:productos',
    'view:casos', 'view:insumos', 'view:embarques', 'view:rutas',
    'view:facturas', 'view:cierre', 'view:gastos', 'view:compras',
    'view:nomina', 'view:reportes', 'view:trabajadores', 'view:proveedores',
    'view:configuracion', 'view:mi-perfil', 'view:deudas',
    'view:recurrentes', 'view:resumen-facturas',
  ],
  // REPARTIDOR is restricted to the delivery view + their profile.
  // Per BLOQUEAR_PRECIOS_REPARTIDOR = Opción C: "ningún precio en ningún lado",
  // we don't grant access to pages that send raw prices (/dashboard, /pedidos,
  // /embarques, /rutas) — the proxy redirects to /repartidor if attempted.
  // If admin later wants to expose a price-free view of these pages, build a
  // dedicated route (e.g. /mis-pedidos) rather than re-granting access here.
  [ROLES.REPARTIDOR]: [
    'view:repartidor', 'view:mi-perfil',
  ],
  [ROLES.SELLADOR]: [
    'view:dashboard', 'view:produccion', 'view:mi-perfil',
  ],
}

export function userCan(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  return perms.includes(permission)
}

export function getUserPermissions(role: Role | undefined): Permission[] {
  if (!role) return []
  return ROLE_PERMISSIONS[role] || []
}

const ROUTE_PERMISSION_MAP: Record<string, Permission> = {
  '/dashboard': 'view:dashboard',
  '/clientes': 'view:clientes',
  '/pedidos': 'view:pedidos',
  '/productos': 'view:productos',
  '/casos': 'view:casos',
  '/produccion': 'view:produccion',
  '/insumos': 'view:insumos',
  '/embarques': 'view:embarques',
  '/rutas': 'view:rutas',
  '/repartidor': 'view:repartidor',
  '/facturas': 'view:facturas',
  '/facturacion': 'view:facturas',
  '/cierre': 'view:cierre',
  '/gastos': 'view:gastos',
  '/compras': 'view:compras',
  '/nomina': 'view:nomina',
  '/reportes': 'view:reportes',
  '/trabajadores': 'view:trabajadores',
  '/proveedores': 'view:proveedores',
  '/admin': 'view:usuarios',
  '/admin/usuarios': 'view:usuarios',
  '/configuracion': 'view:configuracion',
  '/mi-perfil': 'view:mi-perfil',
  '/cambiar-contrasena': 'view:mi-perfil',
  '/deudas': 'view:deudas',
  '/recurrentes': 'view:recurrentes',
  '/resumen-facturas': 'view:resumen-facturas',
}

export function getRoutePermission(pathname: string): Permission | null {
  const normalized = pathname.split('?')[0].split('#')[0]

  if (ROUTE_PERMISSION_MAP[normalized]) {
    return ROUTE_PERMISSION_MAP[normalized]
  }

  for (const [route, permission] of Object.entries(ROUTE_PERMISSION_MAP)) {
    if (route !== '/' && normalized.startsWith(route + '/')) {
      return permission
    }
  }

  return null
}

export function isRouteAllowed(pathname: string, role: Role | undefined): boolean {
  const permission = getRoutePermission(pathname)
  if (!permission) return true
  return userCan(role, permission)
}

export function getRedirectForRole(role: Role | undefined): string {
  switch (role) {
    case ROLES.REPARTIDOR:
      return '/repartidor'
    case ROLES.CONTADOR:
      return '/reportes'
    default:
      return '/dashboard'
  }
}
