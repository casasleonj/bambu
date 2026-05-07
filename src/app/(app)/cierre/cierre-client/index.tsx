'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import type { CierreData } from './types'

export default function CierreClient() {
  const router = useRouter()
  const { confirm, modal } = useConfirm()
  const [data, setData] = useState<CierreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [stockIniAgua, setStockIniAgua] = useState(0)
  const [stockIniHielo, setStockIniHielo] = useState(0)
  const [prodAgua, setProdAgua] = useState(0)
  const [prodHielo, setProdHielo] = useState(0)
  const [stockFinAgua, setStockFinAgua] = useState(0)
  const [stockFinHielo, setStockFinHielo] = useState(0)
  const [baseDia, setBaseDia] = useState(50000)
  const [comisiones, setComisiones] = useState(0)

  const formatMoney = (val: number) => `$${val.toLocaleString()}`

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) {
      const userData = JSON.parse(user)
      setIsAdmin(userData.rol === 'ADMIN')
    }
    fetchCierre()
  }, [])

  const fetchCierre = async () => {
    setFetchError(null)
    try {
      const res = await fetch('/api/cierre')
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
    return baseDia + totalCobros - (data?.totalGastos || 0) - comisiones
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
    const ok = await confirm('¿Confirmar cierre del día?')
    if (!ok) return
    setCerrando(true)
    try {
      const cierreData = {
        numPedidos: data?.numPedidos || 0, totalVentas: data?.totalVentas || 0, cobrado: data?.cobrado || 0,
        fiado: data?.fiado || 0, efectivo: data?.efectivo || 0, transferencia: data?.transferencia || 0,
        nequi: data?.nequi || 0, daviplata: data?.daviplata || 0, bono: data?.bono || 0,
        baseDia, comisiones, salarios: 0, gastos: data?.totalGastos || 0,
        stockIniAgua, prodAgua, stockFinAgua, stockIniHielo, prodHielo, stockFinHielo,
        netoCaja: calcularNetoCaja(),
      }
      const res = await fetch('/api/cierre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cierreData) })
      const json = await res.json()
      if (json.success) { toast.success('Día cerrado correctamente'); router.push('/') }
      else toast.error('Error al cerrar')
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

  return (
    <div className="space-y-6">
      {modal}
      <h1 className="text-2xl font-bold">Cierre del Día</h1>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-red-700 text-sm">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); fetchCierre() }}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">Resumen del Día</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><div className="text-sm text-gray-500">Pedidos</div><div className="text-xl font-bold">{data?.numPedidos || 0}</div></div>
          <div><div className="text-sm text-gray-500">Ventas</div><div className="text-xl font-bold">{formatMoney(data?.totalVentas || 0)}</div></div>
          <div><div className="text-sm text-gray-500">Cobrado</div><div className="text-xl font-bold text-green-600">{formatMoney(data?.cobrado || 0)}</div></div>
          <div><div className="text-sm text-gray-500">Fiado</div><div className="text-xl font-bold text-orange-600">{formatMoney(data?.fiado || 0)}</div></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">Cobros por Metodo</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div><div className="text-sm text-gray-500">Efectivo</div><div className="text-lg font-medium">{formatMoney(data?.efectivo || 0)}</div></div>
          <div><div className="text-sm text-gray-500">Transferencia</div><div className="text-lg font-medium">{formatMoney(data?.transferencia || 0)}</div></div>
          <div><div className="text-sm text-gray-500">Nequi</div><div className="text-lg font-medium">{formatMoney(data?.nequi || 0)}</div></div>
          <div><div className="text-sm text-gray-500">Daviplata</div><div className="text-lg font-medium">{formatMoney(data?.daviplata || 0)}</div></div>
          <div><div className="text-sm text-gray-500">Bono</div><div className="text-lg font-medium">{formatMoney(data?.bono || 0)}</div></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">Stock: Agua</h2>
        <div className="flex items-center justify-between text-lg">
          <span className="text-gray-600">{stockIniAgua}</span><span className="text-gray-400">+ {prodAgua}</span>
          <span className="text-gray-400">- {data?.aguaVendida || 0}</span><span className="font-bold">= {stockFinAgua}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <input type="number" placeholder="Stock Inicial" value={stockIniAgua} onChange={(e) => setStockIniAgua(Number(e.target.value))} className="border rounded px-2 py-1" />
          <input type="number" placeholder="Produccion" value={prodAgua} onChange={(e) => setProdAgua(Number(e.target.value))} className="border rounded px-2 py-1" />
          <input type="number" placeholder="Stock Final" value={stockFinAgua} onChange={(e) => setStockFinAgua(Number(e.target.value))} className="border rounded px-2 py-1" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">Stock: Hielo</h2>
        <div className="flex items-center justify-between text-lg">
          <span className="text-gray-600">{stockIniHielo}</span><span className="text-gray-400">+ {prodHielo}</span>
          <span className="text-gray-400">- {data?.hieloVendido || 0}</span><span className="font-bold">= {stockFinHielo}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <input type="number" placeholder="Stock Inicial" value={stockIniHielo} onChange={(e) => setStockIniHielo(Number(e.target.value))} className="border rounded px-2 py-1" />
          <input type="number" placeholder="Produccion" value={prodHielo} onChange={(e) => setProdHielo(Number(e.target.value))} className="border rounded px-2 py-1" />
          <input type="number" placeholder="Stock Final" value={stockFinHielo} onChange={(e) => setStockFinHielo(Number(e.target.value))} className="border rounded px-2 py-1" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">Resumen de Caja</h2>
        <div className="space-y-2">
          <div className="flex justify-between"><span className="text-gray-600">Base</span>
            <input type="number" value={baseDia} onChange={(e) => setBaseDia(Number(e.target.value))} className="border rounded px-2 py-1 w-32 text-right" />
          </div>
          <div className="flex justify-between"><span className="text-gray-600">+ Efectivo</span><span>{formatMoney(data?.efectivo || 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">+ Transferencia</span><span>{formatMoney(data?.transferencia || 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">+ Nequi</span><span>{formatMoney(data?.nequi || 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">+ Daviplata</span><span>{formatMoney(data?.daviplata || 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">+ Bono</span><span>{formatMoney(data?.bono || 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">- Gastos</span>
            <span className={data?.totalGastos && data.totalGastos > 0 ? 'text-red-600' : ''}>{data?.totalGastos && data.totalGastos > 0 ? '-' : ''}{formatMoney(data?.totalGastos || 0)}</span>
          </div>
          <div className="flex justify-between"><span className="text-gray-600">- Comisiones</span>
            <input type="number" value={comisiones} onChange={(e) => setComisiones(Number(e.target.value))} className="border rounded px-2 py-1 w-32 text-right" />
          </div>
          <div className="border-t pt-2 flex justify-between text-lg font-bold"><span>Neto Caja</span><span className="text-green-600">{formatMoney(calcularNetoCaja())}</span></div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-orange-800 mb-2">Alertas</h2>
          <ul className="space-y-1">{alertas.map((alerta, i) => (<li key={i} className="text-orange-700">⚠️ {alerta}</li>))}</ul>
        </div>
      )}

      {isAdmin && (
        <button onClick={handleCerrar} disabled={cerrando}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
          {cerrando ? 'Cerrando...' : 'Cerrar Día'}
        </button>
      )}
    </div>
  )
}
