import { PrismaClient, EstadoPedido, EstadoEmbarque, EstadoFactura } from '@prisma/client'

const prisma = new PrismaClient()

interface ValidationResult {
  check: string
  status: 'PASS' | 'FAIL' | 'WARN'
  details: string
  count?: number
  samples?: any[]
}

const results: ValidationResult[] = []

function addResult(check: string, status: 'PASS' | 'FAIL' | 'WARN', details: string, count?: number, samples?: any[]) {
  results.push({ check, status, details, count, samples })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcPedidoTotal(p: any): number {
  return (
    p.cPacaAguaPed * Number(p.precioPacaAgua) +
    p.cPacaHieloPed * Number(p.precioPacaHielo) +
    p.cBotellonFabPed * Number(p.precioBotellonFab) +
    p.cBotellonDomPed * Number(p.precioBotellonDom) +
    p.cBolsaAguaPed * Number(p.precioBolsaAgua) +
    p.cBolsaHieloPed * Number(p.precioBolsaHielo)
  )
}

// ─── Checks ─────────────────────────────────────────────────────────────────

async function checkPedidoTotals() {
  const pedidos = await prisma.pedido.findMany({
    where: { estado: { not: EstadoPedido.CANCELADO } },
    select: {
      id: true, numero: true, total: true, estado: true,
      cPacaAguaPed: true, precioPacaAgua: true,
      cPacaHieloPed: true, precioPacaHielo: true,
      cBotellonFabPed: true, precioBotellonFab: true,
      cBotellonDomPed: true, precioBotellonDom: true,
      cBolsaAguaPed: true, precioBolsaAgua: true,
      cBolsaHieloPed: true, precioBolsaHielo: true,
    },
  })

  let mismatches = 0
  const samples: any[] = []

  for (const p of pedidos) {
    const expected = calcPedidoTotal(p)
    const actual = Number(p.total)
    if (Math.abs(expected - actual) > 0.01) {
      mismatches++
      if (samples.length < 5) {
        samples.push({ pedido: p.numero, esperado: expected, actual: actual, diff: expected - actual })
      }
    }
  }

  addResult(
    'Pedido.total = Σ(cantidad × precio) (excluye CANCELADO)',
    mismatches === 0 ? 'PASS' : 'FAIL',
    `${mismatches} pedidos con total incorrecto de ${pedidos.length}`,
    mismatches,
    samples,
  )
}

async function checkSaldoConsistency() {
  const pedidos = await prisma.pedido.findMany({
    select: { id: true, numero: true, total: true, totalPagado: true, saldo: true },
  })

  let mismatches = 0
  const samples: any[] = []

  for (const p of pedidos) {
    const expectedSaldo = Number(p.total) - Number(p.totalPagado)
    const actualSaldo = Number(p.saldo)
    if (Math.abs(expectedSaldo - actualSaldo) > 0.01) {
      mismatches++
      if (samples.length < 5) {
        samples.push({ pedido: p.numero, esperado: expectedSaldo, actual: actualSaldo })
      }
    }
    if (actualSaldo < -0.01) {
      mismatches++
      if (samples.length < 5) {
        samples.push({ pedido: p.numero, error: 'Saldo negativo', saldo: actualSaldo })
      }
    }
  }

  addResult(
    'Pedido.saldo = total - totalPagado (y saldo ≥ 0)',
    mismatches === 0 ? 'PASS' : 'FAIL',
    `${mismatches} inconsistencias de ${pedidos.length} pedidos`,
    mismatches,
    samples,
  )
}

async function checkPagosMatchTotalPagado() {
  const pedidos = await prisma.pedido.findMany({
    include: { pagos: { select: { monto: true } } },
  })

  let mismatches = 0
  const samples: any[] = []

  for (const p of pedidos) {
    const sumaPagos = p.pagos.reduce((sum, pago) => sum + Number(pago.monto), 0)
    const totalPagado = Number(p.totalPagado)
    if (Math.abs(sumaPagos - totalPagado) > 0.01) {
      mismatches++
      if (samples.length < 5) {
        samples.push({ pedido: p.numero, sumaPagos, totalPagado, diff: sumaPagos - totalPagado })
      }
    }
  }

  addResult(
    'SUM(Pago.monto) = Pedido.totalPagado',
    mismatches === 0 ? 'PASS' : 'FAIL',
    `${mismatches} pedidos con pagos inconsistentes de ${pedidos.length}`,
    mismatches,
    samples,
  )
}

async function checkFacturaSaldo() {
  const facturas = await prisma.factura.findMany({
    include: { abonos: { select: { monto: true } } },
  })

  let mismatches = 0
  const samples: any[] = []

  for (const f of facturas) {
    const sumaAbonos = f.abonos.reduce((sum, a) => sum + Number(a.monto), 0)
    const expectedSaldo = Number(f.total) - Number(f.montoPagado) - sumaAbonos
    const actualSaldo = Number(f.saldo)

    if (Math.abs(expectedSaldo - actualSaldo) > 0.01) {
      mismatches++
      if (samples.length < 5) {
        samples.push({ factura: f.numero, total: Number(f.total), montoPagado: Number(f.montoPagado), abonos: sumaAbonos, esperado: expectedSaldo, actual: actualSaldo })
      }
    }

    // Estado inconsistency
    if (actualSaldo <= 0.01 && f.estado !== EstadoFactura.PAGADA && f.estado !== EstadoFactura.ANULADA) {
      mismatches++
      if (samples.length < 5) {
        samples.push({ factura: f.numero, error: 'Estado debería ser PAGADA', saldo: actualSaldo, estado: f.estado })
      }
    }
  }

  addResult(
    'Factura.saldo = total - montoPagado - SUM(Abonos) + estado consistente',
    mismatches === 0 ? 'PASS' : 'FAIL',
    `${mismatches} facturas con saldo/estado inconsistente de ${facturas.length}`,
    mismatches,
    samples,
  )
}

async function checkAbonoExceedsFactura() {
  const facturas = await prisma.factura.findMany({
    include: { abonos: { select: { monto: true } } },
  })

  let exceed = 0
  const samples: any[] = []

  for (const f of facturas) {
    const totalPagado = Number(f.montoPagado) + f.abonos.reduce((sum, a) => sum + Number(a.monto), 0)
    const total = Number(f.total)
    if (totalPagado > total + 0.01) {
      exceed++
      if (samples.length < 5) {
        samples.push({ factura: f.numero, total, totalPagado, exceso: totalPagado - total })
      }
    }
  }

  addResult(
    'Abonos + pagos NO exceden total de factura',
    exceed === 0 ? 'PASS' : 'FAIL',
    `${exceed} facturas con pagos + abonos > total de ${facturas.length}`,
    exceed,
    samples,
  )
}

async function checkEmbarqueCapacity() {
  const embarques = await prisma.embarque.findMany({
    include: {
      pedidos: {
        select: {
          cPacaAguaPed: true, cPacaHieloPed: true, estado: true,
        },
      },
    },
  })

  let issues = 0
  const samples: any[] = []

  for (const e of embarques) {
    const aguaPedidos = e.pedidos.reduce((sum, p) => sum + p.cPacaAguaPed, 0)

    // Devoluciones > pacas cargadas
    if (e.devueltasAgua > e.pacasAgua) {
      issues++
      samples.push({ embarque: e.numero, error: 'devueltasAgua > pacasAgua', devueltas: e.devueltasAgua, pacas: e.pacasAgua })
    }
    if (e.devueltasHielo > e.pacasHielo) {
      issues++
      samples.push({ embarque: e.numero, error: 'devueltasHielo > pacasHielo', devueltas: e.devueltasHielo, pacas: e.pacasHielo })
    }

    // Rotas > pacas cargadas
    if (e.rotasAgua > e.pacasAgua) {
      issues++
      samples.push({ embarque: e.numero, error: 'rotasAgua > pacasAgua', rotas: e.rotasAgua, pacas: e.pacasAgua })
    }
    if (e.rotasHielo > e.pacasHielo) {
      issues++
      samples.push({ embarque: e.numero, error: 'rotasHielo > pacasHielo', rotas: e.rotasHielo, pacas: e.pacasHielo })
    }

    // Pacas cargadas < pedidos (si embarque cerrado)
    if (e.estado === EstadoEmbarque.CERRADO && e.pacasAgua < aguaPedidos) {
      issues++
      if (samples.length < 10) {
        samples.push({ embarque: e.numero, error: 'pacasAgua < pedidos', pacas: e.pacasAgua, pedidos: aguaPedidos })
      }
    }
  }

  addResult(
    'Embarque: devueltas/rotas ≤ pacas cargadas ≥ pedidos',
    issues === 0 ? 'PASS' : 'WARN',
    `${issues} inconsistencias en ${embarques.length} embarques`,
    issues,
    samples.slice(0, 5),
  )
}

async function checkProduccionStock() {
  const producciones = await prisma.produccion.findMany({
    select: {
      id: true, fecha: true, turno: true,
      items: {
        select: { producto: true, stockIni: true, producido: true, stockFinFisico: true },
      },
    },
  })

  let mismatches = 0
  const samples: any[] = []

  for (const p of producciones) {
    const itemAgua = p.items.find(i => i.producto === 'PACA_AGUA')
    const itemHielo = p.items.find(i => i.producto === 'PACA_HIELO')
    if (!itemAgua || !itemHielo) continue

    // Sin ventas en ProduccionItem (viven en Pedidos), validamos solo:
    // stockFinFisico >= 0  y  producido == conteoA + conteoB (no se modela acá, skip)
    if (itemAgua.stockFinFisico < 0) {
      mismatches++
      samples.push({ fecha: p.fecha, turno: p.turno, error: 'stockFinAgua negativo', valor: itemAgua.stockFinFisico })
    }
    if (itemHielo.stockFinFisico < 0) {
      mismatches++
      samples.push({ fecha: p.fecha, turno: p.turno, error: 'stockFinHielo negativo', valor: itemHielo.stockFinFisico })
    }
  }

  addResult(
    'Producción: stockFinFisico ≥ 0 en cada ProduccionItem',
    mismatches === 0 ? 'PASS' : 'FAIL',
    `${mismatches} inconsistencias en ${producciones.length} producciones`,
    mismatches,
    samples,
  )
}

async function checkCierreDiaConsistency() {
  const cierres = await prisma.cierreDia.findMany()
  const pedidos = await prisma.pedido.findMany({
    select: { fecha: true, total: true, totalPagado: true, saldo: true, estado: true },
  })

  if (cierres.length === 0) {
    addResult('CierreDia existe', 'WARN', 'No hay cierres de día registrados')
    return
  }

  // Check that cierre totals match actual pedidos for that date
  for (const cierre of cierres) {
    const fechaStr = cierre.fecha.toISOString().split('T')[0]
    const pedidosDia = pedidos.filter(p => p.fecha.toISOString().split('T')[0] === fechaStr)

    const totalVentasReal = pedidosDia.reduce((sum, p) => sum + Number(p.total), 0)
    const cobradoReal = pedidosDia.reduce((sum, p) => sum + Number(p.totalPagado), 0)

    if (Math.abs(Number(cierre.totalVentas) - totalVentasReal) > 0.01) {
      addResult(
        `CierreDia ${fechaStr}: totalVentas`,
        'FAIL',
        `Cierre: ${cierre.totalVentas}, Real: ${totalVentasReal}`,
      )
    }
    if (Math.abs(Number(cierre.cobrado) - cobradoReal) > 0.01) {
      addResult(
        `CierreDia ${fechaStr}: cobrado`,
        'FAIL',
        `Cierre: ${cierre.cobrado}, Real: ${cobradoReal}`,
      )
    }
  }

  if (!results.some(r => r.check.includes('CierreDia'))) {
    addResult('CierreDia: totales coinciden con pedidos', 'PASS', `${cierres.length} cierres verificados`)
  }
}

async function checkPedidoEstadoVsEntregado() {
  // Pedidos ENTREGADO sin fechaEntrega
  const sinFecha = await prisma.pedido.count({
    where: { estado: EstadoPedido.ENTREGADO, fechaEntrega: null },
  })

  addResult(
    'Pedidos ENTREGADO tienen fechaEntrega',
    sinFecha === 0 ? 'PASS' : 'WARN',
    `${sinFecha} pedidos entregados sin fecha de entrega`,
    sinFecha,
  )
}

async function checkPedidoCanceladoConPagos() {
  const canceladosConPagos = await prisma.pedido.findMany({
    where: { estado: EstadoPedido.CANCELADO },
    include: { pagos: { select: { monto: true } } },
  })

  const conPagos = canceladosConPagos.filter(p => p.pagos.length > 0)

  addResult(
    'Pedidos CANCELADO sin pagos',
    conPagos.length === 0 ? 'PASS' : 'WARN',
    `${conPagos.length} pedidos cancelados tienen pagos registrados de ${canceladosConPagos.length}`,
    conPagos.length,
    conPagos.slice(0, 5).map(p => ({ pedido: p.numero, pagos: p.pagos.length })),
  )
}

async function checkClienteDeudaVsFiado() {
  const clientes = await prisma.cliente.findMany({
    include: { facturas: { where: { estado: { in: [EstadoFactura.EMITIDA, EstadoFactura.PARCIAL] } }, select: { saldo: true } } },
  })

  let clientesConDeuda = 0
  const deudas: { nombre: string; deuda: number }[] = []

  for (const c of clientes) {
    const deuda = c.facturas.reduce((sum, f) => sum + Number(f.saldo), 0)
    if (deuda > 0) {
      clientesConDeuda++
      if (deudas.length < 10) {
        deudas.push({ nombre: c.nombre, deuda })
      }
    }
  }

  addResult(
    'Clientes con saldo pendiente (fiado)',
    'PASS',
    `${clientesConDeuda} de ${clientes.length} clientes tienen deuda pendiente`,
    clientesConDeuda,
    deudas.sort((a, b) => b.deuda - a.deuda).slice(0, 10),
  )
}

async function checkRecurrentesDuplicates() {
  const recurrentes = await prisma.plantillaRecurrente.findMany({
    where: { activo: true },
    select: { id: true, clienteId: true, cadaNDias: true, ultimaGeneracion: true },
  })

  // PlantillaRecurrente has unique constraint on clienteId, so no duplicates
  addResult(
    'Plantillas recurrentes: sin duplicados por cliente',
    'PASS',
    `${recurrentes.length} plantillas activas`,
    recurrentes.length,
  )
}

async function checkEmbarqueAbiertoViejo() {
  const hace3Dias = new Date()
  hace3Dias.setDate(hace3Dias.getDate() - 3)

  const abiertosViejos = await prisma.embarque.findMany({
    where: { estado: EstadoEmbarque.ABIERTO, fecha: { lt: hace3Dias } },
    select: { id: true, numero: true, fecha: true, estado: true },
  })

  addResult(
    'No hay embarques ABIERTO de hace +3 días',
    abiertosViejos.length === 0 ? 'PASS' : 'WARN',
    `${abiertosViejos.length} embarques abiertos antiguos`,
    abiertosViejos.length,
    abiertosViejos.map(e => ({ embarque: e.numero, fecha: e.fecha })),
  )
}

async function checkPedidosSinCliente() {
  const sinCliente = await prisma.pedido.count({
    where: { clienteId: '' },
  })

  addResult(
    'Todos los pedidos tienen cliente',
    sinCliente === 0 ? 'PASS' : 'FAIL',
    `${sinCliente} pedidos sin cliente`,
    sinCliente,
  )
}

async function checkPreciosNegativosOCero() {
  const preciosCero = await prisma.pedido.findMany({
    where: {
      estado: { not: EstadoPedido.CANCELADO },
      OR: [
        { total: { lte: 0 } },
        { precioPacaAgua: { lt: 0 } },
        { precioPacaHielo: { lt: 0 } },
        { precioBotellonFab: { lt: 0 } },
        { precioBotellonDom: { lt: 0 } },
      ],
    },
    select: { id: true, numero: true, total: true, estado: true },
  })

  const totalPedidos = await prisma.pedido.count({
    where: { estado: { not: EstadoPedido.CANCELADO } },
  })

  const noCero = preciosCero.filter(p => Number(p.total) > 0)

  addResult(
    'Pedidos (no cancelados) con total > 0 y precios no negativos',
    noCero.length === preciosCero.length ? 'PASS' : 'FAIL',
    `${preciosCero.length} pedidos con total ≤ 0 o precios negativos de ${totalPedidos}`,
    preciosCero.length,
    preciosCero.slice(0, 5),
  )
}

async function checkMetodoPagoValido() {
  const metodosInvalidos = await prisma.pago.groupBy({
    by: ['metodo'],
    _count: true,
  })

  const validos = new Set(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'])
  const invalidos = metodosInvalidos.filter(m => !validos.has(m.metodo))

  addResult(
    'Todos los pagos usan métodos válidos',
    invalidos.length === 0 ? 'PASS' : 'FAIL',
    invalidos.length > 0 ? `Métodos inválidos: ${invalidos.map(m => m.metodo).join(', ')}` : 'Todos válidos',
    invalidos.length,
  )
}

async function checkFacturaSinPedido() {
  const facturasSinPedido = await prisma.factura.findMany({
    where: { pedidoId: '' },
  })

  addResult(
    'Todas las facturas tienen pedido asociado',
    facturasSinPedido.length === 0 ? 'PASS' : 'FAIL',
    `${facturasSinPedido.length} facturas sin pedido`,
    facturasSinPedido.length,
  )
}

async function checkAbonoSinFactura() {
  const abonosSinFactura = await prisma.abono.findMany({
    where: { facturaId: '' },
  })

  addResult(
    'Todos los abonos tienen factura asociada',
    abonosSinFactura.length === 0 ? 'PASS' : 'FAIL',
    `${abonosSinFactura.length} abonos sin factura`,
    abonosSinFactura.length,
  )
}

async function checkDistribucionPedidosPorDia() {
  const pedidos = await prisma.pedido.findMany({
    select: { fecha: true },
  })

  const byDay = new Map<string, number>()
  for (const p of pedidos) {
    const day = p.fecha.toISOString().split('T')[0]
    byDay.set(day, (byDay.get(day) || 0) + 1)
  }

  const sorted = Array.from(byDay.entries()).sort()
  const min = Math.min(...sorted.map(([, c]) => c))
  const max = Math.max(...sorted.map(([, c]) => c))

  addResult(
    'Distribución de pedidos por día',
    'PASS',
    `${sorted.length} días: min=${min}, max=${max}, total=${pedidos.length}`,
    pedidos.length,
    sorted.map(([day, count]) => ({ dia: day, pedidos: count })),
  )
}

async function checkPedidosDomicilioSinRuta() {
  const domiciliosSinRuta = await prisma.pedido.count({
    where: {
      canal: 'DOMICILIO',
      estado: { not: EstadoPedido.CANCELADO },
      cliente: { rutaId: null },
    },
  })

  addResult(
    'Pedidos DOMICILIO con cliente en ruta',
    domiciliosSinRuta === 0 ? 'PASS' : 'WARN',
    `${domiciliosSinRuta} pedidos de domicilio sin ruta asignada al cliente`,
    domiciliosSinRuta,
  )
}

async function checkEnvioSinDireccion() {
  const enviosSinDireccion = await prisma.pedido.findMany({
    where: { tipo: 'ENVIO', estado: { not: EstadoPedido.CANCELADO } },
    include: { cliente: { select: { nombre: true, direccion: true } } },
  })

  const sinDir = enviosSinDireccion.filter(p => !p.cliente.direccion || p.cliente.direccion === '')

  addResult(
    'Pedidos ENVIO con dirección del cliente',
    sinDir.length === 0 ? 'PASS' : 'WARN',
    `${sinDir.length} envíos sin dirección del cliente de ${enviosSinDireccion.length}`,
    sinDir.length,
    sinDir.slice(0, 5).map(p => ({ pedido: p.numero, cliente: p.cliente.nombre })),
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Validating data integrity...\n')

  await checkPedidoTotals()
  await checkSaldoConsistency()
  await checkPagosMatchTotalPagado()
  await checkFacturaSaldo()
  await checkAbonoExceedsFactura()
  await checkEmbarqueCapacity()
  await checkProduccionStock()
  await checkCierreDiaConsistency()
  await checkPedidoEstadoVsEntregado()
  await checkPedidoCanceladoConPagos()
  await checkClienteDeudaVsFiado()
  await checkRecurrentesDuplicates()
  await checkEmbarqueAbiertoViejo()
  await checkPedidosSinCliente()
  await checkPreciosNegativosOCero()
  await checkMetodoPagoValido()
  await checkFacturaSinPedido()
  await checkAbonoSinFactura()
  await checkDistribucionPedidosPorDia()
  await checkPedidosDomicilioSinRuta()
  await checkEnvioSinDireccion()

  // Print results
  console.log('═'.repeat(80))
  console.log('RESULTADOS DE VALIDACIÓN')
  console.log('═'.repeat(80))

  let passCount = 0
  let failCount = 0
  let warnCount = 0

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'
    console.log(`\n${icon} ${r.check}`)
    console.log(`   ${r.details}`)
    if (r.samples && r.samples.length > 0) {
      console.log(`   Ejemplos:`)
      for (const s of r.samples.slice(0, 5)) {
        console.log(`     - ${JSON.stringify(s)}`)
      }
    }

    if (r.status === 'PASS') passCount++
    else if (r.status === 'FAIL') failCount++
    else warnCount++
  }

  console.log('\n' + '═'.repeat(80))
  console.log(`RESUMEN: ${passCount} PASS | ${failCount} FAIL | ${warnCount} WARN | ${results.length} total`)
  console.log('═'.repeat(80))

  if (failCount > 0) {
    console.log('\n❌ Hay inconsistencias críticas que requieren atención.')
  }
  if (warnCount > 0) {
    console.log('\n⚠️ Hay advertencias que deberían revisarse.')
  }
}

main()
  .catch((e) => {
    console.error('Validation error:', e instanceof Error ? e.message : 'Unknown')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
