// @tests #402 — `Pago.createdAt` es la fecha de REGISTRO: la pone la base
// (`now()`) y ningún writer la fija a mano. La fecha del hecho va en
// `ocurridoAt`. Recorre todo `src/` (salvo tests) buscando creaciones de
// `Pago` y exige que su `data` no incluya `createdAt`.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'

const SRC = resolve(__dirname, '../..')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return nombre === '__tests__' ? [] : archivos(ruta)
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

/** Texto del argumento de la llamada que empieza en `desde` (paréntesis balanceados). */
function argumento(fuente: string, desde: number): string {
  const inicio = fuente.indexOf('(', desde)
  let nivel = 0
  for (let i = inicio; i < fuente.length; i++) {
    if (fuente[i] === '(') nivel++
    else if (fuente[i] === ')' && --nivel === 0) return fuente.slice(inicio, i + 1)
  }
  return fuente.slice(inicio)
}

function creacionesDePago() {
  const llamadas: Array<{ archivo: string; texto: string }> = []
  for (const archivo of archivos(SRC)) {
    const fuente = readFileSync(archivo, 'utf8')
    for (const m of fuente.matchAll(/\.pago\.(create|createMany|upsert)\s*\(/g)) {
      llamadas.push({ archivo: relative(SRC, archivo), texto: argumento(fuente, m.index ?? 0) })
    }
  }
  return llamadas
}

describe('#402 — ningún writer fija Pago.createdAt', () => {
  const llamadas = creacionesDePago()

  it('encuentra los writers de Pago (el recorrido no está vacío)', () => {
    expect(llamadas.length).toBeGreaterThanOrEqual(5)
  })

  it('ninguna creación de Pago pasa createdAt', () => {
    const conCreatedAt = llamadas.filter((l) => /\bcreatedAt\s*:/.test(l.texto)).map((l) => l.archivo)
    expect(conCreatedAt).toEqual([])
  })

  it('el detector sí reconoce un createdAt explícito', () => {
    const fuente = `await tx.pago.create({ data: { monto: 1, createdAt: new Date('2026-01-01') } })`
    const texto = argumento(fuente, fuente.indexOf('.pago.create'))
    expect(/\bcreatedAt\s*:/.test(texto)).toBe(true)
  })
})
