# AGUA BAMBÚ --- PEDIDOS

## Plan técnico de desarrollo: UX adaptativa, reducción de errores y antifraude

**Versión:** 1.0 --- 2026-09-06\
**Estado:** BASE CONVERGIDA PARA DESARROLLO

## 1. Decisión ejecutiva

Pedidos requiere un **rediseño integral de UI/UX**, no un facelift del
formulario existente.

La experiencia debe seguir:

**intención → contexto → propuesta del sistema → ajuste mínimo →
revisión → confirmación → ejecución → resultado**

Principio rector:

> **El usuario opera el negocio; el software opera la complejidad.**

El sistema debe reutilizar información conocida, calcular
automáticamente, inferir solo cuando exista evidencia suficiente,
proponer cuando exista incertidumbre y pedir intervención humana
únicamente cuando sea necesaria.

No se reemplazan todos los formularios por un chatbot. Se combinarán
interfaz estructurada, selección contextual, acciones rápidas, command
menu, edición inline, progressive disclosure y una superficie de trabajo
adaptativa.

------------------------------------------------------------------------

## 2. Decisiones de producto que la UX debe respetar

-   `origen` y `canal` son independientes.
-   `VENTA_RAPIDA` no se deriva de `canal`.
-   `CONSUMIDOR_FINAL` significa ausencia de cliente real; no es un tipo
    comercial.
-   Corrección ≠ nueva demanda.
-   Corrección conserva histórico y usa ajuste/auditoría.
-   Nueva demanda crea un nuevo Pedido.
-   `pedido-hijo` no es mecanismo general de nueva demanda.
-   Pedido, Embarque/Entrega y Cartera son conceptos distintos.
-   El sistema prepara; el usuario decide.
-   Fase 3 es rediseño integral de la experiencia.

La spec actual del repositorio confirma además separación de
origen/entrega/pago, pricing, locks, idempotencia y endpoints
específicos para creación, entrega, cancelación, anulación y ajustes. La
implementación de faltantes/pedido-hijo debe permanecer como **BRECHA
PLAN ↔ CÓDIGO** mientras se alinea con G11.

------------------------------------------------------------------------

## 3. Objetivos UX

La nueva experiencia debe reducir:

-   pasos;
-   campos manuales;
-   decisiones innecesarias;
-   errores de cantidad/precio/canal/origen;
-   navegación;
-   memoria exigida al usuario;
-   correcciones posteriores;
-   acciones irreversibles accidentales.

Debe aumentar:

-   reutilización de contexto;
-   velocidad;
-   previsibilidad;
-   transparencia;
-   recuperación ante errores;
-   trazabilidad.

### Regla de carga cognitiva

El usuario no debe introducir información que el sistema ya conoce.

El sistema debe calcular por sí mismo: - precio; - subtotal; - total; -
saldo; - estado derivado; - elegibilidad; - acciones disponibles.

Debe proponer: - cliente habitual; - dirección habitual; - cantidades
habituales; - fecha probable; - canal habitual.

Debe preguntar solo lo que realmente falta.

------------------------------------------------------------------------

## 4. Nueva interacción

### Entrada

`+ Nuevo`

En vez de un formulario largo:

-   Nueva venta
-   Nuevo pedido
-   Repetir pedido
-   Gestionar pendiente
-   Corregir pedido
-   Continuar operación

La intención determina la interfaz.

### Workspace adaptativo

Una sola superficie de trabajo contiene:

1.  contexto;
2.  operación;
3.  cálculo;
4.  alertas/señales;
5.  confirmación;
6.  resultado.

La interfaz cambia según intención, cliente, estado, canal, origen,
permisos y datos faltantes.

### Progressive disclosure

Mostrar primero: - cliente; - operación; - cantidad; - modalidad; -
fecha/entrega; - total; - consecuencia principal.

Mostrar detalles solo cuando sean necesarios: - desglose de precio; -
histórico; - auditoría; - reglas; - datos secundarios.

------------------------------------------------------------------------

## 5. Flujos

### Cliente habitual

Ejemplo:

> María López\
> Pedido habitual detectado\
> 20 pacas · Domicilio · Dirección habitual\
> Total calculado: \$X\
> **\[Confirmar\] \[Modificar\]**

No volver a solicitar información conocida si sigue siendo válida.

### Pedido desde cero

1.  cliente;
2.  intención;
3.  productos/cantidad;
4.  canal;
5.  fecha/entrega;
6.  pago;
7.  revisión;
8.  confirmación.

Los pasos pueden desaparecer o reordenarse según contexto.

### Venta rápida

Representar explícitamente:

`origen = VENTA_RAPIDA`

y, de forma independiente:

`canal = PUNTO | DOMICILIO`

### Nueva demanda

Si el cliente pide unidades adicionales después de una operación
existente:

**crear nuevo Pedido**, opcionalmente relacionado con el original.

No editar silenciosamente el pedido anterior.

### Corrección

Mostrar explícitamente:

**Antes → Después**

y: - motivo; - impacto; - autorización; - actor.

Nunca presentarla como una edición ordinaria de formulario.

------------------------------------------------------------------------

# 6. Modelo antifraude

## 6.1 Casos de amenaza

La sección Pedidos debe contemplar:

1.  venta no registrada/skimming;
2.  subregistro de cantidades;
3.  precio inferior al autorizado;
4.  descuento no autorizado;
5.  sweethearting/favoritismo;
6.  pedidos ficticios;
7.  cancelaciones ficticias;
8.  anulaciones indebidas;
9.  devoluciones/reembolsos ficticios;
10. modificación posterior de pedidos;
11. cambio indebido de cliente/dirección;
12. deuda ficticia;
13. aplicación indebida de pagos;
14. manipulación de estados;
15. asignación indebida a ruta/usuario;
16. duplicación;
17. race conditions;
18. replay offline;
19. manipulación de campos ocultos;
20. escalamiento de permisos;
21. colusión comercial/reparto;
22. uso indebido de `CONSUMIDOR_FINAL`;
23. abuso de precio manual;
24. venta seguida de cancelación para ocultarla;
25. alteración de cantidades para ocultar faltantes.

OWASP identifica como riesgos de business logic el salto de pasos,
manipulación de valores sensibles, concurrencia y confianza en valores
derivados del cliente. También exige autorización contextual por
recurso, estado y momento. ACFE documenta esquemas de ventas anuladas,
descuentos preferenciales, sweethearting, ventas subregistradas, false
voids y skimming.

## 6.2 Regla

**La UI nunca es el control de seguridad.**

Si una regla tiene impacto financiero o de integridad, debe estar
protegida en backend/database/transacción.

La UI guía, explica, previene errores y solicita autorización.

------------------------------------------------------------------------

## 7. Acciones de alto impacto

Requieren:

**preview → motivo → autorización → commit → auditoría**

Aplicar a: - precio manual/excepcional; - descuento fuera de política; -
cambio de cliente; - cambio a consumidor final en contexto sensible; -
ajuste de cantidad; - cancelación/anulación sensible; -
devolución/reembolso; - modificación posterior a entrega; - cambio de
condiciones de crédito; - aplicación excepcional de pago.

La separación de funciones debe impedir que quien prepara una operación
sensible pueda aprobarla cuando la política determine doble control.

Los umbrales monetarios no deben inventarse en esta fase: deben ser
parametrizados y definidos por negocio.

------------------------------------------------------------------------

## 8. Controles

### Precio

Nunca confiar en precio recibido del frontend. Recalcular en servidor y
registrar: - precio base; - regla; - precio final; - diferencia; -
actor/autorización si aplica.

### Descuentos

Registrar valor, porcentaje, motivo, usuario y autorización.

### Consumidor final

No bloquear toda venta anónima. Si el contexto sugiere que existe
cliente real, mostrar una advertencia contextual.

### Cancelación/anulación

No borrar. Registrar estado anterior, nuevo estado, actor, motivo e
impacto.

### Edición posterior

Mostrar diff antes/después.

### Offline

Toda operación sensible debe usar `offlineId`, idempotencia y validación
server-side al sincronizar.

### Concurrencia

Validar estado actual, usar lock/transacción y devolver conflicto
explícito.

### Auditoría

Registrar como mínimo: - actor; - acción; - recurso; - estado
anterior/nuevo; - valores relevantes; - motivo; - resultado; -
timestamp; - request/correlation id; - offline/online.

------------------------------------------------------------------------

## 9. Detección de anomalías

Primera capa: reglas explicables, no machine learning.

Detectar: - exceso de descuentos por usuario; - exceso de anulaciones; -
exceso de ventas anónimas; - cambios repetidos de precio; - correcciones
inmediatas; - cancelaciones anómalas; - patrones de operaciones
demasiado rápidos; - diferencias sistemáticas entre precio autorizado y
cobrado; - múltiples correcciones; - cambios frecuentes de cliente; -
secuencias atípicas.

Resultado:

**señal → evidencia → revisión humana**

Nunca:

**señal → acusación automática de fraude**.

------------------------------------------------------------------------

## 10. Patrones contemporáneos

### Intent-driven UI

SAP utiliza navegación basada en intención; Microsoft está evolucionando
las interfaces empresariales hacia interacción orientada a intención y
superficies adaptativas.

Aplicación Bambú:

**"Repetir pedido"** es una intención; el sistema determina el contexto
y prepara la operación.

### Command menu

Adoptar command menu contextual para usuarios frecuentes.

### Progressive disclosure

La complejidad aparece cuando se necesita.

### Adaptive workspace

La interfaz se adapta al contexto en lugar de presentar todos los campos
siempre.

### Inline editing

Cambios seguros se hacen en contexto.

### Review before commit

Operaciones sensibles requieren revisión previa.

### Just-in-time UI

Los controles aparecen cuando tienen sentido.

Linear demuestra el valor de command menus contextuales, acciones por
selección y atajos para reducir fricción. No se debe copiar Linear
literalmente.

------------------------------------------------------------------------

## 11. Lo que no se debe hacer

No implementar: - formulario gigante; - wizard rígido para todos; -
chatbot obligatorio; - IA ejecutando operaciones financieras sin
confirmación; - campos duplicados; - cálculos financieros como fuente de
verdad en frontend; - seguridad basada en ocultar botones; - modales
encadenados; - confirmaciones para acciones triviales; - acusaciones
automáticas de fraude; - ML antifraude como primera capa; - copiar
SAP/Stripe/Linear literalmente; - dos modelos mentales coexistiendo en
la misma pantalla.

------------------------------------------------------------------------

## 12. Arquitectura frontend

Componentes conceptuales:

-   `PedidosWorkspace`
-   `PedidoIntentPicker`
-   `PedidoContextPanel`
-   `PedidoComposer`
-   `PedidoProposal`
-   `PedidoItemEditor`
-   `PedidoPricingSummary`
-   `PedidoRiskSignals`
-   `PedidoReview`
-   `PedidoCommitBar`
-   `PedidoActivityTimeline`
-   `PedidoCommandMenu`
-   `PedidoAuditDiff`
-   `PedidoExceptionPanel`

Separar: 1. server state; 2. draft state; 3. derived state; 4.
authorization state; 5. risk state; 6. offline/sync state.

El frontend puede mostrar cálculos, pero backend es autoridad.

------------------------------------------------------------------------

## 13. Contratos frontend/backend

El frontend envía intención y datos editables.

Backend determina: - precio; - permisos; - estado permitido; -
impacto; - autorización; - riesgo; - resultado.

La experiencia debe poder consumir respuestas conceptuales como:

``` ts
{
  calculation,
  permissions,
  allowedActions,
  warnings,
  riskSignals,
  requiresAuthorization,
  auditPreview
}
```

No duplicar reglas de negocio en React.

### Endpoints

Evaluar primero la evolución de endpoints existentes:

-   `POST /api/pedidos`
-   `PUT /api/pedidos/[id]`
-   `/ajustar-cantidad`
-   `/cancelar`
-   `/anular`
-   `/entrega`
-   `/resolver-disputa`
-   `/precios/resolver`

Se recomienda una operación de preview para preparar sin persistir, por
ejemplo:

`POST /api/pedidos/preview`

Debe devolver propuesta, cálculo, warnings, señales, acciones y
autorización requerida.

No crear endpoints duplicados si los contratos actuales pueden
evolucionar limpiamente.

------------------------------------------------------------------------

## 14. Métricas

Instrumentar: - tiempo de creación; - campos introducidos manualmente; -
pasos; - abandonos; - correcciones; - cambios de precio; - errores de
validación; - cancelaciones; - advertencias; - autorizaciones; - señales
de riesgo; - falsos positivos; - conflictos; - fallos de sincronización.

Comparar contra baseline anterior.

------------------------------------------------------------------------

## 15. Plan de desarrollo

### A --- Modelo de interacción

Mapa de intenciones, tareas, decisiones, información conocida,
inferencias y riesgos.

### B --- UX estructural

Arquitectura de información, workspace, flujos, estados, excepciones,
command surface y responsive.

### C --- Prototipo funcional

Nuevo pedido, repetición, nueva demanda, corrección, venta rápida,
PUNTO/DOMICILIO, pago y advertencias.

### D --- Contratos backend

Preview, acciones permitidas, cálculos, autorización, riesgo y
auditoría.

### E --- Implementación

Sustitución de la UI actual por el nuevo workspace sin mezclar modelos
mentales.

### F --- Seguridad

Casos de abuso intencional.

### G --- E2E

Happy paths + abuse paths + offline + responsive.

------------------------------------------------------------------------

## 16. Criterios de éxito

E1. Pedido habitual sin reintroducir datos conocidos.\
E2. Combinaciones inválidas no pueden confirmarse.\
E3. Operaciones sensibles muestran consecuencias antes de ejecutar.\
E4. Operaciones frecuentes requieren pocos gestos.\
E5. La interfaz se adapta al contexto.\
E6. Los errores son recuperables.\
E7. Operaciones sensibles tienen control backend y auditoría.\
E8. Advertencias son explicables.\
E9. Origen/canal/entrega/pago permanecen separados.\
E10. Offline nunca muestra como confirmado algo no confirmado por
servidor.\
E11. Accesibilidad básica verificada.\
E12. La nueva experiencia no es más lenta que la actual.

------------------------------------------------------------------------

## 17. Casos E2E antifraude obligatorios

-   manipular precio por HTTP;
-   manipular cliente;
-   manipular origen/canal;
-   descuento sin autorización;
-   saltar transición;
-   cancelar en estado inválido;
-   anular sin permiso;
-   replay de `offlineId`;
-   doble ejecución concurrente;
-   cambiar datos entre preview y commit;
-   pedido ajeno;
-   modificar pedido cerrado;
-   usar ajuste para crear nueva demanda;
-   crear nueva demanda como ajuste;
-   alterar cantidad después de entrega;
-   reutilizar autorización;
-   duplicar operación offline;
-   múltiples anulaciones/correcciones.

Cada prueba debe verificar:

**precondición → acción → resultado → auditoría → evidencia**.

------------------------------------------------------------------------

## 18. Gate final

No declarar Fase 3 terminada si: - la UI sigue siendo esencialmente un
formulario monolítico; - el usuario introduce datos que el sistema ya
conoce; - existe una regla crítica solamente en frontend; - una
operación sensible puede ejecutarse sin revisión/autorización; - no
puede reconstruirse un cambio financiero; - no están cubiertos los abuse
paths; - el modelo visual mezcla origen, canal, entrega o pago; -
offline puede producir duplicados o falsos positivos de confirmación.

------------------------------------------------------------------------

## 19. Principio final

La experiencia correcta no es:

**"llenar un formulario administrativo".**

Debe sentirse como:

**"confirmar una operación que el sistema ya preparó correctamente".**

La innovación está en eliminar trabajo innecesario sin eliminar control.

### Evidencia externa

OWASP Business Logic Security; OWASP Transaction Authorization; ACFE
occupational fraud; SAP Fiori/intent-based navigation; Microsoft 2026
enterprise intent/adaptive UI; Linear contextual command menu.
