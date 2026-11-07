'use client'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import {
  EnvioHabitualesSchema,
  EstadoHabitualesSchema,
  firmaDecisiones,
  type EnvioHabituales,
  type EstadoHabituales,
} from '@/lib/habituales-contrato'
import { generateUUID } from '@/lib/uuid'
import { ZodError } from 'zod'

const CAMBIO = 'bambu:habituales-intento'
function mensajeError(e: unknown) {
  const name = e && typeof e === 'object' && 'name' in e ? e.name : ''
  if (
    e instanceof TypeError ||
    name === 'TimeoutError' ||
    name === 'AbortError'
  )
    return 'No se pudo confirmar la conexión. Conservamos este envío: consulta su resultado antes de repetirlo.'
  return e instanceof Error &&
    !(e instanceof SyntaxError) &&
    !(e instanceof ZodError)
    ? e.message
    : 'No se pudo recuperar el envío. Revisa los pedidos antes de continuar.'
}

/** Conserva la referencia por usuario. Consultar/recargar nunca ejecuta POST. */
export function useEnvioHabituales(actor: string) {
  const key = `bambu:habituales:intento:v1:${actor}`
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key)
    } catch {
      return '!inaccesible'
    }
  }, [key])
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener('storage', notify)
    window.addEventListener(CAMBIO, notify)
    return () => {
      window.removeEventListener('storage', notify)
      window.removeEventListener(CAMBIO, notify)
    }
  }, [])
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null)
  let envio: EnvioHabituales | null = null
  if (raw) {
    try {
      const p = EnvioHabitualesSchema.safeParse(JSON.parse(raw))
      if (p.success) envio = p.data
    } catch {
      /* Se conserva para revisión; nunca se reemplaza automáticamente. */
    }
  }
  const running = useRef(false)
  const [ocupado, setOcupado] = useState(false)
  const [fallo, setFallo] = useState<{
    actor: string
    id: string | null
    text: string
  } | null>(null)
  const [lectura, setLectura] = useState<{
    actor: string
    data: EstadoHabituales
  } | null>(null)
  const [rechazo, setRechazo] = useState<{ actor: string; id: string } | null>(
    null,
  )
  const [consulta, setConsulta] = useState<{
    actor: string
    id: string
  } | null>(null)
  const resultado =
    lectura?.actor === actor && lectura.data.offlineId === envio?.offlineId
      ? lectura.data
      : null
  const rechazadoSinRegistro =
    !!rechazo && rechazo.actor === actor && rechazo.id === envio?.offlineId
  const consultado =
    !!consulta && consulta.actor === actor && consulta.id === envio?.offlineId
  const error =
    fallo?.actor === actor && fallo.id === (envio?.offlineId ?? null)
      ? fallo.text
      : null
  function fallar(text: string, id: string | null) {
    setFallo({ actor, id, text })
  }
  const guardar = useCallback(
    (value: EnvioHabituales | null) => {
      if (value) localStorage.setItem(key, JSON.stringify(value))
      else localStorage.removeItem(key)
      window.dispatchEvent(new Event(CAMBIO))
    },
    [key],
  )
  function registrarEstado(
    data: { success?: boolean; error?: { message?: string } },
    responseOk: boolean,
    intento: EnvioHabituales,
  ) {
    const parsed = EstadoHabitualesSchema.safeParse(data)
    if (
      !responseOk ||
      !data.success ||
      !parsed.success ||
      parsed.data.offlineId !== intento.offlineId ||
      firmaDecisiones(parsed.data.decisiones) !==
        firmaDecisiones(intento.decisiones)
    )
      throw new Error(
        data.error?.message ||
          'No se pudo comprobar el resultado. Conservamos el mismo envío.',
      )
    setLectura({ actor, data: parsed.data })
    setConsulta({ actor, id: intento.offlineId })
    setFallo(null)
    return parsed.data
  }
  async function consultarIntento(intento: EnvioHabituales) {
    const response = await fetch(
      `/api/pedidos/recurrentes?offlineId=${encodeURIComponent(intento.offlineId)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(25000) },
    )
    return registrarEstado(await response.json(), response.ok, intento)
  }
  async function consultar() {
    if (!envio || running.current) return
    running.current = true
    setOcupado(true)
    setFallo(null)
    setRechazo(null)
    try {
      await consultarIntento(envio)
    } catch (e) {
      fallar(mensajeError(e), envio.offlineId)
    } finally {
      running.current = false
      setOcupado(false)
      setConsulta({ actor, id: envio.offlineId })
    }
  }
  async function enviar(decisiones?: EnvioHabituales['decisiones']) {
    if (running.current) return false
    if (resultado?.estado === 'COMPLETO') return true
    running.current = true
    setOcupado(true)
    setFallo(null)
    setRechazo(null)
    let id: string | null = envio?.offlineId ?? null
    try {
      // Releer justo antes de enviar también respeta un intento guardado por otra pestaña.
      const actual = getSnapshot()
      let intento: EnvioHabituales
      if (actual) {
        if (decisiones)
          throw new Error(
            'Hay un envío anterior pendiente de comprobar. Consulta su resultado antes de confirmar otra selección.',
          )
        intento = EnvioHabitualesSchema.parse(JSON.parse(actual))
      } else {
        intento = EnvioHabitualesSchema.parse({
          offlineId: generateUUID(),
          decisiones,
        })
        try {
          guardar(intento)
        } catch {
          throw new Error(
            'No se pudo conservar este envío para recuperarlo. No se envió la selección.',
          )
        }
        setConsulta(null)
      }
      id = intento.offlineId
      const response = await fetch('/api/pedidos/recurrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intento),
        signal: AbortSignal.timeout(30000),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        // Una selección rechazada puede revisarse de nuevo solo tras consultar
        // su referencia. Un timeout/5xx nunca se interpreta como ausencia de pedidos.
        if ([400, 409, 422].includes(response.status)) {
          const comprobacion = await fetch(
            `/api/pedidos/recurrentes?offlineId=${encodeURIComponent(intento.offlineId)}`,
            { cache: 'no-store', signal: AbortSignal.timeout(25000) },
          )
          if (comprobacion.status === 404) {
            setRechazo({ actor, id: intento.offlineId })
            setConsulta({ actor, id: intento.offlineId })
          } else if (
            comprobacion.ok &&
            registrarEstado(await comprobacion.json(), true, intento).estado ===
              'COMPLETO'
          )
            return true
        }
        throw new Error(
          data.error?.message ||
            'No se pudo completar el envío. Consulta su resultado antes de repetir.',
        )
      }
      const estado = await consultarIntento(intento)
      return estado.estado === 'COMPLETO'
    } catch (e) {
      fallar(mensajeError(e), id)
      return false
    } finally {
      running.current = false
      setOcupado(false)
    }
  }
  function quitarSiMismo(id: string) {
    try {
      const actual = EnvioHabitualesSchema.safeParse(
        JSON.parse(getSnapshot() ?? 'null'),
      )
      if (!actual.success || actual.data.offlineId !== id) return false
      guardar(null)
      return true
    } catch {
      fallar(
        'No se pudo cerrar la referencia. Conservamos el resultado para comprobarlo otra vez.',
        id,
      )
      return false
    }
  }
  function cerrarResultado() {
    if (
      running.current ||
      !envio ||
      resultado?.estado !== 'COMPLETO' ||
      !quitarSiMismo(envio.offlineId)
    )
      return false
    setLectura(null)
    setFallo(null)
    setConsulta(null)
    setRechazo(null)
    return true
  }
  function revisarRechazo() {
    if (
      running.current ||
      !rechazadoSinRegistro ||
      !envio ||
      !quitarSiMismo(envio.offlineId)
    )
      return false
    setLectura(null)
    setFallo(null)
    setConsulta(null)
    setRechazo(null)
    return true
  }
  return {
    envio,
    ocupado,
    error,
    resultado,
    consultado,
    referenciaIlegible: !!raw && !envio,
    rechazadoSinRegistro,
    revisarRechazo,
    consultar,
    enviar,
    cerrarResultado,
  }
}
