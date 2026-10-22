# PR-1B/1C — Entrega física viva y cierre por misión

**Incidente:** AB-INC-EMB-2026-10-13 · **ALS:** AB-ALS-EMB-2026-10-13 + Adenda v1.2 (§3.1, §3.2, §5)
**Defectos:** B-01 (foto vencida / histórico vs misión) y B-09 (doble movimiento físico)
**Estado del cambio:** implementado detrás de un flag de servidor, **APAGADO por defecto**. Mergear no cambia el comportamiento de producción.

## 1. PROPUESTA DE AJUSTE respecto a F5 P1-B (para el gate arquitectónico)

`docs/AGUA_BAMBU_F5_P1B_CAPACIDAD_FISICA_v1.0.md` **propuso** calcular las SALIDAS en vivo por lectura (Pedido + ledger) y **no escribir** `ENTREGA` ordinaria en vivo. Esa aproximación está acotada por el propio documento a la capacidad de RECARGA (no bloqueante) y reconoce que subestima/sobreestima cuando un pedido parcial sale del embarque. **No sirve como conciliación definitiva** ni como base de responsabilidad económica.

Este cambio propone, de forma localizada, **escribir el evento físico ordinario al momento de la entrega verificable**, en la misma transacción que `PedidoItem.cantEntrega`, y que el cierre lo consuma. **No se afirma que P1-B haya aprobado este writer**: es una divergencia que debe pasar el gate del equipo antes de activar el flag. No se reabre producto ni se amplía RECARGA.

Evidencia concreta de por qué la lectura no alcanza: tras una entrega parcial, `Pedido.embarqueId` pasa a `null` (el pedido sale del embarque y se replanifica). Ni la foto `pedidosRaw` del cierre ni una consulta `WHERE embarqueId = X` vuelven a ver esa salida; solo un evento atribuido la conserva (prueba `entrega parcial viva…`).

## 2. Contrato implementado

**`POST /api/pedidos/[id]/entrega`** — campo nuevo `embarqueEntregaId` (contexto FÍSICO, distinto de `embarqueId` que es el contexto del DINERO):

- Ausente → entrega en punto/oficina sin custodia de vehículo: **no** se crea `ENTREGA`.
- Presente → exige `offlineId` (400 si falta: no se inventa una clave nueva en cada reintento).
- El backend valida el embarque (existe, no CANCELADO; un REPARTIDOR solo el suyo). Un embarque CERRADO es válido (sync tardío).
- Si el embarque usa el modo vivo (§3) se escribe, **por línea y en la misma transacción** que `cantEntrega`:
  `EmbarqueMovimiento{ENTREGA, VEHICULO→CLIENTE, cantidad = lo realmente aplicado tras el clamp (nunca 0)}`
  con `offlineId = entrega:<offlineId>:<PRODUCTO>` y `metadata = {captura:'ENTREGA_PEDIDO', pedidoId, eventoEntregaId}`.
- **Dedup antes de modificar Pedido/Pago**, por la clave de línea (única en `EmbarqueMovimiento.offlineId`). Esto cubre el replay *viejo* tras varios parciales, que `Pedido.entregaOfflineId` (una sola clave reciente) no cubre. Sin migración de esquema.
- Evento tardío a un embarque CERRADO: se escribe con `metadata.posCierre = true` y `logAudit('ENTREGA_POST_CIERRE')`; **no** se reatribuye ni se bloquea, y la conciliación de la misión no lo cuenta (queda para revisión post-cierre).

**`CerrarEmbarqueUseCase` (modo vivo)**

- Bloquea `PEDIDO:{id}` de los pedidos de la misión (después de `CIERRE` → `SECUENCIA`, mismo orden global) **antes** de leerlos: una `/entrega` concurrente termina antes o espera; nunca se procesa una foto vencida (B-01).
- `entregadas` (conciliación) = eventos atribuidos de `/entrega` + entregas manuales de botellón (`POST /botellones`, `tipoEnvase=ENTREGADO`) + ventas libres previas sin evento + **delta propio del cierre** + ventas libres declaradas. Ya no usa `pedidosRaw.cXEnt` acumulado.
- `RegistrarMovimientosCierre` escribe `ENTREGA` solo por el delta propio (+ ventas libres previas), una vez, con `metadata.captura = 'CIERRE'`.
- Las sustituciones **no** se cuentan como entregadas (siguen conciliándose como `cambios`).
- **Guarda B-09:** si hay entregas SIN identidad verificable (manuales) y las salidas físicas totales superan la carga, el cierre se rechaza con `SALIDAS_EXCEDEN_CARGA` (400, también en `preview`). **Nunca se deduplica por coincidencia de producto/cantidad/fecha.** Un sobre-entregado sin entregas manuales sigue el camino anterior (discrepancia negativa), sin bloqueo nuevo.
- Preview y cierre comparten el caso de uso → mismo resultado (`dryRun`).

## 3. Selección por procedencia, flag y rollback

Variable de servidor **`EMBARQUE_ENTREGA_VIVA_DESDE`** (ISO-8601; sin definir = apagado).

| Embarque | Camino |
|---|---|
| Creado ≥ fecha del flag | Modo vivo (`/entrega` escribe eventos; cierre por misión) |
| Con eventos `ENTREGA_PEDIDO` atribuidos (aunque el flag se apague) | Modo vivo — no se puede volver a la lógica anterior sin duplicar la salida |
| Anterior a la activación / flag apagado | **Excepción histórica:** lógica anterior intacta; no se fabrican eventos retroactivos |

**Rollback:** quitar/vaciar la variable. Los embarques nuevos vuelven a la lógica anterior; los que ya tienen eventos atribuidos terminan por el camino vivo (prueba `rollback del flag a mitad de misión`). No hay migración que revertir.

## 4. Lista de activación (NO se activa en este PR)

1. Gate arquitectónico aprobado sobre la divergencia con P1-B (§1).
2. UI desplegada: `pedidos-client` resuelve quién entregó (§4bis) y envía `embarqueEntregaId` o `clienteRetiro`. Verificar que la cola offline antigua esté vacía: una petición encolada **sin** ninguno de los dos no genera evento y, en un embarque en modo vivo, aparecería como faltante.
3. Definir `EMBARQUE_ENTREGA_VIVA_DESDE` = fecha de un día **sin** embarques abiertos (los abiertos ese día seguirían en la lógica anterior).
4. Verificación post-despliegue con un embarque real de bajo volumen: ΣENTREGA del ledger = unidades entregadas; discrepancia 0; sin `SALIDAS_EXCEDEN_CARGA`.
5. Monitoreo: `Historial`/`AuditLog` `ENTREGA_POST_CIERRE` y rechazos `SALIDAS_EXCEDEN_CARGA`.

## 4bis. Quién entregó, GPS y foto (decisión del PO, 2026-10-22)

Cierra #390. La oficina marca entregas desde `/pedidos` (el repartidor no tiene acceso a esa pantalla), así que la pantalla resuelve el contexto con el mínimo de pasos:

| Situación del pedido | Interfaz | Efecto en servidor |
|---|---|---|
| Sin embarque (mostrador) | 1 botón «Marcar entregado» | Entrega normal, sin salida del vehículo |
| Embarque `ABIERTO` (aún no sale) | 1 botón; el sistema lo trata como retiro | `clienteRetiro`: entregado y suelto del embarque |
| Embarque `EN_RUTA` | 2 botones: «Entregó el repartidor» / «Cliente retiró» | `embarqueEntregaId` (salida del vehículo) o `clienteRetiro` |

- **`clienteRetiro`:** `/entrega` marca entregado y suelta el pedido del embarque en la **misma transacción** (repetible con el mismo `offlineId`, funciona en la cola offline), sin evento físico ni exigencia de GPS/foto; audita `ENTREGA_RETIRO_CLIENTE`, refresca el embarque y avisa al repartidor si ya iba en ruta. Es incompatible con `embarqueEntregaId` (400). `embarqueEntregaId` sobre un embarque `ABIERTO` se rechaza (400).
- **GPS:** la app lo toma sola (sin pantalla ni justificación). Se envía únicamente si el dispositivo está dentro del radio del domicilio: la posición de la oficina **no** se guarda como GPS de entrega porque el backfill de coordenadas de negocios usa la mediana de esos GPS. El servidor lo exige (`requerirGpsParaEntrega`) a REPARTIDOR y trabajadores con moto; ADMIN/ASISTENTE nunca quedan bloqueados.
- **Foto:** el servidor la exige a REPARTIDOR y trabajadores con moto; ADMIN y ASISTENTE quedan exentos.
- Las pantallas `FotoEntregaModal` y `GpsCaptureModal` ya no se usan en `/pedidos`; siguen disponibles para la pantalla de entrega del repartidor (#318).

## 5. Limitaciones conocidas (honestas)

- **Botellón manual vs `/entrega`:** `POST /botellones` no lleva `pedidoId`; si el repartidor registra la misma entrega por las dos vías, no hay identidad común verificable. Mientras la suma no supere la carga, ambas cuentan (sobrante visible, no silencioso); si la supera, el cierre se rechaza para revisión. Solución de fondo: que `/botellones` acepte un `pedidoId`/`eventoEntregaId` verificable (#353).
- **Disponibilidad en vivo de P1-B:** la futura `calcularDisponibilidadFisica` suma `Pedido.cantEntrega` **más** `ENTREGA`/`VENTA_RUTA` del ledger bajo el supuesto de que son disjuntos antes del cierre. Con el modo vivo ya no lo son para los embarques en ese modo: debe leer solo el ledger en ellos o duplicará. Aún no existe esa función (P1-C no implementado); registrado en #311.
- **Ventas libres previas** (`POST /pedidos/venta-libre`) siguen sin escribir evento vivo; se cuentan por su `origen = VENTA_LIBRE` y se escriben al cierre como antes (#354).
- **Pedidos entregados sin contexto físico dentro de una misión en modo vivo** no cuentan como salida del vehículo, por diseño (§3.2 punto 1). Con §4bis el caso habitual queda resuelto sin preguntar; solo `EN_RUTA` exige elegir entre dos botones.
- **GPS "del repartidor":** hoy no hay seguimiento de su posición (`GpsTrack` y `POST /api/gps-track` existen pero ninguna pantalla los usa). Cuando la oficina marca por el repartidor no se puede conocer su posición; por eso solo se guarda el GPS si el dispositivo que marca está en el domicilio. Tomar la posición desde el usuario del repartidor exige que su app la reporte (issue aparte).
- No se tocan pagos, inventario, saldos, facturas ni responsabilidades. El caso de los $150.000 y la brecha de precios (#326) siguen abiertos.

## 6. Pruebas

`src/lib/__tests__/integration/embarque-entrega-fisica-viva.test.ts` (20, Postgres real): pruebas 1, 2, 3, 9 (mismo `offlineId`, replay viejo tras dos parciales, concurrencia), clamp, sin contexto físico, `offlineId` obligatorio, embarque inexistente, flag apagado, evento tardío, B-09 (rojo, latente y guarda), venta libre previa, preview = cierre con parcial vivo, histórico, rollback y carrera `/entrega` vs cierre. Con el código anterior fallaban 13/20; las 7 restantes son guardas que deben seguir en verde.
