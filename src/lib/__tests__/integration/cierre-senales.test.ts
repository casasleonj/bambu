// @tests ADR-CIERRE-002 §5 (épica #447, Fase B) — hallazgo #450: una venta libre
// fiada puede esconder un faltante de mercancía. El cierre devuelve SEÑALES para
// revisar; nunca bloquea ni crea deuda. Postgres real.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente, uniqueId } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

const uc = () => new CerrarEmbarqueUseCase(
  new PrismaEmbarqueRepository(), new PrismaGastoEmbarqueRepository(), new PrismaEmbarqueProductoRepository(),
  new PrismaTransactionManager(), adminId, 'ADMIN',
)

async function embarque(cargadas: number) {
  const t = await testPrisma.trabajador.create({ data: { nombre: `Sen ${uniqueId('t')}`, rol: 'REPARTIDOR', usaMoto: true } })
  return testPrisma.embarque.create({
    data: { trabajadorId: t.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0, productos: { create: [{ producto: 'PACA_AGUA', cargadas }] } },
  })
}

const venta = (pago: number) => ({
  clienteId, cPacaAgua: 5, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0,
  pagos: pago > 0 ? [{ metodo: 'EFECTIVO', monto: pago }] : [],
})

describe('Cierre — señales (ADR-CIERRE-002 §5)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
    await testPrisma.cliente.update({ where: { id: clienteId }, data: { verificado: true, limitePedidosFiados: 10 } })
  })
  afterAll(async () => { await disconnect() })

  it('#450: venta libre fiada que deja la mercancía en 0 → señal, y el cierre NO se bloquea', async () => {
    const e = await embarque(5) // se cargaron 5 y no hay pedidos: sin la venta habrían faltado 5
    const r = await uc().execute({ id: e.id, pedidos: [], ventasLibres: [venta(0)], dineroEntregado: 0, dryRun: true })
    expect(r.discrepanciaTotal).toBe(0)
    expect(r.senales?.map((s) => s.codigo)).toContain('VENTA_LIBRE_FIADA_COMPENSA_FALTANTE')
  })

  it('la misma venta pagada completo no genera señal', async () => {
    const e = await embarque(5)
    const r = await uc().execute({ id: e.id, pedidos: [], ventasLibres: [venta(12500)], dineroEntregado: 12500, dryRun: true })
    expect(r.senales?.map((s) => s.codigo) ?? []).not.toContain('VENTA_LIBRE_FIADA_COMPENSA_FALTANTE')
  })

  it('sobrante de caja sobre el umbral sin nota → señal; con nota → sin señal', async () => {
    const e = await embarque(0)
    const sin = await uc().execute({ id: e.id, pedidos: [], dineroEntregado: 9000, dryRun: true })
    expect(sin.caja.sobranteFaltante).toBe(9000)
    expect(sin.senales?.map((s) => s.codigo)).toContain('SOBRANTE_CAJA_SIN_NOTA')
    const con = await uc().execute({ id: e.id, pedidos: [], dineroEntregado: 9000, justificacionFaltante: 'cobro de ayer', dryRun: true })
    expect(con.senales?.map((s) => s.codigo) ?? []).not.toContain('SOBRANTE_CAJA_SIN_NOTA')
  })

  it('cierre real con señales: se cierra igual (las señales no bloquean ni crean deuda)', async () => {
    const e = await embarque(5)
    const r = await uc().execute({ id: e.id, pedidos: [], ventasLibres: [venta(0)], dineroEntregado: 0 })
    expect(r.estado).toBe('CERRADO')
    expect(r.senales?.length).toBeGreaterThan(0)
    expect(r.responsibilityCases).toEqual([])
    const post = await testPrisma.embarque.findUniqueOrThrow({ where: { id: e.id } })
    expect(post.estado).toBe('CERRADO')
  })
})
