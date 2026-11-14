# Contratos y cláusulas originales descompuestos · Agua Bambú

> **PREANÁLISIS, NO CERTIFICACIÓN DE VIGENCIA.** 354 cláusulas fueron descompuestas conceptualmente por significado, condición y excepción. Cada regla requiere cotejo con decisión posterior, Contexto/Plan Maestro autorizado y código `main`. No se han firmado revisiones humanas ni ejecutado pruebas conductuales de los agentes. Estos son **contratos de regresión por validar**, no órdenes para imponer estados históricos como norma vigente.

**Activación:** al investigar un issue, leer solo el dominio relevante de este catálogo, recuperar la fuente original enlazada y contrastar código del SHA actual. Usar JL/XMOD para recorrer los consumidores indirectos. Una contradicción es `BRECHA PLAN ↔ CÓDIGO` o `PENDIENTE`, no un permiso de improvisar.

## Proceso

- **AB-0001 · [fuente L3](fuente-original/00-entrada.md#L3)**: Investigar y planificar antes de escribir código, con R3 posterior a autorización. **Condición:** Antes de implementar. **Excepción/límite:** Tres ciclos completos previos con R3 se contradicen (#704). **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0002 · [fuente L5](fuente-original/00-entrada.md#L5)**: No implementar sin autorización del plan/fase aplicable. **Condición:** Tras concluir investigación. **Excepción/límite:** No repetir tres aprobaciones idénticas (#704). **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0157 · [fuente L669](fuente-original/04-protocolo-anterior.md#L3)**: Iteraciones comparten resultado y refutan hipótesis. **Condición:** Diseño R1 R2. **Excepción/límite:** R3 no entra antes de aprobación (#704). **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0158 · [fuente L677](fuente-original/04-protocolo-anterior.md#L11)**: Buscar fuentes primarias verificables. **Condición:** Ronda R1. **Excepción/límite:** No inventar patrones en producción. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0159 · [fuente L679](fuente-original/04-protocolo-anterior.md#L13)**: Comparar 2-3 soluciones realmente usadas cuando existan. **Condición:** Investigación de solución. **Excepción/límite:** Si no hay precedentes, etiquetar NO VERIFICADO. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0160 · [fuente L683](fuente-original/04-protocolo-anterior.md#L17)**: Examinar impacto sobre migraciones y dependencias. **Condición:** Ronda R2. **Excepción/límite:** No presentar plan sin riesgo. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0161 · [fuente L684](fuente-original/04-protocolo-anterior.md#L18)**: Buscar vulnerabilidades y hacks obsoletos. **Condición:** Ronda R2. **Excepción/límite:** No asumir madurez por popularidad. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0162 · [fuente L685](fuente-original/04-protocolo-anterior.md#L19)**: Documentar archivos, tests y criterios de éxito. **Condición:** Antes de implementación. **Excepción/límite:** No inventar aprobación UX. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0163 · [fuente L686](fuente-original/04-protocolo-anterior.md#L20)**: Presentar plan para aprobación humana. **Condición:** Tras R2 final. **Excepción/límite:** No inferir silencio como permiso. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0164 · [fuente L689](fuente-original/04-protocolo-anterior.md#L23)**: Implementar exclusivamente plan aprobado. **Condición:** R3. **Excepción/límite:** No programar durante INVESTIGAR. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0165 · [fuente L690](fuente-original/04-protocolo-anterior.md#L24)**: Correr tests, typecheck y criterios de aceptación. **Condición:** Después de código. **Excepción/límite:** No certificar sin evidencia. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0166 · [fuente L691](fuente-original/04-protocolo-anterior.md#L25)**: Volver a investigar cuando falla. **Condición:** R3 con error. **Excepción/límite:** No corregir a ciegas. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0167 · [fuente L692](fuente-original/04-protocolo-anterior.md#L26)**: No marcar completo sin evidencia. **Condición:** Afirmar validación. **Excepción/límite:** Logs/capturas verificables. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0168 · [fuente L698](fuente-original/04-protocolo-anterior.md#L32)**: Decir NO VERIFICADO sin fuente confiable. **Condición:** Investigación incompleta. **Excepción/límite:** No usar test hipotético como prueba. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0169 · [fuente L699](fuente-original/04-protocolo-anterior.md#L33)**: Etiquetar experimental de alto riesgo. **Condición:** Nueva solución sin apoyo. **Excepción/límite:** No presentarla como validada. **Estado:** PREANÁLISIS, revisar vigencia.

## UX

- **AB-0003 · [fuente L7](fuente-original/00-entrada.md#L7)**: Requerir maqueta escritorio y móvil aprobada por PO antes de cambios UI/UX. **Condición:** Cambio visual o de experiencia. **Excepción/límite:** Backend aprobado no aprueba maqueta; incluir confirmación, carga, error, cambios posteriores. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0067 · [fuente L368](fuente-original/02-historico-incidencias.md#L21)**: No equiparar emulación Playwright a teclado OSK real. **Condición:** QA móvil login. **Excepción/límite:** Se necesita dispositivo o device farm para certeza física. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0125 · [fuente L575](fuente-original/02-historico-incidencias.md#L228)**: Mostrar pagos al personal sección propia. **Condición:** UI cierre. **Excepción/límite:** No cambiar montos por reordenar presentación. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0127 · [fuente L582](fuente-original/02-historico-incidencias.md#L235)**: Solicitar observación si hay diferencia de stock. **Condición:** Producción en cierre. **Excepción/límite:** No imponerla sin diferencia. **Estado:** PREANÁLISIS, revisar vigencia.

## Entrega

- **AB-0004 · [fuente L9](fuente-original/00-entrada.md#L9)**: Una fase tiene una rama y un PR, partiendo de main verificado. **Condición:** Trabajo por fases. **Excepción/límite:** Stack explícito documentado puede admitirse, nunca silencioso. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0170 · [fuente L709](fuente-original/05-flujo-entrega-anterior.md#L5)**: Una fase por rama y PR. **Condición:** Entrega por fases. **Excepción/límite:** Stack explícito y trazado aceptable, nunca silencioso. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0171 · [fuente L711](fuente-original/05-flujo-entrega-anterior.md#L7)**: Fase termina al verificar main post-merge. **Condición:** Después de merge. **Excepción/límite:** PR listo no es integración. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0172 · [fuente L713](fuente-original/05-flujo-entrega-anterior.md#L9)**: Feature flag OFF no prueba seguridad por sí mismo. **Condición:** Merge de fase gated. **Excepción/límite:** Imports config y migraciones pueden impactar. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0173 · [fuente L720](fuente-original/05-flujo-entrega-anterior.md#L16)**: Aprobación del plan con criterios claros. **Condición:** Antes de fase. **Excepción/límite:** No arrancar requisitos ambiguos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0174 · [fuente L723](fuente-original/05-flujo-entrega-anterior.md#L19)**: Rama desde main actualizado. **Condición:** Iniciar fase. **Excepción/límite:** No ramificar de PR sin documentar stack. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0175 · [fuente L725](fuente-original/05-flujo-entrega-anterior.md#L21)**: Evitar refactor no relacionado. **Condición:** Durante fase. **Excepción/límite:** Solo cambios necesarios trazados. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0176 · [fuente L729](fuente-original/05-flujo-entrega-anterior.md#L25)**: Typecheck lint unit y E2E según impacto. **Condición:** Validar fase. **Excepción/límite:** Reejecutar tras rebase. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0177 · [fuente L731](fuente-original/05-flujo-entrega-anterior.md#L27)**: No avanzar con fallos conocidos. **Condición:** Validación. **Excepción/límite:** Corregir y repetir. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0178 · [fuente L735](fuente-original/05-flujo-entrega-anterior.md#L31)**: Resolver rebase por intención semántica. **Condición:** Conflicto de ramas. **Excepción/límite:** No ours/theirs mecánico en dinero y seguridad. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0179 · [fuente L737](fuente-original/05-flujo-entrega-anterior.md#L33)**: Force-with-lease si es necesario. **Condición:** Historia publicada reescrita. **Excepción/límite:** No force genérico. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0180 · [fuente L738](fuente-original/05-flujo-entrega-anterior.md#L34)**: Revalidar por completo tras rebase. **Condición:** Main actualizado. **Excepción/límite:** Git no detecta conflictos semánticos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0181 · [fuente L743](fuente-original/05-flujo-entrega-anterior.md#L39)**: PR describe pruebas reales y límites. **Condición:** Abrir PR. **Excepción/límite:** No afirmar QA imaginaria. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0182 · [fuente L744](fuente-original/05-flujo-entrega-anterior.md#L40)**: Autoría debe ser veraz. **Condición:** Firma PR. **Excepción/límite:** No atribuir Claude si no participó. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0183 · [fuente L747](fuente-original/05-flujo-entrega-anterior.md#L43)**: Revisar CI y checks aplicables. **Condición:** Antes de merge. **Excepción/límite:** No asumir required por nombre. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0184 · [fuente L750](fuente-original/05-flujo-entrega-anterior.md#L46)**: Comparar E2E contra baseline main. **Condición:** Shards rojos. **Excepción/límite:** Firma y test, no solo cantidad. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0185 · [fuente L753](fuente-original/05-flujo-entrega-anterior.md#L49)**: Test skip no garantiza no-regresión. **Condición:** Specs gated. **Excepción/límite:** Revisar imports y fixtures compartidas. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0186 · [fuente L757](fuente-original/05-flujo-entrega-anterior.md#L53)**: Corregir fallos atribuibles antes de merge. **Condición:** Review/QA detecta problema. **Excepción/límite:** No ignorar fallos nuevos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0187 · [fuente L761](fuente-original/05-flujo-entrega-anterior.md#L57)**: Merge necesita aprobación independiente. **Condición:** Antes de fusionar. **Excepción/límite:** Plan aprobado no autoriza producción. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0189 · [fuente L767](fuente-original/05-flujo-entrega-anterior.md#L63)**: Usar worktree separado para verificación. **Condición:** Postmerge. **Excepción/límite:** No perturbar checkout compartido. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0190 · [fuente L769](fuente-original/05-flujo-entrega-anterior.md#L65)**: Verificar main real postmerge. **Condición:** Después de fusionar. **Excepción/límite:** CI PR no sustituye postmerge. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0191 · [fuente L770](fuente-original/05-flujo-entrega-anterior.md#L66)**: Rollback exige evaluar datos y migraciones. **Condición:** Main inestable. **Excepción/límite:** Revert no es remedio universal. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0192 · [fuente L790](fuente-original/05-flujo-entrega-anterior.md#L86)**: No apilar fases silenciosamente. **Condición:** Dependencia entre ramas. **Excepción/límite:** Stacks explícitos documentados sí. **Estado:** PREANÁLISIS, revisar vigencia.

## Tecnología

- **AB-0005 · [fuente L14](fuente-original/00-entrada.md#L14)**: Consultar documentación Next.js instalada antes del código. **Condición:** APIs sujetas a breaking changes. **Excepción/límite:** La memoria del modelo no sustituye la referencia de versión. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0006 · [fuente L41](fuente-original/01-arquitectura-tecnica.md#L25)**: Verificar que las dependencias quedan con versiones pinned. **Condición:** Cambios en package.json. **Excepción/límite:** Un PR histórico no garantiza la versión actual. **Estado:** PREANÁLISIS, revisar vigencia.

## Base

- **AB-0007 · [fuente L45](fuente-original/01-arquitectura-tecnica.md#L29)**: Usar PostgreSQL como proveedor único. **Condición:** Dev y prod. **Excepción/límite:** No crear SQLite paralelo. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0008 · [fuente L49](fuente-original/01-arquitectura-tecnica.md#L33)**: Prohibir crear schema SQLite. **Condición:** Cualquier migración. **Excepción/límite:** La decisión no se revoca por conveniencia técnica. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0013 · [fuente L120](fuente-original/01-arquitectura-tecnica.md#L104)**: Proteger secuencias con advisory locks. **Condición:** Numeración concurrente. **Excepción/límite:** Comprobar código actual de secuencias. **Estado:** PREANÁLISIS, revisar vigencia.

## Dinero

- **AB-0009 · [fuente L50](fuente-original/01-arquitectura-tecnica.md#L34)**: Conservar precisión de campos monetarios Decimal. **Condición:** Cálculos Prisma. **Excepción/límite:** Number requiere comprobar límites y redondeo; no cambiar cifras. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0065 · [fuente L350](fuente-original/02-historico-incidencias.md#L3)**: Cast Decimal con precisión y centavos documentados. **Condición:** Aritmética Prisma. **Excepción/límite:** Number no autoriza pérdida de precisión. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0098 · [fuente L512](fuente-original/02-historico-incidencias.md#L165)**: Verificar Pago en DB, no solo HTTP. **Condición:** E2E monetario. **Excepción/límite:** No dar por correcto pago con estadoPago incorrecto. **Estado:** PREANÁLISIS, revisar vigencia.

## Fiados

- **AB-0010 · [fuente L114](fuente-original/01-arquitectura-tecnica.md#L98)**: Diferenciar importe comercial y deuda exigible. **Condición:** Entrega parcial. **Excepción/límite:** Usar leerExigibles y no el saldo comercial como deuda. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0011 · [fuente L114](fuente-original/01-arquitectura-tecnica.md#L98)**: Compartir valorEntregadoPedidoCentavos entre cierre y Dashboard. **Condición:** Si mismo corte y definición. **Excepción/límite:** No reconstruir cierres pasados ni equiparar métricas distintas. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0012 · [fuente L114](fuente-original/01-arquitectura-tecnica.md#L98)**: Mostrar Por conciliar ante evidencia parcial insuficiente. **Condición:** Si exigibilidad no demostrada. **Excepción/límite:** No inventar deuda cero; mantener cobro FIFO. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0024 · [fuente L156](fuente-original/01-arquitectura-tecnica.md#L140)**: Cobrar pedido individual solo si cliente real, entregado con saldo. **Condición:** Se indica pedidoId. **Excepción/límite:** Si incumple retornar error y remitir a Fiados. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0025 · [fuente L156](fuente-original/01-arquitectura-tecnica.md#L140)**: Cobrar pedido individual solo si entrega hoy Bogotá. **Condición:** PedidoId puntual. **Excepción/límite:** Usar entregadoAt, fallback fecha pedido; no usar fecha UTC sin conversión. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0026 · [fuente L156](fuente-original/01-arquitectura-tecnica.md#L140)**: Respetar FIFO y deuda anterior en cobro puntual. **Condición:** Si pedido tenía promesaPagoFecha o deuda anterior. **Excepción/límite:** 409 explicativo; nunca aplicar dinero a pedido equivocado. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0027 · [fuente L156](fuente-original/01-arquitectura-tecnica.md#L140)**: Rechazar sobrepago de cobro puntual. **Condición:** Si supera saldo del pedido. **Excepción/límite:** No generar saldo a favor; MONTO_EXCEDE_PEDIDO. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0028 · [fuente L156](fuente-original/01-arquitectura-tecnica.md#L140)**: Mantener FIFO y versionDeuda en flujo general. **Condición:** Sin pedidoId. **Excepción/límite:** No mutar ese flujo por habilitar cobro puntual. **Estado:** PREANÁLISIS, revisar vigencia.

## Seguridad

- **AB-0014 · [fuente L127](fuente-original/01-arquitectura-tecnica.md#L111)**: Separar rate limit general y rutas excluidas. **Condición:** API y servicios protegidos. **Excepción/límite:** Excepciones health/cron y realtime propio. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0015 · [fuente L128](fuente-original/01-arquitectura-tecnica.md#L112)**: Redirigir páginas sin sesión a login con callbackUrl. **Condición:** Acceso a páginas. **Excepción/límite:** API no debe responder HTML por analogía. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0016 · [fuente L129](fuente-original/01-arquitectura-tecnica.md#L113)**: Configurar Redis v5 compatible con limitador y fallback. **Condición:** Si Redis falla. **Excepción/límite:** In-memory no equivale a control distribuido. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0017 · [fuente L140](fuente-original/01-arquitectura-tecnica.md#L124)**: Autenticar antes del rate-limit Redis. **Condición:** API no autenticada. **Excepción/límite:** Handlers mantienen requireAuth; rutas excluidas no se alteran. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0053 · [fuente L233](fuente-original/01-arquitectura-tecnica.md#L217)**: Expandir URLs cortas Maps solo server-side con allowlist. **Condición:** Redirecciones externas. **Excepción/límite:** Máximo cinco y timeout histórico de ocho segundos; prevenir SSRF. **Estado:** PREANÁLISIS, revisar vigencia.

## Offline

- **AB-0018 · [fuente L144](fuente-original/01-arquitectura-tecnica.md#L128)**: Encolar mutación offline en Dexie solo bajo contrato soportado. **Condición:** Sin conectividad. **Excepción/límite:** No encolar rechazo lógico HTTP. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0019 · [fuente L146](fuente-original/01-arquitectura-tecnica.md#L130)**: Usar timeout controlado en fetchResilient. **Condición:** Solicitudes resilientes. **Excepción/límite:** El valor histórico de 10 segundos se debe verificar en main. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0020 · [fuente L147](fuente-original/01-arquitectura-tecnica.md#L131)**: Distinguir error de red/timeout para enqueue. **Condición:** TypeError o AbortError. **Excepción/límite:** HTTP 4xx/5xx no se encola automáticamente. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0021 · [fuente L150](fuente-original/01-arquitectura-tecnica.md#L134)**: No asumir que flag de fetch protege otros efectos. **Condición:** Rollback por feature flag. **Excepción/límite:** OFF no significa código muerto universal. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0022 · [fuente L153](fuente-original/01-arquitectura-tecnica.md#L137)**: Crear offlineId por borrador, nunca por reintento. **Condición:** Crear pedido. **Excepción/límite:** Reintento fallido conserva identificador y deduped muestra pedido existente. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0023 · [fuente L155](fuente-original/01-arquitectura-tecnica.md#L139)**: Conservar semántica offlineId de Pago indexado no único. **Condición:** Reintentos de pagar-fiado. **Excepción/límite:** Resumen se reconstruye desde Pagos, no imponer unicidad nueva. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0029 · [fuente L157](fuente-original/01-arquitectura-tecnica.md#L141)**: Deduplicar lote recurrente por recurrenteBatchId. **Condición:** Generación recurrente. **Excepción/límite:** Índice no único y lote devuelve conjunto existente. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0030 · [fuente L158](fuente-original/01-arquitectura-tecnica.md#L142)**: Conservar idempotencia de DELETE embarque por estado. **Condición:** Eliminar embarque reintentado. **Excepción/límite:** No exigir offlineId idéntico a PUT. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0031 · [fuente L159](fuente-original/01-arquitectura-tecnica.md#L143)**: Proteger POST clientes con offlineId único. **Condición:** Reintento offline. **Excepción/límite:** No crear duplicados. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0032 · [fuente L160](fuente-original/01-arquitectura-tecnica.md#L144)**: Proteger POST producción con offlineId único. **Condición:** Reintento offline. **Excepción/límite:** Devolver Produccion existente y deduped. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0033 · [fuente L162](fuente-original/01-arquitectura-tecnica.md#L146)**: Drenar requestQueue y syncQueue heredada. **Condición:** Vuelta a conexión. **Excepción/límite:** No perder pedidos/clientes IndexedDB antiguos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0034 · [fuente L163](fuente-original/01-arquitectura-tecnica.md#L147)**: Retirar entrada encolada solo con éxito o dedup de conflicto. **Condición:** Replay requestQueue. **Excepción/límite:** Otros HTTP o fallos red retienen entrada; distinguir 409 lógico. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0035 · [fuente L164](fuente-original/01-arquitectura-tecnica.md#L148)**: Toasts diferentes para online/offline encolado/error. **Condición:** Resultado de mutación. **Excepción/límite:** Offline en cola no equivale a éxito definitivo. **Estado:** PREANÁLISIS, revisar vigencia.

## Datos

- **AB-0036 · [fuente L172](fuente-original/01-arquitectura-tecnica.md#L156)**: Conservar cascade solo para DELETE real del padre. **Condición:** ContactoCliente y PlantillaProducto. **Excepción/límite:** Soft-delete no borra hijos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0037 · [fuente L175](fuente-original/01-arquitectura-tecnica.md#L159)**: Hidratar productos legacy cuando consumidor lo necesita. **Condición:** Leer PlantillaProducto. **Excepción/límite:** ContactoCliente nativo no necesita hidratación similar. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0038 · [fuente L176](fuente-original/01-arquitectura-tecnica.md#L160)**: Buscar contacto por relación Prisma. **Condición:** Filtro teléfono. **Excepción/límite:** No reintroducir JSON path eliminado. **Estado:** PREANÁLISIS, revisar vigencia.

## Contradicciones

- **AB-0039 · [fuente L178](fuente-original/01-arquitectura-tecnica.md#L162)**: No tratar CRUD de contactos como pendiente por solo leer nota antigua. **Condición:** Diagnóstico contactos. **Excepción/límite:** Known Issue #11 posterior detalla implementación; revisar main. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0080 · [fuente L405](fuente-original/02-historico-incidencias.md#L58)**: No contar bloque duplicado #13 como contrato independiente. **Condición:** Reconciliación URL. **Excepción/límite:** Conservar dos referencias originales. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0104 · [fuente L525](fuente-original/02-historico-incidencias.md#L178)**: No elevar a regla general el supuesto «todos los pagos salen de efectivo». **Condición:** Revisar cierre, nómina y comisiones por método y momento de pago. **Excepción/límite:** `main` `ef0bc0d`, `src/lib/cierre-totales.ts` L17-25, aún resta todos los gastos y comisiones del efectivo esperado; su veracidad y consecuencias son BRECHA/SUPUESTO TÉCNICO POR VALIDAR con decisiones posteriores, no una política aprobada ni autorización para cambiar importes. **Estado:** CONTRASTE_TECNICO_PARCIAL.
- **AB-0144 · [fuente L621](fuente-original/02-historico-incidencias.md#L274)**: **Hallazgo técnico histórico superado en `main` `ef0bc0d`**: `/api/cierre-dia` expone `GET` pero no `POST` (anulado en #691); no existe ese bypass concreto. **Condición:** Al auditar cierre y base de caja, verificar `POST /api/cierre` y otros escritores reales. **Excepción/límite:** La ausencia de aquel `POST` no prueba que toda ruta de cierre carezca de bypass. **Estado:** HISTORICO_SUPERADO_POR_CODIGO, no recrear un bug.

## PWA

- **AB-0040 · [fuente L183](fuente-original/01-arquitectura-tecnica.md#L167)**: Usar Serwist como generación del SW. **Condición:** Build PWA. **Excepción/límite:** public/sw.js es fallback histórico, no fuente actual. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0041 · [fuente L185](fuente-original/01-arquitectura-tecnica.md#L169)**: Network-first navegación, cache-first assets. **Condición:** Estrategia PWA. **Excepción/límite:** APIs no se cachean. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0042 · [fuente L186](fuente-original/01-arquitectura-tecnica.md#L170)**: Evitar reloadOnOnline si hay operaciones sin sincronizar. **Condición:** Reconexión. **Excepción/límite:** No perder estado del usuario. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0043 · [fuente L187](fuente-original/01-arquitectura-tecnica.md#L171)**: Mantener revisión de clientsClaim contra SSR streaming. **Condición:** Service worker. **Excepción/límite:** No habilitar ciegamente si deja blanco. **Estado:** PREANÁLISIS, revisar vigencia.

## Roles

- **AB-0044 · [fuente L193](fuente-original/01-arquitectura-tecnica.md#L177)**: Redirigir tras login por rol. **Condición:** ADMIN ASISTENTE REPARTIDOR CONTADOR. **Excepción/límite:** Redirección no amplía permisos. **Estado:** PREANÁLISIS, revisar vigencia.

## Arquitectura

- **AB-0045 · [fuente L212](fuente-original/01-arquitectura-tecnica.md#L196)**: Comprobar DDD por bounded context antes de introducir capas. **Condición:** Nuevo módulo. **Excepción/límite:** El piloto Dashboard no obliga migrar todo. **Estado:** PREANÁLISIS, revisar vigencia.

## Ventas

- **AB-0046 · [fuente L215](fuente-original/01-arquitectura-tecnica.md#L199)**: Preservar id canónico CONSUMIDOR_FINAL. **Condición:** VENTA_RAPIDA y VENTA_LIBRE anónimas. **Excepción/límite:** No crear cliente nuevo por venta. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0047 · [fuente L217](fuente-original/01-arquitectura-tecnica.md#L201)**: No listar canónico como cliente ordinario. **Condición:** Ficheros seed y listados. **Excepción/límite:** Conservar id para integridad histórica. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0048 · [fuente L219](fuente-original/01-arquitectura-tecnica.md#L203)**: Lookup-or-create de CONSUMIDOR_FINAL con ID literal. **Condición:** Canónico ausente en entorno. **Excepción/límite:** No generar CUID diferente. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0095 · [fuente L504](fuente-original/02-historico-incidencias.md#L157)**: No conceder saldo a favor a CONSUMIDOR_FINAL. **Condición:** Venta anónima. **Excepción/límite:** El excedente es cambio. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0096 · [fuente L505](fuente-original/02-historico-incidencias.md#L158)**: Rechazar deuda pendiente en venta anónima. **Condición:** Cobro insuficiente. **Excepción/límite:** 422 DEUDOR_REQUERIDO y no crear crédito falso. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0097 · [fuente L506](fuente-original/02-historico-incidencias.md#L159)**: Registrar pago real en Hub con recibido/cambio/aplicado. **Condición:** Pagos mixtos. **Excepción/límite:** Solo aplicado se persiste como pago. **Estado:** PREANÁLISIS, revisar vigencia.

## Geografía

- **AB-0049 · [fuente L223](fuente-original/01-arquitectura-tecnica.md#L207)**: **Afirmación histórica incompleta**: negocio precedía a cliente. **Estado técnico contrastado en `main` `ef0bc0d`**: `pickCoords()` prioriza destino propio del `Pedido` → `Negocio` → `Cliente`. **Condición:** Usar primera pareja de coordenadas válida para el pedido. **Excepción/límite:** Si ninguna fuente válida devolver `null`; verificar aprobación de destino propio en decisiones del PO y los cinco consumidores. **Estado:** CONTRASTE_TECNICO_VERIFICADO, decisión de producto pendiente de rastrear.
- **AB-0050 · [fuente L224](fuente-original/01-arquitectura-tecnica.md#L208)**: Ignorar null/undefined antes de Number sobre coordenadas. **Condición:** Fuentes ausentes. **Excepción/límite:** No transformar null en 0/0. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0051 · [fuente L225](fuente-original/01-arquitectura-tecnica.md#L209)**: Unificar coordenadas en SSR repartidor, API, SSR pedidos, TSP y validación GPS. **Condición:** Consumidores de posición. **Excepción/límite:** Mantener fallback legacy de payload. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0052 · [fuente L232](fuente-original/01-arquitectura-tecnica.md#L216)**: Backfill geo: linkUbicacion, luego mediana GPS confirmada. **Condición:** Sin coordenadas negocio. **Excepción/límite:** Auditar en logAudit; no agregar columnas por suposición. **Estado:** PREANÁLISIS, revisar vigencia.

## Integridad

- **AB-0054 · [fuente L258](fuente-original/01-arquitectura-tecnica.md#L242)**: Verificador integridad solo lectura. **Condición:** API/scripts integridad. **Excepción/límite:** No autocorregir transacciones. **Estado:** PREANÁLISIS, revisar vigencia.

## Embarques

- **AB-0055 · [fuente L259](fuente-original/01-arquitectura-tecnica.md#L243)**: Gestión temporal sin embarque apagada por defecto. **Condición:** ADMIN y flag habilitado. **Excepción/límite:** No declararla modo permanente. **Estado:** PREANÁLISIS, revisar vigencia.

## Tiempo real

- **AB-0056 · [fuente L285](fuente-original/01-arquitectura-tecnica.md#L269)**: Revisar SSE autenticado postdeploy. **Condición:** Cuando realtime activo. **Excepción/límite:** No usar credenciales ejemplo de fuente histórica. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0057 · [fuente L297](fuente-original/01-arquitectura-tecnica.md#L281)**: Autenticar endpoint SSE. **Condición:** Con cookie Auth.js. **Excepción/límite:** Broadcast no da permiso a leer entidades. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0058 · [fuente L298](fuente-original/01-arquitectura-tecnica.md#L282)**: Emitir eventos pequeños y refetch del recurso. **Condición:** Cambio multisesión. **Excepción/límite:** No incluir información privada en evento global. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0059 · [fuente L299](fuente-original/01-arquitectura-tecnica.md#L283)**: Tratar broadcast sin filtros de rol como mera notificación. **Condición:** Múltiples roles conectados. **Excepción/límite:** Cada fetch sigue sujeto a permisos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0060 · [fuente L303](fuente-original/01-arquitectura-tecnica.md#L287)**: Mantener una conexión SSE global. **Condición:** Cuando RealtimeProvider activo. **Excepción/límite:** No crear SSE por pantalla. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0061 · [fuente L304](fuente-original/01-arquitectura-tecnica.md#L288)**: Pausar SSE si pestaña no visible. **Condición:** document.hidden. **Excepción/límite:** No marcar el negocio offline solo por ausencia SSE. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0062 · [fuente L305](fuente-original/01-arquitectura-tecnica.md#L289)**: Respetar conexión 2g/slow-2g. **Condición:** navigator.connection disponible. **Excepción/límite:** No mantener streaming en enlace lento contra contrato. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0063 · [fuente L306](fuente-original/01-arquitectura-tecnica.md#L290)**: Reconectar SSE con backoff exponencial. **Condición:** Fallo recuperable. **Excepción/límite:** No reconectar instantáneamente ante rate limit. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0064 · [fuente L339](fuente-original/01-arquitectura-tecnica.md#L323)**: Sin Redis realtime degrada de forma definida. **Condición:** Falta REDIS_URL. **Excepción/límite:** No romper otras rutas; no simular pub/sub. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0082 · [fuente L427](fuente-original/02-historico-incidencias.md#L80)**: Rate limit realtime señalizado sin bucles de 429. **Condición:** Alcanzar límite SSE. **Excepción/límite:** Backoff/fallback; no provocar costos repetidos. **Estado:** PREANÁLISIS, revisar vigencia.

## Autenticación

- **AB-0066 · [fuente L356](fuente-original/02-historico-incidencias.md#L9)**: Separar NEXTAUTH_URL dev y producción por host. **Condición:** Localhost o LAN. **Excepción/límite:** En prod dominio público; en dev no forzar host equivocado. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0081 · [fuente L419](fuente-original/02-historico-incidencias.md#L72)**: No purgar cola offline solo por expiración JWT. **Condición:** Auth caducada. **Excepción/límite:** Replay valida 401 y no implica limpiar pendientes. **Estado:** PREANÁLISIS, revisar vigencia.

## Contactos

- **AB-0068 · [fuente L371](fuente-original/02-historico-incidencias.md#L24)**: Crear contacto único por cliente/teléfono. **Condición:** POST contactos. **Excepción/límite:** 409 ante duplicado. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0069 · [fuente L372](fuente-original/02-historico-incidencias.md#L25)**: PATCH contacto requiere algún campo y unicidad. **Condición:** Actualizar parcialmente. **Excepción/límite:** 409 si colisión teléfono. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0070 · [fuente L373](fuente-original/02-historico-incidencias.md#L26)**: No revelar contacto de otro cliente en DELETE. **Condición:** Contacto ajeno. **Excepción/límite:** 404 sin fuga de pertenencia. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0071 · [fuente L375](fuente-original/02-historico-incidencias.md#L28)**: Sincronizar contactos tras guardar cambios. **Condición:** Form contactos. **Excepción/límite:** Si POST deduped no sobrescribir contactos del existente. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0072 · [fuente L380](fuente-original/02-historico-incidencias.md#L33)**: Omitir sync de contactos en creación deduplicada. **Condición:** POST cliente deduped. **Excepción/límite:** Evita corrupción del cliente original. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0073 · [fuente L382](fuente-original/02-historico-incidencias.md#L35)**: Editar productos recurrentes solo en su editor canónico. **Condición:** Formulario Clientes muestra productos. **Excepción/límite:** No duplicar editor ni inventar subendpoints. **Estado:** PREANÁLISIS, revisar vigencia.

## Migraciones

- **AB-0074 · [fuente L396](fuente-original/02-historico-incidencias.md#L49)**: No hacer migrate deploy en dev sin reconciliar historial. **Condición:** DB creada por db push sin migrations. **Excepción/límite:** Nota posterior dice prod migrada, verificar DB actual. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0075 · [fuente L399](fuente-original/02-historico-incidencias.md#L52)**: No declarar historial migratorio actual con dato de julio. **Condición:** Al modificar esquema. **Excepción/límite:** Verificar estado actual antes de ejecutar SQL. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0188 · [fuente L764](fuente-original/05-flujo-entrega-anterior.md#L60)**: Migración previa compatible antes de deploy inmediato. **Condición:** Nueva columna Prisma. **Excepción/límite:** Requiere permiso y verificación en Supabase; git revert no revierte DB. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0193 · [fuente L796](fuente-original/05-flujo-entrega-anterior.md#L92)**: Dev db push vs prod migraciones verificar. **Condición:** Preparar esquema. **Excepción/límite:** Notas antiguas pueden diferir de producción actual. **Estado:** PREANÁLISIS, revisar vigencia.

## Pedidos

- **AB-0076 · [fuente L401](fuente-original/02-historico-incidencias.md#L54)**: Separar filtros URL persistentes de triggers temporales. **Condición:** Pantalla pedidos. **Excepción/límite:** No perder contexto al volver. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0077 · [fuente L402](fuente-original/02-historico-incidencias.md#L55)**: Abrir creación con new=1 y limpiar tras abrir. **Condición:** Query de nuevo pedido. **Excepción/límite:** clienteId filtra, negocioId preselecciona solo en trigger. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0078 · [fuente L403](fuente-original/02-historico-incidencias.md#L56)**: Abrir detalle con openPedido y fallback GET por id. **Condición:** Pedido fuera de página cargada. **Excepción/límite:** Toast por inexistencia, acceso o error red. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0079 · [fuente L404](fuente-original/02-historico-incidencias.md#L57)**: No dar doble sentido a clienteId en URL. **Condición:** Enlaces Ver pedidos y Crear pedido. **Excepción/límite:** Filtro no abre modal; crear exige new=1. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0094 · [fuente L499](fuente-original/02-historico-incidencias.md#L152)**: Cambiar query de misma ruta con shallowParams si requiere. **Condición:** Pantalla usa useShallowSearchParams. **Excepción/límite:** Link RSC de misma página puede no comunicar cambio. **Estado:** PREANÁLISIS, revisar vigencia.

## Fechas

- **AB-0083 · [fuente L434](fuente-original/02-historico-incidencias.md#L87)**: Soportar rangos parciales y fechas Bogotá. **Condición:** Si solo desde o hasta. **Excepción/límite:** No usar fecha UTC como hoy local después de 19h. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0084 · [fuente L437](fuente-original/02-historico-incidencias.md#L90)**: Revisar cada ruta nueva de fechas fuera del helper. **Condición:** Rutas no migradas. **Excepción/límite:** No asumir fix sistémico completo. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0124 · [fuente L571](fuente-original/02-historico-incidencias.md#L224)**: Diferenciar día pedido de día entrega. **Condición:** Ventas dinero vs unidades. **Excepción/límite:** No contabilizar unidad por creación si entrega otro día. **Estado:** PREANÁLISIS, revisar vigencia.

## Precios

- **AB-0085 · [fuente L440](fuente-original/02-historico-incidencias.md#L93)**: Preview precios da prioridad a Negocio sobre Cliente. **Condición:** Negocio con precios especiales. **Excepción/límite:** Descartar respuestas stale y coincidir con cobro real. **Estado:** PREANÁLISIS, revisar vigencia.

## Caché

- **AB-0086 · [fuente L442](fuente-original/02-historico-incidencias.md#L95)**: Prohibir caché listados con key idéntica para filtros distintos. **Condición:** Cache de /clientes. **Excepción/límite:** Invalidar al mutar y variar por parámetros. **Estado:** PREANÁLISIS, revisar vigencia.

## Clientes

- **AB-0087 · [fuente L453](fuente-original/02-historico-incidencias.md#L106)**: Negocio formal es entidad Negocio activa. **Condición:** Filtro mostrarNegocio. **Excepción/límite:** Nombre legacy no cuenta como negocio formal. **Estado:** PREANÁLISIS, revisar vigencia.

## E2E

- **AB-0088 · [fuente L459](fuente-original/02-historico-incidencias.md#L112)**: Resets DB invalidan sesiones ajenas. **Condición:** E2E paralelos. **Excepción/límite:** Advisory lock no aísla sesiones entre workers. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0089 · [fuente L463](fuente-original/02-historico-incidencias.md#L116)**: No afirmar aislamiento DB cross-worker implementado. **Condición:** Al subir PW_WORKERS. **Excepción/límite:** Pendiente; requerir DB/schema por worker. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0090 · [fuente L466](fuente-original/02-historico-incidencias.md#L119)**: No subir workers CI sin aislamiento fiable. **Condición:** Si se busca acelerar tests. **Excepción/límite:** Workers 2 fue revertido tras flaky. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0091 · [fuente L474](fuente-original/02-historico-incidencias.md#L127)**: No declarar lock_timeout solución total de shard. **Condición:** Fallos DB_TIMEOUT persisten. **Excepción/límite:** Log oculto por stdio ignore requiere análisis. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0093 · [fuente L489](fuente-original/02-historico-incidencias.md#L142)**: No desactivar E2E ante deuda de lint. **Condición:** Trabajar CI. **Excepción/límite:** Baseline debe compararse por caso/firma. **Estado:** PREANÁLISIS, revisar vigencia.

## Filtros

- **AB-0092 · [fuente L486](fuente-original/02-historico-incidencias.md#L139)**: Sincronizar búsqueda respetando committed URL. **Condición:** Input cliente y filtros. **Excepción/límite:** No pisar borrador por prop stale. **Estado:** PREANÁLISIS, revisar vigencia.

## Facturas

- **AB-0099 · [fuente L516](fuente-original/02-historico-incidencias.md#L169)**: Filtrar/ordenar/calcular factura en servidor. **Condición:** Resultados paginados. **Excepción/límite:** Anuladas fuera de totales salvo switch, tab estado no filtra KPI. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0100 · [fuente L517](fuente-original/02-historico-incidencias.md#L170)**: ASISTENTE lee búsqueda facturas pero no crea. **Condición:** Permisos búsqueda. **Excepción/límite:** Creación sigue ADMIN CONTADOR. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0101 · [fuente L518](fuente-original/02-historico-incidencias.md#L171)**: Resumen facturas historia completa. **Condición:** Sin rango fecha. **Excepción/límite:** Solo ADMIN CONTADOR. **Estado:** PREANÁLISIS, revisar vigencia.

## Caja

- **AB-0102 · [fuente L523](fuente-original/02-historico-incidencias.md#L176)**: Comparar conteo físico con efectivo esperado. **Condición:** Cierre con efectivo y digital. **Excepción/límite:** Neto digital es otra métrica; sumar abonos efectivo menos egresos efectivo. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0103 · [fuente L524](fuente-original/02-historico-incidencias.md#L177)**: No reescribir cierres históricos. **Condición:** Cambiar cálculo actual. **Excepción/límite:** Avisar al ver históricos con regla previa. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0111 · [fuente L539](fuente-original/02-historico-incidencias.md#L192)**: Cierre no recibe salario manual duplicado. **Condición:** Después #644. **Excepción/límite:** Cierres anteriores se conservan. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0120 · [fuente L563](fuente-original/02-historico-incidencias.md#L216)**: Separar ventas de hoy de cobros de cartera por medio. **Condición:** Desglose cierre. **Excepción/límite:** Descuadre avisa pero no bloquea; total cuadra cobroVentasHoy+cobroCartera. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0121 · [fuente L563](fuente-original/02-historico-incidencias.md#L216)**: Listar fiados del día incluidas parciales. **Condición:** Al calcular fiadosDelDia. **Excepción/límite:** El total concilia con fiado del corte. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0122 · [fuente L564](fuente-original/02-historico-incidencias.md#L217)**: Confirmar pago solo con flag y actor autorizado. **Condición:** PAGO_CONFIRMACION y rol. **Excepción/límite:** Sin permiso informar quién confirma; histórico aviso. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0123 · [fuente L568](fuente-original/02-historico-incidencias.md#L221)**: No comparar efectivo con neto en pantalla. **Condición:** Resumen cierre. **Excepción/límite:** Neto aún se conserva en reporte impreso. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0137 · [fuente L605](fuente-original/02-historico-incidencias.md#L258)**: Moneda $1000 reconocida UI y servidor. **Condición:** Arqueo cierre. **Excepción/límite:** Validar entero >=0, históricos intactos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0141 · [fuente L617](fuente-original/02-historico-incidencias.md#L270)**: Base de caja del día con clave BASE_DIA_fecha. **Condición:** Cierre diario. **Excepción/límite:** No default silencioso de BASE_DIA ni base de otro día. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0142 · [fuente L618](fuente-original/02-historico-incidencias.md#L271)**: Releer base antes de cerrar y mostrar cambios. **Condición:** Edición concurrente. **Excepción/límite:** Sin base bloquear cierre. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0143 · [fuente L619](fuente-original/02-historico-incidencias.md#L272)**: Revalidar base dentro de lock servidor. **Condición:** POST cierre. **Excepción/límite:** 422 faltante o 409 cambio; cliente no es autoridad. **Estado:** PREANÁLISIS, revisar vigencia.

## Producción

- **AB-0105 · [fuente L528](fuente-original/02-historico-incidencias.md#L181)**: Contar entrega parcial en ventas para producción/cierre. **Condición:** Pedido aún pendiente pero con cEnt. **Excepción/límite:** Excluir anulado/cancelado; fecha pedido según métrica. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0112 · [fuente L544](fuente-original/02-historico-incidencias.md#L197)**: Comisión sellador basada en producidos/llenados. **Condición:** Botellones llenos. **Excepción/límite:** No confundir vendidos con llenados. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0114 · [fuente L549](fuente-original/02-historico-incidencias.md#L202)**: Producción fuente única de inventario. **Condición:** Cierre y sección Producción. **Excepción/límite:** No duplicar inicial/producción manual en cierre. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0115 · [fuente L550](fuente-original/02-historico-incidencias.md#L203)**: Producción atrasada solo hoy o siete días, abierta. **Condición:** POST PUT con fecha. **Excepción/límite:** Futuro, demasiado antiguo y cerrado rechazan. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0116 · [fuente L551](fuente-original/02-historico-incidencias.md#L204)**: Consolidar varias producciones del mismo día. **Condición:** Turno o sellador distinto. **Excepción/límite:** JORNADA no coexiste con otro turno del mismo sellador ese día. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0117 · [fuente L552](fuente-original/02-historico-incidencias.md#L205)**: Permitir sin producción declarada en cierre. **Condición:** Día sin producción. **Excepción/límite:** No bloquear cierre por ausencia si se indica. **Estado:** PREANÁLISIS, revisar vigencia.

## Nómina

- **AB-0106 · [fuente L531](fuente-original/02-historico-incidencias.md#L184)**: Solo nómina en efectivo dentro de caja resta de caja. **Condición:** PAGAR con método o fueraDeCaja. **Excepción/límite:** Digital/fuera de caja no crea Gasto de caja. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0107 · [fuente L531](fuente-original/02-historico-incidencias.md#L184)**: Anular nómina revierte solo egreso realmente creado. **Condición:** Pago con Gasto previo. **Excepción/límite:** Histórico sin Gasto no inventa reversión. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0108 · [fuente L532](fuente-original/02-historico-incidencias.md#L185)**: Rechazar gasto NOMINA manual. **Condición:** POST gastos. **Excepción/límite:** 422 NOMINA_NO_ES_GASTO para evitar duplicidad. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0109 · [fuente L537](fuente-original/02-historico-incidencias.md#L190)**: Fijo se calcula por frecuencia y fecha de pago. **Condición:** SEMANAL QUINCENAL MENSUAL FECHAS. **Excepción/límite:** NULL mantiene una vez por nómina; frecuenciaDesde evita retroactivo. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0110 · [fuente L538](fuente-original/02-historico-incidencias.md#L191)**: Pagar sueldo vencido server-side. **Condición:** Fecha vencida sin nómina pagada. **Excepción/límite:** No aceptar monto confiado del cliente. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0113 · [fuente L545](fuente-original/02-historico-incidencias.md#L198)**: Comisiones salen solo de pagos explícitos. **Condición:** Repartidores y selladores. **Excepción/límite:** Recalcular pendiente no descuenta caja otra vez. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0118 · [fuente L553](fuente-original/02-historico-incidencias.md#L206)**: Separar comisión REPARTO de PRODUCCION. **Condición:** Trabajador sellador con moto. **Excepción/límite:** Cada pago en su bloque, nómina agrega sin duplicar. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0126 · [fuente L577](fuente-original/02-historico-incidencias.md#L230)**: Conservar APIs/anti-duplicado al reorganizar pagos. **Condición:** Sección pagos personal. **Excepción/límite:** Pendiente no bloquea cerrar, nómina gestiona. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0128 · [fuente L593](fuente-original/02-historico-incidencias.md#L246)**: Comisión por parcial atribuida a día y repartidor real. **Condición:** Con captura fiable. **Excepción/límite:** Fallback entregadoAt solo completo sin contradicción. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0129 · [fuente L593](fuente-original/02-historico-incidencias.md#L246)**: Si parcial carece de evidencia, por conciliar. **Condición:** Datos incompletos o inválidos. **Excepción/límite:** No inventar unidades ni responsables. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0138 · [fuente L610](fuente-original/02-historico-incidencias.md#L263)**: Desglosar unidades comisión por pedido y sinPedido. **Condición:** Si se solicita detalle cierre. **Excepción/límite:** Nómina no guarda ese detalle, históricos avisan. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0139 · [fuente L612](fuente-original/02-historico-incidencias.md#L265)**: Atribuir entrega al día y persona real. **Condición:** Parciales entre días. **Excepción/límite:** No sumar hecho posterior antes de ocurrir. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0140 · [fuente L613](fuente-original/02-historico-incidencias.md#L266)**: Mostrar SIN_DETALLE si no concilia. **Condición:** Datos históricos insuficientes. **Excepción/límite:** No inventar detalles por UI. **Estado:** PREANÁLISIS, revisar vigencia.

## Inventario

- **AB-0119 · [fuente L558](fuente-original/02-historico-incidencias.md#L211)**: Cuadrar botellón como inicial+llenado-vendido. **Condición:** Conteo final botellón. **Excepción/límite:** Sin pérdidas; sin conteo se presume cuadre; fallback si histórico NULL. **Estado:** PREANÁLISIS, revisar vigencia.

## Trabajadores

- **AB-0130 · [fuente L595](fuente-original/02-historico-incidencias.md#L248)**: Tipo salario no depende de usa moto. **Condición:** SELLADOR REPARTIDOR. **Excepción/límite:** ADMIN CONTADOR fijo; no reescribir históricos. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0131 · [fuente L595](fuente-original/02-historico-incidencias.md#L248)**: Editar contacto no borra tipo salarial. **Condición:** PUT parcial. **Excepción/límite:** Auditar antes/después y no pagar fijo residual en comisión. **Estado:** PREANÁLISIS, revisar vigencia.

## Saldo

- **AB-0132 · [fuente L598](fuente-original/02-historico-incidencias.md#L251)**: Registrar sobrante fiados append-only en misma transacción. **Condición:** monto positivo y medio distinto BONO. **Excepción/límite:** Origen PAGAR_FIADO offlineId auditoriaId. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0133 · [fuente L598](fuente-original/02-historico-incidencias.md#L251)**: Ingreso sobrante atribuido a createdAt por medio. **Condición:** Cierre del día. **Excepción/límite:** Efectivo solo si medio efectivo; digital no entra arqueo físico. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0134 · [fuente L599](fuente-original/02-historico-incidencias.md#L252)**: Dedup ingreso sobrante por origen+offlineId+medio. **Condición:** Reintento de pagar-fiado. **Excepción/límite:** Consumir crédito luego no es nuevo ingreso. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0135 · [fuente L600](fuente-original/02-historico-incidencias.md#L253)**: Dashboard concilia sobrante por auditoría y medio. **Condición:** SOBRANTE_SIN_COBRO. **Excepción/límite:** No emparejar por importe/hora; pasado sin ingreso sigue por conciliar. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0136 · [fuente L602](fuente-original/02-historico-incidencias.md#L255)**: Devolución/corrección propia requiere diseño futuro. **Condición:** Cambios UX saldo recibido. **Excepción/límite:** No está implementada ni autorizada por #524. **Estado:** PREANÁLISIS, revisar vigencia.

## Backlog

- **AB-0145 · [fuente L627](fuente-original/03-reglas-codigo.md#L3)**: Crear Issue antes de nueva tarea y vincular PR. **Condición:** Tarea o hallazgo nuevo. **Excepción/límite:** Verificar duplicados; Closes solo si realmente cierra. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0146 · [fuente L627](fuente-original/03-reglas-codigo.md#L3)**: Todo TODO abandonado requiere ID Issue. **Condición:** Pendiente en código. **Excepción/límite:** No guardar backlog en AGENTS. **Estado:** PREANÁLISIS, revisar vigencia.

## Código

- **AB-0147 · [fuente L633](fuente-original/03-reglas-codigo.md#L9)**: Tipado estricto sin any. **Condición:** Cambiar TS. **Excepción/límite:** No evadir con as any o arrays any. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0148 · [fuente L634](fuente-original/03-reglas-codigo.md#L10)**: Manejar errores reales y registrar con logger. **Condición:** Operación fallible. **Excepción/límite:** Console.log(error) no basta. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0149 · [fuente L635](fuente-original/03-reglas-codigo.md#L11)**: No inventar APIs o flags. **Condición:** Si contrato no verificado. **Excepción/límite:** Consultar docs instaladas y Context7 cuando aplique. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0150 · [fuente L638](fuente-original/03-reglas-codigo.md#L14)**: Avisar bug en solicitud antes de implementar. **Condición:** Requisito defectuoso. **Excepción/límite:** No corregir negocio silenciosamente. **Estado:** PREANÁLISIS, revisar vigencia.

## Fuentes

- **AB-0151 · [fuente L642](fuente-original/03-reglas-codigo.md#L18)**: Priorizar documentación oficial de versión. **Condición:** Cambio librería externa. **Excepción/límite:** Jerarquía producto difiere de técnica. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0152 · [fuente L648](fuente-original/03-reglas-codigo.md#L24)**: No usar respuestas de LLM como fuente probatoria. **Condición:** Sin corroboración externa. **Excepción/límite:** Las decisiones humanas previas sí son evidencia primaria. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0153 · [fuente L655](fuente-original/03-reglas-codigo.md#L31)**: No dar benchmarks sin fuente. **Condición:** Justificar rendimiento. **Excepción/límite:** Estimación no equivale a medición. **Estado:** PREANÁLISIS, revisar vigencia.

## Comunicación

- **AB-0154 · [fuente L660](fuente-original/03-reglas-codigo.md#L36)**: Usar bloques de código con lenguaje. **Condición:** Mostrar código al usuario. **Excepción/límite:** No simular ejecutado. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0155 · [fuente L661](fuente-original/03-reglas-codigo.md#L37)**: Informar archivo y símbolo afectado. **Condición:** Reportar cambios. **Excepción/límite:** Archivo nuevo con path completo. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0156 · [fuente L663](fuente-original/03-reglas-codigo.md#L39)**: Ordenar archivos por dependencia. **Condición:** Múltiples cambios. **Excepción/límite:** No priorizar alfabético sobre causalidad. **Estado:** PREANÁLISIS, revisar vigencia.

## Fuentes y límites

Los seis archivos en [fuente-original/](fuente-original/) preservan exactamente el documento antiguo; son evidencia, **no autoridad normativa paralela**. La matriz [obligaciones_atomicas.csv](auditoria-2026-11/obligaciones_atomicas.csv) conserva 798 posiciones en 810 registros: 354 cláusulas de preanálisis con condiciones/excepciones y 456 referencias de contexto e historia pendientes de revisión de autoridad (223 estructurales y 233 documentales). No confundir inventario de historia con obligación de agente. **No llamar completo ni marcar `VERIFICADA` hasta terminar esos pasajes y obtener revisión humana.** Las notas técnicas históricas no demuestran el estado de `main`.


## Complemento: segunda pasada crítica (113 cláusulas)

- **AB-0811 · [fuente L56](fuente-original/01-arquitectura-tecnica.md#L40)**: Iniciar solo la DB de desarrollo configurada. **Condición:** Setup local autorizado. **Excepción/límite:** No convertir comando docker compose en permiso de tocar prod. **Estado:** PREANÁLISIS.
- **AB-0812 · [fuente L62](fuente-original/01-arquitectura-tecnica.md#L46)**: Usar archivo .env local sin copiar credenciales en repositorio. **Condición:** Configuración dev. **Excepción/límite:** La plantilla es ejemplo, no secreto real ni permiso de producción. **Estado:** PREANÁLISIS.
- **AB-0813 · [fuente L65](fuente-original/01-arquitectura-tecnica.md#L49)**: Generar cliente Prisma contra esquema local. **Condición:** Tras instalar dependencias. **Excepción/límite:** No confundir generar cliente con migrar datos. **Estado:** PREANÁLISIS.
- **AB-0814 · [fuente L68](fuente-original/01-arquitectura-tecnica.md#L52)**: Aplicar db push solo tras revisar estado local. **Condición:** Setup de DB dev. **Excepción/límite:** No ejecutar db push en prod por copiar receta antigua. **Estado:** PREANÁLISIS.
- **AB-0815 · [fuente L81](fuente-original/01-arquitectura-tecnica.md#L65)**: Ejecutar unit tests de Vitest en validación. **Condición:** Cambio en código. **Excepción/límite:** Sin output real no hay ejecución demostrada. **Estado:** PREANÁLISIS.
- **AB-0816 · [fuente L84](fuente-original/01-arquitectura-tecnica.md#L68)**: Ejecutar E2E según superficie afectada. **Condición:** Cambio de UX/API. **Excepción/límite:** La emulación no sustituye validación en dispositivo físico. **Estado:** PREANÁLISIS.
- **AB-0817 · [fuente L87](fuente-original/01-arquitectura-tecnica.md#L71)**: Ejecutar tsc --noEmit como control de tipos. **Condición:** Tras cambios TypeScript. **Excepción/límite:** No suprimir errores por costumbre ni afirmar verde sin log. **Estado:** PREANÁLISIS.
- **AB-0818 · [fuente L124](fuente-original/01-arquitectura-tecnica.md#L108)**: Verificar uso de proxy.ts de Next 16. **Condición:** Al modificar middleware/autenticación. **Excepción/límite:** No recrear middleware.ts obsoleto por memoria de otra versión. **Estado:** PREANÁLISIS.
- **AB-0819 · [fuente L125](fuente-original/01-arquitectura-tecnica.md#L109)**: Revisar orden de proxy antes de rutas. **Condición:** Al tocar auth y rate limit. **Excepción/límite:** El estado real debe verificarse en código actual. **Estado:** PREANÁLISIS.
- **AB-0820 · [fuente L126](fuente-original/01-arquitectura-tecnica.md#L110)**: Separar redirect de página y controles API. **Condición:** Al usar proxy. **Excepción/límite:** Una página y un endpoint no comparten contrato de respuesta. **Estado:** PREANÁLISIS.
- **AB-0821 · [fuente L132](fuente-original/01-arquitectura-tecnica.md#L116)**: No duplicar rate limit en handlers sin revisar proxy. **Condición:** Al añadir límites API. **Excepción/límite:** Mantener requireAuth en endpoint como protección independiente. **Estado:** PREANÁLISIS.
- **AB-0822 · [fuente L133](fuente-original/01-arquitectura-tecnica.md#L117)**: Distinguir Redis distribuido de fallback in-memory. **Condición:** Cuando Redis no está disponible. **Excepción/límite:** El fallback no garantiza un límite global multi-instancia. **Estado:** PREANÁLISIS.
- **AB-0823 · [fuente L136](fuente-original/01-arquitectura-tecnica.md#L120)**: Conservar tratamiento especial de endpoints Auth.js. **Condición:** Si proxy excluye rutas Auth. **Excepción/límite:** No duplicar protecciones sin revisar efectos. **Estado:** PREANÁLISIS.
- **AB-0824 · [fuente L137](fuente-original/01-arquitectura-tecnica.md#L121)**: No aplicar límite de requests API a las páginas indiscriminadamente. **Condición:** Si proxy protege páginas. **Excepción/límite:** Autenticación de página no es el mismo control de rate limiting. **Estado:** PREANÁLISIS.
- **AB-0825 · [fuente L139](fuente-original/01-arquitectura-tecnica.md#L123)**: Comprobar configuración explícita Redis v5. **Condición:** Al usar rate-limiter-flexible. **Excepción/límite:** disableOfflineQueue e insuranceLimiter no deben inventarse. **Estado:** PREANÁLISIS.
- **AB-0826 · [fuente L170](fuente-original/01-arquitectura-tecnica.md#L154)**: Conservar unicidad de contactos por cliente y teléfono. **Condición:** Cuando se modifica ContactoCliente. **Excepción/límite:** No recrear JSON legacy ni permitir duplicado del par. **Estado:** PREANÁLISIS.
- **AB-0827 · [fuente L171](fuente-original/01-arquitectura-tecnica.md#L155)**: Conservar unicidad de producto por plantilla. **Condición:** Cuando se modifica PlantillaProducto. **Excepción/límite:** No crear dos filas del mismo producto por plantilla. **Estado:** PREANÁLISIS.
- **AB-0828 · [fuente L174](fuente-original/01-arquitectura-tecnica.md#L158)**: Leer lista de contactos como relación relacional. **Condición:** Al hidratar Cliente. **Excepción/límite:** No depender del JSON legacy eliminado. **Estado:** PREANÁLISIS.
- **AB-0829 · [fuente L177](fuente-original/01-arquitectura-tecnica.md#L161)**: Mantener privilegios mínimos del usuario runtime. **Condición:** Migración nuevas tablas. **Excepción/límite:** No conceder acceso indiscriminado para resolver un error. **Estado:** PREANÁLISIS.
- **AB-0830 · [fuente L179](fuente-original/01-arquitectura-tecnica.md#L163)**: Seguir expand-backfill-dual-write-contract al migrar datos. **Condición:** Cambio de esquema con datos. **Excepción/límite:** No dropear columnas antes de comprobar backfill. **Estado:** PREANÁLISIS.
- **AB-0831 · [fuente L188](fuente-original/01-arquitectura-tecnica.md#L172)**: Bloquear SW en test E2E que necesita fixture sin SW. **Condición:** Si Playwright usa serviceWorkers block. **Excepción/límite:** Eso no prueba que la PWA offline funcione. **Estado:** PREANÁLISIS.
- **AB-0832 · [fuente L199](fuente-original/01-arquitectura-tecnica.md#L183)**: Serializar Decimal/Date cuando cruzan frontera RSC a Client. **Condición:** Props entre servidor y cliente. **Excepción/límite:** No asumir serialización de tipo complejo sin verificar Next. **Estado:** PREANÁLISIS.
- **AB-0833 · [fuente L203](fuente-original/01-arquitectura-tecnica.md#L187)**: Separar dominio puro de infraestructura de persistencia. **Condición:** Nuevo bounded context DDD. **Excepción/límite:** No instalar Prisma directamente en domain por conveniencia. **Estado:** PREANÁLISIS.
- **AB-0834 · [fuente L209](fuente-original/01-arquitectura-tecnica.md#L193)**: Preferir valores compartidos de dinero/fecha/producto. **Condición:** Métrica usada por varios módulos. **Excepción/límite:** No duplicar fórmulas en dashboard y caja. **Estado:** PREANÁLISIS.
- **AB-0835 · [fuente L216](fuente-original/01-arquitectura-tecnica.md#L200)**: Tratar CONSUMIDOR_FINAL como contrato transversal fuerte. **Condición:** Antes de cambiar ID de venta anónima. **Excepción/límite:** Exige investigar todas las referencias y migración autorizada. **Estado:** PREANÁLISIS.
- **AB-0836 · [fuente L220](fuente-original/01-arquitectura-tecnica.md#L204)**: Ocultar duplicados legacy de Consumidor Final de listas. **Condición:** Al consultar clientes. **Excepción/límite:** No borrar historia para limpiar visualización. **Estado:** PREANÁLISIS.
- **AB-0837 · [fuente L231](fuente-original/01-arquitectura-tecnica.md#L215)**: Permitir coordenadas null en payload legacy. **Condición:** Si ubicación falta. **Excepción/límite:** No sustituir por cero ni inventar geopunto. **Estado:** PREANÁLISIS.
- **AB-0838 · [fuente L307](fuente-original/01-arquitectura-tecnica.md#L291)**: Recuperar SSE si falta heartbeat. **Condición:** Después de ausencia de latido. **Excepción/límite:** No reconectar sin backoff y disparar bucle. **Estado:** PREANÁLISIS.
- **AB-0839 · [fuente L338](fuente-original/01-arquitectura-tecnica.md#L322)**: Distinguir maxDuration permitido por plan Vercel. **Condición:** Si SSE usa configuración serverless. **Excepción/límite:** No suponer que Hobby y Pro tienen mismos límites. **Estado:** PREANÁLISIS.
- **AB-0840 · [fuente L343](fuente-original/01-arquitectura-tecnica.md#L327)**: Diagnosticar sesión al fallar SSE. **Condición:** Si /api/realtime no conecta. **Excepción/límite:** No usar cookies de usuarios reales sin permiso. **Estado:** PREANÁLISIS.
- **AB-0841 · [fuente L344](fuente-original/01-arquitectura-tecnica.md#L328)**: Evitar tener dos RealtimeProvider. **Condición:** Ante conexiones SSE duplicadas. **Excepción/límite:** No quitar proveedor sin revisar árbol de layout. **Estado:** PREANÁLISIS.
- **AB-0842 · [fuente L345](fuente-original/01-arquitectura-tecnica.md#L329)**: Usar detector de conexión SSR-safe en repartidor. **Condición:** Al hidratar UI. **Excepción/límite:** No leer navigator.onLine desde SSR. **Estado:** PREANÁLISIS.
- **AB-0843 · [fuente L351](fuente-original/02-historico-incidencias.md#L4)**: Revisar outputFileTracingRoot en monorepo con lockfiles. **Condición:** Error Next workspace inference. **Excepción/límite:** No asumir la raíz deducida automáticamente. **Estado:** PREANÁLISIS.
- **AB-0844 · [fuente L352](fuente-original/02-historico-incidencias.md#L5)**: No reinstalar el SW manual como fuente canónica. **Condición:** Migración Serwist vigente. **Excepción/límite:** public/sw.js es fallback histórico. **Estado:** PREANÁLISIS.
- **AB-0845 · [fuente L353](fuente-original/02-historico-incidencias.md#L6)**: No asumir sesiones DB solo por prisma-adapter instalado. **Condición:** Auth.js con JWT. **Excepción/límite:** La dependencia no cambia la estrategia efectiva. **Estado:** PREANÁLISIS.
- **AB-0846 · [fuente L354](fuente-original/02-historico-incidencias.md#L7)**: Activar opción de redis v5 compatible. **Condición:** Rate limiter flexible. **Excepción/límite:** Auto detección histórica fallaba; confirmar versión actual. **Estado:** PREANÁLISIS.
- **AB-0847 · [fuente L362](fuente-original/02-historico-incidencias.md#L15)**: Ante typecheck fantasma comparar archivo real antes de limpiar caché. **Condición:** Si .next/dev validator reporta identificadores inexistentes. **Excepción/límite:** Borrar solo artefactos generados reconstruibles. **Estado:** PREANÁLISIS.
- **AB-0848 · [fuente L364](fuente-original/02-historico-incidencias.md#L17)**: Mantener wrapper scrollable ante teclado móvil. **Condición:** Login y cambiar contraseña. **Excepción/límite:** Comprobar viewport real; no basta solo test emulado. **Estado:** PREANÁLISIS.
- **AB-0849 · [fuente L365](fuente-original/02-historico-incidencias.md#L18)**: Centrar input con scrollIntoView y resize cuando corresponda. **Condición:** OSK oculta campo. **Excepción/límite:** No imponer setTimeout arbitrario como fix. **Estado:** PREANÁLISIS.
- **AB-0850 · [fuente L367](fuente-original/02-historico-incidencias.md#L20)**: Usar enterKeyHint acorde a secuencia de inputs. **Condición:** Formulario login en móvil. **Excepción/límite:** next no equivale a go o done del último campo. **Estado:** PREANÁLISIS.
- **AB-0851 · [fuente L414](fuente-original/02-historico-incidencias.md#L67)**: Detectar expiración JWT sin exigir recarga manual. **Condición:** Sesión abierta que caducó. **Excepción/límite:** No mantener polling cuando offline según contrato. **Estado:** PREANÁLISIS.
- **AB-0852 · [fuente L415](fuente-original/02-historico-incidencias.md#L68)**: Notificar sesión expirada por evento ante 401/403 auth. **Condición:** En fetchResilient. **Excepción/límite:** Endpoints propios Auth.js quedan excluidos del evento global. **Estado:** PREANÁLISIS.
- **AB-0853 · [fuente L416](fuente-original/02-historico-incidencias.md#L69)**: Evitar redirecciones duplicadas de sesión expirada. **Condición:** En SessionExpiryGuard. **Excepción/límite:** Mantener razón visible sin fuga de sesión. **Estado:** PREANÁLISIS.
- **AB-0854 · [fuente L417](fuente-original/02-historico-incidencias.md#L70)**: Mostrar motivo de sesión expirada al volver a login. **Condición:** Con parámetro reason expired. **Excepción/límite:** No detallar información de autorización sensible. **Estado:** PREANÁLISIS.
- **AB-0855 · [fuente L418](fuente-original/02-historico-incidencias.md#L71)**: Evitar UI congelada en fetch inicial 401/403. **Condición:** Si el guard todavía no montó. **Excepción/límite:** No dejar estado antiguo de otro usuario visible. **Estado:** PREANÁLISIS.
- **AB-0856 · [fuente L428](fuente-original/02-historico-incidencias.md#L81)**: Evitar bucles de reintentos por límite SSE. **Condición:** En rate_limited. **Excepción/límite:** Circuit breaker y jitter, fallback polling. **Estado:** PREANÁLISIS.
- **AB-0857 · [fuente L429](fuente-original/02-historico-incidencias.md#L82)**: Distinguir SSE connecting del estado offline general. **Condición:** Cuando navigator online y EventSource desconectado. **Excepción/límite:** No anunciar offline incorrecto. **Estado:** PREANÁLISIS.
- **AB-0858 · [fuente L430](fuente-original/02-historico-incidencias.md#L83)**: Liberar saving en errores y timeout de cliente. **Condición:** Al guardar cliente. **Excepción/límite:** No dejar botón Guardando permanentemente. **Estado:** PREANÁLISIS.
- **AB-0859 · [fuente L441](fuente-original/02-historico-incidencias.md#L94)**: Descartar expansión de coordenada desactualizada. **Condición:** Si usuario cambia link durante debounce. **Excepción/límite:** No aplicar resultado de input anterior. **Estado:** PREANÁLISIS.
- **AB-0860 · [fuente L447](fuente-original/02-historico-incidencias.md#L100)**: Descartar detalle obsoleto de negocio al cambiar cliente. **Condición:** Clicks rápidos entre registros. **Excepción/límite:** No mostrar negocio de otro cliente por carrera de respuesta. **Estado:** PREANÁLISIS.
- **AB-0861 · [fuente L451](fuente-original/02-historico-incidencias.md#L104)**: Bloquear filtros durante transición pending. **Condición:** Si la tabla aún actualiza. **Excepción/límite:** Informar Aplicando filtro y evitar falsas selecciones. **Estado:** PREANÁLISIS.
- **AB-0862 · [fuente L458](fuente-original/02-historico-incidencias.md#L111)**: Cachear auth por worker/rol y excluir tests de login. **Condición:** E2E donde el login no es el objetivo. **Excepción/límite:** Los tests de sesión real siguen UI real. **Estado:** PREANÁLISIS.
- **AB-0863 · [fuente L462](fuente-original/02-historico-incidencias.md#L115)**: Validar cookie contra endpoint autenticado antes de reuso. **Condición:** Reset DB pudo invalidar sesión. **Excepción/límite:** Auth session genérica no certifica SesionActiva. **Estado:** PREANÁLISIS.
- **AB-0864 · [fuente L470](fuente-original/02-historico-incidencias.md#L123)**: Acotar espera de TRUNCATE en test reset. **Condición:** Postgres lock contention. **Excepción/límite:** El retry no demuestra que shard entero quede curado. **Estado:** PREANÁLISIS.
- **AB-0865 · [fuente L478](fuente-original/02-historico-incidencias.md#L131)**: Autenticar y revisar CSRF antes de gastar rate-limit Redis. **Condición:** Solicitud API. **Excepción/límite:** Health cron y realtime siguen condiciones especiales. **Estado:** PREANÁLISIS.
- **AB-0866 · [fuente L488](fuente-original/02-historico-incidencias.md#L141)**: Seleccionar vista mobile/desktop visible en test. **Condición:** DOM tiene duplicación responsiva. **Excepción/límite:** No usar text first en elemento oculto. **Estado:** PREANÁLISIS.
- **AB-0867 · [fuente L494](fuente-original/02-historico-incidencias.md#L147)**: Mantener identidad estable de callbacks por paramsKey. **Condición:** usePedidos con params inline. **Excepción/límite:** No depender de objeto literal nuevo cada render. **Estado:** PREANÁLISIS.
- **AB-0868 · [fuente L511](fuente-original/02-historico-incidencias.md#L164)**: Validar regla monetaria en servidor y DB. **Condición:** Cobro de venta Hub. **Excepción/límite:** Una pantalla correcta no garantiza persistencia. **Estado:** PREANÁLISIS.
- **AB-0869 · [fuente L519](fuente-original/02-historico-incidencias.md#L172)**: Calcular métricas de factura sobre conjunto completo. **Condición:** Listado paginado. **Excepción/límite:** No sumar solo 50 filas cargadas. **Estado:** PREANÁLISIS.
- **AB-0870 · [fuente L526](fuente-original/02-historico-incidencias.md#L179)**: No comparar dinero físico con dinero digital. **Condición:** Arqueo de cierre. **Excepción/límite:** Efectivo esperado no es neto de movimientos. **Estado:** PREANÁLISIS.
- **AB-0871 · [fuente L554](fuente-original/02-historico-incidencias.md#L207)**: Separar conceptos producido/vendido y reparto/producción. **Condición:** Comisión al sellador. **Excepción/límite:** No mezclar ventas con llenados ni conceptos pagos. **Estado:** PREANÁLISIS.
- **AB-0872 · [fuente L583](fuente-original/02-historico-incidencias.md#L236)**: No definir componente editable dentro del render. **Condición:** Input dentro de tarjeta de producción. **Excepción/límite:** Evitar remount y pérdida de foco. **Estado:** PREANÁLISIS.
- **AB-0873 · [fuente L606](fuente-original/02-historico-incidencias.md#L259)**: Usar la misma denominación monetaria en UI y servidor. **Condición:** Arqueo moneda 1000. **Excepción/límite:** No permitir listas incoherentes. **Estado:** PREANÁLISIS.
- **AB-0874 · [fuente L614](fuente-original/02-historico-incidencias.md#L267)**: No mostrar unidades pedidas como entregadas. **Condición:** Detalle de comisiones. **Excepción/límite:** Fecha de pedido no es fecha de entrega. **Estado:** PREANÁLISIS.
- **AB-0875 · [fuente L620](fuente-original/02-historico-incidencias.md#L273)**: Registrar base de caja de fecha antes de test cierre. **Condición:** Pruebas que llaman POST cierre. **Excepción/límite:** No enviar valor local sin persistir. **Estado:** PREANÁLISIS.
- **AB-0876 · [fuente L622](fuente-original/02-historico-incidencias.md#L275)**: No usar base por defecto silenciosa. **Condición:** Cierre sin Config del día. **Excepción/límite:** No permitir fuente local diferente. **Estado:** PREANÁLISIS.
- **AB-0877 · [fuente L636](fuente-original/03-reglas-codigo.md#L12)**: Entregar código funcional en implementación. **Condición:** Si el usuario pidió cambio de producto. **Excepción/límite:** Explicación sola no prueba funcionalidad. **Estado:** PREANÁLISIS.
- **AB-0878 · [fuente L637](fuente-original/03-reglas-codigo.md#L13)**: Usar depende solo si hay bifurcaciones reales. **Condición:** Respuesta condicionada. **Excepción/límite:** Describir ramas y efectos, no esquivar decisión. **Estado:** PREANÁLISIS.
- **AB-0879 · [fuente L643](fuente-original/03-reglas-codigo.md#L19)**: Consultar PRs merged y changelog internos. **Condición:** Al buscar precedentes de ingeniería. **Excepción/límite:** No sustituye evidencia del main actual. **Estado:** PREANÁLISIS.
- **AB-0880 · [fuente L644](fuente-original/03-reglas-codigo.md#L20)**: Usar discusiones con workaround demostrado. **Condición:** Investigación técnica. **Excepción/límite:** No repetir soluciones sin comprobar vigencia. **Estado:** PREANÁLISIS.
- **AB-0881 · [fuente L645](fuente-original/03-reglas-codigo.md#L21)**: Evaluar respuestas Stack Overflow reproducibles. **Condición:** Problema de librería. **Excepción/límite:** Score sin compatibilidad no prueba éxito. **Estado:** PREANÁLISIS.
- **AB-0882 · [fuente L646](fuente-original/03-reglas-codigo.md#L22)**: Contrastar experiencia Reddit y Hacker News. **Condición:** Patrones y comunidad. **Excepción/límite:** Opinión no implica éxito verificable. **Estado:** PREANÁLISIS.
- **AB-0883 · [fuente L647](fuente-original/03-reglas-codigo.md#L23)**: Usar blogs técnicos con fecha y código funcional. **Condición:** Fuentes secundarias. **Excepción/límite:** No preferirlos a documentación oficial versión. **Estado:** PREANÁLISIS.
- **AB-0884 · [fuente L652](fuente-original/03-reglas-codigo.md#L28)**: No inventar nombres de paquetes. **Condición:** Agregar dependencia. **Excepción/límite:** Verificar registry y versión antes. **Estado:** PREANÁLISIS.
- **AB-0885 · [fuente L653](fuente-original/03-reglas-codigo.md#L29)**: No asumir métodos por intuición. **Condición:** Usar API. **Excepción/límite:** Consultar docs exactas antes. **Estado:** PREANÁLISIS.
- **AB-0886 · [fuente L654](fuente-original/03-reglas-codigo.md#L30)**: No fabricar flags por analogía. **Condición:** Config herramienta. **Excepción/límite:** Revisar schema oficial. **Estado:** PREANÁLISIS.
- **AB-0887 · [fuente L656](fuente-original/03-reglas-codigo.md#L32)**: No extrapolar comportamiento entre versiones. **Condición:** Actualizar librería. **Excepción/límite:** Breaking changes exigen contraste. **Estado:** PREANÁLISIS.
- **AB-0888 · [fuente L662](fuente-original/03-reglas-codigo.md#L38)**: Reportar archivo y símbolo afectados. **Condición:** Explicar modificaciones. **Excepción/límite:** No dejar solo título de PR. **Estado:** PREANÁLISIS.
- **AB-0889 · [fuente L670](fuente-original/04-protocolo-anterior.md#L4)**: Tres iteraciones previas son de diseño según #704. **Condición:** Antes de solución final. **Excepción/límite:** R3 se ejecuta después aprobación, no tres veces antes del código. **Estado:** PREANÁLISIS.
- **AB-0890 · [fuente L678](fuente-original/04-protocolo-anterior.md#L12)**: Consultar comunidades pertinentes. **Condición:** R1 descubrir. **Excepción/límite:** No basarse solo en un foro. **Estado:** PREANÁLISIS.
- **AB-0891 · [fuente L680](fuente-original/04-protocolo-anterior.md#L14)**: Anotar versiones y compatibilidad del stack. **Condición:** R1 documentación. **Excepción/límite:** No afirmar transferibilidad no verificada. **Estado:** PREANÁLISIS.
- **AB-0892 · [fuente L695](fuente-original/04-protocolo-anterior.md#L29)**: No interpretar protocolo antiguo R1-R2-R3 ×3 literalmente. **Condición:** Si programar forma parte de R3. **Excepción/límite:** Aplicar decisión PO #704, respetar aprobación final. **Estado:** PREANÁLISIS.
- **AB-0893 · [fuente L696](fuente-original/04-protocolo-anterior.md#L30)**: La segunda iteración analiza resultado de primera. **Condición:** Convergencia diseño. **Excepción/límite:** No repetir fuente sin motivo. **Estado:** PREANÁLISIS.
- **AB-0894 · [fuente L697](fuente-original/04-protocolo-anterior.md#L31)**: La tercera iteración refuta alternativa refinada. **Condición:** Convergencia final. **Excepción/límite:** No inventar mejora cosmética. **Estado:** PREANÁLISIS.
- **AB-0895 · [fuente L700](fuente-original/04-protocolo-anterior.md#L34)**: Investigar antes de escribir código. **Condición:** Trabajo autorizado de implementar. **Excepción/límite:** No exigir R3 para solo lectura. **Estado:** PREANÁLISIS.
- **AB-0896 · [fuente L701](fuente-original/04-protocolo-anterior.md#L35)**: Aprobación humana debe cubrir fase real. **Condición:** Después del tercer R2. **Excepción/límite:** No interrumpir PO tres veces con el mismo plan. **Estado:** PREANÁLISIS.
- **AB-0897 · [fuente L718](fuente-original/05-flujo-entrega-anterior.md#L14)**: Definir objetivo alcance y aceptación antes de fase. **Condición:** Plan. **Excepción/límite:** Fuera de alcance no autoriza romper lo preservado. **Estado:** PREANÁLISIS.
- **AB-0898 · [fuente L719](fuente-original/05-flujo-entrega-anterior.md#L15)**: Dividir slices TDD cuando corresponde. **Condición:** Implementación. **Excepción/límite:** No imponer ritual TDD a cambio documental trivial. **Estado:** PREANÁLISIS.
- **AB-0899 · [fuente L724](fuente-original/05-flujo-entrega-anterior.md#L20)**: Trabajar con cambios pequeños coherentes. **Condición:** Fase aprobada. **Excepción/límite:** Evitar refactor oportunista. **Estado:** PREANÁLISIS.
- **AB-0900 · [fuente L726](fuente-original/05-flujo-entrega-anterior.md#L22)**: Mantener plan del PR actualizado. **Condición:** Al cerrar fase. **Excepción/límite:** No terminar con especificación obsoleta. **Estado:** PREANÁLISIS.
- **AB-0901 · [fuente L730](fuente-original/05-flujo-entrega-anterior.md#L26)**: Integración y E2E según riesgo. **Condición:** Si cambio afecta login offline cierre. **Excepción/límite:** No omitir recorridos críticos. **Estado:** PREANÁLISIS.
- **AB-0902 · [fuente L734](fuente-original/05-flujo-entrega-anterior.md#L30)**: Actualizar rama con main previo al PR. **Condición:** Rebase. **Excepción/límite:** Revalidar semántica tras resolver conflictos. **Estado:** PREANÁLISIS.
- **AB-0903 · [fuente L736](fuente-original/05-flujo-entrega-anterior.md#L32)**: Abortar rebase si no es resoluble. **Condición:** Conflicto fuerte. **Excepción/límite:** No resolver ours/theirs sin revisar intención. **Estado:** PREANÁLISIS.
- **AB-0904 · [fuente L739](fuente-original/05-flujo-entrega-anterior.md#L35)**: PR requiere validación post-rebase en flujo. **Condición:** Nuevas fases. **Excepción/límite:** No falsear aprobación por PR abierto. **Estado:** PREANÁLISIS.
- **AB-0905 · [fuente L742](fuente-original/05-flujo-entrega-anterior.md#L38)**: Base PR debe ser main actualizado. **Condición:** Fase independiente. **Excepción/límite:** Stack dependiente es excepción documentada. **Estado:** PREANÁLISIS.
- **AB-0906 · [fuente L748](fuente-original/05-flujo-entrega-anterior.md#L44)**: Typecheck Unit Integración son checks principales del flujo histórico. **Condición:** CI de revisión. **Excepción/límite:** Verificar protección branch para saber required actuales. **Estado:** PREANÁLISIS.
- **AB-0907 · [fuente L749](fuente-original/05-flujo-entrega-anterior.md#L45)**: Comparar run E2E main comparable. **Condición:** Shards fallidos. **Excepción/límite:** No limitarse a contar fallos. **Estado:** PREANÁLISIS.
- **AB-0908 · [fuente L751](fuente-original/05-flujo-entrega-anterior.md#L47)**: Fallo ya en baseline no es regresión nueva. **Condición:** Comparación CI. **Excepción/límite:** No excusa regresión distinta. **Estado:** PREANÁLISIS.
- **AB-0909 · [fuente L752](fuente-original/05-flujo-entrega-anterior.md#L48)**: Comparar fallos por especificación y firma. **Condición:** PR versus main. **Excepción/límite:** Corregir nuevas firmas. **Estado:** PREANÁLISIS.
- **AB-0910 · [fuente L754](fuente-original/05-flujo-entrega-anterior.md#L50)**: Documentar baseline con ID de run. **Condición:** Al comentar PR. **Excepción/límite:** No afirmar identidad sin logs. **Estado:** PREANÁLISIS.
- **AB-0911 · [fuente L758](fuente-original/05-flujo-entrega-anterior.md#L54)**: No fusionar fallos atribuibles al PR. **Condición:** CI/reportes. **Excepción/límite:** No forzar merge por premura. **Estado:** PREANÁLISIS.
- **AB-0912 · [fuente L762](fuente-original/05-flujo-entrega-anterior.md#L58)**: Merge requiere aprobación y gates. **Condición:** Antes de fusionar. **Excepción/límite:** Acceso a botón no equivale a permiso. **Estado:** PREANÁLISIS.
- **AB-0913 · [fuente L763](fuente-original/05-flujo-entrega-anterior.md#L59)**: No declarar integrada fase sin main actualizado. **Condición:** Tras PR. **Excepción/límite:** Ready no equivale merge. **Estado:** PREANÁLISIS.
- **AB-0914 · [fuente L768](fuente-original/05-flujo-entrega-anterior.md#L64)**: Actualizar main ff-only en worktree separado. **Condición:** Verificar postmerge. **Excepción/límite:** No interrumpir checkout ajeno. **Estado:** PREANÁLISIS.
- **AB-0915 · [fuente L773](fuente-original/05-flujo-entrega-anterior.md#L69)**: Nueva rama desde main verificado. **Condición:** Fase siguiente. **Excepción/límite:** No partir del PR antiguo sin documentación. **Estado:** PREANÁLISIS.
- **AB-0916 · [fuente L774](fuente-original/05-flujo-entrega-anterior.md#L70)**: Evitar ramas apiladas silenciosamente. **Condición:** Nueva fase. **Excepción/límite:** Stack explícito solo con dependencia registrada. **Estado:** PREANÁLISIS.
- **AB-0917 · [fuente L777](fuente-original/05-flujo-entrega-anterior.md#L73)**: Volver a plan para fase siguiente. **Condición:** Tras integrar anterior. **Excepción/límite:** No omitir postmerge. **Estado:** PREANÁLISIS.
- **AB-0918 · [fuente L783](fuente-original/05-flujo-entrega-anterior.md#L79)**: Evitar scopes no relacionados y slices gigantes. **Condición:** Fase de entrega. **Excepción/límite:** Un batch no debe hacerse grande por conveniencia. **Estado:** PREANÁLISIS.
- **AB-0919 · [fuente L784](fuente-original/05-flujo-entrega-anterior.md#L80)**: No acumular fases terminadas sin integrar. **Condición:** Al gestionar backlog. **Excepción/límite:** Excepción stack documentado no implica merge. **Estado:** PREANÁLISIS.
- **AB-0920 · [fuente L785](fuente-original/05-flujo-entrega-anterior.md#L81)**: Dar al agente contexto necesario. **Condición:** Trabajo de investigación. **Excepción/límite:** No omitir reglas críticas por ahorrar tokens. **Estado:** PREANÁLISIS.
- **AB-0921 · [fuente L786](fuente-original/05-flujo-entrega-anterior.md#L82)**: Medir relevancia de cambio más que cantidad de commits. **Condición:** Ramas cortas. **Excepción/límite:** Conservar trazabilidad. **Estado:** PREANÁLISIS.
- **AB-0922 · [fuente L794](fuente-original/05-flujo-entrega-anterior.md#L90)**: Squash merge como preferencia del repo histórico. **Condición:** Ramas cortas. **Excepción/límite:** Verificar configuración real actual. **Estado:** PREANÁLISIS.
- **AB-0923 · [fuente L795](fuente-original/05-flujo-entrega-anterior.md#L91)**: Flujo no repara flakiness por sí solo. **Condición:** Al revisar E2E. **Excepción/límite:** Baseline sigue necesario. **Estado:** PREANÁLISIS.


## Contraste adicional de condiciones y excepciones (48 cláusulas)

- **AB-0924 · [fuente 4](fuente-original/00-entrada.md#L4)**: Consultar protocolo canónico y evitar duplicación de instrucciones OpenCode. **Condición:** Cuando un agente descubre la instrucción raíz. **Excepción/límite:** La ruta antigua es entrada histórica, y la referencia actual es docs/agentes/protocolo-investigacion.md. **Estado:** PREANÁLISIS.
- **AB-0925 · [fuente 117](fuente-original/01-arquitectura-tecnica.md#L101)**: Unificar schema Prisma en prisma/schema.prisma. **Condición:** Al cambiar modelos. **Excepción/límite:** No crear segundo schema local de SQLite. **Estado:** PREANÁLISIS.
- **AB-0926 · [fuente 118](fuente-original/01-arquitectura-tecnica.md#L102)**: Dev usa PostgreSQL por Docker Compose. **Condición:** Al probar persistencia local. **Excepción/límite:** No asumir que el puerto o versión histórica sigue siendo actual. **Estado:** PREANÁLISIS.
- **AB-0927 · [fuente 119](fuente-original/01-arquitectura-tecnica.md#L103)**: Prod mantiene proveedor PostgreSQL Supabase. **Condición:** Al desplegar cambios de DB. **Excepción/límite:** La identidad de schema se verifica, no se infiere de documentos antiguos. **Estado:** PREANÁLISIS.
- **AB-0928 · [fuente 121](fuente-original/01-arquitectura-tecnica.md#L105)**: Conservar Decimal para dinero en persistencia. **Condición:** Al evolucionar modelo. **Excepción/límite:** Convertir a Number sin límites puede introducir redondeo. **Estado:** PREANÁLISIS.
- **AB-0929 · [fuente 134](fuente-original/01-arquitectura-tecnica.md#L118)**: Mantener límites por ruta con excepciones explícitas. **Condición:** Cuando proxy aplica rate limit. **Excepción/límite:** El valor 300 por minuto requiere comprobar configuración actual. **Estado:** PREANÁLISIS.
- **AB-0930 · [fuente 135](fuente-original/01-arquitectura-tecnica.md#L119)**: Rate limit SSE es propio y configurable por entorno. **Condición:** Conexión /api/realtime. **Excepción/límite:** No mezclar número de conexiones con HTTP API. **Estado:** PREANÁLISIS.
- **AB-0931 · [fuente 138](fuente-original/01-arquitectura-tecnica.md#L122)**: Conservar exclusiones health cron realtime del proxy general. **Condición:** En middleware de rate-limit. **Excepción/límite:** Realtime tiene otro control y health/cron no deben consumir cupo. **Estado:** PREANÁLISIS.
- **AB-0932 · [fuente 148](fuente-original/01-arquitectura-tecnica.md#L132)**: No encolar una respuesta 4xx/5xx lógica. **Condición:** Cuando fetchResilient obtiene HTTP de error. **Excepción/límite:** Un 409 dedup de replay es excepción gestionada por sync, no regla para todas las APIs. **Estado:** PREANÁLISIS.
- **AB-0933 · [fuente 149](fuente-original/01-arquitectura-tecnica.md#L133)**: Distinguir respuesta 2xx real de offline optimista. **Condición:** En fetchResilient online. **Excepción/límite:** Éxito HTTP no equivale necesariamente a persistencia tras falla posterior. **Estado:** PREANÁLISIS.
- **AB-0934 · [fuente 154](fuente-original/01-arquitectura-tecnica.md#L138)**: Mantener offlineId único de Pedido contra reintentos. **Condición:** En POST pedido y operaciones con dedup. **Excepción/límite:** No reutilizar ID entre borradores diferentes. **Estado:** PREANÁLISIS.
- **AB-0935 · [fuente 161](fuente-original/01-arquitectura-tecnica.md#L145)**: Conservar esquema de cola Dexie con payload y localEndpoint. **Condición:** En sincronización de mutaciones. **Excepción/límite:** No eliminar campos sin migración IndexedDB compatible. **Estado:** PREANÁLISIS.
- **AB-0936 · [fuente 165](fuente-original/01-arquitectura-tecnica.md#L149)**: Mostrar pendingOffline y lastResult como estados distinguibles. **Condición:** En hooks de mutaciones resilientes. **Excepción/límite:** No mostrar offline como confirmado en servidor. **Estado:** PREANÁLISIS.
- **AB-0937 · [fuente 169](fuente-original/01-arquitectura-tecnica.md#L153)**: Mantener ContactoCliente y PlantillaProducto como relaciones. **Condición:** Tras normalización 1FN. **Excepción/límite:** No volver a arrays JSON legacy por comodidad. **Estado:** PREANÁLISIS.
- **AB-0938 · [fuente 184](fuente-original/01-arquitectura-tecnica.md#L168)**: Servir Serwist por ruta /serwist/sw.js. **Condición:** Durante compilación PWA. **Excepción/límite:** No activar endpoint manual antiguo por accidente. **Estado:** PREANÁLISIS.
- **AB-0939 · [fuente 218](fuente-original/01-arquitectura-tecnica.md#L202)**: Preservar consolidación de CONSUMIDOR_FINAL en migraciones. **Condición:** Al modificar seed/migraciones. **Excepción/límite:** No borrar datos históricos de clientes canónicos. **Estado:** PREANÁLISIS.
- **AB-0940 · [fuente 234](fuente-original/01-arquitectura-tecnica.md#L218)**: Conservar previsualización de coords y actualización auditada. **Condición:** UI Negocio. **Excepción/límite:** Botón edita coordenadas con permisos; no alterar negocio sin intención. **Estado:** PREANÁLISIS.
- **AB-0941 · [fuente 296](fuente-original/01-arquitectura-tecnica.md#L280)**: Notificar cambios multi-instancia mediante Redis PubSub. **Condición:** Con realtime activo. **Excepción/límite:** Sin Redis no simular eventos persistidos. **Estado:** PREANÁLISIS.
- **AB-0942 · [fuente 337](fuente-original/01-arquitectura-tecnica.md#L321)**: Configurar REDIS_URL para entorno que requiere PubSub. **Condición:** Despliegue SSE. **Excepción/límite:** Sin Redis, error de realtime no debe romper pedidos. **Estado:** PREANÁLISIS.
- **AB-0943 · [fuente 346](fuente-original/01-arquitectura-tecnica.md#L330)**: Diagnosticar procesos huérfanos de server antes de reejecutar E2E. **Condición:** Playwright test server no inicia. **Excepción/límite:** No matar procesos ajenos sin verificar PID y propietario. **Estado:** PREANÁLISIS.
- **AB-0944 · [fuente 359](fuente-original/02-historico-incidencias.md#L12)**: No ejecutar DELETE masivo de cierres por copiar workaround antiguo. **Condición:** Existe cierre futuro aparentemente inválido. **Excepción/límite:** Investigar causa y recuperar/anular de forma auditable con permiso del PO. **Estado:** PREANÁLISIS.
- **AB-0945 · [fuente 366](fuente-original/02-historico-incidencias.md#L19)**: Mantener viewport responsive mobile al mostrar teclado. **Condición:** Login y cambiar contraseña. **Excepción/límite:** interactiveWidget puede ser ignorado por iOS, requiere QA real. **Estado:** PREANÁLISIS.
- **AB-0946 · [fuente 374](fuente-original/02-historico-incidencias.md#L27)**: Incluir contactos ordenados al leer detalle de cliente. **Condición:** Al usar GET cliente-id. **Excepción/límite:** No devolver payload sin relación ContactoCliente por error. **Estado:** PREANÁLISIS.
- **AB-0947 · [fuente 376](fuente-original/02-historico-incidencias.md#L29)**: Crear contactos nuevos mediante POST endpoint especializado. **Condición:** Sync del formulario. **Excepción/límite:** No POST si teléfono ya existe en el servidor. **Estado:** PREANÁLISIS.
- **AB-0948 · [fuente 377](fuente-original/02-historico-incidencias.md#L30)**: Editar contacto existente con PATCH cuando campos cambian. **Condición:** Sync contactos. **Excepción/límite:** No usar POST duplicado por cambio de nombre. **Estado:** PREANÁLISIS.
- **AB-0949 · [fuente 378](fuente-original/02-historico-incidencias.md#L31)**: Eliminar contactos quitados del formulario usando DELETE específico. **Condición:** Al confirmar eliminación. **Excepción/límite:** No afectar contactos de otro cliente. **Estado:** PREANÁLISIS.
- **AB-0950 · [fuente 379](fuente-original/02-historico-incidencias.md#L32)**: Omitir sync si campos de contacto no cambiaron. **Condición:** Sin diferencias detectadas. **Excepción/límite:** No repetir llamadas de red que pueden causar side effects. **Estado:** PREANÁLISIS.
- **AB-0951 · [fuente 390](fuente-original/02-historico-incidencias.md#L43)**: No aconsejar ejecutar SQL directo sin validar estado de migraciones. **Condición:** Cuando se depura DB local. **Excepción/límite:** El workaround antiguo es circunstancial y no autoriza producción. **Estado:** PREANÁLISIS.
- **AB-0952 · [fuente 397](fuente-original/02-historico-incidencias.md#L50)**: Verificar estrategia de migraciones real de producción. **Condición:** Cuando docs dicen db push en prod. **Excepción/límite:** Un snapshot de julio no prueba estado noviembre; no hacer db push destructivo. **Estado:** PREANÁLISIS.
- **AB-0953 · [fuente 406](fuente-original/02-historico-incidencias.md#L59)**: Conservar filtros persistentes en URL del pedido. **Condición:** Al regresar a listado. **Excepción/límite:** No disparar apertura de modal por clienteId filtrante. **Estado:** PREANÁLISIS.
- **AB-0954 · [fuente 407](fuente-original/02-historico-incidencias.md#L60)**: Abrir nuevo pedido solo con trigger explícito new=1. **Condición:** Crear desde cliente/negocio. **Excepción/límite:** Limpiar trigger al abrir para evitar duplicados por refresh. **Estado:** PREANÁLISIS.
- **AB-0955 · [fuente 408](fuente-original/02-historico-incidencias.md#L61)**: Abrir detalle con openPedido y limpiar trigger. **Condición:** Deep link a detalle. **Excepción/límite:** Si no está en página, el código posterior busca por id y alerta errores. **Estado:** PREANÁLISIS.
- **AB-0956 · [fuente 409](fuente-original/02-historico-incidencias.md#L62)**: No mezclar filtro clienteId con trigger nuevo. **Condición:** Enlaces Ver pedidos o Crear pedido. **Excepción/límite:** Conservar filtro all=true si fue decidido para historial. **Estado:** PREANÁLISIS.
- **AB-0957 · [fuente 450](fuente-original/02-historico-incidencias.md#L103)**: No combinar router.refresh con navegación de filtro innecesariamente. **Condición:** Si RSC ya trae página filtrada. **Excepción/límite:** Evitar solicitudes redundantes; verificar comportamiento actual. **Estado:** PREANÁLISIS.
- **AB-0958 · [fuente 483](fuente-original/02-historico-incidencias.md#L136)**: Mantener lastCommittedSearchRef para evitar snapback de búsqueda. **Condición:** Input search de Clientes. **Excepción/límite:** No pisar draft durante transición RSC. **Estado:** PREANÁLISIS.
- **AB-0959 · [fuente 484](fuente-original/02-historico-incidencias.md#L137)**: Limpiar search y page en botón Limpiar filtros. **Condición:** Vista clientes. **Excepción/límite:** No dejar URL con estado antiguo. **Estado:** PREANÁLISIS.
- **AB-0960 · [fuente 503](fuente-original/02-historico-incidencias.md#L156)**: No inferir corrección financiera de un relato histórico de fix. **Condición:** Ante investigación de venta anónima. **Excepción/límite:** Verificar Pago persistido y excepciones del contrato en main. **Estado:** PREANÁLISIS.
- **AB-0961 · [fuente 533](fuente-original/02-historico-incidencias.md#L186)**: Verificar prerequisitos migratorios de método nómina. **Condición:** Al desplegar código #641. **Excepción/límite:** No marcar migración aplicada en prod por la nota antigua. **Estado:** PREANÁLISIS.
- **AB-0962 · [fuente 540](fuente-original/02-historico-incidencias.md#L193)**: Verificar schema antes de consumir frecuencia de salario. **Condición:** Cambios #644. **Excepción/límite:** No suponer que migración histórica está aplicada en DB de producción. **Estado:** PREANÁLISIS.
- **AB-0963 · [fuente 559](fuente-original/02-historico-incidencias.md#L212)**: Verificar existencia de columnas de inventario botellón. **Condición:** Migración #618. **Excepción/límite:** No intentar escribir columnas ausentes antes de revisar la DB destino. **Estado:** PREANÁLISIS.
- **AB-0964 · [fuente 576](fuente-original/02-historico-incidencias.md#L229)**: Conservar estados por persona de pagos personal y acciones coherentes. **Condición:** En cierre UI sección Pagos al personal. **Excepción/límite:** Reorganizar presentación no cambia dinero ni permiso; por conciliar no es pagado. **Estado:** PREANÁLISIS.
- **AB-0965 · [fuente 588](fuente-original/02-historico-incidencias.md#L241)**: Evitar solapamiento de título y totales en desplegable móvil. **Condición:** Pantalla de cierre menor 640px. **Excepción/límite:** Diferenciar Total de hoy versus días anteriores; sin insignias sueltas. **Estado:** PREANÁLISIS.
- **AB-0966 · [fuente 589](fuente-original/02-historico-incidencias.md#L242)**: Tratar la ubicación de base inicial de caja según decisión #688. **Condición:** Al mostrar cierre. **Excepción/límite:** No reintroducir campo local reemplazado por Config central. **Estado:** PREANÁLISIS.
- **AB-0967 · [fuente 601](fuente-original/02-historico-incidencias.md#L254)**: Verificar migración IngresoSaldoFavor al desplegar #524. **Condición:** Cuando código consume nueva tabla de ingreso. **Excepción/límite:** No suponer aplicada en producción por archivo de migración. **Estado:** PREANÁLISIS.
- **AB-0968 · [fuente 611](fuente-original/02-historico-incidencias.md#L264)**: Mostrar primero negocio al detallar comisión y cliente después. **Condición:** Pedido ligado a Negocio. **Excepción/límite:** Para venta anónima usar Cliente final sin inventar identificador de persona. **Estado:** PREANÁLISIS.
- **AB-0969 · [fuente 672](fuente-original/04-protocolo-anterior.md#L6)**: Usar refutación iterativa para reducir sesgos. **Condición:** Investigación de solución. **Excepción/límite:** No prometer eliminación total de sesgo sin evidencia. **Estado:** PREANÁLISIS.
- **AB-0970 · [fuente 707](fuente-original/05-flujo-entrega-anterior.md#L3)**: Minimizar deuda de integración y contexto no necesario. **Condición:** Flujo por fases. **Excepción/límite:** No ahorrar contexto ocultando normas financieras críticas. **Estado:** PREANÁLISIS.
- **AB-0971 · [fuente 781](fuente-original/05-flujo-entrega-anterior.md#L77)**: Optimizar costo de comprensión e integración, no conteo de commits. **Condición:** Diseño de flujo de entrega. **Excepción/límite:** No maximizar commits como métrica de calidad. **Estado:** PREANÁLISIS.


## Cambios de estado técnico comprobados en main

La guía original no sustituye al código actual. El [contraste puntual de las cláusulas frente al main verificado](auditoria-2026-11/CONTRASTE_MAIN_VERIFICADO_PR718.md) documenta que el CRUD Contactos sí existe, el POST alterno de /api/cierre-dia fue eliminado (#691) y el destino de coordenadas propio del pedido tiene prioridad sobre Negocio y Cliente. Ninguna de estas observaciones revoca una decisión comercial sin su fuente aprobada.
