// @tests #541 — panel «Reducir el pedido» según la maqueta v2 aprobada: lo que el sistema completa,
// lo que decide el usuario, confirmación, límites, errores y autorizar o rechazar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ReduccionComercialPanel } from '../reduccion-comercial-panel'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const lineas = [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, precio: 2500 }]
const cliente = {
  titular: 'Pedro Gómez', tienda: 'Tienda La Esperanza',
  contactos: [{ id: 'k1', nombre: 'Marta Ruiz', relacion: 'Encargada' }],
}
const pendiente = {
  id: 'r1', producto: 'PACA_AGUA', cantidadReducida: 5, cantPedidoAntes: 20, cantPedidoDespues: 15, monto: 12500,
  motivo: 'Ya no necesita el resto', aceptadoPor: 'Pedro Gómez', medio: 'TELEFONO', estado: 'PENDIENTE',
  solicitadoAt: '2026-10-31T22:42:00Z', resueltoAt: null,
  solicitadoPor: { nombre: 'Ana Gómez' }, resueltoPor: null, notaCredito: null, totalAntes: null, totalDespues: null,
}
const aplicada = { ...pendiente, id: 'r2', estado: 'APLICADA', resueltoAt: '2026-10-31T22:44:00Z', resueltoPor: { nombre: 'Luis Pérez' }, notaCredito: { numero: 'NC-00042' }, totalAntes: 50000, totalDespues: 37500 }

function mockFetch(opts: { reducciones?: unknown[]; puedeAutorizar?: boolean; post?: Response | (() => Promise<Response>); patch?: Response } = {}) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = []
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    llamadas.push({ url: u, init })
    if (init?.method === 'POST') {
      if (typeof opts.post === 'function') return opts.post()
      return opts.post ?? new Response(JSON.stringify({ success: true, estado: 'APLICADA' }), { status: 201 })
    }
    if (init?.method === 'PATCH') return opts.patch ?? new Response(JSON.stringify({ success: true, estado: 'APLICADA' }), { status: 200 })
    return new Response(JSON.stringify({ success: true, yo: { nombre: 'Ana Gómez' }, puedeAutorizar: opts.puedeAutorizar ?? false, cliente, reducciones: opts.reducciones ?? [] }), { status: 200 })
  }) as unknown as typeof fetch
  return llamadas
}

const props = { pedidoId: 'p1', lineas, userRole: 'ASISTENTE', reducible: true, total: 50000, totalPagado: 20000 }

async function abrir() {
  fireEvent.click(await screen.findByTestId('reduccion-abrir'))
  return screen.findByTestId('reduccion-form')
}
function completar() {
  fireEvent.click(screen.getByTestId('reduccion-medio-TELEFONO'))
  fireEvent.click(screen.getAllByTestId('reduccion-motivo-chip')[0])
}

describe('ReduccionComercialPanel', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('1. en reposo: solo el botón; con todo entregado y sin historial no aparece', async () => {
    mockFetch()
    const { container, rerender } = render(<ReduccionComercialPanel {...props} />)
    expect(await screen.findByTestId('reduccion-abrir')).toBeTruthy()
    rerender(<ReduccionComercialPanel {...props} lineas={[{ ...lineas[0], cantEntrega: 20 }]} />)
    await waitFor(() => expect(container.querySelector('[data-testid="reduccion-panel"]')).toBeNull())
  })

  it('2. el formulario viene con lo que el sistema sabe: cantidad = todo lo pendiente, titular marcado, y faltan solo cómo lo dijo y el motivo', async () => {
    mockFetch()
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    expect(screen.getByTestId('reduccion-cantidad').textContent).toBe('5')
    expect(screen.getByTestId('reduccion-quien-titular').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('reduccion-quien-titular').textContent).toContain('Pedro Gómez')
    for (const m of ['TELEFONO', 'PRESENCIAL', 'MENSAJE']) expect(screen.getByTestId(`reduccion-medio-${m}`).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('reduccion-falta').textContent).toMatch(/cómo lo dijo y el motivo/)
    expect((screen.getByTestId('reduccion-revisar') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('reduccion-auto').textContent).toMatch(/Ana Gómez \(tú\)/)
    expect(screen.getByTestId('reduccion-auto').textContent).toMatch(/2\.500/)
  })

  it('3. con dos toques queda completo y muestra el efecto exacto con la nota de crédito', async () => {
    mockFetch()
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    completar()
    expect((screen.getByTestId('reduccion-revisar') as HTMLButtonElement).disabled).toBe(false)
    const efecto = screen.getByTestId('reduccion-efecto').textContent ?? ''
    expect(efecto).toMatch(/12\.500/)
    expect(efecto).toMatch(/37\.500/)
    expect(efecto).toMatch(/nota de crédito/)
    expect(screen.queryByTestId('reduccion-falta')).toBeNull()
  })

  it('la cantidad se ajusta con − y + dentro del tope y recalcula el efecto', async () => {
    mockFetch()
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    fireEvent.click(screen.getByTestId('reduccion-menos'))
    expect(screen.getByTestId('reduccion-cantidad').textContent).toBe('4')
    expect(screen.getByTestId('reduccion-efecto').textContent).toMatch(/10\.000/)
    expect((screen.getByTestId('reduccion-mas') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('reduccion-mas'))
    expect((screen.getByTestId('reduccion-mas') as HTMLButtonElement).disabled).toBe(true)
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByTestId('reduccion-menos'))
    expect(screen.getByTestId('reduccion-cantidad').textContent).toBe('1')
    expect((screen.getByTestId('reduccion-menos') as HTMLButtonElement).disabled).toBe(true)
  })

  it('quién aceptó: contacto del cliente y «Otra persona» (exige nombre)', async () => {
    const llamadas = mockFetch()
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    expect(screen.getByTestId('reduccion-quien-k1').textContent).toContain('Encargada')
    fireEvent.click(screen.getByTestId('reduccion-quien-otra'))
    completar()
    expect(screen.getByTestId('reduccion-falta').textContent).toMatch(/quién lo aceptó/)
    fireEvent.change(screen.getByTestId('reduccion-otra-nombre'), { target: { value: 'Vecino' } })
    expect((screen.getByTestId('reduccion-revisar') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('reduccion-quien-k1'))
    fireEvent.click(screen.getByTestId('reduccion-revisar'))
    fireEvent.click(await screen.findByTestId('reduccion-enviar'))
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(llamadas.find((l) => l.init?.method === 'POST')!.init?.body)).aceptadoPor).toBe('Marta Ruiz')
  })

  it('motivo «Otro…» abre el texto y exige al menos 3 caracteres', async () => {
    mockFetch()
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    fireEvent.click(screen.getByTestId('reduccion-medio-PRESENCIAL'))
    fireEvent.click(screen.getByTestId('reduccion-motivo-otro'))
    expect(screen.getByTestId('reduccion-falta').textContent).toMatch(/el motivo/)
    fireEvent.change(screen.getByTestId('reduccion-motivo-texto'), { target: { value: 'Se mudó de local' } })
    expect((screen.getByTestId('reduccion-revisar') as HTMLButtonElement).disabled).toBe(false)
  })

  it('4. la confirmación muestra antes y después y «Volver» conserva lo elegido', async () => {
    mockFetch({ puedeAutorizar: true })
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    completar()
    fireEvent.click(screen.getByTestId('reduccion-revisar'))
    const dlg = await screen.findByTestId('reduccion-confirmacion')
    const t = dlg.textContent ?? ''
    expect(t).toMatch(/Tienda La Esperanza/)
    expect(t).toMatch(/20 → 15/)
    expect(t).toMatch(/50\.000.*37\.500/)
    expect(t).toMatch(/30\.000.*17\.500/)
    expect(t).toMatch(/Nota de crédito/)
    expect(t).toMatch(/Pedro Gómez \(titular\), por teléfono/)
    expect(within(dlg).getByTestId('reduccion-enviar').textContent).toBe('Aplicar reducción')
    fireEvent.click(within(dlg).getByTestId('reduccion-volver'))
    await waitFor(() => expect(screen.queryByTestId('reduccion-confirmacion')).toBeNull())
    expect(screen.getByTestId('reduccion-medio-TELEFONO').getAttribute('aria-checked')).toBe('true')
  })

  it('5 y 6. aplicar envía el cuerpo esperado con offlineId, muestra «Aplicando…» y recarga', async () => {
    let soltar: (r: Response) => void = () => {}
    const llamadas = mockFetch({ puedeAutorizar: true, post: () => new Promise<Response>((r) => { soltar = r }) })
    render(<ReduccionComercialPanel {...props} userRole="ADMIN" />)
    await abrir()
    completar()
    fireEvent.click(screen.getByTestId('reduccion-revisar'))
    fireEvent.click(await screen.findByTestId('reduccion-enviar'))
    await waitFor(() => expect(screen.getByTestId('reduccion-enviar').textContent).toBe('Aplicando…'))
    expect((screen.getByTestId('reduccion-enviar') as HTMLButtonElement).disabled).toBe(true)
    const post = llamadas.find((l) => l.init?.method === 'POST')!
    expect(post.url).toBe('/api/pedidos/p1/reducir-pedido')
    expect(JSON.parse(String(post.init?.body))).toEqual({
      producto: 'PACA_AGUA', cantidadReducida: 5, motivo: 'Ya no necesita el resto', aceptadoPor: 'Pedro Gómez', medio: 'TELEFONO', offlineId: expect.any(String),
    })
    soltar(new Response(JSON.stringify({ success: true, estado: 'APLICADA' }), { status: 201 }))
    await waitFor(() => expect(screen.queryByTestId('reduccion-form')).toBeNull())
    expect(llamadas.filter((l) => !l.init?.method).length).toBeGreaterThanOrEqual(2)
  })

  it('7. sin permiso: «Revisar y pedir autorización», «Enviar solicitud» y aviso de espera con el total sin cambiar', async () => {
    mockFetch({ puedeAutorizar: false, reducciones: [pendiente] })
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    expect(screen.getByTestId('reduccion-revisar').textContent).toBe('Revisar y pedir autorización')
    completar()
    fireEvent.click(screen.getByTestId('reduccion-revisar'))
    expect((await screen.findByTestId('reduccion-enviar')).textContent).toBe('Enviar solicitud')
    expect(screen.getByTestId('reduccion-esperando').textContent).toMatch(/Esperando a quien autoriza.*50\.000/)
    expect(screen.queryByTestId('reduccion-autorizar')).toBeNull()
  })

  it('8a. con parte pagada el tope baja y se explica antes de equivocarse', async () => {
    mockFetch()
    render(<ReduccionComercialPanel {...props} totalPagado={40000} />)
    await abrir()
    expect(screen.getByTestId('reduccion-cantidad').textContent).toBe('4')
    expect((screen.getByTestId('reduccion-mas') as HTMLButtonElement).disabled).toBe(true)
    const aviso = screen.getByTestId('reduccion-tope-aviso').textContent ?? ''
    expect(aviso).toMatch(/40\.000/)
    expect(aviso).toMatch(/máximo puedes quitar 4/)
    expect(aviso).toMatch(/37\.500/)
    expect(screen.getByTestId('reduccion-efecto').textContent).toMatch(/10\.000.*40\.000/)
  })

  it('8b. con todo el pedido pagado no se abre el formulario y se explica', async () => {
    mockFetch()
    render(<ReduccionComercialPanel {...props} totalPagado={50000} />)
    expect((await screen.findByTestId('reduccion-bloqueada')).textContent).toMatch(/50\.000.*reversar un pago/)
    expect(screen.queryByTestId('reduccion-abrir')).toBeNull()
  })

  it('8c. si la línea cambió, avisa y conserva lo elegido', async () => {
    mockFetch({ puedeAutorizar: true, post: new Response(JSON.stringify({ success: false, error: { message: 'x', code: 'REDUCCION_OBSOLETA' } }), { status: 409 }) })
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    completar()
    fireEvent.click(screen.getByTestId('reduccion-revisar'))
    fireEvent.click(await screen.findByTestId('reduccion-enviar'))
    expect((await screen.findByTestId('reduccion-error-envio')).textContent).toMatch(/La línea cambió.*Recarga el pedido/)
    expect(screen.getByTestId('reduccion-medio-TELEFONO').getAttribute('aria-checked')).toBe('true')
  })

  it('8d. sin conexión, avisa y conserva lo elegido para reintentar con la misma clave', async () => {
    const llamadas = mockFetch({ puedeAutorizar: true })
    const original = global.fetch
    let primera = true
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST' && primera) { primera = false; llamadas.push({ url: String(url), init }); throw new TypeError('Failed to fetch') }
      return (original as typeof fetch)(url, init)
    }) as unknown as typeof fetch
    render(<ReduccionComercialPanel {...props} />)
    await abrir()
    completar()
    fireEvent.click(screen.getByTestId('reduccion-revisar'))
    fireEvent.click(await screen.findByTestId('reduccion-enviar'))
    expect((await screen.findByTestId('reduccion-error-envio')).textContent).toMatch(/Sin conexión.*Lo que elegiste sigue en el formulario/)
    fireEvent.click(screen.getByTestId('reduccion-revisar'))
    fireEvent.click(await screen.findByTestId('reduccion-enviar'))
    await waitFor(() => expect(screen.queryByTestId('reduccion-form')).toBeNull())
    const posts = llamadas.filter((l) => l.init?.method === 'POST')
    expect(posts.length).toBe(2)
    expect(JSON.parse(String(posts[0].init?.body)).offlineId).toBe(JSON.parse(String(posts[1].init?.body)).offlineId)
  })

  it('9. solo quien tiene el permiso ve Autorizar/Rechazar; rechazar pide nota opcional y confirma', async () => {
    mockFetch({ puedeAutorizar: false, reducciones: [pendiente] })
    const { unmount } = render(<ReduccionComercialPanel {...props} userRole="ADMIN" />)
    await screen.findByTestId('reduccion-item')
    expect(screen.queryByTestId('reduccion-autorizar')).toBeNull()
    unmount()

    const llamadas = mockFetch({ puedeAutorizar: true, reducciones: [pendiente] })
    render(<ReduccionComercialPanel {...props} />)
    fireEvent.click(await screen.findByTestId('reduccion-rechazar'))
    fireEvent.change(screen.getByTestId('reduccion-nota-rechazo'), { target: { value: 'Sí quiere las 5' } })
    fireEvent.click(screen.getByTestId('reduccion-confirmar-rechazo'))
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'PATCH')).toBe(true))
    const patch = llamadas.find((l) => l.init?.method === 'PATCH')!
    expect(patch.url).toBe('/api/pedidos/reducciones-comerciales/r1')
    expect(JSON.parse(String(patch.init?.body))).toEqual({ resolucion: 'RECHAZAR', nota: 'Sí quiere las 5' })
  })

  it('autorizar envía la resolución sin nota', async () => {
    const llamadas = mockFetch({ puedeAutorizar: true, reducciones: [pendiente] })
    render(<ReduccionComercialPanel {...props} />)
    fireEvent.click(await screen.findByTestId('reduccion-autorizar'))
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'PATCH')).toBe(true))
    expect(JSON.parse(String(llamadas.find((l) => l.init?.method === 'PATCH')!.init?.body))).toEqual({ resolucion: 'AUTORIZAR' })
  })

  it('el historial muestra quién aceptó, cómo, quién pidió, quién autorizó y la nota de crédito', async () => {
    mockFetch({ reducciones: [aplicada] })
    render(<ReduccionComercialPanel {...props} />)
    const item = await screen.findByTestId('reduccion-item')
    const t = item.textContent ?? ''
    expect(t).toMatch(/20 → 15/)
    expect(t).toMatch(/aceptó Pedro Gómez, por teléfono/)
    expect(t).toMatch(/pidió Ana Gómez/)
    expect(t).toMatch(/autorizó Luis Pérez/)
    expect(t).toMatch(/NC-00042/)
    expect(t).toMatch(/50\.000.*37\.500/)
  })

  it('un pedido cancelado solo muestra el historial', async () => {
    mockFetch({ reducciones: [aplicada] })
    render(<ReduccionComercialPanel {...props} reducible={false} />)
    await screen.findByTestId('reduccion-item')
    expect(screen.queryByTestId('reduccion-abrir')).toBeNull()
  })

  it('con varias líneas pendientes permite elegir el producto y la cantidad parte de su tope', async () => {
    mockFetch()
    const dos = [
      { producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, precio: 2500 },
      { producto: 'PACA_HIELO', cantPedido: 6, cantEntrega: 4, precio: 2000 },
    ]
    render(<ReduccionComercialPanel {...props} lineas={dos} total={62000} totalPagado={0} />)
    await abrir()
    const sel = screen.getByTestId('reduccion-producto') as HTMLSelectElement
    expect(sel.options.length).toBe(2)
    fireEvent.change(sel, { target: { value: 'PACA_HIELO' } })
    expect(screen.getByTestId('reduccion-cantidad').textContent).toBe('2')
    expect(screen.getByTestId('reduccion-efecto').textContent).toMatch(/4\.000/)
  })
})
