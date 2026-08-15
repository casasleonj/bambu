// @tests BAMBU-LOG-009: el botón "Abrir ruta en Maps" del repartidor
// reconstruía los waypoints filtrando `embarque.ordenVisita.pedidoIds` —
// un pedido agregado al embarque DESPUÉS de optimizar el orden no está en
// esa lista, así que el `.filter(p => p != null)` lo descartaba en
// silencio. La lista en pantalla (`pedidosOrdenados`) sí incluía ese
// pedido al final (fallback ya implementado ahí). Fix: reusar
// `pedidosOrdenados` en `openRutaEnGoogleMaps` en vez de reconstruir la
// lista desde cero.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const clientSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/repartidor/repartidor-client.tsx'),
  'utf-8',
)

describe('FIX BAMBU-LOG-009: openRutaEnGoogleMaps usa pedidosOrdenados (con fallback)', () => {
  it('ya NO reconstruye la lista filtrando embarque.ordenVisita.pedidoIds', () => {
    const idx = clientSource.indexOf('const openRutaEnGoogleMaps = ()')
    const end = clientSource.indexOf('\n  }', idx)
    const block = clientSource.slice(idx, end)
    expect(block).not.toMatch(/embarque\.ordenVisita\?\.pedidoIds/)
  })

  it('usa pedidosOrdenados (mismo fallback que ya usa la lista en pantalla)', () => {
    const idx = clientSource.indexOf('const openRutaEnGoogleMaps = ()')
    const end = clientSource.indexOf('\n  }', idx)
    const block = clientSource.slice(idx, end)
    expect(block).toMatch(/const waypoints = pedidosOrdenados/)
  })
})
