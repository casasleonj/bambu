# Cierre de embarque V2 — resumen para revisión técnica

- **Fecha:** 2026-10-23 · **Rama:** `ccr-e3a79cc5-06g3q9` · **Épica:** #447
- **Estado:** análisis y maqueta. **No hay código implementado.** Una pieza de trabajo previa (lógica pura + tests de la Fase A) quedó guardada fuera del repo y no se usará hasta que el equipo apruebe.
- **Maqueta navegable (9 pantallas, privada):** https://claude.ai/artifact/Qo6tjTtSGQCi58i5M5WioU
- **Para qué sirve este documento:** que el equipo contraste lo hallado y lo propuesto con lo que ya se había definido, y decida qué se hace. Cada afirmación indica de dónde sale (documento, código, issue o prueba). Lo que es **decisión nueva** o **supuesto** está marcado como tal.

---

## 1. Resumen en diez líneas

1. Las **reglas de fondo ya estaban definidas y resueltas en backend**: entrega parcial (PR-1), exceso/incompleto (B-12), corrección a la baja y nueva demanda (G11, PR #206), venta libre como operación aparte, dinero de la misión (PR-2).
2. Lo que **no estaba resuelto es la pantalla del cierre** (`/embarques/[id]/cerrar`): sigue siendo la de la Fase 7 (tres botones «Completo / Parcial / No entregado» independientes de las cantidades).
3. Las definiciones que sí cubren «cliente acepta menos / pide más» están escritas **para el Hub de Pedidos**, que está apagado en producción (`NEXT_PUBLIC_PEDIDOS_V2=false`, AGENTS.md #28), no para el cierre.
4. Se encontraron **defectos de integridad con dinero** en el cierre, verificados con cierres reales (no solo preview): pedido cancelado cerrado como entregado (#448), pedido omitido huérfano y cobro perdido como «sobrante» (#449), venta libre fiada que tapa un faltante (#450).
5. Hay **incumplimientos de lo ya aprobado**: el cuadre de caja se recalcula en el cliente y no suma (la Fase 7 exige el número autoritativo del preview) (#437).
6. Se proponen **cinco cambios de pantalla** (entrega derivada, dinero, frescura, revisión con señales, venta libre con buscador) y **cambios de servidor** que requieren ADR porque el backend de embarques está congelado.
7. Se propone ejecutar en **tres fases**: A (pantalla sin tocar dominio), B (servidor con ADR), C (corrección y cambios).
8. Hay **tres propuestas que modifican o refinan decisiones previas** y necesitan confirmación explícita (§7.3).
9. Los resultados se obtuvieron en un **entorno local** sin todas las migraciones aplicadas; algunos deben reconfirmarse en producción con consultas de solo lectura (§9).
10. Registro en GitHub: #443–#450 (hallazgos), #447 (épica) y comentarios en #326, #444 y #445.

---

## 2. Qué ya estaba definido (y dónde)

| Tema | Definición vigente | Fuente | Estado |
|---|---|---|---|
| Entrega parcial | El pedido conserva `total`/`totalPagado`; lo no entregado queda **pendiente en el mismo pedido**; sin pedido hijo; 6 + 4 = 10 | `docs/pedidos/PR1_INTEGRIDAD_ENTREGA_PARCIAL_v3.md` | Implementado (`procesar-pedido.service.ts`) |
| `COMPLETO` / exceso / `NO_ENTREGADO` | `COMPLETO` exige acumulado = pedido; `ENTREGA_EXCEDE_PEDIDO`; `NO_ENTREGADO` = 0 unidades nuevas | B-08, B-12; `docs/incidentes/PR1BC_ENTREGA_FISICA_VIVA_2026-10-14.md` | Implementado |
| Corrección vs nueva demanda | **Corrección** de un error de captura: `AjustarPedidoCantidadUseCase` (guards: no sobre cantidad ya entregada, no pedido cerrado, no sobrepago; recalcula total/saldo/estadoPago/factura). **Nueva demanda** = `Pedido` nuevo con `pedidoOrigenId`. Pedido hijo no se reintroduce | `docs/pedidos/PEDIDOS_PENDIENTES_DECISION_PO_v1.0.md` §2 (decisión PO 2026-09-06); PR #206 | Implementado; UI solo en Hub V2 (apagado) |
| Frontera «completar pendiente / nueva demanda / venta en ruta» | Declaración explícita del usuario, nunca inferencia | `docs/pedidos/fase5-n2-flujo-plan.md` P4 | Solo Hub de Pedidos |
| Venta libre | Operación de ruta que **no modifica** el pedido («20 + 5, nunca pedido modificado a 25»); consumidor final = **elección explícita**; el cierre del admin es «registrada en conciliación» (registrador ≠ responsable operativo); una diferencia de conciliación **no** se cuadra con una venta libre | `docs/pedidos/VENTA_LIBRE_AUDITORIA_CONTRATO_CODIGO_v1.0.md`, `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` (VL-03, VL-05, VL-09, VL-A09, VL-A11, VL-A12) | Contrato vinculante; BRECHA-2/3/4/6/8 abiertas |
| Dinero de la misión | `cuadre.pagos` = dinero **nuevo** de la misión; `Pago.embarqueId`; guard `PAGOS_EXCEDIDOS`; se retiró el prellenado | `docs/adr/ADR-PAGO-EMBARQUE-CAPTURA-001.md` (rev.6, aceptado) | Implementado |
| Sustituciones | Dos movimientos físicos (RETORNO + ENTREGA) + `Sustitucion` con `pedidoId?` y `motivo?`; UI en pestaña Físico | `docs/adr/ADR-SUSTITUCION-001.md`, `docs/embarques/01-ux-contract.md` §4 | Implementado |
| CAMBIO (semántica) | Cantidad reclamada ≠ repuesta; disposición diferida (pendiente de inspección); decide administración | `docs/AGUA_BAMBU_F5_CONVERGENCIA_SEMANTICA_FISICA_v1.0.md` punto 12 | Decisión **cerrada**, brecha P1 **sin implementar** |
| Cierre = wizard | Pasos forzados; preview autoritativo (`/cerrar/preview`); «calculos local solo como fallback offline etiquetado»; **el preview no es compuerta dura si falla (red/timeout/2G)**; no bloquear el cierre por casos abiertos | `docs/embarques/00-plan-frontend-completo.md` Fase 7; `docs/embarques/PENDIENTE.md` (decisión PO 2026-08-29) | Implementado con las divergencias de §3 |
| Backend de embarques | Congelado: no tocar `src/modules/embarques/domain/**` ni use-cases sin ADR | `docs/embarques/ONBOARDING-EQUIPO.md`, `PENDIENTE.md` | Vigente |
| Precio corregido en el cierre | Sin regla escrita sobre su efecto en `total`/factura | Issue #326 (abierto, ADR-MONETARIO-001) | **Pendiente** |

**Lo que no se encontró definido en ningún documento:** derivar el estado de entrega de las cantidades; el panel «queda por cobrar → fiado»; bloquear ante un 4xx del preview; frescura del cierre; revisión con señales; buscador y tienda en venta libre del cierre; «cambios» atribuidos a un cliente; `pedidoOrigenId` en venta libre (BRECHA-3 lo deja como «confirmar con producto», EH-3).

---

## 3. Qué se halló (verificado)

Método: servidor local + Postgres real, navegación con Playwright (UI) y llamadas HTTP a `/cerrar/preview` (dry-run con rollback) y a `/cerrar` (real, en embarques de prueba). Detalle de cada caso en el issue citado.

### 3.1 Pantalla del cierre (UI ≠ UX)
| Hallazgo | Evidencia | Issue |
|---|---|---|
| «Completo» queda marcado aunque «Entregó» sea 5 de 10; el wizard deja llegar al Preview | `pedido-cuadre.tsx`; `wizard-gating.ts::pasoPedidosValido` solo valida pago ≤ entregado | #443 |
| El rechazo del servidor (`ENTREGA_INCOMPLETA`, 400) se presenta en el Preview como «⚠️ Estimado local (sin verificar)» con totales en $0; el mensaje real solo llega al pulsar «Confirmar» | `cerrar-client/index.tsx` (`previewError` no distingue 4xx de red); `fetchResilient` sí devuelve el mensaje en el toast final | #443 |
| «Parcial con 0» → `PENDIENTE`; «No entregado» → `NO_ENTREGADO`; «Parcial con 10 de 10» → `ENTREGADO` | 4 casos de `/cerrar/preview` | #443 |
| No hay forma de expresar la causa de la diferencia (otra visita / acepta menos / pide más / canceló) ni un motivo para `NO_ENTREGADO` | Código y UI | #443 |
| «Bot. Fab» y «Bot. Dom» se muestran las dos; el pedido tiene una sola | `pedido-cuadre.tsx` | #443 |
| Cuadre de caja: «Total vendido (efectivo) $38.600 − fiado 13.400 − gastos 23.000 + base 20.000» ≠ «Debió entregar $12.600» (la primera línea es `efectivoEsperado + gastos` y el fiado se resta de más) | `cerrar-client/index.tsx` ~l.914; caso reproducido | #437 |
| Conciliación: «+2» por fila pero pie «sin discrepancias» (la suma local cuenta solo faltantes y no resta `cambios`); el servidor suma faltantes + sobrantes y resta cambios | `calculos.totalDiscrepancia` vs `CierreEmbarqueService.calcularDiscrepancia` | #437 |
| Precios del cierre llegan vacíos (el endpoint `?full=true` no devuelve `precio*`); aviso «el cliente pagará menos/más» es falso porque `total` no se recalcula | `route.ts` `select`; `procesar-pedido.service.ts` | #436, #326 |
| Un precio vacío se envía como `0` y el servidor (ADMIN) lo guarda en `PedidoItem` y columnas legacy | `parseFloat(...)\|\|0`; `updatePedidoItems` | #326 |
| Venta libre del cierre: `<select>` con solo `nombre`, sin búsqueda/tienda/teléfono; carga `GET /api/clientes?all=true`; sin precio/total/saldo | `venta-libre-row.tsx` | #445 |
| «Cambios» es un contador libre; no se relaciona con las Sustituciones | `conciliarProductos` usa solo `productosRetorno[].cambios` | #446 |
| Tras «Cancelar» un pedido, el cierre lo lista con «Completo» preseleccionado | UI | #448 |

### 3.2 Servidor (integridad y dinero) — verificado con cierres reales
| Hallazgo | Resultado | Issue |
|---|---|---|
| **Pedido CANCELADO asignado al embarque** | Cierre real → `ENTREGADO`, `total=0`, factura `PAGADA` $0; sus unidades cuentan como entregadas (tapan faltantes) | #448 (P0) |
| **Pedido omitido del payload** | Queda `EN_RUTA` con `embarqueId` de un embarque `CERRADO` (huérfano) | #449 (P0) |
| **Pedido que salió del embarque con cobro tecleado** | El cobro se descarta; con el efectivo declarado, la caja registra «sobrante» (+$9.000) | #449 (P0) |
| **Venta libre fiada** a cliente real | Baja la discrepancia a 0; deuda a un cliente que no la conoce; sin señal | #450 (P1) |
| Venta libre a `CONSUMIDOR_FINAL` sin pago | Aceptada (viola la regla V4 del verificador) | #445 |
| Venta libre fiada a cliente **bloqueado** | Aceptada | #445 |
| Venta libre: se ignoran precios especiales (`resolverPrecio(...,null,null)`); sin `negocioId`/`pedidoOrigenId` | Verificado en `crear-ventas-libres.service.ts` y `CerrarEmbarqueSchema` | #445 |
| Venta libre con 0 unidades y pago | El pago se descarta en silencio | #444 |
| `pedidoId` inexistente / ajeno / duplicado en el payload | 200 (ignorado) / 200 (procesado dos veces) | #444 |
| Método de pago inventado; cliente inexistente; 99.999 unidades | 500 | #444 |
| Gasto de $99.999.999.999 | 500 | #444 |
| `obs` de 2 MB; 70 gastos idénticos; 200 ventas libres idénticas fiadas (3,3 s); `productos` repetidos; pago con decimales | 200 | #444 |
| `cambios=3` sin sustitución | 200; baja la discrepancia de 5 a 2 y $14.000 a $5.600 | #446 |
| Retornos mayores a lo cargado | 200 con `disc=55` | #444 |
| Preview consume secuencias de pedido/factura | `FAC-00002 → FAC-00009` | #438 |

**Ya correcto (verificado):** pago > saldo (`PAGOS_EXCEDIDOS`), exceso de entrega, pedido editado por otra persona (400 claro), cierre repetido con el mismo `offlineId` (`deduped`), otro `offlineId` (400 «ya cerrado»), `REPARTIDOR`/`CONTADOR` (403), cierre en cola rechazado → cola de fallidos con motivo (`sync.ts`).

Otros defectos fuera del cierre pero encontrados en el recorrido: #433 (el wizard de Nuevo Embarque no asigna los pedidos), #439 (barrio del negocio no se guarda).

---

## 4. Ejemplos cotidianos

1. **Parcial.** Marta pidió 10 de hielo; Yesid solo lleva 6. Hoy se marca «Parcial» a mano; si queda «Completo», el servidor rechaza al final. Propuesta: escribir 6, ver «faltan 4» y elegir qué pasa con ellas (otra visita o ya no las quiere).
2. **Acepta menos.** Carlos pidió 10 ($23.000); al llegar dice «con 5 me alcanza». Corrección G11 con motivo: 10→5, $23.000→$11.500. Si ya había pagado todo, no se corrige solo (devolución/saldo a favor); si ya se le entregó algo de ese producto, tampoco.
3. **Pide más.** La tienda pidió 10 y recibe 15. El campo se detiene en 10; las 5 extra son venta libre aparte, sin tocar el pedido.
4. **Dinero.** $23.000, adelanto $3.000, paga $10.000 hoy → «queda por cobrar $10.000 → fiado de Carlos»; el repartidor debe entregar $10.000 en efectivo por este pedido.
5. **Cambios.** Una paca rota a Marta: se registra con producto, cantidad, **cliente**, motivo y autor; el «1» de conciliación aparece solo.
6. **Venta libre.** Alguien compra 2 pacas en la calle: buscador por tienda/teléfono, total y saldo a la vista; si no es cliente, «Venta al paso» explícita con pago completo.
7. **Rechazo.** «Completo» con 5 de 10: el Preview muestra el motivo real y bloquea; sin señal, «estimado local» y se puede confirmar.
8. **Pedido cancelado.** María cancela #226 mientras otro asistente cierra: aparece «Cancelado — no se entrega»; hoy se cerraría como entregado con $0.

---

## 5. Propuesta (resumen de diseño; ver maqueta)

1. **Entrega por línea, estado derivado.** Pidió · Ya entregado · Entrega ahora (máx = pendiente) · Falta. Con pendiente > 0, decisión explícita **sin opción por defecto**: (a) otra visita (`PARCIAL`); (b) el cliente ya no quiere el resto (corrección G11; reutilizar `correccion-cantidad-form` y `POST /api/pedidos/[id]/ajustar-cantidad/preview`). Con 0: «No entregado» + reasignar. Exceso: «El cliente pidió más → venta libre».
2. **Dinero por pedido.** Valor, ya pagado, cobrar ahora (con «cobrar el saldo»), **queda por cobrar → fiado de X** o «Pagado completo», efectivo a entregar, digitales «se verifica luego».
3. **Frescura.** Escuchar el realtime del embarque; si cambia (pedido cancelado, retirado, editado, agregado) avisar con detalle y «Actualizar» sin perder lo tecleado; bloquear el avance hasta actualizar. Borrador local recuperable; aviso persistente si un cierre en cola es rechazado.
4. **Revisión antes de confirmar.** Cuadre cuyas líneas suman; un solo número de diferencia en todas las pantallas; recuadro con el motivo del rechazo; «Para revisar» con señales **que no bloquean**.
5. **Venta libre.** Mismo buscador de Pedidos (`useClienteSearch` + `ClienteResultado`), precio/total/saldo, un único «Botellón», «Venta al paso» explícita (`canal DOMICILIO`, `origen VENTA_LIBRE`: **Punto no cambia**).
6. **Cambios.** Solo lectura = Σ sustituciones registradas (cliente/pedido, motivo, autor).
7. **Móvil y accesibilidad.** Objetivos ≥ 44 px, barra inferior fija, nada depende solo del color.

### Fases (1 fase = 1 rama = 1 PR; flag `NEXT_PUBLIC_CIERRE_V2` OFF)
| Fase | Contenido | ¿Toca dominio? |
|---|---|---|
| **A** | Entrega derivada y decisión de pendiente; panel de dinero; frescura y borrador; revisión y señales; preview 4xx; venta libre con buscador/total/bloqueos; #436, #437 | No |
| **B** | ADR addendum de embarques y de ADR-MONETARIO-001: #448, #449, #444, reglas de #445 (anónimo/crédito/precios especiales/`negocioId`/`pedidoOrigenId`), umbral de sobrante, recálculo por corrección de precio (#326) | **Sí (requiere ADR)** |
| **C** | Corrección «ya no quiere el resto» desde el cierre; `cambios` = Σ sustituciones (#446) | Sí (ADR) |

---

## 6. Casos adversariales y respuesta (resumen; tabla completa en pantalla 9 de la maqueta)

Pedido cancelado/omitido/retirado/editado/agregado durante el cierre · cobro tecleado en un pedido que salió · rechazo del servidor en el preview · doble clic y dos pestañas · dos personas cerrando a la vez · cierre en cola rechazado · valores extremos (500 y topes) · errores de dedo (55 por 5, cobrar de más) · venta libre fiada que tapa faltante · venta libre sin productos con pago · fiado a bloqueado · «cambios» sin evidencia · corregir a la baja «para que cuadre» · sobrante de caja grande · precio $0/$1.

Principios de respuesta: la pantalla **muestra** el problema y su causa antes de que el servidor lo rechace (Fase A); el servidor **rechaza con 4xx accionable** y nunca 500 (Fase B); lo que es sospecha pero no error es una **señal**, no un bloqueo ni una deuda automática (VL-A15).

---

## 7. Decisiones

### 7.1 Tomadas por el PO (2026-10-23)
1. Precio en el cierre: **corrección con recálculo** de la obligación (requiere ADR-MONETARIO-001; #326).
2. Venta libre fiada a cliente bloqueado/sobre límite: **permitir con excepción autorizada** (F2). Fase A solo bloquea y explica.
3. Venta libre a `CONSUMIDOR_FINAL`: pedido de re-análisis por métricas de «punto». Resultado: se permite como «Venta al paso» con pago completo, sin cambiar `canal` ni `origen` (Punto no se altera); un anónimo con saldo sería deuda invisible porque `CONSUMIDOR_FINAL` está excluido de Fiados y contadores. Análisis en #445.

### 7.2 Tomadas en el diseño (revertibles)
4. «El cliente ya no quiere el resto»: ADMIN **y** ASISTENTE (como ya permite el endpoint), motivo obligatorio, auditado, con guards G11.
5. Cambio a un cliente sin pedido en la ruta: permitido con cliente obligatorio.

### 7.3 Propuestas que modifican o refinan algo ya definido — **el equipo debe decidir**
| # | Propuesta | Decisión previa que toca | Pregunta concreta |
|---|---|---|---|
| D1 | Un **4xx del preview bloquea** el avance y muestra el motivo; «estimado local» solo ante red/5xx | PO 2026-08-29: «el preview NO es gate duro» | ¿Se acepta la refinación? (Un 4xx haría fallar igual el cierre real) |
| D2 | Estado de entrega **derivado** de las cantidades en el cierre | Fase 7: «Pedidos (entregado/no entregado + productos + precios reales)» | ¿Se reemplaza el selector manual por el derivado? |
| D3 | `cambios` = Σ sustituciones registradas; el contador legacy deja de ser editable | ADR-MIGRACION-001 (el mirror legacy sigue siendo la fuente de conciliación; retiro diferido) y F5 punto 12 (CAMBIO con disposición diferida, decide administración) | ¿Se hace ahora o después de implementar el punto 12? ¿Quién decide el «pendiente de inspección»? |
| D4 | `pedidoOrigenId` opcional en venta libre | BRECHA-3 / EH-3: «confirmar con producto» | ¿Estaba en el diseño histórico? ¿Se aprueba? |
| D5 | El cierre **rechaza** pedidos no entregables y exige cobertura exacta de los asignados | Dominio congelado sin ADR | ¿ADR nuevo o addendum? ¿`cancelar`/`anular` deben soltar el pedido del embarque (cambia otro dominio)? |
| D6 | Sobrante de caja sobre un umbral exige nota (hoy solo el faltante) | `UMBRAL_MINIMO_FALTANTE_CAJA` | ¿Mismo umbral u otro? |
| D7 | Botón «El cliente pidió más → venta libre» en el paso de pedidos | VL-09/VL-A11 (la conciliación no sugiere venta libre ante un faltante) | Confirmar que, al ser declaración de exceso y no de faltante, cumple la regla |
| D8 | Señales «Para revisar» registradas para `/casos` | `alertas-detector` ciego a ventas libres (#302) | ¿Se amplía el detector o solo la pantalla en la Fase A? |

---

## 8. Riesgos y qué no se toca
- No se crea un modelo `VentaLibre` ni un segundo sistema de alertas (guardrails de `VENTA_LIBRE_AUDITORIA` §5).
- No se reintroduce pedido hijo; no se cambia la semántica de `embarqueOrigenId` ni `Pago.embarqueId`.
- Una señal nunca se convierte sola en deuda ni bloquea el cierre.
- Mantener dos pantallas de cierre (flag) tiene costo; el flag se retira cuando el PO valide.

## 9. Cómo se verificó y límites
- Entorno: Postgres 16 local sin Docker; `db push` no aplica migraciones, por lo que se crearon a mano `pg_trgm`, `unaccent`, `search_clientes` y las secuencias. **Las restricciones CHECK y triggers de las migraciones no estaban**; resultados que dependan de ellas deben reconfirmarse (p. ej. el sobrepago de una venta libre: en producción lo frenaría `chk_pedido_montopagado_le_total`, probablemente con un 500).
- Los hallazgos de #448 y #449 se confirmaron con **cierres reales**; conviene que el equipo los reproduzca en un entorno con todas las migraciones.
- **Consultas de solo lectura sugeridas en producción:** pedidos `ENTREGADO` con `total = 0`; pedidos `EN_RUTA` con `embarqueId` de un embarque `CERRADO`; embarques cerrados con `sobranteFaltante > 0` sin justificación.
- No se pudo correr la suite E2E del repo (el Chromium instalado no coincide con la versión que pide Playwright); la navegación se hizo con scripts propios. La lógica propuesta se probó solo con tests unitarios del código descartado temporalmente.

### Correcciones a mis afirmaciones anteriores
- El rechazo del servidor **sí llega** al usuario, pero recién al pulsar «Confirmar» (toast); lo que falla es el Preview, que lo disfraza.
- El «0» suelto del panel de cliente era transitorio (carga).
- Un posible bug de «pago que no se guarda» era un error de mi script; se descartó.

## 10. Índice
- Épica: **#447**. Hallazgos nuevos: #443, #444, #445, #446, #448, #449, #450. Previos relacionados: #326, #436, #437, #438, #433, #439, #300, #301, #302, #311, #429, #130.
- Documentos base: `docs/pedidos/PR1_INTEGRIDAD_ENTREGA_PARCIAL_v3.md`, `PEDIDOS_PENDIENTES_DECISION_PO_v1.0.md`, `VENTA_LIBRE_AUDITORIA_CONTRATO_CODIGO_v1.0.md`, `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md`, `fase5-n2-flujo-plan.md`, `docs/adr/ADR-PAGO-EMBARQUE-CAPTURA-001.md`, `ADR-SUSTITUCION-001.md`, `ADR-MIGRACION-001.md`, `docs/AGUA_BAMBU_F5_CONVERGENCIA_SEMANTICA_FISICA_v1.0.md`, `docs/embarques/00-plan-frontend-completo.md`, `01-ux-contract.md`, `PENDIENTE.md`.
