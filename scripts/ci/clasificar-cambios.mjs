// Clasificador de cambios para el gate de CI (#778).
//
// Responde una sola pregunta, en modo fail-closed: ¿este diff puede afectar al
// producto o a la ejecución del ERP, o es estrictamente declarativo?
//
//   e2e_required=false  → el diff es solo documentación o skills declarativas.
//                         Sigue corriendo la auditoría de skills, tipos, unit e
//                         integración; se omite la suite E2E del ERP (8 shards).
//   e2e_required=true   → cualquier otra cosa. Es el valor por defecto y ante
//                         cualquier duda: diff vacío, rename, cambio de modo,
//                         symlink, archivo desconocido, o el propio ci.yml.
//
// Reglas de #778 aplicadas aquí:
//   §1  skill declarativa = solo .md bajo `.agents/skills/<n>/` o `.claude/skills/<n>/`
//   §2  scripts/hook/installer/dependencias/workflow ⇒ NO es «solo texto»
//   §3  cambios mixtos: gana la clasificación más estricta
//   §4  incertidumbre (rename, modo, symlink, vacío, desconocido) ⇒ E2E completo
//
// Por qué existe este archivo y no un `if` en bash: el allowlist anterior
// comparaba prefijos de `git diff --name-only`, que (a) reporta solo el destino
// de un rename y (b) no ve modos ni symlinks. Un `git mv src/motor.ts
// docs/motor.ts` se clasificaba como documentación y omitía el E2E para un
// cambio de código. Con `git diff --raw` se ven ambos extremos del rename y
// los modos, y la decisión queda cubierta por pruebas.
import { pathToFileURL } from 'node:url'

/** Prefijos del repositorio cuyo contenido es documentación del producto. */
export const PREFIJOS_DOCS = ['docs/']

/** Archivos sueltos de la raíz tratados como documentación del producto. */
export const ARCHIVOS_DOCS = ['AGENTS.md']

/** Raíces de skills de agente, en sus dos copias mantenidas por el repo. */
export const RAICES_SKILLS = ['.agents/skills/', '.claude/skills/']

/**
 * Extensiones ejecutables o de configuración. Si aparecen dentro de una carpeta
 * de skill, el cambio deja de ser declarativo (§2).
 */
export const EXT_EJECUTABLES = [
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sh', '.bash', '.ps1', '.rb', '.go',
]

/** Nombres exactos que siempre son ejecutables, esté donde esté. */
export const ARCHIVOS_EJECUTABLES = [
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  'opencode.json', 'vercel.json', 'tsconfig.json', 'next.config.ts',
]

/** Modo git de un symlink. */
export const MODO_SYMLINK = '120000'

function normalizar(p) {
  return String(p).replace(/^\.\//, '')
}

function esPrefijoDe(p, prefijos) {
  return prefijos.some((pre) => p.startsWith(pre))
}

/** ¿La ruta está dentro de una carpeta de skill de agente? */
export function esRutaDeSkill(ruta) {
  const p = normalizar(ruta)
  if (!esPrefijoDe(p, RAICES_SKILLS)) return false
  // Debe haber algo después de la raíz: `.agents/skills/` sola no es una skill.
  return p.slice(p.indexOf('/skills/') + '/skills/'.length).length > 0
}

/** ¿La ruta es documentación declarativa del producto? */
export function esRutaDeDocs(ruta) {
  const p = normalizar(ruta)
  return esPrefijoDe(p, PREFIJOS_DOCS) || ARCHIVOS_DOCS.includes(p)
}

/** ¿La ruta es un archivo ejecutable o de configuración? */
export function esRutaEjecutable(ruta) {
  const p = normalizar(ruta)
  const base = p.split('/').pop() ?? ''
  if (ARCHIVOS_EJECUTABLES.includes(base)) return true
  if (esPrefijoDe(p, ['.github/'])) return true
  // El propio clasificador y sus pruebas deciden el gate: tocarlos exige E2E.
  if (p === 'scripts/ci/clasificar-cambios.mjs') return true
  return EXT_EJECUTABLES.some((ext) => base.endsWith(ext))
}

/**
 * ¿La ruta es documentación declarativa **dentro** de una skill?
 * Solo Markdown. Un `.md` de una skill no ejecuta nada en el ERP.
 */
export function esRutaDeSkillDeclarativa(ruta) {
  const p = normalizar(ruta)
  if (!esRutaDeSkill(p)) return false
  return p.endsWith('.md')
}

/**
 * Clasifica una lista de entradas de `git diff --raw`.
 *
 * Cada entrada: `{ estado, modoAnterior, modoNuevo, rutaAnterior, ruta }`
 *   - `estado`: letra(s) de git (`A`, `M`, `D`, `R100`, `C75`, `T`…)
 *   - `rutaAnterior`: solo en renombres/copias
 *
 * Devuelve `{ e2e_required, skill_declarativa, motivo, detalle }`. `detalle`
 * agrupa las rutas para que el log del job muestre exactamente por qué se
 * decidió, sin que nadie tenga que repetir el razonamiento.
 */
export function clasificar(entradas) {
  const detalle = { docs: [], skills: [], ejecutables: [], inciertos: [], cuenta: 0 }

  if (!Array.isArray(entradas) || entradas.length === 0) {
    return {
      e2e_required: true,
      skill_declarativa: false,
      motivo: 'Diff vacío o ilegible: no se puede demostrar que el cambio sea declarativo (§4). Se corre el E2E completo.',
      detalle,
    }
  }

  for (const e of entradas) {
    const ruta = normalizar(e.ruta ?? '')
    if (!ruta) {
      detalle.inciertos.push('(entrada sin ruta)')
      continue
    }
    detalle.cuenta += 1

    const estado = String(e.estado ?? '').toUpperCase()
    if (e.invalida) {
      // Entrada que el parser no pudo interpretar: nunca se asume inocua.
      detalle.inciertos.push(`${ruta} (entrada ilegible)`)
      continue
    }
    const esRenameOCopia = estado.startsWith('R') || estado.startsWith('C')
    const esSymlink = e.modoAnterior === MODO_SYMLINK || e.modoNuevo === MODO_SYMLINK
    // `000000` es «no existía» en una creación o un borrado, no un modo: solo
    // hay cambio de modo cuando ambos extremos existen y difieren.
    const MODOS_AUSENTES = new Set(['000000', '', undefined, null])
    const cambioDeModo =
      !MODOS_AUSENTES.has(e.modoAnterior) &&
      !MODOS_AUSENTES.has(e.modoNuevo) &&
      e.modoAnterior !== e.modoNuevo

    // §4 — cualquier incertidumbre estructural fuerza E2E, antes de mirar rutas.
    if (esSymlink) {
      detalle.inciertos.push(`${ruta} (symlink)`)
      continue
    }
    if (cambioDeModo) {
      detalle.inciertos.push(`${ruta} (modo ${e.modoAnterior}→${e.modoNuevo})`)
      continue
    }

    // Un rename solo es inocuo si AMBOS extremos caen en la misma clase
    // declarativa. Mover `src/x.ts` a `docs/x.md` no es documentación.
    if (esRenameOCopia) {
      const anterior = normalizar(e.rutaAnterior ?? '')
      const mismaClaseInocua =
        anterior.length > 0 &&
        ((esRutaDeDocs(anterior) && esRutaDeDocs(ruta)) ||
          (esRutaDeSkillDeclarativa(anterior) && esRutaDeSkillDeclarativa(ruta)))
      if (!mismaClaseInocua) {
        detalle.inciertos.push(`${ruta} (rename desde ${anterior || 'desconocido'})`)
        continue
      }
    }

    if (esRutaEjecutable(ruta)) {
      detalle.ejecutables.push(ruta)
      continue
    }
    if (esRutaDeSkillDeclarativa(ruta)) {
      detalle.skills.push(ruta)
      continue
    }
    if (esRutaDeDocs(ruta)) {
      detalle.docs.push(ruta)
      continue
    }

    // Cualquier otra ruta (src/**, prisma/**, e2e/**, config desconocida) es
    // cambio de producto: no hay lista de exclusiones por extensión.
    detalle.inciertos.push(`${ruta} (ruta no declarativa)`)
  }

  const skillDeclarativa = detalle.skills.length > 0 && detalle.ejecutables.length === 0

  if (detalle.ejecutables.length > 0) {
    return {
      e2e_required: true,
      skill_declarativa: false,
      motivo: `Hay ${detalle.ejecutables.length} archivo(s) ejecutable(s) o de configuración (§2): el diff no es solo texto.`,
      detalle,
    }
  }
  if (detalle.inciertos.length > 0) {
    return {
      e2e_required: true,
      skill_declarativa: false,
      motivo: `Hay ${detalle.inciertos.length} cambio(s) que no se pueden clasificar como declarativos con certeza (§4). Se corre el E2E completo.`,
      detalle,
    }
  }
  if (skillDeclarativa) {
    return {
      e2e_required: false,
      skill_declarativa: true,
      motivo: 'Solo Markdown de skills declarativas: se exige la auditoría de skills y se omite el E2E del ERP (§1).',
      detalle,
    }
  }
  return {
    e2e_required: false,
    skill_declarativa: false,
    motivo: 'Todo el diff es documentación del producto (docs/**, AGENTS.md): se omite el E2E del ERP.',
    detalle,
  }
}

// Con `-z` los campos van separados por espacio y el estado termina en NUL
// (no en TAB, como en la salida normal). El estado es lo último de la cabecera,
// así que la regex no lo ancla a nada: el NUL lo consume el split.
const ESTADO_RAW = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z][0-9]*)$/

/**
 * Una entrada de `git diff --raw`. Todos los campos estructurales son
 * opcionales porque una entrada ilegible solo trae `estado`, `ruta` e
 * `invalida`: el parser prefiere devolver algo marcado a descartarlo.
 *
 * @typedef {object} EntradaDiff
 * @property {string} [estado]
 * @property {string} [modoAnterior]
 * @property {string} [modoNuevo]
 * @property {string} [ruta]
 * @property {string} [rutaAnterior]
 * @property {boolean} [invalida]
 */

/**
 * Parsea la salida de `git diff --raw -z`. El formato por entrada es
 *   `:<modoAnt> <modoNue> <shaAnt> <shaNue> <estado>\0<ruta>\0`
 * y en renombres/copias añade `\0<rutaAnterior>\0`.
 *
 * Es **fail-closed**: un fragmento que no empieza por `:` no se descarta en
 * silencio — se devuelve como entrada inválida para que `clasificar` fuerce el
 * E2E. Perder una ruta aquí significaría omitir la suite sin decirlo.
 *
 * @param {string} salida
 * @returns {EntradaDiff[]}
 */
export function parsearRawDiff(salida) {
  if (!salida) return []
  const partes = String(salida).split('\0')
  const entradas = []
  for (let i = 0; i < partes.length; i++) {
    const cabecera = partes[i]
    if (!cabecera) continue
    if (!cabecera.startsWith(':')) {
      // Residuo no reconocido: se conserva para que el llamador lo trate como
      // incierto en vez de ignorarlo.
      entradas.push({ estado: '?', ruta: `(no reconocido: ${cabecera.slice(0, 80)})`, invalida: true })
      continue
    }
    const m = ESTADO_RAW.exec(cabecera)
    if (!m) {
      // Cabecera ilegible: su ruta también es ilegible, así que se consume
      // junto con ella para no generar dos entradas basura por un solo cambio.
      const rutaCruda = partes[++i] ?? ''
      entradas.push({
        estado: '?',
        ruta: `${rutaCruda || '(sin ruta)'} (cabecera ilegible)`,
        invalida: true,
      })
      continue
    }
    const [, modoAnterior, modoNuevo, bruto] = m
    const estado = bruto
    const ruta = partes[++i] ?? ''
    if (!ruta) {
      entradas.push({ estado, modoAnterior, modoNuevo, ruta: '', invalida: true })
      continue
    }
    const entrada = { estado, modoAnterior, modoNuevo, ruta }
    if (estado.startsWith('R') || estado.startsWith('C')) {
      entrada.rutaAnterior = partes[++i] ?? ''
      if (!entrada.rutaAnterior) {
        entrada.invalida = true
        entrada.ruta = `${ruta} (rename sin origen legible)`
      }
    }
    entradas.push(entrada)
  }
  return entradas
}

/** Devuelve `true` cuando el script se ejecuta como programa principal. */
export function esPrincipal() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}

/** Imprime el veredicto en el formato que lee el workflow. */
export function imprimir(resultado) {
  const { e2e_required, skill_declarativa, motivo, detalle } = resultado
  console.log(`e2e_required=${e2e_required}`)
  console.log(`skill_declarativa=${skill_declarativa}`)
  console.log(`motivo: ${motivo}`)
  if (detalle.cuenta) console.log(`archivos clasificados: ${detalle.cuenta}`)
  for (const [clase, rutas] of Object.entries(detalle)) {
    if (clase === 'cuenta' || rutas.length === 0) continue
    console.log(`  [${clase}]`)
    for (const r of rutas) console.log(`    ${r}`)
  }
}

if (esPrincipal()) {
  // El diff llega por stdin para no depender de cómo se invoque git.
  const fs = await import('node:fs')
  let bruto = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (t) => { bruto += t })
  process.stdin.on('end', () => {
    const resultado = clasificar(parsearRawDiff(bruto))
    imprimir(resultado)
    // Se escribe el output de GitHub Actions si el runner lo ofrece.
    const salida = process.env.GITHUB_OUTPUT
    if (salida) {
      try {
        fs.appendFileSync(salida, `e2e_required=${resultado.e2e_required}\n`)
        fs.appendFileSync(salida, `skill_declarativa=${resultado.skill_declarativa}\n`)
      } catch (e) {
        console.log(`aviso: no se pudo escribir GITHUB_OUTPUT (${e instanceof Error ? e.message : e})`)
      }
    }
  })
}

