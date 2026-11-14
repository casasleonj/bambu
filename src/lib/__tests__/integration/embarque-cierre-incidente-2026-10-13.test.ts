// @tests PR-0 — paquete de reproducción del incidente AB-INC-EMB-2026-10-13
// (ALS AB-ALS-EMB-2026-10-13 + Adenda v1.2). docs/incidentes/PR0_REPRODUCCION_EMBARQUES_2026-10-13.md
//
// ESTE ARCHIVO CONTIENE PRUEBAS ROJAS A PROPÓSITO. Cada `it` marcado [ROJO]
// codifica el comportamiento CORRECTO exigido por el ALS/adenda y falla contra
// `main` porque el defecto está activo. NO se mergea en rojo: las pruebas se
// incorporan a los PR de reparación (PR-1A / PR-1C) que las hacen pasar.
// Los `it` marcados [GUARDA] pasan hoy y protegen contra regresiones del fix.
//
// Datos 100% sintéticos; no toca producción. Los montos del caso #331
// (2 BOTELLON, total $15.000, pagado $15.000) se reproducen anonimizados.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

type Producto = 'PACA_AGUA' | 'BOTELLON'

function buildUseCase() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

const SIN_ENTREGA = {
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
  cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
}

/** Embarque EN_RUTA con la carga legacy (`EmbarqueProducto.cargadas`) indicada. */
async function crearEmbarque(carga: Partial<Record<Producto, number>>) {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `PR0 ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 },
  })
  for (const [producto, cargadas] of Object.entries(carga)) {
    await testPrisma.embarqueProducto.create({ data: { embarqueId: embarque.id, producto, cargadas } })
  }
  return embarque
}

/**
 * Pedido prepago (totalPagado = total) EN_RUTA en `embarqueId`, con `entAcum`
 * unidades ya entregadas en misiones anteriores (cumplimiento comercial
 * acumulado). Productos: PACA_AGUA a $1.000 o BOTELLON (fab) a $7.500.
 */
async function crearPedidoPrepago(opts: {
  embarqueId: string
  producto: Producto
  cantPedido: number
  entAcum?: number
}) {
  const { embarqueId, producto, cantPedido, entAcum = 0 } = opts
  const precio = producto === 'PACA_AGUA' ? 1_000 : 7_500
  const total = precio * cantPedido
  const legacy =
    producto === 'PACA_AGUA'
      ? { cPacaAguaPed: cantPedido, cPacaAguaEnt: entAcum, precioPacaAgua: precio }
      : { cBotellonFabPed: cantPedido, cBotellonFabEnt: entAcum, precioBotellonFab: precio }
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      total,
      totalPagado: total,
      saldo: 0,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: 'ANTICIPADO',
      embarqueId,
      ...legacy,
      items: { create: [{ producto, cantPedido, cantEntrega: entAcum, precio, subtotal: total }] },
    },
  })
  await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: total, confirmacion: 'CONFIRMADO' } })
  const factura = await testPrisma.factura.create({
    data: {
      numero: `FAC-${Math.random().toString(36).slice(2, 9)}`,
      clienteId, pedidoId: pedido.id, subtotal: total, total, saldo: 0, montoPagado: total, estado: 'PAGADA',
    },
  })
  return { pedido, factura }
}

function entregaDe(producto: Producto, n: number) {
  return producto === 'PACA_AGUA'
    ? { ...SIN_ENTREGA, cPacaAguaEnt: n }
    : { ...SIN_ENTREGA, cBotellonFabEnt: n }
}

async function movimientos(embarqueId: string, tipo: string, producto: string) {
  return testPrisma.embarqueMovimiento.findMany({ where: { embarqueId, tipo: tipo as never, producto } })
}
const suma = (ms: Array<{ cantidad: number }>) => ms.reduce((s, m) => s + m.cantidad, 0)

describe('PR-0 — incidente embarques 2026-10-13: reproducción', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'PR0 Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1', activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  // ── B-01 (P0): snapshot `pedidosRaw` previo al proceso ──────────────────
  describe('B-01 — conciliación y ledger usan la entrega DE ESTA misión, no el snapshot previo', () => {
    it('[ROJO] caso #331: 2 BOTELLON cargados, pedido fresco prepago $15.000 entregado en el cierre → 0 discrepancia, 2 ENTREGA, sin ResponsibilityCase', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2 })

      const res = await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 2), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      // Escenario: lo cargado salió entregado → no hay faltante.
      expect(res.discrepanciaTotal).toBe(0)
      expect(await testPrisma.responsibilityCase.count({ where: { embarqueId: emb.id } })).toBe(0)
      // El hecho físico de la misión queda en el ledger exactamente una vez.
      expect(suma(await movimientos(emb.id, 'ENTREGA', 'BOTELLON'))).toBe(2)
    })

    it('[ROJO] I-08 / prueba 3: pedido de 10 con 3 de una misión anterior; en E2 se entregan 7 → E2 registra 7 (no 3, no 10) y 0 discrepancia', async () => {
      const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

      const res = await buildUseCase().execute({
        id: emb2.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 7), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      expect(res.discrepanciaTotal).toBe(0)
      expect(suma(await movimientos(emb2.id, 'ENTREGA', 'PACA_AGUA'))).toBe(7)
    })
  })

  // ── B-08 (P0): NO_ENTREGADO borra cumplimiento histórico ────────────────
  describe('B-08 — NO_ENTREGADO no borra lo ya entregado', () => {
    it('[ROJO] prueba 4: pedido de 10 con 3 acumuladas, NO_ENTREGADO en E2 → el acumulado sigue en 3 (pedido e ítem)', async () => {
      const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

      await buildUseCase().execute({
        id: emb2.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.cPacaAguaEnt).toBe(3)
      expect(p.items[0].cantEntrega).toBe(3)
      // 0 < acumulado < pedido → pendiente replanificable (adenda §4, B-08).
      expect(p.estadoEntrega).toBe('PENDIENTE')
    })
  })

  // ── B-12 (P0): COMPLETO sin completitud ─────────────────────────────────
  describe('B-12 — COMPLETO exige cantidad acumulada completa', () => {
    it.each([0, 2])(
      '[ROJO] prueba 5: pedido de 10 con 3 acumuladas, COMPLETO con delta %i → se rechaza y nada cambia (estado, factura, ledger)',
      async (delta) => {
        const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
        const { pedido, factura } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

        const ejecutar = buildUseCase().execute({
          id: emb2.id,
          pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', delta), pagos: [] }],
          gastos: [],
          dineroEntregado: 0,
        })
        await expect(ejecutar).rejects.toThrow()

        const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
        expect(p.estadoEntrega).not.toBe('ENTREGADO')
        expect(p.cPacaAguaEnt).toBe(3)
        const f = await testPrisma.factura.findUniqueOrThrow({ where: { id: factura.id } })
        expect(f.fecha.getTime()).toBe(factura.fecha.getTime())
        expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb2.id } })).estado).toBe('EN_RUTA')
        expect(await testPrisma.embarqueMovimiento.count({ where: { embarqueId: emb2.id } })).toBe(0)
      },
    )
  })

  // ── B-11 (P1): auditoría de precio falsa ────────────────────────────────
  describe('B-11 — PRECIO_CIERRE solo si cambió el precio unitario', () => {
    it('[ROJO] prueba 7: precio congelado igual; COMPLETO del remanente (7 de 10) → 0 Historial.PRECIO_CIERRE', async () => {
      const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

      await buildUseCase().execute({
        id: emb2.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 7), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const h = await testPrisma.historial.count({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'PRECIO_CIERRE' } })
      expect(h).toBe(0)
    })
  })

  // ── B-13 (hallazgo nuevo de PR-0): ítems BOTELLON no se actualizan ──────
  describe('B-13 — la rama COMPLETO actualiza PedidoItem de BOTELLON', () => {
    it('[ROJO] pedido de 2 BOTELLON entregado COMPLETO → PedidoItem.cantEntrega = 2 (el ítem se llama BOTELLON)', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 2), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.cBotellonFabEnt).toBe(2)
      expect(p.items.find((i) => i.producto === 'BOTELLON')?.cantEntrega).toBe(2)
    })
  })

  // ── B-09 (P0): doble movimiento físico ──────────────────────────────────
  describe('B-09 — evento físico vivo de botellón + entrega del cierre', () => {
    async function ejecutarCierreBotellon(emb: { id: string }, pedidoId: string, delta: number) {
      try {
        await buildUseCase().execute({
          id: emb.id,
          pedidos: [{ pedidoId, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', delta), pagos: [] }],
          gastos: [],
          dineroEntregado: 0,
        })
        return false
      } catch {
        return true // excepción de revisión: aceptable (adenda §3.2.6)
      }
    }

    it('[ROJO] I-07: el botellón ya se entregó (Pedido.cEnt=2, vía /entrega) y además hay ENTREGA viva de 2 (POST /botellones); carga 2 → el cierre no puede sumar una 2.ª salida desde el snapshot histórico', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      await testPrisma.embarqueMovimiento.create({
        data: { embarqueId: emb.id, tipo: 'ENTREGA', producto: 'BOTELLON', cantidad: 2, origen: 'VEHICULO', destino: 'CLIENTE' },
      })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2, entAcum: 2 })

      const rechazado = await ejecutarCierreBotellon(emb, pedido.id, 0)

      const salidas = suma(await movimientos(emb.id, 'ENTREGA', 'BOTELLON'))
      // Contrato: o el cierre queda como excepción, o la custodia no se vuelve imposible (salidas ≤ carga).
      expect(rechazado || salidas <= 2, `cierreRechazado=${rechazado} salidasENTREGA_BOTELLON=${salidas} carga=2`).toBe(true)
    })

    it('[LATENTE] hoy verde SOLO porque B-01 omite la entrega nueva: ENTREGA viva de 2 + entrega de 2 en el cierre con carga 2. Debe seguir verde tras arreglar B-01 (guarda contra el fix ingenuo post−pre que duplicaría la salida)', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      await testPrisma.embarqueMovimiento.create({
        data: { embarqueId: emb.id, tipo: 'ENTREGA', producto: 'BOTELLON', cantidad: 2, origen: 'VEHICULO', destino: 'CLIENTE' },
      })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2 })

      const rechazado = await ejecutarCierreBotellon(emb, pedido.id, 2)

      const salidas = suma(await movimientos(emb.id, 'ENTREGA', 'BOTELLON'))
      expect(rechazado || salidas <= 2, `cierreRechazado=${rechazado} salidasENTREGA_BOTELLON=${salidas} carga=2`).toBe(true)
    })
  })

  // ── Guardas: pasan hoy y deben seguir pasando tras el fix ───────────────
  describe('Guardas (verdes hoy)', () => {
    it('[GUARDA] prueba 6: cobro previo 100% y entrega física ahora → sin Pago nuevo, saldo 0, sin fiado', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 10), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(Number(p.total)).toBe(10_000)
      expect(Number(p.totalPagado)).toBe(10_000)
      expect(Number(p.saldo)).toBe(0)
      expect(p.estadoEntrega).toBe('ENTREGADO')
      expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(1)
      expect(await testPrisma.pago.count({ where: { embarqueId: emb.id } })).toBe(0)
    })

    it('[GUARDA] prueba 10 (replay): el mismo cierre con el mismo offlineId no duplica pedidos, pagos ni movimientos', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })
      const input = {
        id: emb.id,
        offlineId: `pr0-replay-${emb.id}`,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO' as const, productosEntregados: entregaDe('PACA_AGUA', 10), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      }

      await buildUseCase().execute(input)
      const movs1 = await testPrisma.embarqueMovimiento.count({ where: { embarqueId: emb.id } })
      const pagos1 = await testPrisma.pago.count({ where: { pedidoId: pedido.id } })
      await buildUseCase().execute(input)

      expect(await testPrisma.embarqueMovimiento.count({ where: { embarqueId: emb.id } })).toBe(movs1)
      expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(pagos1)
    })
  })
})
