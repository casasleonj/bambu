import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

interface EmbarqueCardProps {
  id: string
  fecha: string
  turno: 'MANANA' | 'TARDE'
  estado: 'ABIERTO' | 'CERRADO'
  pedidoCount: number
  totalLitros: number
}

export function EmbarqueCard({ id, fecha, turno, estado, pedidoCount, totalLitros }: EmbarqueCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Embarque #{id.slice(0, 8)}</CardTitle>
          <Badge variant={estado === 'ABIERTO' ? 'default' : 'secondary'}>
            {estado}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {formatDate(fecha)} - {turno === 'MANANA' ? 'Mañana' : 'Tarde'}
        </p>
        <p className="mt-2">
          {pedidoCount} pedidos - {totalLitros}L
        </p>
      </CardContent>
    </Card>
  )
}