'use client'

import { AlertCircle, FileText, Info, Tag, Wallet } from 'lucide-react'
import { CategoriaGastoSelect } from './categoria-select'
import { PARECE_PAGO_PERSONAL } from './types'

export interface DatosFormularioGasto {
  categoria: string
  descripcion: string
  monto: string
  responsable: string
  notas: string
}

interface Props {
  prefijo: string
  datos: DatosFormularioGasto
  cambiar: (clave: keyof DatosFormularioGasto, valor: string) => void
  categorias: readonly string[]
  bloqueado?: boolean
  legado?: boolean
}

const input = 'h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:opacity-60'
const label = 'mb-1.5 block text-sm font-semibold text-slate-800'

export function CamposGasto({ prefijo, datos, cambiar, categorias, bloqueado = false, legado = false }: Props) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3 sm:p-4">
        <label htmlFor={`${prefijo}-categoria`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
          <Tag className="h-4 w-4" aria-hidden="true" />
          1. ¿Qué tipo de gasto es? <span className="text-red-700">*</span>
        </label>
        <CategoriaGastoSelect id={`${prefijo}-categoria`} value={datos.categoria}
          onChange={valor => cambiar('categoria', valor)} options={categorias} disabled={bloqueado} />
        <p className="mt-2 text-xs text-blue-900/80">Busca una categoría o escribe un nombre nuevo y selecciona «Agregar».</p>
      </section>

      <div>
        <label htmlFor={`${prefijo}-descripcion`} className={label}>
          <FileText className="mr-1 inline h-4 w-4 text-slate-500" aria-hidden="true" />
          2. ¿En qué se gastó? <span className="text-red-700">*</span>
        </label>
        <input id={`${prefijo}-descripcion`} required maxLength={200} disabled={bloqueado}
          className={input} placeholder="Ej. Gasolina para la motocarga"
          value={datos.descripcion} onChange={event => cambiar('descripcion', event.target.value)} />
        {PARECE_PAGO_PERSONAL.test(datos.descripcion) && (
          <p role="status" data-testid="aviso-pago-personal" className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Si se trata de un pago al equipo, regístralo en Nómina para evitar duplicarlo en Cierre.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefijo}-monto`} className={label}>
          <Wallet className="mr-1 inline h-4 w-4 text-slate-500" aria-hidden="true" />
          3. Valor del gasto (COP) <span className="text-red-700">*</span>
        </label>
        <div className="relative">
          <span aria-hidden="true" className="absolute left-3 top-3.5 font-bold text-slate-500">$</span>
          <input id={`${prefijo}-monto`} type="number" min="0.01" step="0.01" required disabled={bloqueado}
            className={`${input} pl-7 text-lg font-semibold tabular-nums`}
            placeholder="0" value={datos.monto} onChange={event => cambiar('monto', event.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Info className="h-4 w-4 text-slate-500" aria-hidden="true" /> Detalles adicionales (opcionales)
        </p>
        <div>
          <label htmlFor={`${prefijo}-responsable`} className={label}>
            Persona asociada al gasto
          </label>
          <input id={`${prefijo}-responsable`} maxLength={100} disabled={bloqueado}
            value={datos.responsable} onChange={event => cambiar('responsable', event.target.value)}
            placeholder="Ej. Persona que realizó el pago" className={input} />
          <p className="mt-1 text-xs text-slate-600">
            {legado
              ? 'Antes se llamaba «Responsable». No demuestra quién pagó ni quién registró; comprueba el dato antes de corregirlo.'
              : 'Si lo sabes, escribe quién estuvo a cargo. El sistema registra automáticamente el usuario que guarda el gasto.'}
          </p>
        </div>
        <div>
          <label htmlFor={`${prefijo}-notas`} className={label}>Notas adicionales</label>
          <textarea id={`${prefijo}-notas`} maxLength={500} rows={2} disabled={bloqueado}
            value={datos.notas} onChange={event => cambiar('notas', event.target.value)}
            placeholder="Información que ayude a identificar el gasto"
            className={`${input} h-auto min-h-20 resize-y py-2.5`} />
        </div>
      </div>
    </div>
  )
}
