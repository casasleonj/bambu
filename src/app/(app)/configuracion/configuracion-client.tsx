'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

/* ================================================================
   TYPES
   ================================================================ */

interface ConfigData {
  empresa_nombre: string
  empresa_nit: string
  empresa_direccion: string
  empresa_telefono: string
  empresa_email: string
  BASE_DIA: string
  DIAS_ALERTA_NO_VERIFICADO: string
  DIAS_VENCIMIENTO_PROMESA: string
  MAX_PEDIDOS_DIA_ALERTA: string
}

interface ConfiguracionClientProps {
  initialData: ConfigData
}

interface FieldConfig {
  key: keyof ConfigData
  label: string
  type: string
  placeholder: string
  required?: boolean
  prefix?: string
  suffix?: string
  min?: number
  rows?: number
}

interface SectionConfig {
  id: 'empresa' | 'operacion'
  title: string
  icon: string
  fields: FieldConfig[]
}

type SavingState = 'idle' | 'saving' | 'saved' | 'error'
type FieldErrors = Partial<Record<keyof ConfigData, string>>

/* ================================================================
   CONSTANTS
   ================================================================ */

const DEBOUNCE_MS = 800
const SAVE_CLEAR_MS = 2000

const SECTIONS: SectionConfig[] = [
  {
    id: 'empresa',
    title: 'Datos de la Empresa',
    icon: '🏢',
    fields: [
      { key: 'empresa_nombre', label: 'Nombre de la Empresa', type: 'text', placeholder: 'Agua Bambu SAS', required: true },
      { key: 'empresa_nit', label: 'NIT', type: 'text', placeholder: '900.123.456-7', required: true },
      { key: 'empresa_direccion', label: 'Dirección', type: 'textarea', placeholder: 'Calle Principal #123, Bogotá', rows: 3 },
      { key: 'empresa_telefono', label: 'Teléfono', type: 'tel', placeholder: '311 123 4567' },
      { key: 'empresa_email', label: 'Email', type: 'email', placeholder: 'info@aguabambu.com' },
    ],
  },
  {
    id: 'operacion',
    title: 'Parámetros de Operación',
    icon: '⚙️',
    fields: [
      { key: 'BASE_DIA', label: 'Base de Caja Diaria', type: 'number', placeholder: '100000', prefix: '$', required: true, min: 0 },
      { key: 'DIAS_ALERTA_NO_VERIFICADO', label: 'Días para alerta de cliente no verificado', type: 'number', placeholder: '30', suffix: 'días', min: 1 },
      { key: 'DIAS_VENCIMIENTO_PROMESA', label: 'Días vencimiento promesa de pago', type: 'number', placeholder: '2', suffix: 'días', min: 1 },
      { key: 'MAX_PEDIDOS_DIA_ALERTA', label: 'Máx. pedidos por día para alerta', type: 'number', placeholder: '2', suffix: 'pedidos', min: 1 },
    ],
  },
]

/* ================================================================
   HELPERS
   ================================================================ */

function validateConfig(data: ConfigData): FieldErrors {
  const errs: FieldErrors = {}
  if (!data.empresa_nombre.trim()) errs.empresa_nombre = 'El nombre es obligatorio'
  if (!data.empresa_nit.trim()) errs.empresa_nit = 'El NIT es obligatorio'
  if (data.empresa_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.empresa_email)) {
    errs.empresa_email = 'Email inválido'
  }
  if (data.BASE_DIA && (isNaN(Number(data.BASE_DIA)) || Number(data.BASE_DIA) < 0)) {
    errs.BASE_DIA = 'Debe ser un número positivo'
  }
  const numericFields: Array<keyof ConfigData> = [
    'DIAS_ALERTA_NO_VERIFICADO',
    'DIAS_VENCIMIENTO_PROMESA',
    'MAX_PEDIDOS_DIA_ALERTA',
  ]
  for (const key of numericFields) {
    const val = data[key]
    if (val && (isNaN(Number(val)) || Number(val) < 1)) {
      errs[key] = 'Debe ser un número mayor a 0'
    }
  }
  return errs
}

function timeAgo(date: Date | null): string {
  if (!date) return ''
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h ${minutes % 60}min`
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function ConfiguracionClient({ initialData }: ConfiguracionClientProps) {
  const [data, setData] = useState<ConfigData>(initialData)
  const [savedData, setSavedData] = useState<ConfigData>(initialData)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState<'empresa' | 'operacion'>('empresa')
  const [sectionState, setSectionState] = useState<Record<string, SavingState>>({})

  const timersRef = useRef<Record<string, NodeJS.Timeout>>({})
  const clearTimersRef = useRef<Record<string, NodeJS.Timeout>>({})
  const dataRef = useRef(data)
  const savedDataRef = useRef(savedData)

  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { savedDataRef.current = savedData }, [savedData])

  /* --------------------------------------------------------------
     Derived state
     -------------------------------------------------------------- */

  const hasChanges = useCallback(() => {
    return JSON.stringify(data) !== JSON.stringify(savedData)
  }, [data, savedData])

  const sectionHasChanges = useCallback((sectionId: string) => {
    const section = SECTIONS.find(s => s.id === sectionId)
    if (!section) return false
    return section.fields.some(field => data[field.key] !== savedData[field.key])
  }, [data, savedData])

  const anySaving = Object.values(sectionState).some(s => s === 'saving')

  /* --------------------------------------------------------------
     Save logic
     -------------------------------------------------------------- */

  const saveSection = async (sectionId: string) => {
    const section = SECTIONS.find(s => s.id === sectionId)
    if (!section) return

    // Validate only this section's fields
    const currentData = dataRef.current
    const allErrs = validateConfig(currentData)
    const sectionErrs: FieldErrors = {}
    section.fields.forEach(f => {
      if (allErrs[f.key]) sectionErrs[f.key] = allErrs[f.key]
    })

    setFieldErrors(prev => ({ ...prev, ...sectionErrs }))
    if (Object.keys(sectionErrs).length > 0) {
      toast.error('Corrige los errores antes de guardar')
      return
    }

    setSectionState(prev => ({ ...prev, [sectionId]: 'saving' }))

    try {
      const promises = section.fields.map(field =>
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clave: field.key, valor: currentData[field.key] }),
        })
      )
      const results = await Promise.all(promises)
      const failed = results.filter(r => !r.ok)

      if (failed.length === 0) {
        setSavedData(prev => {
          const next = { ...prev }
          section.fields.forEach(field => { next[field.key] = currentData[field.key] })
          return next
        })
        setSectionState(prev => ({ ...prev, [sectionId]: 'saved' }))
        setLastSavedAt(new Date())
        localStorage.setItem('configLastSaved', Date.now().toString())

        // Auto-clear saved state after delay
        if (clearTimersRef.current[sectionId]) clearTimeout(clearTimersRef.current[sectionId])
        clearTimersRef.current[sectionId] = setTimeout(() => {
          setSectionState(prev => ({ ...prev, [sectionId]: 'idle' }))
        }, SAVE_CLEAR_MS)
      } else {
        const errors = await Promise.all(failed.map(async (r) => {
          const idx = results.indexOf(r)
          const body = await r.json().catch(() => ({}))
          return `${section.fields[idx]?.label}: ${body.error?.message || r.statusText}`
        }))
        setSectionState(prev => ({ ...prev, [sectionId]: 'error' }))
        toast.error(errors[0])
      }
    } catch (e) {
      setSectionState(prev => ({ ...prev, [sectionId]: 'error' }))
      toast.error('Error guardando configuración')
    }
  }

  const scheduleSave = (sectionId: string) => {
    if (timersRef.current[sectionId]) clearTimeout(timersRef.current[sectionId])
    timersRef.current[sectionId] = setTimeout(() => {
      saveSection(sectionId)
    }, DEBOUNCE_MS)
  }

  const flushPendingSave = (sectionId: string) => {
    if (timersRef.current[sectionId]) {
      clearTimeout(timersRef.current[sectionId])
      delete timersRef.current[sectionId]
      saveSection(sectionId)
    }
  }

  /* --------------------------------------------------------------
     Handlers
     -------------------------------------------------------------- */

  const handleChange = (key: keyof ConfigData, value: string, sectionId: string) => {
    setData(prev => ({ ...prev, [key]: value }))
    setFieldErrors(prev => {
      if (!prev[key]) return prev
      const n = { ...prev }
      delete n[key]
      return n
    })
    setSectionState(prev => ({ ...prev, [sectionId]: 'idle' }))
    scheduleSave(sectionId)
  }

  const handleTabChange = (newTab: 'empresa' | 'operacion') => {
    // Flush pending save of current tab before switching
    if (activeTab !== newTab) {
      flushPendingSave(activeTab)
    }
    setActiveTab(newTab)
  }

  /* --------------------------------------------------------------
     Effects
     -------------------------------------------------------------- */

  // Load last saved timestamp from localStorage
  useEffect(() => {
    const ts = localStorage.getItem('configLastSaved')
    if (ts) setLastSavedAt(new Date(Number(ts)))
  }, [])

  // Ctrl+S force save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        SECTIONS.forEach(s => flushPendingSave(s.id))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [data, activeTab])

  // beforeunload protection
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(t => clearTimeout(t))
      Object.values(clearTimersRef.current).forEach(t => clearTimeout(t))
    }
  }, [])

  /* --------------------------------------------------------------
     Render helpers
     -------------------------------------------------------------- */

  function renderField(field: FieldConfig, sectionId: string) {
    const isDirty = data[field.key] !== savedData[field.key]
    const hasError = !!fieldErrors[field.key]
    const state = sectionState[sectionId]
    const isTextarea = field.type === 'textarea'
    const isNumber = field.type === 'number'

    const baseInputClasses = cn(
      'w-full px-3 py-2.5 border rounded-lg text-sm transition-all duration-200 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400',
      field.prefix ? 'pl-8' : '',
      field.suffix ? 'pr-16' : '',
      isDirty && !hasError ? 'border-amber-400 bg-amber-50/30' : '',
      hasError ? 'border-red-400 bg-red-50/30' : 'border-gray-300'
    )

    return (
      <div key={field.key}>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor={field.key} className="text-sm font-medium flex items-center gap-1.5">
            {field.label}
            {field.required && <span className="text-red-500">*</span>}
            {isDirty && state !== 'saved' && state !== 'error' && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Cambio sin guardar" />
            )}
            {state === 'saving' && (
              <svg className="w-3.5 h-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {state === 'saved' && !isDirty && (
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {state === 'error' && (
              <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </Label>
        </div>
        <div className="relative">
          {field.prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              {field.prefix}
            </span>
          )}
          {isTextarea ? (
            <textarea
              id={field.key}
              value={data[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value, sectionId)}
              placeholder={field.placeholder}
              rows={field.rows || 3}
              className={cn(baseInputClasses, 'resize-none')}
            />
          ) : (
            <Input
              id={field.key}
              type={isNumber ? 'number' : field.type}
              value={data[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value, sectionId)}
              placeholder={field.placeholder}
              min={field.min}
              aria-invalid={hasError}
              className={baseInputClasses}
            />
          )}
          {field.suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              {field.suffix}
            </span>
          )}
        </div>
        {fieldErrors[field.key] && (
          <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1" role="alert">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {fieldErrors[field.key]}
          </p>
        )}
      </div>
    )
  }

  /* --------------------------------------------------------------
     JSX
     -------------------------------------------------------------- */

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
          <p className="text-sm text-muted-foreground mt-1">Datos de empresa y parámetros del sistema</p>
          {lastSavedAt && !hasChanges() && (
            <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Guardado {timeAgo(lastSavedAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {anySaving ? (
            <span className="text-xs text-blue-600 font-medium flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Guardando...
            </span>
          ) : hasChanges() ? (
            <span className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Cambios sin guardar
            </span>
          ) : (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Todo guardado
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs>
        <TabsList className="bg-gray-100 p-1 rounded-lg inline-flex">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => handleTabChange(section.id)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all inline-flex items-center',
                activeTab === section.id
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              )}
            >
              <span className="mr-1.5">{section.icon}</span>
              {section.title}
              {sectionHasChanges(section.id) && activeTab !== section.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-1.5" title="Cambios sin guardar" />
              )}
            </button>
          ))}
        </TabsList>

        {SECTIONS.map((section) => (
          <div
            key={section.id}
            className={activeTab === section.id ? 'block mt-4' : 'hidden'}
          >
            <Card className={sectionState[section.id] === 'error' ? 'border-red-300' : ''}>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {section.fields.map((field) => renderField(field, section.id))}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </Tabs>

      {/* Keyboard hint */}
      <p className="text-xs text-gray-400 text-center">
        Presiona <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-gray-600 font-mono text-[10px]">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-gray-600 font-mono text-[10px]">S</kbd> para guardar inmediatamente
      </p>
    </div>
  )
}
