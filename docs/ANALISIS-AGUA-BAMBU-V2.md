# Análisis Exhaustivo Multi-Dimensional: Agua Bambú v2

**Proyecto:** `/home/cristof/Documents/bambu_demo_multimodelo`  
**Fecha de análisis:** 2026-04-26  
**Tipo:** FULL

---

## 1. Resumen Ejecutivo del Modelo de Negocio

### 1.1 Productos Vendidos (5 tipos)

| Producto | Campo DB | Unidad | Notas |
|----------|---------|--------|-------|
| Agua 19L | `cAguaPed/Ent` | Paca (19L) | Producto principal |
| Hielo | `cHieloPed/Ent` | Paca | Alta rotación |
| Botellón | `cBotellonPed/Ent` | Unidad | Envase retornable |
| Bolsa Agua | `cBolsaAguaPed/Ent` | Bolsa | Formato ahorro |
| Bolsa Hielo | `cBolsaHieloPed/Ent` | Bolsa | Formato ahorro |

### 1.2 Ciclo de Negocio Diario

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CICLO DIARIO AGUA BAMBÚ                  │
├─────────────────────────────────────────────────────────────────────────┤
│  MAÑANA            │  DÍA              │  NOCHE            │
│  ─────────────    │  ──────           │  ───────          │
│  1. Producción     │  1. Pedidos      │  1. Cierre        │
│     (StockIni)     │     (Crear)       │     (Cálculos)     │
│  2. Configstock    │  2. Embarques    │  2. Comisiones    │
│                    │     (Asignar)     │  3. Nómina        │
│                    │  3. Entregas      │                   │
│                    │     (Actualizar)  │                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Flujo de Dinero

```
INGRESOS                              EGRESOS
───────────                          ────────
Ventas Agua    ──┐                 
Ventas Hielo   ──┤                    GASTOS        ──┐
Ventas Botellón──┼──→ CAJA         Comisiones    ──┤──→ EGRESO
Ventas Bolsas   ──┘   (Base+ventas) Salarios      ──┘
                                          
COBROS: efectivo, nequi, daviplata, transferencia
```

### 1.4 Modelo de Comisiones

| Tipo | Campo Trabajador | Default |
|------|----------------|---------|
| Por entrega agua | `comPacaAgua` | 200 |
| Por entrega hielo | `comPacaHielo` | 200 |
| Por producción | `comSelladorAgua/Hielo` | 300 |
| Producción (w/prod)` | `comSellTotal` | Calculado |

---

## 2. Diagrama ER de la Base de Datos

### 2.1 Entidades y Atributos

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              ESQUEMA ENTIDADES                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USUARIO                              PRODUCTO                               │
│  ─────────                            ────────                               │
│  + id: String (PK)                   + id: String (PK)                        │
│  + username: String (unique)         + productoId: String (unique)              │
│  + password: String                 + nombre: String                          │
│  + rol: String                     + unidad: String                           │
│  + activo: Boolean                 + precioMin: Float                        │
│  + createdAt, updatedAt             + precioMax: Float                        │
│                                    + comXUnidad: Float                      │
│                                    + tipo: String                           │
│                                    + activo: Boolean                       │
│  ──────────────────                ──────────────────                       │
│  1:N [Historial]                   NOTA: No se usa actualmente             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CLIENTE                                                                       │
│  ────────                                                                       │
│  + id: String (PK)                                                            │
│  + clienteId: String (unique) ── código CL-0001                              │
│  + nombre: String                                                             │
│  + apellido: String?                                                         │
│  + telefono: String                                                           │
│  + nombreNegocio: String?                                                    │
│  + tipoNegocio: String?                                                      │
│  + horaApertura: String?                                                      │
│  + direccion: String?                                                        │
│  + linkUbicacion: String?                                                     │
│  + barrio: String?                                                           │
│  + referencia: String?                                                       │
│  + precioAguaPref: Float?                                                     │
│  + frecuencia: String (default: NINGUNA)                                      │
│  + cadaNDias: Int?                                                           │
│  + ultEntrega: DateTime?                                                     │
│  + proxEntrega: DateTime?                                                     │
│  + activo: Boolean (default: true)                                              │
│  + notas: String?                                                            │
│  + habAgua, habHielo, habBotellon, habBolsaAgua, habBolsaHielo: Boolean       │
│  + createdAt, updatedAt                                                        │
│                                                                              │
│  1:N [Pedido] ─────┬────────────────────────────────┐                        │
│  1:N [Factura]    │                                │                        │
│  1:N [Abono]      │                                │                        │
│                   ▼                                ▼                        │
├────────────���─��───────────────────────────────────────────────────────────────┤
│                                  PEDIDO                                     │
│  ───────                                                                     │
│  + id: String (PK)                                                            │
│  + numero: Int (secuencial)                                                   │
│  + clienteId: String (FK)                                                   │
│  + embarqueId: String (FK?)                                                 │
│  + nombreCli: String                                                        │
│  + telefonoCli: String?                                                      │
│  + zonaCli: String?                                                          │
│  + tipo: String (ENVIO/MOSTRADOR/RECURRENTE)                                  │
│  + estado: String (PENDIENTE/EN_RUTA/ENTREGADO/CANCELADO/ANULADO)             │
│                                                                              │
│  [CANTIDADES PEDIDAS]              [CANTIDADES ENTREGADAS]            [PRECIOS]       │
│  + cAguaPed: Int = 0          + cAguaEnt: Int = 0      + precioAgua: Float    │
│  + cHieloPed: Int = 0          + cHieloEnt: Int = 0     + precioHielo: Float    │
│  + cBotellonPed: Int = 0        + cBotellonEnt: Int = 0    + precioBotellon: F  │
│  + cBolsaAguaPed: Int = 0      + cBolsaAguaEnt: Int = 0   + precioBolsaAgua: F  │
│  + cBolsaHieloPed: Int = 0      + cBolsaHieloEnt: Int = 0  + precioBolsaHielo:F  │
│                                                                              │
│  + total: Float = 0           (suma de precios × cantidades)                          │
│                                                                              │
│  [PAGOS]                                                                   │
│  + metodo1, monto1: String/Float                                            │
│  + metodo2, monto2: String/Float                                            │
│  + metodo3, monto3: String/Float                                            │
│  + totalPagado: Float = 0                                                   │
│  + saldo: Float = 0           (total - totalPagado)                             │
│                                                                              │
│  + repartidor: String?                                                        │
│  + obs: String?                                                             │
│  + fechaEntrega: DateTime?                                                   │
│  + fecha: DateTime (default: now)                                             │
│  + idOrigen: String? (FK auto-relación Pedido)                              │
│  + createdAt, updatedAt                                                      │
│                                                                              │
│  1:1 [Factura]        1:N [Historial]                                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                  FACTURA                                    │
│  ───────                                                                     │
│  + id: String (PK)                                                            │
│  + numero: String (FAC-00001)                                                │
│  + clienteId: String (FK?)                                                   │
│  + pedidoId: String (FK, unique)                                             │
│  + nombreCli: String                                                         │
│  + telefonoCli: String?                                                     │
│  + zonaCli: String?                                                          │
│  + fecha: DateTime                                                          │
│  + subtotal, total: Float                                                   │
│  + estado: String (EMITIDA)                                                  │
│  + notaCredito: String?                                                     │
│  + montoPagado: Float = 0                                                     │
│  + saldo: Float                                                             │
│  + createdAt, updatedAt                                                     │
│                                                                              │
│  1:N [Abono]                                                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                   ABONO                                     │
│  ─────                                                             │
│  + id: String (PK)                                                            │
│  + numero: String (unique)                                                 │
│  + facturaId: String (FK)                                                  │
│  + clienteId: String (FK?)                                                 │
│  + monto: Float                                                            │
│  + metodoPago: String                                                      │
│  + fecha: DateTime                                                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                 EMBARQUE                                    │
│  ────────                                                                   │
│  + id: String (PK)                                                            │
│  + numero: Int                                                              │
│  + fecha: DateTime                                                           │
│  + trabajadorId: String (FK)                                              │
│  + horaSalida: DateTime?                                                     │
│  + horaLlegada: DateTime?                                                   │
│  + estado: String (ABIERTO/CERRADO)                                          │
│                                                                              │
│  [CONTEO FÍSICO]                                                            │
│  + pacasAgua, pacasHielo: Int = 0                                          │
│  + devueltasAgua, devueltasHielo: Int = 0                                   │
│  + rotasAgua, rotasHielo: Int = 0                                             │
│                                                                              │
│  + obs: String?                                                             │
│  + createdAt, updatedAt                                                     │
│                                                                              │
│  1:N [Pedido]                                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                               TRABAJADOR                                    │
│  ──────────                                                                  │
│  + id: String (PK)                                                            │
│  + trabajadorId: String (unique)                                             │
│  + nombre: String                                                           │
│  + rol: String                                                              │
│  + tipoPago: String (COMISION/SALARIO)                                          │
│  + usaMoto: Boolean = false                                                 │
│  + comPacaAgua: Float = 200                                                 │
│  + comPacaHielo: Float = 200                                                │
│  + salarioFijo: Float = 0                                                    │
│  + deudaReposAgua, deudaReposHielo: Float = 0                                  │
│  + telefono: String?                                                         │
│  + activo: Boolean = true                                                   │
│  + createdAt, updatedAt                                                      │
│                                                                              │
│  1:N [Embarque]   1:N [Produccion]   1:N [Nomina]                       │
│                                                                              │
├──────────────────────────────────��─��─────────────────────────────────────────┤
│                               PRODUCCION                                    │
│  ──────────                                                                  │
│  + id: String (PK)                                                            │
│  + fecha: DateTime                                                           │
│  + turno: String (MANANA/TARDE/NOCHE)                                        │
│  + trabajadorId: String (FK)                                              │
│                                                                              │
│  [STOCK INICIAL]             [CONTEO PRODUCCIÓN]              [PRODUCCIÓN]    │
│  + stockIniAgua: Int = 0      + conteoAAgua, conteoBAgua: Int = 0  + prodAgua: I │
│  + stockIniHielo: Int = 0   + conteoAHielo, conteoBHielo: Int = 0 + prodHi │
│                                                                              │
│  [VENTAS]                    [STOCK FINAL]           [COMISIONES]            │
│  + ventasAgua, ventasHielo: Int = 0   + stockFinAgua, stockFinHielo: Int     │
│  + comSelladorAgua: Float = 0                                                      │
│  + comSelladorHielo: Float = 0                                                     │
│  + comSellTotal: Float = 0                                                        │
│                                                                              │
│  + obs: String?                                                             │
│  + createdAt: DateTime                                                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                NOMINA                                      │
│  ───────                                                                     │
│  + id: String (PK)                                                            │
│  + trabajadorId: String (FK)                                                 │
│  + fechaInicio, fechaFin: DateTime                                           │
│  + comEntregasAgua, comEntregasHielo: Float = 0                              │
│  + totalComisiones: Float = 0                 │
│  + salario: Float = 0                                                       │
│  + total: Float                  │
│  + estado: String (PENDIENTE)              │
│  + fechaPago: DateTime?                                                │
│  + createdAt, updatedAt                                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                 GASTO                                      │
│  ─────                                                             │
│  + id: String (PK)                                                           │
│  + fecha: DateTime                                                          │
│  + categoria: String                                                        │
│  + descripcion: String                                                      │
│  + monto: Float                                                             │
│  + responsable: String?                                                    │
│  + notas: String?                                                           │
│  + createdAt: DateTime                                                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                 INSUMO                                     │
│  ──────                                                                     │
│  + id: String (PK)                                                           │
│  + nombre: String                                                           │
│  + unidad: String                                                          │
│  + stock: Float = 0                                                         │
│  + stockMin: Float = 0                                                       │
│  + precioUnit: Float = 0                                                     │
│  + proveedorId: String (FK?)                                               │
│  + createdAt, updatedAt                                                      │
│                                                                              │
│  1:N [CompraInsumo]                                                       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                PROVEEDOR                                   │
│  ─────────                                                                  │
│  + id: String (PK)                                                           │
│  + nombre: String                                                          │
│  + telefono: String?                                                        │
│  + email: String?                                                           │
│  + direccion: String?                                                      │
│  + activo: Boolean = true                                                   │
│  + createdAt, updatedAt                                                      │
│                                                                              │
│  1:N [Insumo]   1:N [CompraInsumo]                                        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                              COMPRA_INSUMO                                 │
│  ────────────                                                                │
│  + id: String (PK)                                                           │
│  + numero: String (unique)                                                  │
│  + proveedorId: String (FK)                                                │
│  + insumoId: String (FK)                                                    │
│  + cantidad: Float                                                         │
│  + montoTotal: Float                                                        │
│  + fecha: DateTime                                                        │
│  + createdAt: DateTime                                                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                  CONFIG                                    │
│  ───────                                                                     │
│  + id: String (PK)                                                           │
│  + clave: String (unique)                                                    │
│  + valor: String                                                           │
│  + updatedAt: DateTime                                                      │
│                                                                              │
│  Notas: Usado para BASE_DIA, STOCK_INI_AGUA, STOCK_INI_HIELO, etc.           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                CIERRE_DIA                                  │
│  ─────────                                                                  │
│  + id: String (PK)                                                           │
│  + fecha: DateTime (unique)                                                  │
│                                                                              │
│  [PEDIDOS]                                                                  │
│  + numPedidos: Int = 0                                                      │
│  + totalVentas: Float = 0                                                  │
│                                                                              │
│  [VENTAS POR PRODUCTO]                                                       │
│  + aguaVendida, hieloVendido, botellonVendido: Int = 0                      │
│  + bolsaAguaVendida, bolsaHieloVendida: Int = 0                               │
│                                                                              │
│  [COBROS]                                                                  │
│  + cobrado, fiado, efectivo, nequi, daviplata, transferencia: Float = 0         │
│                                                                              │
│  [EGRESOS]                                                                 │
│  + baseDia, comisiones, salarios, gastos: Float = 0                           │
│                                                                              │
│  [STOCK]                                                                   │
│  + stockIniAgua, prodAgua, stockFinAgua: Int = 0                              │
│  + stockIniHielo, prodHielo, stockFinHielo: Int = 0                          │
│                                                                              │
│  + netoCaja: Float = 0                                                      │
│  + createdAt: DateTime                                                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                HISTORIAL                                    │
│  ────────                                                                    │
│  + id: String (PK)                                                           │
│  + entidad: String                                                         │
│  + registroId: String                                                      │
│  + accion: String                                                          │
│  + datos: String (JSON)                                                     │
│  + usuarioId: String?                                                      │
│  + fecha: DateTime                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Relaciones Entre Entidades

```
DIAGRAMA DE RELACIONES
==================

[User] 1 ────── N [Historial]

[Cliente] 1 ────── N [Pedido]
        │
        ├── N [Factura]
        └── N [Abono]

[Pedido] N ────── 1 [Cliente]
         │
         ├── 1 ────── 1 [Factura]
         │
         ├── N ────── 1 [Embarque] (opcional)
         │
         └── ? ────── ? [Pedido] (auto-relación idOrigen/pedidoHijo)

[Factura] 1 ────── N [Abono]

[Embarque] 1 ────── N [Pedido]
          │
          └── N ────── 1 [Trabajador]

[Trabajador] 1 ────── N [Embarque]
             │
             ├── N ────── N [Produccion]
             └── N ────── N [Nomina]

[Produccion] N ────── 1 [Trabajador]

[Nomina] N ────── 1 [Trabajador]

[Insumo] N ────── 1 [Proveedor]
         │
         └── N ────── N [CompraInsumo]

[CompraInsumo] N ────── 1 [Proveedor]
              └── N ────── 1 [Insumo]
```

### 2.3 Análisis de Normalización

**Estado: 2NF/3NF** (con gaps)

| Entidad | Normalización | Issue |
|--------|---------------|-------|
| User | ✅ 3NF | |
| Cliente | ✅ 3NF | Falta `zona` como campo propio (usa barrio) |
| Pedido | ⚠️ 2NF | Mezcla datos de entrega (cAguaPed + cAguaEnt) y cobro (metodo1-3) |
| Producto | ⚠️ No se usa | Definido pero no referenciado en Pedido |
| Factura | ✅ 3NF | pero duplica datos del cliente |
| Embarque | ✅ 3NF | |
| Trabajador | ✅ 3NF | |
| Produccion | ✅ 3NF | |
| Nomina | ✅ 3NF | |
| Gasto | ✅ 3NF | |
| Insumo | ✅ 3NF | |
| Proveedor | ✅ 3NF | |
| CompraInsumo | ✅ 3NF | |
| Config | ✅ 3NF | |
| CierreDia | ✅ 3NF | |
| Historial | ✅ 3NF | |

---

## 3. Matriz de Funcionalidades

### 3.1 Págs. Implementadas vs Faltantes

| Módulo | Página | Estado | Frontend | Backend | Notas |
|--------|-------|--------|----------|---------|-------|
| **Dashboard** | `/dashboard` | ✅ | 95% | - | Stats completos, stock, caja |
| **Clientes** | `/clientes` | ✅ | 90% | 85% | CRUD, búsqueda, historial |
| **Pedidos** | `/pedidos` | ✅ | 70% | 75% | Falta crear pedidos |
| **Embarques** | `/embarques` | ✅ | 85% | 80% | Asignar pedidos |
| **Producción** | `/produccion` | ✅ | 80% | 75% | Step wizard |
| **Cierre** | `/cierre` | ✅ | 75% | 70% | Preview + cerrar día |
| **Facturas** | `/facturas` | ❌ | 5% | 0% | Solo header |
| **Gastos** | `/gastos` | ❌ | 5% | 0% | Solo header |
| **Nomina** | `/nomina` | ❌ | 5% | 0% | Solo header |
| **Reportes** | `/reportes` | ❌ | 5% | 0% | Solo header |
| **Insumos** | `/insumos` | ❌ | 5% | 0% | Solo header |

### 3.2 APIs Implementadas vs Faltantes

| Endpoint | Estado | Métodos | Notas |
|----------|--------|--------|-------|
| `/api/pedidos` | ✅ | GET, POST | |
| `/api/pedidos/[id]` | ✅ | GET, PUT, DELETE | Falta lógica estado |
| `/api/clientes` | ✅ | GET, POST | |
| `/api/clientes/[id]` | ✅ | GET, PUT, DELETE | |
| `/api/embarques` | ✅ | GET, POST | |
| `/api/embarques/[id]` | ✅ | GET, PUT | Asignar pedidos |
| `/api/produccion` | ✅ | GET, POST | |
| `/api/cierre` | ✅ | GET, POST | |
| `/api/cierre/last` | ✅ | GET | |
| `/api/trabajadores` | ✅ | GET, POST | |
| `/api/gastos` | ✅ | GET, POST | |
| `/api/config` | ✅ | GET, POST | |
| `/api/config/BASE_DIA` | ✅ | GET | |
| `/api/search` | ⚠️ | GET | Endpoint genérico |
| `/api/auth/[...nextauth]` | ⚠️ | POST | Estructura pero no funcional |

### 3.3 Componentes Implementados

| Componente | Estado | Uso |
|------------|--------|-----|
| `PedidoForm` | ❌ | No existe |
| `ClienteForm` | ✅ | Clientes |
| `EmbarqueCard` | ⚠️ | Definido pero no usado |
| `BaseCajaModal` | ✅ | Dashboard |
| `AppSidebar` | ✅ | Layout |
| `Providers` | ✅ | next-auth providers |
| `OfflineBanner` | ✅ | Sync offline |
| UI Components | ✅ | shadcn/ui style |

---

## 4. Lista Priorizada de Gaps

### 4.1 Gaps Críticos (P0)

| # | Gap | Módulo | Impacto | Solución |
|---|-----|--------|---------|----------|
| P0-1 | No existe PedidoForm | Pedidos | No se pueden crear pedidos | Crear componente + API |
| P0-2 | Facturas no funcional | Facturas | Sin control de cobros | Full CRUD + abonos |
| P0-3 | Abonos no funcional | Facturas | No se pueden registrar pagos | CRUD Abonos |
| P0-4 | Auth no configurado | Sistema | Sin login real | Config next-auth |

### 4.2 Gaps Altos (P1)

| # | Gap | Módulo | Impacto | Solución |
|---|-----|--------|---------|----------|
| P1-1 | Gastos no funcional | Gastos | Sin registro gastos | Full CRUD |
| P1-2 | Nomina no funcional | RRHH | Sin cálculo nóminas | Full + cálculo |
| P1-3 | Reportes vacíos | Reportes | Sin analytics | Dashboards analytics |
| P1-4 | Insumos no funcional | Inventario | Sin controlstock | Full CRUD |
| P1-5 | Cliente zona | Clientes | Zona enPedido, no en Cliente | Agregar campo |

### 4.3 Gaps Medios (P2)

| # | Gap | Módulo | Impacto | Solución |
|---|-----|--------|---------|----------|
| P2-1 | Producto no usado | Catalogo | Definido no usado | Usar en pedidos |
| P2-2 | Historial no usado | Auditoria | No se registra | Agregar logging |
| P2-3 | Offline sync | Sincronización | Parcialmente implementado | Completar sync |
| P2-4 | Notifications | UX | Sin alertas push | Agregar toast |

### 4.4 Gaps Bajos (P3)

| # | Gap | Módulo | Impacto | Solución |
|---|-----|--------|---------|----------|
| P3-1 | Proveeedor no usado | Compras | UI no existe | Agregar página |
| P3-2 | CompraInsumo no usado | Compras | API no existe | Full CRUD |
| P3-3 | Worker details | Embarques | Sin ver detalle entregas | Mejorar UI |

---

## 5. Análisis Frontend

### 5.1 UX/UI Actual

**Framework:** Next.js 14 (App Router) + shadcn/ui (partial)  
**Estilo:** Clean, cards, step wizards, modals  
**Icons:** Emoji-based (⚠️ no ideal)

### 5.2 Evaluación UX por Módulo

| Módulo | UX Score | Issues |
|--------|----------|--------|
| Dashboard | 85% | Icons emoji, falta drill-down |
| Clientes | 80% | Faltan acciones en batch |
| Pedidos | 60% | Listo, pero sin crear |
| Embarques | 75% | Bien, falta map view |
| Producción | 80% | Stepper claro |
| Cierre | 70% | Inputs manuales |
| Facturas | 5% | Vacío |
| Gastos | 5% | Vacío |
| Nomina | 5% | Vacío |
| Reportes | 5% | Vacío |
| Insumos | 5% | Vacío |

### 5.3 Componentes Incompletos

1. **Pedido creation modal** - No existe
2. **Factura view/print** - No existe
3. **Abono form** - No existe
4. **Gasto form** - No existe
5. **Nomina calculation** - No existe
6. **Reporte charts** - No existe
7. **Insumos CRUD** - No existe

---

## 6. Bugs Potenciales Identificados

### 6.1 Bugs de Datos

| Bug | Ubicación | Descripción |
|-----|-----------|--------------|
| B-1 | Pedido.cAguaEnt | Cuando se crea, `cAguaEnt = 0` pero `cAguaPed > 0` → Inconsistencia |
| B-2 | Factura.estado | No se actualiza cuando se abona |
| B-3 | CierreDia | Si no existe producción, stockIni viene de config |
| B-4 | Produccion.stockIni | Se obtiene del cierre anterior, pero novalida siembarque |

### 6.2 Bugs de Lógica

| Bug | Ubicación | Descripción |
|-----|-----------|--------------|
| B-5 | Pedido.estado | No cambia automáticamente al entregas |
| B-6 | Embarque.cerrar | Novalida stockni actualiza pedidos |
| B-7 | Nomina | No se calcula automáticamente desde embarques |
| B-8 | Cliente.frecuencia | No genera pedidos recurrentes |

### 6.3 Bugs de UX

| Bug | Ubicación | Descripción |
|-----|-----------|--------------|
| B-9 | Dashboard | No hay refresh automático |
| B-10 | Embarque | No hay filtro por fecha |
| B-11 | Produccion | Novalida stock negativo |
| B-12 | Cierre | Datos se pierden al refresh |

---

## 7. Recomendaciones Técnicas

### 7.1 Prioridad de Implementación

```
FASE 1: CORE (Semanas 1-2)
────────────────────────────────
✓ P0-1: PedidoForm + создание pedidos
✓ P0-2: Facturas completo (ver, pagar)
✓ P0-3: Abonos funcional
✓ P1-1: Gastos CRUD

FASE 2: RRHH (Semanas 3-4)
────────────────────────────────
✓ P1-2: Nomina completo
✓ P1-5: Zona en Cliente
✓ P0-4: Auth config

FASE 3: ANALYTICS (Semanas 5-6)
────────────────────────────────
✓ P1-3: Reportes dashboard
✓ P2-2: Historial logging
✓ P2-4: Notifications

FASE 4: INVENTARIO (Semanas 7-8)
────────────────────────────────
✓ P1-4: Insumos completo
✓ P3-2: Compras a proveedores
```

### 7.2 Recomendaciones de Arquitectura

1. **Autenticación**: Configurar next-auth con providers reales
2. **Estado**: Mover a Zustand/TanStack Query para estado global
3. **Validaciones**: Agregar Zod en APIs y forms
4. **Offline**: Completar sync con workbox
5. **Testing**: Agregar Vitest + Playwright

### 7.3 Tech Stack Recomendado

| Capa | Actual | Recomendado |
|------|-------|-------------|
| Framework | Next.js 14 | Next.js 14 (ok) |
| DB | SQLite | PostgreSQL (producción) |
| ORM | Prisma | Prisma (ok) |
| UI | shadcn/ui | Mantener + agregar |
| State | useState | Zustand + React Query |
| Auth | next-auth | Mantener |
| Forms | Native | React Hook Form + Zod |

### 7.4 Base de Datos - Gaps a Corregir

1. Agregar `zona` a Cliente
2. Normalizar `Producto` → crear tabla relación Pedido Producto
3. Agregar timestamps faltantes
4. Agregar indexes en campos de búsqueda (fecha, estado)
5. Mover `metodo1-3` a tabla Payments

---

## Anexo: Archivos del Proyecto

### Estructura de archivos

```
src/
├── app/
│   ├── (app)/
│   │   ├── dashboard/page.tsx
│   │   ├── clientes/page.tsx
│   │   ├── pedidos/page.tsx
│   │   ├── embarques/page.tsx
│   │   ├── produccion/page.tsx
│   │   ├── cierre/page.tsx
│   │   ├── facturas/page.tsx ❌
│   │   ├── gastos/page.tsx ❌
│   │   ├── nomina/page.tsx ❌
│   │   ├── reportes/page.tsx ❌
│   │   ├── insumos/page.tsx ❌
│   │   └── layout.tsx
│   └── api/
│       ├── pedidos/
│       ├── clientes/
│       ├── embarques/
│       ├── produccion/
│       ├── cierre/
│       ├── trabajadores/
│       ├── gastos/
│       ├── config/
│       └── auth/
├── components/
│   ├── ui/ (shadcn components)
│   ├── PedidoForm.tsx ❌
│   ├── ClienteForm.tsx ✅
│   ├── EmbarqueCard.tsx ⚠️
│   └── ...
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   └── utils.ts
├── hooks/
└── stores/
    └── app-store.ts
```

---

*Documento generado automáticamente. Última actualización: 2026-04-26*