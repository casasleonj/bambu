// @tests PrismaPricingAdapter — recargo de domicilio (#493)
// Hallazgo cubierto: en un pedido a DOMICILIO el sistema sumaba el recargo del
// producto también al precio escrito a mano, al especial del cliente y al de
// volumen (5 pacas a 2.500 salían en 13.500 en vez de 12.500).
// Regla: manual, especial y volumen son finales; solo el precio base lleva recargo.
// Verifica contra Postgres real (no mocks).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { resolverPrecio, type ProductCode } from '@/lib/pricing'

const RECARGO = 200

describe('Recargo de domicilio solo sobre el precio base (#493)', () => {
  const adapter = new PrismaPricingAdapter()
  let clienteId: string
  let clienteEspecialId: string

  beforeAll(async () => {
    await resetAndSeed()
    await testPrisma.producto.update({
      where: { codigo: 'PACA_AGUA' },
      data: { aplicaDomicilio: true, sobreCostoDomicilio: RECARGO },
    })
    const cliente = await testPrisma.cliente.findFirstOrThrow({ where: { activo: true, id: { not: 'CONSUMIDOR_FINAL' } } })
    clienteId = cliente.id
    const especial = await testPrisma.cliente.create({
      data: {
        nombre: 'Cliente precio especial 493',
        telefono: `3${Date.now().toString().slice(-9)}`,
        preciosEspeciales: JSON.stringify({ DOMICILIO: { PACA_AGUA: 2100 }, PUNTO: { PACA_AGUA: 2100 } }),
      },
    })
    clienteEspecialId = especial.id
  })

  afterAll(async () => {
    await disconnect()
  })

  async function resolver(
    canal: 'PUNTO' | 'DOMICILIO',
    cliente: string,
    cantidad: number,
    precioManual?: number,
  ) {
    const data = await adapter.loadPricingContext(cliente, null, ['PACA_AGUA'])
    const [r] = await adapter.resolverPrecios([{ codigo: 'PACA_AGUA', cantidad, precioManual }], canal, data)
    return r
  }

  it('precio escrito a mano a domicilio: 5 × 2.500 = 12.500 (el caso del PO)', async () => {
    const r = await resolver('DOMICILIO', clienteId, 5, 2500)
    expect(r.origen).toBe('manual')
    expect(r.precio).toBe(2500)
    expect(r.subtotal).toBe(12_500)
  })

  it('precio especial del cliente a domicilio: sin recargo', async () => {
    const r = await resolver('DOMICILIO', clienteEspecialId, 5)
    expect(r.origen).toBe('cliente')
    expect(r.precio).toBe(2100)
  })

  it('precio por volumen a domicilio: el de la tabla, sin recargo', async () => {
    const punto = await resolver('PUNTO', clienteId, 5)
    const domicilio = await resolver('DOMICILIO', clienteId, 5)
    expect(domicilio.origen).toBe('volumen')
    expect(domicilio.precio).toBe(punto.precio)
  })

  it('precio base (sin tramo, ni especial, ni manual) sí lleva recargo a domicilio', async () => {
    await testPrisma.precioVolumen.updateMany({ where: { producto: { codigo: 'PACA_AGUA' } }, data: { activo: false } })
    await testPrisma.producto.update({ where: { codigo: 'PACA_AGUA' }, data: { precioBase: 2000 } })
    try {
      const punto = await resolver('PUNTO', clienteId, 5)
      const domicilio = await resolver('DOMICILIO', clienteId, 5)
      expect(domicilio.origen).toBe('base')
      expect(punto.precio).toBe(2000)
      expect(domicilio.precio).toBe(2000 + RECARGO)
      // La rutina antigua da el mismo resultado: ya no hay dos reglas.
      const antiguo = await resolverPrecio('PACA_AGUA' as ProductCode, 5, 'DOMICILIO')
      expect(antiguo.precio).toBe(2000 + RECARGO)
    } finally {
      await testPrisma.precioVolumen.updateMany({ where: { producto: { codigo: 'PACA_AGUA' } }, data: { activo: true } })
    }
  })

  it('la rutina antigua tampoco suma recargo a un precio manual ni a uno por volumen', async () => {
    const manual = await resolverPrecio('PACA_AGUA' as ProductCode, 5, 'DOMICILIO', null, 2500)
    expect(manual.precio).toBe(2500)
    const punto = await resolverPrecio('PACA_AGUA' as ProductCode, 5, 'PUNTO')
    const domicilio = await resolverPrecio('PACA_AGUA' as ProductCode, 5, 'DOMICILIO')
    expect(domicilio.precio).toBe(punto.precio)
  })
})
