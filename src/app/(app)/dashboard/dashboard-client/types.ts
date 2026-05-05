export interface VentaPorPrecio {
  producto: string
  precio: number
  cantidad: number
  subtotal: number
}

export interface PedidoRaw {
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  precioPacaAgua: unknown
  precioPacaHielo: unknown
  precioBotellonFab: unknown
  precioBotellonDom: unknown
  precioBolsaAgua: unknown
  precioBolsaHielo: unknown
  total: unknown
  saldo: unknown
  estado: string
  fecha: Date | string
}

export interface DashboardData {
  pedidos: PedidoRaw[]
  ventas: number
  fiadosHoy: number
  fiadosTotal: number
  clientesConFiado: number | bigint
  pedidosPendientes: number
  pedidosEntregados: number
  baseDia: number
  totalGastos: number
  ventasAyer: number
  ventasTrend: number
  pedidosTrend: number
  hourlyPedidos: number[]
  maxHourly: number
  ventasPorPrecio: VentaPorPrecio[]
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  prodAguaHoy: number
  prodHieloHoy: number
  stockAgua: number
  stockHielo: number
  stockBotellon: number
  embarquesAbiertos: number
  stockAlertas: Array<{ id: string; nombre: string; stock: unknown; unidad: string }>
  fechaHoy: string
}

export function buildVentasPorPrecio(pedidos: PedidoRaw[]): VentaPorPrecio[] {
  const ventasPorPrecio: VentaPorPrecio[] = []
  if (pedidos.length === 0) return ventasPorPrecio

  const buckets: Record<string, Record<number, number>> = {
    'Paca Agua': {},
    'Paca Hielo': {},
    'Botellon Fab': {},
    'Botellon Dom': {},
    'Bolsa Agua': {},
    'Bolsa Hielo': {},
  }

  for (const p of pedidos) {
    if (p.cPacaAguaPed > 0 && Number(p.precioPacaAgua) > 0)
      buckets['Paca Agua'][Number(p.precioPacaAgua)] = (buckets['Paca Agua'][Number(p.precioPacaAgua)] || 0) + p.cPacaAguaPed
    if (p.cPacaHieloPed > 0 && Number(p.precioPacaHielo) > 0)
      buckets['Paca Hielo'][Number(p.precioPacaHielo)] = (buckets['Paca Hielo'][Number(p.precioPacaHielo)] || 0) + p.cPacaHieloPed
    if (p.cBotellonFabPed > 0 && Number(p.precioBotellonFab) > 0)
      buckets['Botellon Fab'][Number(p.precioBotellonFab)] = (buckets['Botellon Fab'][Number(p.precioBotellonFab)] || 0) + p.cBotellonFabPed
    if (p.cBotellonDomPed > 0 && Number(p.precioBotellonDom) > 0)
      buckets['Botellon Dom'][Number(p.precioBotellonDom)] = (buckets['Botellon Dom'][Number(p.precioBotellonDom)] || 0) + p.cBotellonDomPed
    if (p.cBolsaAguaPed > 0 && Number(p.precioBolsaAgua) > 0)
      buckets['Bolsa Agua'][Number(p.precioBolsaAgua)] = (buckets['Bolsa Agua'][Number(p.precioBolsaAgua)] || 0) + p.cBolsaAguaPed
    if (p.cBolsaHieloPed > 0 && Number(p.precioBolsaHielo) > 0)
      buckets['Bolsa Hielo'][Number(p.precioBolsaHielo)] = (buckets['Bolsa Hielo'][Number(p.precioBolsaHielo)] || 0) + p.cBolsaHieloPed
  }

  for (const [producto, precios] of Object.entries(buckets)) {
    for (const [precio, cantidad] of Object.entries(precios)) {
      const p = parseFloat(precio)
      ventasPorPrecio.push({ producto, precio: p, cantidad, subtotal: p * cantidad })
    }
  }

  return ventasPorPrecio
}
