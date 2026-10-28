import { it, expect } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Modal } from '../modal'
it('detalle y revisión tienen títulos propios, Escape solo cierra el detalle y restaura foco y bloqueo del fondo', async () => {
  function Flujo() {
    const [detalle, setDetalle] = useState(false)
    return <><Modal open title="Revisión" onClose={() => {}}><button onClick={() => setDetalle(true)}>Ver factura</button><button>Registrar</button></Modal><Modal open={detalle} title="Factura" onClose={() => setDetalle(false)}><button>Volver</button></Modal></>
  }
  const { unmount } = render(<Flujo />)
  const abrir = screen.getByRole('button', { name: 'Ver factura' })
  await waitFor(() => expect(abrir).toHaveFocus())
  fireEvent.click(abrir)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Volver' })).toHaveFocus())
  expect(screen.getByRole('dialog', { name: 'Factura' }).getAttribute('aria-labelledby')).not.toBe(screen.getByRole('dialog', { name: 'Revisión' }).getAttribute('aria-labelledby'))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Factura' })).toBeNull()
  expect(screen.getByRole('dialog', { name: 'Revisión' })).toBeVisible()
  expect(abrir).toHaveFocus()
  expect(document.body.style.overflow).toBe('hidden')
  unmount()
  expect(document.body.style.overflow).toBe('')
})
