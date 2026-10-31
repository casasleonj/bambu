# Activación del Pedido Hub — guía de encendido, vigilancia y reversa

Paso 8 de #345. Opción elegida con el PO (2026-10-26): **encender para todos con una ventana vigilada**, con la reversa ensayada de antemano. El Hub es el nuevo flujo de crear y consultar pedidos (`NEXT_PUBLIC_PEDIDOS_V2`).

> **Estado de este documento (2026-10-31):** la activación **se ejecutó** el 2026-10-26 y la ventana vigilada de 3 días **terminó sin reglas de parada**. El registro de lo ocurrido está en la sección 10. Las secciones 1 a 9 quedan como procedimiento reutilizable (por ejemplo, para encender «Entregar después» o el cierre V2) y para la reversa. Lo que no se ha verificado está marcado **(sin verificar)**.

## 1. Cómo funciona el interruptor

- `NEXT_PUBLIC_PEDIDOS_V2` se lee como `=== 'true'` (`src/lib/flags.ts`) y Next.js lo **fija al construir** la aplicación. Cambiar la variable en Vercel **no basta**: hay que redesplegar para que el cambio se vea.
- Vale para todos los usuarios a la vez. No existe encendido por usuario o por rol.
- Los demás interruptores son independientes y **siguen apagados** (no existen en Production):
  - `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` («Entregar después»).
  - `NEXT_PUBLIC_CIERRE_V2` (cierre de embarque V2).
- Hay un interruptor distinto, **en la base de datos** y no en Vercel: `Config.GESTION_ADMIN_SIN_EMBARQUE` (gestión temporal sin embarques, #472). Se cambia desde Configuración y surte efecto en la petición siguiente. No tiene que ver con este procedimiento.

## 2. Punto de partida (a confirmar siempre antes de tocar nada)

Desde el 2026-10-08 el interruptor estuvo en `"false"` en Production (variable `dqwoz62SlHQexlN3`, proyecto `bambu_demo_multimodelo`, dominio `portal.aguabambu.com`). Se confirmó el 2026-10-26 leyendo Vercel, antes del encendido. Desde el 2026-10-26 está en `"true"`.

## 3. Antes de encender

| # | Qué | Quién | Cómo |
|---|---|---|---|
| 1 | Confirmar el estado real: valor del interruptor en Production y último deploy en `READY` | Claude + PO | Vercel → proyecto → variables y deployments |
| 2 | `main` verde en lo que importa: Type check, pruebas, Integration y `E2E Hub (V2 ON)` | Claude | Último run de CI en `main` |
| 3 | **Línea base de integridad** | PO (ADMIN) | Con sesión de ADMIN en producción: `GET /api/integridad`. Alternativa: `npx tsx scripts/verificar-integridad.ts --json` con la `DATABASE_URL` de producción. Guardar el resultado con fecha y hora |
| 4 | **Ensayo de reversa** | Claude + PO | Redesplegar producción con el interruptor como está y medir el tiempo hasta `READY`. No cambia lo que ven los usuarios |
| 5 | Probar a mano en móvil y escritorio una venta rápida pagada y un pedido a un cliente | PO | Con el Hub en la vista previa |
| 6 | Nombrar quién vigila el primer día y cómo avisa | PO | Una persona del negocio que diga «algo se ve raro» |

**Sobre la línea base (paso 3):** la comparación del primer día solo cuenta los hallazgos **nuevos**, creados después de la hora de activación. Por eso se guarda el resultado con su fecha.

## 4. Encendido

1. Anotar la hora (Bogotá) y el commit de `main` que se despliega.
2. En Vercel, Production: `NEXT_PUBLIC_PEDIDOS_V2 = "true"`.
3. **Redesplegar el commit actual de `main`** y esperar a `READY`.
4. Prueba de humo: entrar con un ADMIN, ver la lista del Hub, hacer una venta rápida pagada **de verdad** y comprobar en la base de datos que queda con su pago.

## 5. Vigilancia

- **Cada pocas horas y al cierre del día:** `GET /api/integridad` y comparar con la línea base. Las reglas críticas son V1 (pagado + saldo = total), V3 (una factura por pedido con el mismo saldo), V4 (venta a CONSUMIDOR_FINAL con saldo), V10 (saldo a favor de CONSUMIDOR_FINAL) y V14 (pago de regularización contado en la caja de su fecha de registro). También importan V2, V5, V6, V8, V11, V15 y V16.
- **Mirar a mano** las primeras ventas rápidas reales: que cada una tenga su `Pago`, el estado de pago correcto y el precio esperado.
- **Los usuarios** avisan de cualquier cosa rara en pantalla, aunque parezca menor.

## 6. Reglas de parada

Heredadas de la regla del soak (`fase10a-preflight-informe.md`): **si ocurre cualquiera de estas, se apaga de inmediato, sin esperar el diagnóstico.**

- Una venta sin su pago, o con precio o saldo incorrecto.
- Saldo a cargo de `CONSUMIDOR_FINAL`.
- Un pedido duplicado.
- No se puede crear o cobrar un pedido y no hay forma de seguir trabajando.
- Cualquier hallazgo **nuevo** de severidad CRÍTICA en el verificador.

Cualquier persona del equipo puede pedir apagar. No hace falta acuerdo previo.

## 7. Reversa

Los mismos pasos, en sentido contrario:

1. `NEXT_PUBLIC_PEDIDOS_V2 = "false"` en Production.
2. Redesplegar el **mismo commit actual de `main`**. **No** promover un deploy antiguo: se perderían los arreglos posteriores (decisión ya tomada el 8 de octubre).
3. Esperar a `READY` y comprobar que `portal.aguabambu.com` muestra la UI de pestañas.
4. Avisar al equipo y anotar la hora y el motivo.

**Tiempo de reversa medido: unos 2 minutos** (ensayo del 2026-10-26: 2 min 20 s hasta `READY`; el redespliegue del encendido tardó 1 min 58 s). La reversa **no se ha usado** en producción.

**Qué pasa con lo creado con el Hub (sin verificar):** el Hub y el formulario antiguo crean pedidos con la misma API (`POST /api/pedidos`) y las mismas tablas, así que lo creado debería verse y editarse igual en la UI de pestañas. **No se comprobó abriendo en la UI antigua un pedido creado con el Hub.** Si algún día hay que revertir, hacerlo primero con un pedido de prueba.

## 8. Cuándo se da por cerrada la ventana

> Decisión del PO (2026-10-26): ventana vigilada de **3 días**, vigilancia a cargo de **Lilia**.

Criterio: sin reglas de parada y con la comparación de integridad limpia durante el periodo acordado. **Cumplido** (sección 10). El Hub queda encendido como flujo normal.

## 9. Qué no cubre este documento

- **P0-4**, la conciliación de las 57 ventas históricas sin pago: depende del negocio (§10 del documento de revisión).
- **B-14**, promociones, regalos y descuentos: decisión del PO pendiente. Solo importa si se usan al vender.
- **#426** (guardar la ubicación en el cliente o la tienda) y **#424** (casilla «guardar también como dirección del cliente»): mejoras.
- **F10b** (#312): retirar el formulario antiguo. Es una decisión aparte, ahora que la ventana cerró.
- Encender «Entregar después» o el cierre V2: cada uno es una decisión y una ventana aparte.

## 10. Registro de la activación (2026-10-26 al 2026-10-31)

**Línea de tiempo (hora de Bogotá)**

| Cuándo | Qué |
|---|---|
| 26 oct, 13:57 | Línea base de integridad: 0 críticas, 0 altas, 29 medias, 57 informativas (V9: 4 pagos Nequi sin confirmar; V11: 25 posibles duplicados; V12: 57 días sin cierre). V4 y V10 en 0 |
| 26 oct, 14:00 | Ensayo de reversa: redespliegue de producción con el interruptor en `false`, sin cambio para los usuarios. 2 min 20 s hasta `READY` |
| 26 oct, 14:05 a 14:09 | Interruptor en `true` y redespliegue del commit `bfefc2fb`. `READY` en 1 min 58 s |
| 26 oct, 14:16 | Primera venta con el Hub (#461, 15 pacas, $34.500): quedó con su pago, entregada y pagada, sin saldo |
| 26 al 29 oct | Ventana vigilada. No se activó ninguna regla de parada y no se apagó el Hub |
| 31 oct | Revisión posterior con consultas de solo lectura sobre la base de producción |

**Lo observado desde el encendido hasta el 31 de oct** (150 pedidos del #462 al #611, de los cuales 138 son del #474 en adelante y 34 de esos son ventas rápidas; ventas por unos $2,53 millones, sin contar anulados ni cancelados):

- Saldo a cargo de `CONSUMIDOR_FINAL`: 0. Saldo a favor de `CONSUMIDOR_FINAL`: 0.
- Pedidos que no cuadran (pagado + saldo ≠ total): 0.
- Anulados o cancelados con pagos sin reversión ni nota de crédito: 0.
- Facturas con saldo distinto del de su pedido: 0.
- Todos los pedidos del Hub tienen su creador.
- Lo que parecía raro y no lo era: 6 pedidos viejos pagados sin fila de pago (todos de antes del Hub, cada uno con su registro de cartera), 7 casos de pago con su abono espejo del mismo valor, y las ventas rápidas, que nunca guardan hora de entrega.

**Hallazgos durante la ventana, todos corregidos** (ninguno fue causado por el Hub, pero se vieron al usarlo):

| Issue | Qué era | Arreglo |
|---|---|---|
| #493 | A domicilio, el recargo se sumaba también al precio escrito a mano, al especial y al de volumen (5 pacas a 2.500 salían en 13.500) | #496: el recargo solo se suma al precio base |
| #400 | `Pedido.createdById` nunca se guardaba | #509: se guarda al crear. Se rellenaron 469 pedidos desde el historial de auditoría; quedan 4 sin creador, que son pedidos borrados |
| #512 | Un anulado conservaba su total y su saldo (24 pedidos, $507.000); el cancelado quedaba en 0 | #518: anulado y cancelado quedan en 0. Hoy los 31 anulados y los 42 cancelados están en 0 |
| #511 | El cierre del día restaba dos veces la nota de crédito de un pedido anulado el mismo día | #519 |

**Limitaciones de este registro**

- La foto oficial de `/api/integridad` solo se tomó antes del encendido y a los 8 minutos. Las revisiones posteriores replican las reglas con consultas de solo lectura; no sustituyen al verificador. Para una lectura oficial, un ADMIN abre `portal.aguabambu.com/api/integridad`.
- No se verificó que un pedido creado con el Hub se abra bien en la pantalla antigua (sección 7).
- La vigilancia de Lilia se confirmó por la ausencia de avisos; no hay un registro escrito de sus revisiones.
