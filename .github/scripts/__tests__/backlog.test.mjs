import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const backlog = require('../backlog.cjs')

const repo = { owner: 'o', repo: 'r' }

/** Cliente de GitHub simulado: guarda issues en memoria y registra las llamadas de escritura. */
function fakeGithub(issues) {
  const store = new Map(issues.map((i) => [i.number, { ...i, labels: i.labels.map((n) => ({ name: n })) }]))
  const writes = []
  const github = {
    paginate: async () => [...store.values()].filter((i) => i.state === 'open'),
    rest: {
      issues: {
        listForRepo: () => {},
        get: async ({ issue_number }) => {
          const i = store.get(issue_number)
          if (!i) throw Object.assign(new Error('Not Found'), { status: 404 })
          return { data: i }
        },
        removeLabel: async ({ issue_number, name }) => {
          writes.push(`-${issue_number}:${name}`)
          const i = store.get(issue_number)
          i.labels = i.labels.filter((l) => l.name !== name)
        },
        addLabels: async ({ issue_number, labels }) => {
          writes.push(`+${issue_number}:${labels.join(',')}`)
          store.get(issue_number).labels.push(...labels.map((name) => ({ name })))
        },
      },
    },
  }
  return { github, writes, store }
}

function ctxOf(github, eventName, payload) {
  const failed = []
  return {
    ctx: {
      github,
      context: { repo, eventName, payload },
      core: { info: () => {}, setFailed: (m) => failed.push(m) },
    },
    failed,
  }
}

const issue = (number, labels, state = 'open', extra = {}) => ({ number, state, labels, ...extra })
const estados = (store, n) => store.get(n).labels.map((l) => l.name).filter((x) => x.startsWith('estado:'))

describe('extraerIssues', () => {
  it('distingue cierre de simple referencia', () => {
    const r = backlog.extraerIssues('Closes #10, fixes #11\nRefs #12')
    expect(r.cierre).toEqual([10, 11])
    expect(r.todos).toEqual([10, 11, 12])
  })
  it('acepta listas, rangos, mayúsculas y dos puntos', () => {
    const r = backlog.extraerIssues('CLOSES: #5 y #6 · Refs #300–#302, #310')
    expect(r.cierre).toEqual([5, 6])
    expect(r.todos).toEqual([5, 6, 300, 301, 302, 310])
  })
  it('ignora comentarios HTML, bloques de código y repos ajenos', () => {
    const r = backlog.extraerIssues('<!-- Closes #1 -->\n```\nCloses #2\n```\nFixes otro/repo#3')
    expect(r.todos).toEqual([])
  })
  it('no confunde palabras que contienen "refs"', () => {
    expect(backlog.extraerIssues('prefs #9').todos).toEqual([])
  })
})

describe('reconciliar', () => {
  it('sin estado → pendiente', () => {
    expect(backlog.reconciliar(['P1'])).toEqual({ quitar: [], agregar: ['estado:pendiente'] })
  })
  it('varios estados → deja uno, en-curso gana', () => {
    expect(backlog.reconciliar(['estado:pendiente', 'estado:en-curso'])).toEqual({
      quitar: ['estado:pendiente'],
      agregar: [],
    })
  })
  it('ya correcto → sin cambios (no escribe)', () => {
    expect(backlog.reconciliar(['estado:bloqueado'])).toEqual({ quitar: [], agregar: [] })
  })
  it('cerrado → quita todos', () => {
    expect(backlog.reconciliar(['estado:en-curso', 'P0'], { cerrado: true })).toEqual({
      quitar: ['estado:en-curso'],
      agregar: [],
    })
  })
  it('objetivo fuerza el estado', () => {
    expect(backlog.reconciliar(['estado:bloqueado'], { objetivo: 'estado:en-curso' })).toEqual({
      quitar: ['estado:bloqueado'],
      agregar: ['estado:en-curso'],
    })
  })
})

describe('handleIssue', () => {
  it('issue nuevo sin estado recibe estado:pendiente', async () => {
    const { github, writes, store } = fakeGithub([issue(1, ['bug'])])
    const { ctx } = ctxOf(github, 'issues', { action: 'opened', issue: store.get(1) })
    await backlog.handleIssue({ ...ctx, context: { ...ctx.context, payload: { issue: { ...store.get(1), labels: [{ name: 'bug' }] } } } })
    expect(writes).toEqual(['+1:estado:pendiente'])
  })
  it('issue cerrado pierde sus estados', async () => {
    const { github, store } = fakeGithub([issue(2, ['estado:en-curso'], 'closed')])
    const { ctx } = ctxOf(github, 'issues', { issue: store.get(2) })
    await backlog.handleIssue(ctx)
    expect(estados(store, 2)).toEqual([])
  })
  it('ignora PRs (evento issues no los trae, pero por seguridad)', async () => {
    const { github, writes, store } = fakeGithub([issue(3, [], 'open', { pull_request: {} })])
    const { ctx } = ctxOf(github, 'issues', { issue: store.get(3) })
    await backlog.handleIssue(ctx)
    expect(writes).toEqual([])
  })
})

describe('handlePullRequest', () => {
  const pr = (over) => ({ title: 't', body: '', labels: [], user: { login: 'u' }, merged: false, ...over })

  it('PR sin issue falla el check', async () => {
    const { github } = fakeGithub([])
    const { ctx, failed } = ctxOf(github, 'pull_request', { action: 'opened', pull_request: pr({}) })
    await backlog.handlePullRequest(ctx)
    expect(failed).toHaveLength(1)
  })
  it('label sin-issue exime', async () => {
    const { github } = fakeGithub([])
    const { ctx, failed } = ctxOf(github, 'pull_request', {
      action: 'labeled',
      pull_request: pr({ labels: [{ name: 'sin-issue' }] }),
    })
    await backlog.handlePullRequest(ctx)
    expect(failed).toEqual([])
  })
  it('PR con Closes pone el issue en en-curso', async () => {
    const { github, store } = fakeGithub([issue(7, ['P0', 'estado:pendiente'])])
    const { ctx, failed } = ctxOf(github, 'pull_request', { action: 'opened', pull_request: pr({ body: 'Closes #7' }) })
    await backlog.handlePullRequest(ctx)
    expect(failed).toEqual([])
    expect(estados(store, 7)).toEqual(['estado:en-curso'])
  })
  it('es idempotente: segunda corrida no escribe', async () => {
    const { github, writes } = fakeGithub([issue(7, ['estado:en-curso'])])
    const { ctx } = ctxOf(github, 'pull_request', { action: 'synchronize', pull_request: pr({ body: 'Closes #7' }) })
    await backlog.handlePullRequest(ctx)
    expect(writes).toEqual([])
  })
  it('issue inexistente o PR citado como issue falla', async () => {
    const { github } = fakeGithub([issue(8, [], 'open', { pull_request: {} })])
    const { ctx, failed } = ctxOf(github, 'pull_request', { action: 'opened', pull_request: pr({ body: 'Refs #8, #999' }) })
    await backlog.handlePullRequest(ctx)
    expect(failed[0]).toMatch(/#8 \(es un PR/)
    expect(failed[0]).toMatch(/#999 \(no existe/)
  })
  it('issue cerrado citado no se reetiqueta ni falla', async () => {
    const { github, writes } = fakeGithub([issue(9, [], 'closed')])
    const { ctx, failed } = ctxOf(github, 'pull_request', { action: 'opened', pull_request: pr({ body: 'Refs #9' }) })
    await backlog.handlePullRequest(ctx)
    expect(failed).toEqual([])
    expect(writes).toEqual([])
  })
  it('PR cerrado sin merge devuelve en-curso a pendiente', async () => {
    const { github, store } = fakeGithub([issue(10, ['estado:en-curso'])])
    const { ctx } = ctxOf(github, 'pull_request', { action: 'closed', pull_request: pr({ body: 'Closes #10' }) })
    await backlog.handlePullRequest(ctx)
    expect(estados(store, 10)).toEqual(['estado:pendiente'])
  })
  it('PR mergeado: el que solo se refiere con Refs vuelve a pendiente; el Closes lo cierra GitHub', async () => {
    const { github, store } = fakeGithub([issue(11, ['estado:en-curso']), issue(12, ['estado:en-curso'])])
    const { ctx } = ctxOf(github, 'pull_request', {
      action: 'closed',
      pull_request: pr({ body: 'Closes #11\nRefs #12', merged: true }),
    })
    await backlog.handlePullRequest(ctx)
    expect(estados(store, 11)).toEqual(['estado:en-curso'])
    expect(estados(store, 12)).toEqual(['estado:pendiente'])
  })
})

describe('liberación por edición y decision-PO', () => {
  const pr = (over) => ({ title: 't', body: '', labels: [], user: { login: 'u' }, merged: false, ...over })

  it('quitar una referencia del cuerpo libera ese issue (pendiente)', async () => {
    const { github, store } = fakeGithub([issue(30, ['estado:en-curso']), issue(31, ['estado:en-curso'])])
    const { ctx } = ctxOf(github, 'pull_request', {
      action: 'edited',
      changes: { body: { from: 'Refs #30, #31' } },
      pull_request: pr({ body: 'Refs #31' }),
    })
    await backlog.handlePullRequest(ctx)
    expect(estados(store, 30)).toEqual(['estado:pendiente'])
    expect(estados(store, 31)).toEqual(['estado:en-curso'])
  })
  it('un issue con decision-PO vuelve a bloqueado, no a pendiente', async () => {
    const { github, store } = fakeGithub([issue(32, ['decision-PO', 'estado:en-curso'])])
    const { ctx } = ctxOf(github, 'pull_request', {
      action: 'edited',
      changes: { body: { from: 'Refs #32' } },
      pull_request: pr({ body: 'Closes #33' }),
    })
    store.set(33, { number: 33, state: 'open', labels: [{ name: 'estado:pendiente' }] })
    await backlog.handlePullRequest(ctx)
    expect(estados(store, 32)).toEqual(['estado:bloqueado'])
    expect(estados(store, 33)).toEqual(['estado:en-curso'])
  })
  it('editar sin cambiar referencias no libera nada', async () => {
    const { github, store } = fakeGithub([issue(34, ['estado:en-curso'])])
    const { ctx } = ctxOf(github, 'pull_request', {
      action: 'edited',
      changes: { title: { from: 'otro título' } },
      pull_request: pr({ body: 'Closes #34' }),
    })
    await backlog.handlePullRequest(ctx)
    expect(estados(store, 34)).toEqual(['estado:en-curso'])
  })
})

describe('handleSweep', () => {
  it('corrige abiertos sin estado o con estados duplicados y no toca PRs', async () => {
    const { github, store } = fakeGithub([
      issue(20, []),
      issue(21, ['estado:pendiente', 'estado:bloqueado']),
      issue(22, ['estado:en-curso']),
      issue(23, [], 'open', { pull_request: {} }),
    ])
    const { ctx } = ctxOf(github, 'schedule', {})
    await backlog.handleSweep(ctx)
    expect(estados(store, 20)).toEqual(['estado:pendiente'])
    expect(estados(store, 21)).toEqual(['estado:bloqueado'])
    expect(estados(store, 22)).toEqual(['estado:en-curso'])
    expect(estados(store, 23)).toEqual([])
  })
})
