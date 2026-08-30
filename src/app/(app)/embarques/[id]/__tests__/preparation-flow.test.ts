// @tests Preparation Flow (Fase 4) — deep-link `?step=` y navegación guiada
//
// Verifica el cableado del flujo guiado sin dead-ends:
//  - EmbarqueFormModal navega al detalle tras crear (guided)
//  - el detalle ejecuta `?step=` una vez y limpia la URL

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const detail = readFileSync(
  join(process.cwd(), 'src/app/(app)/embarques/[id]/embarque-client.tsx'),
  'utf-8',
)
const formModal = readFileSync(
  join(process.cwd(), 'src/app/(app)/embarques/embarques-client/embarque-form-modal.tsx'),
  'utf-8',
)
const card = readFileSync(
  join(process.cwd(), 'src/app/(app)/embarques/embarques-client/command-center/command-card.tsx'),
  'utf-8',
)

describe('EmbarqueFormModal — navegación guiada tras crear', () => {
  it('acepta la prop `guided` y navega a ?step=asignar solo online + create', () => {
    expect(formModal).toContain('guided')
    expect(formModal).toContain('router.push(`/embarques/${nuevoId}?step=asignar`)')
    // la guardia: no en edición, con id de servidor
    expect(formModal).toMatch(/guided\s*&&\s*!isEdit\s*&&\s*nuevoId/)
  })
})

describe('Command Center card — href al siguiente paso', () => {
  it('usa stepParaAccion para construir `?step=`', () => {
    expect(card).toContain('stepParaAccion(siguiente.accion)')
    expect(card).toContain('?step=${step}')
  })
})

describe('Detalle del embarque — manejo de `?step=`', () => {
  it('lee el param con useSearchParams', () => {
    expect(detail).toContain("useSearchParams")
    expect(detail).toContain("searchParams.get('step')")
  })

  it('abre el modal correcto por step (ajuste de estado en render, con guardia)', () => {
    expect(detail).toMatch(/stepParam !== stepHandled/)
    expect(detail).toContain("stepParam === 'asignar') setShowAssignModal(true)")
    expect(detail).toMatch(/stepParam === 'editar' \|\| stepParam === 'carga'\) setShowEditModal\(true\)/)
  })

  it('enviar hace scroll al botón sin auto-disparar la mutación', () => {
    expect(detail).toContain('[data-testid="enviar-embarque-button"]')
    expect(detail).toContain('scrollIntoView')
    // no debe llamar handleEnviar() desde el efecto de step
    const efecto = detail.slice(detail.indexOf("stepParam === 'enviar'"), detail.indexOf("stepParam === 'enviar'") + 400)
    expect(efecto).not.toContain('handleEnviar()')
  })

  it('cerrar redirige a /cerrar; el resto limpia la URL', () => {
    expect(detail).toContain('router.replace(`/embarques/${embarque.id}/cerrar`)')
    expect(detail).toContain('router.replace(`/embarques/${embarque.id}`)')
  })
})
