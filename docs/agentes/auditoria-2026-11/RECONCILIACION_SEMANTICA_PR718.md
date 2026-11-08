# Reconciliación semántica del AGENTS.md anterior · PR #718

**Estado:** PREANÁLISIS, no equivalencia aprobada. Se tomaron las seis fuentes originales byte a byte, archivadas con el hash Git de referencia `4182d57064c7f89c2eea39e86d1e0b469179bb06`.

- **193 cláusulas distintas** descompuestas conceptualmente, con alcance, condición, excepción, fuente y destino operativo.
- **394 pasajes adicionales** clasificados como pendientes de atomización o contexto. **223 posiciones estructurales** sin registro textual independiente. Estos números NO son porcentajes de equivalencia ni firmas.
- Inventario total: **798 posiciones con entrada de revisión** (incluidas 223 líneas estructurales). Matriz anterior: **530 filas candidatas**, no equivalentes a 530 obligaciones.
- El catálogo [contratos-operativos.md](../contratos-operativos.md) permite descubrir reglas de pagos, cartera, inventario, offline, autenticación, geografía, CI y UX sin depender de buscar ciegamente en el archivo antiguo.
- Se omitieron/redactaron 3 extractos de contexto con credenciales de ejemplo o identificadores personales; la fuente no se modifica. **Ninguna cláusula se marca `VERIFICADA`**, porque falta comprobar código actual, decisiones más recientes y aprobación de revisor con evidencia.

## Contradicciones descubiertas y reflejadas

| Fuente | Riesgo | Reconciliación propuesta |
|---|---|---|
| L3–5 y L667–704 | R3 implementa dentro de las tres iteraciones exigidas antes del código | Protocolo #704: R1+R2 por tres revisiones y R3 tras aprobación expresa. |
| L7 | UI aprobada por PO | Maquetas escritorio y móvil, estados confirmación/carga/error, aprobación de UI distinta de backend; preservado en raíz nueva. |
| L178 vs L369–382 | Pendiente antiguo de CRUD contactos contradice historia posterior de implementación | No abrir bug nuevo hasta consultar código de main; edición de productos recurrentes solo en Recurrentes es decisión histórica. |
| L400–409 | Número de incidente #13 duplicado | Conservar ambas fuentes, no inventar dos contratos diferentes. |
| L525 vs L531/L545 | Supuesto de que todos los pagos salen en efectivo se opone a pagos por método | Registrar contradicción temporal y consultar implementación monetaria actual. |
| L114, L593, L612 | Fecha de pedido distinta de fecha efectiva de entrega | Diferenciar deuda exigible, entrega parcial y comisiones por fecha/autor. |
| L597–603 | Ingreso de sobrante en fiados | Separar append-only, idempotencia, corte por medio/fecha, dashboard y no duplicar consumo de crédito. |
| L619/L621 | Cierre con base validada, endpoint alterno pendiente | Posible bypass que se debe investigar; no dar por resuelto solo con un endpoint. |
| L713/L753/L770 | Flags OFF, skips E2E o git revert como garantías absolutas | Las garantías del flujo nuevo son condicionales: revisar imports, datos, migraciones y baseline real. |
| L744 | Firma Claude obligatoria aunque ejecutara otro agente | Exigir autoría verdadera, no atribución ficticia. |
| L282 | Credenciales ilustrativas | No reproducirlas en catálogo ni tratarlas como permiso de uso. |

## Revisión crítica pendiente

1. Descomponer o justificar como contextual cada pasaje `PENDIENTE_ATOMIZACION`; una línea extensa puede contener muchas obligaciones.
2. Comparar cada obligación con decisión vigente y código real de `main` a SHA, distinguiendo `PRESERVADO`, `CAMBIO`, `CONFLICTO`, `HISTÓRICO` y `BRECHA PLAN↔CÓDIGO`.
3. Vincular cada contrato a pruebas positivas, negativas y adversariales por consumidor, con resultado real.
4. Firma de revisor autorizado y evidencia; después, solo si se justifica, `VERIFICADA`.
5. Evaluación runtime Codex/Claude/OpenCode independiente. No simularla a partir de rutas o índices.

Esta revisión no altera reglas de producto ni certifica las decisiones históricas por su mera transcripción.


## Segunda pasada de reconciliación

- 113 cláusulas adicionales descompuestas conceptualmente con condiciones y excepciones (total 306).
- 107 pasajes de inventario/comandos históricos diferenciados como `CONTEXTO_EVIDENCIA`, **aún pendientes de evaluación**; no se declararon obsoletos ni inválidos sin consultar `main`.
- 174 pasajes permanecen `PENDIENTE_ATOMIZACION`.
- 0 líneas intentadas ya estaban descompuestas o no eran un pasaje: ninguna.
- Cero cláusulas certificadas por humano; el gate de cutover debe permanecer bloqueado.
