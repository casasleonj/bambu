import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { ImportStagingRow } from '@prisma/client'

export interface ReviewTableProps {
  rows: Array<ImportStagingRow & { contactos: Array<{ id: string; nombre: string; telefono: string; relacion: string | null }> }>
  onDecide: (stagingRowId: string, decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP', targetId?: string) => void
}

export function ReviewTable({ rows, onDecide }: ReviewTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre importado</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Barrio</TableHead>
            <TableHead>Candidato(s)</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const normalized = (row.normalizedJson as Record<string, unknown> | undefined) ?? {}
            const candidates = (row.matchCandidates as Array<{
              targetId: string
              score: number
              reason: string
              target: { nombre: string; telefono?: string | null; barrio?: string | null }
            }> | undefined) ?? []

            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{String(normalized.nombre ?? 'Sin nombre')}</TableCell>
                <TableCell>{String(normalized.telefono ?? '')}</TableCell>
                <TableCell>{String(normalized.barrio ?? '')}</TableCell>
                <TableCell>
                  {candidates.length > 0 ? (
                    <div className="space-y-1">
                      {candidates.slice(0, 2).map((c) => (
                        <div key={c.targetId} className="text-sm">
                          <span className="font-medium">{c.target.nombre}</span>
                          {' '}
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(c.score * 100)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Sin coincidencias</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {candidates[0] && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDecide(row.id, 'MANUAL_MERGE', candidates[0].targetId)}
                      >
                        Fusionar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onDecide(row.id, 'CREATE_NEW')}
                    >
                      Nuevo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDecide(row.id, 'SKIP')}
                    >
                      Omitir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
