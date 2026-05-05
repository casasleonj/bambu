'use client'

import { Button } from '@/components/ui/button'

interface ResumenSectionProps {
  total: number
  submitting: boolean
  requiereClienteSinResolver: boolean
}

export function ResumenSection({
  total,
  submitting,
  requiereClienteSinResolver,
}: ResumenSectionProps) {
  return (
    <div className="border-t pt-4 space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-500">Total:</span>
        <span className="text-xl font-bold text-gray-800">${total.toLocaleString()}</span>
      </div>
      <Button
        type="submit"
        disabled={total <= 0 || submitting || requiereClienteSinResolver}
        className={`w-full py-6 text-lg font-bold transition ${
          requiereClienteSinResolver
            ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
            : 'bg-green-600 hover:bg-green-700'
        }`}
        size="lg"
      >
        {submitting ? 'Procesando...' : requiereClienteSinResolver
          ? 'Seleccionar cliente'
          : `Cobrar $${total.toLocaleString()}`
        }
      </Button>
    </div>
  )
}
