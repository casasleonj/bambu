import { describe, expect, it } from 'vitest'
import { ContadorConsultas } from '../../../e2e/utils/contador-consultas'

describe('#906: observador de consultas Pedidos/Fiados', () => {
  it('distingue solicitudes de hidratación terminadas de estabilidad real', () => {
    let ahora = 1000
    const observador = new ContadorConsultas<object>(() => ahora)
    const r = {}
    observador.iniciar(r)
    expect(observador.solicitudes).toBe(1)
    expect(observador.estable()).toBe(false)
    ahora = 1010
    observador.finalizar(r)
    expect(observador.pendientes).toBe(0)
    ahora = 1359
    expect(observador.estable()).toBe(false)
    ahora = 1360
    expect(observador.estable()).toBe(true)
  })

  it('control negativo: una ráfaga de consultas luego de estabilizar no supera el límite de 1', () => {
    let ahora = 1000
    const observador = new ContadorConsultas<object>(() => ahora)
    ahora = 1400
    expect(observador.estable()).toBe(true)
    const antes = observador.solicitudes
    for (let i = 0; i < 5; i++) {
      const r = {}
      ahora += 30
      observador.iniciar(r)
      observador.finalizar(r)
    }
    expect(observador.nuevasDesde(antes)).toBe(5)
    // Un test E2E que acepta >1 llamada tras la quietud ocultaría el bucle #779.
    expect(observador.nuevasDesde(antes)).toBeGreaterThan(1)
    expect(observador.estable()).toBe(false)
  })

  it('no considera estable una solicitud que queda en curso aunque pase el tiempo', () => {
    let ahora = 1000
    const observador = new ContadorConsultas<object>(() => ahora)
    const r = {}
    observador.iniciar(r)
    ahora = 100000
    expect(observador.estable()).toBe(false)
    expect(observador.pendientes).toBe(1)
    observador.finalizar(r, true)
    expect(observador.pendientes).toBe(0)
    expect(observador.trazaReciente()).toContain('fallo@100000')
  })

  it('ignora finales de otros endpoints no rastreados y no imprime identificadores', () => {
    let ahora = 1000
    const observador = new ContadorConsultas<object>(() => ahora)
    const noRastreado = { url: '/api/pedidos/consulta?clienteId=SECRETO' }
    observador.finalizar(noRastreado, true)
    expect(observador.solicitudes).toBe(0)
    expect(observador.pendientes).toBe(0)
    expect(observador.trazaReciente()).not.toContain('SECRETO')
  })
})
