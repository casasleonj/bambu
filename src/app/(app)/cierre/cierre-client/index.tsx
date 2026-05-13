'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CierreData } from './types'

export default function CierreClient() {
  const router = useRouter()
  const { data: session } = useSession()
  const { confirm, modal } = useConfirm()
  const [data, setData] = useState<CierreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [yaCerrado, setYaCerrado] = useState(false)
  const [fecha, setFecha] = useState('')
  const [stockIniAgua, setStockIniAgua] = useState(0)
  const [stockIniHielo, setStockIniHielo] = useState(0)
  const [prodAgua, setProdAgua] = useState(0)
  const [prodHielo, setProdHielo] = useState(0)
  const [stockFinAgua, setStockFinAgua] = useState(0)
  const [stockFinHielo, setStockFinHielo] = useState(0)
  const [baseDia, setBaseDia] = useState(0)
  const [comisiones, setComisiones] = useState(0)
  const [salarios, setSalarios] = useState(0)

  const userRole = (session?.user as { role?: string } | undefined)?.role
  const canClose = userRole === 'ADMIN' || userRole === 'ASISTENTE'

  const formatMoney = (val: number) => `$${val.toLocaleString()}`

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setFecha(today)
    fetchCierre(today)
    loadBaseDia(today)
    checkLastCierre(today)
  }, [])

  const loadBaseDia = async (dateStr: string) => {
    try {
      const res = await fetch(`/api/config?clave=BASE_DIA_${dateStr}`)
      if (res.ok) {
        const data = await res.json()
        if (data.config) {
          setBaseDia(Number(data.config.valor))
        }
      }
    } catch {
      // Base not loaded yet, leave at 0
    }
  }

  const checkLastCierre = async (dateStr: string) => {
    try {
      const res = await fetch('/api/cierre/last')
      if (res.ok) {
        const json = await res.json()
        if (json.cierre) {
          const cierreDate = new Date(json.cierre.fecha).toISOString().split('T')[0]
          if (cierreDate === dateStr) {
            setYaCerrado(true)
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  const fetchCierre = async (dateStr: string) => {
    setFetchError(null)
    try {
      const res = await fetch(`/api/cierre?fecha=${dateStr}`)
      const json = await res.json()
      if (json.cierre) {
        setData(json.cierre)
        if (json.cierre.produccion) {
          setProdAgua(json.cierre.produccion.prodAgua || 0)
          setProdHielo(json.cierre.produccion.prodHielo || 0)
          setStockIniAgua(json.cierre.produccion.stockIniAgua || 0)
          setStockIniHielo(json.cierre.produccion.stockIniHielo || 0)
          setStockFinAgua(json.cierre.produccion.stockFinAgua || 0)
          setStockFinHielo(json.cierre.produccion.stockFinHielo || 0)
        }
      }
    } catch {
      setFetchError('No se pudieron cargar los datos del cierre')
      toast.error('Error cargando datos del cierre')
    } finally {
      setLoading(false)
    }
  }

  const calcularNetoCaja = () => {
    const totalCobros = (data?.efectivo || 0) + (data?.transferencia || 0) + (data?.nequi || 0) + (data?.daviplata || 0) + (data?.bono || 0)
    return baseDia + totalCobros - (data?.totalGastos || 0) - comisiones - salarios
  }

  const tieneAlertas = () => {
    if (!data) return []
    const alertas: string[] = []
    if (data.fiado > 0) alertas.push(`Hay $${data.fiado.toLocaleString()} en pedidos fiados`)
    const aguaCalc = stockIniAgua + prodAgua - data.aguaVendida
    const hieloCalc = stockIniHielo + prodHielo - data.hieloVendido
    if (aguaCalc !== stockFinAgua) alertas.push(`Diferencia agua: esperado ${aguaCalc}, registrado ${stockFinAgua}`)
    if (hieloCalc !== stockFinHielo) alertas.push(`Diferencia hielo: esperado ${hieloCalc}, registrado ${stockFinHielo}`)
    return alertas
  }

  const handleCerrar = async () => {
    const ok = await confirm('¿Confirmar cierre del día? Esta acción es irreversible.')
    if (!ok) return
    setCerrando(true)
    try {
      const cierreData = {
        fecha,
        numPedidos: data?.numPedidos || 0,
        totalVentas: data?.totalVentas || 0,
        cobrado: data?.cobrado || 0,
        fiado: data?.fiado || 0,
        efectivo: data?.efectivo || 0,
        transferencia: data?.transferencia || 0,
        nequi: data?.nequi || 0,
        daviplata: data?.daviplata || 0,
        bono: data?.bono || 0,
        baseDia,
        comisiones,
        salarios,
        gastos: data?.totalGastos || 0,
        stockIniAgua,
        prodAgua,
        stockFinAgua,
        stockIniHielo,
        prodHielo,
        stockFinHielo,
        netoCaja: calcularNetoCaja(),
      }
      const res = await fetch('/api/cierre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cierreData),
      })
      const json = await res.json()
      if (res.status === 201 && json.cierre) {
        toast.success('Día cerrado correctamente')
        router.push('/')
      } else {
        toast.error(json.error || 'Error al cerrar')
      }
    } catch {
      toast.error('Error al cerrar')
    } finally {
      setCerrando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>
  }

  const alertas = tieneAlertas()

  if (yaCerrado) {
    return (
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cierre del Día</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen y cierre de operaciones del día</p>
        </div>
        <Card className="border-green-300 bg-green-50/50">
          <CardContent className="p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-xl font-bold text-green-800">Día ya cerrado</h2>
            <p className="text-green-700 mt-1">El cierre para hoy ya fue registrado. No se puede volver a cerrar.</p>
            <Button onClick={() => router.push('/')} className="mt-4">Volver al Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {modal}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cierre del Día</h1>
        <p className="text-sm text-muted-foreground mt-1">Resumen y cierre de operaciones del día</p>
      </div>

      {fetchError && (
        <Card className="border-red-300 bg-red-50/50">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-red-700 text-sm">{fetchError}</p>
            <Button size="sm" variant="destructive" onClick={() => { setLoading(true); fetchCierre(fecha) }}>Reintentar</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Resumen del Día</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><div className="text-sm text-muted-foreground">Pedidos</div><div className="text-xl font-bold">{data?.numPedidos || 0}</div></div>
            <div><div className="text-sm text-muted-foreground">Ventas</div><div className="text-xl font-bold">{formatMoney(data?.totalVentas || 0)}</div></div>
            <div><div className="text-sm text-muted-foreground">Cobrado</div><div className="text-xl font-bold text-green-600">{formatMoney(data?.cobrado || 0)}</div></div>
            <div><div className="text-sm text-muted-foreground">Fiado</div><div className="text-xl font-bold text-orange-600">{formatMoney(data?.fiado || 0)}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Cobros por Método</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div><div className="text-sm text-muted-foreground">Efectivo</div><div className="text-lg font-medium">{formatMoney(data?.efectivo || 0)}</div></div>
            <div><div className="text-sm text-muted-foreground">Transferencia</div><div className="text-lg font-medium">{formatMoney(data?.transferencia || 0)}</div></div>
            <div><div className="text-sm text-muted-foreground">Nequi</div><div className="text-lg font-medium">{formatMoney(data?.nequi || 0)}</div></div>
            <div><div className="text-sm text-muted-foreground">Daviplata</div><div className="text-lg font-medium">{formatMoney(data?.daviplata || 0)}</div></div>
            <div><div className="text-sm text-muted-foreground">Bono</div><div className="text-lg font-medium">{formatMoney(data?.bono || 0)}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Stock: Agua</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-lg mb-3">
            <span className="text-muted-foreground">{stockIniAgua}</span>
            <span className="text-muted-foreground">+ {prodAgua}</span>
            <span className="text-muted-foreground">- {data?.aguaVendida || 0}</span>
            <span className="font-bold">= {stockFinAgua}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Stock Inicial</label>
              <Input type="number" min="0" value={stockIniAgua} onChange={(e) => setStockIniAgua(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Producción</label>
              <Input type="number" min="0" value={prodAgua} onChange={(e) => setProdAgua(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Stock Final</label>
              <Input type="number" min="0" value={stockFinAgua} onChange={(e) => setStockFinAgua(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Stock: Hielo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-lg mb-3">
            <span className="text-muted-foreground">{stockIniHielo}</span>
            <span className="text-muted-foreground">+ {prodHielo}</span>
            <span className="text-muted-foreground">- {data?.hieloVendido || 0}</span>
            <span className="font-bold">= {stockFinHielo}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Stock Inicial</label>
              <Input type="number" min="0" value={stockIniHielo} onChange={(e) => setStockIniHielo(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Producción</label>
              <Input type="number" min="0" value={prodHielo} onChange={(e) => setProdHielo(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Stock Final</label>
              <Input type="number" min="0" value={stockFinHielo} onChange={(e) => setStockFinHielo(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Resumen de Caja</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Base</span>
              <Input type="number" min="0" value={baseDia} onChange={(e) => setBaseDia(Number(e.target.value))} className="w-32 text-right h-8" />
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">+ Efectivo</span><span>{formatMoney(data?.efectivo || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">+ Transferencia</span><span>{formatMoney(data?.transferencia || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">+ Nequi</span><span>{formatMoney(data?.nequi || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">+ Daviplata</span><span>{formatMoney(data?.daviplata || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">+ Bono</span><span>{formatMoney(data?.bono || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">- Gastos</span>
              <span className={data?.totalGastos && data.totalGastos > 0 ? 'text-red-600' : ''}>{data?.totalGastos && data.totalGastos > 0 ? '-' : ''}{formatMoney(data?.totalGastos || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">- Comisiones</span>
              <Input type="number" min="0" value={comisiones} onChange={(e) => setComisiones(Number(e.target.value))} className="w-32 text-right h-8" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">- Salarios</span>
              <Input type="number" min="0" value={salarios} onChange={(e) => setSalarios(Number(e.target.value))} className="w-32 text-right h-8" />
            </div>
            <div className="border-t pt-2 flex justify-between text-lg font-bold">
              <span>Neto Caja</span>
              <span className="text-green-600">{formatMoney(calcularNetoCaja())}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {alertas.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold text-amber-800 mb-2">Alertas</h2>
            <ul className="space-y-1">{alertas.map((alerta, i) => (<li key={i} className="text-amber-700 text-sm">⚠️ {alerta}</li>))}</ul>
          </CardContent>
        </Card>
      )}

      {canClose ? (
        <Button onClick={handleCerrar} disabled={cerrando} className="w-full py-6 text-lg">
          {cerrando ? 'Cerrando...' : 'Cerrar Día'}
        </Button>
      ) : (
        <Card className="bg-muted">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            Solo los administradores y asistentes pueden cerrar el día
          </CardContent>
        </Card>
      )}
    </div>
  )
}
