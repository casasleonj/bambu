# Los dos ADR del cierre V2, en palabras sencillas

Un ADR es una decisión escrita que el equipo aprueba **antes** de programar. Estos dos son borradores. Hasta que se aprueben, el cierre nuevo (Fase A) sigue apagado por flag y la Fase B no se empieza.

- Borrador 1: `docs/adr/ADR-CIERRE-002.md` — qué debe **rechazar o exigir el servidor** al cerrar un embarque.
- Borrador 2: `docs/adr/ADR-MONETARIO-002.md` — qué pasa con **el dinero y los precios** cuando algo cambia en el cierre.

---

## Borrador 1 — El servidor deja de aceptar cierres mal hechos

**La idea:** hoy la pantalla ya es más clara, pero el servidor todavía deja pasar cosas raras. Es como una caja registradora que te deja cobrar aunque falte un producto.

| Situación | Hoy | Con el ADR |
|---|---|---|
| María cancela el pedido #226 mientras otra persona cierra el embarque. | Se cierra como «entregado» con total $0 y cuenta como entregado. | El servidor responde «ese pedido está cancelado»; la pantalla lo marca «Cancelado — no se entrega». |
| Al cerrar se olvida uno de los 4 pedidos del embarque. | Queda «en ruta» en un embarque ya cerrado. | «Falta el pedido #12»: no deja cerrar hasta resolverlo. |
| Se escribe un cobro de $20.000 en un pedido y justo lo sacan del embarque. | El cobro desaparece y aparece como «sobrante» de caja. | Avisa «el pedido #12 salió del embarque con un cobro de $20.000» y se reconcilia. |
| Alguien teclea un gasto de $99.999.999.999. | Error 500 o se acepta. | Mensaje claro con el tope permitido. |
| Venta en la calle a «Venta al paso» sin pagar. | Se acepta y nadie le puede cobrar después. | Se exige pago completo. |
| Venta fiada a un cliente bloqueado. | Se acepta. | Solo con una excepción autorizada. |
| Carlos pidió 10 y compra 5 más en la ruta. | Se registra suelta, sin relación con su pedido. | Una sola venta, vinculada al pedido de Carlos. |
| Mirar el resumen antes de confirmar 10 veces. | Cada vez «gasta» números de consecutivos. | Mirar el resumen no gasta nada. |

**Ejemplo completo:** Yesid lleva 3 pedidos. Mientras María teclea el cierre, otro asistente cancela el #2. Hoy, al confirmar, el #2 quedaría «entregado». Con el ADR, el servidor responde «el pedido #2 está cancelado», la pantalla lo muestra y María lo resuelve antes de cerrar.

**Importante:** una **señal** (por ejemplo «una venta fiada compensa un faltante») nunca bloquea ni acusa a nadie; solo avisa para que alguien revise.

**Qué debe decidir el equipo**
1. ¿Cancelar o anular un pedido lo debe sacar solo del embarque? (propuesta: sí).
2. Preview sin gastar consecutivos: ¿calcular sin crear (recomendado) o mantener el ensayo y aceptar que gasta?
3. ¿Qué umbral usar para pedir una nota cuando sobra plata en caja?
4. Quién tiene el permiso específico para excepciones.

---

## Borrador 2 — Dinero, precios y excepciones

**La idea:** cuando algo cambia en el cierre (un precio, una cantidad, un fiado), debe cambiar **el total del pedido y la deuda juntos**, con motivo y responsable. Nunca a medias.

**Ejemplo 1 — Corregir un precio.** El pedido de Carlos: 10 pacas a $2.300 = $23.000. Se cobró mal y debían ser a $2.000.
- Hoy: se guarda el precio nuevo pero la deuda sigue en $23.000.
- Con el ADR: el total pasa a $20.000 y la deuda se recalcula, con motivo y quién lo hizo. Si Carlos ya había pagado $23.000, el sistema **no inventa** una deuda negativa: pide registrar la devolución o dejar $3.000 de saldo a favor.

**Ejemplo 2 — «Ya no quiero el resto».** Carlos pidió 10 y recibió 5, y dice que no quiere las otras 5.
- Esto **no es un error de captura**, así que no se usa la corrección de errores.
- Hasta que el ADR se apruebe, la pantalla anota «pendiente de autorización en oficina» y el total sigue en $23.000.
- Con el ADR: oficina confirma, el pedido queda en 5 pacas ($11.500), se revisa lo ya pagado y se ajusta la factura. Si había pagado de más, se devuelve o queda a favor.

**Ejemplo 3 — Fiado a un cliente bloqueado.** Ana está bloqueada por deuda. En la calle le venden 2 pacas a fiado.
- Hoy: pasa sin preguntar.
- Con el ADR: no pasa salvo que alguien con permiso la autorice, con motivo, monto máximo y fecha. Sin esa autorización, se cobra completo.

**Lo que no cambia:** el saldo del pedido sigue siendo la fuente de verdad; un pago «reportado» no es «confirmado»; un saldo sin cobrar no es un fiado aprobado.

**Qué debe decidir el PO**
1. Quién puede corregir precios y quién autoriza una reducción.
2. Si ya pagó de más: ¿devolución, saldo a favor o ambas?
3. Si la reducción necesita nota crédito fiscal (consultar con contabilidad).
4. A partir de qué diferencia de precio se avisa («precio raro»).

---

## Cómo se relacionan

1. El ADR de cierre dice **qué se rechaza** y **qué se exige**.
2. El ADR monetario dice **cómo se mueve el dinero** cuando eso cambia.
3. Quedan fuera, con sus propios ADR: la reducción comercial como operación completa (#451) y la escasez de mercancía (#452).

## Cómo seguimos
- El equipo revisa los dos borradores y responde las preguntas.
- Con ADR aprobados, abro la Fase B (un PR, pruebas primero, flag apagado).
