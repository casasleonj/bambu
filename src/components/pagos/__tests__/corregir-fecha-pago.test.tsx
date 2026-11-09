// @tests #617 — corregir la fecha efectiva de un cobro: motivo, confirmación, carga y errores
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CorregirFechaPago } from '../corregir-fecha-pago'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Registrado el 8 nov 09:12 (Bogotá); hoy figura cobrado el 7 nov.
const props = { pagoId: 'pg1', fechaEfectiva: '2026-11-07T17:00:00Z', fechaRegistro: '2026-11-08T14:12:00Z' }

function llenar(dia = '2026-11-08', motivo = 'Error de digitación') {
  fireEvent.change(screen.getByTestId('pago-corregir-fecha-dia'), { target: { value: dia } })
  fireEvent.change(screen.getByTestId('pago-corregir-fecha-motivo'), { target: { value: motivo } })
}

describe('CorregirFechaPago (#617)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('arranca cerrado y solo muestra el botón; al abrir explica qué cambia y qué no', () => {
    render(<CorregirFechaPago {...props} onCorregida={vi.fn()} />)
    expect(screen.queryByTestId('pago-corregir-fecha-form')).toBeNull()
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-abrir'))
    expect(screen.getByTestId('pago-corregir-fecha-form').textContent).toMatch(/No cambia la fecha de registro ni el cierre de caja/)
  })

  it('sin motivo o con la misma fecha, «Revisar» está bloqueado y dice por qué', () => {
    render(<CorregirFechaPago {...props} onCorregida={vi.fn()} />)
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-abrir'))
    const revisar = screen.getByTestId('pago-corregir-fecha-revisar') as HTMLButtonElement
    expect(revisar.disabled).toBe(true)
    expect(screen.getByTestId('pago-corregir-fecha-falta').textContent).toMatch(/Falta el motivo/)
    llenar('2026-11-07', 'motivo válido') // la misma fecha que ya tiene
    expect(revisar.disabled).toBe(true)
    llenar('2026-11-08', 'motivo válido')
    expect(revisar.disabled).toBe(false)
  })

  it('el selector no deja pasar del día de registro', () => {
    render(<CorregirFechaPago {...props} onCorregida={vi.fn()} />)
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-abrir'))
    expect(screen.getByTestId('pago-corregir-fecha-dia').getAttribute('max')).toBe('2026-11-08')
    llenar('2026-11-09', 'motivo válido') // posterior al registro
    expect((screen.getByTestId('pago-corregir-fecha-revisar') as HTMLButtonElement).disabled).toBe(true)
  })

  it('confirma antes de enviar: «Volver» no envía; «Confirmar cambio» envía fecha, motivo y clave, y avisa al detalle', async () => {
    const onCorregida = vi.fn()
    const posts: Array<Record<string, unknown>> = []
    global.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ success: true }), { status: 201 })
    }) as unknown as typeof fetch
    render(<CorregirFechaPago {...props} onCorregida={onCorregida} />)
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-abrir'))
    llenar()
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-revisar'))
    const bloque = screen.getByTestId('pago-corregir-fecha-confirmar-bloque').textContent ?? ''
    expect(bloque).toMatch(/¿Cambiar la fecha del cobro\?/)
    expect(bloque).toMatch(/Error de digitación/)
    expect(bloque).toMatch(/no cambia/i)
    expect(posts).toHaveLength(0)

    fireEvent.click(screen.getByTestId('pago-corregir-fecha-volver'))
    expect(posts).toHaveLength(0)
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-revisar'))
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-confirmar'))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ fecha: '2026-11-08', motivo: 'Error de digitación' })
    expect(typeof posts[0].offlineId).toBe('string')
    await waitFor(() => expect(onCorregida).toHaveBeenCalledTimes(1))
  })

  it('mientras guarda dice «Guardando…»; si el servidor rechaza (día cerrado) muestra el motivo y conserva lo escrito', async () => {
    let responder: (r: Response) => void = () => {}
    global.fetch = vi.fn(() => new Promise<Response>((res) => { responder = res })) as unknown as typeof fetch
    const onCorregida = vi.fn()
    render(<CorregirFechaPago {...props} onCorregida={onCorregida} />)
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-abrir'))
    llenar()
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-revisar'))
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-confirmar'))
    await waitFor(() => expect(screen.getByTestId('pago-corregir-fecha-confirmar').textContent).toBe('Guardando…'))
    expect((screen.getByTestId('pago-corregir-fecha-confirmar') as HTMLButtonElement).disabled).toBe(true)
    responder(new Response(JSON.stringify({ success: false, error: { code: 'DIA_CERRADO', message: 'El 2026-11-07 ya está cerrado. Para corregir hace falta una regularización formal (#402).' } }), { status: 409 }))
    expect((await screen.findByTestId('pago-corregir-fecha-error')).textContent).toMatch(/regularización formal/)
    expect(onCorregida).not.toHaveBeenCalled()
    expect((screen.getByTestId('pago-corregir-fecha-motivo') as HTMLTextAreaElement).value).toBe('Error de digitación')
    expect(screen.getByTestId('pago-corregir-fecha-revisar')).toBeTruthy() // se puede volver a intentar
  })

  it('sin conexión avisa que necesita red', async () => {
    global.fetch = vi.fn(async () => { throw new TypeError('network') }) as unknown as typeof fetch
    render(<CorregirFechaPago {...props} onCorregida={vi.fn()} />)
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-abrir'))
    llenar()
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-revisar'))
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-confirmar'))
    expect((await screen.findByTestId('pago-corregir-fecha-error')).textContent).toMatch(/necesita red/)
  })
})
