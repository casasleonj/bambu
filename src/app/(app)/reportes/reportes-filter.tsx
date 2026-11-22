'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { FechaColombia } from '@/components/ui/fecha-colombia'

export function ReportesFilter({ start, end }: { start: string; end: string }) {
  const router = useRouter()
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(end)
  const [error, setError] = useState<string | null>(null)

  function apply() {
    if (!startDate || !endDate) {
      setError('Selecciona las dos fechas para consultar el reporte.')
      return
    }
    if (startDate > endDate) {
      setError('La fecha de inicio no puede ser posterior a la fecha final.')
      return
    }
    setError(null)
    router.push(`/reportes?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="reporte-desde">Desde</Label>
          <FechaColombia id="reporte-desde" value={startDate} onChange={v => { setStartDate(v); setError(null) }} required />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="reporte-hasta">Hasta</Label>
          <FechaColombia id="reporte-hasta" value={endDate} onChange={v => { setEndDate(v); setError(null) }} required />
        </div>
        <Button type="button" onClick={apply}>Consultar</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  )
}
