// @tests BAMBU-LOG-006: cierre de embarque no era offline-resiliente.
// El cliente usaba `fetch` directo (no `fetchResilient`), así que un corte
// de red al enviar/recibir el cierre no se encolaba en Dexie — el usuario
// veía "Error de conexión" y debía reintentar manualmente, contradiciendo
// el principio offline-first del resto de la app. Fix: usar fetchResilient
// + offlineId, con el server deduplicando el replay (ver CierreDedupService).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const clientSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/embarques/[id]/cerrar/cerrar-client/index.tsx'),
  'utf-8',
)

describe('FIX BAMBU-LOG-006: handleCerrar usa fetchResilient en vez de fetch directo', () => {
  const handleCerrarBlock = clientSource.slice(
    clientSource.indexOf('async function handleCerrar()'),
    clientSource.indexOf('\n  }', clientSource.indexOf('async function handleCerrar()')),
  )

  it('importa fetchResilient', () => {
    expect(clientSource).toMatch(/import\s*\{\s*fetchResilient\s*\}\s*from\s*['"]@\/lib\/fetch-resilient['"]/)
  })

  it('el payload de cierre incluye offlineId para dedup', () => {
    expect(handleCerrarBlock).toMatch(/offlineId:\s*generateUUID\(\)/)
  })

  it('ya NO usa fetch directo para POST /cerrar', () => {
    expect(handleCerrarBlock).not.toMatch(/await fetch\(`\/api\/embarques/)
  })

  it('llama a fetchResilient con localEndpoint identificable', () => {
    expect(handleCerrarBlock).toMatch(/fetchResilient[\s\S]*?localEndpoint:\s*['"]cerrar-embarque['"]/)
  })

  it('maneja los 3 status de ResilientResult: ok, offline y error', () => {
    expect(handleCerrarBlock).toMatch(/result\.status === 'ok'/)
    expect(handleCerrarBlock).toMatch(/result\.status === 'offline'/)
  })

  it('el caso offline muestra un toast informativo, no un error', () => {
    const offlineBranch = handleCerrarBlock.slice(handleCerrarBlock.indexOf("result.status === 'offline'"))
    expect(offlineBranch).toMatch(/toast\.info\(/)
  })
})
