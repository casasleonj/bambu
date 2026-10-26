# Activación del Pedido Hub — guía de encendido, vigilancia y reversa

Paso 8 de #345. Opción elegida con el PO (2026-10-26): **encender para todos con una ventana vigilada**, con la reversa ensayada de antemano. El Hub es el nuevo flujo de crear y consultar pedidos (`NEXT_PUBLIC_PEDIDOS_V2`).

> **Estado de este documento:** borrador para aprobar. Los pasos marcados **(por ensayar)** no se han ejecutado todavía; no se afirma que funcionen hasta hacer el ensayo. Todo lo demás sale de código y documentos del repositorio, citados al lado.

## 1. Cómo funciona el interruptor

- `NEXT_PUBLIC_PEDIDOS_V2` se lee como `=== 'true'` (`src/lib/flags.ts`) y Next.js lo **fija al construir** la aplicación. Cambiar la variable en Vercel **no basta**: hay que redesplegar para que el cambio se vea.
- Vale para todos los usuarios a la vez. No existe encendido por usuario o por rol.
- Los demás interruptores son independientes y **se quedan apagados** en esta activación:
  - `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` («Entregar después»).
  - `NEXT_PUBLIC_CIERRE_V2` (cierre de embarque V2).

## 2. Punto de partida (a confirmar el día del encendido)

Según `docs/pedidos/HUB_REVISION_INTEGRAL_v1.0.md` §1.1, desde el 2026-10-08 el interruptor está en `"false"` en Production (variable `dqwoz62SlHQexlN3`) y se sirve en `portal.aguabambu.com`. **Ese dato tiene casi dos semanas: se confirma en Vercel antes de tocar nada.**

Qué cambió desde la contención: el cobro del Hub, el saldo con deudor requerido, la excepción de crédito, cliente nuevo, creación sin conexión, destino de un pedido, «Entregar después», precios y el botón «Cobrar» están en `main` con pruebas que miran la base de datos (§12.1 del mismo documento).

## 3. Antes de encender

| # | Qué | Quién | Cómo |
|---|---|---|---|
| 1 | Confirmar el estado real: valor del interruptor en Production y último deploy en `READY` | Claude + PO | Vercel → proyecto → variables y deployments |
| 2 | `main` verde en lo que importa: Type check, pruebas, Integration y `E2E Hub (V2 ON)` | Claude | Último run de CI en `main` |
| 3 | **Línea base de integridad** | PO (ADMIN) | Con sesión de ADMIN en producción: `GET /api/integridad`. Alternativa: `npx tsx scripts/verificar-integridad.ts --json` con la `DATABASE_URL` de producción. Guardar el resultado con fecha y hora |
| 4 | **Ensayo de reversa (por ensayar)** | Claude + PO | En una vista previa, o en producción en un momento sin ventas: apagar, redesplegar, medir el tiempo hasta que `portal.aguabambu.com` muestre la UI de pestañas; volver a encender. Anotar cuánto tardó |
| 5 | Probar a mano en móvil y escritorio una venta rápida pagada y un pedido a un cliente | PO | Con el Hub en la vista previa |
| 6 | Nombrar quién vigila el primer día y cómo avisa | PO | Una persona del negocio que diga «algo se ve raro» |

**Sobre la línea base (paso 3):** las 57 ventas históricas sin pago (§1 y §10 del documento de revisión) pueden seguir apareciendo en V4 y V10 si la conciliación P0-4 no se ha ejecutado. Eso no bloquea encender, pero la comparación del primer día solo cuenta los hallazgos **nuevos**, creados después de la hora de activación. Por eso se guarda el resultado con su fecha.

## 4. Encendido

1. Anotar la hora (Bogotá) y el commit de `main` que se despliega.
2. En Vercel, Production: `NEXT_PUBLIC_PEDIDOS_V2 = "true"`.
3. **Redesplegar el commit actual de `main`** y esperar a `READY`. Es el mismo procedimiento de la contención del 8 de octubre, en sentido contrario.
4. Prueba de humo: entrar con un ADMIN, ver la lista del Hub, hacer una venta rápida de prueba pagada **de verdad** (la que se haría normalmente) y comprobar que queda con su pago.

## 5. Vigilancia del primer día

Propuesta, a ajustar con el PO:

- **Cada pocas horas y al cierre del día:** `GET /api/integridad` y comparar con la línea base. Las reglas críticas son V1 (pagado + saldo = total), V3 (una factura por pedido con el mismo saldo), V4 (venta a CONSUMIDOR_FINAL con saldo), V10 (saldo a favor de CONSUMIDOR_FINAL) y V14 (pago de regularización contado en la caja de su fecha de registro). También importan V2, V5, V6, V8, V11 y V15.
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

**Tiempo de reversa: por medir en el ensayo (paso 4 de la sección 3).**

**Qué pasa con lo creado con el Hub (por verificar en el ensayo):** el Hub y el formulario antiguo crean pedidos con la misma API (`POST /api/pedidos`) y las mismas tablas, así que lo creado debería verse y editarse igual en la UI de pestañas. Se comprueba abriendo en la UI antigua un pedido creado con el Hub durante el ensayo.

## 8. Cuándo se da por cerrada la ventana

El plan original usaba un soak de 14 días. Para esta activación el PO decide la duración y el criterio. Propuesta mínima: **sin reglas de parada y con la comparación de integridad limpia durante el periodo acordado.**

> Decisión del PO: duración de la ventana vigilada — ______ .

## 9. Qué no cubre este documento

- **P0-4**, la conciliación de las 57 ventas históricas: depende del negocio (§10 del documento de revisión).
- **B-14**, promociones, regalos y descuentos: decisión del PO pendiente. Solo importa si se usan al vender.
- **#424** (casilla «guardar también como dirección del cliente») y **#426** (guardar la ubicación en el cliente o la tienda): mejoras.
- **F10b** (#312): retirar el formulario antiguo. Se hace después de cerrar la ventana.
- Encender «Entregar después» o el cierre V2: cada uno es una decisión y una ventana aparte.
