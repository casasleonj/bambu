// @tests #451: casilla "Puede autorizar reducciones de pedido" en el modal de usuario
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminUserFormModal } from '../admin-user-form-modal'
import type { AdminUser } from '../types'

const base: AdminUser = {
  id: 'u1', username: 'laura', nombre: 'Laura', apellido: 'Pérez', rol: 'ASISTENTE', activo: true,
  puedeAutorizarExcepcionCredito: false, puedeAutorizarReduccionComercial: false, createdAt: new Date().toISOString(),
}

function abrir(user: AdminUser) {
  const onSaved = vi.fn()
  const { rerender } = render(<AdminUserFormModal open={false} onClose={() => {}} onSaved={onSaved} user={null} otrosAutorizadores={1} />)
  rerender(<AdminUserFormModal open onClose={() => {}} onSaved={onSaved} user={user} otrosAutorizadores={1} />)
  return { onSaved }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('AdminUserFormModal: permiso de autorizar reducciones de pedido', () => {
  it('Admin y Asistente ven la casilla; otros roles no', () => {
    abrir(base)
    expect(screen.getByTestId('check-autoriza-reduccion')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'REPARTIDOR' } })
    expect(screen.queryByTestId('check-autoriza-reduccion')).toBeNull()
  })

  it('marcar la casilla envía solo ese permiso en el PUT', async () => {
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ user: {} }), { status: 200 })))
    vi.stubGlobal('fetch', f)
    const { onSaved } = abrir(base)
    fireEvent.click(screen.getByTestId('check-autoriza-reduccion'))
    fireEvent.submit(screen.getByTestId('check-autoriza-reduccion').closest('form')!)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ puedeAutorizarReduccionComercial: true })
  })

  it('un usuario que ya lo tiene muestra la casilla marcada y se puede quitar', async () => {
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ user: {} }), { status: 200 })))
    vi.stubGlobal('fetch', f)
    const { onSaved } = abrir({ ...base, puedeAutorizarReduccionComercial: true })
    const check = screen.getByTestId('check-autoriza-reduccion') as HTMLInputElement
    expect(check.checked).toBe(true)
    fireEvent.click(check)
    fireEvent.submit(check.closest('form')!)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ puedeAutorizarReduccionComercial: false })
  })
})
