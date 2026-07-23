// @tests unit/NegociosUbicacionesFilter
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NegociosUbicacionesFilter } from '../negocios-ubicaciones-filter'

describe('NegociosUbicacionesFilter', () => {
  it('despacha onChangeMostrarNegocio y onChangeUbicacionMaps al cambiar los selects', () => {
    const onNegocio = vi.fn()
    const onUbicacion = vi.fn()

    render(
      <NegociosUbicacionesFilter
        mostrarNegocio="todos"
        ubicacionMaps="todos"
        onChangeMostrarNegocio={onNegocio}
        onChangeUbicacionMaps={onUbicacion}
      />,
    )

    fireEvent.change(screen.getByLabelText('Filtrar por negocio'), { target: { value: 'con' } })
    expect(onNegocio).toHaveBeenCalledWith('con')

    fireEvent.change(screen.getByLabelText('Filtrar por ubicación de Maps'), { target: { value: 'cliente' } })
    expect(onUbicacion).toHaveBeenCalledWith('cliente')
  })

  it('deshabilita ambos selects cuando disabled=true', () => {
    render(
      <NegociosUbicacionesFilter
        mostrarNegocio="todos"
        ubicacionMaps="todos"
        disabled
        onChangeMostrarNegocio={vi.fn()}
        onChangeUbicacionMaps={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Filtrar por negocio')).toBeDisabled()
    expect(screen.getByLabelText('Filtrar por ubicación de Maps')).toBeDisabled()
  })

  it('deshabilita las opciones de ubicación de negocios cuando mostrarNegocio=sin', () => {
    render(
      <NegociosUbicacionesFilter
        mostrarNegocio="sin"
        ubicacionMaps="todos"
        onChangeMostrarNegocio={vi.fn()}
        onChangeUbicacionMaps={vi.fn()}
      />,
    )

    expect(screen.getByText('Negocio con link')).toBeDisabled()
    expect(screen.getByText('Negocio sin link')).toBeDisabled()
  })
})
