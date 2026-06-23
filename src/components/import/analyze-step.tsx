import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import type { ImportStagingRow } from '@prisma/client'

export interface AnalyzeStepProps {
  rows: ImportStagingRow[]
  analyzing: boolean
  onAnalyze: () => void
}

export function AnalyzeStep({ rows, analyzing, onAnalyze }: AnalyzeStepProps) {
  const total = rows.length
  const parseErrors = rows.filter((r) => r.parseError).length
  const byEntity = rows.reduce((acc, row) => {
    acc[row.entity] = (acc[row.entity] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen del archivo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Revisá el contenido detectado antes de buscar duplicados.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground uppercase">filas</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold">{parseErrors}</p>
            <p className="text-xs text-muted-foreground uppercase">errores</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold">{Object.keys(byEntity).length}</p>
            <p className="text-xs text-muted-foreground uppercase">hojas</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold">{total - parseErrors}</p>
            <p className="text-xs text-muted-foreground uppercase">válidas</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(byEntity).map(([entity, count]) => (
            <Badge key={entity} variant="secondary">
              {entity}: {count}
            </Badge>
          ))}
        </div>

        {parseErrors > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
            <p className="font-medium text-destructive">Hay {parseErrors} fila(s) con errores de parseo</p>
            <ul className="text-sm text-destructive space-y-1 max-h-48 overflow-y-auto">
              {rows
                .filter((r) => r.parseError)
                .map((r) => (
                  <li key={r.id}>
                    Hoja {r.entity}, fila {r.rowNumber}: {r.parseError}
                  </li>
                ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Corregí el archivo y volvé a subirlo.
            </p>
          </div>
        )}

        <Button
          onClick={onAnalyze}
          disabled={analyzing || parseErrors > 0 || total === 0}
          className="w-full"
        >
          {analyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analizando...
            </>
          ) : (
            'Revisar duplicados'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
