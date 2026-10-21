// @tests P0-3 PR 3 (#357): casilla "Puede autorizar excepciones de crédito" en el modal de usuario
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminUserFormModal } from '../admin-user-form-modal'
import type { AdminUser } from '../types'

const base: AdminUser = {
  id: 'u1', username: 'laura', nombre: 'Laura', apellido: 'Pérez', rol: 'ASISTENTE', activo: true,
  puedeAutorizarExcepcionCredito: false, createdAt: new Date().toISOString(),
}

function abrir(user: AdminUser, otros = 1) {
  const onSaved = vi.fn()
  // como en la pantalla real: el modal nace cerrado y se abre con el usuario a editar
  const { rerender } = render(<AdminUserFormModal open={false} onClose={() => {}} onSaved={onSaved} user={null} otrosAutorizadores={otros} />)
  rerender(<AdminUserFormModal open onClose={() => {}} onSaved={onSaved} user={user} otrosAutorizadores={otros} />)
  return { onSaved }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('AdminUserFormModal: permiso de autorizar excepciones de crédito', () => {
  it('Admin y Asistente ven la casilla; otros roles no', () => {
    abrir(base)
    expect(screen.getByTestId('check-autoriza-credito')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'REPARTIDOR' } })
    expect(screen.queryByTestId('check-autoriza-credito')).toBeNull()
  })

  it('marcar la casilla envía el permiso en el PUT', async () => {
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ user: {} }), { status: 200 })))
    vi.stubGlobal('fetch', f)
    const { onSaved } = abrir(base)
    fireEvent.click(screen.getByTestId('check-autoriza-credito'))
    fireEvent.submit(screen.getByTestId('check-autoriza-credito').closest('form')!)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/users/u1')
    expect(JSON.parse(String(init.body))).toEqual({ puedeAutorizarExcepcionCredito: true })
  })

  it('la última persona autorizadora no puede perder el permiso: casilla bloqueada con aviso', () => {
    abrir({ ...base, puedeAutorizarExcepcionCredito: true }, 0)
    expect(screen.getByTestId('check-autoriza-credito')).toBeDisabled()
    expect(screen.getByTestId('aviso-ultimo-autorizador')).toHaveTextContent(/única persona/)
  })

  it('con otra persona autorizadora, la casilla se puede desmarcar', () => {
    abrir({ ...base, puedeAutorizarExcepcionCredito: true }, 1)
    expect(screen.getByTestId('check-autoriza-credito')).not.toBeDisabled()
  })

  it('al elegir un rol sin derecho avisa que se quita el permiso', () => {
    abrir({ ...base, puedeAutorizarExcepcionCredito: true }, 1)
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'CONTADOR' } })
    expect(screen.getByTestId('aviso-quita-permiso')).toBeInTheDocument()
  })
})
