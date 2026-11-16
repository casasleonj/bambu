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
import { appendFileSync } from 'node:fs'
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

/** Modo git de un gitlink (submódulo): el contenido lo decide otro repo. */
export const MODO_SUBMODULO = '160000'

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
  // La comparación es insensible a mayúsculas: `docs/x.SH` es tan ejecutable
  // como `docs/x.sh`, y en un filesystem case-insensitive ambos son el mismo
  // archivo.
  const baseMin = base.toLowerCase()
  if (ARCHIVOS_EJECUTABLES.some((a) => a.toLowerCase() === baseMin)) return true
  if (esPrefijoDe(p, ['.github/'])) return true
  // El propio clasificador y sus pruebas deciden el gate: tocarlos exige E2E.
  if (p === 'scripts/ci/clasificar-cambios.mjs') return true
  return EXT_EJECUTABLES.some((ext) => baseMin.endsWith(ext))
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
    // Un gitlink (submódulo) apunta a otro repositorio: su contenido no está en
    // este diff, así que no se puede afirmar que sea declarativo.
    const esSubmodulo = e.modoAnterior === MODO_SUBMODULO || e.modoNuevo === MODO_SUBMODULO
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
    if (esSubmodulo) {
      detalle.inciertos.push(`${ruta} (submódulo)`)
      continue
    }
    if (cambioDeModo) {
      detalle.inciertos.push(`${ruta} (modo ${e.modoAnterior}→${e.modoNuevo})`)
      continue
    }
    // Un archivo NUEVO con bit de ejecución tampoco es documentación, aunque su
    // nombre no lleve extensión conocida (`docs/deploy` con modo 100755).
    if (e.modoNuevo === '100755' && !esRutaDeSkillDeclarativa(ruta)) {
      detalle.ejecutables.push(`${ruta} (nuevo ejecutable, modo 100755)`)
      continue
    }

    // Un rename solo es inocuo si AMBOS extremos son documentación declarativa
    // **y ninguno es ejecutable**. Mover `docs/guia.md` a `docs/guia.sh` deja
    // los dos bajo `docs/` pero el destino es un script: no es documentación.
    // Por eso la comprobación de ejecutable va primero, sobre origen y destino.
    if (esRenameOCopia) {
      const anterior = normalizar(e.rutaAnterior ?? '')
      if (esRutaEjecutable(ruta) || esRutaEjecutable(anterior)) {
        detalle.ejecutables.push(`${anterior} → ${ruta}`)
        continue
      }
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
      motivo:
        'Solo Markdown de skills declarativas: se omite el E2E del ERP (§1). La auditoría de skills corre por su propio workflow, no por este gate.',
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
    // En un rename/copia `git diff --raw -z` emite PRIMERO el origen y después
    // el destino (verificado con git real: `R100\0src/viejo.ts\0docs/nuevo.md`).
    // Invertirlos hacía que `esRutaEjecutable` mirara solo el origen y diera por
    // documentación un `docs/guia.md → docs/guia.sh`. Este orden está cubierto
    // por prueba contra la salida real de git, no contra un fixture inventado.
    const primera = partes[++i] ?? ''
    const esRename = estado.startsWith('R') || estado.startsWith('C')
    if (!primera) {
      entradas.push({ estado, modoAnterior, modoNuevo, ruta: '', invalida: true })
      continue
    }
    let entrada
    if (esRename) {
      const segunda = partes[++i] ?? ''
      if (!segunda) {
        entradas.push({
          estado,
          modoAnterior,
          modoNuevo,
          ruta: `${primera} (rename sin destino legible)`,
          invalida: true,
        })
        continue
      }
      entrada = { estado, modoAnterior, modoNuevo, ruta: segunda, rutaAnterior: primera }
    } else {
      entrada = { estado, modoAnterior, modoNuevo, ruta: primera }
    }
    entradas.push(entrada)
  }
  return entradas
}

/** Devuelve `true` cuando el script se ejecuta como programa principal. */
export function esPrincipal() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}

/**
 * Neutraliza un nombre de archivo para imprimirlo en el log del job.
 *
 * Un nombre con salto de línea permite que la ruta ocupe una línea propia; si
 * empieza por `::`, GitHub Actions la interpreta como un comando de workflow
 * (`::error::`, `::add-mask::`, `::set-output::` antes, etc.). Verificado con un
 * archivo llamado `docs/a\n::error::Injected message`. Los caracteres de control
 * se escapan a su forma visible y la ruta se marca explícitamente.
 *
 * @param {string} ruta
 * @returns {string}
 */
export function paraLog(ruta) {
  return String(ruta)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    // Cualquier otro control (incluido ESC, que puede manipular la salida).
    .replace(/[\u0000-\u001f\u007f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

/** Imprime el veredicto en el formato que lee el workflow. */
export function imprimir(resultado) {
  const { e2e_required, skill_declarativa, motivo, detalle } = resultado
  console.log(`e2e_required=${e2e_required}`)
  console.log(`skill_declarativa=${skill_declarativa}`)
  console.log(`motivo: ${paraLog(motivo)}`)
  if (detalle.cuenta) console.log(`archivos clasificados: ${detalle.cuenta}`)
  for (const [clase, rutas] of Object.entries(detalle)) {
    if (clase === 'cuenta' || rutas.length === 0) continue
    console.log(`  [${clase}]`)
    for (const r of rutas) console.log(`    ${paraLog(r)}`)
  }
}

/**
 * Escribe los outputs en el fichero de GitHub Actions.
 *
 * Devuelve `{ ok, motivo }` en vez de llamar a `process.exit`, para que el
 * comportamiento sea testeable: dentro de Actions, no poder publicar el
 * resultado es un fallo, porque los jobs E2E se quedarían sin la condición que
 * los justifica y se omitirían en silencio.
 *
 * @param {object} resultado
 * @param {object} [entorno] Inyectable para las pruebas (env + escritor).
 * @returns {{ok: boolean, motivo?: string}}
 */
export function escribirSalida(resultado, entorno = {}) {
  const env = entorno.env ?? process.env
  const escribir = entorno.escribir ?? appendFileSync
  const salida = env.GITHUB_OUTPUT
  if (salida) {
    try {
      escribir(salida, `e2e_required=${resultado.e2e_required}\n`)
      escribir(salida, `skill_declarativa=${resultado.skill_declarativa}\n`)
      return { ok: true }
    } catch (e) {
      return {
        ok: false,
        motivo: `no se pudo escribir GITHUB_OUTPUT (${e instanceof Error ? e.message : e}); se cancela el paso para no omitir el E2E en silencio`,
      }
    }
  }
  if (env.GITHUB_ACTIONS === 'true') {
    return {
      ok: false,
      motivo: 'GITHUB_ACTIONS está activo pero falta GITHUB_OUTPUT; el resultado no llegaría a los jobs',
    }
  }
  // Fuera de Actions (uso local, pruebas) no hay fichero y no es un error.
  return { ok: true }
}

if (esPrincipal()) {
  // El diff llega por stdin para no depender de cómo se invoque git.
  let bruto = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (t) => { bruto += t })
  process.stdin.on('end', () => {
    const resultado = clasificar(parsearRawDiff(bruto))
    imprimir(resultado)
    const salida = escribirSalida(resultado)
    if (!salida.ok) {
      console.log(`::error::${salida.motivo}`)
      process.exitCode = 1
    }
  })
}

