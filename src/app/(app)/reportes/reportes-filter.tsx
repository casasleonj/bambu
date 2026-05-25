'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ReportesFilter({ start, end }: { start: string; end: string }) {
  const router = useRouter()
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(end)

  function apply() {
    if (startDate > endDate) {
      alert('La fecha de inicio no puede ser posterior a la fecha final')
      return
    }
    router.push(`/reportes?start=${startDate}&end=${endDate}`)
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Desde:</label>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Hasta:</label>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>
      <button
        onClick={apply}
        className="px-4 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
      >
        Consultar
      </button>
    </div>
  )
}
