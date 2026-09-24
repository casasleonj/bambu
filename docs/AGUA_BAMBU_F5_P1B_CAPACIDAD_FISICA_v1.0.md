# AGUA BAMBÚ — F5 P1-B: CAPACIDAD FÍSICA (custodia / pedidos asignados / venta libre / cumplimiento comercial)

**Versión:** 1.0
**Fecha:** 2026-09-16
**Responde a:** siguiente paso tras el cierre de P1-A — *"diseñar P1-B alrededor de una única autoridad física y resolver allí cómo se calculan las SALIDAS en tiempo real sin duplicar los movimientos que ya se registran al cierre."* **Cero código en este documento.**

---

## La pregunta central heredada de P1-A, resuelta aquí

**Decisión propuesta: `SALIDAS` en tiempo real se CALCULA en el momento que se necesita (lectura pura), nunca se ESCRIBE por adelantado.** No se extiende la escritura en vivo de `ENTREGA`/`VENTA_RUTA` a los 4 productos que hoy solo se registran al cierre — eso exigiría tocar `EntregarPedidoUseCase`/`venta-libre` (fuera de "cambio mínimo", y con el mismo riesgo de duplicación que el equipo pidió evitar: dos escritores para el mismo hecho físico, uno en vivo y otro al cierre, que tendrían que coordinarse para no contarse dos veces). En cambio, la disponibilidad física "ahora mismo" se **deriva por consulta**, combinando lo que ya es autoridad en cada momento:

| Producto | Autoridad de "cuánto ha salido" ANTES del cierre |
|---|---|
| `PROMOCION` (los 5 productos) | `EmbarqueMovimiento` — ya en vivo (PR #267, P0) |
| `BOTELLON` (`ENTREGA`/`RETORNO`) | `EmbarqueMovimiento` — ya en vivo (`botellones.service.ts`) |
| `DESCARTE`/`CUSTODY_TRANSFER` (los 5 productos) | `EmbarqueMovimiento` — ya en vivo (endpoint manual) |
| `ENTREGA`/`VENTA_RUTA` de `PACA_AGUA`/`PACA_HIELO`/`BOLSA_AGUA`/`BOLSA_HIELO` | **`Pedido`/`PedidoItem.cantEntrega`** — única autoridad que existe ANTES del cierre para este hecho (`EmbarqueMovimiento` para estos casos está vacío hasta que el embarque cierra, confirmado en P1-A/PR #264) |

Esto **no es una segunda fuente de verdad**: para cada tipo de movimiento, se lee la ÚNICA autoridad que ya existe en ese momento — nunca se inventa un valor nuevo, nunca se escribe nada. Al cerrar, `RegistrarMovimientosCierre` sigue escribiendo exactamente igual que hoy (sin tocar su código) — el cálculo en vivo de este documento deja de usarse en cuanto el embarque cierra (RECARGA, el único consumidor previsto, solo aplica a `ABIERTO`/`EN_RUTA`).

**Límite honesto, ya documentado en PR #264 §9 y reafirmado aquí, no resuelto de nuevo**: si un `Pedido` fue entregado parcialmente y luego `embarqueId` se liberó a `null` (comportamiento ya establecido de F4/PR-1), la lectura en vivo `WHERE embarqueId=X` ya no lo ve — esa porción entregada no se cuenta como "salida" en el cálculo en vivo. Efecto: la disponibilidad en vivo puede estar **ligeramente sobreestimada** en ese caso específico (nunca subestimada), nunca afecta la conciliación final del cierre (que sí usa la lista completa vía el wizard) ni ningún dato comercial. Es una aproximación aceptada para una validación no bloqueante — no un defecto de integridad financiera.

---

## Las 4 magnitudes — separadas, con su fórmula exacta

### (D) Cumplimiento comercial de Pedidos — sin cambios, límite que nunca se cruza

`Pedido.estadoEntrega` / `PedidoItem.cantEntrega` — exactamente como existen hoy. Este documento no lee estos campos para NADA que no sea derivar (A)/(B)/(C) como lectura de solo consulta; nunca escribe en ellos, nunca los reinterpreta.

### (A) Producto físicamente bajo custodia del vehículo (disponible ahora)

```
(A) = Σ EmbarqueCargaProducto.cantidad   [todas las EmbarqueCarga de este Embarque — CARGA + RECARGA, ya en vivo]
    − SALIDAS en tiempo real              [tabla de arriba]
    + RETORNOS ya resueltos en vivo        [hoy: solo botellón, vía EmbarqueMovimiento; los demás productos
                                             no tienen retorno vivo hasta el cierre — se suman como 0, consistente
                                             con el mismo límite ya documentado, no una brecha nueva]
```

### (B) Comprometido con pedidos ya asignados a este Embarque

```
(B) = Σ (PedidoItem.cantPedido − PedidoItem.cantEntrega)   para Pedido.embarqueId = este Embarque
```
**Nota técnica**: NO es lo mismo que `calcularPesoEmbarque()`/`calcularPacasEmbarque()` (`src/lib/embarque-capacidad.ts`), que ya existen pero sirven a un propósito distinto — calculan el peso/unidades **totales pedidos** (`cantPedido`, bruto) para validar capacidad AL MOMENTO DE ASIGNAR un pedido al embarque, no el **remanente** (`cantPedido − cantEntrega`) que hace falta para (B). Son fórmulas hermanas, no la misma — reutilizar el archivo existente (mismo patrón `cantidadProducto()`) pero como una función nueva, no modificar las 2 que ya existen (que siguen sirviendo su propósito original sin cambios).

### (C) Disponible para venta libre / venta en ruta — derivado, nunca almacenado

```
(C) = (A) − (B)
```
Igual que el ejemplo del equipo (40 capacidad, 25 comprometidas, 15 libres): (C) nunca es un campo propio, siempre se deriva de (A) y (B) en el momento de consultarlo. No hay ningún estado que persistir para esto.

---

## Forma técnica mínima propuesta

**Cero cambios de schema.** Las 4 magnitudes se derivan enteramente de tablas que ya existen (`EmbarqueCargaProducto`, `EmbarqueMovimiento`, `Pedido`/`PedidoItem`) — ninguna requiere una columna, migración, ni modelo nuevo.

Una única función nueva, pura y de solo lectura (sin side effects, sin escritura), en el mismo dominio de `embarque-capacidad.ts` o un archivo hermano — por ejemplo `calcularDisponibilidadFisica(tx, embarqueId): Promise<{ custodia: StockSnapshot; comprometido: StockSnapshot; disponibleVentaLibre: StockSnapshot }>` (usa el mismo tipo `StockSnapshot` ya existente en `embarque-capacidad.ts`, por producto). Implementación: 3 consultas de solo lectura (`EmbarqueCargaProducto.findMany`, `EmbarqueMovimiento.findMany` agrupado por tipo, `Pedido.findMany` con `items`/campos legacy) + la aritmética de arriba. Sin lock nuevo (es una lectura, no compite por ningún recurso — si se usa dentro de la validación de una recarga, corre bajo el lock que RECARGA ya vaya a adquirir, no necesita uno propio).

**Único consumidor previsto por ahora: la validación de capacidad de RECARGA (P1-C).** Este documento NO propone conectar esta función a `venta-libre` (que hoy no valida capacidad en absoluto, confirmado en PR #266) ni a ninguna otra ruta — sería ampliar el alcance más allá de lo pedido. Se deja registrado como una extensión futura posible, no como parte de este cambio.

---

## Qué NO se decide ni se toca en este documento

- No se modifica `RegistrarMovimientosCierre`, `CierreEmbarqueService`, ni ningún paso del cierre — siguen siendo la única autoridad del cierre final, sin cambios.
- No se escribe ningún `EmbarqueMovimiento` nuevo, ni se adelanta ninguna escritura que hoy ocurre al cierre.
- No se valida capacidad en `venta-libre` ni se agrega ningún gate nuevo a ningún flujo existente — esta función es de solo lectura, sin consumidor obligatorio todavía salvo RECARGA.
- No se resuelve el límite de pedidos-desasignados-tras-entrega-parcial (ya documentado, aceptado como aproximación no bloqueante).

## Resumen para decisión del equipo

| Pieza | Cambio | Migración |
|---|---|---|
| SALIDAS en tiempo real | Cálculo por lectura, combinando `EmbarqueMovimiento` (donde ya es autoridad) + `Pedido`/`PedidoItem` (donde `EmbarqueMovimiento` todavía no existe hasta el cierre) | No |
| (A)/(B)/(C) | Una función nueva, pura, de solo lectura | No |
| (D) | Sin cambios — límite reafirmado | No |

**Con esto, P1-B queda sin ninguna brecha de schema pendiente** — el trabajo de implementación es enteramente una función de dominio nueva, sin tocar nada existente. Listo para que el equipo confirme antes de pasar a P1-C (RECARGA), que es el primer y único consumidor previsto de esta función.
