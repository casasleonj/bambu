'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/pedidos', label: 'Pedidos' },
  { href: '/clientes', label: 'Clientes' },
  { href: '/embarques', label: 'Embarques' },
  { href: '/produccion', label: 'Producción' },
  { href: '/cierre', label: 'Cierre' },
  { href: '/facturas', label: 'Facturas' },
  { href: '/gastos', label: 'Gastos' },
  { href: '/nomina', label: 'Nómina' },
  { href: '/insumos', label: 'Insumos' },
  { href: '/reportes', label: 'Reportes' },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 min-h-screen bg-slate-50 border-r p-4">
      <h1 className="text-xl font-bold text-emerald-600 mb-6">Bambú</h1>
      <nav className="space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block px-3 py-2 rounded-md text-sm hover:bg-emerald-100',
              pathname === item.href && 'bg-emerald-100 text-emerald-700'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}