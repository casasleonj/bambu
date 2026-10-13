'use strict'

/**
 * Backlog — fuente de verdad: GitHub Issues. Cada issue abierto lleva EXACTAMENTE
 * una etiqueta `estado:*`. Este módulo lo hace cumplir (ver docs/BACKLOG.md).
 * Se ejecuta desde .github/workflows/backlog.yml vía actions/github-script.
 */

const PENDIENTE = 'estado:pendiente'
const EN_CURSO = 'estado:en-curso'
const BLOQUEADO = 'estado:bloqueado'
const ESTADOS = [PENDIENTE, EN_CURSO, BLOQUEADO]
// Si un issue trae varios estados, gana el primero de esta lista.
const PRIORIDAD = [EN_CURSO, BLOQUEADO, PENDIENTE]
const SIN_ISSUE = 'sin-issue'
const DECISION_PO = 'decision-PO'
const MAX_RANGO = 100

const LISTA = String.raw`#\d+(?:\s*[–-]\s*#\d+)?(?:\s*(?:,|y|and|&)\s*#\d+(?:\s*[–-]\s*#\d+)?)*`
const RE_CIERRE = new RegExp(String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(${LISTA})`, 'gi')
const RE_REF = new RegExp(String.raw`\b(?:refs?|part of|related to|relates to)\s*:?\s+(${LISTA})`, 'gi')

function limpiar(texto) {
  return String(texto || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
}

function numerosDe(lista, destino) {
  for (const m of lista.matchAll(/#(\d+)(?:\s*[–-]\s*#(\d+))?/g)) {
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (b >= a && b - a <= MAX_RANGO) {
      for (let n = a; n <= b; n++) destino.add(n)
    } else {
      destino.add(a)
      destino.add(b)
    }
  }
}

/** Devuelve los números de issue citados: `cierre` (Closes/Fixes/Resolves), `todos` (cierre + Refs). */
function extraerIssues(texto) {
  const t = limpiar(texto)
  const cierre = new Set()
  const todos = new Set()
  for (const m of t.matchAll(RE_CIERRE)) numerosDe(m[1], cierre)
  for (const n of cierre) todos.add(n)
  for (const m of t.matchAll(RE_REF)) numerosDe(m[1], todos)
  const orden = (s) => [...s].sort((x, y) => x - y)
  return { cierre: orden(cierre), todos: orden(todos) }
}

/** Calcula qué etiquetas `estado:*` quitar/agregar. `objetivo` fuerza un estado concreto. */
function reconciliar(etiquetas, { cerrado = false, objetivo = null } = {}) {
  const presentes = ESTADOS.filter((e) => etiquetas.includes(e))
  let deseado = []
  if (!cerrado) {
    if (objetivo) deseado = [objetivo]
    else if (presentes.length === 0) deseado = [PENDIENTE]
    else deseado = [PRIORIDAD.find((e) => presentes.includes(e))]
  }
  return {
    quitar: presentes.filter((e) => !deseado.includes(e)),
    agregar: deseado.filter((e) => !presentes.includes(e)),
  }
}

async function aplicar({ github, context, core }, issue, opciones) {
  const etiquetas = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name))
  const { quitar, agregar } = reconciliar(etiquetas, opciones)
  const base = { owner: context.repo.owner, repo: context.repo.repo, issue_number: issue.number }
  for (const name of quitar) {
    try {
      await github.rest.issues.removeLabel({ ...base, name })
    } catch (e) {
      if (e.status !== 404) throw e
    }
  }
  if (agregar.length) await github.rest.issues.addLabels({ ...base, labels: agregar })
  if (quitar.length || agregar.length) {
    core.info(`#${issue.number}: -[${quitar.join(', ')}] +[${agregar.join(', ')}]`)
  }
  return quitar.length + agregar.length > 0
}

/** Devuelve a su estado de reposo un issue que ya no tiene PR: `bloqueado` si espera al PO, si no `pendiente`. */
async function liberar(ctx, n) {
  const { github, context } = ctx
  const { data: issue } = await github.rest.issues.get({ ...context.repo, issue_number: n })
  if (issue.pull_request || issue.state !== 'open') return
  const etiquetas = issue.labels.map((l) => l.name)
  if (!etiquetas.includes(EN_CURSO)) return
  await aplicar(ctx, issue, { objetivo: etiquetas.includes(DECISION_PO) ? BLOQUEADO : PENDIENTE })
}

async function handleIssue(ctx) {
  const { issue } = ctx.context.payload
  if (issue.pull_request) return
  await aplicar(ctx, issue, { cerrado: issue.state === 'closed' })
}

async function handlePullRequest(ctx) {
  const { github, context, core } = ctx
  const { action, pull_request: pr } = context.payload
  const etiquetasPr = (pr.labels || []).map((l) => l.name)
  const refs = extraerIssues(`${pr.title}\n${pr.body || ''}`)

  if (action === 'closed') {
    // Un PR que terminó libera lo que tenía en curso. Los que cierra con
    // Closes/Fixes los cierra GitHub al hacer merge (y se limpian por el evento issues.closed).
    const aLiberar = pr.merged ? refs.todos.filter((n) => !refs.cierre.includes(n)) : refs.todos
    for (const n of aLiberar) await liberar(ctx, n)
    return
  }

  if (action === 'edited' && context.payload.changes) {
    const antes = `${context.payload.changes.title?.from ?? pr.title}\n${context.payload.changes.body?.from ?? pr.body ?? ''}`
    for (const n of extraerIssues(antes).todos) {
      if (!refs.todos.includes(n)) await liberar(ctx, n)
    }
  }

  if (refs.todos.length === 0) {
    if (etiquetasPr.includes(SIN_ISSUE) || pr.user?.login === 'dependabot[bot]') {
      core.info('PR sin issue vinculado: exento (label sin-issue o dependabot).')
      return
    }
    core.setFailed(
      'Este PR no cita ningún issue. Agrega "Closes #N" (o "Refs #N") en la descripción, ' +
        'o la etiqueta "sin-issue" si de verdad no corresponde a una tarea. Regla: docs/BACKLOG.md.',
    )
    return
  }

  const faltantes = []
  for (const n of refs.todos) {
    let issue
    try {
      ;({ data: issue } = await github.rest.issues.get({ ...context.repo, issue_number: n }))
    } catch (e) {
      if (e.status === 404) {
        faltantes.push(`#${n} (no existe)`)
        continue
      }
      throw e
    }
    if (issue.pull_request) {
      faltantes.push(`#${n} (es un PR, no un issue)`)
      continue
    }
    if (issue.state === 'open') await aplicar(ctx, issue, { objetivo: EN_CURSO })
  }
  if (faltantes.length) core.setFailed(`Referencias inválidas en el PR: ${faltantes.join(', ')}.`)
}

/** Barrido diario: red de seguridad si algún evento se perdió. Solo corrige etiquetas de estado. */
async function handleSweep(ctx) {
  const { github, context, core } = ctx
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    ...context.repo,
    state: 'open',
    per_page: 100,
  })
  let corregidos = 0
  const enCurso = []
  for (const issue of issues) {
    if (issue.pull_request) continue
    if (await aplicar(ctx, issue, {})) corregidos++
    if (issue.labels.some((l) => (typeof l === 'string' ? l : l.name) === EN_CURSO)) enCurso.push(issue.number)
  }
  core.info(`Barrido: ${issues.length} abiertos, ${corregidos} corregidos.`)
  if (enCurso.length) core.info(`En curso: ${enCurso.map((n) => `#${n}`).join(', ')}`)
}

async function run(ctx) {
  const evento = ctx.context.eventName
  if (evento === 'issues') return handleIssue(ctx)
  if (evento === 'pull_request') return handlePullRequest(ctx)
  return handleSweep(ctx)
}

module.exports = { ESTADOS, extraerIssues, reconciliar, handleIssue, handlePullRequest, handleSweep, run }
