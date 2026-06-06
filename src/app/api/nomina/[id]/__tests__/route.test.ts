// @tests nomina/[id] route — F-N9 fix verification (atomic check-and-set)
// Hallazgo: en PAGAR y ANULAR, findUnique + check + update permitía que
// 2 requests simultáneos ambos leyeran estado=PENDIENTE, ambos pasaran
// el check, ambos hicieran update, y ambos crearan un Gasto con el
// mismo monto → doble egreso de caja.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/nomina/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N9: PAGAR usa updateMany atómico (no findUnique + update)', () => {
  it('FIX: el bloque PAGAR usa updateMany con where id+estado=PENDIENTE', () => {
    // Extraer el bloque PAGAR
    const pagarMatch = source.match(/action === 'PAGAR'[\s\S]{0,2500}/)
    expect(pagarMatch).not.toBeNull()
    const pagarBlock = pagarMatch![0]

    // Debe usar updateMany
    expect(pagarBlock).toMatch(/tx\.nomina\.updateMany\(/)
    // Con condición de estado
    expect(pagarBlock).toMatch(/estado:\s*['"]PENDIENTE['"]/)
    // Data setea PAGADA + fechaPago
    expect(pagarBlock).toMatch(/estado:\s*['"]PAGADA['"]/)
    expect(pagarBlock).toMatch(/fechaPago:\s*new Date\(\)/)
  })

  it('FIX: el bloque PAGAR valida count === 0 para detectar doble pago', () => {
    const pagarMatch = source.match(/action === 'PAGAR'[\s\S]{0,2500}/)
    const pagarBlock = pagarMatch![0]

    expect(pagarBlock).toMatch(/updateResult\.count\s*===\s*0/)
    // Mensaje específico para "ya está pagada"
    expect(pagarBlock).toMatch(/La nómina ya está pagada/)
  })

  it('FIX: el bloque PAGAR ya no tiene el findUnique+update vulnerable', () => {
    // El patrón viejo era:
    //   const nomina = await tx.nomina.findUnique(...)
    //   if (nomina.estado === 'PAGADA') throw ...
    //   const updated = await tx.nomina.update(...)
    // Ahora debe ser:
    //   const updateResult = await tx.nomina.updateMany(...)
    //   if (updateResult.count === 0) throw ...
    const pagarMatch = source.match(/action === 'PAGAR'[\s\S]{0,2500}/)
    const pagarBlock = pagarMatch![0]

    // El update simple (sin count check) ya no debe estar
    // Permitimos findUnique solo para re-leer después del updateMany
    // pero NO debe haber un check de estado sobre esa lectura
    const hasUpdateSimple = /tx\.nomina\.update\(\s*\{[\s\S]{0,200}data:\s*\{\s*estado:\s*['"]PAGADA['"]/.test(pagarBlock)
    expect(hasUpdateSimple).toBe(false)
  })
})

describe('F-N9: ANULAR usa updateMany atómico', () => {
  it('FIX: el bloque ANULAR usa updateMany con where id+estado IN (PENDIENTE, PAGADA)', () => {
    const anularMatch = source.match(/action === 'ANULAR'[\s\S]{0,3500}/)
    expect(anularMatch).not.toBeNull()
    const anularBlock = anularMatch![0]

    expect(anularBlock).toMatch(/tx\.nomina\.updateMany\(/)
    // Acepta PENDIENTE o PAGADA (anular una PAGADA crea reversión)
    expect(anularBlock).toMatch(/estado:\s*\{\s*in:\s*\[\s*['"]PENDIENTE['"]\s*,\s*['"]PAGADA['"]/)
  })

  it('FIX: el bloque ANULAR valida count === 0', () => {
    const anularMatch = source.match(/action === 'ANULAR'[\s\S]{0,3500}/)
    const anularBlock = anularMatch![0]

    expect(anularBlock).toMatch(/updateResult\.count\s*===\s*0/)
  })

  it('FIX: el bloque ANULAR mantiene la lógica de reversión si era PAGADA', () => {
    const anularMatch = source.match(/action === 'ANULAR'[\s\S]{0,3500}/)
    const anularBlock = anularMatch![0]

    // Debe verificar el estado ANTERIOR (before.estado === 'PAGADA')
    // para saber si crear el gasto de reversión
    expect(anularBlock).toMatch(/before\.estado\s*===\s*['"]PAGADA['"]/)
    expect(anularBlock).toMatch(/Reversión nómina anulada/)
    expect(anularBlock).toMatch(/monto:\s*-Number\(before\.total\)/)
  })

  it('FIX: el bloque ANULAR sigue revirtiendo descuentos aplicados', () => {
    const anularMatch = source.match(/action === 'ANULAR'[\s\S]{0,3500}/)
    const anularBlock = anularMatch![0]

    expect(anularBlock).toMatch(/tx\.descuentoRepartidor\.updateMany/)
    expect(anularBlock).toMatch(/aplicadoEnNomina:\s*true/)
    expect(anularBlock).toMatch(/aplicadoEnNomina:\s*false/)
  })
})

describe('F-N9: ambos bloques están dentro de prisma.$transaction', () => {
  it('FIX: PAGAR mantiene la tx (atomicidad de update + gasto.create)', () => {
    const pagarMatch = source.match(/action === 'PAGAR'[\s\S]{0,2500}/)
    const pagarBlock = pagarMatch![0]

    expect(pagarBlock).toMatch(/prisma\.\$transaction\(async \(tx\)/)
    expect(pagarBlock).toMatch(/tx\.gasto\.create/)
  })

  it('FIX: ANULAR mantiene la tx', () => {
    const anularMatch = source.match(/action === 'ANULAR'[\s\S]{0,3500}/)
    const anularBlock = anularMatch![0]

    expect(anularBlock).toMatch(/prisma\.\$transaction\(async \(tx\)/)
  })
})
