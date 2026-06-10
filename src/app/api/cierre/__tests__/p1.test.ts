// @tests cierre POST P-1 performance optimization
// FIX P-1: optimización de performance en el cálculo de totales por
// método de pago. Antes: 5 iteraciones flatMap+filter+reduce sobre
// pedidos.pagos. Ahora: 1 sola pasada que computa todos los
// totales en O(N*M) en vez de O(5*N*M).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/cierre/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('P-1: cierre POST usa single-pass para totales por método de pago', () => {
  // Extraer el bloque POST
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: el código declara un objeto totalesPorMetodo con los 5 métodos', () => {
    // Debe tener un objeto con EFECTIVO, TRANSFERENCIA, NEQUI, DAVIPLATA, BONO
    const totalesMatch = postSource.match(/totalesPorMetodo[^=]*=\s*\{/)
    expect(totalesMatch).not.toBeNull()

    // Verificar que el objeto tiene los 5 métodos
    const objectMatch = postSource.match(/totalesPorMetodo:\s*Record<string,\s*number>\s*=\s*\{[\s\S]+?\}/)
    expect(objectMatch).not.toBeNull()
    expect(objectMatch![0]).toMatch(/EFECTIVO/)
    expect(objectMatch![0]).toMatch(/TRANSFERENCIA/)
    expect(objectMatch![0]).toMatch(/NEQUI/)
    expect(objectMatch![0]).toMatch(/DAVIPLATA/)
    expect(objectMatch![0]).toMatch(/BONO/)
  })

  it('FIX: hay un único for anidado que computa los totales', () => {
    // Debe haber un for (const pedido of pedidos) { for (const pago of pedido.pagos) { ... } }
    // que itera los pagos UNA vez
    const singlePassBlock = postSource.match(/for\s*\(const pedido of pedidos\)\s*\{[\s\S]{0,500}?for\s*\(const pago of pedido\.pagos\)/)
    expect(singlePassBlock).not.toBeNull()
  })

  it('FIX: el for asigna a totalesPorMetodo[pago.metodo]', () => {
    const singlePassBlock = postSource.match(/for\s*\(const pedido of pedidos\)[\s\S]+?totalesPorMetodo\[pago\.metodo\][\s\S]+?\}/)
    expect(singlePassBlock).not.toBeNull()
  })

  it('FIX: el código ya no usa flatMap + filter + reduce para pagos', () => {
    // Antes había 5 líneas como:
    //   const efectivo = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === MetodoPago.EFECTIVO).reduce(...)
    // Ahora deben estar reemplazadas.
    expect(postSource).not.toMatch(/pedidos\.flatMap\(p => p\.pagos\)\.filter\(p => p\.metodo === MetodoPago\.EFECTIVO\)/)
    expect(postSource).not.toMatch(/pedidos\.flatMap\(p => p\.pagos\)\.filter\(p => p\.metodo === MetodoPago\.TRANSFERENCIA\)/)
    expect(postSource).not.toMatch(/pedidos\.flatMap\(p => p\.pagos\)\.filter\(p => p\.metodo === MetodoPago\.NEQUI\)/)
    expect(postSource).not.toMatch(/pedidos\.flatMap\(p => p\.pagos\)\.filter\(p => p\.metodo === MetodoPago\.DAVIPLATA\)/)
    expect(postSource).not.toMatch(/pedidos\.flatMap\(p => p\.pagos\)\.filter\(p => p\.metodo === MetodoPago\.BONO\)/)
  })

  it('FIX: las constantes efectivo, transferencia, etc. vienen de totalesPorMetodo', () => {
    expect(postSource).toMatch(/const efectivo = totalesPorMetodo\[MetodoPago\.EFECTIVO\]/)
    expect(postSource).toMatch(/const transferencia = totalesPorMetodo\[MetodoPago\.TRANSFERENCIA\]/)
    expect(postSource).toMatch(/const nequi = totalesPorMetodo\[MetodoPago\.NEQUI\]/)
    expect(postSource).toMatch(/const daviplata = totalesPorMetodo\[MetodoPago\.DAVIPLATA\]/)
    expect(postSource).toMatch(/const bono = totalesPorMetodo\[MetodoPago\.BONO\]/)
  })

  it('FIX: cobroVentasHoy sigue sumando los 5 métodos', () => {
    expect(postSource).toMatch(/const cobroVentasHoy = efectivo \+ transferencia \+ nequi \+ daviplata \+ bono/)
  })

  it('FIX: hay un comentario P-1 explicando la optimización', () => {
    expect(postSource).toMatch(/P-1 \(performance optimization\)/)
  })
})
