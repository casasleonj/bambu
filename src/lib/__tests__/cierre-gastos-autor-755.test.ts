import { describe, expect, it } from 'vitest'
import { listarGastosDelDia } from '@/lib/cierre-desglose-cobros'

const fecha = new Date('2026-11-21T12:00:00-05:00')

describe('#755 / #753 · gastos en Cierre: autoría y origen', () => {
  it('responsable NO reemplaza al usuario que registró el gasto', () => {
    const [g] = listarGastosDelDia([{
      id: 'g-operativo', categoria: 'OTRO', descripcion: 'Gasolina',
      fecha, monto: 25000, responsable: 'Repartidor',
      createdBy: { nombre: 'Administración', username: 'admin' },
    }])
    expect(g.registro).toBe('Administración')
    expect(g.responsable).toBe('Repartidor')
    expect(g.registroConfiable).toBe(true)
    expect(g.origen).toBe('GASTOS')
  })

  it('no atribuye la captura al responsable si no se conoce al creador', () => {
    const [g] = listarGastosDelDia([{
      id: 'g-importado', categoria: 'OTRO', descripcion: 'Historico',
      fecha, monto: 5000, responsable: 'Jefe',
      createdBy: null,
    }])
    expect(g.registro).toBeNull()
    expect(g.responsable).toBe('Jefe')
  })

  it('clasifica Nómina y su reversión histórica bajo Nómina, no Gastos operativos', () => {
    const lista = listarGastosDelDia([
      {
        id: 'g-nomina', categoria: 'NOMINA', descripcion: 'Pago nominal sintético',
        fecha, monto: 100, responsable: null, createdBy: null, trabajadorId: 't',
      },
      {
        id: 'g-reverso', categoria: 'OTRO', descripcion: 'Reversión nómina anulada - sintético',
        fecha, monto: -100, responsable: null, createdBy: null,
      },
    ])
    expect(lista.map(g => g.origen)).toEqual(['NOMINA', 'NOMINA'])
  })
})
