/**
 * Tipos y validación del ledger de decisiones de TERRITORIO-F2 (M3/M4).
 *
 * Contrato aprobado en `docs/territorio/RONDA1_M3_M4_PROPUESTA.md` (revisión
 * 3): el ledger tiene exactamente una entrada por `valorNormalizado` (52, no
 * 177) — nunca una entrada por Cliente/Negocio (eso es el reporte de
 * ejecución, ver `ExecutionLogEntry` más abajo). `M1_REFERENCIA` es la
 * evidencia inmutable de `docs/territorio/M1_INVENTARIO_BARRIO.md` (Apéndice
 * + §2/§3/§6) — el ledger se valida contra ella para que nadie pueda alterar
 * `categoria`/`familiaId`/`fuentes`/`n` sin que quede detectado como
 * inconsistente con la evidencia de producción real.
 *
 * `M1_REFERENCIA` incluye además una **Adenda post-M1** (1 valor, "divina
 * pastora") con su propia evidencia (consulta de solo lectura contra
 * producción, Supabase, no el documento M1) — ver el bloque comentado antes
 * de esa entrada. `M1_INVENTARIO_BARRIO.md` en sí permanece sin editar: sigue
 * documentando únicamente el inventario original de 52 valores.
 *
 * Este módulo es puro (sin I/O, sin Prisma) para que la validación sea
 * testeable sin base de datos. `scripts/backfill-barrio-canonico.ts` es el
 * único lugar que hace I/O (leer el JSON, leer/escribir la DB).
 */

export type Categoria = 'A_DETERMINISTA' | 'B_VALIDACION' | 'C_FAMILIA' | 'D_DESCARTAR'
export type Decision = 'CREAR_BARRIO' | 'FUSIONAR_EN' | 'MANTENER_SEPARADO' | 'DESCARTAR' | 'PENDIENTE_DECISION'
export type Fuente = 'CLIENTE' | 'NEGOCIO' | 'PEDIDO'
export type EstadoLedger = 'RESUELTO' | 'PENDIENTE'

export interface DecisionLedgerEntry {
  valorNormalizado: string
  categoria: Categoria
  familiaId: string | null
  fuentes: Fuente[]
  n: number
  decision: Decision
  fusionarEn: string | null
  barrioCanonico: string | null
  razon: string
  estado: EstadoLedger
}

export type ResultadoEjecucion = 'VINCULADO' | 'YA_CORRECTO' | 'CONFLICTO' | 'PENDIENTE_DECISION' | 'DESCARTADO' | 'ERROR'

export interface ExecutionLogEntry {
  entidad: 'CLIENTE' | 'NEGOCIO'
  registroId: string
  valorLegacyOriginal: string
  valorNormalizado: string
  barrioIdAnterior: string | null
  barrioIdResultante: string | null
  resultado: ResultadoEjecucion
  detalleError?: string
}

export interface ValidationError {
  valorNormalizado?: string
  mensaje: string
}

/**
 * Evidencia de M1 (`docs/territorio/M1_INVENTARIO_BARRIO.md`), transcrita
 * exactamente — 52 `valorNormalizado`, con `categoria`/`familiaId`/`fuentes`/
 * `n` derivados de §2 (clusters deterministas), §3 (familias ambiguas), §4
 * (ruido) y el Apéndice (listas crudas). Ningún campo de decisión territorial
 * vive acá — esto es solo la evidencia inmutable contra la que se valida el
 * ledger editable (`scripts/backfill-barrio-canonico.decisiones.json`).
 *
 * n total (52 valores de M1) = 178 (126 Cliente + 51 Negocio + 1 Pedido,
 * `instituto` es el único valor que aparece en las tres fuentes) — verificado
 * por suma exhaustiva contra M1 §0/§5.
 *
 * Más abajo, tras el bloque de M1, hay una **Adenda post-M1 (1 valor,
 * "divina pastora", n=179 total)**: detectado en producción real después de
 * cerrado M1_INVENTARIO_BARRIO.md (no está en ese documento, que permanece
 * sin editar). Su `categoria`/`fuentes`/`n` están verificados con una consulta
 * de solo lectura directa a producción (Supabase, proyecto wdttkrlbpcawulaaiapj,
 * 2026-09-17), no con el documento M1 — se documenta aparte para no mezclar
 * ambas fuentes de evidencia.
 */
export const M1_REFERENCIA: Record<
  string,
  { categoria: Categoria; familiaId: string | null; fuentes: Fuente[]; n: number }
> = {
  // Categoría A — equivalencia determinista (13), M1 §2/§6.
  centro: { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 60 },
  'san jose': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 12 },
  instituto: { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO', 'PEDIDO'], n: 8 },
  'martinez barbosa': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 8 },
  'camilo torres': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 6 },
  'alfonso avila': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 3 },
  tiburon: { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 3 },
  fatima: { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  'la pista': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  'las flores': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  'villa eduardo': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  '5 de diciembre': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  'aida quintero': { categoria: 'A_DETERMINISTA', familiaId: null, fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },

  // Categoría B — candidato que requiere validación (16), M1 §2.
  '15 de noviembre': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  '20 de marzo': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'el carmen': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'el estadio': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'la victoria': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'primero de mayo': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'santa rita': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'urbanizacion don emerito': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'villa mafe': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  'villa olimpica': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
  machique: { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['NEGOCIO'], n: 2 },
  '15 diciembre': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['NEGOCIO'], n: 1 },
  'barrio las delicias': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['NEGOCIO'], n: 1 },
  'nueva esperanza': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['NEGOCIO'], n: 1 },
  'san martin': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['NEGOCIO'], n: 1 },
  'san vicente': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['NEGOCIO'], n: 1 },

  // Categoría C — familia ambigua (22 valores, 10 familias), M1 §3.
  antillana: { categoria: 'C_FAMILIA', familiaId: 'familia-antillana', fuentes: ['CLIENTE', 'NEGOCIO'], n: 10 },
  'la antillana': { categoria: 'C_FAMILIA', familiaId: 'familia-antillana', fuentes: ['CLIENTE'], n: 1 },
  'las palmeras': { categoria: 'C_FAMILIA', familiaId: 'familia-palmeras', fuentes: ['CLIENTE', 'NEGOCIO'], n: 5 },
  palmeras: { categoria: 'C_FAMILIA', familiaId: 'familia-palmeras', fuentes: ['CLIENTE'], n: 1 },
  laureles: { categoria: 'C_FAMILIA', familiaId: 'familia-laureles', fuentes: ['CLIENTE', 'NEGOCIO'], n: 4 },
  'los laureles': { categoria: 'C_FAMILIA', familiaId: 'familia-laureles', fuentes: ['CLIENTE'], n: 1 },
  socorro: { categoria: 'C_FAMILIA', familiaId: 'familia-socorro', fuentes: ['CLIENTE'], n: 2 },
  'el socorro': { categoria: 'C_FAMILIA', familiaId: 'familia-socorro', fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  variante: { categoria: 'C_FAMILIA', familiaId: 'familia-variante', fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  'la variante': { categoria: 'C_FAMILIA', familiaId: 'familia-variante', fuentes: ['CLIENTE', 'NEGOCIO'], n: 2 },
  libano: { categoria: 'C_FAMILIA', familiaId: 'familia-libano', fuentes: ['CLIENTE'], n: 1 },
  'el libano': { categoria: 'C_FAMILIA', familiaId: 'familia-libano', fuentes: ['CLIENTE'], n: 1 },
  'el tesoro': { categoria: 'C_FAMILIA', familiaId: 'familia-tesoro', fuentes: ['CLIENTE', 'NEGOCIO'], n: 4 },
  'altos del tesoro': { categoria: 'C_FAMILIA', familiaId: 'familia-tesoro', fuentes: ['CLIENTE'], n: 1 },
  mercado: { categoria: 'C_FAMILIA', familiaId: 'familia-mercado', fuentes: ['CLIENTE', 'NEGOCIO'], n: 3 },
  'mercado publico': { categoria: 'C_FAMILIA', familiaId: 'familia-mercado', fuentes: ['NEGOCIO'], n: 1 },
  'la gaitana': { categoria: 'C_FAMILIA', familiaId: 'familia-gaitana', fuentes: ['CLIENTE'], n: 1 },
  gaitan: { categoria: 'C_FAMILIA', familiaId: 'familia-gaitana', fuentes: ['NEGOCIO'], n: 1 },
  margaritas: { categoria: 'C_FAMILIA', familiaId: 'familia-margaritas', fuentes: ['CLIENTE'], n: 1 },
  'margaritas 2': { categoria: 'C_FAMILIA', familiaId: 'familia-margaritas', fuentes: ['CLIENTE'], n: 2 },
  'las margaritas 2': { categoria: 'C_FAMILIA', familiaId: 'familia-margaritas', fuentes: ['CLIENTE'], n: 1 },
  'margarita 1': { categoria: 'C_FAMILIA', familiaId: 'familia-margaritas', fuentes: ['CLIENTE'], n: 1 },

  // Categoría D — ruido, no es un Barrio (1), M1 §4.
  'drogueria fama yyy ubica en el romboy de la 25': { categoria: 'D_DESCARTAR', familiaId: null, fuentes: ['CLIENTE'], n: 1 },

  // Adenda post-M1 (1) — NO pertenece a M1_INVENTARIO_BARRIO.md (que
  // permanece sin editar). Detectado en producción real tras cerrado M1;
  // evidencia propia: consulta de solo lectura a Supabase (proyecto
  // wdttkrlbpcawulaaiapj, 2026-09-17) confirma 1 ocurrencia en Cliente.barrio,
  // 0 en Negocio.barrio. Decisión explícita del equipo: es un barrio real.
  'divina pastora': { categoria: 'B_VALIDACION', familiaId: null, fuentes: ['CLIENTE'], n: 1 },
}

const FUENTES_VALIDAS: readonly Fuente[] = ['CLIENTE', 'NEGOCIO', 'PEDIDO']
const DECISIONES_VALIDAS: readonly Decision[] = [
  'CREAR_BARRIO',
  'FUSIONAR_EN',
  'MANTENER_SEPARADO',
  'DESCARTAR',
  'PENDIENTE_DECISION',
]

function sameFuentes(a: Fuente[], b: Fuente[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((f) => setA.has(f))
}

/**
 * Valida el ledger completo contra sus propias reglas de consistencia interna
 * (garantía 2 de la revisión 2, ajuste 2 de la revisión 3) y contra
 * `M1_REFERENCIA` (checklist del gate de F2, punto 1). Pura — no toca la DB;
 * un `fusionarEn`/`barrioId` "ya vinculado en producción" se valida aparte,
 * en tiempo de ejecución (`CONFLICTO`), no acá.
 *
 * No lanza — devuelve la lista de errores (vacía si el ledger es válido).
 * El caller decide qué hacer: `--dry-run` los imprime y sigue; el modo real
 * aborta sin escribir nada si esta lista no está vacía.
 */
export function validarLedger(entries: DecisionLedgerEntry[]): ValidationError[] {
  const errores: ValidationError[] = []
  const valoresEsperados = Object.keys(M1_REFERENCIA)

  if (entries.length !== valoresEsperados.length) {
    errores.push({
      mensaje: `El ledger tiene ${entries.length} entrada(s), se esperaban exactamente ${valoresEsperados.length} (una por cada valorNormalizado de M1_INVENTARIO_BARRIO.md).`,
    })
  }

  const porValor = new Map<string, DecisionLedgerEntry>()
  for (const entry of entries) {
    if (porValor.has(entry.valorNormalizado)) {
      errores.push({ valorNormalizado: entry.valorNormalizado, mensaje: 'valorNormalizado duplicado en el ledger.' })
      continue
    }
    porValor.set(entry.valorNormalizado, entry)
  }

  for (const valor of porValor.keys()) {
    if (!(valor in M1_REFERENCIA)) {
      errores.push({ valorNormalizado: valor, mensaje: 'No pertenece al inventario de M1_INVENTARIO_BARRIO.md.' })
    }
  }
  for (const valor of valoresEsperados) {
    if (!porValor.has(valor)) {
      errores.push({ valorNormalizado: valor, mensaje: 'Falta en el ledger (presente en M1, ausente acá).' })
    }
  }

  for (const [valor, entry] of porValor) {
    const referencia = M1_REFERENCIA[valor]
    if (!referencia) continue // ya reportado arriba como "no pertenece a M1"

    if (entry.categoria !== referencia.categoria) {
      errores.push({
        valorNormalizado: valor,
        mensaje: `categoria="${entry.categoria}" no coincide con M1 ("${referencia.categoria}").`,
      })
    }
    if (entry.familiaId !== referencia.familiaId) {
      errores.push({
        valorNormalizado: valor,
        mensaje: `familiaId="${entry.familiaId}" no coincide con M1 ("${referencia.familiaId}").`,
      })
    }
    if (!sameFuentes(entry.fuentes, referencia.fuentes)) {
      errores.push({
        valorNormalizado: valor,
        mensaje: `fuentes=${JSON.stringify(entry.fuentes)} no coincide con M1 (${JSON.stringify(referencia.fuentes)}).`,
      })
    }
    if (entry.n !== referencia.n) {
      errores.push({ valorNormalizado: valor, mensaje: `n=${entry.n} no coincide con M1 (${referencia.n}).` })
    }
    if (!entry.fuentes.every((f) => FUENTES_VALIDAS.includes(f)) || entry.fuentes.length === 0) {
      errores.push({ valorNormalizado: valor, mensaje: 'fuentes debe ser un arreglo no vacío de CLIENTE/NEGOCIO/PEDIDO.' })
    }
    if (!DECISIONES_VALIDAS.includes(entry.decision)) {
      errores.push({ valorNormalizado: valor, mensaje: `decision="${entry.decision}" no es un valor válido.` })
    }
    if (!Number.isInteger(entry.n) || entry.n < 1) {
      errores.push({ valorNormalizado: valor, mensaje: `n debe ser un entero positivo (tiene ${entry.n}).` })
    }

    // Consistencia categoria ↔ familiaId (M1 §6: familiaId solo en C_FAMILIA).
    if (entry.categoria === 'C_FAMILIA' && !entry.familiaId) {
      errores.push({ valorNormalizado: valor, mensaje: 'categoria=C_FAMILIA requiere familiaId no nulo.' })
    }
    if (entry.categoria !== 'C_FAMILIA' && entry.familiaId) {
      errores.push({ valorNormalizado: valor, mensaje: 'familiaId debe ser null salvo en categoria=C_FAMILIA.' })
    }

    // Consistencia decision ↔ estado.
    if (entry.decision === 'PENDIENTE_DECISION' && entry.estado !== 'PENDIENTE') {
      errores.push({ valorNormalizado: valor, mensaje: 'decision=PENDIENTE_DECISION requiere estado=PENDIENTE.' })
    }
    if (entry.decision !== 'PENDIENTE_DECISION' && entry.estado !== 'RESUELTO') {
      errores.push({ valorNormalizado: valor, mensaje: `decision="${entry.decision}" requiere estado=RESUELTO.` })
    }

    // razon obligatoria salvo PENDIENTE_DECISION (garantía 1 de la ronda 2).
    if (entry.decision !== 'PENDIENTE_DECISION' && entry.razon.trim() === '') {
      errores.push({ valorNormalizado: valor, mensaje: 'razon vacía para una decision distinta de PENDIENTE_DECISION.' })
    }

    // CREAR_BARRIO / MANTENER_SEPARADO requieren barrioCanonico.
    if ((entry.decision === 'CREAR_BARRIO' || entry.decision === 'MANTENER_SEPARADO') && !entry.barrioCanonico) {
      errores.push({ valorNormalizado: valor, mensaje: `decision="${entry.decision}" requiere barrioCanonico no nulo.` })
    }

    // FUSIONAR_EN: un solo salto, nunca cadenas ni ciclos (ajuste 2, ronda 3).
    if (entry.decision === 'FUSIONAR_EN') {
      if (!entry.fusionarEn) {
        errores.push({ valorNormalizado: valor, mensaje: 'decision=FUSIONAR_EN requiere fusionarEn no nulo.' })
      } else if (entry.fusionarEn === entry.valorNormalizado) {
        errores.push({ valorNormalizado: valor, mensaje: 'fusionarEn no puede referenciarse a sí mismo.' })
      } else {
        const destino = porValor.get(entry.fusionarEn)
        if (!destino) {
          errores.push({ valorNormalizado: valor, mensaje: `fusionarEn="${entry.fusionarEn}" no existe en el ledger.` })
        } else if (destino.decision !== 'CREAR_BARRIO' && destino.decision !== 'MANTENER_SEPARADO') {
          errores.push({
            valorNormalizado: valor,
            mensaje: `fusionarEn="${entry.fusionarEn}" debe tener decision CREAR_BARRIO o MANTENER_SEPARADO (tiene "${destino.decision}") — cadenas y ciclos están prohibidos.`,
          })
        }
      }
    } else if (entry.fusionarEn) {
      errores.push({ valorNormalizado: valor, mensaje: 'fusionarEn debe ser null salvo cuando decision=FUSIONAR_EN.' })
    }
  }

  return errores
}

/** true si alguna entrada sigue sin decisión humana. */
export function tienePendientes(entries: DecisionLedgerEntry[]): boolean {
  return entries.some((e) => e.decision === 'PENDIENTE_DECISION')
}

/**
 * Resuelve, para una entrada `FUSIONAR_EN` ya validada (un solo salto), el
 * `valorNormalizado` de la entrada destino (siempre `CREAR_BARRIO` o
 * `MANTENER_SEPARADO`). Asume que `validarLedger` ya pasó sin errores.
 */
export function resolverDestinoFusion(
  entry: DecisionLedgerEntry,
  porValor: Map<string, DecisionLedgerEntry>,
): DecisionLedgerEntry {
  if (entry.decision !== 'FUSIONAR_EN' || !entry.fusionarEn) {
    throw new Error(`resolverDestinoFusion llamado sobre una entrada que no es FUSIONAR_EN: ${entry.valorNormalizado}`)
  }
  const destino = porValor.get(entry.fusionarEn)
  if (!destino) {
    throw new Error(`fusionarEn="${entry.fusionarEn}" no existe (debería haber sido detectado por validarLedger).`)
  }
  return destino
}
