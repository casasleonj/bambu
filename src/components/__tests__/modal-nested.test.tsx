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

// #594: el body no puede quedar con overflow:hidden según el orden de cierre.
function Apilados({ n }: { n: number }) {
  const [abiertos, setAbiertos] = useState<boolean[]>(() => Array.from({ length: n }, () => true))
  const cerrar = (idx: number[]) => setAbiertos(prev => prev.map((v, i) => (idx.includes(i) ? false : v)))
  return <>
    {abiertos.map((open, i) => (
      <Modal key={i} open={open} title={`M${i}`} onClose={() => cerrar([i])}>
        <button onClick={() => cerrar([i])}>cerrar {i}</button>
        <button onClick={() => cerrar(abiertos.map((_, j) => j))}>todos</button>
        <button onClick={() => cerrar([0])}>abajo {i}</button>
      </Modal>
    ))}
  </>
}

it('cerrar el modal de abajo primero no deja el body bloqueado', () => {
  render(<Apilados n={2} />)
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getAllByText('abajo 0')[0])
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByText('cerrar 1'))
  expect(document.body.style.overflow).toBe('')
})

it('cerrar dos modales apilados en el mismo render restaura el body (Volver a Pedidos)', () => {
  render(<Apilados n={2} />)
  fireEvent.click(screen.getAllByText('todos')[1])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.body.style.overflow).toBe('')
})

it('tres modales apilados cerrados desordenados restauran el valor original', () => {
  document.body.style.overflow = 'scroll'
  render(<Apilados n={3} />)
  fireEvent.click(screen.getByText('cerrar 1'))
  fireEvent.click(screen.getByText('cerrar 2'))
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByText('cerrar 0'))
  expect(document.body.style.overflow).toBe('scroll')
  document.body.style.overflow = ''
})
