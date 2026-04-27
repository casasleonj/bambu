# INFORME QA FINAL — Agua Bambú v2 MVP (1 Semana)

**Agente:** QA Pipeline | **Fecha:** 2026-04-27  
**Veredicto:** **FAIL — Bloqueantes críticos detectados**

---

## 1. VALIDACIÓN DE CONSISTENCIA ENTRE AGENTES

### 1.1 Hallazgos consistentes (✅)

| Hallazgo | Agentes que coinciden |
|----------|----------------------|
| Passwords en plano | DEBUGGER (CRÍTICO-001), SECURITY (7 críticas), TESTER (T1-1.1) |
| APIs públicas sin auth | DEBUGGER (CRÍTICO-002), SECURITY (22 endpoints), TESTER (T1-1.4) |
| Pedido+Factura sin transacción | DEBUGGER (CRÍTICO-003), TESTER (T7-7.4) |
| Race conditions en secuenciales | DEBUGGER (RC-001, 5 instancias), TESTER (T5-5.3), CODER (día 5) |
| Abonos concurrentes sobrescriben saldo | DEBUGGER (RC-002), TESTER (T4-EDGE-01) |
| Producción page 404 | DEBUGGER (NP-008), TESTER (T5-5.7, T7-7.6) |

**Conclusión:** Los agentes técnicos (DEBUGGER, TESTER, SECURITY) son **altamente consistentes** en sus hallazgos críticos. No hay falsos positivos aparentes.

### 1.2 Contradicciones y gaps encontrados (⚠️)

| # | Contradicción | Detalle | Impacto |
|---|---------------|---------|---------|
| C-1 | **SQLite vs Supabase** | El usuario confirmó "usarán Supabase en producción". ARCHITECT advierte que SQLite no escala para 6 concurrentes. Sin embargo, el plan del PM y el CODER asumen quedarse en SQLite para el MVP. | **Crítico.** Las soluciones de race condition propuestas por CODER (transacciones serializables) **no funcionan en SQLite**. |
| C-2 | **Refactor vs Parche** | REVIEWER exige Repository pattern, Service layer, DTOs (calificación F en DRY). El CODER propone parches mínimos. En 1 semana no se puede hacer ambas cosas. | **Alto.** El REVIEWER es teóricamente correcto pero impráctico para el deadline. |
| C-3 | **Testing completo vs 1 día** | TESTER propone 50+ tests API + 10 E2E + CI en el Día 7. El PM asigna solo 1 día para testing. Con 20 APIs sin validación previa, esto es imposible. | **Alto.** La suite propuesta requiere 3-4 días mínimo. |
| C-4 | **Pedidos recurrentes** | PLANNER y CODER incluyen "generación automática de pedidos recurrentes" en el MVP. El usuario dijo "Sí hay pedidos recurrentes reales". Pero no existe infraestructura de cron/jobs en el proyecto (Next.js + SQLite). | **Alto.** Feature válida pero sin mecanismo de ejecución. |
| C-5 | **Múltiples métodos de pago** | Usuario confirmó "Sí a múltiples métodos". El schema actual tiene `metodoPago` (1 campo) y `montoPagado`. La migración original tenía `metodo1/monto1/metodo2/monto2`. El CODER propone agregar múltiples pagos pero **sin migración de schema**. | **Crítico.** No se puede implementar sin cambiar la base de datos. |

---

## 2. VERIFICACIÓN DE EJECUTABILIDAD DEL PLAN (1 SEMANA)

### 2.1 Análisis día por día

| Día | Tarea PM | Esfuerzo real estimado | Viabilidad |
|-----|----------|----------------------|------------|
| 1 | Bcrypt + Zod + Middleware APIs | 2-3 días (20 APIs sin validación) | ❌ **Imposible en 1 día** |
| 2 | Generación pedidos recurrentes | 1.5 días + infraestructura cron | ❌ **Imposible sin cron/job** |
| 3 | Panel configuración precios | 0.5 días frontend + 0.5 API | ⚠️ Viable, pero depende del Día 1 |
| 4 | Múltiples métodos de pago | 1 día schema + 1 día API + 1 día frontend | ❌ **Imposible sin migración DB** |
| 5 | Fix multi-turno + race conditions | 0.5 multi-turno + **2+ días race conditions** | ❌ **SQLite no soporta la solución** |
| 6 | Offline pragmático | 1 día viable | ⚠️ Viable, pero colateral de duplicados |
| 7 | Testing + bug fixes | 3-4 días mínimo para 50+ tests + E2E | ❌ **Imposible en 1 día** |

**Total realista:** 10-12 días de trabajo condensado en 7. Factor de compresión: **~1.7x**.

### 2.2 Dependencias bloqueantes

```
Día 1 (Auth/Zod) bloquea TODO lo demás:
  └── Sin middleware en APIs → cualquier test de integración falla
  └── Sin Zod → APIs aceptan datos corruptos → bugs de datos

Día 4 (Múltiples pagos) bloquea:
  └── Schema migration requerida → invalida tests de Día 7
  └── Cambio en cierre del día → afecta Día 3 y 5

Día 5 (Race conditions) es un callejón sin salida en SQLite:
  └── Solución real requiere PostgreSQL/Supabase
  └── Migrar de SQLite a Supabase = +2 días mínimo
```

---

## 3. ITEMS DEL MVP QUE NO SE PUEDEN HACER EN 1 SEMANA

### 3.1 Deben posponerse POST-MVP

| # | Ítem | Razón | Usuario afectado |
|---|------|-------|-----------------|
| P-1 | **Pedidos recurrentes automáticos** | Requiere infraestructura de cron (Vercel Cron, Inngest, o worker). Next.js + SQLite no tiene esto. | Medio — pueden crearse manualmente por ahora |
| P-2 | **Múltiples métodos de pavo por pedido** | Requiere migración de schema (tabla `Pago` o campos `metodo1/2/3`). Cambia cierre, factura, pedido. | Alto — pero se puede usar un solo método temporalmente |
| P-3 | **Suite completa de testing (50+ tests + E2E + CI)** | Imposible en 1 día. Con 20 APIs sin validación, solo el setup toma 1 día. | Bajo — testing es para calidad, no funcionalidad |
| P-4 | **Reportes/Exportes** | El usuario dijo "puede esperar". Confirmado posponible. | Ninguno |
| P-5 | **Refactor arquitectónico (Repository, DTOs, Server Components)** | REVIEWER tiene razón, pero es imposible en 1 semana. | Medio — deuda técnica acumulada |
| P-6 | **PWA completa con Serwist** | ARCHITECT reporta Serwist desconectado, manifest incompleto. Arreglar toma 1+ día. | Medio — offline pragmático cubre lo urgente |

### 3.2 Requieren reducción de scope

| # | Ítem | Reducción propuesta |
|---|------|---------------------|
| R-1 | Zod en TODAS las APIs | Solo en APIs críticas: `pedidos`, `abonos`, `auth`, `clientes` |
| R-2 | Offline sync completo | Solo guardar pedidos en localStorage/Dexie, sincronización manual con botón |
| R-3 | Testing | Solo tests de API para auth + pedidos + abonos (10-15 tests). Sin E2E. |

---

## 4. VERIFICACIÓN DE CALIDAD MÍNIMA

### 4.1 ¿La solución del CODER mantiene calidad aceptable?

**Respuesta corta: NO para producción, SÍ para una demo controlada.**

| Aspecto | Calidad actual | Calidad post-CODER (estimada) | Aceptable para MVP? |
|---------|---------------|------------------------------|---------------------|
| Seguridad | F (passwords plano, APIs públicas) | C (bcrypt + middleware básico) | ⚠️ **Mínimo aceptable** |
| Integridad financiera | F (sin transacciones) | C (transacciones en pedido/factura/abono) | ⚠️ **Mínimo aceptable** |
| Concurrencia | F (race conditions garantizadas) | D (mejora parcial, SQLite limita) | ❌ **No aceptable para 6 usuarios** |
| Código | D+/F/D (REVIEWER) | D+ (parches, no refactor) | ⚠️ **Tolerable por 1 semana** |
| Offline | D (queue se limpia con fallos) | C (mejora manual) | ⚠️ **Mínimo aceptable** |

### 4.2 Deuda técnica introducida

El CODER introduce **deuda técnica adicional** al proponer:
1. **Quedarse en SQLite** a pesar de que el usuario confirmó Supabase. Esto obligará a una migración dolorosa post-MVP.
2. **Parches en vez de soluciones arquitectónicas.** Ej: en lugar de crear tabla `Pago`, propone agregar campos embebidos, lo que complica el cierre diario.
3. **Zod solo en algunas APIs.** Deja 15+ APIs sin validación, perpetuando el riesgo de datos corruptos.

---

## 5. RIESGOS DEL MVP EN 1 SEMANA

### 5.1 Riesgos catastróficos (probabilidad: media-alta)

| # | Riesgo | Probabilidad | Impacto | Escenario |
|---|--------|-------------|---------|-----------|
| R-CAT-1 | **Pérdida de pagos (abonos)** | Alta | Catastrófico | Dos usuarios registran abono simultáneo → uno sobrescribe al otro → cliente pagó pero sigue debiendo |
| R-CAT-2 | **Facturas duplicadas** | Alta | Catastrófico | Dos usuarios crean pedido al mismo tiempo → mismo número de factura → contabilidad imposible |
| R-CAT-3 | **Datos borrados/modificados por atacante** | Alta | Catastrófico | APIs públicas → cualquier script puede `DELETE /api/pedidos/*` o crear pedidos falsos |

### 5.2 Riesgos graves (probabilidad: alta)

| # | Riesgo | Probabilidad | Impacto | Escenario |
|---|--------|-------------|---------|-----------|
| R-GRA-1 | **Pedidos offline duplicados** | Alta | Grave | Repartidor en 2G/3G intermitente crea pedido → sync con timeout → reintenta → duplicado |
| R-GRA-2 | **Cierre del día incorrecto** | Media | Grave | `cierre/route.ts` suma `saldo` de pedidos ANULADOS → fiado inflado → decisiones de negocio erróneas |
| R-GRA-3 | **Producción siempre con stock 0** | Confirmado | Grave | `produccion/page.tsx` llama `/api/cierre-dia` (NO EXISTE) → stock inicial siempre 0 |
| R-GRA-4 | **PedidoForm no funciona** | Confirmado | Grave | `pedido-form.tsx` envía `cantidades`/`clienteData` pero API espera `productos`/`clienteId` → pedidos con totales en 0 |

### 5.3 Riesgos de negocio

| # | Riesgo | Impacto |
|---|--------|---------|
| R-NEG-1 | Precio botellón hardcodeado en $5,000 pero usuario dijo $7,500/$10,000 | Pérdida de dinero por pedido |
| R-NEG-2 | Botellón no tiene lógica de fábrica vs domicilio | Cobro incorrecto |
| R-NEG-3 | No hay control de usuarios desactivados con JWT válido | Seguridad interna |

---

## 6. VEREDICTO FINAL

### **FAIL — Bloqueantes detectados**

El MVP de 1 semana **NO es ejecutable** tal como está planificado. Existen **bloqueantes objetivos** que impiden que el sistema sea funcional, seguro o consistente para 6 usuarios concurrentes en un entorno rural con conectividad intermitente.

### Condiciones para PASS

Para emitir un veredicto **PASS con observaciones**, el plan debe cumplir:

1. ✅ **Migrar a PostgreSQL/Supabase ANTES de cualquier feature nueva.** SQLite es incompatible con 6 usuarios concurrentes y race conditions.
2. ✅ **Reducir scope a 4 días de trabajo real:**
   - Día 1-2: Seguridad (bcrypt + middleware en APIs + transacciones pedido/factura/abono)
   - Día 3: Fix producción (endpoint `cierre-dia`, multi-turno, stock real)
   - Día 4: Fix pedidoForm + precios configurables + offline pragmático
   - Día 5-7: Testing mínimo (10-15 tests API) + estabilización
3. ✅ **Posponer explícitamente:** pedidos recurrentes, múltiples métodos de pago, reportes/exportes, refactor arquitectónico, PWA completa.
4. ✅ **Validar que el build pase** (`next build` sin errores TypeScript).

---

## 7. RECOMENDACIONES FINALES

### 7.1 Qué hacer PRIMERO (Orden de prioridad absoluto)

| Prioridad | Tarea | Justificación | Estimado real |
|-----------|-------|---------------|---------------|
| P0-1 | **Migrar a Supabase (PostgreSQL)** | El usuario ya lo confirmó. SQLite no soporta concurrencia ni `SELECT FOR UPDATE`. Sin esto, los race conditions no tienen solución robusta. | 1 día |
| P0-2 | **bcrypt + middleware protege `/api/*`** | SECURITY y DEBUGGER confirman 22 endpoints públicos. Un atacante puede destruir todo en segundos. | 0.5 días |
| P0-3 | **Transaccionar pedido+factura y abono+factura** | Inconsistencia financiera = dinero perdido. Es un negocio de efectivo. | 0.5 días |
| P0-4 | **Fix `PedidoForm` → API compatibilidad** | El form no crea pedidos correctamente. Es la funcionalidad CORE. | 0.5 días |
| P0-5 | **Fix `/api/cierre-dia` inexistente** | Producción no funciona. Stock siempre 0. | 0.25 días |
| P0-6 | **Schema: tabla `Pago` para múltiples métodos** | Si el usuario insiste en múltiples métodos, hay que migrar. No hay atajo. | 0.5 días |

**Subtotal P0:** ~3.25 días de trabajo crítico.

### 7.2 Qué POSPONER (Post-MVP, semana 2+)

| Tarea | Posponer a |
|-------|-----------|
| Pedidos recurrentes automáticos | Semana 2 (requiere Vercel Cron o similar) |
| Reportes / Exportes | Semana 3 (usuario confirmó que puede esperar) |
| Refactor a Repository pattern / Server Components | Semana 4+ (REVIEWER tiene razón, pero no es urgente) |
| Suite completa E2E con Playwright | Semana 3-4 |
| PWA completa (Serwist, manifest, service worker robusto) | Semana 4+ |
| Normalización completa de schema (Producto tabla separada) | Semana 4+ |

### 7.3 Qué NO hacer (Evitar daño adicional)

| # | No hacer | Razón |
|---|----------|-------|
| ❌ | Implementar race conditions con "esperanza" en SQLite | No funciona. Usa Supabase + `SELECT FOR UPDATE` o secuencias nativas. |
| ❌ | Agregar `metodo1/monto1` a Pedido sin migrar a tabla `Pago` | Empeora la deuda técnica. El cierre del día se vuelve imposible de mantener. |
| ❌ | Desplegar a producción con APIs públicas | Cualquiera puede borrar la base de datos. |
| ❌ | Prometer "offline completo" en 1 semana | El sync actual pierde datos. Mejor decir "modo offline básico con sincronización manual". |
| ❌ | Ignorar el build de TypeScript | `next build` actual probablemente tiene errores por `any` y casts. |

---

## 8. RESUMEN EJECUTIVO PARA EL USUARIO

**Señor(a) usuario de Agua Bambú:**

El análisis de 8 agentes especializados concluye que el MVP de **1 semana es posible SOLO si se reduce drásticamente el scope**. El sistema actual tiene **vulnerabilidades de seguridad críticas** (cualquiera puede acceder a sus datos), **bugs financieros graves** (pagos se pueden perder), y **problemas de concurrencia** que se manifestarán con 6 usuarios simultáneos.

**Mi recomendación honesta:**
1. **Acepte usar Supabase (PostgreSQL) desde el primer día.** Usted ya lo mencionó. SQLite no aguantará 6 usuarios en red intermitente.
2. **Acepte un MVP de "demo operativa" no de "producción completa."** El core funcional (pedidos, facturas, cierre, producción) puede estar en 5 días con calidad mínima aceptable.
3. **Posponga lo que no duele hoy:** pedidos automáticos, reportes avanzados, app móvil completa.

**Si insiste en 1 semana con TODO el scope original:** El sistema **fallará en producción** dentro de los primeros 3 días de uso real.

---

*Informe generado por Agente QA Pipeline.*  
*Próximo paso recomendado: Iteración del PM con el usuario para ajustar scope y confirmar migración a Supabase.*
