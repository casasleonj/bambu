// @tests #494 — vista previa de recurrentes y regla del domingo (A3)
//
// Una plantilla cuya próxima generación cae en DOMINGO solo ofrece SALTAR
// («Domingo → Lunes»); el resto de las sugerencias (incluida APLICAR_CREDITO)
// solo existen en un día hábil. El E2E «aplicar crédito de pedido pagado al
// recurrente» creaba la plantilla con «ahora», así que fallaba cuando se
// corría en domingo. Este test fija la fecha de referencia para que la regla
// se verifique cualquier día de la semana.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { previewGeneracionRecurrentes } from '@/lib/recurrentes'

/** Cliente con un pedido prepagado PENDIENTE (saldo 0) y una plantilla. */
async function crearClienteConPrepagoYPlantilla(etiqueta: string, proxGeneracion: Date) {
  const cliente = await testPrisma.cliente.create({
    data: {
      nombre: `Domingo ${etiqueta}`,
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion: 'Calle 1',
      limitePedidosFiados: 999,
      activo: true,
    },
  })
  const total = 5 * 2500
  await testPrisma.pedido.create({
    data: {
      clienteId: cliente.id,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      tipo: 'ENVIO',
      total,
      totalPagado: total,
      saldo: 0,
      estadoEntrega: 'PENDIENTE',
      estado: 'PENDIENTE',
      estadoPago: 'ANTICIPADO',
      cPacaAguaPed: 5,
      cPacaAguaEnt: 0,
      precioPacaAgua: 2500,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 5, cantEntrega: 0, precio: 2500, subtotal: total }] },
      pagos: { create: [{ metodo: 'EFECTIVO', monto: total, embarqueId: null, confirmacion: 'CONFIRMADO' }] },
      factura: {
        create: {
          numero: `FAC-D${Math.floor(Math.random() * 1e6)}`,
          clienteId: cliente.id,
          subtotal: total,
          total,
          montoPagado: total,
          saldo: 0,
          estado: 'PAGADA',
        },
      },
    },
  })
  const plantilla = await testPrisma.plantillaRecurrente.create({
    data: {
      clienteId: cliente.id,
      activo: true,
      cadaNDias: 7,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      proxGeneracion,
      ultimaGeneracion: null,
      productos: { create: [{ producto: 'PACA_AGUA', cantidad: 5 }] },
    },
  })
  return plantilla.id
}

describe('#494 — preview de recurrentes: regla del domingo', () => {
  let plantillaDomingo: string
  let plantillaLunes: string
  // Domingo 2026-11-01 (y lunes 2026-11-02) a mediodía UTC: el mismo día de
  // calendario en UTC y en Bogotá, sin importar la zona del proceso.
  const referencia = new Date('2026-11-01T17:00:00Z')

  beforeAll(async () => {
    await resetAndSeed()
    plantillaDomingo = await crearClienteConPrepagoYPlantilla('dom', new Date('2026-11-01T12:00:00Z'))
    plantillaLunes = await crearClienteConPrepagoYPlantilla('lun', new Date('2026-11-02T12:00:00Z'))
  })

  afterAll(async () => {
    await disconnect()
  })

  it('una plantilla que cae en domingo solo ofrece SALTAR (sin APLICAR_CREDITO)', async () => {
    const previews = await previewGeneracionRecurrentes(referencia)
    const item = previews.find((p) => p.recurrenteId === plantillaDomingo)
    expect(item).toBeDefined()
    expect(item!.sugerencias.map((s) => s.tipo)).toEqual(['SALTAR'])
  })

  it('la misma plantilla un día hábil ofrece APLICAR_CREDITO cuando hay prepagados y no hay deuda', async () => {
    const previews = await previewGeneracionRecurrentes(referencia)
    const item = previews.find((p) => p.recurrenteId === plantillaLunes)
    expect(item).toBeDefined()
    expect(item!.pedidosPagados.length).toBeGreaterThan(0)
    const credito = item!.sugerencias.find((s) => s.tipo === 'APLICAR_CREDITO')
    expect(credito).toBeDefined()
    expect(credito!.disabled).toBeFalsy()
  })
})
