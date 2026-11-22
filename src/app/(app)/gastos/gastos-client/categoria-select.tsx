'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import {
  categoriaGastoValida, esCategoriaPersonal, etiquetaCategoriaGasto, normalizarCategoriaGasto,
} from '@/lib/gastos-categorias'

interface Props {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  disabled?: boolean
  id?: string
}

/** #973: experiencia de Tipo de negocio, pero aislada de Clientes y Pedidos. */
export function CategoriaGastoSelect({ value, onChange, options, disabled = false, id }: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-opciones`
  const container = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [activo, setActivo] = useState(0)
  const normalizada = normalizarCategoriaGasto(consulta)
  const filtradas = useMemo(() => (
    options.filter(opcion => !esCategoriaPersonal(opcion) &&
      normalizarCategoriaGasto(opcion).includes(normalizada))
  ), [options, normalizada])
  const puedeCrear = normalizada !== '' && categoriaGastoValida(consulta)
    && !esCategoriaPersonal(consulta)
    && !options.some(opcion => normalizarCategoriaGasto(opcion) === normalizada)
    && filtradas.length === 0
  const items = [...filtradas, ...(puedeCrear ? [normalizada] : [])]

  useEffect(() => {
    if (!abierto) return
    const afuera = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', afuera)
    return () => document.removeEventListener('pointerdown', afuera)
  }, [abierto])

  function elegir(opcion: string) {
    onChange(normalizarCategoriaGasto(opcion))
    setAbierto(false)
    setConsulta('')
    setActivo(0)
  }

  function tecla(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && abierto) {
      event.stopPropagation()
      event.preventDefault()
      setAbierto(false)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAbierto(true)
      setActivo(actual => Math.min(items.length - 1, actual + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActivo(actual => Math.max(0, actual - 1))
    } else if (event.key === 'Enter' && abierto && items[activo]) {
      event.preventDefault()
      elegir(items[activo])
    }
  }

  return (
    <div ref={container} className="relative">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-blue-600" />
        <input
          ref={inputRef} id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={abierto}
          aria-controls={listId} aria-activedescendant={abierto && items[activo] ? `${listId}-${activo}` : undefined}
          required={!value} disabled={disabled}
          value={abierto ? consulta : (value ? etiquetaCategoriaGasto(value) : '')}
          onChange={event => { if (value) onChange(''); setConsulta(event.target.value); setActivo(0); setAbierto(true) }}
          onFocus={() => { setConsulta(value ? etiquetaCategoriaGasto(value) : ''); setActivo(0); setAbierto(true) }}
          onKeyDown={tecla}
          onBlur={event => {
            if (!container.current?.contains(event.relatedTarget as Node)) setAbierto(false)
          }}
          autoComplete="off" placeholder="Buscar o agregar categoría..."
          className="h-12 w-full rounded-xl border-2 border-blue-200 bg-blue-50/40 pl-10 pr-10 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
        />
        <button type="button" aria-label="Ver todas las categorías" disabled={disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={() => { inputRef.current?.focus(); setConsulta(''); setActivo(0); setAbierto(true) }}
          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-100">
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {abierto && !disabled && (
        <div id={listId} role="listbox" aria-label="Categorías de gasto"
          className="absolute z-[60] mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {items.map((item, index) => {
            const esNueva = puedeCrear && item === normalizada
            return (
              <button key={item} id={`${listId}-${index}`} type="button" role="option"
                aria-selected={index === activo}
                onMouseDown={event => event.preventDefault()}
                onClick={() => elegir(item)}
                onMouseEnter={() => setActivo(index)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50 ${index === activo ? 'bg-blue-50 text-blue-800' : 'text-slate-700'}`}>
                {esNueva ? <Plus aria-hidden="true" className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                {esNueva ? `Agregar categoría «${etiquetaCategoriaGasto(item)}»` : etiquetaCategoriaGasto(item)}
              </button>
            )
          })}
          {items.length === 0 && <p className="px-3 py-3 text-sm text-slate-600">
            {consulta.trim() && !categoriaGastoValida(consulta)
              ? 'Escribe un nombre de 2 a 45 caracteres, sin símbolos especiales.'
              : esCategoriaPersonal(consulta)
                ? 'Los pagos al personal se administran en Nómina.'
                : 'No hay coincidencias. Escribe el nombre completo para agregar una categoría.'}
          </p>}
        </div>
      )}
    </div>
  )
}
