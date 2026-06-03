# 📋 Reunión con Product Owner — Decisiones de Negocio Pendientes

**Fecha sugerida:** Esta semana (30 min)
**Asistentes:** Product Owner + Tech Lead (opcional)
**Objetivo:** Validar 6 decisiones de negocio que afectan el dinero y la operación. Sin confirmación, F2 puede implementarse al revés.

---

## Pregunta 1 — Cuadre de caja del repartidor (CRÍTICA)

### Contexto técnico
El sistema calcula cuánto dinero en efectivo debería tener el repartidor al cerrar su ruta.

**Fórmula actual** (`cierre-embarque.service.ts:115-137`):
```
efectivoReal = totalVentas - otrosPagos (transferencias, nequi) - gastos
```

**Fórmula propuesta** (sospecho que es la correcta):
```
efectivoReal = baseDinero_inicial + totalVentas - otrosPagos - gastos
```

### Ejemplo concreto
- Repartidor sale con $50.000 de base
- Cobra $200.000 en efectivo a clientes
- Gasta $0 en gasolina

| Fórmula | Resultado | Interpretación |
|---------|-----------|----------------|
| Actual | $200.000 | "El sistema cree que NO había base" |
| Propuesta | $250.000 | "El sistema SÍ cuenta la base" |

### Pregunta para el PO
> "Cuando un repartidor sale con $50.000 de base en efectivo, y al final del día trae todo el efectivo que cobró, ¿ese monto que trae de vuelta DEBE incluir los $50.000 de base, o el sistema debe pedirle solo lo que cobró de más sobre la base?"

### Posibles respuestas
- **(A) "Debe incluir la base"** → aplicar fórmula propuesta
- **(B) "Solo lo cobrado extra"** → el sistema pide `totalVentas - baseDinero` (reembolsa base, cobra resto)
- **(C) "La base se devuelve aparte, no se cuenta"** → `baseDinero` no debería estar en la fórmula de cuadre

**Si es A (lo más probable):** Fix es 1 línea, 2 horas.
**Si es B o C:** requiere refactor mayor.

---

## Pregunta 2 — Cierre de día en fines de semana/feriados (CRÍTICA)

### Contexto técnico
El sistema de cierre de día en `cierre/route.ts:466-473` rechaza cierres si hay un "hueco" de más de 1 día:

```ts
if (diffDays > 1) {
  throw new Error('CIERRE_HUECO')
}
```

### Problema real
Si la empresa NO abre los domingos, el lunes por la mañana el sistema rechaza el cierre del lunes porque "el domingo no se cerró". Pero el domingo no hay operación que cerrar.

**Adicionalmente** (`cierre/route.ts:484`), el sistema también rechaza el cierre si hay embarques en estado `EN_RUTA`. Si un embarque quedó "EN_RUTA" overnight (repartidor no cerró), el sistema bloquea indefinidamente.

### Pregunta para el PO
> "¿El negocio opera todos los días del año, o tiene días en que no hay operación? Si un día no se opera, ¿el sistema debe permitir cerrar el siguiente día 'saltándose' el día sin operación, o debe obligar a hacer un cierre 'vacío' del día sin operación?"

> "Si un repartidor se quedó 'EN_RUTA' (por ejemplo, se le dañó la moto y no volvió), ¿el sistema debe impedir el cierre del día hasta que ese embarque se cierre manualmente?"

### Posibles respuestas
- **(A) Operan todos los días** → no se necesita cambiar nada
- **(B) No operan domingos/feriados** → agregar lógica de "cierre omitido" con justificación
- **(C) Operan L-S, no domingo** → agregar excepción automática para domingos

- **(A') Embarque EN_RUTA bloquea cierre** → comportamiento actual correcto
- **(B') Permitir cierre dejando embarque como excepción** → agregar `motivoBloqueo`
- **(C') Cerrar embarque automáticamente como CANCELADO** → refactor del flujo de cancelación

**Riesgo si se queda como está:** Operador no puede cerrar la caja del lunes → bloqueo operacional → intervención manual.

---

## Pregunta 3 — Anular venta rápida (CRÍTICA)

### Contexto técnico
Las "ventas rápidas" se crean ya como `ENTREGADO` (pagadas y entregadas en el momento). La regla de anulación actual requiere que un pedido esté ENTREGADO, pero la lógica de transición tiene una peculiaridad con las ventas rápidas.

**Estado actual:** El test E2E `e2e/ciclo-cancelacion.spec.ts:45,154` está marcado con `test.skip(true, 'Pedido not in ENTREGADO state via API (venta rapida flow differs)')` — **el equipo sabe que no funciona**.

### Pregunta para el PO
> "Cuando un cliente paga por una venta rápida pero no recibe el producto (ej: se olvidó de entregarlo, error en el inventario, etc.), ¿cuál es el flujo correcto? ¿Se debe poder anular la venta y reversar el pago, o se debe tratar como una venta ya cerrada sin posibilidad de reversa?"

### Posibles respuestas
- **(A) "Sí, se debe poder anular"** → arreglar la lógica de transición; las ventas rápidas también son anulables
- **(B) "No, las ventas rápidas son finales"** → documentar y dejar el test skip
- **(C) "Solo con autorización especial"** → agregar flag `requiereAutorizacion`

**Riesgo si se queda como está:** Clientes que pagaron pero no recibieron, sin mecanismo de devolución. Riesgo reputacional.

---

## Pregunta 4 — `netoCaja` y comisiones/salarios (MEDIA)

### Contexto técnico
La fórmula del cierre resta comisiones y salarios del netoCaja (`cierre/route.ts:515`):

```ts
const netoCaja = baseDia + cobroVentasHoy + cobroCartera - gastosTotal - comisiones - salarios
```

### Pregunta para el PO
> "Cuando se cierra la caja, ¿las comisiones de los repartidores y los salarios se pagan DESDE la caja del cierre (en efectivo al momento), o se pagan por otro medio (transferencia bancaria, etc.) y NO deben restarse del efectivo de la caja?"

### Posibles respuestas
- **(A) "Se pagan en efectivo desde la caja"** → fórmula actual correcta
- **(B) "Se pagan por transferencia"** → las comisiones y salarios NO deben restarse del netoCaja (son referencia, no egreso de caja)
- **(C) "Mixto: una parte en efectivo, otra transferencia"** → requiere separar `comisionesEfectivo` de `comisionesTransferencia`

**Riesgo si se queda como está:** Si (B), el netoCaja subestima el efectivo disponible; las decisiones financieras se basan en un número incorrecto.

---

## Pregunta 5 — Cambio de contraseña forzado (BAJA pero importante)

### Contexto técnico
La pantalla de "cambia tu contraseña" (cuando el sistema obliga) NO pide la contraseña actual en `src/app/api/auth/force-password-change/route.ts:28-37`. La pantalla de "mi perfil" SÍ la pide en `src/app/api/auth/profile/route.ts:67-70`.

### Pregunta para el PO
> "Si un empleado descubre que alguien más usó su sesión y le cambiaron la contraseña, ¿queremos que el sistema requiera SIEMPRE la contraseña actual para cambiarla (mayor seguridad, pero más fricción)? ¿O aceptamos la fricción del flujo de fuerza bruta (sin contraseña actual) por simplicidad?"

### Respuesta esperada
- **(A) "Sí, requerir siempre"** (estándar de seguridad)

**Riesgo si se queda como está:** Account takeover si alguien roba una sesión justo antes de que el dueño cambie la contraseña.

---

## Pregunta 6 — Generación de contraseñas de admin (BAJA)

### Contexto técnico
Cuando un administrador resetea la contraseña de alguien en `src/app/api/users/[id]/reset-password/route.ts:9-16`, el sistema genera una nueva automáticamente usando `Math.random()`. Este método es predecible matemáticamente.

### Pregunta para el PO
> "¿Está bien que las contraseñas generadas por el sistema sean de 8 caracteres alfanuméricos, o preferimos que sean más largas y con símbolos? Esto afecta la fricción de comunicarle la contraseña al usuario."

### Posible respuesta
- **(A) 8 caracteres alfanuméricos (actual)** → cambiar a `crypto.randomInt()` (mismo tamaño pero seguro)
- **(B) 12+ caracteres con símbolos** → más seguro, más fricción

---

## Resumen para el PO

> Tenemos 6 decisiones que afectan el dinero y la operación. La #1 (cuadre de caja) puede estar mal y导致 (provocar) que todos los cierres estén incorrectos. La #2 (cierre en finde) puede bloquear la operación. La #3 (anular venta rápida) tiene un bug conocido. Las otras 3 son importantes pero menos críticas.
>
> ¿Podemos agendar 30 min esta semana para validar las 6?

---

## Matriz de Severidad

| # | Severidad | Impacto si no se valida |
|---|-----------|------------------------|
| 1 | 🔴 Crítica | Todos los cierres de repartidor están incorrectos |
| 2 | 🔴 Crítica | Operador no puede cerrar caja ciertos días |
| 3 | 🔴 Crítica | Cliente sin devolución posible |
| 4 | 🟠 Media | netoCaja incorrecto |
| 5 | 🟡 Baja | Account takeover possible |
| 6 | 🟡 Baja | Contraseñas predecibles |

## Acciones después de la reunión

1. Documentar las respuestas del PO en este archivo (sección "Respuestas del PO" abajo)
2. Si la respuesta a #1 es A → Fix F2.1 es 1 línea
3. Si la respuesta a #2 es B o C → Fix F2 es más complejo, requiere feature flag
4. Si la respuesta a #3 es A → Fix F2.6 (reemplaza el `test.skip` con test real)
5. Comunicar el resultado al equipo de desarrollo

---

## Respuestas del PO (a llenar después de la reunión)

> (Espacio para documentar las respuestas del PO)

| # | Respuesta | Acción |
|---|-----------|--------|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
