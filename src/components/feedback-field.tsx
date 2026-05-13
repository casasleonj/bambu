'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface ValidationRule {
  test: (value: string) => boolean
  message: string
  type?: 'error' | 'warning' | 'info'
}

export interface FeedbackFieldProps {
  label?: string
  required?: boolean
  helpText?: string
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'number' | 'password'
  value: string
  onChange: (value: string) => void
  onBlur?: (value: string) => void
  rules?: ValidationRule[]
  validateOnChange?: boolean
  validateOnBlur?: boolean
  debounceMs?: number
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  inputClassName?: string
  icon?: React.ReactNode
}

export function FeedbackField({
  label,
  required,
  helpText,
  placeholder,
  type = 'text',
  value,
  onChange,
  onBlur,
  rules = [],
  validateOnChange = true,
  validateOnBlur = true,
  debounceMs = 300,
  disabled,
  autoFocus,
  className = '',
  inputClassName = '',
  icon,
}: FeedbackFieldProps) {
  const [errors, setErrors] = useState<Array<{ message: string; type: string }>>([])
  const [warnings, setWarnings] = useState<Array<{ message: string; type: string }>>([])
  const [infos, setInfos] = useState<Array<{ message: string; type: string }>>([])
  const [touched, setTouched] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const validate = useCallback((val: string) => {
    const errs: Array<{ message: string; type: string }> = []
    const warns: Array<{ message: string; type: string }> = []
    const infs: Array<{ message: string; type: string }> = []

    if (required && !val.trim()) {
      errs.push({ message: 'Este campo es obligatorio', type: 'error' })
    }

    for (const rule of rules) {
      if (!rule.test(val)) {
        const item = { message: rule.message, type: rule.type || 'error' }
        if (item.type === 'error') errs.push(item)
        else if (item.type === 'warning') warns.push(item)
        else infs.push(item)
      }
    }

    setErrors(errs)
    setWarnings(warns)
    setInfos(infs)

    return errs.length === 0
  }, [rules, required])

  const debouncedValidate = useCallback((val: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => validate(val), debounceMs)
  }, [validate, debounceMs])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(val)
    if (validateOnChange) {
      debouncedValidate(val)
    }
  }

  const handleBlur = () => {
    setFocused(false)
    setTouched(true)
    if (validateOnBlur) {
      validate(value)
    }
    onBlur?.(value)
  }

  const hasError = touched && errors.length > 0
  const hasWarning = touched && warnings.length > 0 && !hasError
  const hasInfo = touched && infos.length > 0 && !hasError && !hasWarning
  const isValid = touched && errors.length === 0 && value.length > 0 && rules.length > 0

  const borderColor = hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
    hasWarning ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-200' :
    hasInfo ? 'border-blue-300 focus:border-blue-500 focus:ring-blue-200' :
    isValid ? 'border-green-300 focus:border-green-500 focus:ring-green-200' :
    focused ? 'border-blue-400 focus:border-blue-500 focus:ring-blue-200' :
    'border-gray-300 focus:border-blue-500 focus:ring-blue-200'

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-0.5" aria-label="obligatorio">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </div>
        )}

        <input
          type={type}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${label}-error` : helpText ? `${label}-help` : undefined}
          className={`w-full px-3 py-2.5 border rounded-lg text-sm transition-all duration-200 outline-none focus:ring-2 focus:ring-opacity-50 disabled:bg-gray-50 disabled:text-gray-400 ${icon ? 'pl-10' : ''} ${borderColor} ${inputClassName}`}
        />

        {/* Status icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {hasError && (
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {isValid && (
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="mt-1.5 space-y-1">
        {errors.map((e, i) => (
          <p key={`err-${i}`} id={`${label}-error`} className="text-xs text-red-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {e.message}
          </p>
        ))}
        {warnings.map((w, i) => (
          <p key={`warn-${i}`} className="text-xs text-amber-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {w.message}
          </p>
        ))}
        {infos.map((info, i) => (
          <p key={`info-${i}`} className="text-xs text-blue-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {info.message}
          </p>
        ))}
        {helpText && !hasError && !hasWarning && (
          <p id={`${label}-help`} className="text-xs text-gray-400">{helpText}</p>
        )}
      </div>
    </div>
  )
}

// Helper hook for form validation
export function useFormValidation<T extends Record<string, string>>(
  initialValues: T,
  fieldRules: Partial<Record<keyof T, ValidationRule[]>>
) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string[]>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})

  const validateField = useCallback((field: keyof T, value: string) => {
    const rules = fieldRules[field] || []
    const errs: string[] = []

    for (const rule of rules) {
      if (!rule.test(value)) {
        errs.push(rule.message)
      }
    }

    setErrors(prev => ({ ...prev, [field]: errs }))
    return errs.length === 0
  }, [fieldRules])

  const validateAll = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string[]>> = {}
    let isValid = true

    for (const field of Object.keys(values) as Array<keyof T>) {
      const errs: string[] = []
      const rules = fieldRules[field] || []
      for (const rule of rules) {
        if (!rule.test(values[field])) {
          errs.push(rule.message)
        }
      }
      if (errs.length > 0) isValid = false
      newErrors[field] = errs
    }

    setErrors(newErrors)
    setTouched(Object.keys(values).reduce((acc, key) => ({ ...acc, [key]: true }), {} as Record<keyof T, boolean>))
    return isValid
  }, [values, fieldRules])

  const setValue = useCallback((field: keyof T, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }))
    if (touched[field]) {
      validateField(field, value)
    }
  }, [touched, validateField])

  const setTouchedField = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    validateField(field, values[field])
  }, [values, validateField])

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  return {
    values,
    errors,
    touched,
    setValue,
    setTouchedField,
    validateAll,
    reset,
    isValid: Object.values(errors).every(errs => (errs || []).length === 0),
  }
}
