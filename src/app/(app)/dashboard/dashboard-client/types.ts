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
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  precioPacaAgua: unknown
  precioPacaHielo: unknown
  precioBotellonFab: unknown
  precioBotellonDom: unknown
  precioBolsaAgua: unknown
  precioBolsaHielo: unknown
  total: unknown
  saldo: unknown
  estadoEntrega: string
  fecha: Date | string
}

export interface FranjaHoraria {
  label: string
  range: [number, number]
  count: number
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
  franjas: FranjaHoraria[]
  maxFranja: number
  ventasPorPrecio: VentaPorPrecio[]
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  prodAguaHoy: number
  prodHieloHoy: number
  stockAgua: number
  stockHielo: number
  // stockBotellon eliminado — botellones son passthrough (sin ciclo de stock).
  embarquesAbiertos: number
  stockAlertas: Array<{ id: string; nombre: string; stock: unknown; unidad: string }>
  fechaHoy: string
  alertasRiesgo: {
    disputasAbiertas: number
    clientesBloqueados: number
    clientesConflictivos: number
    promesasProximasVencer: number
    clientesNoVerificados: number
  }
  casosActivos: {
    total: number
    criticos: number
    sinResolver48h: number
  }
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
    if (p.estadoEntrega === 'ANULADO' || p.estadoEntrega === 'CANCELADO') continue
    if (p.cPacaAguaEnt > 0 && Number(p.precioPacaAgua) > 0)
      buckets['Paca Agua'][Number(p.precioPacaAgua)] = (buckets['Paca Agua'][Number(p.precioPacaAgua)] || 0) + p.cPacaAguaEnt
    if (p.cPacaHieloEnt > 0 && Number(p.precioPacaHielo) > 0)
      buckets['Paca Hielo'][Number(p.precioPacaHielo)] = (buckets['Paca Hielo'][Number(p.precioPacaHielo)] || 0) + p.cPacaHieloEnt
    if (p.cBotellonFabEnt > 0 && Number(p.precioBotellonFab) > 0)
      buckets['Botellon Fab'][Number(p.precioBotellonFab)] = (buckets['Botellon Fab'][Number(p.precioBotellonFab)] || 0) + p.cBotellonFabEnt
    if (p.cBotellonDomEnt > 0 && Number(p.precioBotellonDom) > 0)
      buckets['Botellon Dom'][Number(p.precioBotellonDom)] = (buckets['Botellon Dom'][Number(p.precioBotellonDom)] || 0) + p.cBotellonDomEnt
    if (p.cBolsaAguaEnt > 0 && Number(p.precioBolsaAgua) > 0)
      buckets['Bolsa Agua'][Number(p.precioBolsaAgua)] = (buckets['Bolsa Agua'][Number(p.precioBolsaAgua)] || 0) + p.cBolsaAguaEnt
    if (p.cBolsaHieloEnt > 0 && Number(p.precioBolsaHielo) > 0)
      buckets['Bolsa Hielo'][Number(p.precioBolsaHielo)] = (buckets['Bolsa Hielo'][Number(p.precioBolsaHielo)] || 0) + p.cBolsaHieloEnt
  }

  for (const [producto, precios] of Object.entries(buckets)) {
    for (const [precio, cantidad] of Object.entries(precios)) {
      const p = parseFloat(precio)
      ventasPorPrecio.push({ producto, precio: p, cantidad, subtotal: p * cantidad })
    }
  }

  return ventasPorPrecio
}
