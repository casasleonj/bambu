// @tests Fase 9 F9-iii (docs/pedidos/fase9-hardening-estados-plan.md, P5):
// clasificación CENTRALIZADA de un 409 — A (conflicto de estado → recovery)
// vs B (regla de negocio / guard → mensaje contextual). Un 409 no es
// automáticamente `conflictoEnCurso`.

import { describe, it, expect } from 'vitest'
import {
  es409DeConflictoDeEstado,
  es409DeReglaDeNegocio,
  CODIGOS_409_REGLA_NEGOCIO,
  CODIGOS_409_CONFLICTO_ESTADO,
} from '../conflicto-409'

describe('conflicto-409 — matriz A/B', () => {
  it.each(CODIGOS_409_CONFLICTO_ESTADO)('A: %s → conflicto de estado (recovery)', (code) => {
    expect(es409DeConflictoDeEstado(409, `${code}: detalle`)).toBe(true)
    expect(es409DeReglaDeNegocio(409, `${code}: detalle`)).toBe(false)
  })

  it.each(CODIGOS_409_REGLA_NEGOCIO)('B: %s → regla de negocio (sin recovery)', (code) => {
    expect(es409DeConflictoDeEstado(409, `${code}: detalle`)).toBe(false)
    expect(es409DeReglaDeNegocio(409, `${code}: detalle`)).toBe(true)
  })

  it('409 con código NO reconocido → conflicto de estado (default seguro)', () => {
    expect(es409DeConflictoDeEstado(409, 'ALGO_NUEVO: qué pasó')).toBe(true)
    expect(es409DeConflictoDeEstado(409, '')).toBe(true)
    expect(es409DeConflictoDeEstado(409, null)).toBe(true)
    expect(es409DeReglaDeNegocio(409, 'ALGO_NUEVO')).toBe(false)
  })

  it('status ≠ 409 nunca es conflicto ni regla (400/403/404/500/0)', () => {
    for (const s of [0, 400, 403, 404, 409 - 9, 500, 503]) {
      if (s === 409) continue
      expect(es409DeConflictoDeEstado(s, 'ACTIVIDAD_NO_MODIFICABLE')).toBe(false)
      expect(es409DeReglaDeNegocio(s, 'CANTIDAD_EXCEDE_PENDIENTE')).toBe(false)
    }
  })

  it('los 3 guards de G11 están en la lista B (no se tratan como conflicto)', () => {
    for (const g of ['CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA', 'CORRECCION_PEDIDO_CERRADO', 'CORRECCION_GENERARIA_SOBREPAGO']) {
      expect(CODIGOS_409_REGLA_NEGOCIO).toContain(g)
      expect(es409DeConflictoDeEstado(409, `${g}: ...`)).toBe(false)
    }
  })
})
