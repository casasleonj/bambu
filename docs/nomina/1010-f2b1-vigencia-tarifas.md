# #1010 F2B.1 — diario prospectivo de tarifas

**DECISIÓN PO:** cambio normal desde el día calendario siguiente en Bogotá; el trabajo previo conserva su tarifa. Corrección retroactiva explícita y auditada, sin sobrescribir cierres, nóminas o pagos. Ver comentario 7162861077. #630 exige preservar fuentes de producción y #770 distingue día trabajado, desembolso y captura.

**Alcance de este PR:** almacenamiento prospectivo y resolución pura de la versión. No cambia el resultado de ningún cálculo monetario. No habilita todavía la política en el motor. No hay cambios de UI.

## Contrato y decisiones técnicas

- Diario append-only en PostgreSQL; una versión de la configuración de comisión por trabajador y una secuencia independiente de versiones de COM_REPARTIDOR. Se conservan valores decimales originales como texto y configuración general cruda (incluido null cuando no existe). El fallback efectivo será resuelto con la regla canónica de reparto en F2B.2; no se confunde cero configurado con cero efectivo.
- Captura mediante triggers invoker en la misma transacción que INSERT/UPDATE del trabajador y los cambios de la clave general. Cubre las dos rutas de Config, alias, y escrituras SQL ordinarias; evita perder datos por fire-and-forget. No se registra cada edición de nombre, contacto o sueldo fijo. Rol, modalidad y moto quedan como contexto de la configuración, no como nueva decisión sobre baja/eligibilidad operativa.
- Base inicial: valores observados al instalar, vigencia candidata desde el día siguiente. No reconstruye ni certifica ninguna jornada anterior. Alta nueva: configuración inicial desde el día de creación; cambio ordinario desde mañana. Se usa el reloj de la BD después de la escritura de fila, fecha civil Bogotá, no helper que omite domingos. El momento observado de registro no equivale a hora de commit ni a hora del trabajo.
- Varias ediciones el mismo día: todas quedan registradas; última secuencia para la misma fecha efectiva. Rollback no deja versión; huecos de secuencia permitidos. No se usa updatedAt para inventar vigencia. RolDb identifica identidad de conexión, no al administrador humano: auditorías existentes siguen siendo necesarias para rastrear actor; no se atribuye autor humano por proximidad de hora. En F2B.2 deberá resolverse trazabilidad de autor de cambios de configuración general y probar cortes de medianoche/commit.
- Datos anteriores al primer registro y versiones desconocidas: SIN_EVIDENCIA/NO_INTERPRETABLE. No seleccionar silenciosamente una versión anterior si la más reciente no es interpretable. No se puede declarar tarifa histórica verdadera de una jornada mientras la app sigue usando el motor anterior.
- Separación explícita: la fecha candidata del diario durante el período de observación NO demuestra la tarifa realmente liquidada. El corte de activación de los consumidores, compatibilidad con registros F2A y conciliación de jornadas previas deben definirse antes de habilitar los cálculos. No backfill de importes ni retroactividad automática.

## Seguridad y despliegue

Tabla aditiva, FK RESTRICT, protección UPDATE/DELETE, RLS y revocación explícita a roles Data API; backend app_write puede leer y solo insertar desde trigger, sin mutar o truncar. El dueño postgres sigue siendo privilegiado; no se promete inmutabilidad frente a un administrador DDL. La secuencia se mantiene interna. Requiere probar permisos reales y lock_timeout previo a cualquier DDL en producción. Bloqueo breve de Trabajador y Config durante baseline y alta de triggers para no perder ediciones. El reset de fixtures elimina también las versiones globales; TRUNCATE de mantenimiento privilegiado no es una operación de negocio.

No ejecutar en producción sin CI, QA específico del flujo editar trabajador/configuración y autorización explícita. La migración debe probarse en DB desechable mediante db push+SQL y mediante migrate deploy desde esquema anterior; comprobar que se puede reaplicar sin duplicar baseline. Proteger exposición de datos; no capturar datos de clientes. El rollback de aplicación no borra versiones observadas.

## Casos adversariales y límites

Pruebas propuestas: orden de edición, dos campos concurrentes, no-op, fecha Bogotá domingo/fin de año, configuración general creada/eliminada, rollback, permisos, inmutabilidad y ausencia de evidencia. Pendientes para consumidores: misiones que cruzan medianoche, entrega parcial/regalo, cálculo multi-tarifa, pago parcial, cambio posterior de modalidad, producción atrasada/editada, revisión de legado y conciliación de cierres/nóminas. Un nuevo trabajador no debe adquirir jornadas anteriores ficticias.

No implementar un segundo motor de comisiones. Mantener #630 y fuentes canónicas. No cambiar todavía Cierre, Nómina, Embarques ni Producción.
