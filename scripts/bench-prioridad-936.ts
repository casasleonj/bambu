/**
 * #936 · Benchmark reproducible de consulta REAL de Pedidos.
 *
 * SOLO GitHub Actions, con PostgreSQL efímero en localhost y datos sintéticos.
 * No se ejecuta contra Supabase, producción, staging compartido ni un túnel.
 * Los resultados son mediciones de esta máquina runner, no una garantía de SLA.
 */
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PrismaClient, type Prisma } from '@prisma/client'
import { consultarPedidos } from '../src/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '../src/lib/pedidos-consulta'

function verificarSandbox() {
  const raw = process.env.DATABASE_URL
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.QA936_EPHEMERAL_DB !== '1' ||
    !raw
  ) throw new Error('Benchmark #936 solo autorizado en CI con DB efímera explícita')
  const parsed = new URL(raw)
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.port !== '5432' || parsed.pathname !== '/bambu') {
    throw new Error('Benchmark #936 rechazó DATABASE_URL fuera de PostgreSQL local de CI')
  }
}
verificarSandbox()

const db = new PrismaClient()
const fechaBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const fecha = new Date(`${fechaBogota}T08:00:00-05:00`)
const marca = randomUUID().slice(0, 12)
const tamaños = [250, 1000, 5000] as const
const muestras = 15
type Medicion = {
  candidatos: number; muestras: number; p50ms: number; p95ms: number
  minimoMs: number; maximoMs: number; rssAntesMiB: number; rssMaxMiB: number
  heapMaxMiB: number; resultados: number
}
const ms = (n: number) => Math.round(n * 100) / 100
const mib = (n: number) => ms(n / 1048576)
const percentil = (lista: number[], p: number) => {
  const l = [...lista].sort((a, b) => a - b)
  return l[Math.ceil((p / 100) * l.length) - 1]
}

async function main() {
  const c = await db.cliente.create({ data: {
    nombre: `QA936 benchmark ${marca}`, telefono: `BENCH-${marca}`,
  } })
  const clienteId = c.id
  let acumulado = 0
  const informe: Medicion[] = []
  const inicioGlobal = Date.now()
  try {
    for (const cantidad of tamaños) {
      while (acumulado < cantidad) {
        const desde = acumulado
        const hasta = Math.min(cantidad, desde + 200)
        const datos: Prisma.PedidoCreateManyInput[] = []
        const items: Prisma.PedidoItemCreateManyInput[] = []
        const pagos: Prisma.PagoCreateManyInput[] = []
        for (let i = desde; i < hasta; i++) {
          const id = `qa936-${marca}-${i}`
          const clase = i % 10
          const pagado = clase <= 3
          const parcial = clase === 4
          const reportado = clase === 3
          const totalPagado = pagado ? 1000 : parcial ? 300 : 0
          datos.push({
            id, clienteId, fecha, createdAt: new Date(inicioGlobal - (5001 - i) * 60_000),
            canal: 'DOMICILIO', estadoEntrega: 'PENDIENTE',
            estadoPago: pagado ? 'ANTICIPADO' : parcial ? 'PARCIAL' : 'PENDIENTE',
            total: 1000, totalPagado, saldo: 1000 - totalPagado,
          })
          items.push({ pedidoId: id, producto: 'PACA_AGUA',
            cantPedido: 1, cantEntrega: 0, precio: 1000, subtotal: 1000 })
          if (pagado || parcial) pagos.push({
            pedidoId: id, monto: totalPagado, metodo: 'NEQUI',
            confirmacion: reportado ? 'REPORTADO' : 'CONFIRMADO',
          })
        }
        await db.pedido.createMany({ data: datos })
        await db.pedidoItem.createMany({ data: items })
        if (pagos.length) await db.pago.createMany({ data: pagos })
        acumulado = hasta
      }

      // Misma consulta del repositorio que usa el Hub; no se mide solo ordenar() en memoria.
      const parametros = new URLSearchParams({
        desde: fechaBogota, hasta: fechaBogota, clienteId, agrupar: '',
        page: '1', pageSize: '25', resumen: '1',
      })
      const filtros = leerFiltrosConsulta(parametros, fechaBogota)
      const consulta = () => consultarPedidos(filtros, 'ADMIN', db)
      // Warmup fuera del histograma: evita mezclar inicialización de conexiones.
      const warmup = await consulta()
      if (warmup.total !== cantidad || warmup.pedidos.length !== 25)
        throw new Error(`El universo de candidatos no coincide en warmup: ${warmup.total}/${cantidad}`)

      const latencias: number[] = []
      const rssAntes = process.memoryUsage().rss
      let rssMax = rssAntes, heapMax = process.memoryUsage().heapUsed
      for (let i = 0; i < muestras; i++) {
        const t0 = performance.now()
        const resultado = await consulta()
        latencias.push(performance.now() - t0)
        if (resultado.total !== cantidad || resultado.pedidos.length !== 25)
          throw new Error(`Conteo/página inconsistente con ${cantidad} candidatos`)
        rssMax = Math.max(rssMax, process.memoryUsage().rss)
        heapMax = Math.max(heapMax, process.memoryUsage().heapUsed)
      }
      const fila: Medicion = {
        candidatos: cantidad, muestras,
        p50ms: ms(percentil(latencias, 50)), p95ms: ms(percentil(latencias, 95)),
        minimoMs: ms(Math.min(...latencias)), maximoMs: ms(Math.max(...latencias)),
        rssAntesMiB: mib(rssAntes), rssMaxMiB: mib(rssMax),
        heapMaxMiB: mib(heapMax), resultados: 25,
      }
      informe.push(fila)
      console.log('QA936_BENCH', JSON.stringify(fila))
    }
    mkdirSync('artifacts', { recursive: true })
    writeFileSync('artifacts/qa936-benchmark.json', JSON.stringify({
      fecha: new Date().toISOString(), commit: process.env.GITHUB_SHA,
      detalles: 'PostgreSQL 17 efímero en localhost, datos sintéticos, cliente aislado, filtro Hoy+cliente, agrupación OFF, resumen ON, primera página de 25; sin concurrencia de UI',
      resultados: informe,
    }, null, 2))
  } finally {
    await db.pago.deleteMany({ where: { pedido: { clienteId } } })
    await db.pedidoItem.deleteMany({ where: { pedido: { clienteId } } })
    await db.pedido.deleteMany({ where: { clienteId } })
    await db.cliente.delete({ where: { id: clienteId } })
    await db.$disconnect()
  }
}

main().catch(e => { console.error('QA936_BENCH_ERROR', e); process.exitCode = 1 })
