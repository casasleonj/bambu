import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  M1_REFERENCIA,
  resolverDestinoFusion,
  tienePendientes,
  validarLedger,
  type DecisionLedgerEntry,
} from '../backfill-ledger'

/**
 * Ledger sintético, totalmente resuelto, para testear las reglas de
 * validación en aislamiento (sin depender del ledger real, que tiene
 * entradas PENDIENTE_DECISION a propósito — ver el test dedicado a eso).
 * Categoría C se resuelve como MANTENER_SEPARADO (cada valor su propio
 * Barrio) para tener una base 100% válida sin inventar fusiones.
 */
function construirLedgerValido(): DecisionLedgerEntry[] {
  return Object.entries(M1_REFERENCIA).map(([valorNormalizado, meta]) => {
    if (meta.categoria === 'D_DESCARTAR') {
      return {
        valorNormalizado,
        categoria: meta.categoria,
        familiaId: meta.familiaId,
        fuentes: meta.fuentes,
        n: meta.n,
        decision: 'DESCARTAR',
        fusionarEn: null,
        barrioCanonico: null,
        razon: 'test',
        estado: 'RESUELTO',
      }
    }
    return {
      valorNormalizado,
      categoria: meta.categoria,
      familiaId: meta.familiaId,
      fuentes: meta.fuentes,
      n: meta.n,
      decision: 'MANTENER_SEPARADO',
      fusionarEn: null,
      barrioCanonico: valorNormalizado,
      razon: 'test',
      estado: 'RESUELTO',
    }
  })
}

function reemplazar(entries: DecisionLedgerEntry[], valorNormalizado: string, cambios: Partial<DecisionLedgerEntry>) {
  return entries.map((e) => (e.valorNormalizado === valorNormalizado ? { ...e, ...cambios } : e))
}

describe('validarLedger — ledger real del repo', () => {
  it('scripts/backfill-barrio-canonico.decisiones.json tiene exactamente 52 entradas y pasa la validación estructural', () => {
    const raw = readFileSync(join(process.cwd(), 'scripts/backfill-barrio-canonico.decisiones.json'), 'utf-8')
    const entries: DecisionLedgerEntry[] = JSON.parse(raw)
    expect(entries).toHaveLength(52)
    const errores = validarLedger(entries)
    expect(errores).toEqual([])
  })

  it('el ledger real ya no tiene entradas PENDIENTE_DECISION — las 52 quedaron resueltas', () => {
    const raw = readFileSync(join(process.cwd(), 'scripts/backfill-barrio-canonico.decisiones.json'), 'utf-8')
    const entries: DecisionLedgerEntry[] = JSON.parse(raw)
    // Ronda 1 (PR #260): 20/38 resueltas con el Diccionario Territorial Codazzi V2
    // + el criterio explícito del equipo de "homologar sin reemplazar".
    // Ronda 2 (este cambio): las 18 restantes se resolvieron con instrucción
    // explícita del equipo — 10 categoría B (varias CREAR_BARRIO, varias
    // DESCARTAR por ser referencias de ubicación/residenciales/deportivas, no
    // barrios) + 8 categoría C en 4 familias (gaitana, libano, mercado, socorro
    // — mismo patrón de fusión por variante de artículo ya usado con Antillana).
    // Nota: "divina pastora" (detectado en producción, fuera de las 52 entradas
    // de M1) NO se agrega acá — M1 es evidencia histórica inmutable; ese caso
    // queda como trabajo futuro fuera de este ledger.
    expect(tienePendientes(entries)).toBe(false)
    const pendientes = entries.filter((e) => e.decision === 'PENDIENTE_DECISION')
    expect(pendientes).toHaveLength(0)
  })

  it('las categorías A y D del ledger real vienen resueltas (no requieren decisión humana)', () => {
    const raw = readFileSync(join(process.cwd(), 'scripts/backfill-barrio-canonico.decisiones.json'), 'utf-8')
    const entries: DecisionLedgerEntry[] = JSON.parse(raw)
    const a = entries.filter((e) => e.categoria === 'A_DETERMINISTA')
    const d = entries.filter((e) => e.categoria === 'D_DESCARTAR')
    expect(a).toHaveLength(13)
    expect(a.every((e) => e.decision === 'CREAR_BARRIO' && e.estado === 'RESUELTO' && e.razon.trim() !== '')).toBe(true)
    expect(d).toHaveLength(1)
    expect(d.every((e) => e.decision === 'DESCARTAR' && e.estado === 'RESUELTO')).toBe(true)
  })
})

describe('validarLedger — reglas estructurales', () => {
  it('un ledger completo y consistente con M1 no reporta errores', () => {
    expect(validarLedger(construirLedgerValido())).toEqual([])
  })

  it('detecta un ledger con menos de 52 entradas', () => {
    const entries = construirLedgerValido().slice(0, 51)
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.mensaje.includes('51'))).toBe(true)
  })

  it('detecta un valorNormalizado ajeno a M1_INVENTARIO_BARRIO.md', () => {
    const entries = construirLedgerValido()
    entries[0] = { ...entries[0], valorNormalizado: 'un barrio inventado' }
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'un barrio inventado')).toBe(true)
    // Y el valor original que reemplazó queda reportado como faltante.
    expect(errores.some((e) => e.mensaje.includes('Falta en el ledger'))).toBe(true)
  })

  it('detecta categoria inconsistente con M1', () => {
    const entries = reemplazar(construirLedgerValido(), 'centro', { categoria: 'D_DESCARTAR' })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'centro' && e.mensaje.includes('categoria'))).toBe(true)
  })

  it('detecta n inconsistente con M1', () => {
    const entries = reemplazar(construirLedgerValido(), 'centro', { n: 1 })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'centro' && e.mensaje.includes('n='))).toBe(true)
  })

  it('detecta fuentes inconsistentes con M1', () => {
    const entries = reemplazar(construirLedgerValido(), 'centro', { fuentes: ['CLIENTE'] })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'centro' && e.mensaje.includes('fuentes'))).toBe(true)
  })

  it('exige razon no vacía para toda decision distinta de PENDIENTE_DECISION', () => {
    const entries = reemplazar(construirLedgerValido(), 'centro', { razon: '' })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'centro' && e.mensaje.includes('razon'))).toBe(true)
  })

  it('no exige razon cuando decision=PENDIENTE_DECISION', () => {
    const entries = reemplazar(construirLedgerValido(), 'villa mafe', {
      decision: 'PENDIENTE_DECISION',
      estado: 'PENDIENTE',
      barrioCanonico: null,
      razon: '',
    })
    const errores = validarLedger(entries)
    expect(errores.filter((e) => e.valorNormalizado === 'villa mafe')).toEqual([])
  })

  it('exige barrioCanonico para CREAR_BARRIO/MANTENER_SEPARADO', () => {
    const entries = reemplazar(construirLedgerValido(), 'centro', { barrioCanonico: null })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'centro' && e.mensaje.includes('barrioCanonico'))).toBe(true)
  })

  it('categoria C_FAMILIA requiere familiaId no nulo', () => {
    const entries = reemplazar(construirLedgerValido(), 'antillana', { familiaId: null })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'antillana' && e.mensaje.includes('familiaId'))).toBe(true)
  })

  it('familiaId debe ser null fuera de categoria C_FAMILIA', () => {
    const entries = reemplazar(construirLedgerValido(), 'centro', { familiaId: 'familia-centro' })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'centro' && e.mensaje.includes('familiaId'))).toBe(true)
  })

  it('decision=PENDIENTE_DECISION requiere estado=PENDIENTE', () => {
    const entries = reemplazar(construirLedgerValido(), 'villa mafe', {
      decision: 'PENDIENTE_DECISION',
      barrioCanonico: null,
      razon: '',
      // estado se queda en RESUELTO a propósito -- inconsistente.
    })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'villa mafe' && e.mensaje.includes('estado'))).toBe(true)
  })
})

describe('validarLedger — FUSIONAR_EN (ajuste 2, ronda 3): un solo salto, sin cadenas ni ciclos', () => {
  it('FUSIONAR_EN hacia una entrada CREAR_BARRIO/MANTENER_SEPARADO es válido', () => {
    const entries = reemplazar(construirLedgerValido(), 'la antillana', {
      decision: 'FUSIONAR_EN',
      fusionarEn: 'antillana',
      barrioCanonico: null,
      razon: 'test',
    })
    const errores = validarLedger(entries)
    expect(errores.filter((e) => e.valorNormalizado === 'la antillana')).toEqual([])
  })

  it('decision=FUSIONAR_EN requiere fusionarEn no nulo', () => {
    const entries = reemplazar(construirLedgerValido(), 'la antillana', { decision: 'FUSIONAR_EN', razon: 'test' })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'la antillana' && e.mensaje.includes('fusionarEn'))).toBe(true)
  })

  it('fusionarEn hacia un valorNormalizado inexistente es inválido', () => {
    const entries = reemplazar(construirLedgerValido(), 'la antillana', {
      decision: 'FUSIONAR_EN',
      fusionarEn: 'no existe',
      razon: 'test',
    })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'la antillana' && e.mensaje.includes('no existe en el ledger'))).toBe(true)
  })

  it('prohíbe cadenas: fusionarEn no puede apuntar a otra entrada FUSIONAR_EN', () => {
    let entries = construirLedgerValido()
    entries = reemplazar(entries, 'la antillana', { decision: 'FUSIONAR_EN', fusionarEn: 'antillana', razon: 'test' })
    // "antillana" pasa de MANTENER_SEPARADO a FUSIONAR_EN hacia otro valor --
    // ahora "la antillana" apunta a una entrada que también es FUSIONAR_EN.
    entries = reemplazar(entries, 'antillana', { decision: 'FUSIONAR_EN', fusionarEn: 'las palmeras', razon: 'test', barrioCanonico: null })
    const errores = validarLedger(entries)
    expect(
      errores.some((e) => e.valorNormalizado === 'la antillana' && e.mensaje.includes('cadenas y ciclos están prohibidos')),
    ).toBe(true)
  })

  it('prohíbe el ciclo trivial: fusionarEn no puede referenciarse a sí mismo', () => {
    const entries = reemplazar(construirLedgerValido(), 'antillana', {
      decision: 'FUSIONAR_EN',
      fusionarEn: 'antillana',
      razon: 'test',
      barrioCanonico: null,
    })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'antillana' && e.mensaje.includes('a sí mismo'))).toBe(true)
  })

  it('prohíbe un ciclo de 2: A.fusionarEn=B y B.fusionarEn=A', () => {
    let entries = construirLedgerValido()
    entries = reemplazar(entries, 'antillana', { decision: 'FUSIONAR_EN', fusionarEn: 'la antillana', razon: 'test', barrioCanonico: null })
    entries = reemplazar(entries, 'la antillana', { decision: 'FUSIONAR_EN', fusionarEn: 'antillana', razon: 'test' })
    const errores = validarLedger(entries)
    // Ambos lados del ciclo deben fallar: ninguno de los dos apunta a un
    // CREAR_BARRIO/MANTENER_SEPARADO real.
    expect(errores.some((e) => e.valorNormalizado === 'antillana')).toBe(true)
    expect(errores.some((e) => e.valorNormalizado === 'la antillana')).toBe(true)
  })

  it('fusionarEn debe ser null salvo cuando decision=FUSIONAR_EN', () => {
    const entries = reemplazar(construirLedgerValido(), 'centro', { fusionarEn: 'san jose' })
    const errores = validarLedger(entries)
    expect(errores.some((e) => e.valorNormalizado === 'centro' && e.mensaje.includes('fusionarEn debe ser null'))).toBe(true)
  })
})

describe('resolverDestinoFusion', () => {
  it('resuelve el único salto hacia la entrada destino', () => {
    const entries = reemplazar(construirLedgerValido(), 'la antillana', {
      decision: 'FUSIONAR_EN',
      fusionarEn: 'antillana',
      barrioCanonico: null,
      razon: 'test',
    })
    const porValor = new Map(entries.map((e) => [e.valorNormalizado, e]))
    const origen = porValor.get('la antillana')!
    const destino = resolverDestinoFusion(origen, porValor)
    expect(destino.valorNormalizado).toBe('antillana')
    expect(destino.decision).toBe('MANTENER_SEPARADO')
  })

  it('lanza si se llama sobre una entrada que no es FUSIONAR_EN', () => {
    const entries = construirLedgerValido()
    const porValor = new Map(entries.map((e) => [e.valorNormalizado, e]))
    const entry = porValor.get('centro')!
    expect(() => resolverDestinoFusion(entry, porValor)).toThrow()
  })
})

describe('tienePendientes', () => {
  it('false cuando todas las entradas están resueltas', () => {
    expect(tienePendientes(construirLedgerValido())).toBe(false)
  })

  it('true cuando al menos una entrada sigue PENDIENTE_DECISION', () => {
    const entries = reemplazar(construirLedgerValido(), 'villa mafe', {
      decision: 'PENDIENTE_DECISION',
      estado: 'PENDIENTE',
      barrioCanonico: null,
      razon: '',
    })
    expect(tienePendientes(entries)).toBe(true)
  })
})
