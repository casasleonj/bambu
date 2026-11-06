// @tests #645 — producción dentro del cierre: es el mismo registro que la sección Producción, con la fecha del cierre (atrasado),
// pérdidas, diferencia que obliga a explicar, «ese día no se produjo», varias producciones y errores claros.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ProduccionDelCierre } from '../produccion-del-cierre'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))

const fetchMock = vi.fn()
const HOY = '2026-11-10'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${HOY}T15:00:00-05:00`))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).startsWith('/api/trabajadores')) {
      return { ok: true, status: 200, json: async () => ({ trabajadores: [{ id: 's1', nombre: 'Carlos Pérez' }, { id: 's2', nombre: 'Marta Gómez' }] }) }
    }
    return { ok: true, status: 201, json: async () => ({ success: true }) }
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.useRealTimers())

function montar(over: Partial<React.ComponentProps<typeof ProduccionDelCierre>> = {}) {
  const props = {
    fecha: HOY, diaCerrado: false, producciones: [], esperadoPrevio: { agua: 15, hielo: 3, botellon: 20 }, botellonesVendidos: 3,
    sinProduccion: false, onSinProduccionChange: vi.fn(), onGuardada: vi.fn(), ...over,
  }
  render(<ProduccionDelCierre {...props} />)
  return props
}
const escribir = (id: string, v: string) => fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value: v } })
const llamadasPost = () => fetchMock.mock.calls.filter(([u]) => u === '/api/produccion')

describe('ProduccionDelCierre (#645)', () => {
  it('sin producción registrada muestra el formulario y la casilla «ese día no se produjo»', async () => {
    montar()
    expect(await screen.findByTestId('form-produccion-cierre')).toBeInTheDocument()
    expect(screen.getByTestId('sin-produccion')).toBeInTheDocument()
    expect(screen.getByText(/Vendidos ese día: 3/)).toBeInTheDocument()
  })

  it('guardar manda la fecha del cierre, una cifra por producto como conteo A = B, pérdidas y botellones llenados', async () => {
    const p = montar({ fecha: '2026-11-09', esperadoPrevio: { agua: 15, hielo: 3, botellon: 20 } })
    await screen.findByRole('option', { name: 'Carlos Pérez' })
    fireEvent.change(screen.getByLabelText(/Sellador/), { target: { value: 's1' } })
    fireEvent.click(screen.getByRole('radio', { name: /Jornada completa/ }))
    escribir('pc-prod-agua', '60'); escribir('pc-prod-hielo', '30')
    escribir('pc-merma-agua', '2')
    escribir('pc-fin-agua', '73'); escribir('pc-fin-hielo', '33') // 15+60−2 = 73 · 3+30 = 33
    escribir('pc-botellones', '8'); escribir('pc-fin-botellones', '28') // 20 + 8 = 28
    expect(screen.queryByTestId('produccion-diferencia')).toBeNull()
    fireEvent.click(screen.getByTestId('guardar-produccion'))
    await waitFor(() => expect(p.onGuardada).toHaveBeenCalled())
    const [, init] = llamadasPost()[0]
    const cuerpo = JSON.parse(init.body)
    expect(cuerpo).toMatchObject({ trabajadorId: 's1', turno: 'JORNADA', fecha: '2026-11-09', botellonesLlenados: 8, stockFinBotellones: 28 })
    expect(cuerpo.offlineId).toMatch(/^[0-9a-f-]{36}$/)
    expect(cuerpo.items[0]).toMatchObject({ producto: 'PACA_AGUA', conteoA: 60, conteoB: 60, stockFinFisico: 73, rotas: 2, filtradas: 0, consumoInterno: 0 })
    expect(cuerpo.items[1]).toMatchObject({ producto: 'PACA_HIELO', conteoA: 30, conteoB: 30, stockFinFisico: 33 })
  })

  it('una diferencia obliga a explicar la causa antes de guardar', async () => {
    montar()
    await screen.findByRole('option', { name: 'Carlos Pérez' })
    fireEvent.change(screen.getByLabelText(/Sellador/), { target: { value: 's1' } })
    escribir('pc-prod-agua', '60'); escribir('pc-fin-agua', '70'); escribir('pc-fin-botellones', '20') // agua esperada 75; botellones 20 cuadran
    expect(screen.getByTestId('produccion-diferencia')).toHaveTextContent('esperado 75, contaste 70 (-5)')
    expect(screen.getByTestId('guardar-produccion')).toBeDisabled()
    fireEvent.change(document.getElementById('pc-obs') as HTMLTextAreaElement, { target: { value: 'Se cayeron 5 pacas' } })
    expect(screen.getByTestId('guardar-produccion')).not.toBeDisabled()
  })

  it('#618: una diferencia en los botellones llenos también obliga a explicar', async () => {
    montar() // botellones esperados: 20 + 0 = 20
    await screen.findByRole('option', { name: 'Carlos Pérez' })
    fireEvent.change(screen.getByLabelText(/Sellador/), { target: { value: 's1' } })
    escribir('pc-prod-agua', '60'); escribir('pc-prod-hielo', '30')
    escribir('pc-fin-agua', '75'); escribir('pc-fin-hielo', '33')
    escribir('pc-botellones', '8'); escribir('pc-fin-botellones', '25') // esperado 28, contó 25
    expect(screen.getByTestId('produccion-diferencia')).toHaveTextContent('Botellones: esperado 28, contaste 25 (-3)')
    expect(screen.getByTestId('guardar-produccion')).toBeDisabled()
  })

  it('sin elegir sellador no se puede guardar', async () => {
    montar()
    await screen.findByTestId('form-produccion-cierre')
    expect(screen.getByTestId('guardar-produccion')).toBeDisabled()
  })

  it('un error del servidor se muestra en palabras y deja reintentar sin duplicar (misma clave)', async () => {
    fetchMock.mockImplementation(async (url: string) => String(url).startsWith('/api/trabajadores')
      ? { ok: true, status: 200, json: async () => ({ trabajadores: [{ id: 's1', nombre: 'Carlos Pérez' }] }) }
      : { ok: false, status: 500, json: async () => ({ error: { message: 'Error al registrar la producción' } }) })
    montar({ esperadoPrevio: { agua: 0, hielo: 0, botellon: 0 } })
    await screen.findByRole('option', { name: 'Carlos Pérez' })
    fireEvent.change(screen.getByLabelText(/Sellador/), { target: { value: 's1' } })
    fireEvent.click(screen.getByTestId('guardar-produccion'))
    expect(await screen.findByTestId('produccion-error')).toHaveTextContent('Error al registrar la producción')
    fireEvent.click(screen.getByTestId('guardar-produccion'))
    await waitFor(() => expect(llamadasPost()).toHaveLength(2))
    expect(JSON.parse(llamadasPost()[0][1].body).offlineId).toBe(JSON.parse(llamadasPost()[1][1].body).offlineId)
  })

  it('un 409 (ya existe esa producción) muestra el mensaje del servidor', async () => {
    fetchMock.mockImplementation(async (url: string) => String(url).startsWith('/api/trabajadores')
      ? { ok: true, status: 200, json: async () => ({ trabajadores: [{ id: 's1', nombre: 'Carlos Pérez' }] }) }
      : { ok: false, status: 409, json: async () => ({ error: { message: 'Ya existe producción registrada para este trabajador en el turno MANANA de ese día' } }) })
    montar({ esperadoPrevio: { agua: 0, hielo: 0, botellon: 0 } })
    await screen.findByRole('option', { name: 'Carlos Pérez' })
    fireEvent.change(screen.getByLabelText(/Sellador/), { target: { value: 's1' } })
    fireEvent.click(screen.getByTestId('guardar-produccion'))
    expect(await screen.findByTestId('produccion-error')).toHaveTextContent('Ya existe producción registrada')
  })

  it('sin conexión explica que no se guardó nada', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/trabajadores')) return { ok: true, status: 200, json: async () => ({ trabajadores: [{ id: 's1', nombre: 'Carlos Pérez' }] }) }
      throw new TypeError('network')
    })
    montar({ esperadoPrevio: { agua: 0, hielo: 0, botellon: 0 } })
    await screen.findByRole('option', { name: 'Carlos Pérez' })
    fireEvent.change(screen.getByLabelText(/Sellador/), { target: { value: 's1' } })
    fireEvent.click(screen.getByTestId('guardar-produccion'))
    expect(await screen.findByTestId('produccion-error')).toHaveTextContent('Sin conexión')
  })

  it('«ese día no se produjo» oculta el formulario y avisa al padre', async () => {
    const p = montar()
    fireEvent.click(await screen.findByTestId('sin-produccion'))
    expect(p.onSinProduccionChange).toHaveBeenCalledWith(true)
    montar({ sinProduccion: true })
    expect(screen.getAllByTestId('form-produccion-cierre')).toHaveLength(1) // solo el del primer render
  })

  it('con producciones registradas las lista, enlaza a Producción y ofrece «Agregar otra producción»', async () => {
    montar({ producciones: [{ id: 'p1', turno: 'JORNADA', trabajadorId: 's1', trabajador: 'Carlos Pérez', prodAgua: 35, prodHielo: 18, botellonesLlenados: 8 }] })
    expect(screen.getByTestId('producciones-del-dia')).toHaveTextContent('Carlos Pérez · Jornada completa · 35 agua, 18 hielo, 8 botellones')
    expect(screen.getByRole('link', { name: 'Ver y corregir' })).toHaveAttribute('href', `/produccion?fecha=${HOY}`)
    expect(screen.queryByTestId('form-produccion-cierre')).toBeNull()
    expect(screen.queryByTestId('sin-produccion')).toBeNull()
    fireEvent.click(screen.getByTestId('agregar-produccion'))
    expect(await screen.findByTestId('form-produccion-cierre')).toBeInTheDocument()
  })

  it('una fecha de hace más de 7 días o futura no deja registrar; un día cerrado tampoco', () => {
    montar({ fecha: '2026-11-02' })
    expect(screen.getByTestId('produccion-fecha-invalida')).toHaveTextContent('7 días anteriores')
    expect(screen.queryByTestId('form-produccion-cierre')).toBeNull()
  })
  it('una fecha futura se explica', () => {
    montar({ fecha: '2026-11-12' })
    expect(screen.getByTestId('produccion-fecha-invalida')).toHaveTextContent('aún no llega')
  })
  it('con el día cerrado no ofrece registrar', () => {
    montar({ diaCerrado: true })
    expect(screen.queryByTestId('form-produccion-cierre')).toBeNull()
    expect(screen.queryByTestId('sin-produccion')).toBeNull()
  })

  // #646 (PR C): formulario al estilo de las tarjetas de stock
  describe('tarjetas por producto (#646)', () => {
    const esperar = async () => { await screen.findByTestId('form-produccion-cierre') }

    it('turno es un grupo de botones: Mañana viene elegido y se cambia con un toque', async () => {
      montar(); await esperar()
      const grupo = screen.getByRole('radiogroup', { name: /Turno/ })
      expect(screen.getByRole('radio', { name: /Mañana/ })).toHaveAttribute('aria-checked', 'true')
      fireEvent.click(screen.getByRole('radio', { name: /Noche/ }))
      expect(screen.getByRole('radio', { name: /Noche/ })).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByRole('radio', { name: /Mañana/ })).toHaveAttribute('aria-checked', 'false')
      expect(grupo).toBeInTheDocument()
    })

    it('vacío: cada tarjeta dice «Falta llenar», no se muestra la diferencia y el botón explica por qué está bloqueado', async () => {
      montar(); await esperar()
      for (const k of ['agua', 'hielo', 'botellon']) expect(screen.getByTestId(`produccion-estado-${k}`)).toHaveTextContent('Falta llenar')
      expect(screen.queryByTestId('produccion-diferencia')).toBeNull()
      expect(screen.getByTestId('guardar-produccion')).toBeDisabled()
      expect(screen.getByTestId('produccion-motivo')).toHaveTextContent('Falta elegir el sellador')
    })

    it('cada tarjeta dice Cuadra o No cuadra con su diferencia y la fórmula viva', async () => {
      montar(); await esperar()
      escribir('pc-prod-agua', '60'); escribir('pc-fin-agua', '75') // 15 + 60 = 75
      expect(screen.getByTestId('produccion-estado-agua')).toHaveTextContent('Cuadra')
      expect(screen.getByTestId('produccion-tarjeta-agua')).toHaveTextContent('Sin esta producción 15 + producido 60 − pérdidas 0 = debería haber 75')
      escribir('pc-prod-hielo', '30'); escribir('pc-fin-hielo', '31') // esperado 33
      expect(screen.getByTestId('produccion-estado-hielo')).toHaveTextContent('No cuadra')
      expect(screen.getByTestId('produccion-tarjeta-hielo')).toHaveTextContent('Faltan 2')
      escribir('pc-botellones', '8'); escribir('pc-fin-botellones', '30') // esperado 28
      expect(screen.getByTestId('produccion-tarjeta-botellon')).toHaveTextContent('Sobran 2')
    })

    it('las pérdidas van en un desplegable cerrado con contador y se descuentan en la fórmula', async () => {
      montar(); await esperar()
      const perdidas = screen.getByTestId('produccion-perdidas')
      expect(perdidas.tagName).toBe('DETAILS')
      expect(perdidas.hasAttribute('open')).toBe(false)
      expect(perdidas).toHaveTextContent('Pérdidas del día (opcional)')
      escribir('pc-merma-agua', '2'); escribir('pc-cons-agua', '1')
      expect(perdidas).toHaveTextContent('3 · agua')
      expect(screen.getByTestId('produccion-tarjeta-agua')).toHaveTextContent('pérdidas 3')
    })

    it('con diferencia pide explicarla y el motivo del botón cambia; al explicar se habilita', async () => {
      montar(); await esperar()
      await screen.findByRole('option', { name: 'Carlos Pérez' })
      fireEvent.change(screen.getByLabelText(/Sellador/), { target: { value: 's1' } })
      escribir('pc-prod-agua', '60'); escribir('pc-fin-agua', '70'); escribir('pc-fin-botellones', '20')
      expect(screen.getByTestId('produccion-diferencia')).toHaveTextContent('Hay una diferencia')
      expect(screen.getByTestId('produccion-motivo')).toHaveTextContent('Falta explicar la diferencia')
      fireEvent.change(document.getElementById('pc-obs') as HTMLTextAreaElement, { target: { value: 'Se cayeron 5 pacas' } })
      expect(screen.queryByTestId('produccion-motivo')).toBeNull()
      expect(screen.getByTestId('guardar-produccion')).not.toBeDisabled()
    })

    it('teclear en un campo no pierde el foco (las tarjetas no se vuelven a montar)', async () => {
      montar(); await esperar()
      const campo = document.getElementById('pc-prod-agua') as HTMLInputElement
      campo.focus()
      fireEvent.change(campo, { target: { value: '5' } })
      fireEvent.change(campo, { target: { value: '56' } })
      expect(document.getElementById('pc-prod-agua')).toBe(campo)
      expect(document.activeElement).toBe(campo)
    })

    it('si falla la lista de selladores avisa y permite reintentar', async () => {
      let intento = 0
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).startsWith('/api/trabajadores')) {
          intento += 1
          if (intento === 1) throw new TypeError('sin red')
          return { ok: true, status: 200, json: async () => ({ trabajadores: [{ id: 's1', nombre: 'Carlos Pérez' }] }) }
        }
        return { ok: true, status: 201, json: async () => ({}) }
      })
      montar()
      expect(await screen.findByTestId('produccion-error-selladores')).toHaveTextContent('No se pudo cargar la lista de selladores')
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByRole('option', { name: 'Carlos Pérez' })).toBeInTheDocument()
      expect(screen.queryByTestId('produccion-error-selladores')).toBeNull()
    })
  })
})
