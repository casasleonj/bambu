import { calcularDuracionMin, formatDuracion } from '@/lib/embarque-stats'

interface EmbarqueDurationBadgeProps {
  horaSalida: string | null
  horaLlegada: string | null
  estado: string
}

export function EmbarqueDurationBadge({
  horaSalida,
  horaLlegada,
  estado,
}: EmbarqueDurationBadgeProps) {
  if (estado === 'CANCELADO') return null

  const duracion = calcularDuracionMin(horaSalida, horaLlegada)

  if (!duracion) {
    if (estado === 'CERRADO') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
          <span>⏱</span>
          <span>Sin registro</span>
        </span>
      )
    }
    return null
  }

  // Color coding based on duration
  let colorClass = 'bg-green-100 text-green-800'
  if (duracion > 120) {
    colorClass = 'bg-red-100 text-red-800'
  } else if (duracion > 90) {
    colorClass = 'bg-yellow-100 text-yellow-800'
  } else if (duracion > 60) {
    colorClass = 'bg-blue-100 text-blue-800'
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      <span>⏱</span>
      <span>{formatDuracion(duracion)}</span>
    </span>
  )
}
