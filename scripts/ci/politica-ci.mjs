// #896 — feedback de borrador separado de una certificación de CI.
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// No se intenta demostrar que un cambio de producto sea inocuo: un borrador
// diferido nunca certifica nada. Se excluyen diffs estructurales y cambios
// en infraestructura, tests E2E, configuración y rutas no mapeadas del piloto.
export function diffAptoBorrador(entradas) {
  if (!Array.isArray(entradas) || entradas.length === 0) return false
  return entradas.every(e => {
    if (!e || e.invalida || typeof e.ruta !== 'string' || !['A', 'M', 'D'].includes(e.estado)) return false
    const modos = { A: ['000000', '100644'], M: ['100644', '100644'], D: ['100644', '000000'] }[e.estado]
    return e.modoAnterior === modos[0] && e.modoNuevo === modos[1] &&
      /^(src\/|docs\/)/.test(e.ruta) && !/[\u0000-\u001f\u007f]/.test(e.ruta)
  })
}

export function planCI({ event, action, draft, fastDraft, required, diffOk }) {
  if (!['true', 'false'].includes(required)) throw new Error('e2e_required inválido o ausente')
  if (required === 'false' && event !== 'pull_request') throw new Error('Solo un PR puede ser declarativo')
  const candidato = required === 'true' && diffOk === 'true' && event === 'pull_request' && draft === 'true' &&
    ['opened', 'synchronize', 'reopened'].includes(action)
  const diferido = candidato && fastDraft === 'true'
  return {
    e2e_run: String(required === 'true' && !diferido),
    draft_deferred: String(diferido),
    draft_candidate: String(candidato),
  }
}

export function revisarGate(contexto, resultados) {
  const errores = []
  let plan
  try { plan = planCI(contexto) } catch (e) { errores.push(e.message) }
  for (const key of ['detect', 'quality', 'integration']) {
    if (resultados[key] !== 'success') errores.push(`${key}: ${resultados[key] || 'ausente'}`)
  }
  if (resultados.integrationOk !== 'true') errores.push('Integración sin evidencia explícita de éxito')
  if (plan) {
    if (resultados.run !== plan.e2e_run || resultados.deferred !== plan.draft_deferred) {
      errores.push('Plan E2E ausente o no coincide con el contexto')
    }
    const esperado = plan.e2e_run === 'true' ? 'success' : 'skipped'
    for (const key of ['e2e', 'hub']) {
      if (resultados[key] !== esperado) errores.push(`${key}: ${resultados[key] || 'ausente'}; esperado ${esperado}`)
    }
    if (plan.draft_deferred === 'true') errores.push('Borrador: E2E diferido; al pasar a revisión se exige CI completo. NO certifica merge.')
  }
  return { ok: errores.length === 0, errores }
}

function contexto(env) {
  return { event: env.CI_EVENT, action: env.CI_ACTION, draft: env.CI_DRAFT,
    fastDraft: env.CI_FAST_DRAFT, required: env.E2E_REQUIRED, diffOk: env.CI_DIFF_OK }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env
    if (process.argv[2] === 'diff') {
      const { parsearRawDiff } = await import('./clasificar-cambios.mjs')
      const raw = readFileSync(process.argv[3], 'utf8')
      if (!raw.endsWith('\0') || !diffAptoBorrador(parsearRawDiff(raw))) process.exitCode = 1
    } else if (process.argv[2] === 'plan') {
      const plan = planCI(contexto(env))
      if (!env.GITHUB_OUTPUT) throw new Error('Falta GITHUB_OUTPUT')
      appendFileSync(env.GITHUB_OUTPUT, Object.entries(plan).map(([k, v]) => `${k}=${v}\n`).join(''))
      console.log(JSON.stringify(plan))
    } else if (process.argv[2] === 'gate') {
      const r = revisarGate(contexto(env), { detect: env.R_DETECT, quality: env.R_QUALITY,
        integration: env.R_INTEGRATION, integrationOk: env.INTEGRATION_OK,
        e2e: env.R_E2E, hub: env.R_HUB, run: env.E2E_RUN, deferred: env.DRAFT_DEFERRED })
      console.log(`INFO lint (informativo): ${env.R_LINT || 'ausente'}`)
      for (const error of r.errores) console.error(error)
      if (r.ok) console.log('CI gate: validaciones exigidas aprobadas')
      else process.exitCode = 1
    } else throw new Error('Uso: politica-ci.mjs diff <ruta>|plan|gate')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
