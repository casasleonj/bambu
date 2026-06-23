# Importación histórica — Diseño UI

Fecha: 2026-06-18
Autor: OpenCode Agent
Estado: Aprobado para implementación

## Contexto

El ERP de Agua Bambú necesita importar datos históricos de papel/Excel (clientes, pedidos, pagos, gastos, embarques, producción y cierres diarios). El flujo es administrativo, ocasional, y se usa en dispositivos móviles con conectividad rural 2G/3G.

## Decisión arquitectónica clave

**Página dedicada en `/dashboard/importar`, no modal.**

Un modal es adecuado para contextos rápidos (login, carrito, detalle de foto), no para un wizard de varios pasos con revisión de datos y tablas de duplicados. La página dedicada permite:

- Más espacio en móvil.
- Persistencia de estado vía `?batch=<id>` en la URL.
- No bloquear otras áreas de la app.
- Mejor manejo de errores por fila.

Fuentes consultadas:

- Next.js 16 docs: intercepting routes + parallel routes son para modales contextuales (galería, login, carrito), no wizards largos.
- Nielsen Norman Group ("Wizards: Definition and Design Recommendations"): los wizards sirven para procesos ocasionales; recomiendan indicador de pasos, orden secuencial, permitir salir/guardar estado, y pasos autosuficientes.

## Usuarios

- `ADMIN`
- `ASISTENTE`

`REPARTIDOR` y `CONTADOR` no acceden.

## Wizard de 4 pasos

### Paso 1 — Subir archivo

- Input file nativo + zona drag-and-drop.
- Campo opcional "Nombre del lote" (default: nombre del archivo).
- Indicar formato: `.xlsx` principal, `.csv` fallback.
- Link a plantilla de ejemplo.
- Botón descriptivo: **"Analizar archivo"**.
- Validación local: extensión y tamaño máximo (10 MB).

### Paso 2 — Analizar

- Spinner con mensajes progresivos.
- Resumen: total de filas, hojas detectadas, errores de parseo, duplicados potenciales.
- Si hay errores graves (columnas obligatorias faltantes), listarlos y no permitir avanzar.
- Botón: **"Revisar duplicados"**.

### Paso 3 — Revisar duplicados (UI híbrida)

- **Desktop**: tabla escaneable con columnas:
  - Nombre importado
  - Teléfono
  - Barrio
  - Candidato(s) existente(s)
  - Acción: "Crear nuevo" / "Fusionar con X" / "Omitir"
- **Mobile (< sm)**: una tarjeta a la vez con botones grandes y contador "X de Y".
- Mostrar score de confianza y razón del match.
- Acciones masivas opcionales: "Marcar todos como nuevos", "Omitir todos".

### Paso 4 — Confirmar

- Resumen final con conteos por entidad.
- Botón **"Confirmar importación"**.
- Spinner durante commit: "Creando registros…".
- Resultado:
  - Éxito: conteos de creados, fusionados, omitidos, fallidos.
  - Error: tabla de filas fallidas con motivo.
- Botones finales: **"Ver en historial"** / **"Volver al dashboard"**.

## Historial de importaciones

- Ruta: `/dashboard/importar/historial`.
- Tabla con: nombre, fecha, estado, filas totales/creadas/fusionadas/fallidas.
- Acciones: ver detalle, reintentar fallidas, descargar log.

## Estado y resiliencia

- Cada avance de paso se persiste en `ImportBatch` (DB).
- Recargar la página recupera el batch por `?batch=<id>` y ubica al usuario en el paso correcto.
- Upload: fetch normal con `FormData` (binario).
- Analyze / decide / commit: `fetchResilient` para soportar cortes de red.

## Manejo de errores

- Errores de parseo: listado por hoja/fila.
- Errores de commit: tabla de filas fallidas con motivo.
- Toasts via Sonner (`toast.success`, `toast.error`, `toast.info`).

## Mobile

- Stepper compacto (números + título corto).
- Botones grandes para decisiones en tarjeta.
- `scrollIntoView` si el teclado tapa inputs (mismo patrón del login).

## Testing

- E2E con Playwright: flujo completo upload → analyze → review → commit.
- Accesibilidad: navegación por teclado del stepper.
- Type check: `npx tsc --noEmit`.

## Archivos a crear/modificar (pendiente de plan de implementación)

- `src/app/(app)/dashboard/importar/page.tsx`
- `src/app/(app)/dashboard/importar/historial/page.tsx`
- `src/components/import/wizard.tsx`
- `src/components/import/upload-step.tsx`
- `src/components/import/analyze-step.tsx`
- `src/components/import/review-step.tsx`
- `src/components/import/review-card.tsx`
- `src/components/import/review-table.tsx`
- `src/components/import/commit-step.tsx`
- `src/hooks/use-import-batch.ts`
- `src/lib/import/client-api.ts`

## Notas

- El backend (API endpoints, matcher, commit) ya está implementado y probado.
- La UI debe reutilizar componentes existentes de `src/components/ui/` (button, card, table, badge, select, dialog si es necesario).
