import { z } from 'zod'

const importe = z.string().regex(/^\d+\.\d{2}$/)
const manifiestoSchema = z.object({
  fuente: z.string().url(),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  pedidos: z.array(z.object({
    id: z.string().min(1),
    numero: z.number().int().positive(),
    total: importe,
    saldo: importe,
    totalPagado: z.literal('0.00'),
  }).strict()).min(1),
}).strict()

/** #512: genera una reparación acotada; nunca descubre ni modifica más filas. */
export function sqlNormalizarAnulados512(input: unknown): string {
  const manifiesto = manifiestoSchema.parse(input)
  if (new Set(manifiesto.pedidos.map(p => p.id)).size !== manifiesto.pedidos.length
    || new Set(manifiesto.pedidos.map(p => p.numero)).size !== manifiesto.pedidos.length
    || manifiesto.pedidos.some(p => p.total !== p.saldo)) {
    throw new Error('Manifiesto inconsistente: identidades únicas y total igual a saldo requerido')
  }
  const json = JSON.stringify(manifiesto).replaceAll("'", "''")
  let etiqueta = 'bambu512'
  while (json.includes(`$${etiqueta}$`)) etiqueta += '_'
  // Un único DO es atómico: no depende de que el conector conserve una sesión
  // entre BEGIN y COMMIT ni necesita una función persistente en la base.
  return `DO $${etiqueta}$
DECLARE
  manifiesto jsonb := '${json}'::jsonb;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM p.id FROM "Pedido" p
  JOIN jsonb_to_recordset(manifiesto->'pedidos') AS e(id text, numero int) ON p.id=e.id
  ORDER BY p.id FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(manifiesto->'pedidos')
      AS e(id text, numero int, total numeric, saldo numeric, "totalPagado" numeric)
    LEFT JOIN "Pedido" p ON p.id=e.id
    WHERE p.id IS NULL OR p.numero<>e.numero
      OR p."estadoEntrega"<>'ANULADO' OR p."estadoPago"<>'ANULADO'
      OR NOT (
        (p.total=e.total AND p.saldo=e.saldo AND p."totalPagado"=e."totalPagado")
        OR (p.total=0 AND p.saldo=0 AND p."totalPagado"=0)
      )
  ) THEN
    RAISE EXCEPTION 'FIX512_MANIFIESTO_NO_COINCIDE: no se modifica ningún pedido';
  END IF;

  WITH respaldo AS (
    INSERT INTO "Historial" (id, entidad, "registroId", accion, datos, "usuarioId", fecha)
    SELECT gen_random_uuid()::text, 'Pedido', p.id, 'UPDATE',
      jsonb_build_object(
        'operacion', 'NORMALIZAR_ANULADOS_512', 'issue', 512,
        'actor', 'mantenimiento-autorizado', 'fuente', manifiesto->>'fuente',
        'commit', manifiesto->>'commit',
        'antes', jsonb_build_object('numero',p.numero,'total',p.total::text,'saldo',p.saldo::text,'totalPagado',p."totalPagado"::text),
        'despues', jsonb_build_object('total','0.00','saldo','0.00','totalPagado','0.00')
      )::text, NULL, now()
    FROM "Pedido" p JOIN jsonb_to_recordset(manifiesto->'pedidos') AS e(id text) ON p.id=e.id
    WHERE p.total<>0 OR p.saldo<>0 OR p."totalPagado"<>0
    RETURNING "registroId"
  )
  UPDATE "Pedido" p SET total=0, saldo=0, "totalPagado"=0
  FROM respaldo r WHERE p.id=r."registroId";

  IF EXISTS (
    SELECT 1 FROM "Pedido" p JOIN jsonb_to_recordset(manifiesto->'pedidos') AS e(id text) ON p.id=e.id
    WHERE p.total<>0 OR p.saldo<>0 OR p."totalPagado"<>0
  ) THEN
    RAISE EXCEPTION 'FIX512_VERIFICACION_FALLIDA';
  END IF;
END $${etiqueta}$;`
}
