# Plan técnico definitivo — Nuevo Embarque y control operativo
## Agua Bambú

**Estado:** Propuesta técnica consolidada para revisión e implementación  
**Alcance:** frontend + integración con backend existente + reglas de UX/control del flujo manual de creación de embarques.  
**Restricción:** Agua Bambú **NO es multitenant**. No introducir `tenant_id`, aislamiento multiempresa ni arquitectura multi-tenant.

---

## 1. Objetivo

Rediseñar **Nuevo Embarque manual** para que el usuario tome la menor cantidad posible de decisiones y el sistema haga automáticamente los cálculos e inferencias que pueda hacer de forma segura.

> **El humano declara hechos y resuelve excepciones; el sistema calcula, valida, relaciona y propone.**

Debe reducir errores de digitación, decisiones innecesarias, doble asignación, inconsistencias entre pedido y embarque, salidas de inventario sin destino, modificaciones silenciosas y riesgos de fraude, sin sobreingeniería.

---

## 2. Modelo conceptual

Un embarque representa una operación física de salida de producto.

```text
Pedidos
  ↓
Embarque
  ├── Entregas
  ├── Cobros
  ├── Recogidas
  ├── Devoluciones
  ├── Reposiciones
  ├── Ventas a empleados
  ├── Merma/incidencias
  └── Retorno al almacén
```

Los dominios permanecen relacionados, pero no deben fusionarse artificialmente.

---

## 3. Flujo principal

### Paso 1 — Pedidos

El usuario parte de los pedidos:

> “Tengo estos pedidos y quiero sacarlos.”

La interfaz muestra automáticamente los pedidos relevantes según las reglas ya definidas.

Cada pedido debe mostrar, sin abrir otra pantalla:
- cliente/negocio;
- ubicación;
- productos y cantidades;
- fecha;
- horario preferido;
- información relevante de fiado/pago.

La carga se deriva:

```text
Carga requerida = suma de productos de los pedidos seleccionados
```

No pedir al usuario que vuelva a escribir cantidades que el sistema ya conoce.

### Paso 2 — Confirmar

Mostrar únicamente lo necesario:
- repartidor: obligatorio y elegido explícitamente;
- carga: calculada, visible y editable;
- hora de salida: por defecto hora actual de Bogotá;
- base de dinero: inicia en $0 y se ingresa conscientemente;
- ruta, tipo de vehículo y observaciones: opciones secundarias.

CTA:

> **Crear embarque y asignar N pedidos**

---

## 4. Capacidad del motocarga

La capacidad **no debe estar hardcodeada en frontend**. Debe provenir de la configuración/datos de negocio.

Ejemplo:

```text
Pedido: 80 pacas
Capacidad configurada: 70

Asignado: 70
Pendiente: 10
```

Las 10 pendientes pertenecen al pedido y **no son sobrantes**.

En cambio:

```text
Asignado: 70
Entregado: 68
Sobrante: 2
```

son 2 sobrantes del embarque.

El sistema debe diferenciar inequívocamente:

```text
Pedido solicitado
Asignado
Pendiente
Cargado
Entregado
Sobrante
```

La capacidad se calcula automáticamente y se explica cuando existe una diferencia.

---

## 5. Creación + asignación

El objetivo es:

```text
Seleccionar pedidos
→ confirmar
→ crear embarque
→ asignar pedidos
```

No crear primero un embarque vacío para después recorrer otra pantalla.

Si el POST crea el embarque pero la asignación falla:
- conservar el embarque;
- informar del estado parcial;
- mostrar los pedidos no asignados;
- no duplicar la operación;
- no forzar reintentos.

---

## 6. Concurrencia

El backend actual protege la doble asignación mediante condición de pedido libre y conflicto `409`.

El frontend debe:
- actualizar la lista cuando sea posible;
- detectar pedidos asignados mientras el formulario está abierto;
- deseleccionarlos;
- explicar el conflicto;
- no sobrescribir;
- no forzar reintentos.

Ejemplo:

> “El pedido de Tienda El Sol ya fue asignado a otro embarque.”

---

## 7. Offline

Respetar el modelo offline-first existente.

El flujo debe:
- utilizar identificadores idempotentes;
- evitar duplicaciones por reintentos;
- conservar operaciones pendientes;
- distinguir estado local de confirmación del servidor;
- manejar conflictos durante sincronización.

Un conflicto durante replay debe terminar como revisión, nunca como doble asignación.

---

## 8. Conciliación física

Al cerrar el embarque, el sistema debe poder explicar dónde terminó el producto:

```text
Producto cargado
=
entregado
+ vendido a empleado
+ recogido/devuelto
+ merma/incidencia autorizada
+ retornado al almacén
+ otro destino válido
```

Si no cuadra:

```text
⚠️ Diferencia pendiente de explicar
```

El sistema calcula la diferencia; el humano explica o resuelve la excepción.

---

## 9. Ventas a empleados

La política de precio especial para empleados se mantiene y debe seguir siendo de baja fricción.

Una compra legítima:

```text
Empleado
→ producto
→ precio empleado
→ cantidad
→ pago
→ salida registrada
```

No se debe tratar automáticamente como sospechosa.

El problema es una salida sin destino o una combinación anómala de operaciones.

Si el producto proviene de un embarque, la venta debe poder relacionarse con él.

---

## 10. Sobrantes

Nunca permitir una salida informal:

> “Me sobraron 3, me las llevo.”

El sistema calcula:

```text
Cargadas: 70
Entregadas: 67
Sobrantes: 3
```

Las 3 deben tener destino:
- retorno al almacén;
- venta a empleado;
- otra operación válida;
- incidencia/merma autorizada;
- otro destino autorizado.

No debe existir una salida silenciosa.

---

## 11. Obsequios/promociones

Los regalos deben ser salidas identificables y, cuando corresponda, derivados de una regla/promoción.

Ejemplo:

```text
Pedido: 80
Regalo permitido: 2
Total entregado: 82
```

No hardcodear reglas comerciales en frontend.

Una excepción manual debe quedar identificada como excepción.

---

## 12. Cobros y fiados

El embarque puede incluir cobros.

Distinguir:

```text
Saldo pendiente
↓
Abono
↓
Nuevo saldo
```

Los abonos no deben editar silenciosamente la historia.

Corrección:

```text
Abono original
↓
Reversión/corrección
```

No eliminar el movimiento original.

---

## 13. Reclamaciones, reposiciones y devoluciones

Son operaciones diferentes.

Ejemplo:

```text
Entrega
↓
Cliente reporta 2 faltantes
↓
Incidencia
↓
Revisión
↓
Reposición
```

No convertir automáticamente una declaración del repartidor o cliente en una salida adicional.

Toda reposición debe tener origen y relación con el evento original.

---

## 14. Devoluciones fuera de plazo

Las políticas vigentes de devolución deben aplicarse automáticamente.

Si una devolución está fuera del plazo establecido, el sistema debe detectarlo y enviarlo a revisión en lugar de tratarlo como devolución normal.

Ejemplo:

> Producto comprado hace más de seis días.

La interfaz debe explicar claramente por qué requiere revisión.

---

## 15. Producto dañado / filtrado / mal sabor

Distinguir:
- defecto atribuible a Bambú;
- daño posterior;
- almacenamiento inadecuado;
- reclamación sin evidencia suficiente;
- devolución autorizada;
- devolución rechazada.

El sistema registra hechos y aplica reglas; no acusa automáticamente.

---

## 16. Reversiones

Las operaciones relevantes nunca deben desaparecer.

Debe existir:

```text
Original
↓
Reversada
```

o:

```text
Original
↓
Corregida
```

No:

```text
DELETE
```

Aplicar especialmente a:
- cobros;
- abonos;
- devoluciones;
- reposiciones;
- inventario;
- ventas;
- ajustes.

---

## 17. Control antifraude

No construir un módulo que acuse personas.

El sistema debe detectar **señales**:
- diferencias físicas;
- sobrantes recurrentes;
- reposiciones repetidas;
- devoluciones anómalas;
- autoaprobaciones;
- operaciones fuera de política;
- ventas a empleados vinculadas repetidamente a sobrantes;
- múltiples incidencias entre el mismo cliente y repartidor;
- duplicaciones;
- cambios posteriores relevantes.

Resultado:

> **Requiere revisión.**

Nunca:

> “Fraude confirmado.”

---

## 18. Segregación de funciones

Aplicar proporcionalmente al riesgo.

Operación normal:

```text
Repartidor → ejecuta
```

Excepción sensible:

```text
Usuario → solicita
Supervisor/Administrador → aprueba
Usuario autorizado → ejecuta
```

No introducir aprobación humana para cada entrega.

---

## 19. Auditoría

Para operaciones relevantes conservar:

```text
qué ocurrió
quién lo hizo
cuándo ocurrió
qué había antes
qué quedó después
por qué
quién aprobó
```

Cuando corresponda:

```text
requested_by
approved_by
executed_by
```

Estos son conceptos; el equipo debe adaptarlos al esquema existente.

---

## 20. Detección de patrones

Analizar conjuntos de operaciones, no solamente eventos aislados.

Ejemplo:

```text
Empleado:
3 pacas lunes
3 martes
4 miércoles
3 jueves
3 viernes
```

Eso no demuestra fraude.

Pero puede ser una señal si además:

```text
los productos proceden repetidamente de sobrantes
+
los sobrantes son recurrentes
+
existe concentración en el mismo repartidor
```

Mostrar una señal de revisión, nunca una acusación.

---

## 21. Colusión

Considerar relaciones entre:

```text
cliente
repartidor
empleado
usuario que registra
usuario que aprueba
```

Una relación no demuestra fraude.

Una combinación repetida de incidencias, reposiciones, sobrantes y operaciones de empleados puede justificar revisión.

---

## 22. Cancelaciones

Cancelar una operación administrativa no significa que el producto haya vuelto físicamente.

```text
Cancelar pedido
≠
devolver automáticamente producto al stock
```

La devolución física debe quedar registrada independientemente.

---

## 23. Tiempo

Las reglas críticas de plazo deben usar una referencia temporal confiable del servidor.

La hora del dispositivo puede conservarse como información auxiliar.

---

## 24. Arquitectura frontend

Separar claramente el flujo de creación del de edición.

Estructura conceptual:

```text
CreateShipmentFlow
├── OrderSelection
├── ShipmentConfirmation
├── DerivedLoad
├── CapacitySummary
├── MoneyBase
└── ExceptionFeedback
```

Estados explícitos:

```text
IDLE
SELECTING_ORDERS
CONFIRMING
CREATING
ASSIGNING
CREATED
PARTIAL_SUCCESS
CONFLICT
OFFLINE_PENDING
ERROR
```

Evitar combinaciones ambiguas de múltiples booleanos.

---

## 25. Backend

No asumir que se necesita modificar backend.

Reutilizar los contratos existentes cuando cubran correctamente el comportamiento.

Las reglas de integridad crítica deben estar garantizadas por servidor, no solamente por frontend.

Modificar backend únicamente cuando la verificación técnica demuestre que una regla necesaria no puede garantizarse con el modelo actual.

---

## 26. No introducir sobreingeniería

No construir:
- multitenancy;
- `tenant_id`;
- arquitectura multiempresa;
- módulo antifraude independiente;
- IA que acuse usuarios;
- vigilancia invasiva;
- GPS permanente para control;
- reconocimiento facial;
- trazabilidad física innecesaria;
- reglas comerciales hardcodeadas;
- bloqueo de todas las excepciones;
- aprobación humana para operaciones normales;
- formularios gigantes;
- duplicación de datos existentes.

---

## 27. Criterios de aceptación

### UX
- Pedidos primero.
- Carga automática.
- Mínima digitación.
- Crear + asignar en un solo flujo.
- Móvil de primera clase.
- Campos secundarios fuera del camino principal.
- Excepciones explicadas en lenguaje normal.

### Negocio
- Pedido de 80 puede asignarse parcialmente si la capacidad configurada es 70.
- Las 10 restantes permanecen pendientes.
- Capacidad no hardcodeada.
- Regalos diferenciados.
- Cobros, devoluciones, reposiciones y entregas diferenciados.
- Toda salida tiene destino.
- Devoluciones fuera de política pueden escalar.

### Integridad
- Sin doble asignación.
- Sin duplicación por reintentos.
- Sin borrado silencioso de historia.
- Diferencias físicas calculables.
- Operaciones excepcionales trazables.

### Antifraude
- Señales, no acusaciones.
- Historia reconstruible.
- Separación de funciones cuando el riesgo lo requiera.
- Análisis acumulado de patrones.

### Técnico
- Reutilizar backend cuando sea suficiente.
- Integridad crítica en servidor.
- Offline/idempotencia conservados.
- Estados explícitos.
- Create y edit separados.
- Cero arquitectura multitenant.

---

## 28. Pruebas obligatorias

### Capacidad
1. 80 solicitadas / 70 de capacidad.
2. 70 / 70.
3. 71 / 70.
4. Múltiples pedidos que superan capacidad.
5. Modificación manual de carga.

### Concurrencia
6. Dos usuarios seleccionan el mismo pedido.
7. Pedido asignado mientras el wizard está abierto.
8. Conflicto `409`.
9. Reintento de una operación ya creada.

### Offline
10. Crear sin conexión.
11. Reconectar.
12. Reintento duplicado.
13. Pedido asignado durante desconexión.

### Inventario
14. Conciliación completa.
15. Faltante.
16. Sobrante.
17. Sobrante vendido a empleado.
18. Sobrante retornado.
19. Merma.

### Empleados
20. Compra legítima.
21. Compras repetidas.
22. Venta asociada a sobrantes.
23. Venta sin pago.
24. Salida sin destino.

### Incidencias
25. Faltante legítimo.
26. Reposición duplicada.
27. Devolución dentro de plazo.
28. Devolución fuera de plazo.
29. Producto dañado.
30. Reversión.

### Control
31. Autoaprobación.
32. Solicitud/aprobación separadas.
33. Diferencias recurrentes por repartidor.
34. Incidencias recurrentes cliente/repartidor.
35. Cancelación después de salida física.

---

# 29. Principio final

La complejidad debe existir **tras bambalinas**, no en la experiencia cotidiana.

El usuario debería experimentar:

```text
Elegir
→ revisar
→ confirmar
```

y solamente ante una excepción:

```text
Elegir
→ revisar excepción
→ resolver o solicitar aprobación
→ confirmar
```

El sistema debe hacer automáticamente los cálculos, relaciones y validaciones que pueda hacer correctamente.

El humano conserva la supervisión y el criterio donde realmente hacen falta.

**Meta final: máxima reducción de carga cognitiva sin sacrificar control, trazabilidad ni integridad.**

---

# 30. Referencia de evidencia externa

El enfoque de segregación proporcional, trazabilidad y controles sobre activos es consistente con prácticas documentadas por SAP y con marcos de control antifraude de COSO/ACFE. Estas referencias sirven como benchmarking, no como requisitos automáticos de Agua Bambú.

La arquitectura propuesta se adapta deliberadamente al tamaño y operación de Bambú y evita copiar la complejidad de sistemas empresariales grandes.


---

# 31. Alcance explícito del rediseño UX/UI y frontend

Este proyecto **NO debe interpretarse como una modificación incremental del formulario actual**.

El equipo debe evaluar la interfaz existente y, si su estructura actual impide alcanzar los objetivos definidos, **reconstruirla completamente**.

El objetivo no es conservar:
- el formulario actual;
- los mismos pasos;
- los mismos modales;
- la misma distribución;
- los mismos filtros;
- los mismos componentes;
- ni la misma navegación,

salvo aquellos elementos que, después del análisis, demuestren ser adecuados.

## 31.1 Rediseño de experiencia de usuario

El equipo debe replantear de extremo a extremo:

```text
Entrada al flujo
→ selección de pedidos
→ comprensión de la carga
→ asignación
→ validaciones
→ excepciones
→ confirmación
→ creación
→ asignación efectiva
→ resultado
→ recuperación ante error
```

Para cada etapa debe determinarse:

- qué necesita saber el usuario;
- qué puede calcular el sistema;
- qué puede inferir el sistema;
- qué debe decidir realmente una persona;
- qué información debe ocultarse porque no aporta a la decisión;
- qué información debe mostrarse porque evita un error;
- qué acción debe ser primaria;
- qué acciones son secundarias;
- qué estados debe comunicar la interfaz.

## 31.2 Principio de mínima carga cognitiva

El frontend debe seguir esta regla:

> **Si el sistema posee datos suficientes para tomar una decisión correcta y reversible, debe hacerlo automáticamente o proponerla claramente.**

El usuario no debe:
- sumar cantidades manualmente;
- calcular pendientes;
- calcular sobrantes;
- descubrir manualmente que un pedido excede capacidad;
- volver a introducir información que ya existe;
- navegar por múltiples pantallas para relacionar datos que el sistema ya conoce;
- memorizar reglas del negocio que el sistema puede aplicar.

Pero:

> **Si los datos no son suficientes para una decisión segura, la interfaz debe pedir únicamente el dato faltante.**

No pedir información por prevención genérica.

## 31.3 Sistema primero, humano después

La interfaz debe distinguir tres situaciones:

### Normal

```text
Sistema puede resolverlo
        ↓
Lo resuelve
        ↓
Usuario revisa
        ↓
Confirma
```

### Advertencia

```text
Sistema detecta algo relevante
        ↓
Lo explica
        ↓
Usuario confirma o modifica
```

### Excepción

```text
Sistema no puede resolverlo correctamente
        ↓
Explica qué falta o qué conflicto existe
        ↓
Usuario/supervisor decide
```

No convertir las tres situaciones en el mismo formulario.

---

# 32. Reconceptualización visual completa

El equipo debe analizar si la interfaz actual debe conservarse.

La respuesta esperada **no puede ser simplemente**:

> “El formulario actual funciona; agregaremos campos.”

Debe evaluarse una nueva composición visual orientada al trabajo real.

Como referencia conceptual:

```text
┌─────────────────────────────────────────┐
│ Nuevo embarque                           │
│                                         │
│ ¿Qué pedidos van a salir?               │
│                                         │
│ [ Buscar pedido / cliente ]             │
│                                         │
│ ☑ Tienda El Sol       80 pacas          │
│   Dirección · horario · saldo           │
│                                         │
│ ☑ Tienda La 10         25 pacas         │
│                                         │
├─────────────────────────────────────────┤
│ RESUMEN                                 │
│ 2 pedidos · 105 solicitadas              │
│                                         │
│ Vehículo: Motocarga                     │
│ Capacidad: 70                           │
│ Carga asignable: 70                     │
│ Pendientes: 35                          │
│                                         │
│ [ Revisar y crear embarque ]            │
└─────────────────────────────────────────┘
```

Esto es únicamente una **referencia conceptual**, no un diseño visual obligatorio.

El equipo debe proponer la solución UI que mejor cumpla los objetivos.

---

# 33. Información progresiva

No mostrar toda la complejidad simultáneamente.

La interfaz debe utilizar información progresiva:

### Siempre visible
Información necesaria para la decisión inmediata.

### Visible cuando existe una condición
Advertencias, diferencias, conflictos o excepciones.

### Secundaria
Información útil pero no necesaria para crear el embarque.

### Detalle
Historial y trazabilidad para quien necesite investigar.

Esto evita que controles antifraude, auditoría, inventario y reglas excepcionales contaminen la experiencia normal.

---

# 34. Responsive y móvil como requisito funcional

El flujo debe funcionar especialmente bien en móvil porque el usuario puede realizar operaciones durante la operación física.

No aceptar:

- desbordamientos horizontales;
- estadísticas cortadas;
- botones inaccesibles;
- formularios que requieran zoom;
- tablas que destruyan la legibilidad;
- modales que no permitan completar la acción;
- elementos importantes fuera del viewport.

Cada estado debe probarse en:

- móvil pequeño;
- móvil estándar;
- tablet;
- escritorio.

El responsive no debe ser una adaptación posterior del escritorio.

---

# 35. Estados visuales obligatorios

Cada flujo debe tener estados diseñados explícitamente:

```text
Inicial
Cargando
Sin pedidos
Pedidos encontrados
Pedidos seleccionados
Capacidad suficiente
Capacidad insuficiente
Carga modificada
Advertencia
Conflicto
Creando
Creado
Creado parcialmente
Offline pendiente
Sincronizando
Error recuperable
Error no recuperable
```

Cada estado debe indicar:

- qué ocurrió;
- qué está haciendo el sistema;
- qué puede hacer el usuario;
- qué acción es recomendable;
- si existe riesgo de duplicación.

---

# 36. Errores: no mostrar errores técnicos

La interfaz no debe trasladar al usuario:

```text
409
500
NetworkError
constraint violation
timeout
```

Debe traducirlos al contexto.

Ejemplo:

> **El pedido ya fue asignado.**  
> Otro usuario lo asignó mientras estabas preparando el embarque.

Y ofrecer la acción adecuada:

> [Actualizar pedidos]

---

# 37. Confirmaciones inteligentes

No pedir confirmación para acciones triviales.

Sí pedirla cuando exista una consecuencia relevante.

Ejemplo:

Cambiar una selección:

> sin confirmación adicional.

Crear un embarque que tiene:

```text
35 pedidos pendientes
```

puede requerir una explicación previa, pero no necesariamente un modal de “¿estás seguro?” genérico.

La confirmación debe comunicar la consecuencia real.

---

# 38. Prevención antes que corrección

La interfaz debe intentar evitar el error antes de que ocurra.

Ejemplo:

```text
Pedido: 80
Capacidad: 70
```

No esperar al submit para decir:

> “No se puede.”

Mostrar desde antes:

> “Se pueden asignar 70. Quedarán 10 pendientes.”

La prevención es preferible a mostrar errores después de la acción.

---

# 39. No duplicar información de otros módulos

Si el sistema ya posee:

- cliente;
- pedido;
- productos;
- cantidades;
- saldo;
- dirección;
- información de contacto;

el formulario no debe obligar al usuario a volver a registrarlos.

El embarque debe **referenciar** la información existente y mostrarla de forma contextual.

No convertir Nuevo Embarque en una segunda pantalla de Pedidos o Clientes.

---

# 40. Diseño orientado a decisiones

Cada bloque de UI debe justificar su existencia:

> **¿Qué decisión permite tomar?**

Si un elemento no ayuda a:
- comprender;
- verificar;
- ejecutar;
- detectar una excepción;

debe cuestionarse su presencia en el flujo principal.

Esto aplica especialmente a:
- estadísticas;
- filtros;
- cards;
- tabs;
- información duplicada;
- indicadores decorativos.

---

# 41. Validación UX antes de implementación definitiva

Antes de considerar terminado el rediseño, el equipo debe poder demostrar:

1. flujo normal;
2. pedido parcial por capacidad;
3. múltiples pedidos;
4. sobrante;
5. devolución;
6. reposición;
7. cobro;
8. venta a empleado;
9. incidencia;
10. conflicto concurrente;
11. operación offline;
12. error recuperable.

Para cada caso debe verificarse:

```text
¿Qué ve el usuario?
¿Qué calcula el sistema?
¿Qué decide el usuario?
¿Qué ocurre si cambia el dato?
¿Qué ocurre si el servidor rechaza la operación?
¿Qué ocurre si se pierde la conexión?
```

---

# 42. Entregables frontend esperados

El equipo debe devolver, antes o junto con la implementación:

### UX
- flujo completo;
- arquitectura de información;
- mapa de decisiones;
- estados;
- excepciones;
- criterios de interacción.

### UI
- nueva composición;
- componentes;
- responsive;
- estados visuales;
- accesibilidad;
- integración con Design System existente.

### Prototipo
Cuando el alcance lo justifique:

```text
prototipo navegable
```

para validar el flujo antes de comprometer toda la implementación.

### Ingeniería
- componentes implementados;
- contratos utilizados;
- estado de frontend;
- manejo de errores;
- offline;
- concurrencia;
- pruebas.

---

# 43. Criterio de aceptación adicional: “¿es realmente un rediseño?”

No considerar terminado el trabajo si:

- solamente se agregaron tabs;
- se conservaron los mismos problemas del formulario;
- se añadieron campos sin replantear el flujo;
- se trasladó complejidad del backend al usuario;
- se mantuvieron datos redundantes;
- se mantienen desbordamientos responsive;
- el sistema conoce un dato pero el usuario debe introducirlo otra vez;
- el usuario debe hacer cálculos que el sistema puede hacer;
- las excepciones aparecen únicamente después de enviar;
- el flujo no cambia materialmente respecto del anterior.

El resultado debe demostrar una **mejora funcional y experiencial**, no solamente una modificación visual.

---

# 44. Regla de implementación final

El equipo tiene libertad técnica para decidir:

- componentes;
- estructura interna;
- hooks;
- gestión de estado;
- composición;
- patrones;
- librerías compatibles;
- estrategia de pruebas;

siempre que respete:

1. las decisiones de producto;
2. las reglas de negocio;
3. los contratos backend existentes;
4. la integridad de los datos;
5. la experiencia de mínima carga cognitiva;
6. la ausencia de multitenancy;
7. la trazabilidad y controles definidos.

Si existe una solución técnica superior, debe proponerse con evidencia, impacto, riesgos y motivo; no debe introducirse silenciosamente como cambio de producto.

---

# 45. Resultado esperado del ataque técnico

El equipo no debe devolver únicamente:

> “Implementado.”

Debe devolver una evaluación técnica que permita responder:

- ¿La interfaz actual debía ser reemplazada?
- ¿Qué arquitectura frontend propone?
- ¿Qué componentes deben crearse/eliminarse?
- ¿Qué datos ya existentes pueden aprovecharse?
- ¿Qué reglas deben ejecutarse en frontend y cuáles en backend?
- ¿Qué estados y errores deben manejarse?
- ¿Qué casos límite se cubren?
- ¿Qué riesgos existen?
- ¿Qué regresiones pueden aparecer?
- ¿Qué pruebas demostrarán que funciona?
- ¿Qué parte se puede reutilizar?
- ¿Qué parte debe reconstruirse?
- ¿Qué complejidad es realmente necesaria?
- ¿Qué complejidad se está evitando?
- ¿Cómo se demuestra que la experiencia es mejor que la actual?

El objetivo final es que el equipo pueda atacar técnicamente el problema **sin interpretar “nuevo embarque” como “editar el formulario existente”**.
