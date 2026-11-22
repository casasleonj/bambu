import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resetAndSeed, disconnect, testPrisma } from './setup'
import { leerGastosRetroactivosCierre } from '@/lib/cierre-gastos-retroactivos'

const INICIO = new Date('2030-04-15T00:00:00-05:00')
const FIN = new Date('2030-04-16T00:00:00-05:00')
const CIERRE = new Date('2030-04-15T20:00:00-05:00')
const ANTES = new Date('2030-04-15T12:00:00-05:00')
const DESPUES = new Date('2030-04-15T21:00:00-05:00')
const CAPTURA_TARDIA = new Date('2030-04-16T10:00:00-05:00')

describe('#753 · gastos anotados después de jornada cerrada (PostgreSQL)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    await testPrisma.gasto.createMany({
      data: [
        // Nómina con fecha real anterior a cierre, capturada después.
        { fecha: ANTES, createdAt: CAPTURA_TARDIA, categoria: 'NOMINA', descripcion: 'Pago personal sintético', monto: 300 },
        // Gasto operativo retroactivo.
        { fecha: ANTES, createdAt: CAPTURA_TARDIA, categoria: 'OTRO', descripcion: 'Gasto manual registrado tarde', monto: 90 },
        // Reversión histórica de Nómina que el esquema clasificó como OTRO.
        { fecha: ANTES, createdAt: CAPTURA_TARDIA, categoria: 'OTRO', descripcion: 'Reversión nómina anulada - sintético', monto: -70 },
        // Ya existía antes de cerrar: NO ES novedad.
        { fecha: ANTES, createdAt: ANTES, categoria: 'OTRO', descripcion: 'Registrado oportunamente', monto: 50 },
        // Ocurrió después de cerrar: pertenece al desglose normal post-cierre, NO retroactivo.
        { fecha: DESPUES, createdAt: CAPTURA_TARDIA, categoria: 'OTRO', descripcion: 'Movimiento nocturno', monto: 80 },
        // Otro día efectivo: NO pertenece a jornada cerrada.
        { fecha: new Date('2030-04-16T12:00:00-05:00'), createdAt: CAPTURA_TARDIA, categoria: 'OTRO', descripcion: 'Otro día', monto: 40 },
      ],
    })
  })
  afterAll(async () => { await disconnect() })

  it('incluye únicamente registros posteriores de fecha efectiva anterior al cierre', async () => {
    const lista = await leerGastosRetroactivosCierre(testPrisma, { inicio: INICIO, fin: FIN, horaCierre: CIERRE })
    expect(lista).toHaveLength(3)
    expect(lista.map(x => x.origen).sort()).toEqual(['GASTOS', 'NOMINA', 'NOMINA'])
    expect(lista.map(x => x.monto).sort((a, b) => a - b)).toEqual([-70, 90, 300])
    expect(lista.every(x => x.fechaRegistro === CAPTURA_TARDIA.toISOString())).toBe(true)
    expect(lista.every(x => x.fechaEfectiva === ANTES.toISOString())).toBe(true)
  })

  it('no revela concepto de pago al personal como gasto operativo editable', async () => {
    const lista = await leerGastosRetroactivosCierre(testPrisma, { inicio: INICIO, fin: FIN, horaCierre: CIERRE })
    expect(lista.filter(x => x.origen === 'NOMINA').every(x => x.concepto.includes('Nómina'))).toBe(true)
    expect(lista.find(x => x.origen === 'GASTOS')?.concepto).toBe('Gasto manual registrado tarde')
  })

  it('no enumera registros retroactivos si la hora de cierre antecede al día consultado', async () => {
    const lista = await leerGastosRetroactivosCierre(testPrisma, {
      inicio: INICIO, fin: FIN, horaCierre: new Date(INICIO.getTime() - 1),
    })
    expect(lista).toEqual([])
  })
})
