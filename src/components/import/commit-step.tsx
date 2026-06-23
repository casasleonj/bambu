import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import type { ImportBatch, ImportStagingRow } from '@prisma/client'

export interface CommitStepProps {
  batch: ImportBatch
  rows: ImportStagingRow[]
  committing: boolean
  onRetry?: () => void
}

export function CommitStep({ batch, rows, committing, onRetry }: CommitStepProps) {
  const isSuccess = batch.estado === 'COMPLETED' && batch.errorRows === 0
  const hasErrors = batch.errorRows && batch.errorRows > 0
  const failedRows = rows.filter((r) => r.error)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {batch.estado === 'COMMITTING'
            ? 'Importando...'
            : isSuccess
            ? 'Importación completada'
            : hasErrors
            ? 'Importación con errores'
            : 'Resultado de la importación'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {committing && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span>Creando registros...</span>
          </div>
        )}

        {!committing && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{batch.createdRows}</p>
                <p className="text-xs text-muted-foreground uppercase">creados</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{batch.autoMergedRows}</p>
                <p className="text-xs text-muted-foreground uppercase">fusionados</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{batch.skippedRows}</p>
                <p className="text-xs text-muted-foreground uppercase">omitidos</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{batch.errorRows}</p>
                <p className="text-xs text-muted-foreground uppercase">fallidos</p>
              </div>
            </div>

            {hasErrors && (
              <div className="space-y-2">
                <p className="font-medium">Filas fallidas:</p>
                {failedRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-destructive/50 p-3 text-sm">
                    <Badge variant="destructive" className="mb-1">{row.entity}</Badge>
                    <p>Fila {row.rowNumber}: {row.error}</p>
                  </div>
                ))}
              </div>
            )}

            {hasErrors && onRetry && (
              <Button onClick={onRetry} variant="outline" className="w-full">
                Volver a revisar
              </Button>
            )}

            {!committing && (
              <div className="grid grid-cols-2 gap-3">
                <Link href="/dashboard/importar/historial" className="w-full">
                  <Button variant="outline" className="w-full">
                    Ver en historial
                  </Button>
                </Link>
                <Link href="/dashboard" className="w-full">
                  <Button className="w-full">
                    Volver al dashboard
                  </Button>
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
