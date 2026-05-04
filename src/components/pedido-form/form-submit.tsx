'use client'

import { Button } from '@/components/ui/button'

interface FormSubmitProps {
  submitting: boolean
  total: number
}

export function FormSubmit({ submitting, total }: FormSubmitProps) {
  return (
    <Button type="submit" className="w-full" size="lg" disabled={submitting || total <= 0}>
      {submitting ? 'Creando...' : `Crear Pedido (${total.toLocaleString()})`}
    </Button>
  )
}
