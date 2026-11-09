# Índice verificable de los 49 registros históricos (no sustituye contratos)

> Generado a partir de `fuente-original/02-historico-incidencias.md` (blob `992f9498905e26bf66f98a1d3744cb6d04f09f43`). Cada registro es **histórico hasta verificar su vigencia** con decisiones del PO y el código de `main`. No convierte una solución pasada en normativa actual. Las repeticiones de los números 13, 43 y 45 se conservan y distinguen por registro.

| Registro | Número original | Título textual / contexto | Fuente |
|---|---:|---|---|
| HIST-001 | 1 | Decimal fields | [L3](fuente-original/02-historico-incidencias.md#L3) |
| HIST-002 | 2 | Next.js workspace inference | [L4](fuente-original/02-historico-incidencias.md#L4) |
| HIST-003 | 3 | Serwist dependency | [L5](fuente-original/02-historico-incidencias.md#L5) |
| HIST-004 | 4 | Auth adapter | [L6](fuente-original/02-historico-incidencias.md#L6) |
| HIST-005 | 5 | Redis v5 + rate-limiter-flexible | [L7](fuente-original/02-historico-incidencias.md#L7) |
| HIST-006 | 6 | Docker Compose | [L8](fuente-original/02-historico-incidencias.md#L8) |
| HIST-007 | 7 | NEXTAUTH_URL local vs LAN | [L9](fuente-original/02-historico-incidencias.md#L9) |
| HIST-008 | 8 | Test 291 ECONNRESET (Bloque 6) | [L10](fuente-original/02-historico-incidencias.md#L10) |
| HIST-009 | 9 | Errores TS fantasma en `.next/dev/types/validator.ts` | [L15](fuente-original/02-historico-incidencias.md#L15) |
| HIST-010 | 10 | Bug teclado virtual tapa input en login (móvil) | [L16](fuente-original/02-historico-incidencias.md#L16) |
| HIST-011 | 11 | CRUD de contactos desde la UI | [L22](fuente-original/02-historico-incidencias.md#L22) |
| HIST-012 | 12 | `prisma migrate deploy` falla en dev con `0_init already exists` | [L36](fuente-original/02-historico-incidencias.md#L36) |
| HIST-013 | 13 | Query params de `/pedidos` separados en filtros y triggers | [L53](fuente-original/02-historico-incidencias.md#L53) |
| HIST-014 | 13 | Query params de `/pedidos` separados en filtros y triggers | [L58](fuente-original/02-historico-incidencias.md#L58) |
| HIST-015 | 14 | Session expiry UX: app congelada / "no permission" hasta F5 | [L66](fuente-original/02-historico-incidencias.md#L66) |
| HIST-016 | 15 | Navegación entre secciones lenta en producción (~60s por ruta) | [L74](fuente-original/02-historico-incidencias.md#L74) |
| HIST-017 | 16 | Realtime `/api/realtime` 429 loop inflando costos Vercel + save cliente atascado en "Guardando..." | [L78](fuente-original/02-historico-incidencias.md#L78) |
| HIST-018 | 17 | Filtros de fecha: rango parcial roto + "today" en UTC | [L85](fuente-original/02-historico-incidencias.md#L85) |
| HIST-019 | 18 | Rescue de stashes: nuevos contratos de UI/UX | [L91](fuente-original/02-historico-incidencias.md#L91) |
| HIST-020 | 19 | `/clientes`: negocios stale en panel + filtros lentos + resultados confusos | [L98](fuente-original/02-historico-incidencias.md#L98) |
| HIST-021 | 20 | E2E auth flakiness con workers>1 | [L110](fuente-original/02-historico-incidencias.md#L110) |
| HIST-022 | 21 | Redis daily cap consumido por tráfico no autenticado | [L130](fuente-original/02-historico-incidencias.md#L130) |
| HIST-023 | 22 | `/clientes` search input snap-back y clearFilters sin efecto | [L133](fuente-original/02-historico-incidencias.md#L133) |
| HIST-024 | 23 | Race de `searchInput` al limpiar filtros en `/pedidos` | [L140](fuente-original/02-historico-incidencias.md#L140) |
| HIST-025 | 24 | Tests mobile con vistas desktop/mobile duplicadas | [L141](fuente-original/02-historico-incidencias.md#L141) |
| HIST-026 | 25 | Job `e2e` reactivado en CI (resuelto 2026-08-21) | [L142](fuente-original/02-historico-incidencias.md#L142) |
| HIST-027 | 26 | Bucle de requests en `/pedidos?atrasados=true` / `?enRiesgo=true` (resuelto 2026-08-23) | [L143](fuente-original/02-historico-incidencias.md#L143) |
| HIST-028 | 27 | "Verlos →" dentro de `/pedidos` tardaba ~15 s en mostrar la vista (resuelto 2026-09-26) | [L148](fuente-original/02-historico-incidencias.md#L148) |
| HIST-029 | 28 | Ventas anónimas sin `Pago` persistido + cambio convertido en saldo a favor (P0, resuelto en código 2026-10-08) | [L153](fuente-original/02-historico-incidencias.md#L153) |
| HIST-030 | 29 | Auditoría integral de documentación vs. código (2026-10-10) | [L166](fuente-original/02-historico-incidencias.md#L166) |
| HIST-031 | 30 | `/facturas`: totales, búsqueda y orden en el servidor (#466) | [L168](fuente-original/02-historico-incidencias.md#L168) |
| HIST-032 | 31 | Cierre de caja: el conteo del efectivo se compara con el efectivo que debe haber, no con el neto (#601) | [L175](fuente-original/02-historico-incidencias.md#L175) |
| HIST-033 | 32 | Producción: lo vendido del día cuenta las entregas parciales (#604) | [L181](fuente-original/02-historico-incidencias.md#L181) |
| HIST-034 | 33 | Pago de nómina con medio y sin gastos manuales NÓMINA (#641) | [L183](fuente-original/02-historico-incidencias.md#L183) |
| HIST-035 | 34 | Sueldos fijos con frecuencia de pago, «Sueldos que tocan» y cierre sin «Salarios» (#644) | [L189](fuente-original/02-historico-incidencias.md#L189) |
| HIST-036 | 35 | Comisión del sellador con botellón llenado, pagada desde el cierre (#645 / #623) | [L196](fuente-original/02-historico-incidencias.md#L196) |
| HIST-037 | 36 | Producción dentro del cierre de caja (#645, 2c-2) | [L201](fuente-original/02-historico-incidencias.md#L201) |
| HIST-038 | 37 | Inventario de botellones llenos (#618) | [L210](fuente-original/02-historico-incidencias.md#L210) |
| HIST-039 | 38 | Cierre de caja: de dónde viene lo cobrado, a quién se fió hoy y pagos por confirmar (#631) | [L215](fuente-original/02-historico-incidencias.md#L215) |
| HIST-040 | 39 | Cierre de caja en lenguaje claro, sin repetir y con desplegables (#646, PR A) | [L220](fuente-original/02-historico-incidencias.md#L220) |
| HIST-041 | 40 | Cierre de caja: sección «Pagos al personal» (#646, PR B) | [L228](fuente-original/02-historico-incidencias.md#L228) |
| HIST-042 | 41 | Cierre de caja: formulario «Registrar producción» al estilo de las tarjetas de stock (#646, PR C) | [L234](fuente-original/02-historico-incidencias.md#L234) |
| HIST-043 | 42 | Cierre de caja: encabezados sin solapamientos y efectivo inicial en un solo lugar (#665 y #666) | [L240](fuente-original/02-historico-incidencias.md#L240) |
| HIST-044 | 43 | Comisión sin embarque cuenta entregas parciales por fecha y responsable del hecho (#669) | [L246](fuente-original/02-historico-incidencias.md#L246) |
| HIST-045 | 44 | Tipo salarial independiente de «Usa moto» (#671, decisión PO 2026-11-06) | [L248](fuente-original/02-historico-incidencias.md#L248) |
| HIST-046 | 45 | El sobrante de un cobro de fiados entra a la caja del cierre una sola vez (#524) | [L250](fuente-original/02-historico-incidencias.md#L250) |
| HIST-047 | 43 | Conteo del efectivo con la moneda de $1.000 (#624) | [L258](fuente-original/02-historico-incidencias.md#L258) |
| HIST-048 | 45 | «Ver entregas y cálculo» muestra a quién se entregó cada pedido y qué se entregó cada día (#622) | [L262](fuente-original/02-historico-incidencias.md#L262) |
| HIST-049 | 46 | La base de caja del cierre es la ingresada para esa fecha y el cierre solo la lee (#688) | [L270](fuente-original/02-historico-incidencias.md#L270) |

**Lectura:** cuando un issue toca un dominio, buscar primero el registro relevante; leer **el bloque completo** antes de tratar su contenido como contrato y contrastar con `main` actual. El registro HIST-N no es la numeración antigua y no sustituye IDs de GitHub Issues. No resumir un contrato vigente a una etiqueta de incidencia.
