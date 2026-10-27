import { Prisma } from '@prisma/client'

/**
 * Reglas del verificador de integridad (plan de integridad v1.2 §5.A).
 *
 * Cada regla es UNA consulta `SELECT` que devuelve una fila por hallazgo con
 * la forma `{ ref, numero, detalle }`:
 *   - `ref`: id interno de la entidad afectada (pedido, pago, abono, día…).
 *   - `numero`: número visible del pedido cuando aplica; si no, `null`.
 *   - `detalle`: evidencia (valores comparados) como objeto JSON.
 *
 * Las consultas se ejecutan dentro de una transacción READ ONLY
 * (`verificar.ts`); ninguna regla escribe ni corrige.
 */

export type Severidad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'INFO'

export interface ParametrosVerificacion {
  /** V7: primer `ReceivableEntry` en producción (26-ago-2026 16:21 UTC). */
  corteReceivable: Date
  /** V9: días que un pago digital puede seguir REPORTADO antes de alertar. */
  diasReportado: number
}

export const PARAMETROS_POR_DEFECTO: ParametrosVerificacion = {
  corteReceivable: new Date('2026-08-26T16:21:00Z'),
  diasReportado: 3,
}

export interface Regla {
  id: string
  titulo: string
  severidad: Severidad
  consulta: (p: ParametrosVerificacion) => Prisma.Sql
}

const ACTIVO = Prisma.sql`p.estado NOT IN ('ANULADO', 'CANCELADO')`

/**
 * Abonos por pedido, excluyendo el `Abono` espejo que `pagar-fiado` crea junto
 * con su `Pago` (vínculo explícito #513; nunca coincidencia temporal). Un
 * abono suelto de `/api/abonos` puede no traer `pedidoId`: se resuelve por la
 * factura.
 */
const ABONOS_SIN_ESPEJO = Prisma.sql`
  SELECT COALESCE(a."pedidoId", f."pedidoId") AS "pedidoId", SUM(a.monto) AS s
  FROM "Abono" a
  JOIN "Factura" f ON f.id = a."facturaId"
  WHERE a."origenCobro" = 'INDEPENDIENTE'
    OR (a."origenCobro" IS NULL AND a."pagoOrigenId" IS NULL AND (
      a."offlineId" IS NOT NULL OR EXISTS (
        SELECT 1 FROM "Historial" h WHERE h.entidad = 'Abono' AND h."registroId" = a.id AND h.accion = 'CREATE'
      )
    ))
  GROUP BY 1`

const ITEMS_FIRMA = (alias: string) => Prisma.sql`(
  SELECT string_agg(i.producto || ':' || i."cantPedido", ',' ORDER BY i.producto)
  FROM "PedidoItem" i WHERE i."pedidoId" = ${Prisma.raw(alias)}.id)`

const DIA_BOGOTA = (col: string) => Prisma.raw(`(${col} AT TIME ZONE 'America/Bogota')::date`)

export const REGLAS: readonly Regla[] = [
  {
    id: 'V1',
    titulo: 'totalPagado + saldo = total',
    severidad: 'CRITICA',
    consulta: () => Prisma.sql`
      SELECT p.id AS ref, p.numero,
        json_build_object('total', p.total::float8, 'totalPagado', p."totalPagado"::float8, 'saldo', p.saldo::float8) AS detalle
      FROM "Pedido" p
      WHERE p."totalPagado" + p.saldo <> p.total
      ORDER BY p.numero`,
  },
  {
    id: 'V2',
    titulo: 'totalPagado = Σ Pago + Σ Abono (sin el Abono espejo de pagar-fiado)',
    severidad: 'ALTA',
    consulta: () => Prisma.sql`
      WITH pg AS (SELECT "pedidoId", SUM(monto) AS s FROM "Pago" GROUP BY 1),
           ab AS (${ABONOS_SIN_ESPEJO})
      SELECT p.id AS ref, p.numero,
        json_build_object(
          'clienteId', p."clienteId",
          'totalPagado', p."totalPagado"::float8,
          'pagos', COALESCE(pg.s, 0)::float8,
          'abonos', COALESCE(ab.s, 0)::float8,
          'diferencia', (p."totalPagado" - COALESCE(pg.s, 0) - COALESCE(ab.s, 0))::float8
        ) AS detalle
      FROM "Pedido" p
      LEFT JOIN pg ON pg."pedidoId" = p.id
      LEFT JOIN ab ON ab."pedidoId" = p.id
      WHERE ${ACTIVO}
        AND p."totalPagado" <> COALESCE(pg.s, 0) + COALESCE(ab.s, 0)
      ORDER BY p.numero`,
  },
  {
    id: 'V3',
    titulo: 'Una factura por pedido con el mismo saldo',
    severidad: 'CRITICA',
    consulta: () => Prisma.sql`
      SELECT p.id AS ref, p.numero,
        json_build_object('motivo', 'SIN_FACTURA') AS detalle
      FROM "Pedido" p
      WHERE NOT EXISTS (SELECT 1 FROM "Factura" f WHERE f."pedidoId" = p.id)
      UNION ALL
      SELECT p.id, p.numero,
        json_build_object('motivo', 'SALDO_DISTINTO', 'saldoPedido', p.saldo::float8, 'saldoFactura', f.saldo::float8)
      FROM "Pedido" p JOIN "Factura" f ON f."pedidoId" = p.id
      WHERE ${ACTIVO} AND f.saldo <> p.saldo
      ORDER BY numero`,
  },
  {
    id: 'V4',
    titulo: 'Venta a CONSUMIDOR_FINAL con saldo pendiente',
    severidad: 'CRITICA',
    consulta: () => Prisma.sql`
      SELECT p.id AS ref, p.numero,
        json_build_object('total', p.total::float8, 'saldo', p.saldo::float8) AS detalle
      FROM "Pedido" p
      WHERE p."clienteId" = 'CONSUMIDOR_FINAL' AND ${ACTIVO} AND p.saldo > 0
      ORDER BY p.numero`,
  },
  {
    id: 'V5',
    titulo: 'Entregado con cantidad entregada distinta de la pedida y sin ajuste',
    severidad: 'ALTA',
    consulta: () => Prisma.sql`
      SELECT p.id AS ref, p.numero,
        json_build_object('producto', i.producto, 'cantPedido', i."cantPedido", 'cantEntrega', i."cantEntrega") AS detalle
      FROM "Pedido" p JOIN "PedidoItem" i ON i."pedidoId" = p.id
      WHERE p."estadoEntrega" = 'ENTREGADO'
        AND i."cantEntrega" <> i."cantPedido"
        AND NOT EXISTS (
          SELECT 1 FROM "PedidoCantidadAjuste" a WHERE a."pedidoId" = p.id AND a.producto = i.producto
        )
      ORDER BY p.numero, i.producto`,
  },
  {
    id: 'V6',
    titulo: 'Anulado o cancelado con pagos y sin nota crédito ni reversión',
    severidad: 'ALTA',
    consulta: () => Prisma.sql`
      SELECT p.id AS ref, p.numero,
        json_build_object('estado', p.estado, 'pagos', (SELECT SUM(g.monto) FROM "Pago" g WHERE g."pedidoId" = p.id)::float8) AS detalle
      FROM "Pedido" p
      WHERE p.estado IN ('ANULADO', 'CANCELADO')
        AND EXISTS (SELECT 1 FROM "Pago" g WHERE g."pedidoId" = p.id)
        AND NOT EXISTS (SELECT 1 FROM "NotaCredito" n WHERE n."pedidoId" = p.id)
        AND NOT EXISTS (SELECT 1 FROM "ReceivableEntry" e WHERE e."pedidoId" = p.id AND e.tipo = 'REVERSION')
      ORDER BY p.numero`,
  },
  {
    id: 'V7',
    titulo: 'Pago o abono posterior al corte sin ReceivableEntry',
    severidad: 'ALTA',
    consulta: ({ corteReceivable }) => Prisma.sql`
      SELECT g.id AS ref, p.numero,
        json_build_object('tipo', 'PAGO', 'monto', g.monto::float8, 'createdAt', g."createdAt") AS detalle
      FROM "Pago" g JOIN "Pedido" p ON p.id = g."pedidoId"
      WHERE g."createdAt" >= ${corteReceivable}
        AND NOT EXISTS (
          SELECT 1 FROM "ReceivableEntry" e WHERE e."pedidoId" = g."pedidoId" AND e.tipo IN ('PAGO', 'ABONO')
        )
      UNION ALL
      SELECT a.id, p.numero,
        json_build_object('tipo', 'ABONO', 'monto', a.monto::float8, 'createdAt', a."createdAt")
      FROM "Abono" a
      JOIN "Factura" f ON f.id = a."facturaId"
      JOIN "Pedido" p ON p.id = COALESCE(a."pedidoId", f."pedidoId")
      WHERE a."createdAt" >= ${corteReceivable}
        AND NOT EXISTS (
          SELECT 1 FROM "ReceivableEntry" e
          WHERE (e."pedidoId" = p.id OR e."facturaId" = f.id) AND e.tipo IN ('PAGO', 'ABONO')
        )
      ORDER BY numero`,
  },
  {
    id: 'V8',
    titulo: 'Número de pedido repetido',
    severidad: 'ALTA',
    // Las colisiones anteriores a #401 quedaron marcadas con
    // numeroColisionHistorica (migración 20261023) y no se reportan.
    consulta: () => Prisma.sql`
      SELECT MIN(p.id) AS ref, p.numero,
        json_build_object('ids', json_agg(p.id ORDER BY p."createdAt"), 'origenes', json_agg(p.origen ORDER BY p."createdAt")) AS detalle
      FROM "Pedido" p
      WHERE NOT p."numeroColisionHistorica"
      GROUP BY p.numero HAVING COUNT(*) > 1
      ORDER BY p.numero`,
  },
  {
    id: 'V9',
    titulo: 'Pago digital REPORTADO sin confirmar',
    severidad: 'MEDIA',
    consulta: ({ diasReportado }) => Prisma.sql`
      SELECT g.id AS ref, p.numero,
        json_build_object('metodo', g.metodo, 'monto', g.monto::float8, 'createdAt', g."createdAt") AS detalle
      FROM "Pago" g JOIN "Pedido" p ON p.id = g."pedidoId"
      WHERE g.confirmacion = 'REPORTADO' AND g.metodo <> 'EFECTIVO'
        AND g."createdAt" < now() - make_interval(days => ${diasReportado}::int)
      ORDER BY g."createdAt"`,
  },
  {
    id: 'V10',
    titulo: 'Saldo a favor de CONSUMIDOR_FINAL',
    severidad: 'CRITICA',
    consulta: () => Prisma.sql`
      SELECT c.id AS ref, NULL::int AS numero,
        json_build_object('saldoFavor', c."saldoFavor"::float8) AS detalle
      FROM "Cliente" c
      WHERE c.id = 'CONSUMIDOR_FINAL' AND c."saldoFavor" > 0`,
  },
  {
    id: 'V11',
    titulo: 'Posible duplicado: mismo cliente, items y total en menos de 60 s',
    severidad: 'MEDIA',
    consulta: () => Prisma.sql`
      SELECT b.id AS ref, b.numero,
        json_build_object('anterior', a.numero, 'anteriorId', a.id, 'segundos', EXTRACT(EPOCH FROM b."createdAt" - a."createdAt")::float8, 'total', b.total::float8) AS detalle
      FROM "Pedido" a
      JOIN "Pedido" b ON b."clienteId" = a."clienteId" AND b.id <> a.id AND b.total = a.total
        AND b."createdAt" > a."createdAt" AND b."createdAt" - a."createdAt" <= interval '60 seconds'
      WHERE a.estado NOT IN ('ANULADO', 'CANCELADO') AND b.estado NOT IN ('ANULADO', 'CANCELADO')
        AND ${ITEMS_FIRMA('a')} IS NOT DISTINCT FROM ${ITEMS_FIRMA('b')}
      ORDER BY b.numero`,
  },
  {
    id: 'V12',
    titulo: 'Día con ventas y sin cierre',
    severidad: 'INFO',
    consulta: () => Prisma.sql`
      SELECT d.dia::text AS ref, NULL::int AS numero,
        json_build_object('pedidos', d.n) AS detalle
      FROM (
        SELECT ${DIA_BOGOTA('p.fecha')} AS dia, COUNT(*)::int AS n
        FROM "Pedido" p WHERE ${ACTIVO}
        GROUP BY 1
      ) d
      WHERE d.dia < ${DIA_BOGOTA('now()')}
        AND NOT EXISTS (SELECT 1 FROM "CierreDia" c WHERE ${DIA_BOGOTA('c.fecha')} = d.dia)
      ORDER BY d.dia`,
  },
  {
    id: 'V13',
    titulo: 'Pedido de punto pendiente de entrega por más de 24 h',
    severidad: 'MEDIA',
    consulta: () => Prisma.sql`
      SELECT p.id AS ref, p.numero,
        json_build_object('createdAt', p."createdAt", 'total', p.total::float8) AS detalle
      FROM "Pedido" p
      WHERE p.canal = 'PUNTO' AND p."estadoEntrega" = 'PENDIENTE' AND ${ACTIVO}
        AND p."createdAt" < now() - interval '24 hours'
      ORDER BY p.numero`,
  },
  {
    // #402: un pago de regularización (`Pago.regularizacionId`) describe un
    // cobro de otro día y no debe entrar en la caja del día en que se registró.
    // El cierre guarda el total por método de los pagos capturados ese día
    // (cierre/route.ts); si coincide con el total INCLUYENDO los de
    // regularización (y no sin ellos), el cierre los contó.
    id: 'V14',
    titulo: 'Pago de regularización contado en la caja de su fecha de registro',
    severidad: 'CRITICA',
    consulta: () => Prisma.sql`
      WITH capturados AS (
        SELECT c.id AS cierre, g.metodo,
          COALESCE(SUM(g.monto) FILTER (WHERE g."regularizacionId" IS NULL), 0) AS normales,
          COALESCE(SUM(g.monto) FILTER (WHERE g."regularizacionId" IS NOT NULL), 0) AS regularizados
        FROM "CierreDia" c
        JOIN "Pago" g ON g."createdAt" >= c.fecha AND g."createdAt" < c.fecha + interval '1 day'
        JOIN "Pedido" p ON p.id = g."pedidoId" AND p."estadoEntrega" NOT IN ('ANULADO', 'CANCELADO')
        GROUP BY c.id, g.metodo
      )
      SELECT c.id AS ref, NULL::int AS numero,
        json_build_object('fecha', c.fecha, 'metodo', k.metodo, 'enCierre', t.en_cierre::float8,
          'pagosNormales', k.normales::float8, 'pagosRegularizacion', k.regularizados::float8) AS detalle
      FROM capturados k
      JOIN "CierreDia" c ON c.id = k.cierre
      CROSS JOIN LATERAL (SELECT CASE k.metodo
        WHEN 'EFECTIVO' THEN c.efectivo WHEN 'NEQUI' THEN c.nequi WHEN 'DAVIPLATA' THEN c.daviplata
        WHEN 'TRANSFERENCIA' THEN c.transferencia WHEN 'BONO' THEN c.bono END AS en_cierre) t
      WHERE k.regularizados > 0 AND t.en_cierre = k.normales + k.regularizados
      ORDER BY c.fecha, k.metodo`,
  },
  {
    id: 'V15',
    titulo: 'Secuencia de numeración de pedidos por debajo del máximo histórico',
    severidad: 'ALTA',
    consulta: () => Prisma.sql`
      SELECT s.sequencename AS ref, NULL::int AS numero,
        json_build_object('ultimoValor', s.last_value, 'maximoPedido', m.max) AS detalle
      FROM pg_sequences s
      CROSS JOIN (SELECT MAX(numero) AS max FROM "Pedido") m
      WHERE s.schemaname = current_schema()
        AND s.sequencename IN ('pedido_numero_seq', 'Pedido_numero_seq')
        AND COALESCE(s.last_value, 0) < COALESCE(m.max, 0)
      ORDER BY s.sequencename`,
  },
  {
    // #499: la comisión del repartidor pagada de la caja (`PagoComisionRepartidor`) debe
    // cuadrar en dos lugares. (1) El cierre de un día guarda cuánto salió de la caja por
    // comisión de repartidores; si los pagos de ese día (por `createdAt`) suman otra cosa,
    // hubo un pago posterior al cierre o un cierre editado. (2) Una nómina descuenta lo que
    // se pagó de la caja en su período; si descuenta otra cifra, la comisión se pagaría dos
    // veces o se dejaría de pagar.
    id: 'V16',
    titulo: 'Comisión del repartidor pagada de la caja no cuadra con el cierre o con la nómina',
    severidad: 'ALTA',
    consulta: () => Prisma.sql`
      SELECT c.id AS ref, NULL::int AS numero,
        json_build_object('caso', 'cierre', 'fecha', c.fecha,
          'enCierre', (c.reporte->'comisionesAuto'->>'pagadoRepartidores')::float8,
          'pagosDelDia', COALESCE(p.s, 0)::float8) AS detalle
      FROM "CierreDia" c
      LEFT JOIN LATERAL (
        SELECT SUM(g.monto) AS s FROM "PagoComisionRepartidor" g
        WHERE g."createdAt" >= c.fecha AND g."createdAt" < c.fecha + interval '1 day'
      ) p ON true
      WHERE c.reporte->'comisionesAuto'->>'pagadoRepartidores' IS NOT NULL
        AND ABS((c.reporte->'comisionesAuto'->>'pagadoRepartidores')::numeric - COALESCE(p.s, 0)) > 0.005
      UNION ALL
      SELECT n.id AS ref, NULL::int AS numero,
        json_build_object('caso', 'nomina', 'trabajadorId', n."trabajadorId",
          'descuentaNomina', n."comisionPagadaCaja"::float8, 'pagadoEnPeriodo', COALESCE(p.s, 0)::float8) AS detalle
      FROM "Nomina" n
      LEFT JOIN LATERAL (
        SELECT SUM(g.monto) AS s FROM "PagoComisionRepartidor" g
        WHERE g."trabajadorId" = n."trabajadorId" AND g.fecha >= n."fechaInicio" AND g.fecha <= n."fechaFin"
      ) p ON true
      WHERE n.estado <> 'ANULADA'
        AND ABS(n."comisionPagadaCaja" - COALESCE(p.s, 0)) > 0.005
      ORDER BY 1`,
  },
  {
    id: 'V17',
    titulo: 'Abono sin procedencia verificada o con vínculo de pago inconsistente',
    severidad: 'ALTA',
    consulta: () => Prisma.sql`
      SELECT a.id AS ref, p.numero,
        json_build_object('origenCobro', a."origenCobro", 'pagoOrigenId', a."pagoOrigenId") AS detalle
      FROM "Abono" a JOIN "Factura" f ON f.id = a."facturaId"
      JOIN "Pedido" p ON p.id = COALESCE(a."pedidoId", f."pedidoId")
      LEFT JOIN "Pago" g ON g.id = a."pagoOrigenId"
      WHERE p."estadoEntrega" NOT IN ('ANULADO', 'CANCELADO') AND (
        (a."pagoOrigenId" IS NULL AND (a."origenCobro" = 'INDEPENDIENTE'
          OR (a."origenCobro" IS NULL AND (a."offlineId" IS NOT NULL OR EXISTS (
            SELECT 1 FROM "Historial" h WHERE h.entidad = 'Abono' AND h."registroId" = a.id AND h.accion = 'CREATE'
          )))))
        OR (a."origenCobro" = 'ESPEJO_PAGO' AND g.id IS NOT NULL
          AND g."pedidoId" = p.id AND g.monto = a.monto AND g.metodo::text = a."metodoPago")
      ) IS NOT TRUE
      ORDER BY a.id`,
  },
  {
    id: 'V18',
    titulo: 'Snapshot de cierre 2.1 distinto de sus columnas financieras canónicas',
    severidad: 'CRITICA',
    consulta: () => Prisma.sql`
      SELECT c.id AS ref, NULL::int AS numero,
        json_build_object('campo', v.campo, 'canonico', v.canonico, 'reporte', c.reporte->v.campo) AS detalle
      FROM "CierreDia" c
      CROSS JOIN LATERAL (VALUES
        ('totalVentas', c."totalVentas"), ('cobrado', c.cobrado), ('fiado', c.fiado),
        ('efectivo', c.efectivo), ('transferencia', c.transferencia), ('nequi', c.nequi),
        ('daviplata', c.daviplata), ('bono', c.bono), ('totalGastos', c.gastos), ('netoCaja', c."netoCaja")
      ) v(campo, canonico)
      WHERE c.reporte->>'_version' = '2.1'
        AND (CASE WHEN jsonb_typeof(c.reporte->v.campo) = 'number'
          THEN (c.reporte->>v.campo)::numeric END) IS DISTINCT FROM v.canonico
      ORDER BY c.id, v.campo`,
  },

]
