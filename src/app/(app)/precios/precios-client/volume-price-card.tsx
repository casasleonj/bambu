import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { Producto, PrecioVolumen } from './types'
import { formatCOP, tierLabel } from './types'

interface VolumePriceCardProps {
  producto: Producto
  editingId: string | null
  editValue: string
  saving: boolean
  getPrice: (p: PrecioVolumen) => number
  startEdit: (p: PrecioVolumen) => void
  cancelEdit: () => void
  savePrice: (id: string) => Promise<void>
  setEditValue: (v: string) => void
}

export function VolumePriceCard({
  producto,
  editingId,
  editValue,
  saving,
  getPrice,
  startEdit,
  cancelEdit,
  savePrice,
  setEditValue,
}: VolumePriceCardProps) {
  const canales = new Map<string, PrecioVolumen[]>()
  for (const p of producto.precios) {
    const existing = canales.get(p.canal) || []
    existing.push(p)
    canales.set(p.canal, existing)
  }

  const allTiers: { cantMin: number; cantMax: number | null; label: string }[] = []
  const seenTiers = new Set<string>()
  for (const prices of canales.values()) {
    for (const p of prices) {
      const label = tierLabel(p.cantMin, p.cantMax)
      if (!seenTiers.has(label)) {
        seenTiers.add(label)
        allTiers.push({ cantMin: p.cantMin, cantMax: p.cantMax, label })
      }
    }
  }
  allTiers.sort((a, b) => a.cantMin - b.cantMin)

  const canalNames = Array.from(canales.keys()).sort()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {producto.nombre}
          {producto.contenido && (
            <span className="text-gray-500 text-sm font-normal ml-2">
              ({producto.contenido})
            </span>
          )}
        </CardTitle>
        {producto.descripcion && (
          <p className="text-sm text-gray-500">{producto.descripcion}</p>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              {allTiers.map((tier) => (
                <TableHead key={tier.label} className="text-center">
                  {tier.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {canalNames.map((canal) => {
              const prices = canales.get(canal) || []
              return (
                <TableRow key={canal}>
                  <TableCell className="font-medium">{canal}</TableCell>
                  {allTiers.map((tier) => {
                    const precio = prices.find(
                      (p) => p.cantMin === tier.cantMin && p.cantMax === tier.cantMax
                    )
                    if (!precio) {
                      return (
                        <TableCell key={tier.label} className="text-center text-gray-300">
                          --
                        </TableCell>
                      )
                    }
                    return (
                      <TableCell key={tier.label} className="text-center">
                        {editingId === precio.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 text-right"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePrice(precio.id)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => savePrice(precio.id)}
                              disabled={saving}
                            >
                              {saving ? '...' : 'OK'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              X
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="font-semibold text-blue-600 hover:underline cursor-pointer"
                            onClick={() => startEdit(precio)}
                            title="Clic para editar"
                          >
                            {formatCOP(getPrice(precio))}
                          </button>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
