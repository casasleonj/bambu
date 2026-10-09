// Incidente 2026-10-08: con el Hub apagado, las plantillas recurrentes activas
// quedaban sin entrada visible (Fase 8 sacó /recurrentes del nav y movió la
// generación al Hub). Prueba de comportamiento sobre el módulo real, con el
// flag ON y OFF (el flag se evalúa al cargar el módulo).
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadNav(flag: 'true' | 'false') {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', flag)
  const mod = await import('../nav-data')
  return mod.navSections.flatMap(s => s.items)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('nav — Pedidos habituales (/recurrentes)', () => {
  it('Hub OFF: /recurrentes es visible con su permiso propio', async () => {
    const items = await loadNav('false')
    const rec = items.find(i => i.href === '/recurrentes')
    expect(rec).toBeDefined()
    expect(rec?.requiredPermission).toBe('view:recurrentes')
  })

  it('Hub ON: /recurrentes no se duplica en el nav (se opera desde el Hub)', async () => {
    const items = await loadNav('true')
    expect(items.some(i => i.href === '/recurrentes')).toBe(false)
  })
})
