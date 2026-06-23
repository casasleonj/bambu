'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listImportBatches } from '@/lib/import/client-api'
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
import type { ImportBatch } from '@prisma/client'

const estadoLabels: Record<ImportBatch['estado'], string> = {
  DRAFT: 'Borrador',
  ANALYZED: 'Analizado',
  COMMITTING: 'Importando',
  COMPLETED: 'Completado',
  FAILED: 'Fallido',
  CANCELLED: 'Cancelado',
}

export default function ImportarHistorialPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listImportBatches()
      .then((res) => setBatches(res.items))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Historial de importaciones</h1>
            <p className="text-sm text-muted-foreground">
              Lotes de importación histórica subidos previamente.
            </p>
          </div>
          <Link href="/dashboard/importar">
            <Button>Nueva importación</Button>
          </Link>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">Cargando...</p>
        ) : batches.length === 0 ? (
          <p className="text-center text-muted-foreground">No hay importaciones aún.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Filas</TableHead>
                  <TableHead>Creados</TableHead>
                  <TableHead>Fusionados</TableHead>
                  <TableHead>Fallidos</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.nombre}</TableCell>
                    <TableCell>
                      <Badge variant={batch.estado === 'COMPLETED' ? 'default' : 'secondary'}>
                        {estadoLabels[batch.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(batch.createdAt).toLocaleDateString('es-CO')}</TableCell>
                    <TableCell>{batch.totalRows}</TableCell>
                    <TableCell>{batch.createdRows}</TableCell>
                    <TableCell>{batch.autoMergedRows}</TableCell>
                    <TableCell>{batch.errorRows}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/importar?batch=${batch.id}`}>
                        <Button size="sm" variant="ghost">
                          Ver
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  )
}
