'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Stats {
  pedidos: number
  ventas: number
  cobros: number
  gastos: number
  facturasPendientes: number
}

export default function ReportesPage() {
  const [stats, setStats] = useState<Stats>({
    pedidos: 0, ventas: 0, cobros: 0, gastos: 0, facturasPendientes: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const [pedidosRes, facturasRes, abonosRes, gastosRes] = await Promise.all([
        fetch('/api/pedidos?all=true'),
        fetch('/api/facturas?pendiente=true'),
        fetch('/api/abonos'),
        fetch('/api/gastos'),
      ])

      const pedidos = await pedidosRes.json()
      const facturas = await facturasRes.json()
      const abonos = await abonosRes.json()
      const gastos = await gastosRes.json()

      const pedidosData = pedidos.pedidos || []
      const abonosData = abonos.abonos || []
      const gastosData = gastos.gastos || []

      setStats({
        pedidos: pedidosData.length,
        ventas: pedidosData.reduce((s: number, p: any) => s + (p.total || 0), 0),
        cobros: abonosData.reduce((s: number, a: any) => s + (a.monto || 0), 0),
        gastos: gastosData.reduce((s: number, g: any) => s + (g.monto || 0), 0),
        facturasPendientes: (facturas.facturas || []).length,
      })
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const balance = stats.cobros - stats.gastos

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📊 Reportes</h1>
        <button className="px-3 py-1 border rounded" onClick={fetchStats}>
          🔄 Actualizar
        </button>
      </div>

      <Card className="bg-muted">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold">{stats.pedidos}</div>
              <div className="text-sm text-muted-foreground">Pedidos</div>
            </div>
            <div>
              <div className="text-3xl font-bold">${stats.ventas.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Ventas</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600">${stats.cobros.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Cobros</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-600">${stats.gastos.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Gastos</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance del Día</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Ingresos (Cobros)</span>
              <span className="font-medium text-green-600">+${stats.cobros.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Egresos (Gastos)</span>
              <span className="font-medium text-red-600">-${stats.gastos.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Balance Neto</span>
              <span className={balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                ${balance.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.facturasPendientes}
            </div>
            <div className="text-sm text-muted-foreground">Facturas por cobrar</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ventas vs Cobros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Ventas:</span>
                <span>${stats.ventas.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Cobrado:</span>
                <span className="text-green-600">${stats.cobros.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Pendiente:</span>
                <span className="text-yellow-600">
                  ${(stats.ventas - stats.cobros).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}