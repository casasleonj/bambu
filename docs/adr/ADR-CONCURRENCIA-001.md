# ADR-CONCURRENCIA-001 — Contrato de advisory locks

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §5, §6
- Fase de implementación: FASE 0 (infra) / FASE 1 (migración granular)

## Contexto

El sistema reutiliza un único mecanismo de advisory locks. Históricamente usaba enteros fijos (1-8), que se agotaron (colisión `NC=8` vs producción=8).

## Decisión

- `withAdvisoryLock(namespace, entityKey, fn)` es **dueño de la transacción**: abre `$transaction`, adquiere el lock dentro, ejecuta y hace commit.
- Prohibido: transacción externa → lock → transacción interna; y lock → abrir otra transacción sobre el mismo agregado.
- Variante explícita `withAdvisoryLockTx(tx, namespace, entityKey, fn)` para callers con tx ya abierta.
- Primitivo `acquireAdvisoryLockTx(tx, namespace, entityKey)` para multi-lock y migración de locks raw.
- Clave determinista `"namespace:entityKey"` con hash de 64 bits (`hashtextextended(text, 0)`). La colisión del hash no es semántica de identidad; como máximo produce contención adicional.
- Guard anti-anidación: `withAdvisoryLock` lanza `ADVISORY_LOCK_NESTED_TRANSACTION` si se anida.

## Tabla agregado → lock (§6)

| Operación | Lock |
|---|---|
| Pago FIFO de cartera | `CARTERA:clienteId` |
| Ajuste de pedido | `PEDIDO:pedidoId` |
| Recovery de sobrante | `RECOVERY_SOURCE:sourceEventId` |
| Cumplimiento de obligación | `OBLIGACION:obligacionId` |
| Carga activa | `EMBARQUE_CARGA:embarqueId` (o agregado equivalente) |
| Cierre | `CIERRE:embarqueId` |
| Generación de secuencia | namespace de secuencia (`SECUENCIA:*`) |

## Nota de migración progresiva

FASE 8: `Pedido.numero` y `NotaCredito.numero` migraron de MAX+1 a secuencia PG atómica (`pedido_numero_seq` / `nota_credito_numero_seq`, migración `20260817_add_pedido_notacredito_secuencias`). Con `nextval()` atómico la numeración es segura sin lock global. Los locks `SECUENCIA:pedido` / `SECUENCIA:notaCredito` quedan como sobre-serialización inofensiva; su refinamiento a locks por agregado estrictos se difiere a un ADR futuro.

## Verificación

`src/lib/__tests__/integration/locks.test.ts`: serialización del mismo key, no-serialización, `withAdvisoryLockTx`, anti-anidación.
