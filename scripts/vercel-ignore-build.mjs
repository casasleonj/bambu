// Ignored Build Step de Vercel (vercel.json → ignoreCommand), #703.
//
// Garantiza «migración antes del despliegue»: si el commit de producción toca
// prisma/schema.prisma o prisma/migrations/**, el despliegue espera a que el
// workflow `migrate-deploy.yml` de ESE mismo commit termine bien. Código de
// salida (documentación de Vercel, «Ignored Build Step»):
//   1 → la compilación continúa · 0 → se cancela el despliegue (CANCELED).
// Ante cualquier duda (API caída, migración fallida, tiempo agotado) se cancela:
// el código nuevo no sale y se reintenta con «Redeploy». Nunca se publica código
// que podría leer columnas que la base de producción aún no tiene (incidente #350).
import { pathToFileURL } from 'node:url'

export const REPO = 'casasleonj/bambu'
export const WORKFLOW = 'migrate-deploy.yml'
export const INTERVALO_MS = 15_000
export const VENTANA_APARICION_MS = 3 * 60_000 // la ejecución debe aparecer en este plazo
export const TIMEOUT_TOTAL_MS = 12 * 60_000
const MAX_ARCHIVOS_API = 300 // la API de commits no lista más: se asume que toca migraciones

export function tocaMigraciones(archivos) {
  return archivos.some((f) => f === 'prisma/schema.prisma' || f.startsWith('prisma/migrations/'))
}

async function leerJson(url, { env, fetchFn }) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'bambu-vercel-ignore-build' }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`GitHub respondió ${res.status} en ${url}`)
  return res.json()
}

async function conReintentos(fn, intentos = 3, dormir) {
  let ultimo
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      if (i < intentos - 1) await dormir(2000)
    }
  }
  throw ultimo
}

/**
 * @typedef {{ ok: boolean, status: number, json: () => Promise<any> }} RespuestaHttp
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   fetchFn?: (url: string, init?: { headers: Record<string, string>, signal?: AbortSignal }) => Promise<RespuestaHttp>,
 *   dormir?: (ms: number) => Promise<void>,
 *   ahora?: () => number,
 * }} [opciones]
 * @returns {Promise<{construir: boolean, motivo: string}>}
 */
export async function decidir({
  env = process.env,
  fetchFn = fetch,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  ahora = () => Date.now(),
} = {}) {
  if (env.VERCEL_ENV !== 'production') {
    return { construir: true, motivo: `VERCEL_ENV=${env.VERCEL_ENV ?? '(vacío)'}: no es producción, no espera migraciones.` }
  }
  const sha = env.VERCEL_GIT_COMMIT_SHA
  if (!sha) {
    return { construir: true, motivo: 'Sin SHA de Git (despliegue manual desde la CLI): se construye.' }
  }

  let archivos
  try {
    const commit = await conReintentos(() => leerJson(`https://api.github.com/repos/${REPO}/commits/${sha}`, { env, fetchFn }), 3, dormir)
    archivos = (commit.files ?? []).map((f) => f.filename)
    if (archivos.length >= MAX_ARCHIVOS_API) archivos.push('prisma/migrations/__lista_truncada__')
  } catch (e) {
    return { construir: false, motivo: `No se pudo leer el commit ${sha} en GitHub (${e.message}). Se cancela por seguridad; usar Redeploy.` }
  }

  if (!tocaMigraciones(archivos)) {
    return { construir: true, motivo: `El commit ${sha.slice(0, 7)} no toca prisma/schema.prisma ni prisma/migrations/**: no hay migración que esperar.` }
  }

  const inicio = ahora()
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${sha}&per_page=5`
  for (;;) {
    let run
    try {
      const data = await conReintentos(() => leerJson(url, { env, fetchFn }), 3, dormir)
      run = (data.workflow_runs ?? []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
    } catch (e) {
      return { construir: false, motivo: `No se pudo consultar ${WORKFLOW} (${e.message}). Se cancela por seguridad; usar Redeploy.` }
    }

    if (run?.status === 'completed') {
      return run.conclusion === 'success'
        ? { construir: true, motivo: `Migraciones aplicadas (${WORKFLOW} #${run.id}, success): se construye.` }
        : { construir: false, motivo: `${WORKFLOW} #${run.id} terminó en '${run.conclusion}': el código nuevo NO se despliega. Corregir la migración y usar Redeploy.` }
    }

    const espera = ahora() - inicio
    if (!run && espera >= VENTANA_APARICION_MS) {
      return { construir: false, motivo: `No apareció ninguna ejecución de ${WORKFLOW} para ${sha.slice(0, 7)} en ${VENTANA_APARICION_MS / 60000} min. Se cancela por seguridad; usar Redeploy.` }
    }
    if (espera >= TIMEOUT_TOTAL_MS) {
      return { construir: false, motivo: `${WORKFLOW} no terminó en ${TIMEOUT_TOTAL_MS / 60000} min (estado: ${run?.status ?? 'sin ejecución'}). Se cancela por seguridad; usar Redeploy.` }
    }
    console.log(`Esperando ${WORKFLOW}: ${run ? run.status : 'aún sin ejecución'} (${Math.round(espera / 1000)} s)...`)
    await dormir(INTERVALO_MS)
  }
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (esPrincipal) {
  decidir()
    .then(({ construir, motivo }) => {
      console.log(`[ignore-build] ${construir ? 'CONSTRUIR' : 'CANCELAR'}: ${motivo}`)
      process.exit(construir ? 1 : 0)
    })
    .catch((e) => {
      console.log(`[ignore-build] CANCELAR: error inesperado (${e instanceof Error ? e.message : String(e)}).`)
      process.exit(0)
    })
}
