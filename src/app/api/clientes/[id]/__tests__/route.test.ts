// @tests clientes PUT — F-N20 fix verification
// Hallazgo: prisma.cliente.update directo sin tx ni check de updatedAt.
// Dos PUT/PATCH casi simultáneos del mismo cliente causaban
// last-write-wins silencioso.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/clientes/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N20: clientes PUT usa optimistic locking con updatedAt', () => {
  // Extraer el PUT handler
  const putStart = source.indexOf('export async function PUT')
  const patchStart = source.indexOf('export async function PATCH')
  const putSource = source.substring(putStart, patchStart)

  it('FIX: el PUT hace findUnique para obtener updatedAt ANTES del update', () => {
    // F1-BARRIO-CANONICO agregó `barrioId: true` al mismo select (para
    // distinguir vínculo nuevo de re-confirmación) — el select ya no es
    // solo { updatedAt: true }, así que el match no exige que sea el único
    // campo. Fix de concurrencia pre-merge: todo el flujo (incl. este
    // findUnique) corre DENTRO de prisma.$transaction, vía `tx`.
    expect(putSource).toMatch(/tx\.cliente\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*id,\s*activo:\s*true\s*\}[\s\S]+?select:\s*\{\s*updatedAt:\s*true/)
  })

  it('FIX: el PUT usa updateMany con condición sobre updatedAt', () => {
    // Acepta prisma.cliente.updateMany (legacy) o tx.cliente.updateMany (Fase 2+ con $transaction)
    expect(putSource).toMatch(/(?:prisma|tx)\.cliente\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?activo:\s*true,[\s\S]+?updatedAt:\s*existing\.updatedAt/)
  })

  it('FIX: si count === 0, devuelve 409 con mensaje claro', () => {
    expect(putSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(putSource).toMatch(/modificado por otro usuario/)
    expect(putSource).toMatch(/409/)
  })

  it('FIX: re-leer el cliente post-updateMany para devolver estado final', () => {
    expect(putSource).toMatch(/tx\.cliente\.findUnique\(\s*\{\s*where:\s*\{\s*id/)
  })

  it('F1-CONCURRENCIA (fix revisión pre-merge): resolver Barrio y persistir el update ocurren en LA MISMA transacción', () => {
    // Antes: prisma.barrio.findUnique (sin tx) seguido, en una operación
    // separada, de prisma.cliente.updateMany — ventana abierta a un rename
    // concurrente del Barrio entre ambas. Ahora todo corre dentro de un
    // único prisma.$transaction, y la resolución usa el cliente `tx`.
    expect(putSource).toMatch(/prisma\.\$transaction\s*\(\s*async\s*\(\s*tx\s*\)\s*=>/)
    expect(putSource).toMatch(/resolverBarrioParaVinculo\s*\(\s*parsed\.data\.barrioId,\s*tx\s*\)/)
    // La resolución debe pasar por resolverBarrioParaVinculo(..., tx), no
    // por un findUnique suelto fuera de la tx (fuera de un comentario).
    expect(putSource).not.toMatch(/[^(`]await\s+prisma\.barrio\.findUnique/)
  })
})

describe('F-N20: el flujo normal sigue funcionando (no rompe)', () => {
  const putStart = source.indexOf('export async function PUT')
  const patchStart = source.indexOf('export async function PATCH')
  const putSource = source.substring(putStart, patchStart)

  it('FIX: el logAudit sigue funcionando (fuera del update)', () => {
    expect(putSource).toMatch(/logAudit\(/)
  })

  it('FIX: logAudit registra el diff real (parsed.data), no un {nombre} hardcodeado', () => {
    // Antes: datos: { nombre: cliente.nombre } — perdía cualquier cambio
    // de dirección/barrio/etc. del audit trail. Ahora registra parsed.data,
    // igual que la ruta PUT de Negocio.
    expect(putSource).toMatch(/datos:\s*parsed\.data/)
    expect(putSource).not.toMatch(/datos:\s*\{\s*nombre:\s*cliente\.nombre\s*\}/)
  })

  it('FASE 3: PUT no sincroniza contactos inline', () => {
    // El handler no debe tocar contactoCliente; eso es responsabilidad de
    // POST/PATCH/DELETE /api/clientes/[id]/contactos.
    expect(putSource).not.toMatch(/contactoCliente\.deleteMany/)
    expect(putSource).not.toMatch(/contactoCliente\.createMany/)
    // Patrón legacy eliminado (no más data.contactos = data.contactos.filter)
    expect(putSource).not.toMatch(/data\.contactos\s*=\s*data\.contactos\.filter/)
  })
})

describe('F-N20: el PATCH y DELETE siguen intactos', () => {
  it('FIX: el PATCH no se tocó', () => {
    const patchStart = source.indexOf('export async function PATCH')
    const deleteStart = source.indexOf('export async function DELETE')
    const patchSource = source.substring(patchStart, deleteStart)

    expect(patchSource).not.toMatch(/updateMany.*updatedAt/)  // no se refactorizó
  })
})
