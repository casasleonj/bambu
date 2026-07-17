'use client'

import { useState, useEffect, useId, useCallback } from 'react'
import {
  normalizarTelefono,
  extraerDigitos,
  extraerDigitosLocales,
  formatearTelefonoParaCopiar,
  formatearDigitosLocales,
  esTelefonoValido,
} from '@/lib/telefono'

export interface TelefonoInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  required?: boolean
  placeholder?: string
  helpText?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  inputClassName?: string
  name?: string
  id?: string
  icon?: React.ReactNode
}

export function TelefonoInput({
  value,
  onChange,
  label,
  required,
  placeholder = '310 292 1234',
  helpText,
  disabled,
  autoFocus,
  className = '',
  inputClassName = '',
  name,
  id: idProp,
  icon,
}: TelefonoInputProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const errorId = `${id}-error`
  const helpId = `${id}-help`

  // Estado local: solo dígitos locales (sin el indicativo internacional 57).
  // El prefijo "+57" se muestra como elemento visual separado y no forma
  // parte del valor editable.
  const [localDigits, setLocalDigits] = useState(() => extraerDigitosLocales(value))
  const [touched, setTouched] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    setLocalDigits(extraerDigitosLocales(value))
  }, [value])

  const normalizado = normalizarTelefono(localDigits)
  const hasError = touched && !esTelefonoValido(normalizado) && required
  const isValid = touched && esTelefonoValido(normalizado) && normalizado.length > 0

  const handleChange = useCallback((raw: string) => {
    const digitos = extraerDigitos(raw)
    setLocalDigits(digitos)
    // Emitir siempre el valor normalizado (con indicativo 57) para que el
    // resto de la aplicación reciba el formato internacional estable.
    onChange(normalizarTelefono(digitos))
  }, [onChange])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const digitosLocales = extraerDigitosLocales(pasted)
    setLocalDigits(digitosLocales)
    onChange(normalizarTelefono(digitosLocales))
  }, [onChange])

  const handleBlur = useCallback(() => {
    setFocused(false)
    setTouched(true)
    const digitosLocales = extraerDigitosLocales(localDigits)
    setLocalDigits(digitosLocales)
    onChange(normalizarTelefono(digitosLocales))
  }, [localDigits, onChange])

  const handleFocus = useCallback(() => {
    setFocused(true)
  }, [])

  const handleCopy = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    e.clipboardData.setData('text/plain', formatearTelefonoParaCopiar(value))
  }, [value])

  const displayValue = formatearDigitosLocales(localDigits)
  const prefixLeft = icon ? 'left-9' : 'left-3'
  const inputPaddingLeft = icon ? 'pl-16' : 'pl-10'

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </div>
        )}
        <span
          className={`absolute top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none select-none ${prefixLeft}`}
          aria-hidden="true"
        >
          +57
        </span>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          onPaste={handlePaste}
          onCopy={handleCopy}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : helpText ? helpId : undefined}
          aria-label={`${label ?? 'Teléfono'} (código de país +57)`}
          className={`
            w-full border rounded-lg text-sm transition outline-none
            ${inputPaddingLeft} pr-3 py-2.5
            ${hasError
              ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 bg-red-50/30'
              : isValid
                ? 'border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-200'
                : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${inputClassName}
          `}
        />
        {isValid && !focused && (
          <button
            type="button"
            onClick={() => {
              const texto = formatearTelefonoParaCopiar(value)
              navigator.clipboard.writeText(texto)
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded transition"
            aria-label="Copiar teléfono"
            title="Copiar teléfono"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      </div>
      {hasError && (
        <p id={errorId} className="mt-1.5 text-xs text-red-600">
          Teléfono inválido
        </p>
      )}
      {helpText && !hasError && (
        <p id={helpId} className="mt-1.5 text-xs text-gray-500">
          {helpText}
        </p>
      )}
    </div>
  )
}
