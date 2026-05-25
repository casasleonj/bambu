# Diagrama de Flujo — Módulo Clientes

> **Propósito**: Mapa visual de qué puede hacer cada usuario en el módulo de Clientes, qué botones ve, a dónde lo llevan los links y qué restricciones existen.

---

## 1. Flujo Principal de Navegación

```mermaid
flowchart TD
    A[🔐 Usuario entra a la app] --> B{¿Está autenticado?}
    B -->|No| C[🚫 Redirigido a /login]
    B -->|Sí| D[📋 Lista de Clientes]

    D --> E[🔍 Buscar por nombre, teléfono, barrio, etc.]
    D --> F[🏷️ Filtrar: Con saldo pendiente]
    D --> G[🏷️ Filtrar: Con pedido recurrente]
    D --> H[📊 Ordenar: por nombre o fecha]

    E --> D
    F --> D
    G --> D
    H --> D

    D --> I{Acción del usuario}
    I -->|+ Nuevo Cliente| J[📝 Formulario de creación]
    I -->|Clic en una fila| K[📄 Panel de Detalle del Cliente]
    I -->|⋮ Acciones rápidas| L[⚡ Menú rápido]

    L --> L1[📞 Llamar al cliente]
    L --> L2[🛒 Crear pedido]
    L --> L3[📋 Copiar teléfono]
    L --> L4[📍 Copiar dirección]
```

---

## 2. Creación y Edición de Clientes

```mermaid
flowchart TD
    A[📝 Formulario de Cliente] --> B{¿Crear o Editar?}

    B -->|Crear| C[Sección: Datos Básicos]
    B -->|Editar| C

    C --> D[Sección: Ubicación]
    D --> E[Sección: Contactos Alternativos]
    E --> F[Sección: Pedido Recurrente]
    F --> G[Sección: Precios Especiales]

    G --> H{¿Guardar?}
    H -->|Cancelar| I[⬅️ Volver sin cambios]
    H -->|Guardar| J{¿Teléfono ya existe?}

    J -->|Sí| K[❌ Error: teléfono duplicado]
    J -->|No| L{¿Quién guarda?}

    L -->|ADMIN o ASISTENTE| M[✅ Cliente guardado]
    L -->|CONTADOR o REPARTIDOR| N[🚫 No tiene permiso para crear/editar]

    M --> O[📋 Vuelve a la Lista con el nuevo cliente]
```

---

## 3. Panel de Detalle del Cliente

```mermaid
flowchart TD
    A[📄 Panel de Detalle] --> B[4 pestañas disponibles]

    B --> C[📌 INFO]
    B --> D[📜 HISTORIAL]
    B --> E[📊 ESTADÍSTICAS]
    B --> F[🚨 ALERTAS]

    C --> C1[Datos del cliente: nombre, teléfono, dirección]
    C --> C2[Link a Google Maps]
    C --> C3[Contactos alternativos]
    C --> C4[Pedido recurrente si existe]
    C --> C5[Precios especiales por canal]

    D --> D1[Timeline de eventos: pedidos, pagos, facturas]
    D --> D2[Filtrar por tipo de evento]
    D --> D3[Ver rango: 3, 6, 12 meses o todo]
    D1 --> D4[🔗 Clic en evento → Ver pedido/factura/caso]

    E --> E1[KPIs: total comprado, pagado, saldo, pedidos]
    E --> E2[Gráfico de evolución mensual]
    E --> E3[Productos más pedidos]
    E --> E4[Métodos de pago usados]

    F --> F1[Alertas calculadas por comportamiento]
    F --> F2[Severidad: Alta / Media / Baja]
    F1 --> F3[🔗 Gestionar alerta → Crear caso]

    A --> G[Botones superiores del panel]
    G --> G1[🛒 Crear Pedido → /pedidos?cliente=ID]
    G --> G2[📞 Llamar → enlace tel:]
    G --> G3[✏️ Editar → modo edición inline]

    A --> H{¿Quién ve el botón Desactivar?}
    H -->|ADMIN o CONTADOR| I[🗑️ Desactivar cliente]
    H -->|ASISTENTE o REPARTIDOR| J[🚫 No ve el botón]

    I --> K[⚠️ Confirmar desactivación]
    K --> L[✅ Cliente queda oculto, no se borra]
    K --> M[❌ Cancelar, no pasa nada]
```

---

## 4. Mapa de Permisos por Rol

```mermaid
flowchart LR
    A[👤 Rol del Usuario] --> B{¿Qué puede hacer?}

    B --> C[👑 ADMIN]
    B --> D[💼 ASISTENTE]
    B --> E[📊 CONTADOR]
    B --> F[🚚 REPARTIDOR]

    C --> C1[✅ Ver clientes]
    C --> C2[✅ Crear clientes]
    C --> C3[✅ Editar clientes]
    C --> C4[✅ Desactivar clientes]
    C --> C5[✅ Creación rápida]

    D --> D1[✅ Ver clientes]
    D --> D2[✅ Crear clientes]
    D --> D3[✅ Editar clientes]
    D --> D4[🚫 No puede desactivar]
    D --> D5[✅ Creación rápida]

    E --> E1[✅ Ver clientes]
    E --> E2[🚫 No puede crear]
    E --> E3[🚫 No puede editar]
    E --> E4[✅ Desactivar clientes]
    E --> E5[✅ Creación rápida]

    F --> F1[✅ Ver clientes]
    F --> F2[🚫 No puede crear]
    F --> F3[🚫 No puede editar]
    F --> F4[🚫 No puede desactivar]
    F --> F5[✅ Creación rápida]
```

---

## 5. Redirecciones y Navegación Cruzada

```mermaid
flowchart TD
    A[📄 Panel de Detalle] --> B{¿A dónde lleva cada link?}

    B --> C[🛒 Crear Pedido]
    C --> C1[/pedidos?cliente=ID]
    C1 --> C2[Formulario de pedido con cliente preseleccionado]

    B --> D[🔄 Ver Plantilla Recurrente]
    D --> D1[/recurrentes/ID]
    D1 --> D2[Gestión de pedidos automáticos]

    B --> E[📋 Ver Pedido en Historial]
    E --> E1[/pedidos?openPedido=ID]
    E1 --> E2[Panel de detalle del pedido]

    B --> F[📄 Ver Factura en Historial]
    F --> F1[/facturas?openFactura=ID]
    F2[Panel de detalle de la factura]

    B --> G[🎫 Ver Caso en Historial]
    G --> G1[/casos]
    G1 --> G2[Lista de casos de soporte]

    B --> H[❌ Cerrar Panel]
    H --> H1[⬅️ Volver a Lista de Clientes]
```

---

## 6. Reglas de Negocio y Restricciones

| Regla | Qué pasa |
|-------|----------|
| **Teléfono único** | No se puede crear un cliente si ya existe otro con el mismo teléfono (activo o en contactos alternativos) |
| **Cliente inactivo** | No aparece en la lista, no se puede editar ni crearle pedidos |
| **Soft delete** | Al "eliminar" un cliente, solo se oculta. Los datos se conservan para historial |
| **Precios especiales** | Solo se guardan si son diferentes al precio base. Se configuran por canal (Domicilio / Punto de venta) |
| **Horario preferido** | Formato HH:mm. Es opcional |
| **Notas del cliente** | Máximo 500 caracteres |
| **Teléfono válido** | Debe ser formato colombiano: celular 3xx (10 dígitos) o fijo 60x (10-11 dígitos) |
| **Link de Maps** | Debe ser una URL válida. Es opcional |
| **Contactos alternativos** | Deben tener nombre y teléfono. Se pueden agregar varios |
| **Historial limitado** | El resumen de facturas máximo muestra 3 meses |

---

## 7. Resumen Visual de Botones por Pantalla

### Lista de Clientes (`/clientes`)

| Elemento | Tipo | Acción |
|----------|------|--------|
| `+ Nuevo Cliente` | Botón azul (header) | Abre modal de creación |
| `Buscar` | Input con lupa | Filtra por nombre, teléfono, barrio, negocio |
| `Con saldo` | Toggle pill | Muestra solo clientes con deuda |
| `Con frecuencia` | Toggle pill | Muestra solo con pedido recurrente |
| `Ordenar por Nombre` | Columna clickeable | Orden A→Z o Z→A |
| `Ordenar por Fecha` | Columna clickeable | Orden antiguo→reciente o viceversa |
| `⋮` (tres puntos por fila) | Menú desplegable | Llamar, crear pedido, copiar teléfono, copiar dirección |

### Panel de Detalle (side panel)

| Elemento | Tipo | Acción |
|----------|------|--------|
| `Crear Pedido` | Link azul | Va a `/pedidos` con cliente preseleccionado |
| `Llamar` | Link verde | Abre marcador telefónico |
| `Editar` | Botón gris | Activa modo edición inline |
| `Desactivar` | Botón rojo (solo ADMIN/CONTADOR) | Oculta el cliente tras confirmación |
| `Info / Historial / Stats / Alertas` | Pestañas | Cambia el contenido del panel |
| `X` (cerrar) | Botón | Cierra el panel, vuelve a la lista |

### Modal de Crear/Editar

| Elemento | Tipo | Acción |
|----------|------|--------|
| `Básico / Ubicación / Contactos / Recurrentes / Precios` | Pestañas internas | Navega entre secciones del formulario |
| `Cancelar` | Botón | Cierra el modal sin guardar |
| `Crear cliente` / `Guardar` | Botón azul | Valida y guarda los datos |
| `+ Agregar contacto` | Botón | Añade un contacto alternativo |
| `🗑️ Eliminar contacto` | Botón | Quita un contacto alternativo |
