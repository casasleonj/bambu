// @tests #836 F2 — editor de horario semanal, formulario del negocio y ficha.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { NegocioHorarioEditor } from '../negocio-horario-editor'
import { NegocioForm } from '../negocio-form'
import { NegocioDetailModal, type NegocioDetail } from '../negocio-detail-modal'
import { validarHorario, type TramoHorario } from '@/lib/negocio-horario'

function Controlado({ inicial = [] as TramoHorario[] }) {
  const [v, setV] = useState<TramoHorario[]>(inicial)
  return (
    <>
      <NegocioHorarioEditor value={v} onChange={setV} errores={validarHorario(v)} />
      <output data-testid="valor">{JSON.stringify(v)}</output>
    </>
  )
}
const valor = (): TramoHorario[] => JSON.parse(screen.getByTestId('valor').textContent || '[]')

describe('NegocioHorarioEditor (#836 F2)', () => {
  it('sin horario: los días muestran «—» y se puede «Abrir» uno', () => {
    render(<Controlado />)
    expect(screen.getByTestId('horario-cerrado-1')).toHaveTextContent('—')
    fireEvent.click(screen.getByTestId('horario-agregar-1'))
    expect(valor()).toEqual([{ diaSemana: 1, desde: '08:00', hasta: '18:00' }])
  })

  it('con horario, un día sin tramos dice «Cerrado» (la pausa/cierre es explícito)', () => {
    render(<Controlado inicial={[{ diaSemana: 1, desde: '06:00', hasta: '12:00' }]} />)
    expect(screen.getByTestId('horario-cerrado-0')).toHaveTextContent('Cerrado')
  })

  it('turno partido: «＋ Tramo» agrega uno a continuación del último', () => {
    render(<Controlado inicial={[{ diaSemana: 1, desde: '06:00', hasta: '12:00' }]} />)
    fireEvent.click(screen.getByTestId('horario-agregar-1'))
    const lunes = valor().filter((t) => t.diaSemana === 1)
    expect(lunes).toHaveLength(2)
    expect(lunes[1].desde).toBe('12:00')
  })

  it('editar una hora y quitar un tramo', () => {
    render(<Controlado inicial={[{ diaSemana: 1, desde: '06:00', hasta: '12:00' }, { diaSemana: 1, desde: '14:00', hasta: '20:00' }]} />)
    fireEvent.change(screen.getByTestId('horario-hasta-1-1'), { target: { value: '19:00' } })
    expect(valor().find((t) => t.desde === '14:00')!.hasta).toBe('19:00')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar tramo 1 de Lunes' }))
    expect(valor()).toEqual([{ diaSemana: 1, desde: '14:00', hasta: '19:00' }])
  })

  it('«Copiar lunes a todos los días» y «Quitar el horario»', () => {
    render(<Controlado inicial={[{ diaSemana: 1, desde: '06:00', hasta: '12:00' }, { diaSemana: 1, desde: '14:00', hasta: '20:00' }]} />)
    fireEvent.click(screen.getByTestId('horario-copiar-lunes'))
    expect(valor()).toHaveLength(14)
    expect(new Set(valor().map((t) => t.diaSemana)).size).toBe(7)
    fireEvent.click(screen.getByTestId('horario-quitar'))
    expect(valor()).toEqual([])
  })

  it('«Copiar lunes» está desactivado si el lunes no tiene tramos', () => {
    render(<Controlado />)
    expect(screen.getByTestId('horario-copiar-lunes')).toBeDisabled()
  })

  it('un tramo que termina antes de empezar muestra el error del diseño', () => {
    render(<Controlado inicial={[{ diaSemana: 1, desde: '14:00', hasta: '12:00' }]} />)
    expect(screen.getByTestId('horario-errores')).toHaveTextContent('Lunes: el tramo 14:00–12:00 termina antes de empezar')
  })
})

describe('NegocioForm con horario (#836 F2)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const base = { id: 'n1', nombre: 'Tienda X', tipoNegocio: 'Tienda', direccion: null, barrio: null, referencia: null, linkUbicacion: null, horaApertura: null, rutaId: null }
  const partido = [{ diaSemana: 1, desde: '06:00', hasta: '12:00' }, { diaSemana: 1, desde: '14:00', hasta: '20:00' }]
  const llamadas = () => fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/negocios'))

  it('editar otros datos SIN tocar el horario no lo reescribe', async () => {
    render(<NegocioForm open onClose={vi.fn()} clienteId="c1" editData={{ ...base, horarios: partido }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(llamadas()).toHaveLength(1))
    expect(JSON.parse(llamadas()[0][1].body)).not.toHaveProperty('horarios')
  })

  it('cambiar el horario lo envía completo y ordenado', async () => {
    render(<NegocioForm open onClose={vi.fn()} clienteId="c1" editData={{ ...base, horarios: partido }} />)
    fireEvent.change(screen.getByTestId('horario-hasta-1-1'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(llamadas()).toHaveLength(1))
    const body = JSON.parse(llamadas()[0][1].body)
    expect(body.horarios).toEqual([{ diaSemana: 1, desde: '06:00', hasta: '12:00' }, { diaSemana: 1, desde: '14:00', hasta: '19:00' }])
  })

  it('quitar todo el horario envía [] (vuelve a «sin horario configurado»)', async () => {
    render(<NegocioForm open onClose={vi.fn()} clienteId="c1" editData={{ ...base, horarios: partido }} />)
    fireEvent.click(screen.getByTestId('horario-quitar'))
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(llamadas()).toHaveLength(1))
    expect(JSON.parse(llamadas()[0][1].body).horarios).toEqual([])
  })

  it('un horario inválido NO llama al servidor y explica el problema', async () => {
    render(<NegocioForm open onClose={vi.fn()} clienteId="c1" editData={{ ...base, horarios: [{ diaSemana: 1, desde: '14:00', hasta: '12:00' }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByText(/Revisa el horario de atención/)).toBeInTheDocument()
    expect(screen.getByTestId('horario-errores')).toHaveTextContent('termina antes de empezar')
    expect(llamadas()).toHaveLength(0)
  })

  it('crear un negocio sin horario no envía el campo', async () => {
    render(<NegocioForm open onClose={vi.fn()} clienteId="c1" />)
    const nombre = document.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(nombre, { target: { value: 'Nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear negocio' }))
    await waitFor(() => expect(llamadas()).toHaveLength(1))
    expect(JSON.parse(llamadas()[0][1].body)).not.toHaveProperty('horarios')
  })
})

describe('Ficha del negocio (#836 F2)', () => {
  const neg: NegocioDetail = {
    id: 'n1', nombre: 'Tienda X', tipoNegocio: null, direccion: null, barrio: null, referencia: null, linkUbicacion: null,
    horaApertura: null, ruta: null, _count: { pedidos: 0 },
  }
  const montar = (n: NegocioDetail) => render(<NegocioDetailModal open negocio={n} onClose={vi.fn()} canEdit={false} canDelete={false} onEdit={vi.fn()} onDeleted={vi.fn()} />)

  it('muestra el horario por día agrupado, con «cerrado»', () => {
    const h = [1, 2, 3, 4, 5].flatMap((d) => [{ diaSemana: d, desde: '06:00', hasta: '12:00' }, { diaSemana: d, desde: '14:00', hasta: '20:00' }])
    montar({ ...neg, horarios: [...h, { diaSemana: 6, desde: '06:00', hasta: '13:00' }] })
    const caja = screen.getByTestId('negocio-horario-ficha')
    expect(within(caja).getByText('Lun–Vie 06:00–12:00 y 14:00–20:00')).toBeInTheDocument()
    expect(within(caja).getByText('Sáb 06:00–13:00')).toBeInTheDocument()
    expect(within(caja).getByText('Dom cerrado')).toBeInTheDocument()
  })

  it('sin horario por día pero con el texto antiguo: lo muestra marcado como heredado', () => {
    montar({ ...neg, horaApertura: 'Abre a las 7' })
    expect(screen.getByText('Abre a las 7')).toBeInTheDocument()
    expect(screen.getByTestId('negocio-horario-heredado')).toBeInTheDocument()
    expect(screen.queryByTestId('negocio-horario-ficha')).toBeNull()
  })

  it('con horario por día el texto antiguo ya no se muestra', () => {
    montar({ ...neg, horaApertura: 'Abre a las 7', horarios: [{ diaSemana: 1, desde: '08:00', hasta: '18:00' }] })
    expect(screen.queryByText('Abre a las 7')).toBeNull()
  })
})
