# Contratos y cláusulas originales descompuestos · Agua Bambú

> **PREANÁLISIS, NO CERTIFICACIÓN DE VIGENCIA.** 193 cláusulas fueron descompuestas conceptualmente por significado, condición y excepción. Cada regla requiere cotejo con decisión posterior, Contexto/Plan Maestro autorizado y código `main`. No se han firmado revisiones humanas ni ejecutado pruebas conductuales de los agentes. Estos son **contratos de regresión por validar**, no órdenes para imponer estados históricos como norma vigente.

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
- **AB-0104 · [fuente L525](fuente-original/02-historico-incidencias.md#L178)**: No reutilizar supuesto pagos todo efectivo. **Condición:** Tras pagos nómina/comisión por medio. **Excepción/límite:** L531/L545 más específicos deben contrastarse con main. **Estado:** PREANÁLISIS, revisar vigencia.
- **AB-0144 · [fuente L621](fuente-original/02-historico-incidencias.md#L274)**: Ruta /api/cierre-dia pendiente de igual regla. **Condición:** Endpoint alterno antiguo. **Excepción/límite:** No declarar resuelto sin revisar bypass. **Estado:** PREANÁLISIS, revisar vigencia.

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

- **AB-0049 · [fuente L223](fuente-original/01-arquitectura-tecnica.md#L207)**: Preferir coordenadas Negocio sobre Cliente. **Condición:** Si Negocio tiene coords válidas. **Excepción/límite:** Si ninguna válida devolver null. **Estado:** PREANÁLISIS, revisar vigencia.
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

Los seis archivos en [fuente-original/](fuente-original/) preservan exactamente el documento antiguo; son evidencia, **no autoridad normativa paralela**. La matriz [obligaciones_atomicas.csv](auditoria-2026-11/obligaciones_atomicas.csv) incluye 394 pasajes no descompuestos o sin clasificación suficiente. **No llamar completo ni marcar `VERIFICADA` hasta terminar esos pasajes y obtener revisión humana.** Las notas técnicas históricas no demuestran el estado de `main`.
