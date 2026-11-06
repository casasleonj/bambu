import { Prisma } from '@prisma/client'
import { endOfDayBogota, startOfDayBogota } from '@/lib/dates'
import { embarqueUsaEntregaVivaPorFlag, leerMetadata, CAPTURA_ENTREGA_PEDIDO, CAPTURA_CIERRE } from '@/lib/entrega-fisica-viva'
import { calcularPorFuentes, tarifasRepartidor, type TarifasRepartidor, type ComisionRepartidor, type FuenteComision, type RevisionComision, type UnidadesReparto } from './comision-repartidor-calculo'
import { leerEntregasConsulta } from './entregas-consulta'
export { tarifasRepartidor } from './comision-repartidor-calculo'
export type { TarifasRepartidor, ComisionRepartidor } from './comision-repartidor-calculo'

/** Fuente única de cierre, comisión diaria y nómina (#499).
 * El embarque conserva Embarque.fecha; sin embarque manda el hecho de entrega (#669).
 * Un pago, su medio o el precio de venta no acreditan ninguna entrega.
 */
export type TxComision = Pick<Prisma.TransactionClient, 'embarque' | 'pedido' | 'config' | 'trabajador' | 'historial' | 'embarqueMovimiento'>
type TxEntregasComision = Pick<TxComision, 'embarque' | 'pedido' | 'historial' | 'embarqueMovimiento'>
const seleccion = Prisma.validator<Prisma.EmbarqueInclude>()({
  pedidos: true,
  actividades: { where: { cantidadCumplida: { gt: 0 } }, select: { id: true, modo: true } },
  movimientos: {
    where: { tipo: { in: ['ENTREGA', 'VENTA_RUTA'] } },
    select: { id: true, tipo: true, producto: true, cantidad: true, metadata: true, sustitucionEntrega: { select: { id: true } } },
  },
})
type Mision = Prisma.EmbarqueGetPayload<{ include: typeof seleccion }>
type Entregado = { cPacaAguaEnt: number; cPacaHieloEnt: number; cBotellonFabEnt: number | null; cBotellonDomEnt: number | null }
const unidades = (p: Entregado): UnidadesReparto => ({ agua: p.cPacaAguaEnt, hielo: p.cPacaHieloEnt, botellon: (p.cBotellonFabEnt ?? 0) + (p.cBotellonDomEnt ?? 0) })
const vacio = (): UnidadesReparto => ({ agua: 0, hielo: 0, botellon: 0 })
const producto = (p: string) => p === 'PACA_AGUA' ? 'agua' : p === 'PACA_HIELO' ? 'hielo' : p === 'BOTELLON' ? 'botellon' : null
const invalido = (estado: string) => estado === 'ANULADO' || estado === 'CANCELADO'

/** Identidad explícita, sin comparar importes, cantidades ni cercanía temporal. */
async function pedidosConEntregaAtribuida(tx: Pick<TxComision, 'embarque'>, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const filtro = { tipo: 'ENTREGA' as const, metadata: { path: ['captura'], equals: CAPTURA_ENTREGA_PEDIDO }, OR: ids.map(id => ({ metadata: { path: ['pedidoId'], equals: id } })) }
  const misiones = await tx.embarque.findMany({
    where: { movimientos: { some: filtro } },
    select: { movimientos: { where: filtro, select: { metadata: true } } },
  })
  return new Set(misiones.flatMap(e => e.movimientos.map(m => leerMetadata(m.metadata).pedidoId).filter((id): id is string => !!id)))
}
const esMisionViva = (e: Mision) => embarqueUsaEntregaVivaPorFlag(e.createdAt) || e.movimientos.some(m => [CAPTURA_ENTREGA_PEDIDO, CAPTURA_CIERRE].includes(leerMetadata(m.metadata).captura ?? ''))

/** #669: una captura moderna rechazada por el lector no se convierte en legado.
 * Solo identifica el formato de origen; las cantidades/fechas las valida el lector común.
 */
async function pedidosConCapturaModerna(tx: Pick<TxComision, 'historial'>, ids: string[]) {
  const pedidos = new Set<string>(), oficina = new Set<string>()
  if (!ids.length) return { pedidos, oficina }
  const filas = await tx.historial.findMany({
    where: { entidad: 'Pedido', accion: 'UPDATE', registroId: { in: ids }, datos: { contains: 'consultaEntrega' } },
    select: { id: true, registroId: true, datos: true },
  })
  for (const f of filas) {
    if (/"consultaEntrega"\s*:/.test(f.datos)) pedidos.add(f.registroId)
    try {
      const datos = JSON.parse(f.datos) as { accion?: string; consultaEntrega?: { eventoEntregaId?: string | null } }
      // Una auditoría espejo de una misión no crea una segunda fuente de oficina.
      if (datos?.accion === 'ENTREGA_OFICINA' && datos.consultaEntrega && datos.consultaEntrega.eventoEntregaId == null) oficina.add(f.id)
    } catch { /* La captura dañada permanece moderna y requiere revisión. */ }
  }
  return { pedidos, oficina }
}

async function fuentesSinEmbarque(tx: TxEntregasComision, trabajadorId: string, ini: Date, fin: Date) {
  const rango = { desde: ini, hasta: new Date(+fin + 1) }
  const dentro = (fecha: Date) => fecha >= rango.desde && fecha < rango.hasta
  const eventosDelRango = await leerEntregasConsulta(tx, { rango })
  const idsConHechos = [...new Set(eventosDelRango.filter(e => e.repartidorId === trabajadorId).map(e => e.pedidoId))]
  const pedidos = await tx.pedido.findMany({ where: {
    embarqueId: null, canal: 'DOMICILIO', estado: { notIn: ['ANULADO', 'CANCELADO'] },
    estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] },
    OR: [
      { id: { in: idsConHechos } },
      { entregadoPorId: trabajadorId, entregadoAt: { gte: rango.desde, lt: rango.hasta } },
    ],
  } })
  const ids = pedidos.map(p => p.id)
  const [eventos, yaAtribuidos, capturasModernas] = await Promise.all([
    leerEntregasConsulta(tx, { ids }),
    pedidosConEntregaAtribuida(tx, ids),
    pedidosConCapturaModerna(tx, ids),
  ])
  const porPedido = new Map<string, typeof eventos>()
  for (const e of eventos) porPedido.set(e.pedidoId, [...(porPedido.get(e.pedidoId) ?? []), e])
  const fuentes: FuenteComision[] = []
  const revisiones: RevisionComision[] = []
  const dia = (fecha: Date) => fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  for (const p of pedidos) {
    const revision = (motivo: string) => revisiones.push({ embarqueId: '', motivo: `El pedido #${p.numero} ${motivo}` })
    const hechos = porPedido.get(p.id) ?? []
    if (yaAtribuidos.has(p.id)) {
      // No bloquear a quien ya tiene la entrega verificada en su misión solo
      // por descubrir el mismo pedido en la lectura del rango (#499/#669).
      if ((p.entregadoPorId === trabajadorId && p.entregadoAt && dentro(p.entregadoAt)) ||
        hechos.some(e => capturasModernas.oficina.has(e.id) && e.repartidorId === trabajadorId && dentro(e.fecha))) {
        revision('tiene entregas de embarque y fue desvinculado; concilia el reparto antes de pagar.')
      }
      continue
    }
    const moderna = capturasModernas.pedidos.has(p.id) || hechos.some(e => e.fuente !== 'HISTORICO')
    let u = vacio()
    if (moderna) {
      // Cada delta pertenece a su fecha y responsable, aunque el pedido siga
      // pendiente o su acumulado/última fecha cambien al completar otra entrega.
      const propios = hechos.filter(e => dentro(e.fecha) && e.repartidorId === trabajadorId)
      for (const e of propios) for (const l of e.cantidades ?? []) {
        const prod = producto(l.producto)
        if (prod) u[prod] += l.cantidad
      }
      if (hechos.some(e => dentro(e.fecha) && (e.repartidorId === trabajadorId || e.repartidorId === null) &&
        (e.cantidades === null || e.incompleto || e.repartidorId === null))) {
        revision('tiene entregas sin detalle completo verificable; concilia el reparto antes de pagar.')
      }
    } else {
      // Conservar la excepción explícita de pedidos completos anteriores sin
      // capturas detalladas; no fabricar deltas para parciales o días distintos.
      const acumulado = unidades(p)
      if (!Object.values(acumulado).some(n => n > 0)) continue
      const contradictorio = hechos.some(e =>
        (e.repartidorId !== null && e.repartidorId !== trabajadorId) ||
        (p.entregadoAt !== null && dia(e.fecha) !== dia(p.entregadoAt)))
      if (p.estadoEntrega !== 'ENTREGADO' || p.entregadoPorId !== trabajadorId ||
        !p.entregadoAt || !dentro(p.entregadoAt) || contradictorio) {
        revision('tiene cantidades históricas que no permiten separar fecha y responsable; concilia el reparto antes de pagar.')
      } else u = acumulado
    }
    if (Object.values(u).some(n => n > 0)) {
      fuentes.push({ id: p.id, numero: p.numero, href: `/pedidos/${p.id}`, origen: 'SIN_EMBARQUE', unidades: u })
    }
  }
  return { fuentes, revisiones }
}

async function fuentesDeMisiones(tx: Pick<TxComision, 'pedido' | 'embarque'>, misiones: Mision[]) {
  // La asignación actual de Pedido puede ser otra misión. Resolver la identidad
  // del evento por su pedidoId, sin exigir que siga vinculado al embarque original.
  const ids = [...new Set(misiones.flatMap(e => e.movimientos.map(m => leerMetadata(m.metadata).pedidoId).filter((id): id is string => !!id)))]
  const pedidos = ids.length ? await tx.pedido.findMany({ where: { id: { in: ids } }, select: { id: true, estadoEntrega: true, estado: true } }) : []
  const porId = new Map(pedidos.map(p => [p.id, p]))
  const legadosConEventos = await pedidosConEntregaAtribuida(tx, [...new Set(misiones.filter(e => !esMisionViva(e)).flatMap(e => e.pedidos.map(p => p.id)))])
  const fuentes: FuenteComision[] = []
  const revisiones: RevisionComision[] = []
  for (const e of misiones) {
    // Un CIERRE etiquetado conserva su procedencia aun después de apagar el flag.
    const vivo = esMisionViva(e)
    const u = vacio()
    const revision = (motivo: string) => {
      if (!revisiones.some(r => r.embarqueId === e.id && r.motivo === motivo)) revisiones.push({ embarqueId: e.id, motivo })
    }
    if (vivo) {
      if (e.movimientos.length === 0 && e.pedidos.some(p => p.canal === 'DOMICILIO' && !invalido(p.estadoEntrega) && !invalido(p.estado) && Object.values(unidades(p)).some(n => n > 0))) {
        revision('Hay cantidades entregadas sin eventos de esta misión; no se atribuye el acumulado al último repartidor.')
      }
      for (const m of e.movimientos) {
        const prod = producto(m.producto)
        if (!prod || m.sustitucionEntrega.length > 0) continue // cambios no son ventas entregadas
        const meta = leerMetadata(m.metadata)
        if (meta.posCierre) { revision('Hay entregas posteriores al cierre que requieren conciliación.'); continue }
        if (m.tipo === 'VENTA_RUTA' || meta.captura === CAPTURA_CIERRE) {
          // El cierre escribe solo su delta + ventas libres previas, separado de
          // los eventos ya atribuidos. VENTA_RUTA son las nuevas ventas del cierre.
          u[prod] += m.cantidad
        } else if (meta.captura === CAPTURA_ENTREGA_PEDIDO) {
          const pedido = meta.pedidoId ? porId.get(meta.pedidoId) : undefined
          if (!pedido) { revision('Una entrega no tiene un pedido verificable.'); continue }
          if (!invalido(pedido.estadoEntrega) && !invalido(pedido.estado)) u[prod] += m.cantidad
        } else {
          revision('Hay entregas sin identidad verificable; no se emparejan por cantidad.');
        }
      }
      if (e.movimientos.some(m => m.tipo === 'VENTA_RUTA' || leerMetadata(m.metadata).captura === CAPTURA_CIERRE) && e.pedidos.some(p => (invalido(p.estadoEntrega) || invalido(p.estado)) && Object.values(unidades(p)).some(n => n > 0))) {
        revision('Un pedido anulado afecta cantidades agregadas del cierre.');
      }
    } else {
      if (e.actividades.length > 0) revision('La misión histórica tiene actividades cumplidas sin eventos que permitan separar el reparto del retiro en punto.')
      // Excepción histórica explícita: no fabricar eventos a partir del acumulado.
      // Punto sin evidencia de reparto no acredita una entrega domiciliaria.
      for (const p of e.pedidos) {
        if (p.canal !== 'DOMICILIO' || p.estadoEntrega !== 'ENTREGADO' || invalido(p.estado)) continue
        if (legadosConEventos.has(p.id)) {
          revision(`El pedido #${p.numero} tiene entregas atribuidas a otra misión; su acumulado no permite separar el reparto de esta misión histórica.`)
          continue
        }
        const n = unidades(p)
        u.agua += n.agua; u.hielo += n.hielo; u.botellon += n.botellon
      }
    }
    fuentes.push({ id: e.id, numero: e.numero, href: `/embarques/${e.id}`, origen: vivo ? 'EMBARQUE_VIVO' : 'EMBARQUE_LEGADO', unidades: u })
  }
  return { fuentes, revisiones }
}

/** Una misión, misma regla que la nómina; también dentro del dry-run transaccional. */
export async function comisionDeEmbarque(tx: TxComision, embarqueId: string): Promise<ComisionRepartidor> {
  const e = await tx.embarque.findUniqueOrThrow({ where: { id: embarqueId }, include: { ...seleccion, trabajador: true } })
  const config = await tx.config.findUnique({ where: { clave: 'COM_REPARTIDOR' } })
  const tarifas = tarifasRepartidor(e.trabajador, config ? Number(config.valor) : undefined)
  if (!e.trabajador.usaMoto || !['COMISION', 'MIXTO'].includes(e.trabajador.tipoPago)) return calcularPorFuentes([], tarifas)
  const { fuentes, revisiones } = await fuentesDeMisiones(tx, [e])
  return calcularPorFuentes(fuentes, tarifas, revisiones)
}

/** Comisión en [ini, fin]; quien llama decide la elegibilidad COMISION/MIXTO. */
export async function calcularComisionRepartidor(tx: TxEntregasComision, trabajadorId: string, ini: Date, fin: Date, tarifas: TarifasRepartidor): Promise<ComisionRepartidor> {
  const embarques = await tx.embarque.findMany({ where: { trabajadorId, fecha: { gte: ini, lte: fin }, estado: 'CERRADO' }, include: seleccion })
  const { fuentes, revisiones } = await fuentesDeMisiones(tx, embarques)
  const sinEmbarque = await fuentesSinEmbarque(tx, trabajadorId, ini, fin)
  fuentes.push(...sinEmbarque.fuentes)
  revisiones.push(...sinEmbarque.revisiones)
  return calcularPorFuentes(fuentes, tarifas, revisiones)
}

export interface ComisionRepartidorDia extends ComisionRepartidor { trabajadorId: string; nombre: string }
export async function comisionRepartidoresDelDia(tx: TxComision, fecha: string): Promise<ComisionRepartidorDia[]> {
  const ini = startOfDayBogota(fecha), fin = endOfDayBogota(fecha)
  const [config, trabajadores] = await Promise.all([
    tx.config.findUnique({ where: { clave: 'COM_REPARTIDOR' } }),
    tx.trabajador.findMany({ where: { activo: true, usaMoto: true, tipoPago: { in: ['COMISION', 'MIXTO'] } }, select: { id: true, nombre: true, comRepartAgua: true, comRepartHielo: true, comRepartBotellon: true }, orderBy: { nombre: 'asc' } }),
  ])
  const filas: ComisionRepartidorDia[] = []
  for (const t of trabajadores) {
    const c = await calcularComisionRepartidor(tx, t.id, ini, fin, tarifasRepartidor(t, config ? Number(config.valor) : undefined))
    filas.push({ trabajadorId: t.id, nombre: t.nombre, ...c })
  }
  return filas
}
