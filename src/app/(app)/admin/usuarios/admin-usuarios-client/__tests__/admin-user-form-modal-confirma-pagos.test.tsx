// @tests #406: casilla "Puede confirmar pagos" en el modal de usuario (maqueta aprobada por el PO)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminUserFormModal } from '../admin-user-form-modal'
import { AdminUserCard } from '../admin-user-card'
import type { AdminUser } from '../types'

const base: AdminUser = {
  id: 'u1', username: 'lilia', nombre: 'Lilia', apellido: '', rol: 'ASISTENTE', activo: true,
  puedeAutorizarExcepcionCredito: false, puedeAutorizarReduccionComercial: false, puedeConfirmarPagos: false,
  createdAt: new Date().toISOString(),
}

function abrir(user: AdminUser) {
  const onSaved = vi.fn()
  const { rerender } = render(<AdminUserFormModal open={false} onClose={() => {}} onSaved={onSaved} user={null} otrosAutorizadores={1} />)
  rerender(<AdminUserFormModal open onClose={() => {}} onSaved={onSaved} user={user} otrosAutorizadores={1} />)
  return { onSaved }
}
const fetchOk = () => {
  const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ user: {} }), { status: 200 })))
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => { vi.restoreAllMocks() })

describe('AdminUserFormModal: permiso de confirmar pagos', () => {
  it('Admin, Asistente y Contador pueden marcarla; el Repartidor no (casilla bloqueada y con aviso)', () => {
    abrir(base)
    expect((screen.getByTestId('check-confirma-pagos') as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'CONTADOR' } })
    expect((screen.getByTestId('check-confirma-pagos') as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'REPARTIDOR' } })
    expect((screen.getByTestId('check-confirma-pagos') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByTestId('aviso-confirma-rol')).toBeInTheDocument()
  })

  it('marcarla envía solo ese permiso en el PUT', async () => {
    const f = fetchOk()
    const { onSaved } = abrir(base)
    fireEvent.click(screen.getByTestId('check-confirma-pagos'))
    fireEvent.submit(screen.getByTestId('check-confirma-pagos').closest('form')!)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ puedeConfirmarPagos: true })
  })

  it('quien ya la tiene la ve marcada y se puede quitar', async () => {
    const f = fetchOk()
    const { onSaved } = abrir({ ...base, puedeConfirmarPagos: true })
    const check = screen.getByTestId('check-confirma-pagos') as HTMLInputElement
    expect(check.checked).toBe(true)
    fireEvent.click(check)
    fireEvent.submit(check.closest('form')!)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ puedeConfirmarPagos: false })
  })

  it('la tarjeta muestra «Confirma pagos» solo a quien la tiene', () => {
    const { rerender } = render(<AdminUserCard user={base} onEdit={() => {}} onToggleStatus={() => {}} onResetPassword={() => {}} />)
    expect(screen.queryByTestId('badge-confirma-pagos')).toBeNull()
    rerender(<AdminUserCard user={{ ...base, puedeConfirmarPagos: true }} onEdit={() => {}} onToggleStatus={() => {}} onResetPassword={() => {}} />)
    expect(screen.getByTestId('badge-confirma-pagos')).toHaveTextContent('Confirma pagos')
  })
})
