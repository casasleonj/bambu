// @tests forecasting — Bloque 3 (pronóstico agregado)

import { describe, it, expect } from 'vitest'
import { pronosticarPorDiaSemana, nombreDia } from '../forecasting'

// Helper: NO convertimos a Date acá. Lo dejamos como string para que el
// `toDate()` del módulo bajo test parsee como local (no UTC), evitando
// el off-by-one de zona horaria en zonas UTC-.
function pedido(fecha: Date | string, total: number, estado = 'ENTREGADO') {
  // Si nos pasan un Date, lo serializamos a YYYY-MM-DD para que el módulo
  // lo parsee como local también. Esto es importante porque el módulo
  // hace `typeof x === 'string' ? parseLocalDate : x`.
  if (fecha instanceof Date) {
    const y = fecha.getFullYear()
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0')
    const d = fecha.getDate().toString().padStart(2, '0')
    return { fecha: `${y}-${m}-${d}`, total, estado }
  }
  return { fecha, total, estado }
}

describe('pronosticarPorDiaSemana', () => {
  it('0 pedidos → confianza BAJA, todo en 0', () => {
    const r = pronosticarPorDiaSemana([])
    expect(r.confianza).toBe('BAJA')
    expect(r.pedidosPorSemana).toBe(0)
    expect(r.montoPorSemana).toBe(0)
    expect(r.porDia).toHaveLength(7)
  })

  it('detecta estacionalidad semanal: lunes siempre alto', () => {
    // 4 semanas: lunes 80, martes 50, miércoles 70
    // Esperar: lunes 80, martes 50, miércoles 70, resto 0
    // IMPORTANTE: usamos Date(2024, 0, 1) (LOCAL) y no new Date('2024-01-01')
    // (que es UTC midnight y se corre 1 día en zonas UTC-). El negocio
    // opera en Colombia, donde Jan 1 2024 fue lunes.
    const pedidos = []
    for (let sem = 0; sem < 4; sem++) {
      const base = new Date(2024, 0, 1 + sem * 7) // lunes local
      // lunes
      const l = new Date(base)
      pedidos.push(pedido(l.toISOString().slice(0, 10), 80))
      // martes
      const m = new Date(base)
      m.setDate(m.getDate() + 1)
      pedidos.push(pedido(m.toISOString().slice(0, 10), 50))
      // miércoles
      const x = new Date(base)
      x.setDate(x.getDate() + 2)
      pedidos.push(pedido(x.toISOString().slice(0, 10), 70))
    }
    const r = pronosticarPorDiaSemana(pedidos, 4)
    expect(r.porDia[1].promedioMonto).toBe(80) // lunes
    expect(r.porDia[2].promedioMonto).toBe(50) // martes
    expect(r.porDia[3].promedioMonto).toBe(70) // miércoles
    expect(r.porDia[0].promedioMonto).toBe(0)  // domingo
    expect(r.confianza).toBe('MEDIA') // 4 semanas
  })

  it('confianza ALTA con 8+ semanas y 50+ pedidos', () => {
    const pedidos = []
    for (let sem = 0; sem < 10; sem++) {
      for (let dia = 0; dia < 7; dia++) {
        const f = new Date(2024, 0, 1 + sem * 7 + dia)
        pedidos.push(pedido(f.toISOString().slice(0, 10), 50))
      }
    }
    const r = pronosticarPorDiaSemana(pedidos, 8)
    expect(r.confianza).toBe('ALTA')
  })

  it('confianza BAJA con <4 semanas', () => {
    const pedidos = [pedido(new Date(2024, 0, 1), 100), pedido(new Date(2024, 0, 8), 80)]
    const r = pronosticarPorDiaSemana(pedidos, 8)
    expect(r.confianza).toBe('BAJA')
  })

  it('excluye pedidos CANCELADOS/ANULADOS', () => {
    // Usamos Date(2024, 0, X) (local) para evitar el off-by-one de UTC.
    const pedidos = [
      pedido(new Date(2024, 0, 1), 100),
      pedido(new Date(2024, 0, 8), 80, 'CANCELADO'),
      pedido(new Date(2024, 0, 15), 60, 'ANULADO'),
    ]
    const r = pronosticarPorDiaSemana(pedidos, 4)
    // Solo 1 pedido válido (lunes, Jan 1)
    expect(r.totalPedidosObservados).toBe(1)
    expect(r.porDia[1].promedioMonto).toBe(100)
  })

  it('pedidosPorSemana = suma de promedioPedidos por día', () => {
    const pedidos = []
    for (let sem = 0; sem < 3; sem++) {
      for (let dia = 0; dia < 5; dia++) {
        const f = new Date(2024, 0, 1 + sem * 7 + dia)
        pedidos.push(pedido(f.toISOString().slice(0, 10), 100))
      }
    }
    const r = pronosticarPorDiaSemana(pedidos, 4)
    // Lun-Vie: 5 días × 1 pedido/día promedio = 5/semana
    expect(r.pedidosPorSemana).toBeGreaterThanOrEqual(4)
    expect(r.pedidosPorSemana).toBeLessThanOrEqual(6)
  })
})

describe('nombreDia', () => {
  it('devuelve el nombre en español', () => {
    expect(nombreDia(0)).toBe('Domingo')
    expect(nombreDia(1)).toBe('Lunes')
    expect(nombreDia(6)).toBe('Sábado')
  })
})
