import 'server-only'

import {
  construirSolicitudVroom,
  leerOrdenVroom,
} from './heigit-vroom'
import type {
  ResultadoRecorridoVial,
  SolicitudRecorridoVial,
} from './google-route-optimization'

const ENDPOINT = 'https://api.heigit.org/vroom/v0'

export class HeiGitRutaNoDisponibleError extends Error {
  constructor(public readonly codigo:
    | 'HEIGIT_DESHABILITADO'
    | 'CUOTA_NO_CONFIRMADA'
    | 'CLAVE_NO_CONFIGURADA'
    | 'LIMITE_AGOTADO'
    | 'SERVICIO_INACCESIBLE',
  ) {
    super('No fue posible obtener el recorrido vial de HeiGIT.')
    this.name = 'HeiGitRutaNoDisponibleError'
  }
}

type EnvHeiGit = Record<string, string | undefined>

/** No basta una clave presente: habilitación y cuota comprobada explícitamente. */
export function configuracionHeiGit(env: EnvHeiGit = process.env) {
  if (env.HEIGIT_VROOM_ENABLED !== 'true')
    throw new HeiGitRutaNoDisponibleError('HEIGIT_DESHABILITADO')
  if (env.HEIGIT_VROOM_QUOTA_CONFIRMED !== 'true')
    throw new HeiGitRutaNoDisponibleError('CUOTA_NO_CONFIRMADA')
  const apiKey = env.HEIGIT_VROOM_API_KEY?.trim() ?? ''
  if (apiKey.length < 24 || apiKey.length > 4096 || /\s/.test(apiKey))
    throw new HeiGitRutaNoDisponibleError('CLAVE_NO_CONFIGURADA')
  return { apiKey }
}

/**
 * Solo interfaz server-to-server. Sin llamadas cuando está deshabilitada.
 * No hay reintentos automáticos ni fallback a Google que pueda causar cargos.
 *
 * La cuota externa del plan se aplica en HeiGIT; la flag expresa que se
 * comprobó en account.heigit.org y NO implementa un límite propio distribuido.
 */
export async function optimizarRecorridoHeiGit(
  input: SolicitudRecorridoVial,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoRecorridoVial> {
  const { apiKey } = configuracionHeiGit()
  const solicitud = construirSolicitudVroom(input)
  let response: Response
  try {
    response = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(solicitud),
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
  } catch {
    throw new HeiGitRutaNoDisponibleError('SERVICIO_INACCESIBLE')
  }

  // Nunca propagar el body del proveedor, cuya información podría incluir
  // datos de solicitud. Una respuesta 429/403 no activa Google como fallback.
  if (response.status === 429 || response.status === 403)
    throw new HeiGitRutaNoDisponibleError('LIMITE_AGOTADO')
  if (!response.ok)
    throw new HeiGitRutaNoDisponibleError('SERVICIO_INACCESIBLE')

  let data: unknown
  try { data = await response.json() } catch {
    throw new HeiGitRutaNoDisponibleError('SERVICIO_INACCESIBLE')
  }
  return leerOrdenVroom(data, input.paradas)
}
