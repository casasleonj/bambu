import { Suspense } from 'react'
import PagosConfirmarClient from './pagos-confirmar-client'

// #631: el cliente lee `?pedidoId=` con useSearchParams, que exige un límite Suspense.
export default function PagosConfirmarPage() {
  return (
    <Suspense fallback={null}>
      <PagosConfirmarClient />
    </Suspense>
  )
}
