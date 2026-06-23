'use client'

import { useSearchParams } from 'next/navigation'
import { useImportBatch } from '@/hooks/use-import-batch'
import { ImportWizard } from '@/components/import/wizard'

export default function ImportarPage() {
  const searchParams = useSearchParams()
  const initialBatchId = searchParams.get('batch') ?? undefined
  const state = useImportBatch(initialBatchId)

  return (
    <main className="min-h-screen bg-background py-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Importación histórica</h1>
        <p className="text-sm text-muted-foreground">
          Subí un archivo Excel para importar clientes, pedidos, gastos y más.
        </p>
      </div>
      <ImportWizard {...state} />
    </main>
  )
}
