-- Migración: consolidar duplicados de "Consumidor Final" en un cliente canónico.
--
-- Problema: la app usa la string literal 'CONSUMIDOR_FINAL' como id mágico para
-- ventas anónimas (VENTA_RAPIDA / VENTA_LIBRE). Un refactor DDD perdió el id
-- explícito, así que cada venta anónima creaba un nuevo cliente con CUID y
-- nombre='Consumidor Final'.
--
-- Esta migración es idempotente y atómica (envuelta en BEGIN/COMMIT). Puede
-- correrse múltiples veces sin daño.
--
-- IMPORTANTE: aplicar con psql o prisma db execute, NO con prisma migrate deploy
-- (issue conocido #12 del AGENTS.md: la tabla _prisma_migrations no está sincronizada).

BEGIN;

-- ============================================================================
-- 1. Crear/asegurar el cliente canónico
-- ============================================================================
INSERT INTO "Cliente" (
  id,
  nombre,
  apellido,
  telefono,
  direccion,
  barrio,
  referencia,
  "linkUbicacion",
  lat,
  lng,
  "geocodeOrigen",
  "geocodeAt",
  "intervaloMediano",
  "proxEsperada",
  "diasAtraso",
  "scoreLlamada",
  "valorTipico",
  "scoreRecalculadoEn",
  "ultimaLlamada",
  "nombreNegocio",
  "tipoNegocio",
  fuente,
  "horaApertura",
  "preciosEspeciales",
  "rutaId",
  frecuencia,
  "cadaNDias",
  "ultEntrega",
  "proxEntrega",
  "habAgua",
  "habHielo",
  "habBotellon",
  "habBolsaAgua",
  "habBolsaHielo",
  verificado,
  "verificadoEn",
  "creadoPorRol",
  bloqueado,
  reclamaciones,
  "limitePedidosFiados",
  "negocioDefaultId",
  notas,
  activo,
  "saldoFavor",
  "offlineId",
  "createdById",
  "createdAt",
  "updatedAt"
)
VALUES (
  'CONSUMIDOR_FINAL',
  'Consumidor Final',
  NULL,
  '',
  '',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'NINGUNA',
  NULL,
  NULL,
  NULL,
  true,
  true,
  true,
  true,
  true,
  false,
  NULL,
  'ASISTENTE',
  false,
  0,
  NULL,
  NULL,
  NULL,
  false,        -- activo=false: oculto en la lista de clientes
  0,
  NULL,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  telefono = EXCLUDED.telefono,
  direccion = EXCLUDED.direccion,
  activo = EXCLUDED.activo,
  "creadoPorRol" = EXCLUDED."creadoPorRol",
  verificado = EXCLUDED.verificado,
  bloqueado = EXCLUDED.bloqueado,
  reclamaciones = EXCLUDED.reclamaciones,
  frecuencia = EXCLUDED.frecuencia,
  "habAgua" = EXCLUDED."habAgua",
  "habHielo" = EXCLUDED."habHielo",
  "habBotellon" = EXCLUDED."habBotellon",
  "habBolsaAgua" = EXCLUDED."habBolsaAgua",
  "habBolsaHielo" = EXCLUDED."habBolsaHielo",
  "saldoFavor" = EXCLUDED."saldoFavor";

-- ============================================================================
-- 2. Consolidar duplicados en el canónico
-- ============================================================================
DO $$
DECLARE
  dup_record RECORD;
  reasignados_pedido int := 0;
  reasignados_factura int := 0;
  reasignados_abono int := 0;
  reasignados_negocio int := 0;
  reasignados_plantilla int := 0;
  reasignados_caso int := 0;
  contactos_borrados int := 0;
  clientes_borrados int := 0;
BEGIN
  FOR dup_record IN (
    SELECT id, nombre, telefono
    FROM "Cliente"
    WHERE id != 'CONSUMIDOR_FINAL'
      AND nombre = 'Consumidor Final'
      AND telefono = ''
    ORDER BY "createdAt" ASC
  ) LOOP
    -- Reasignar todas las FK conocidas que apuntan a Cliente.id.
    -- Las FKs son ON DELETE RESTRICT; por eso actualizamos ANTES de borrar.
    UPDATE "Pedido" SET "clienteId" = 'CONSUMIDOR_FINAL' WHERE "clienteId" = dup_record.id;
    GET DIAGNOSTICS reasignados_pedido = ROW_COUNT;

    UPDATE "Factura" SET "clienteId" = 'CONSUMIDOR_FINAL' WHERE "clienteId" = dup_record.id;
    GET DIAGNOSTICS reasignados_factura = ROW_COUNT;

    UPDATE "Abono" SET "clienteId" = 'CONSUMIDOR_FINAL' WHERE "clienteId" = dup_record.id;
    GET DIAGNOSTICS reasignados_abono = ROW_COUNT;

    UPDATE "Negocio" SET "clienteId" = 'CONSUMIDOR_FINAL' WHERE "clienteId" = dup_record.id;
    GET DIAGNOSTICS reasignados_negocio = ROW_COUNT;

    UPDATE "PlantillaRecurrente" SET "clienteId" = 'CONSUMIDOR_FINAL' WHERE "clienteId" = dup_record.id;
    GET DIAGNOSTICS reasignados_plantilla = ROW_COUNT;

    UPDATE "Caso" SET "clienteId" = 'CONSUMIDOR_FINAL' WHERE "clienteId" = dup_record.id;
    GET DIAGNOSTICS reasignados_caso = ROW_COUNT;

    DELETE FROM "ContactoCliente" WHERE "clienteId" = dup_record.id;
    GET DIAGNOSTICS contactos_borrados = ROW_COUNT;

    -- Auditoría del borrado destructivo (id generado por PostgreSQL nativo)
    INSERT INTO "Historial" (id, entidad, "registroId", accion, datos, fecha)
    VALUES (
      gen_random_uuid()::text,
      'Cliente',
      dup_record.id,
      'DELETE',
      jsonb_build_object(
        'razon', 'consolidacion_consumidor_final',
        'reasignadoA', 'CONSUMIDOR_FINAL',
        'pedidosReasignados', reasignados_pedido,
        'facturasReasignadas', reasignados_factura,
        'abonosReasignados', reasignados_abono,
        'negociosReasignados', reasignados_negocio,
        'plantillasReasignadas', reasignados_plantilla,
        'casosReasignados', reasignados_caso,
        'contactosBorrados', contactos_borrados,
        'ejecutadoPor', 'migracion_20260630_consolidate_consumidor_final'
      )::text,
      NOW()
    );

    DELETE FROM "Cliente" WHERE id = dup_record.id;
    clientes_borrados := clientes_borrados + 1;

    RAISE NOTICE 'Consolidado dup % (P:% F:% A:% N:% Pl:% C:% Ct:%)',
      dup_record.id, reasignados_pedido, reasignados_factura, reasignados_abono,
      reasignados_negocio, reasignados_plantilla, reasignados_caso, contactos_borrados;
  END LOOP;

  RAISE NOTICE 'Consolidación completa: % cliente(s) duplicado(s) eliminado(s).', clientes_borrados;
END $$;

COMMIT;
