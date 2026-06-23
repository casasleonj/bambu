import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ImportStagingRow } from '@prisma/client'

interface ReviewCardRow {
  row: ImportStagingRow & { contactos: Array<{ id: string; nombre: string; telefono: string; relacion: string | null }> }
  index: number
  total: number
}

export interface ReviewCardProps {
  rowData: ReviewCardRow
  onDecide: (stagingRowId: string, decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP', targetId?: string) => void
}

export function ReviewCard({ rowData, onDecide }: ReviewCardProps) {
  const { row, index, total } = rowData
  const [decided, setDecided] = useState(false)

  const normalized = (row.normalizedJson as Record<string, unknown> | undefined) ?? {}
  const candidates = (row.matchCandidates as Array<{
    targetId: string
    score: number
    reason: string
    target: { nombre: string; telefono?: string | null; barrio?: string | null }
  }> | undefined) ?? []

  const handle = (decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP', targetId?: string) => {
    setDecided(true)
    onDecide(row.id, decision, targetId)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{String(normalized.nombre ?? 'Sin nombre')}</CardTitle>
          <Badge variant="outline">{index + 1} de {total}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {String(normalized.telefono ?? '')} {normalized.barrio ? `· ${String(normalized.barrio)}` : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {candidates.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Posibles coincidencias:</p>
            {candidates.map((c) => (
              <div key={c.targetId} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.target.nombre}</span>
                  <Badge variant={c.score >= 0.9 ? 'default' : 'secondary'}>
                    {Math.round(c.score * 100)}%
                  </Badge>
                </div>
                <p className="text-muted-foreground">{c.reason}</p>
                  <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => handle('MANUAL_MERGE', c.targetId)}
                  disabled={decided}
                >
                  Fusionar con este
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No se encontraron coincidencias.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => handle('CREATE_NEW')}
            disabled={decided}
          >
            Crear nuevo
          </Button>
          <Button
            variant="ghost"
            onClick={() => handle('SKIP')}
            disabled={decided}
          >
            Omitir
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
