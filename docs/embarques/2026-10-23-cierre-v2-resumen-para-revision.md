# Cierre de embarque V2 — Problema, definición, soluciones y propuesta de UI/UX

- **Fecha:** 2026-10-23 · **Rama:** `ccr-e3a79cc5-06g3q9` · **Épica:** #447
- **Estado:** análisis, verificación y diseño. **No hay código implementado.** Se necesita la decisión del equipo (ver §10).
- **Maqueta navegable (9 pantallas, privada):** https://claude.ai/artifact/Qo6tjTtSGQCi58i5M5WioU
- **Audiencia:** equipo técnico y PO. Cada afirmación indica su origen (documento, código, prueba o issue). Lo que es **decisión nueva** o **supuesto** está marcado.

## Índice
1. Resumen ejecutivo
2. Problema
3. Definición vigente (lo que ya estaba decidido)
4. Ejemplos cotidianos
5. Casos adversariales verificados
6. Soluciones
7. Propuesta de UI y UX
8. Plan por fases y criterios de aceptación
9. Riesgos y lo que no se toca
10. Decisiones (PO, diseño y pendientes del equipo)
11. Cómo se verificó, límites y correcciones
12. Índice de issues y documentos

---

## 1. Resumen ejecutivo

1. Las **reglas de fondo ya estaban definidas y resueltas en backend**: entrega parcial (PR-1), exceso/incompleto (B-12), corrección y nueva demanda (G11, PR #206), venta libre como operación aparte, dinero de la misión (PR-2).
2. Lo que **no estaba resuelto es la pantalla del cierre** (`/embarques/[id]/cerrar`): sigue la Fase 7, con tres botones «Completo / Parcial / No entregado» independientes de las cantidades.
3. Lo definido sobre «el cliente acepta menos / pide más» está escrito **para el Hub de Pedidos**, apagado en producción (`NEXT_PUBLIC_PEDIDOS_V2=false`, AGENTS.md #28), no para el cierre.
4. Se hallaron **defectos de integridad con dinero** en el cierre, verificados con cierres reales: pedido cancelado cerrado como entregado (#448), pedido omitido huérfano y cobro perdido como «sobrante» (#449), venta libre fiada que tapa un faltante (#450).
5. Hay **incumplimientos de lo ya aprobado**: el cuadre de caja se recalcula en el cliente y no suma, cuando la Fase 7 exige el número autoritativo del preview (#437).
6. Se proponen cambios de pantalla (entrega derivada, dinero, frescura, revisión con señales, venta libre con buscador) y de servidor (requieren ADR, el backend de embarques está congelado).
7. Ejecución en tres fases: **A** pantalla sin tocar dominio, **B** servidor con ADR, **C** corrección y cambios.
8. Ocho puntos modifican o refinan decisiones previas y necesitan decisión explícita (§10.3).

---

## 2. Problema

### 2.1 Entrega del pedido en el cierre (UI ≠ UX)
- El selector «Completo / Parcial / No entregado» es **independiente de las cantidades**. «Completo» queda marcado aunque «Entregó» sea 5 de 10. `wizard-gating.ts::pasoPedidosValido` solo valida pago ≤ entregado. (#443)
- El servidor sí rechaza (`ENTREGA_INCOMPLETA`, B-12), pero el **Preview** muestra el 400 como «⚠️ Estimado local (sin verificar)» con totales en $0, igual que una falla de red. El mensaje real solo aparece al pulsar «Confirmar». (#443)
- Tres caminos para decir casi lo mismo: «Parcial con 0» → `PENDIENTE`; «No entregado» → `NO_ENTREGADO`; «Parcial con 10 de 10» → `ENTREGADO`.
- **No hay forma de expresar la causa** de la diferencia: otra visita, el cliente acepta menos (10→5), el cliente pide más (10→15) o canceló el resto. `NO_ENTREGADO` no pide motivo.
- Se muestran «Bot. Fab» y «Bot. Dom» aunque el pedido tiene solo una.

### 2.2 Dinero y cuadre
- La UI muestra una línea suelta («Obligación | Ya pagado | Cobrado ahora | Saldo pendiente»). No dice que lo que queda **se vuelve fiado ni de quién**.
- El cuadre de caja **no suma**: «Total vendido (efectivo) $38.600 − fiado 13.400 − gastos 23.000 + base 20.000» ≠ «Debió entregar $12.600». La primera línea es `efectivoEsperado + gastos` y se resta el fiado de más. (#437)
- La conciliación muestra «+2» por fila y el pie dice «sin discrepancias»; la suma local cuenta solo faltantes y no resta `cambios`. El servidor suma faltantes + sobrantes. (#437)
- Los **precios llegan vacíos** (el endpoint `?full=true` no devuelve `precio*`) (#436). El aviso «El cliente pagará menos/más» es **falso**: el servidor guarda el precio pero no recalcula `total`. Borrar el campo envía `0` y un ADMIN lo guarda. (#326)
- Cada visita al Preview consume números de pedido y de factura (`FAC-00002 → FAC-00009`). (#438)

### 2.3 Cambios (conciliación)
- «Cambios» es un **contador tecleado** sin cliente, pedido ni evidencia. `conciliarProductos` lo toma solo de `productosRetorno[].cambios`; no lee las Sustituciones. Con `cambios=3` sin sustitución la discrepancia baja de 5 a 2 unidades y de $14.000 a $5.600. (#446)
- Existe el flujo correcto (ADR-SUSTITUCION, pestaña Físico) pero obliga a digitar de nuevo el mismo número en el cierre.

### 2.4 Venta libre en el cierre
- El cliente se elige con un `<select>` de **solo nombre**, alimentado por `GET /api/clientes?all=true`: sin búsqueda, apellido, teléfono ni tienda. El buscador de Pedidos sí lo tiene. (#445)
- No muestra precio, total ni saldo: solo «Total pagado».
- El servidor acepta **CONSUMIDOR_FINAL sin pago** (viola la regla V4) y **clientes bloqueados** fiados; ignora los precios especiales (`resolverPrecio(…, null, null)`); no admite `negocioId` ni `pedidoOrigenId`. (#445)
- Con 0 unidades y pago, el pago se **descarta en silencio**. (#444)

### 2.5 Integridad con datos desactualizados (verificado con cierres reales)
| Situación | Resultado |
|---|---|
| Pedido **CANCELADO** que sigue asignado al embarque | Se cierra `ENTREGADO`, `total=0`, factura `PAGADA $0`; sus unidades cuentan como entregadas y tapan faltantes (#448, P0) |
| Pedido **omitido** del cierre | Queda `EN_RUTA` con `embarqueId` de un embarque `CERRADO` (huérfano) (#449, P0) |
| Pedido que **salió del embarque** con cobro tecleado ($9.000) | El cobro se descarta; con el efectivo declarado, la caja registra «sobrante» +$9.000 (#449, P0) |
| `pedidoId` inexistente / ajeno / duplicado | 200 (ignorado) / 200 (procesado dos veces) (#444) |

### 2.6 Fraude y señales
- Una **venta libre fiada** a un cliente real baja la discrepancia a 0: el faltante se convierte en deuda de un cliente que no lo sabe, sin señal. (#450)
- Igual efecto con `cambios` tecleados (#446), pedidos cancelados cerrados como entregados (#448) y ventas libres idénticas repetidas (200 filas aceptadas en 3,3 s).
- Un sobrante de caja grande se acepta sin explicación (solo se pide justificar el faltante).

### 2.7 Entradas inválidas (500 y límites) (#444)
Método de pago inventado, cliente inexistente de venta libre, 99.999 unidades y gasto de $99.999.999.999 → **500**. Se aceptan: `obs` de 2 MB, 70 gastos idénticos, `productos` repetidos, retornos mayores a lo cargado (`disc=55`), pagos con decimales.

---

## 3. Definición vigente (lo que ya estaba decidido)

| Tema | Definición | Fuente | Estado |
|---|---|---|---|
| Entrega parcial | El pedido conserva `total`/`totalPagado`; lo no entregado queda **pendiente en el mismo pedido**; sin pedido hijo (6 + 4 = 10) | `docs/pedidos/PR1_INTEGRIDAD_ENTREGA_PARCIAL_v3.md` | Implementado |
| `COMPLETO` / exceso / `NO_ENTREGADO` | `COMPLETO` exige acumulado = pedido; `ENTREGA_EXCEDE_PEDIDO`; `NO_ENTREGADO` = 0 unidades nuevas | B-08, B-12; `docs/incidentes/PR1BC_ENTREGA_FISICA_VIVA_2026-10-14.md` | Implementado |
| Corrección vs nueva demanda | **Corrección** de un error de captura: `AjustarPedidoCantidadUseCase`; guards: no sobre cantidad ya entregada, no pedido cerrado, no sobrepago; recalcula total/saldo/estadoPago/factura. **Nueva demanda** = `Pedido` nuevo con `pedidoOrigenId`. Pedido hijo no se reintroduce | `PEDIDOS_PENDIENTES_DECISION_PO_v1.0.md` §2 (PO 2026-09-06); PR #206 | Implementado; UI solo en Hub V2 (apagado) |
| Frontera «completar pendiente / nueva demanda / venta en ruta» | Declaración explícita del usuario, nunca inferencia | `docs/pedidos/fase5-n2-flujo-plan.md` P4 | Solo Hub de Pedidos |
| Venta libre | Operación de ruta que **no modifica** el pedido («20 + 5, nunca pedido modificado a 25»); consumidor final = **elección explícita**; el cierre del admin es «registrada en conciliación» (registrador ≠ responsable operativo); una diferencia de conciliación **no** se cuadra con una venta libre | `VENTA_LIBRE_AUDITORIA_CONTRATO_CODIGO_v1.0.md`, `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` (VL-03, VL-05, VL-09, VL-A09, VL-A11, VL-A12) | Contrato vinculante; BRECHA-2/3/4/6/8 abiertas |
| Dinero de la misión | `cuadre.pagos` = dinero **nuevo** de la misión; `Pago.embarqueId`; `PAGOS_EXCEDIDOS`; sin prellenado | `docs/adr/ADR-PAGO-EMBARQUE-CAPTURA-001.md` (rev.6) | Implementado |
| Sustituciones | 2 movimientos físicos (RETORNO + ENTREGA) + `Sustitucion` con `pedidoId?` y `motivo?`; UI en pestaña Físico | `ADR-SUSTITUCION-001`, `docs/embarques/01-ux-contract.md` §4 | Implementado |
| CAMBIO (semántica) | Cantidad reclamada ≠ repuesta; disposición diferida («pendiente de inspección»); decide administración | `docs/AGUA_BAMBU_F5_CONVERGENCIA_SEMANTICA_FISICA_v1.0.md` punto 12 | Decisión **cerrada**, brecha P1 **sin implementar** |
| Cierre = wizard | Pasos forzados; preview autoritativo; «calculos local solo como fallback offline etiquetado»; **el preview no es compuerta dura si falla (red/timeout/2G)**; no bloquear el cierre por casos abiertos | `00-plan-frontend-completo.md` Fase 7; `PENDIENTE.md` (PO 2026-08-29) | Implementado con divergencias (§2) |
| Backend de embarques | Congelado: no tocar dominio ni use-cases sin ADR | `ONBOARDING-EQUIPO.md`, `PENDIENTE.md` | Vigente |
| Precio corregido en el cierre | Sin regla escrita sobre su efecto en `total`/factura | Issue #326 | **Pendiente** |

**Reglas ya decididas que esta propuesta respeta:** la conciliación nunca sugiere una venta libre ante un faltante (VL-09, VL-A11); una señal no es acusación ni deuda automática (VL-A15); no se reintroduce pedido hijo; no se crea modelo `VentaLibre` ni un segundo sistema de alertas.

**No se encontró definido en ningún documento:** derivar el estado de entrega de las cantidades · el panel «queda por cobrar → fiado» · bloquear ante un 4xx del preview · frescura del cierre · revisión con señales · buscador y tienda en venta libre del cierre · «cambios» atribuidos a un cliente · `pedidoOrigenId` en venta libre (BRECHA-3/EH-3 lo deja como «confirmar con producto»).

---

## 4. Ejemplos cotidianos

1. **Parcial («no me cupo todo»).** Marta pidió 10 pacas de hielo; Yesid lleva 6. Hoy se marca «Parcial» a mano y, si queda «Completo», el servidor rechaza al final. Propuesta: escribir 6, ver «faltan 4» y elegir qué pasa con ellas.
2. **Acepta menos.** Carlos pidió 10 ($23.000); al llegar dice «con 5 me alcanza». Corrección G11 con motivo: 10→5, $23.000→$11.500. Si ya había pagado todo, no se corrige solo (devolución/saldo a favor). Si ya se le entregó algo de ese producto, tampoco.
3. **Pide más.** La tienda pidió 10 y recibe 15. El campo se detiene en 10; las 5 extra son una venta libre aparte, sin tocar el pedido.
4. **Dinero.** $23.000, adelanto $3.000, paga $10.000 → «queda por cobrar $10.000 → fiado de Carlos»; el repartidor debe entregar $10.000 en efectivo por este pedido. Con prepago completo y 6 de 10 entregadas: «Pagado completo»; las 4 que faltan siguen pagadas.
5. **Cambios.** Una paca rota a Marta: se registra con producto, cantidad, **cliente**, motivo y autor; el «1» de conciliación aparece solo.
6. **Venta libre.** Alguien compra 2 pacas en la calle: buscador por tienda o teléfono, total y saldo a la vista; si no es cliente, «Venta al paso» con pago completo.
7. **Rechazo.** «Completo» con 5 de 10: el Preview muestra el motivo real y bloquea. Sin señal, «estimado local» y se puede confirmar.
8. **Pedido cancelado.** María cancela #226 mientras otro asistente cierra: aparece «Cancelado — no se entrega»; hoy se cerraría como entregado con $0.

---

## 5. Casos adversariales verificados

Método: servidor local + Postgres real; `/cerrar/preview` (dry-run con rollback) y `/cerrar` real en embarques de prueba.

| # | Caso | Hoy (verificado) | Issue |
|---|---|---|---|
| 1 | Pedido cancelado asignado | Cierre real → `ENTREGADO`, total $0, factura $0; cuenta como entregado | #448 |
| 2 | Pedido omitido | Queda `EN_RUTA` en embarque `CERRADO` | #449 |
| 3 | Pedido sale del embarque con cobro tecleado | Cobro perdido → «sobrante» | #449 |
| 4 | Pedido retirado por el cliente durante el cierre | Se ignora en silencio | #449 |
| 5 | Pedido editado a otra cantidad | 400 claro al previsualizar | — (ya correcto) |
| 6 | Cierre repetido, mismo `offlineId` / otro `offlineId` | `deduped` / 400 «ya cerrado» | — (ya correcto) |
| 7 | Roles: REPARTIDOR, CONTADOR | 403 | — (ya correcto) |
| 8 | Pago mayor al saldo | 400 `PAGOS_EXCEDIDOS` | — (ya correcto) |
| 9 | Venta libre fiada tapa faltante | Discrepancia 0 | #450 |
| 10 | Venta libre `CONSUMIDOR_FINAL` sin pago | Aceptada | #445 |
| 11 | Venta libre fiada a cliente bloqueado | Aceptada | #445 |
| 12 | Venta libre 0 unidades con pago | Pago descartado | #444 |
| 13 | Venta libre: cliente inexistente / 99.999 unidades / método inventado | 500 | #444 |
| 14 | Gasto $99.999.999.999 | 500 | #444 |
| 15 | `obs` 2 MB · 70 gastos iguales · 200 ventas libres iguales · `productos` repetidos | 200 | #444 |
| 16 | Retornos mayores a lo cargado | 200 (`disc=55`) | #444 |
| 17 | `cambios=3` sin sustitución | 200; baja la discrepancia | #446 |
| 18 | Precio de ADMIN en $0 o $1 | Se guarda; la deuda no cambia | #326 |
| 19 | Sobrante de caja grande | Aceptado sin explicación | #449 |
| 20 | Cierre en cola rechazado al sincronizar | Va a la cola de fallidos con motivo | — (visibilidad) |

---

## 6. Soluciones

### 6.1 Principios
1. **Una pantalla, una decisión.** Cada tarjeta dice qué pasó y qué pasa después.
2. **Nada silencioso ni ambiguo.** Toda diferencia tiene causa explícita; ningún dato se descarta sin avisar.
3. **El dinero muestra su consecuencia** (fiado, de quién, cuánto).
4. **Frescura.** El cierre trabaja sobre una versión; si algo cambia, se avisa y se actualiza sin perder lo tecleado.
5. **Señal, no acusación.** Lo sospechoso se muestra en «Para revisar» y no bloquea ni crea deuda (VL-A15).
6. **Lo ya definido manda.** Se reutilizan G11, el buscador de Pedidos y las Sustituciones.

### 6.2 Soluciones por problema
| Problema | Pantalla (Fase A) | Servidor (Fase B/C) |
|---|---|---|
| 2.1 Entrega ambigua | Estado **derivado** de las cantidades (Pidió · Ya entregado · Entrega ahora · Falta); decisión obligatoria sin opción por defecto si queda pendiente; «Siguiente» deshabilitado con el motivo | — (backend ya correcto) |
| 2.1 Acepta menos | Opción «El cliente ya no quiere el resto»: motivo + antes/después (reutiliza `correccion-cantidad-form` y `ajustar-cantidad/preview`) | Ya existe `ajustar-cantidad` con guards G11 |
| 2.1 Pide más | Campo con tope en el pendiente; botón «El cliente pidió más → venta libre» | `pedidoOrigenId` opcional en venta libre (ADR, Fase B) |
| 2.1 Rechazo del preview | 4xx: recuadro con el motivo y «Confirmar» deshabilitado; «estimado local» solo para red/5xx | — |
| 2.2 Dinero | Panel por pedido: valor · ya pagado · cobrar ahora («cobrar el saldo») · **queda por cobrar → fiado de X** · efectivo a entregar | — |
| 2.2 Cuadre y conciliación | Líneas que suman; un solo número de diferencia (faltantes + sobrantes, restando cambios); precios precargados (#436) | Añadir `precio*` al `select` del endpoint (aditivo) |
| 2.2 Precio | Solo lectura hasta el ADR; luego corrección con **nuevo total y saldo visibles** | ADR-MONETARIO-001: recalcular `PedidoItem`, `Pedido.total/saldo`, `Factura` |
| 2.3 Cambios | Solo lectura = Σ sustituciones (cliente/pedido, motivo, autor); «+ Registrar cambio» exige cliente | `cambios` = Σ sustituciones (ADR; ver D3) |
| 2.4 Venta libre | Buscador de Pedidos (cliente + tienda), precio/total/saldo, un solo «Botellón», «Venta al paso», bloqueos de crédito y pago sin productos | Anónimo exige pago completo; crédito con excepción F2; precios especiales; `negocioId`; 400 en vez de 500 |
| 2.5 Datos desactualizados | Escuchar realtime; aviso «Cambió mientras cerrabas» con detalle; pedidos cancelados/retirados bloqueados; cobro tecleado en pedido que salió → enlace a Fiados | 409 `PEDIDO_NO_ENTREGABLE`, `PEDIDOS_SIN_RESOLVER`, `PEDIDO_FUERA_DEL_EMBARQUE` (ADR); decidir si `cancelar`/`anular` sueltan el pedido del embarque |
| 2.6 Fraude | «Para revisar» con señales (venta libre fiada que compensa faltante, pedido corregido a la baja, sobrante sin explicar, cambios sin pedido) | Señal para `/casos`; venta libre fiada visible para el cliente y disputable (`resolver-disputa` ya existe) |
| 2.7 Entradas inválidas | Topes visibles, aviso de gasto idéntico repetido, solo enteros en pesos | Topes y 400 (enum de categorías, longitud de `obs`, máximo de filas, `productos` sin duplicados) |

---

## 7. Propuesta de UI y UX

### 7.1 Flujo del wizard (sin cambiar los 5 pasos de la Fase 7)
`1 Pedidos → 2 Ventas libres → 3 Conciliación → 4 Gastos → 5 Revisión y confirmar`. Se puede volver atrás, no saltar adelante. «Siguiente» se deshabilita **siempre con el motivo visible** al lado.

### 7.2 Pantalla 1 — Entrega por línea, estado derivado
```
#11 · Carlos Gómez                              [ Entrega parcial · faltan 5 ]
Pedido de 10 pacas de agua · valor $23.000 · debe $23.000

 Producto        Pidió   Ya entregado   Entrega ahora        Falta
 Paca de agua     10         0         [ − ]  5  [ + ]        5

¿Qué pasa con las 5 que faltan?  (elige una para continuar)
 ( ) Se entregan en otra visita
     El pedido queda pendiente y se puede reprogramar. No cambia lo que debe ($23.000).
 ( ) El cliente ya no quiere el resto
     Se corrige el pedido a 5 pacas: baja de $23.000 a $11.500. Pide motivo y queda auditado.

 Pedido #11: quedan 5 unidades sin entregar. Elige qué pasa con lo que falta.   [Siguiente → deshabilitado]
```
- Máximo de «Entrega ahora» = pendiente. Atajos: «Todo (10)» y «No entregué (0)».
- Con 0 entregado: motivo (no estaba / rechazó / sin dinero / otro) + reasignar a otro embarque abierto.
- Una sola línea «Botellón» (usa la columna Fab o Dom que el pedido realmente tiene).

### 7.3 Pantalla 2 — Corrección y exceso
```
A. El cliente acepta menos (10 → 5)
   Motivo (obligatorio): [ El cliente cambió la cantidad ▾ ]   Nota: [ Llamó a las 9:40 ]
   Antes:   10 pacas · $23.000 · pagado $0
   Después:  5 pacas · $11.500 · pagado $0 · debe $11.500
   Autoriza: tú (ADMIN/ASISTENTE). Si ya pagó más que el nuevo total, no se corrige solo:
   se explica el dinero a devolver o el saldo a favor.            [ Aplicar corrección ]

B. El cliente pide más (10 → 15)
   Paca de agua  10  0  [ − ] 10 [ + deshabilitado ]  0
   [ El cliente pidió más → venta libre ]   (misma persona/tienda; vinculada al pedido en Fase B)
```

### 7.4 Pantalla 3 — Dinero del pedido
```
Valor del pedido                                $23.000
Ya pagado antes (prepago)                        $3.000
Por cobrar hoy como máximo                      $20.000
Cobrar ahora:  [Efectivo] [Nequi] [Transferencia]  [ $10.000 ]    Cobrar el saldo ($20.000)

┌──────────────────────────────┐   Efectivo que debe entregar el repartidor por este pedido: $10.000
│ Queda por cobrar  $10.000    │   Cobrado por medios digitales: $0 (se verifica después)
│ → fiado de Carlos Gómez      │
└──────────────────────────────┘
(Prepago completo y 6 de 10 entregadas:  «Pagado completo» — las 4 que faltan siguen pagadas)
```
El campo de cobro se detiene en el saldo (`PAGOS_EXCEDIDOS`); los digitales se marcan «REPORTADO».

### 7.5 Pantalla 4 — Venta libre con buscador
```
Cliente:  [ esquina ]
  Doña Marta Ruiz                              (Debe $5.400)
  Tienda La Esquina · Cra 5 # 10-20 · 310 111 0003 · 1 negocio

Paca de agua · $2.800 c/u [ 2 ]   Paca de hielo [ 0 ]   Botellón [ 0 ]
Total $5.600 · Pago Efectivo $5.600                      → Pagado completo

[x] Venta al paso (sin cliente): pago completo obligatorio; cuenta como venta libre a domicilio,
    no suma a Punto; visible en el control antifraude por repartidor.
Bloqueado: [Cliente bloqueado] con saldo → no se permite hasta una excepción de crédito (Fase B).
```
Mismo buscador de Pedidos (`useClienteSearch` + `ClienteResultado`): nombre, apellido, tienda, teléfono, contacto, sin tildes.

### 7.6 Pantalla 5 — Conciliación y cambios (Fase C)
```
Producto       Cargado  Entregado  Devueltas  Cambios         Filtradas  Diferencia
Paca de agua      8         5       [ 1 ]     2 (ver abajo)    [ 0 ]        0

Cambios de esta ruta (2)                                   [ + Registrar cambio ]
 Paca de agua · 1 · Carlos Gómez · pedido #11 · Bolsa rota · Asistente
 Paca de agua · 1 · Doña Marta · sin pedido en esta ruta · Reclamó una de ayer · Asistente

Registrar cambio:  Producto · Cantidad · ¿A quién? (obligatorio, buscador de clientes) · Motivo
```
La conciliación nunca sugiere una venta libre ante un faltante (VL-09). La etiqueta «Filtradas» para `rotas` es una brecha ya registrada (F5 punto 10).

### 7.7 Pantalla 6 — Cambió mientras cerrabas
```
[ Cambió mientras cerrabas (hace 2 min) ]                     [ Actualizar sin perder lo tecleado ]
 • #227 salió del embarque. Habías anotado un cobro de $9.000.
 • #226 fue cancelado por María López · Asistente, 10:41.
 • #229 se agregó al embarque: falta resolverlo.
Sobre el cobro de $9.000 del #227: no se puede registrar aquí. Regístralo en Pedidos › Fiados.
  [ Abrir Fiados de Carlos Gómez ]

#226 Cancelado — no se entrega (sin entrega, dinero ni factura)
#228 Retirado por el cliente — ya entregado, fuera del embarque
#229 Nuevo en el embarque — resuélvelo como cualquier otro pedido
Siguiente deshabilitado: el embarque cambió. Pulsa «Actualizar».
```

### 7.8 Pantalla 7 — Revisión antes de confirmar
```
[ El servidor no puede cerrar así ]  El pedido #11 no está completo (5 de 10).   [ Ir al pedido #11 ]
   (solo ante un 4xx; sin señal se muestra «Estimado local (sin conexión)» y se puede confirmar)

Cuadre de caja (cada línea suma)             Ventas de la ruta
 Efectivo cobrado en pedidos        $10.000    Pedidos entregados        2 de 3
 Efectivo cobrado en ventas libres   $5.600    Ventas libres             1 · $5.600
 = Efectivo cobrado                 $15.600    Total vendido             $29.000
 (−) Gastos                        − $23.000   Cobrado                   $15.600
 (+) Base                          + $20.000   Queda por cobrar (fiado)  $13.400
 = Debe entregar en efectivo        $12.600    Mercancía: 8 cargadas · 8 entregadas · 0 de diferencia
 Dinero que entregó: [ $12.600 ]  → Cuadre perfecto

Para revisar (señales, no acusaciones: no impiden cerrar)
 • Ventas libres fiadas compensan faltante: 5 unidades a Carlos Gómez; sin ellas faltarían 5.
 • Pedido corregido a la baja: #11 de 10 a 5 · motivo · autorizó María López.
 • Sobrante de caja de $9.000 sin explicar: puede ser un cobro sin registrar.
 • Cambios sin pedido en esta ruta: 1 paca a Doña Marta.
```

### 7.9 Pantalla 8 — Móvil, sin señal y borrador
- Stepper de 56 px, botones ≥ 44 px, tarjetas apiladas, barra inferior fija con «Queda por cobrar → fiado» y «Siguiente».
- «Borrador recuperado» (continuar / empezar de nuevo) y franja «Sin conexión: tu trabajo se guarda en el teléfono; el cierre se enviará solo».
- Si un cierre en cola es rechazado al sincronizar: aviso persistente «Tu cierre de las 10:12 fue rechazado: motivo» con botón para abrirlo (hoy va a la cola de fallidos).

### 7.10 Estados, microcopy y accesibilidad
- **Estados de red** (contrato de la Fase 5): loading, success, offline (borrador + cola), error (4xx con motivo / red con reintento).
- **Errores de dedo:** los campos numéricos se detienen en el máximo y lo dicen («Máx. $20.000»); solo enteros en pesos; teclado numérico.
- **Dos personas en el mismo cierre:** aviso en vivo «María también está cerrando este embarque» (el lock de cierre ya protege).
- **Si ya se cerró:** redirige al detalle con «Se cerró a las 10:12 por María».
- Elementos reales (`button`, `label`), contraste ≥ 4,5:1, el estado nunca depende solo del color, `scrollIntoView` al enfocar un campo en móvil.

---

## 8. Plan por fases y criterios de aceptación

| Fase | Contenido | ¿Toca dominio? |
|---|---|---|
| **A** (1 rama = 1 PR; flag `NEXT_PUBLIC_CIERRE_V2` OFF) | Entrega derivada y decisión de pendiente; panel de dinero; frescura y borrador; revisión y señales; preview 4xx; venta libre con buscador/total/bloqueos/botellón único; #436 (precios), #437 (cuadre) | No |
| **B** (ADR addendum de embarques y de ADR-MONETARIO-001) | #448, #449, #444, reglas de #445 (anónimo, crédito con excepción, precios especiales, `negocioId`, `pedidoOrigenId`), umbral de sobrante, recálculo por corrección de precio (#326) | **Sí** |
| **C** | Corrección «ya no quiere el resto» desde el cierre; `cambios` = Σ sustituciones (#446) | Sí (ADR) |

**Criterios de aceptación**
- E2E del cierre para: 10→5 (otra visita / ya no quiere el resto), 10→10, 10→0 con motivo, 10→15 (venta libre), prepago + parcial, fiado, venta libre con búsqueda de tienda y venta al paso, cambio atribuido, pedido cancelado/retirado/agregado durante el cierre, rechazo del servidor en el preview, borrador recuperado y cierre sin señal.
- Cada hallazgo (#443–#450) con su **prueba en rojo** antes del fix; pruebas de integración contra Postgres real para las reglas de servidor.
- Ninguna pantalla afirma algo que el backend no hace; ninguna entrada produce 500.
- Flujo de entrega del repo: validación local (`tsc`, `eslint`, `vitest`), rebase sobre `main`, un PR por fase, migraciones aplicadas antes de mergear.

---

## 9. Riesgos y lo que no se toca
- No se crea un modelo `VentaLibre` ni un segundo sistema de alertas; no se reintroduce pedido hijo; no se cambia la semántica de `embarqueOrigenId` ni de `Pago.embarqueId`.
- Una señal nunca se convierte sola en deuda ni bloquea el cierre.
- Mantener dos pantallas de cierre (flag) tiene costo; el flag se retira cuando el PO valide.
- **Métricas de Punto:** las ventas «punto» se miden por `Pedido.canal`; toda venta libre nace `DOMICILIO`. Reclasificar la «venta al paso» como `PUNTO` inflaría Punto y cambiaría precios y columna del botellón: **no se hace**. Un anónimo con saldo sería deuda invisible (excluido de Fiados y contadores): por eso exige pago completo.

---

## 10. Decisiones

### 10.1 Tomadas por el PO (2026-10-23)
1. Precio en el cierre: **corrección con recálculo** de la obligación (requiere ADR-MONETARIO-001; #326).
2. Venta libre fiada a cliente bloqueado o sobre límite: **permitir con excepción autorizada** (F2); la Fase A solo bloquea y explica.
3. Venta libre a `CONSUMIDOR_FINAL`: se permite como «Venta al paso» con pago completo, sin cambiar `canal` ni `origen` (análisis en #445).

### 10.2 Tomadas en el diseño (revertibles)
4. «El cliente ya no quiere el resto»: ADMIN y ASISTENTE (como ya permite el endpoint), motivo obligatorio, auditado, con guards G11.
5. Cambio a un cliente sin pedido en la ruta: permitido con cliente obligatorio.

### 10.3 Para decidir por el equipo (modifican o refinan algo ya definido)
| # | Propuesta | Decisión previa que toca | Pregunta |
|---|---|---|---|
| D1 | Un **4xx del preview bloquea**; «estimado local» solo ante red/5xx | PO 2026-08-29: «el preview NO es gate duro» | ¿Se acepta la refinación? (Un 4xx haría fallar igual el cierre real) |
| D2 | Estado de entrega **derivado** de las cantidades | Fase 7: «entregado/no entregado + productos + precios» | ¿Se reemplaza el selector manual? |
| D3 | `cambios` = Σ sustituciones; el contador legacy deja de ser editable | ADR-MIGRACION-001 (mirror legacy fuente de conciliación) y F5 punto 12 (disposición diferida, decide administración) | ¿Ahora o después del punto 12? ¿Quién decide la «inspección pendiente»? |
| D4 | `pedidoOrigenId` opcional en venta libre | BRECHA-3 / EH-3: «confirmar con producto» | ¿Estaba en el diseño histórico? ¿Se aprueba? |
| D5 | El cierre rechaza pedidos no entregables y exige cobertura exacta | Dominio congelado sin ADR | ¿ADR nuevo o addendum? ¿`cancelar`/`anular` deben soltar el pedido del embarque? |
| D6 | Sobrante de caja sobre un umbral exige nota | `UMBRAL_MINIMO_FALTANTE_CAJA` | ¿Mismo umbral u otro? |
| D7 | Botón «El cliente pidió más → venta libre» en el paso de pedidos | VL-09 / VL-A11 | Confirmar que, al ser declaración de exceso y no de faltante, cumple la regla |
| D8 | Señales «Para revisar» registradas para `/casos` | `alertas-detector` ciego a ventas libres (#302) | ¿Se amplía el detector o solo la pantalla en la Fase A? |

---

## 11. Cómo se verificó, límites y correcciones
- **Entorno:** Postgres 16 local sin Docker; `db push` no aplica migraciones, por lo que se crearon a mano `pg_trgm`, `unaccent`, `search_clientes` y las secuencias. **Faltaban las restricciones CHECK y triggers de las migraciones**: lo que dependa de ellas debe reconfirmarse (p. ej. el sobrepago de una venta libre, que en producción lo frenaría `chk_pedido_montopagado_le_total`, probablemente con 500).
- **#448 y #449** se confirmaron con cierres reales; conviene reproducirlos en un entorno con todas las migraciones.
- **Consultas de solo lectura sugeridas en producción:** pedidos `ENTREGADO` con `total = 0`; pedidos `EN_RUTA` con `embarqueId` de un embarque `CERRADO`; embarques cerrados con `sobranteFaltante > 0` sin justificación.
- No se pudo correr la suite E2E del repo (el Chromium instalado no coincide con la versión que pide Playwright); la navegación se hizo con scripts propios. No se ejecutó ningún test de código nuevo en el repo (la lógica de prueba de la Fase A se guardó aparte y no se usa).
- **Correcciones a afirmaciones anteriores:** el rechazo del servidor sí llega al usuario, pero recién al pulsar «Confirmar»; el «0» suelto del panel de cliente era transitorio; un presunto bug de «pago que no se guarda» fue un error del script de prueba y se descartó.

---

## 12. Índice de issues y documentos
- **Épica:** #447. **Hallazgos nuevos:** #443, #444, #445, #446, #448, #449, #450. **Relacionados:** #326, #436, #437, #438, #433, #439, #300, #301, #302, #311, #429, #130.
- **Documentos base:** `docs/pedidos/PR1_INTEGRIDAD_ENTREGA_PARCIAL_v3.md`, `PEDIDOS_PENDIENTES_DECISION_PO_v1.0.md`, `VENTA_LIBRE_AUDITORIA_CONTRATO_CODIGO_v1.0.md`, `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md`, `fase5-n2-flujo-plan.md`, `docs/adr/ADR-PAGO-EMBARQUE-CAPTURA-001.md`, `ADR-SUSTITUCION-001.md`, `ADR-MIGRACION-001.md`, `docs/AGUA_BAMBU_F5_CONVERGENCIA_SEMANTICA_FISICA_v1.0.md`, `docs/embarques/00-plan-frontend-completo.md`, `01-ux-contract.md`, `PENDIENTE.md`.
