'use client'

import { useAdminBaseCaja } from '@/hooks/use-admin-base-caja'
import { openBaseCajaModal } from '@/components/base-caja-loader'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

export function AdminBaseCajaCard() {
  const state = useAdminBaseCaja()

  if (state.status === 'loading') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-4" />
        <div className="h-10 bg-gray-200 rounded w-32" />
      </div>
    )
  }

  if (state.status === 'cerrado') {
    return (
      <div className="bg-green-50 rounded-2xl border border-green-200 p-6">
        <h3 className="text-sm font-medium text-green-900">Caja del día</h3>
        <p className="text-2xl font-bold text-green-800 mt-1">
          {state.valor ? formatCurrency(Number(state.valor)) : 'Cierre completado'}
        </p>
        <p className="text-sm text-green-700 mt-2">
          El cierre del día ya fue realizado. No se puede editar la base.
        </p>
      </div>
    )
  }

  if (state.status === 'sin_base') {
    return (
      <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6">
        <h3 className="text-sm font-medium text-amber-900">Base de caja</h3>
        <p className="text-lg font-semibold text-amber-800 mt-1">Aún no registrada</p>
        <p className="text-sm text-amber-700 mt-2 mb-4">
          Registra el dinero físico en caja para iniciar operaciones del día.
        </p>
        <Button type="button" onClick={() => openBaseCajaModal()}>
          Registrar base
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-sm font-medium text-gray-500">Base de caja hoy</h3>
      <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(Number(state.valor))}</p>
      <p className="text-sm text-gray-500 mt-2 mb-4">
        Base registrada para el día de hoy. Puedes editarla mientras el día no esté cerrado.
      </p>
      <Button type="button" variant="outline" onClick={() => openBaseCajaModal(state.valor)}>
        Editar base
      </Button>
    </div>
  )
}
