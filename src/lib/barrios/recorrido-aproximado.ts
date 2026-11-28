/**
 * #859 Recorrido territorial. Prototipo operacional NO vial.
 *
 * Coordenadas métricas de centros obtenidas del PDF DU15 (PBOT Codazzi 2024),
 * extracción preliminar v0.5. NO son entradas de calles ni distancias de
 * conducción. El origen sustituye el centroide de San José por la posición
 * experimental marcada por el PO dentro del barrio (cerca de Villa Esther).
 *
 * Cercanía por GPS (#930) y Planificación/Embarques NO usan este módulo.
 */
import { normalizeBarrioNombre } from './normalizer'

export interface GrupoParaRecorrido {
  clave: string
  etiqueta: string
  unidadesPendientes?: number
}

interface Punto { x: number; y: number }
interface Visita { clave: string; punto: Punto }

/** Referencia estimada visualmente, NO georreferenciación oficial de planta. */
export const ORIGEN_AGUA_BAMBU_EXPERIMENTAL: Readonly<Punto> = { x: 4973700, y: 2666730 }

/** Fuente: DU15, inventario 62 sectores. Cada par es centro cartográfico aproximado. */
const CENTROS_DU15: ReadonlyArray<readonly [string, number, number]> = [
  ['El Juguete',4975202,2667685], ['15 de Noviembre',4974745,2667795],
  ['Aida Quintero',4974845,2666168], ['Alfonso Ávila',4973098,2666911],
  ['Altos del Tesoro',4973333,2668154], ['Atanasio Girardot',4973419,2666384],
  ['Buenos Aires',4974312,2665869], ['Camilo Torres',4972860,2667381],
  ['Candelaria',4975214,2666373], ['Cinco de Diciembre',4974005,2665672],
  ['El Bosque',4974578,2666785], ['El Carmen',4973760,2666015],
  ['El Centro',4974103,2666779], ['El Estadio',4975060,2667323],
  ['El Líbano',4973509,2667450], ['El Millón',4974226,2667703],
  ['El Paraíso',4972906,2667096], ['El Sena',4975196,2667292],
  ['El Socorro',4974208,2667454], ['El Tesoro',4973691,2667757],
  ['Fátima',4973933,2667276], ['Hernán Gómez',4974705,2665871],
  ['José Antonio Galán',4973698,2667002], ['José Londoño',4975002,2666370],
  ['La Alborada',4973679,2668143], ['La Antillana',4973165,2666338],
  ['La Frontera',4975692,2666731], ['La Gaitana',4973448,2666113],
  ['La Guitarra',4974051,2668339], ['La Victoria',4975386,2666776],
  ['Las Delicias',4974380,2666576], ['Las Flores',4974754,2666470],
  ['Las Margaritas 1',4973326,2666724], ['Las Margaritas 2',4972925,2666630],
  ['Las Palmeras',4974447,2667857], ['Los Laureles',4974604,2667451],
  ['Machique',4974623,2667099], ['Martínez Barbosa',4973759,2666382],
  ['María Fuentes',4972259,2667801], ['Nueva Esperanza',4975182,2666554],
  ['Obrero',4974985,2666619], ['Policarpa Salavarrieta',4974968,2667798],
  ['Primero de Mayo',4974501,2666123], ['Rafael Mendieta (La Pista)',4973546,2667160],
  ['Ramón Fernández',4973426,2666973], ['Rodrigo Álvarez',4975530,2666550],
  ['San José',4973716,2666836], ['San Vicente',4975086,2666926],
  ['Santa Rita',4974767,2666880], ['Seis de Marzo',4973569,2665594],
  ['Trujillo',4974222,2666234], ['Villa Baquero',4972799,2666883],
  ['Villa Eduardo',4972669,2666596], ['Villa Elisa',4975180,2666442],
  ['Villa Esperanza',4973790,2665234], ['Villa Esther',4973709,2666634],
  ['Villa Miriam',4974067,2668043], ['Villa Nurys',4973777,2667237],
  ['Barrio Nuevo',4975765,2666838], ['Urbanización Divina Pastora',4974007,2667838],
  ['Urbanización El Lago',4973255,2666050],
  ['Urbanización Las Margaritas',4972961,2666436],
]
const centros = new Map<string, Punto>(CENTROS_DU15.map(([nombre,x,y]): [string, Punto] => [normalizeBarrioNombre(nombre), {x,y}]))

/** ÚNICAS equivalencias reconocidas por el PO, no matching difuso. */
const equivalencias = new Map([
  [normalizeBarrioNombre('Instituto'),normalizeBarrioNombre('Martínez Barbosa')],
  [normalizeBarrioNombre('Centro'),normalizeBarrioNombre('El Centro')],
])

/** No convertir etiquetas dudosas del ERP en centros por similitud. */
export function centroCartograficoProvisional(etiqueta: string): Punto | null {
  const nombre = normalizeBarrioNombre(etiqueta)
  if (nombre === normalizeBarrioNombre('San José')) return ORIGEN_AGUA_BAMBU_EXPERIMENTAL
  return centros.get(equivalencias.get(nombre) ?? nombre) ?? null
}
function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function costo(ruta: readonly Visita[], origen: Punto): number {
  let actual = origen, total = 0
  for (const visita of ruta) {
    total += distancia(actual, visita.punto)
    actual = visita.punto
  }
  return total
}

/** Vecino más cercano: en cada paso, ir al centro más próximo al último visitado. */
function ordenarVisitables(visitas: readonly Visita[], origen: Punto, primeroFijo: boolean): Visita[] {
  const quedan = [...visitas]
  const ruta: Visita[] = []
  let actual = origen
  if (primeroFijo && quedan.length) {
    const fija = quedan.shift()!
    ruta.push(fija)
    actual = fija.punto
  }
  while (quedan.length) {
    let elegido = 0, mejor = Infinity
    for (let i = 0; i < quedan.length; i++) {
      const costoCandidato = distancia(actual, quedan[i].punto)
      if (costoCandidato < mejor - 1e-9) { mejor = costoCandidato; elegido = i }
    }
    const siguiente = quedan.splice(elegido, 1)[0]
    ruta.push(siguiente)
    actual = siguiente.punto
  }
  return ruta
}

export interface SugerenciaRecorrido {
  /** Identidades de grupo del ERP: jamás colapsar distintos pedidos/alias. */
  claves: string[]
  /** Grupos sin centro cartográfico confiable (conservados visibles). */
  sinCentro: string[]
  /** Costo SOLO de la subruta con centro; NO es vial ni ETA. */
  costoRectaCentrosMetros: number
  /** Siempre false si existe algún barrio sin centro o primera parada desconocida. */
  secuenciaGeometricaCompleta: boolean
}

/** Optimiza SOLO barrios físicos con demanda, preservando sin ubicación y demás grupos. */
export function sugerirRecorridoBarrios(
  grupos: readonly GrupoParaRecorrido[],
  primeroClave?: string,
): SugerenciaRecorrido {
  const unicos = [...new Map(grupos.map(g => [g.clave,g])).values()]
  const enRuta = unicos.filter(g => g.clave !== 'venta-anonima' &&
    g.clave !== 'sin-barrio' && g.unidadesPendientes !== 0)
  const fueraDeRuta = unicos.filter(g => !enRuta.includes(g) && g.clave !== 'venta-anonima')
  const fijado = primeroClave ? enRuta.find(g => g.clave === primeroClave) : undefined
  const visitables: Visita[] = []
  const sinCentro: string[] = []
  for (const g of enRuta) {
    const punto = centroCartograficoProvisional(g.etiqueta)
    if (punto) visitables.push({clave:g.clave,punto})
    else sinCentro.push(g.clave)
  }
  // Sin coordenada de la primera parada, no afirmar cercanía desde ella.
  if (fijado && sinCentro.includes(fijado.clave)) {
    const claves = [fijado.clave,...unicos.filter(g => g.clave !== fijado.clave && g.clave !== 'venta-anonima').map(g => g.clave)]
    return {claves,sinCentro,costoRectaCentrosMetros:0,secuenciaGeometricaCompleta:false}
  }
  const fija = fijado ? visitables.find(v => v.clave === fijado.clave) : undefined
  const lista = fija ? [fija,...visitables.filter(v => v.clave !== fija.clave)] : visitables
  const ordenados = ordenarVisitables(lista, ORIGEN_AGUA_BAMBU_EXPERIMENTAL, !!fija)
  return {
    claves: [...ordenados.map(v => v.clave),...sinCentro,...fueraDeRuta.map(g => g.clave)],
    sinCentro,
    costoRectaCentrosMetros: costo(ordenados, ORIGEN_AGUA_BAMBU_EXPERIMENTAL),
    secuenciaGeometricaCompleta: sinCentro.length === 0,
  }
}
