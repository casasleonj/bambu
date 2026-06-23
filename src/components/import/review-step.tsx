import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ReviewTable } from './review-table'
import { ReviewCard } from './review-card'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import type { ImportStagingRow } from '@prisma/client'

export interface ReviewStepProps {
  rows: Array<ImportStagingRow & { contactos: Array<{ id: string; nombre: string; telefono: string; relacion: string | null }> }>
  onDecide: (stagingRowId: string, decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP', targetId?: string) => void
  onCommit: () => void
}

export function ReviewStep({ rows, onDecide, onCommit }: ReviewStepProps) {
  const isDesktop = useIsDesktop()
  const reviewableEntities = ['CLIENTE', 'PROVEEDOR'] as const
  const pendingRows = rows.filter((r) => reviewableEntities.includes(r.entity as typeof reviewableEntities[number]) && r.decision === 'PENDING')
  const decidedCount = pendingRows.length === 0 ? rows.filter((r) => reviewableEntities.includes(r.entity as typeof reviewableEntities[number]) && r.decision !== 'PENDING').length : 0
  const [mobileIndex, setMobileIndex] = useState(0)

  const handleDecide = async (stagingRowId: string, decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP', targetId?: string) => {
    await onDecide(stagingRowId, decision, targetId)
    if (!isDesktop && mobileIndex < pendingRows.length - 1) {
      setMobileIndex((i) => i + 1)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revisar duplicados</CardTitle>
        <p className="text-sm text-muted-foreground">
          {pendingRows.length > 0
            ? `${pendingRows.length} cliente(s) pendiente(s) de decisión`
            : `Todas las filas revisadas (${decidedCount} decididas)`}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isDesktop ? (
          <ReviewTable rows={pendingRows} onDecide={handleDecide} />
        ) : (
          pendingRows.length > 0 ? (
            <ReviewCard
              rowData={{ row: pendingRows[mobileIndex], index: mobileIndex, total: pendingRows.length }}
              onDecide={handleDecide}
            />
          ) : (
            <p className="text-center text-muted-foreground">No hay filas pendientes.</p>
          )
        )}

        {pendingRows.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => {
                for (const row of pendingRows) {
                  onDecide(row.id, 'CREATE_NEW')
                }
              }}
              variant="outline"
            >
              Crear todos
            </Button>
            <Button
              onClick={() => {
                for (const row of pendingRows) {
                  onDecide(row.id, 'SKIP')
                }
              }}
              variant="ghost"
            >
              Omitir todos
            </Button>
          </div>
        )}

        <Button
          onClick={onCommit}
          disabled={pendingRows.length > 0}
          className="w-full"
        >
          Confirmar importación
        </Button>
      </CardContent>
    </Card>
  )
}
