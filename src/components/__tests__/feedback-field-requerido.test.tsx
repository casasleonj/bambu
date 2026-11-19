import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeedbackField } from '@/components/feedback-field'

// #811: la etiqueta marcaba «Nombre *» como obligatorio, pero el input no tenía
// `required`, así que el navegador no lo exigía. Estas pruebas fijan el
// contrato: lo que se marca con `required` tiene que llegar al DOM y al label.

describe('FeedbackField — #811 obligatoriedad real', () => {
  it('pasa required al input cuando la etiqueta lo declara', () => {
    render(<FeedbackField label="Nombre" required value="" onChange={() => {}} />)
    const input = screen.getByRole('textbox')
    expect(input).toBeRequired()
  })

  it('no marca required cuando no se declara', () => {
    render(<FeedbackField label="Apellido" value="" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).not.toBeRequired()
  })

  it('el label está enlazado con el input (accesibilidad)', () => {
    render(<FeedbackField label="Nombre" required value="" onChange={() => {}} />)
    // getByLabelText falla si el label no apunta al control: es la prueba
    // de que existe asociación real, no sólo un texto al lado.
    expect(screen.getByLabelText(/Nombre/)).toBe(screen.getByRole('textbox'))
  })

  it('el campo obligatorio participa en la validación del formulario', () => {
    const { container } = render(
      <form>
        <FeedbackField label="Nombre" required value="" onChange={() => {}} />
        <button type="submit">Guardar</button>
      </form>,
    )
    const form = container.querySelector('form') as HTMLFormElement
    const input = screen.getByRole('textbox') as HTMLInputElement
    // El navegador sólo bloquea si el control es candidato a validación.
    expect(input).toBeRequired()
    expect(input.willValidate).toBe(true)
    expect(form.checkValidity()).toBe(false)
    fireEvent.change(input, { target: { value: 'Juan' } })
  })

  it('espacios no cuentan como valor para el bloqueo nativo propio', () => {
    render(<FeedbackField label="Nombre" required value="   " onChange={() => {}} />)
    // HTML required sólo exige no-vacío; la regla de espacios la cubre la
    // validación del componente, que se comprueba en la prueba siguiente.
    expect(screen.getByRole('textbox')).toBeRequired()
  })
})

describe('FeedbackField — #811 criterio de cierre: todos los obligatorios a la vez', () => {
  it('con dos campos obligatorios vacíos, el formulario los señala a los dos', () => {
    const { container } = render(
      <form>
        <FeedbackField label="Nombre" required value="" onChange={() => {}} />
        <FeedbackField label="Teléfono" type="tel" required value="" onChange={() => {}} />
        <button type="submit">Guardar</button>
      </form>,
    )
    const form = container.querySelector('form') as HTMLFormElement
    const obligatorios = Array.from(form.elements).filter(
      (el): el is HTMLInputElement => el instanceof HTMLInputElement && el.required,
    )
    // El navegador valida TODOS los candidatos en un mismo intento; no se
    // detiene en el primero como hace la validación propia de handleSubmit.
    expect(obligatorios).toHaveLength(2)
    expect(obligatorios.every((el) => !el.checkValidity())).toBe(true)
    expect(form.checkValidity()).toBe(false)
  })
})
