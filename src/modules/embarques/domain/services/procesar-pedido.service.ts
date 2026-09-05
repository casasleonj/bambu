/**
 * ProcesarPedido Domain Service.
 *
 * FIX F4.10-a: extrae la lógica de procesamiento de UN pedido individual
 * durante el cierre de embarque. Antes: ~119 líneas inline en
 * CerrarEmbarqueUseCase.procesarPedido(). Ahora: service dedicado
 * con responsabilidades claras.
 *
 * Responsabilidades:
 * - Procesar pedido ENTREGADO (actualizar cantidades, precios, factura)
 * - Procesar pedido PARCIAL (crear pedido hijo con faltantes)
 * - Procesar pedido NO_ENTREGADO (reasignar a nuevo embarque o dejar pendiente)
 * - Actualizar PedidoItems
 * - Loggear cambios de precio en historial
 *
 * Dependencias:
 * - `calcularEstadoPago` (lib/pedido-utils) — calcular estado de pago
 * - `getNextNumero` (lib/sequence) — generar número para pedido hijo
 * - `logPrecioCierre` interno — crear historial.PRECIO_CIERRE
 *
 * NO tiene dependencias de Prisma — recibe el `client` (TxOrPrisma)
 * como parámetro. Esto permite que el llamador (use case) decida si
 * corre dentro o fuera de una tx.
 */

import { EstadoEmbarque } from '@prisma/client'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { datosConfirmacionInicial, leerMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
import { validarSinSobreposicionConObligacionActiva, type EntregaAValidar } from '@/lib/obligacion-guard'
import type { CerrarEmbarqueInput } from '../../application/dto'
import type { MetodoPago } from '@prisma/client'

// Tipo del cliente (Tx o Prisma global)
// Reutilizamos la misma técnica que el use case
type TxOrPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: unknown
}

export interface PedidoRawInput {
  id: string
  numero: number
  clienteId: string
  // FIX BAMBU-LOG-004: necesarios para que el pedido hijo (faltante)
  // herede negocioId y el snapshot de dirección del padre — ver
  // crearPedidoHijo() más abajo. Ya vienen en el `findMany` sin `select`
  // de CerrarEmbarqueUseCase.fetchPedidosForEmbarque (trae todas las
  // columnas escalares), solo faltaba declararlos en este tipo.
  negocioId: string | null
  direccionEntrega: string | null
  barrioEntrega: string | null
  embarqueId: string | null
  // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 §0: embarque en el que se originó el
  // pedido (venta en ruta). Inmutable ante reasignaciones. Usado por el cierre
  // para conciliar el `Pago` en el embarque correcto.
  embarqueOrigenId: string | null
  estadoEntrega: string
  estado: string
  tipo: string
  canal: string
  origen: string
  precioPacaAgua: number | { toNumber: () => number }
  precioPacaHielo: number | { toNumber: () => number }
  precioBotellonFab: number | { toNumber: () => number }
  precioBotellonDom: number | { toNumber: () => number }
  precioBolsaAgua: number | { toNumber: () => number }
  precioBolsaHielo: number | { toNumber: () => number }
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  total: number | { toNumber: () => number }
  totalPagado: number | { toNumber: () => number }
  obs: string | null
  createdById: string | null
  items: Array<{ producto: string }>
  factura: { id: string } | null
}

export interface PreciosPedido {
  pacaAgua: number
  pacaHielo: number
  botellonFab: number
  botellonDom: number
  bolsaAgua: number
  bolsaHielo: number
}

export interface ProductosEntregados {
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
}

export interface ResultadoProcesarPedido {
  totalReal: number
  estado: 'ENTREGADO' | 'NO_ENTREGADO' | 'EN_RUTA'  // EN_RUTA = reasignado
}

function toNumber(value: number | { toNumber: () => number } | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

// N2, guard I-11 (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §3.4bis): traduce las
// columnas legacy per-producto (cXPed/cXEnt) al shape genérico que espera el
// guard compartido con EntregarPedidoUseCase. `BOTELLON` suma Fab+Dom porque
// `ObligacionPendiente.producto` es un único código genérico, sin distinguir
// canal de entrega (eso lo captura `Actividad.modo`, no el producto).
function construirEntregasAValidar(pedido: PedidoRawInput, entProd: ProductosEntregados): EntregaAValidar[] {
  return [
    { producto: 'PACA_AGUA', cantPedido: pedido.cPacaAguaPed, cantEntregaActual: pedido.cPacaAguaEnt, cantidadAEntregar: entProd.cPacaAguaEnt || 0 },
    { producto: 'PACA_HIELO', cantPedido: pedido.cPacaHieloPed, cantEntregaActual: pedido.cPacaHieloEnt, cantidadAEntregar: entProd.cPacaHieloEnt || 0 },
    {
      producto: 'BOTELLON',
      cantPedido: pedido.cBotellonFabPed + pedido.cBotellonDomPed,
      cantEntregaActual: pedido.cBotellonFabEnt + pedido.cBotellonDomEnt,
      cantidadAEntregar: (entProd.cBotellonFabEnt || 0) + (entProd.cBotellonDomEnt || 0),
    },
    { producto: 'BOLSA_AGUA', cantPedido: pedido.cBolsaAguaPed, cantEntregaActual: pedido.cBolsaAguaEnt, cantidadAEntregar: entProd.cBolsaAguaEnt || 0 },
    { producto: 'BOLSA_HIELO', cantPedido: pedido.cBolsaHieloPed, cantEntregaActual: pedido.cBolsaHieloEnt, cantidadAEntregar: entProd.cBolsaHieloEnt || 0 },
  ].filter((e) => e.cantidadAEntregar > 0)
}

export class ProcesarPedidoService {
  /**
   * Procesa un pedido individual según su estado de entrega:
   * - ENTREGADO: actualiza cantidades, precios, factura
   * - PARCIAL: idem ENTREGADO + crea pedido hijo con faltantes
   * - NO_ENTREGADO: reasigna a nuevo embarque o desasigna
   *
   * @returns totalReal (monto real del pedido, 0 si NO_ENTREGADO)
   */
  async execute(
    client: TxOrPrisma,
    pedido: PedidoRawInput,
    cuadre: CerrarEmbarqueInput['pedidos'][number],
    userRole: string | undefined,
    userId: string | undefined,
    // PR-1: la rama PARCIAL ya no crea pedido hijo. El param se conserva por
    // compatibilidad posicional con el call site; siempre queda vacío.
    _pedidosHijosCreados: Array<{ id: string; numero: number }>,
    pedidosActualizados: Array<{ id: string; estado: string }>,
    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: lista ya resuelta (el use case la lee
    // una vez, no una por pedido dentro del lock del cierre). Fallback al default.
    metodosRequieren?: string[],
  ): Promise<number> {
    const entProd = cuadre.productosEntregados ?? {
      cPacaAguaEnt: 0,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      cBolsaAguaEnt: 0,
      cBolsaHieloEnt: 0,
    }
    const montoPagado = cuadre.pagos.reduce((sum, p) => sum + p.monto, 0)

    // NO_ENTREGADO case
    if (cuadre.entregado === 'NO_ENTREGADO') {
      return this.procesarNoEntregado(client, pedido, cuadre, pedidosActualizados)
    }

    // Guard I-11 (N2, AGUA_BAMBU_N2_ALS_v2.0.md §3.4bis): ni PARCIAL ni
    // COMPLETO pueden entregar cantidad que ya está bajo gestión de una
    // ObligacionPendiente ABIERTA — evita doble cumplimiento físico (una vez
    // por el cierre de embarque, otra por el cumplimiento de la Actividad que
    // la tiene reservada). `client` acá es `TxOrPrisma` (tipado laxo por
    // diseño del service, ver comentario del tipo arriba); el modelo real
    // sigue siendo el mismo Prisma.TransactionClient que usa el resto del
    // cierre, así que el cast es seguro.
    await validarSinSobreposicionConObligacionActiva(
      client as unknown as Parameters<typeof validarSinSobreposicionConObligacionActiva>[0],
      pedido.id,
      construirEntregasAValidar(pedido, entProd),
    )

    // PARCIAL (PR-1, integridad de entrega parcial): entrega interina que NO
    // toca la obligación económica (`total`/`totalPagado`/`saldo`), NO crea
    // pedido hijo y NO registra pagos (eso es PR-2). Solo acumula lo entregado
    // físicamente y deja el pendiente re-planificable.
    if (cuadre.entregado === 'PARCIAL') {
      return this.procesarEntregaParcial(client, pedido, entProd, cuadre, userRole, userId, pedidosActualizados, metodosRequieren)
    }

    // Resolve prices (frozen original prices, ADMIN override only)
    const preciosOriginales: PreciosPedido = {
      pacaAgua: toNumber(pedido.precioPacaAgua),
      pacaHielo: toNumber(pedido.precioPacaHielo),
      botellonFab: toNumber(pedido.precioBotellonFab),
      botellonDom: toNumber(pedido.precioBotellonDom),
      bolsaAgua: toNumber(pedido.precioBolsaAgua),
      bolsaHielo: toNumber(pedido.precioBolsaHielo),
    }

    const precios: PreciosPedido = (cuadre.preciosReales && userRole === 'ADMIN')
      ? {
          pacaAgua: cuadre.preciosReales['pacaAgua'] ?? preciosOriginales.pacaAgua,
          pacaHielo: cuadre.preciosReales['pacaHielo'] ?? preciosOriginales.pacaHielo,
          botellonFab: cuadre.preciosReales['botellonFab'] ?? preciosOriginales.botellonFab,
          botellonDom: cuadre.preciosReales['botellonDom'] ?? preciosOriginales.botellonDom,
          bolsaAgua: cuadre.preciosReales['bolsaAgua'] ?? preciosOriginales.bolsaAgua,
          bolsaHielo: cuadre.preciosReales['bolsaHielo'] ?? preciosOriginales.bolsaHielo,
        }
      : preciosOriginales

    // Valor entregado EN ESTE cierre (comisión / totalVentas / auditoría de
    // precio). NO es la obligación económica del pedido — ver más abajo.
    const totalReal =
      precios.pacaAgua * (entProd.cPacaAguaEnt || 0) +
      precios.pacaHielo * (entProd.cPacaHieloEnt || 0) +
      precios.botellonFab * (entProd.cBotellonFabEnt || 0) +
      precios.botellonDom * (entProd.cBotellonDomEnt || 0) +
      precios.bolsaAgua * (entProd.cBolsaAguaEnt || 0) +
      precios.bolsaHielo * (entProd.cBolsaHieloEnt || 0)

    // PR-1: la obligación económica del pedido NO se recalcula desde lo
    // entregado. `total` se conserva; `saldo = total - totalPagado`.
    const totalObligacion = toNumber(pedido.total)

    // PR-2 (ADR-PAGO-EMBARQUE-CAPTURA-001): `cuadre.pagos` = SOLO dinero NUEVO de
    // esta misión (el asistente ya no prellena con los pagos previos). El
    // `totalPagado` del pedido se INCREMENTA por ese monto — nunca se pisa ni se
    // recorta. El guard `entregaPrevia` de PR-1 (defensa contra el prellenado)
    // desaparece.
    const totalPagadoPrevio = toNumber(pedido.totalPagado)

    // Acumular lo entregado sobre lo ya entregado (pedido re-planificado que
    // completa su faltante). En un pedido fresco `pedido.cXEnt` es 0.
    const entAcum: ProductosEntregados = {
      cPacaAguaEnt: (pedido.cPacaAguaEnt || 0) + (entProd.cPacaAguaEnt || 0),
      cPacaHieloEnt: (pedido.cPacaHieloEnt || 0) + (entProd.cPacaHieloEnt || 0),
      cBotellonFabEnt: (pedido.cBotellonFabEnt || 0) + (entProd.cBotellonFabEnt || 0),
      cBotellonDomEnt: (pedido.cBotellonDomEnt || 0) + (entProd.cBotellonDomEnt || 0),
      cBolsaAguaEnt: (pedido.cBolsaAguaEnt || 0) + (entProd.cBolsaAguaEnt || 0),
      cBolsaHieloEnt: (pedido.cBolsaHieloEnt || 0) + (entProd.cBolsaHieloEnt || 0),
    }

    // Guard F7 (ADR-PAGO-EMBARQUE-CAPTURA-001 §5): el cobro NUEVO de esta misión
    // no puede exceder el saldo pendiente ANTES de aplicarlo. Lo ya pagado en
    // misiones/prepagos previos NO cuenta contra este tope — sólo el delta de
    // este cierre. Sin tolerancia porcentual: `total` ya NO se recalcula (PR-1),
    // así que no hay drift de redondeo que absorber, y la CHECK de Postgres
    // `chk_pedido_montopagado_le_total` es exacta — un guard más laxo dejaría
    // pasar montos que luego abortan toda la tx del cierre por constraint.
    const saldoPendientePrevio = totalObligacion - totalPagadoPrevio
    if (montoPagado > saldoPendientePrevio + 0.01) {
      throw new Error(`PAGOS_EXCEDIDOS: el cobro de misión ($${montoPagado}) excede el saldo pendiente ($${saldoPendientePrevio}) del pedido #${pedido.numero}`)
    }
    // Clamp defensivo al centavo: garantiza `totalPagado <= total` aunque el
    // epsilon del guard deje pasar una fracción.
    const nuevoTotalPagado = Math.min(totalObligacion, totalPagadoPrevio + montoPagado)

    const estadoPago = calcularEstadoPago(totalObligacion, nuevoTotalPagado)

    // Update pedido
    const tx = client as unknown as {
      pedido: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; numero: number }>
      }
      pago: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      factura: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> }
      pedidoItem: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> }
      historial: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      embarque: { findUnique: (args: { where: { id: string }; select?: Record<string, boolean> }) => Promise<{ id: string; estado: string; numero: number } | null> }
    }
    await tx.pedido.update({
      where: { id: pedido.id },
      data: {
        estadoEntrega: 'ENTREGADO',
        estado: 'ENTREGADO',
        estadoPago,
        cPacaAguaEnt: entAcum.cPacaAguaEnt,
        cPacaHieloEnt: entAcum.cPacaHieloEnt,
        cBotellonFabEnt: entAcum.cBotellonFabEnt,
        cBotellonDomEnt: entAcum.cBotellonDomEnt,
        cBolsaAguaEnt: entAcum.cBolsaAguaEnt,
        cBolsaHieloEnt: entAcum.cBolsaHieloEnt,
        precioPacaAgua: precios.pacaAgua,
        precioPacaHielo: precios.pacaHielo,
        precioBotellonFab: precios.botellonFab,
        precioBotellonDom: precios.botellonDom,
        precioBolsaAgua: precios.bolsaAgua,
        precioBolsaHielo: precios.bolsaHielo,
        total: totalObligacion,
        totalPagado: nuevoTotalPagado,
        saldo: totalObligacion - nuevoTotalPagado,
      },
    })

    // Update PedidoItems (cantidad acumulada)
    await this.updatePedidoItems(client, pedido.id, entAcum, precios)

    // Log price changes (audita el delta de precio en el cierre)
    await this.logPrecioCierre(client, pedido, totalReal, userId)

    pedidosActualizados.push({ id: pedido.id, estado: 'ENTREGADO' })

    // Register payments (PR-2, ADR-PAGO-EMBARQUE-CAPTURA-001 §7): `cuadre.pagos`
    // es SIEMPRE dinero nuevo de esta misión (se retiró el prellenado histórico
    // del cierre y el guard `entregaPrevia` de PR-1). Se registran siempre, con
    // `embarqueId` = el embarque que se cierra.
    // ADR-PAGO-REPORTADO-CONFIRMADO-001: digital cobrado en ruta nace REPORTADO
    // (§2: métodos configurables). El use case pasa la lista resuelta; si no,
    // se lee acá (fallback para llamadas directas al service).
    const metodosConfirmacion =
      metodosRequieren ??
      (await leerMetodosRequierenConfirmacion(
        client as unknown as Parameters<typeof leerMetodosRequierenConfirmacion>[0],
      ))
    for (const pago of cuadre.pagos) {
      if (pago.monto > 0) {
        await tx.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo: pago.metodo as MetodoPago,
            monto: pago.monto,
            // ADR-PAGO-EMBARQUE-CAPTURA-001: cobro registrado en el cierre →
            // capturado EN ese embarque. `pedido.embarqueId` acá ES el embarque
            // que se cierra (fetchPedidosForEmbarque filtra por él), no un proxy
            // de asignación — la invariante "no derivar de Pedido.embarqueId"
            // aplica al flujo del repartidor, no a este.
            embarqueId: pedido.embarqueId,
            ...datosConfirmacionInicial(pago.metodo, metodosConfirmacion),
          },
        })
      }
    }

    // Update factura
    // FIX: Factura.fecha se fijaba una sola vez con @default(now()) al
    // crear el Pedido (CrearPedidoUseCase paso 9), y nunca se volvía a
    // tocar. Si el pedido nace un día y termina de entregarse otro (quedó
    // NO_ENTREGADO/atrapado en un embarque y se resuelve después), la
    // factura actualizaba montos/estado con los datos reales del cierre
    // pero mostraba la fecha de creación del pedido, no la de la entrega
    // real. Se sincroniza acá, en el único punto donde el pedido pasa a
    // ENTREGADO de forma definitiva.
    if (pedido.factura) {
      await tx.factura.update({
        where: { id: pedido.factura.id },
        data: {
          fecha: new Date(),
          total: totalObligacion,
          saldo: totalObligacion - nuevoTotalPagado,
          estado: nuevoTotalPagado >= totalObligacion ? 'PAGADA' : (nuevoTotalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
        },
      })
    }

    // PR-1: el faltante ya NO genera pedido hijo — el pendiente vive en el
    // propio pedido. La rama PARCIAL se procesa en `procesarEntregaParcial`.

    return totalReal
  }

  /**
   * PARCIAL (PR-1 + PR-2): cierre con entrega incompleta. Interino, sin N2.
   *  - acumula lo entregado físicamente sobre lo ya entregado;
   *  - NO recalcula `total` (obligación económica intacta — PR-1);
   *  - SÍ registra `cuadre.pagos` (dinero nuevo de esta misión) con
   *    `embarqueId` = el embarque que se cierra, e INCREMENTA `totalPagado`
   *    (ADR-PAGO-EMBARQUE-CAPTURA-001 §7 / F9 — simétrico con la rama COMPLETO);
   *  - NO crea pedido hijo;
   *  - deja el pedido `PENDIENTE` + `embarqueId = null` (re-planificable);
   *  - si la acumulación completa lo pedido, lo marca `ENTREGADO`.
   *
   * @returns el valor entregado EN ESTE cierre (para comisión / totalVentas).
   */
  private async procesarEntregaParcial(
    client: TxOrPrisma,
    pedido: PedidoRawInput,
    entProd: ProductosEntregados,
    cuadre: CerrarEmbarqueInput['pedidos'][number],
    userRole: string | undefined,
    userId: string | undefined,
    pedidosActualizados: Array<{ id: string; estado: string }>,
    metodosRequieren?: string[],
  ): Promise<number> {
    const tx = client as unknown as {
      pedido: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> }
      pedidoItem: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> }
      pago: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      factura: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> }
      historial: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
    }

    const acum: ProductosEntregados = {
      cPacaAguaEnt: (pedido.cPacaAguaEnt || 0) + (entProd.cPacaAguaEnt || 0),
      cPacaHieloEnt: (pedido.cPacaHieloEnt || 0) + (entProd.cPacaHieloEnt || 0),
      cBotellonFabEnt: (pedido.cBotellonFabEnt || 0) + (entProd.cBotellonFabEnt || 0),
      cBotellonDomEnt: (pedido.cBotellonDomEnt || 0) + (entProd.cBotellonDomEnt || 0),
      cBolsaAguaEnt: (pedido.cBolsaAguaEnt || 0) + (entProd.cBolsaAguaEnt || 0),
      cBolsaHieloEnt: (pedido.cBolsaHieloEnt || 0) + (entProd.cBolsaHieloEnt || 0),
    }

    if (
      acum.cPacaAguaEnt > (pedido.cPacaAguaPed || 0) ||
      acum.cPacaHieloEnt > (pedido.cPacaHieloPed || 0) ||
      acum.cBotellonFabEnt > (pedido.cBotellonFabPed || 0) ||
      acum.cBotellonDomEnt > (pedido.cBotellonDomPed || 0) ||
      acum.cBolsaAguaEnt > (pedido.cBolsaAguaPed || 0) ||
      acum.cBolsaHieloEnt > (pedido.cBolsaHieloPed || 0)
    ) {
      throw new Error(`ENTREGA_EXCEDE_PEDIDO: la entrega acumulada supera lo pedido en #${pedido.numero}`)
    }

    const totalPedido =
      (pedido.cPacaAguaPed || 0) + (pedido.cPacaHieloPed || 0) +
      (pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0) +
      (pedido.cBolsaAguaPed || 0) + (pedido.cBolsaHieloPed || 0)
    const totalEntregadoAcum =
      acum.cPacaAguaEnt + acum.cPacaHieloEnt + acum.cBotellonFabEnt +
      acum.cBotellonDomEnt + acum.cBolsaAguaEnt + acum.cBolsaHieloEnt
    const completo = totalEntregadoAcum >= totalPedido && totalPedido > 0

    // PR-2 (ADR-PAGO-EMBARQUE-CAPTURA-001 §7 / F9): cobro nuevo de esta misión.
    const montoPagado = cuadre.pagos.reduce((sum, p) => sum + p.monto, 0)
    const totalObligacionPed = toNumber(pedido.total)
    const totalPagadoPrevio = toNumber(pedido.totalPagado)
    const saldoPendientePrevio = totalObligacionPed - totalPagadoPrevio
    // Mismo guard F7 exacto que la rama COMPLETO (ver comentario allá).
    if (montoPagado > saldoPendientePrevio + 0.01) {
      throw new Error(`PAGOS_EXCEDIDOS: el cobro de misión ($${montoPagado}) excede el saldo pendiente ($${saldoPendientePrevio}) del pedido #${pedido.numero}`)
    }
    const nuevoTotalPagado = Math.min(totalObligacionPed, totalPagadoPrevio + montoPagado)
    // Los campos de dinero SOLO se escriben si hubo cobro nuevo en esta misión
    // (F9). Sin cobro, la obligación económica queda intacta byte a byte (PR-1).
    const camposDinero = montoPagado > 0
      ? {
          estadoPago: calcularEstadoPago(totalObligacionPed, nuevoTotalPagado),
          totalPagado: nuevoTotalPagado,
          saldo: totalObligacionPed - nuevoTotalPagado,
        }
      : {}

    // ADMIN puede corregir precios congelados también en un cierre parcial;
    // se persisten para el registro pero NO alteran `total` (PR-1).
    const precios = (cuadre.preciosReales && userRole === 'ADMIN')
      ? {
          precioPacaAgua: cuadre.preciosReales['pacaAgua'] ?? toNumber(pedido.precioPacaAgua),
          precioPacaHielo: cuadre.preciosReales['pacaHielo'] ?? toNumber(pedido.precioPacaHielo),
          precioBotellonFab: cuadre.preciosReales['botellonFab'] ?? toNumber(pedido.precioBotellonFab),
          precioBotellonDom: cuadre.preciosReales['botellonDom'] ?? toNumber(pedido.precioBotellonDom),
          precioBolsaAgua: cuadre.preciosReales['bolsaAgua'] ?? toNumber(pedido.precioBolsaAgua),
          precioBolsaHielo: cuadre.preciosReales['bolsaHielo'] ?? toNumber(pedido.precioBolsaHielo),
        }
      : {}

    await tx.pedido.update({
      where: { id: pedido.id },
      data: {
        cPacaAguaEnt: acum.cPacaAguaEnt,
        cPacaHieloEnt: acum.cPacaHieloEnt,
        cBotellonFabEnt: acum.cBotellonFabEnt,
        cBotellonDomEnt: acum.cBotellonDomEnt,
        cBolsaAguaEnt: acum.cBolsaAguaEnt,
        cBolsaHieloEnt: acum.cBolsaHieloEnt,
        estadoEntrega: completo ? 'ENTREGADO' : 'PENDIENTE',
        estado: completo ? 'ENTREGADO' : 'PENDIENTE',
        embarqueId: completo ? pedido.embarqueId : null,
        ...camposDinero,
        ...precios,
        // total: NO SE RECALCULA (obligación económica intacta — PR-1).
        // totalPagado: se INCREMENTA por el cobro de misión (PR-2 / F9), nunca se pisa.
      },
    })

    // Registrar el cobro nuevo de esta misión (ADR-PAGO-EMBARQUE-CAPTURA-001 §7).
    if (montoPagado > 0) {
      const metodosConfirmacion =
        metodosRequieren ??
        (await leerMetodosRequierenConfirmacion(
          client as unknown as Parameters<typeof leerMetodosRequierenConfirmacion>[0],
        ))
      for (const pago of cuadre.pagos) {
        if (pago.monto > 0) {
          await tx.pago.create({
            data: {
              pedidoId: pedido.id,
              metodo: pago.metodo as MetodoPago,
              monto: pago.monto,
              embarqueId: pedido.embarqueId,
              ...datosConfirmacionInicial(pago.metodo, metodosConfirmacion),
            },
          })
        }
      }
    }

    const itemAcum: Record<string, number> = {
      PACA_AGUA: acum.cPacaAguaEnt,
      PACA_HIELO: acum.cPacaHieloEnt,
      BOTELLON: acum.cBotellonFabEnt + acum.cBotellonDomEnt,
      BOLSA_AGUA: acum.cBolsaAguaEnt,
      BOLSA_HIELO: acum.cBolsaHieloEnt,
    }
    for (const item of pedido.items) {
      const c = itemAcum[item.producto]
      if (c !== undefined) {
        await tx.pedidoItem.updateMany({
          where: { pedidoId: pedido.id, producto: item.producto },
          data: { cantEntrega: c },
        })
      }
    }

    // Si la acumulación completa el pedido, se sincroniza la factura (fecha /
    // estado) igual que la rama ENTREGADO — sin tocar el dinero (obligación
    // intacta): `saldo = total - totalPagado` con los valores ya persistidos.
    if (completo && pedido.factura) {
      await tx.factura.update({
        where: { id: pedido.factura.id },
        data: {
          fecha: new Date(),
          total: totalObligacionPed,
          saldo: totalObligacionPed - nuevoTotalPagado,
          estado: nuevoTotalPagado >= totalObligacionPed ? 'PAGADA' : (nuevoTotalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
        },
      })
    }

    await tx.historial.create({
      data: {
        entidad: 'Pedido',
        registroId: pedido.id,
        accion: 'ENTREGA_PARCIAL_CIERRE',
        datos: JSON.stringify({
          pedidoNumero: pedido.numero,
          entregadoAcumulado: totalEntregadoAcum,
          totalPedido,
          completo,
          cobradoMision: montoPagado,
          totalPagado: nuevoTotalPagado,
          usuario: userId || 'unknown',
        }),
        usuarioId: userId,
      },
    })

    pedidosActualizados.push({ id: pedido.id, estado: completo ? 'ENTREGADO' : 'PENDIENTE' })

    // Comisión / totalVentas: solo el valor entregado EN ESTE cierre.
    return (
      toNumber(pedido.precioPacaAgua) * (entProd.cPacaAguaEnt || 0) +
      toNumber(pedido.precioPacaHielo) * (entProd.cPacaHieloEnt || 0) +
      toNumber(pedido.precioBotellonFab) * (entProd.cBotellonFabEnt || 0) +
      toNumber(pedido.precioBotellonDom) * (entProd.cBotellonDomEnt || 0) +
      toNumber(pedido.precioBolsaAgua) * (entProd.cBolsaAguaEnt || 0) +
      toNumber(pedido.precioBolsaHielo) * (entProd.cBolsaHieloEnt || 0)
    )
  }

  /**
   * Maneja caso NO_ENTREGADO: reasigna a nuevo embarque o desasigna.
   * @returns 0 (no genera venta)
   */
  private async procesarNoEntregado(
    client: TxOrPrisma,
    pedido: PedidoRawInput,
    cuadre: CerrarEmbarqueInput['pedidos'][number],
    pedidosActualizados: Array<{ id: string; estado: string }>,
  ): Promise<number> {
    const tx = client as unknown as {
      pedido: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> }
      embarque: { findUnique: (args: { where: { id: string }; select?: Record<string, boolean> }) => Promise<{ id: string; estado: string; numero: number } | null> }
      pedidoItem: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> }
    }

    const updateData: Record<string, unknown> = {
      estadoEntrega: 'NO_ENTREGADO',
      estado: 'NO_ENTREGADO',
      embarqueId: null,
      cPacaAguaEnt: 0,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      cBolsaAguaEnt: 0,
      cBolsaHieloEnt: 0,
    }

    if (cuadre.nuevoEmbarqueId) {
      const nuevoEmbarque = await tx.embarque.findUnique({
        where: { id: cuadre.nuevoEmbarqueId },
        select: { id: true, estado: true, numero: true },
      })
      if (!nuevoEmbarque) {
        throw new Error(`EMBARQUE_DESTINO_NOT_FOUND: Embarque destino ${cuadre.nuevoEmbarqueId} no existe`)
      }
      if (nuevoEmbarque.estado !== EstadoEmbarque.ABIERTO && nuevoEmbarque.estado !== EstadoEmbarque.EN_RUTA) {
        throw new Error(`EMBARQUE_DESTINO_NO_DISPONIBLE: Embarque destino #${nuevoEmbarque.numero} esta ${nuevoEmbarque.estado}`)
      }
      updateData.estadoEntrega = 'EN_RUTA'
      updateData.estado = 'EN_RUTA'
      updateData.embarqueId = cuadre.nuevoEmbarqueId
    }

    await tx.pedido.update({ where: { id: pedido.id }, data: updateData })

    for (const item of pedido.items) {
      await tx.pedidoItem.updateMany({
        where: { pedidoId: pedido.id, producto: item.producto },
        data: { cantEntrega: 0 },
      })
    }

    pedidosActualizados.push({ id: pedido.id, estado: updateData.estadoEntrega as string })
    return 0
  }

  private async updatePedidoItems(
    client: TxOrPrisma,
    pedidoId: string,
    entProd: ProductosEntregados,
    precios: PreciosPedido,
  ): Promise<void> {
    const tx = client as unknown as {
      pedidoItem: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> }
    }

    const precioKeyMap: Record<string, keyof PreciosPedido> = {
      PACA_AGUA: 'pacaAgua',
      PACA_HIELO: 'pacaHielo',
      BOTELLON_FAB: 'botellonFab',
      BOTELLON_DOM: 'botellonDom',
      BOLSA_AGUA: 'bolsaAgua',
      BOLSA_HIELO: 'bolsaHielo',
    }

    const itemUpdates = [
      { producto: 'PACA_AGUA', cantidad: entProd.cPacaAguaEnt },
      { producto: 'PACA_HIELO', cantidad: entProd.cPacaHieloEnt },
      { producto: 'BOTELLON_FAB', cantidad: entProd.cBotellonFabEnt },
      { producto: 'BOTELLON_DOM', cantidad: entProd.cBotellonDomEnt },
      { producto: 'BOLSA_AGUA', cantidad: entProd.cBolsaAguaEnt },
      { producto: 'BOLSA_HIELO', cantidad: entProd.cBolsaHieloEnt },
    ]

    for (const itemUpd of itemUpdates) {
      await tx.pedidoItem.updateMany({
        where: { pedidoId, producto: itemUpd.producto },
        data: {
          cantEntrega: itemUpd.cantidad,
          precio: precios[precioKeyMap[itemUpd.producto]] || 0,
        },
      })
    }
  }

  private async logPrecioCierre(
    client: TxOrPrisma,
    pedido: PedidoRawInput,
    totalReal: number,
    userId: string | undefined,
  ): Promise<void> {
    const tx = client as unknown as {
      historial: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
    }

    const totalOriginal = toNumber(pedido.total)
    const deltaTotal = totalReal - totalOriginal
    if (Math.abs(deltaTotal) > 0.01) {
      await tx.historial.create({
        data: {
          entidad: 'Pedido',
          registroId: pedido.id,
          accion: 'PRECIO_CIERRE',
          datos: JSON.stringify({
            pedidoNumero: pedido.numero,
            precioOriginal: totalOriginal,
            precioCierre: totalReal,
            delta: deltaTotal,
            deltaPct: totalOriginal > 0 ? ((deltaTotal / totalOriginal) * 100).toFixed(1) : '0',
            usuario: userId || 'unknown',
          }),
          usuarioId: userId,
        },
      })
    }
  }

  // PR-1: `crearPedidoHijo` (copia productiva del cierre) se elimina — la rama
  // PARCIAL ya no materializa el faltante como un pedido nuevo. La versión
  // canónica sigue disponible en el agregado de dominio
  // (`Pedido.crearPedidoHijo()`) para el inventario/migración legacy (ADR PR-1 §8).
}
