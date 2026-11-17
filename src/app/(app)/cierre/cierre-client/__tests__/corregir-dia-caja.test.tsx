// @tests #834 — «Cambiar el día de caja» de un pago de comisión (maqueta aprobada por el PO): solo ADMIN, motivo obligatorio,
// errores junto al campo, reintento con la misma clave, y las correcciones posteriores explicadas en un cierre ya cerrado.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { CorregirDiaCaja } from '../corregir-dia-caja'
import { FechasPagosComision } from '../fechas-pagos-comision'
import type { PagoComisionCaja } from '@/lib/comision-pagada'

vi.mock('@/lib/dates', () => ({ getTodayString: () => '2026-11-17' }))
const toastOk = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastOk(...a), error: (...a: unknown[]) => toastError(...a) } }))
const fetchMock = vi.fn()

// El texto de las fechas lo da Intl (`es-CO`) y cambia de una versión de ICU a otra («12 nov 2026» o «12 de nov de 2026»):
// se calcula igual que la pantalla en vez de escribirlo a mano.
const largo = (d: string) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })
const corto = (d: string) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })

const pago: PagoComisionCaja = {
  id: 'p1', trabajadorId: 't1', nombre: 'Repartidor Ejemplo', monto: 1200, metodo: 'EFECTIVO',
  fechaTrabajo: '2026-11-12', fechaPagoReal: '2026-11-13', registradoAt: '2026-11-16T15:42:00.000Z', correccion: null,
}
const sinVerificar: PagoComisionCaja = { ...pago, id: 'p2', fechaPagoReal: null }
const abrir = (id = 'p1') => fireEvent.click(screen.getByTestId(`pago-corregir-dia-abrir-${id}`))
const llenar = (id: string, fecha: string, motivo = '') => {
  fireEvent.change(screen.getByTestId(`cdc-${id}-fecha`), { target: { value: fecha } })
  if (motivo) fireEvent.change(screen.getByTestId(`cdc-${id}-motivo`), { target: { value: motivo } })
}
const guardar = (id = 'p1') => fireEvent.click(screen.getByTestId(`cdc-${id}-guardar`))
const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, status: 201, json: async () => ({ success: true, ...extra }) })
const falla = (status: number, code: string, message: string) => ({ ok: false, status, json: async () => ({ error: { code, message } }) })

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('CorregirDiaCaja', () => {
  it('recogido: un enlace; el texto cambia si el pago está «sin verificar»', () => {
    const { unmount } = render(<CorregirDiaCaja pago={pago} onCorregido={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cambiar el día de caja' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount()
    render(<CorregirDiaCaja pago={sinVerificar} onCorregido={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Fijar el día real' })).toBeInTheDocument()
  })

  it('la ventana explica el pago, acota el día entre el trabajo y hoy y avisa que un cierre no cambia', () => {
    render(<CorregirDiaCaja pago={pago} onCorregido={vi.fn()} />)
    abrir()
    const dlg = screen.getByRole('dialog', { name: 'Cambiar el día de caja' })
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveTextContent('Repartidor Ejemplo')
    expect(dlg).toHaveTextContent(`Trabajo del ${largo('2026-11-12')}`)
    const fecha = screen.getByLabelText('¿Qué día salió el dinero?')
    expect(fecha).toHaveAttribute('min', '2026-11-12')
    expect(fecha).toHaveAttribute('max', '2026-11-17')
    expect(screen.getByLabelText('¿Por qué se corrige?')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('su cierre no cambia')
  })

  it('«sin verificar» usa las preguntas de la maqueta para comprobar el día', () => {
    render(<CorregirDiaCaja pago={sinVerificar} onCorregido={vi.fn()} />)
    abrir('p2')
    expect(screen.getByRole('dialog', { name: 'Fijar el día real del pago' })).toBeInTheDocument()
    expect(screen.getByLabelText('¿Qué día se entregó el dinero?')).toBeInTheDocument()
    expect(screen.getByLabelText('¿Cómo lo comprobaste?')).toBeInTheDocument()
  })

  it('valida en pantalla antes de enviar: sin día, antes del trabajo, futuro, mismo día y sin motivo', () => {
    render(<CorregirDiaCaja pago={pago} onCorregido={vi.fn()} />)
    abrir()
    fireEvent.change(screen.getByTestId('cdc-p1-fecha'), { target: { value: '' } })
    guardar()
    expect(screen.getByText('Elige el día en que salió el dinero.')).toBeInTheDocument()
    llenar('p1', '2026-11-11', 'Motivo válido'); guardar()
    expect(screen.getByText(`No puede ser anterior al día trabajado (${corto('2026-11-12')}). Elige ese día o uno posterior.`)).toBeInTheDocument()
    llenar('p1', '2026-11-18'); guardar()
    expect(screen.getByText('No puedes elegir un día que no ha llegado. Elige hoy o uno anterior.')).toBeInTheDocument()
    llenar('p1', '2026-11-13'); guardar()
    expect(screen.getByText('Ese ya es el día de caja de este pago.')).toBeInTheDocument()
    llenar('p1', '2026-11-15'); fireEvent.change(screen.getByTestId('cdc-p1-motivo'), { target: { value: 'ab' } }); guardar()
    expect(screen.getByText('Cuéntanos por qué se corrige.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('guarda con el día, el motivo recortado y una clave de reintento; cierra y refresca', async () => {
    fetchMock.mockResolvedValue(ok())
    const onCorregido = vi.fn()
    render(<CorregirDiaCaja pago={pago} onCorregido={onCorregido} />)
    abrir()
    llenar('p1', '2026-11-15', '  Se entregó el domingo  ')
    guardar()
    await waitFor(() => expect(onCorregido).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/nomina/pagos-comision/p1/corregir-fecha')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ fechaPagoReal: '2026-11-15', motivo: 'Se entregó el domingo' })
    expect(body.offlineId).toMatch(/^cdc-/)
    expect(toastOk).toHaveBeenCalledWith(expect.stringContaining(`ahora es el ${largo('2026-11-15')}`))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('si el servidor avisa de un cierre ya hecho, el aviso final dice que ese cierre no cambia', async () => {
    fetchMock.mockResolvedValue(ok({ diasCerrados: ['2026-11-13'] }))
    render(<CorregirDiaCaja pago={pago} onCorregido={vi.fn()} />)
    abrir(); llenar('p1', '2026-11-15', 'Motivo válido'); guardar()
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith(expect.stringContaining(`El cierre del ${corto('2026-11-13')} no cambia.`)))
  })

  it('los errores de campos del servidor salen junto al campo, sin aviso flotante, y se conserva lo escrito', async () => {
    fetchMock.mockResolvedValue(falla(422, 'FECHA_PAGO_ANTERIOR_AL_TRABAJO', 'No puede ser anterior al día trabajado (2026-11-12).'))
    render(<CorregirDiaCaja pago={pago} onCorregido={vi.fn()} />)
    abrir(); llenar('p1', '2026-11-15', 'Motivo válido'); guardar()
    expect(await screen.findByText('No puede ser anterior al día trabajado (2026-11-12).')).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
    expect((screen.getByTestId('cdc-p1-motivo') as HTMLInputElement).value).toBe('Motivo válido')
    fetchMock.mockResolvedValue(falla(422, 'MOTIVO_REQUERIDO', 'x'))
    guardar()
    expect(await screen.findByText('Cuéntanos por qué se corrige.')).toBeInTheDocument()
  })

  it('un error de otro tipo se avisa con su mensaje; una falla de red pide reintentar y reusa la misma clave', async () => {
    fetchMock.mockResolvedValueOnce(falla(500, 'X', 'No se pudo guardar la corrección.'))
    fetchMock.mockRejectedValueOnce(new Error('red'))
    fetchMock.mockResolvedValueOnce(ok())
    const onCorregido = vi.fn()
    render(<CorregirDiaCaja pago={pago} onCorregido={onCorregido} />)
    abrir(); llenar('p1', '2026-11-15', 'Motivo válido')
    guardar()
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No se pudo guardar la corrección.'))
    guardar()
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Sin conexión: la corrección no se guardó. Vuelve a intentarlo.'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    guardar()
    await waitFor(() => expect(onCorregido).toHaveBeenCalled())
    const claves = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).offlineId)
    expect(new Set(claves).size).toBe(1)
  })

  it('mientras se guarda, campos y botones quedan desactivados', async () => {
    let resolver: (v: unknown) => void = () => undefined
    fetchMock.mockReturnValue(new Promise((r) => { resolver = r }))
    render(<CorregirDiaCaja pago={pago} onCorregido={vi.fn()} />)
    abrir(); llenar('p1', '2026-11-15', 'Motivo válido'); guardar()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled())
    expect(screen.getByTestId('cdc-p1-fecha')).toBeDisabled()
    expect(screen.getByTestId('cdc-p1-cancelar')).toBeDisabled()
    resolver(ok())
  })

  it('Cancelar y Escape cierran sin enviar y descartan lo escrito', () => {
    render(<CorregirDiaCaja pago={pago} onCorregido={vi.fn()} />)
    abrir(); llenar('p1', '2026-11-15', 'Algo')
    fireEvent.click(screen.getByTestId('cdc-p1-cancelar'))
    expect(screen.queryByRole('dialog')).toBeNull()
    abrir()
    expect((screen.getByTestId('cdc-p1-motivo') as HTMLInputElement).value).toBe('')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('FechasPagosComision — quién ve qué (#834)', () => {
  const props = { pagos: [pago], efectivo: 1200, sinFechaVerificada: 0 }

  it('el ADMIN ve «Cambiar el día de caja»; quien no puede corregir, el reporte y las pantallas sin refresco no lo ven', () => {
    const { unmount } = render(<FechasPagosComision {...props} puedeCorregir onCorregido={vi.fn()} />)
    expect(screen.getByTestId('pago-corregir-dia-abrir-p1')).toBeInTheDocument()
    unmount()
    const sin = render(<FechasPagosComision {...props} />)
    expect(screen.queryByTestId('pago-corregir-dia-abrir-p1')).toBeNull()
    sin.unmount()
    render(<FechasPagosComision {...props} puedeCorregir />)
    expect(screen.queryByTestId('pago-corregir-dia-abrir-p1')).toBeNull()
  })

  it('un pago ya corregido muestra quién, cuándo y por qué, a todos', () => {
    const corregido: PagoComisionCaja = { ...pago, correccion: { por: 'Admin Ejemplo', at: '2026-11-17T14:00:00.000Z', motivo: 'Se entregó el domingo', anterior: '2026-11-13', nueva: '2026-11-15' } }
    render(<FechasPagosComision {...props} pagos={[corregido]} />)
    expect(screen.getByTestId('pago-correccion-p1')).toHaveTextContent('Día real corregido por Admin Ejemplo')
    expect(screen.getByTestId('pago-correccion-p1')).toHaveTextContent('Motivo: Se entregó el domingo')
  })

  it('en un cierre ya cerrado, las correcciones posteriores explican la diferencia y no cambian cifras', () => {
    render(<FechasPagosComision pagos={[]} efectivo={0} sinFechaVerificada={0} abierto conciliacion={{
      original: 1200, actual: 0, diferencia: -1200, pagosCaja: [], sinFechaVerificada: 0,
      correccionesPosteriores: [
        { pagoId: 'p1', trabajador: 'Repartidor Ejemplo', monto: 1200, anterior: '2026-11-13', nueva: '2026-11-15', por: 'Admin Ejemplo', at: '2026-11-17T14:00:00.000Z', motivo: 'Se entregó el domingo', efecto: 'sale' },
        { pagoId: 'p2', trabajador: 'Otro Ejemplo', monto: 700, anterior: null, nueva: '2026-11-13', por: 'Admin Ejemplo', at: '2026-11-17T14:05:00.000Z', motivo: 'Comprobado con el propietario', efecto: 'entra' },
      ],
    }} />)
    const bloque = screen.getByTestId('comisiones-correcciones-posteriores')
    expect(bloque).toHaveTextContent('Correcciones de fecha posteriores al cierre')
    expect(bloque).toHaveTextContent(`el día real pasó del ${largo('2026-11-13')} al ${largo('2026-11-15')}`)
    expect(bloque).toHaveTextContent(`de sin verificar al ${largo('2026-11-13')}`)
    expect(bloque).toHaveTextContent('Explican la diferencia de este día')
    expect(screen.getByText(/Diferencia por conciliar/)).toBeInTheDocument()
  })

  it('sin correcciones posteriores no aparece esa sección', () => {
    render(<FechasPagosComision pagos={[]} efectivo={0} sinFechaVerificada={0} abierto conciliacion={{ original: 0, actual: 0, diferencia: 0, pagosCaja: [], sinFechaVerificada: 0, correccionesPosteriores: [] }} />)
    expect(screen.queryByTestId('comisiones-correcciones-posteriores')).toBeNull()
  })
})
