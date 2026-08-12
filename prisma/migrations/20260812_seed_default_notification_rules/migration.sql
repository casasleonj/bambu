-- Data migration: siembra las reglas de notificación por defecto para
-- los 3 eventos que YA mandaban push antes de este sistema
-- (broadcastPush a ADMIN/ASISTENTE/CONTADOR, los únicos roles a los
-- que se les ofrece el opt-in). Preserva el alcance efectivo previo —
-- sin esto, el día del deploy nadie recibiría estos 3 avisos hasta
-- que un ADMIN entrara a configurarlos a mano.
--
-- Los 8 tipos de evento nuevos (PEDIDO_ENTREGADO, PEDIDO_CULMINADO,
-- FIADO_GENERADO, ABONO_APLICADO, CIERRE_DIA_COMPLETADO, GASTO_CREADO,
-- COMPRA_CREADA, CASO_ALTA) arrancan deliberadamente SIN regla — nadie
-- recibe nada hasta que un ADMIN los configure explícitamente.
--
-- Idempotente vía ON CONFLICT en la unique constraint de eventType.

INSERT INTO "NotificationRule" (id, "eventType", enabled, roles, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CLIENTE_CREADO', true, ARRAY['ADMIN','ASISTENTE','CONTADOR']::"RolUsuario"[], now(), now()),
  (gen_random_uuid()::text, 'PEDIDO_CREADO', true, ARRAY['ADMIN','ASISTENTE','CONTADOR']::"RolUsuario"[], now(), now()),
  (gen_random_uuid()::text, 'EMBARQUE_CERRADO', true, ARRAY['ADMIN','ASISTENTE','CONTADOR']::"RolUsuario"[], now(), now())
ON CONFLICT ("eventType") DO NOTHING;
