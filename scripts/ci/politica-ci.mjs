// #896 — feedback de borrador separado de una certificación de CI.
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function planCI({ event, action, draft, fastDraft, required }) {
  if (!['true', 'false'].includes(required)) throw new Error('e2e_required inválido o ausente')
  if (required === 'false' && event !== 'pull_request') throw new Error('Solo un PR puede ser declarativo')
  const candidato = required === 'true' && event === 'pull_request' && draft === 'true' &&
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
    fastDraft: env.CI_FAST_DRAFT, required: env.E2E_REQUIRED }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env
    if (process.argv[2] === 'plan') {
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
    } else throw new Error('Uso: politica-ci.mjs plan|gate')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
