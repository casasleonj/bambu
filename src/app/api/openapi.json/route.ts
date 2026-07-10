import { apiSuccess } from '@/lib/api-response'

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Agua Bambú API',
    version: '2.0.0',
    description: 'ERP para negocio de distribución de agua y hielo. APIs REST con autenticación JWT via NextAuth.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Desarrollo' },
    { url: 'https://portal.aguabambu.com', description: 'Producción' },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Health check',
        security: [],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
          '503': { description: 'DB no disponible' },
        },
      },
    },

    // ── Auth ──
    '/api/auth/[...nextauth]': {
      get: { tags: ['Auth'], summary: 'NextAuth session', security: [], responses: { '200': { description: 'Session' } } },
      post: { tags: ['Auth'], summary: 'NextAuth sign in / callback', security: [], responses: { '200': { description: 'Signed in' }, '401': { description: 'Invalid credentials' } } },
    },

    // ── Pedidos ──
    '/api/pedidos': {
      get: {
        tags: ['Pedidos'], summary: 'Listar pedidos',
        parameters: [
          { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'all', in: 'query', schema: { type: 'string', enum: ['true'] }, description: 'Retorna hasta 200 sin paginar' },
          { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' },
        ],
        responses: {
          '200': { description: 'Lista de pedidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/PedidoList' } } } },
        },
      },
      post: {
        tags: ['Pedidos'], summary: 'Crear pedido',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PedidoCreate' } } } },
        responses: {
          '201': { description: 'Pedido creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/PedidoResponse' } } } },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/pedidos/{id}': {
      get: {
        tags: ['Pedidos'], summary: 'Obtener pedido',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Pedido', content: { 'application/json': { schema: { $ref: '#/components/schemas/PedidoResponse' } } } } },
      },
      put: {
        tags: ['Pedidos'], summary: 'Actualizar pedido',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PedidoUpdate' } } } },
        responses: { '200': { description: 'Actualizado' } },
      },
      delete: {
        tags: ['Pedidos'], summary: 'Anular pedido (ADMIN/CONTADOR)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Anulado' } },
      },
    },
    '/api/pedidos/{id}/enviar': {
      post: {
        tags: ['Pedidos'], summary: 'Asignar pedido a embarque',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['embarqueId'], properties: { embarqueId: { type: 'string' } } } } } },
        responses: { '201': { description: 'Asignado' } },
      },
    },
    '/api/pedidos/recurrentes': {
      get: {
        tags: ['Pedidos'], summary: 'Preview de recurrentes pendientes',
        responses: { '200': { description: 'Preview' } },
      },
      post: {
        tags: ['Pedidos'], summary: 'Generar pedidos recurrentes (ADMIN/CONTADOR)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { decisiones: { type: 'array', items: { type: 'object' } }, fecha: { type: 'string', format: 'date' } } } } } },
        responses: { '201': { description: 'Generados' } },
      },
    },

    // ── Clientes ──
    '/api/clientes': {
      get: {
        tags: ['Clientes'], summary: 'Listar clientes',
        parameters: [{ $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' }, { name: 'all', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Clientes' } },
      },
      post: {
        tags: ['Clientes'], summary: 'Crear cliente (ADMIN/ASISTENTE)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ClienteCreate' } } } },
        responses: { '201': { description: 'Cliente creado' } },
      },
    },
    '/api/clientes/{id}': {
      get: {
        tags: ['Clientes'], summary: 'Obtener cliente + recomendaciones',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Cliente con pedidos y patrones de consumo' } },
      },
      put: {
        tags: ['Clientes'], summary: 'Actualizar cliente (ADMIN/ASISTENTE)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ClienteUpdate' } } } },
        responses: { '200': { description: 'Actualizado' } },
      },
      delete: {
        tags: ['Clientes'], summary: 'Desactivar cliente (ADMIN/CONTADOR)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Desactivado' } },
      },
    },
    '/api/clientes/{id}/fiado-status': {
      get: {
        tags: ['Clientes'], summary: 'Estado de fiados del cliente',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Estado de fiados', content: { 'application/json': { schema: { $ref: '#/components/schemas/FiadoStatusResponse' } } } },
          '404': { description: 'Cliente no encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/clientes/quick': {
      post: {
        tags: ['Clientes'], summary: 'Creación rápida de cliente',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ClienteQuickCreate' } } } },
        responses: { '201': { description: 'Cliente creado o retornado' } },
      },
    },
    '/api/clientes/recomendaciones': {
      get: {
        tags: ['Clientes'], summary: 'Recomendaciones de productos por cliente',
        parameters: [
          { name: 'clienteId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'canal', in: 'query', schema: { type: 'string', enum: ['DOMICILIO', 'PUNTO_VENTA', 'MAYORISTA', 'INTERNO'] } },
          { name: 'dias', in: 'query', schema: { type: 'integer' }, description: 'Días de historial a analizar' },
        ],
        responses: { '200': { description: 'Recomendaciones (top 20)' } },
      },
    },

    // ── Embarques ──
    '/api/embarques': {
      get: {
        tags: ['Embarques'], summary: 'Listar embarques',
        parameters: [
          { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } },
          { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' },
        ],
        responses: { '200': { description: 'Embarques' } },
      },
      post: {
        tags: ['Embarques'], summary: 'Crear embarque (ADMIN/REPARTIDOR)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EmbarqueCreate' } } } },
        responses: { '201': { description: 'Embarque creado' } },
      },
    },
    '/api/embarques/{id}': {
      get: {
        tags: ['Embarques'], summary: 'Obtener embarque',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Embarque con pedidos, trabajador, ruta' } },
      },
      put: {
        tags: ['Embarques'], summary: 'Actualizar embarque (ADMIN/REPARTIDOR)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EmbarqueUpdate' } } } },
        responses: { '200': { description: 'Actualizado' } },
      },
      delete: {
        tags: ['Embarques'], summary: 'Cancelar embarque (ADMIN)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Cancelado' } },
      },
    },
    '/api/embarques/{id}/cerrar': {
      post: {
        tags: ['Embarques'], summary: 'Cerrar ruta de embarque (ADMIN/REPARTIDOR)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CerrarEmbarque' } } } },
        responses: { '200': { description: 'Ruta cerrada, pedidos actualizados' } },
      },
    },
    '/api/embarques/auto': {
      post: {
        tags: ['Embarques'], summary: 'Generar embarques automáticos (ADMIN)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { rutaId: { type: 'string' }, limit: { type: 'integer' } } } } } },
        responses: { '201': { description: 'Embarques generados' } },
      },
    },

    // ── Finanzas ──
    '/api/cierre': {
      get: { tags: ['Finanzas'], summary: 'Resumen del día para cierre', responses: { '200': { description: 'Datos de cierre' } } },
      post: {
        tags: ['Finanzas'], summary: 'Ejecutar cierre del día (ADMIN)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CierreCreate' } } } },
        responses: { '201': { description: 'Día cerrado' }, '409': { description: 'Ya existe cierre hoy' } },
      },
    },
    '/api/cierre/last': {
      get: { tags: ['Finanzas'], summary: 'Último cierre', parameters: [{ name: 'includeDetails', in: 'query', schema: { type: 'boolean' } }], responses: { '200': { description: 'Último cierre' } } },
    },
    '/api/cierre-dia': {
      get: { tags: ['Finanzas'], summary: 'Historial de cierres (últimos 30)', parameters: [{ name: 'fecha', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { '200': { description: 'Cierres' } } },
      post: { tags: ['Finanzas'], summary: 'Registrar cierre manual (ADMIN)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CierreDiaCreate' } } } }, responses: { '201': { description: 'Cierre manual creado' } } },
    },
    '/api/facturas': {
      get: {
        tags: ['Finanzas'], summary: 'Listar facturas',
        parameters: [
          { name: 'pendiente', in: 'query', schema: { type: 'boolean' } },
          { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } },
          { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' },
        ],
        responses: { '200': { description: 'Facturas' } },
      },
      post: {
        tags: ['Finanzas'], summary: 'Crear factura (ADMIN/CONTADOR)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/FacturaCreate' } } } },
        responses: { '201': { description: 'Factura creada' } },
      },
    },
    '/api/abonos': {
      get: { tags: ['Finanzas'], summary: 'Listar abonos', parameters: [{ name: 'facturaId', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Abonos' } } },
      post: {
        tags: ['Finanzas'], summary: 'Registrar abono (ADMIN/CONTADOR)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AbonoCreate' } } } },
        responses: { '201': { description: 'Abono registrado' } },
      },
    },
    '/api/gastos': {
      get: {
        tags: ['Finanzas'], summary: 'Listar gastos',
        parameters: [{ name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } }, { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' }],
        responses: { '200': { description: 'Gastos' } },
      },
      post: { tags: ['Finanzas'], summary: 'Registrar gasto (ADMIN/CONTADOR)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GastoCreate' } } } }, responses: { '201': { description: 'Gasto registrado' } } },
    },
    '/api/nomina': {
      get: { tags: ['Finanzas'], summary: 'Listar nóminas', parameters: [{ name: 'pendientes', in: 'query', schema: { type: 'boolean' } }], responses: { '200': { description: 'Nóminas' } } },
      post: { tags: ['Finanzas'], summary: 'Crear nómina (ADMIN/CONTADOR)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NominaCreate' } } } }, responses: { '201': { description: 'Nómina creada' } } },
    },
    '/api/compras': {
      get: {
        tags: ['Inventario'], summary: 'Listar compras',
        parameters: [{ name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } }, { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' }],
        responses: { '200': { description: 'Compras' } },
      },
      post: { tags: ['Inventario'], summary: 'Registrar compra (ADMIN/CONTADOR)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CompraCreate' } } } }, responses: { '201': { description: 'Compra registrada' } } },
    },
    '/api/insumos': {
      get: { tags: ['Inventario'], summary: 'Listar insumos', parameters: [{ name: 'conStock', in: 'query', schema: { type: 'boolean' } }, { name: 'alertas', in: 'query', schema: { type: 'boolean' } }], responses: { '200': { description: 'Insumos' } } },
      post: { tags: ['Inventario'], summary: 'Crear insumo (ADMIN/CONTADOR)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InsumoCreate' } } } }, responses: { '201': { description: 'Insumo creado' } } },
    },

    // ── Admin ──
    '/api/trabajadores': {
      get: { tags: ['Admin'], summary: 'Listar trabajadores', parameters: [{ name: 'rol', in: 'query', schema: { type: 'string' } }, { name: 'activo', in: 'query', schema: { type: 'boolean' } }, { name: 'all', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Trabajadores' } } },
      post: { tags: ['Admin'], summary: 'Crear trabajador (ADMIN)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrabajadorCreate' } } } }, responses: { '201': { description: 'Trabajador creado' } } },
    },
    '/api/trabajadores/{id}': {
      put: { tags: ['Admin'], summary: 'Actualizar trabajador (ADMIN)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrabajadorUpdate' } } } }, responses: { '200': { description: 'Actualizado' } } },
      delete: { tags: ['Admin'], summary: 'Desactivar trabajador (ADMIN)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Desactivado' } } },
    },
    '/api/proveedores': {
      get: { tags: ['Admin'], summary: 'Listar proveedores', responses: { '200': { description: 'Proveedores activos' } } },
      post: { tags: ['Admin'], summary: 'Crear proveedor (ADMIN/CONTADOR)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProveedorCreate' } } } }, responses: { '201': { description: 'Proveedor creado' } } },
    },
    '/api/proveedores/{id}': {
      put: { tags: ['Admin'], summary: 'Actualizar proveedor (ADMIN/CONTADOR)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProveedorUpdate' } } } }, responses: { '200': { description: 'Actualizado' } } },
      delete: { tags: ['Admin'], summary: 'Desactivar proveedor (ADMIN/CONTADOR)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Desactivado' } } },
    },
    '/api/produccion': {
      get: { tags: ['Admin'], summary: 'Listar producción', parameters: [{ name: 'fecha', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { '200': { description: 'Registros de producción' } } },
      post: { tags: ['Admin'], summary: 'Registrar producción (ADMIN)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProduccionCreate' } } } }, responses: { '201': { description: 'Producción registrada' } } },
    },
    '/api/rutas': {
      get: { tags: ['Admin'], summary: 'Listar rutas', parameters: [{ $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' }], responses: { '200': { description: 'Rutas' } } },
      post: { tags: ['Admin'], summary: 'Crear ruta (ADMIN)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RutaCreate' } } } }, responses: { '201': { description: 'Ruta creada' } } },
      put: { tags: ['Admin'], summary: 'Actualizar ruta (ADMIN)', parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RutaUpdate' } } } }, responses: { '200': { description: 'Actualizada' } } },
      delete: { tags: ['Admin'], summary: 'Eliminar ruta (ADMIN)', parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Eliminada' } } },
    },
    '/api/rutas/analisis': {
      get: {
        tags: ['Admin'], summary: 'Análisis de rutas',
        parameters: [
          { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'minEntregas', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Análisis de patrones de entrega' } },
      },
    },
    '/api/recurrentes': {
      get: { tags: ['Admin'], summary: 'Listar pedidos recurrentes', responses: { '200': { description: 'Recurrentes' } } },
      post: { tags: ['Admin'], summary: 'Crear recurrente (ADMIN/CONTADOR)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RecurrenteCreate' } } } }, responses: { '201': { description: 'Recurrente creado' } } },
      put: { tags: ['Admin'], summary: 'Actualizar recurrente (ADMIN/CONTADOR)', parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RecurrenteUpdate' } } } }, responses: { '200': { description: 'Actualizado' } } },
      delete: { tags: ['Admin'], summary: 'Desactivar recurrente (ADMIN/CONTADOR)', parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Desactivado' } } },
    },

    // ── Reportes ──
    '/api/reportes/ventas': {
      get: {
        tags: ['Reportes'], summary: 'Reporte de ventas (ADMIN/CONTADOR)',
        parameters: [
          { name: 'start', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'end', in: 'query', schema: { type: 'string', format: 'date' } },
          { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' },
        ],
        responses: { '200': { description: 'Ventas con resumen por producto y método de pago' } },
      },
    },
    '/api/reportes/cartera': {
      get: {
        tags: ['Reportes'], summary: 'Reporte de cartera (ADMIN/CONTADOR)',
        parameters: [
          { name: 'minSaldo', in: 'query', schema: { type: 'number' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['saldo', 'fecha', 'cliente'] } },
        ],
        responses: { '200': { description: 'Cartera' } },
      },
    },

    // ── Precios / Config ──
    '/api/precios': {
      get: { tags: ['Precios'], summary: 'Listar precios actuales', responses: { '200': { description: 'Precios actuales por producto' } } },
      post: { tags: ['Precios'], summary: 'Actualizar/crear precio (ADMIN)', requestBody: { required: true, content: { 'application/json': { schema: { oneOf: [{ $ref: '#/components/schemas/PrecioVolumen' }, { $ref: '#/components/schemas/PrecioHistorial' }] } } } }, responses: { '200': { description: 'Actualizado' }, '201': { description: 'Creado' } } },
    },
    '/api/precios/tabla': {
      get: {
        tags: ['Precios'], summary: 'Tabla de precios por canal',
        parameters: [{ name: 'canal', in: 'query', schema: { type: 'string', enum: ['DOMICILIO', 'PUNTO_VENTA', 'MAYORISTA', 'INTERNO'], default: 'DOMICILIO' } }],
        responses: { '200': { description: 'Tabla de precios escalonados' } },
      },
    },
    '/api/precios/resolver': {
      post: {
        tags: ['Precios'], summary: 'Resolver precios para productos',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { codigo: { type: 'string' }, cantidad: { type: 'integer' }, precioManual: { type: 'number' } } } }, canal: { type: 'string' }, clienteId: { type: 'string' } } } } } },
        responses: { '200': { description: 'Precios resueltos' } },
      },
    },
    '/api/config': {
      get: {
        tags: ['Sistema'], summary: 'Leer configuración',
        parameters: [
          { name: 'clave', in: 'query', schema: { type: 'string' }, description: 'Una clave específica' },
          { name: 'keys', in: 'query', schema: { type: 'string' }, description: 'Múltiples claves separadas por coma' },
        ],
        responses: { '200': { description: 'Config' } },
      },
      post: { tags: ['Sistema'], summary: 'Guardar configuración (ADMIN)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ConfigCreate' } } } }, responses: { '201': { description: 'Guardado' } } },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT via NextAuth. Obtenido de la cookie de sesión.',
      },
    },
    parameters: {
      page: { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Número de página' },
      pageSize: { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 }, description: 'Items por página' },
    },
    schemas: {
      Success: { type: 'object', properties: { success: { type: 'boolean', enum: [true] } }, required: ['success'] },
      Error: { type: 'object', properties: { success: { type: 'boolean', enum: [false] }, error: { type: 'object', properties: { message: { type: 'string' }, formErrors: { type: 'array', items: { type: 'string' } }, fieldErrors: { type: 'object' } } } }, required: ['success', 'error'] },

      PedidoCreate: { type: 'object', required: ['clienteId', 'productos'], properties: { clienteId: { type: 'string' }, productos: { type: 'object', properties: { pacaAgua: { type: 'integer' }, pacaHielo: { type: 'integer' }, botellonFab: { type: 'integer' }, botellonDom: { type: 'integer' }, bolsaAgua: { type: 'integer' }, bolsaHielo: { type: 'integer' } } }, obs: { type: 'string' }, canal: { type: 'string', enum: ['DOMICILIO', 'PUNTO_VENTA', 'MAYORISTA', 'INTERNO'] }, fechaEntrega: { type: 'string', format: 'date-time' }, pagos: { type: 'array', items: { $ref: '#/components/schemas/Pago' } }, preciosManuales: { type: 'object' }, ventaRapida: { type: 'boolean' }, clienteNuevo: { type: 'object', properties: { nombre: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' }, barrio: { type: 'string' } } } } },
      PedidoUpdate: { type: 'object', properties: { estado: { type: 'string', enum: ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO'] }, obs: { type: 'string' }, cPacaAguaEnt: { type: 'integer' }, cPacaHieloEnt: { type: 'integer' }, cBotellonFabEnt: { type: 'integer' }, cBotellonDomEnt: { type: 'integer' }, cBolsaAguaEnt: { type: 'integer' }, cBolsaHieloEnt: { type: 'integer' } } },
      PedidoList: { type: 'object', properties: { success: { type: 'boolean' }, pedidos: { type: 'array', items: { $ref: '#/components/schemas/Pedido' } }, total: { type: 'integer' } } },
      PedidoResponse: { type: 'object', properties: { success: { type: 'boolean' }, pedido: { $ref: '#/components/schemas/Pedido' } } },
      Pedido: { type: 'object', properties: { id: { type: 'string' }, numero: { type: 'integer' }, tipo: { type: 'string', enum: ['PUNTO', 'ENVIO'] }, canal: { type: 'string' }, estado: { type: 'string', enum: ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO'] }, total: { type: 'number' }, saldo: { type: 'number' }, totalPagado: { type: 'number' }, nombreCli: { type: 'string' }, telefonoCli: { type: 'string' }, zonaCli: { type: 'string' }, fecha: { type: 'string', format: 'date-time' } } },
      Pago: { type: 'object', required: ['monto', 'metodo'], properties: { monto: { type: 'number', minimum: 0 }, metodo: { type: 'string', enum: ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'] } } },

      ClienteCreate: { type: 'object', required: ['nombre', 'telefono'], properties: { nombre: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' }, barrio: { type: 'string' }, frecuencia: { type: 'string', enum: ['NINGUNA', 'DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL'] }, dias: { type: 'string' }, preciosEspeciales: { type: 'object' }, obs: { type: 'string' } } },
      ClienteUpdate: { type: 'object', properties: { nombre: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' }, barrio: { type: 'string' }, frecuencia: { type: 'string' }, dias: { type: 'string' }, preciosEspeciales: { type: 'object' }, obs: { type: 'string' } } },
      ClienteQuickCreate: { type: 'object', required: ['nombre', 'telefono'], properties: { nombre: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' }, barrio: { type: 'string' } } },
      FiadoStatusResponse: { type: 'object', required: ['success', 'status'], properties: { success: { type: 'boolean', enum: [true] }, status: { $ref: '#/components/schemas/FiadoStatus' } } },
      FiadoStatus: { type: 'object', required: ['count', 'limite', 'nivel'], properties: { count: { type: 'integer', minimum: 0 }, limite: { type: 'integer', minimum: 0 }, nivel: { type: 'string', enum: ['ok', 'cerca', 'limite'] } } },

      EmbarqueCreate: { type: 'object', required: ['trabajadorId'], properties: { trabajadorId: { type: 'string' }, rutaId: { type: 'string' }, pedidoIds: { type: 'array', items: { type: 'string' } }, obs: { type: 'string' }, fecha: { type: 'string', format: 'date' } } },
      EmbarqueUpdate: { type: 'object', properties: { pedidoIds: { type: 'array', items: { type: 'string' } }, trabajadorId: { type: 'string' }, rutaId: { type: 'string' }, obs: { type: 'string' } } },
      CerrarEmbarque: { type: 'object', required: ['pedidos'], properties: { pedidos: { type: 'array', items: { $ref: '#/components/schemas/PedidoCuadre' } }, ventasLibres: { type: 'array', items: { $ref: '#/components/schemas/VentaLibre' } }, devueltas: { type: 'integer' }, rotas: { type: 'integer' }, obs: { type: 'string' } } },
      PedidoCuadre: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, cPacaAguaEnt: { type: 'integer' }, cPacaHieloEnt: { type: 'integer' }, cBotellonFabEnt: { type: 'integer' }, cBotellonDomEnt: { type: 'integer' }, cBolsaAguaEnt: { type: 'integer' }, cBolsaHieloEnt: { type: 'integer' }, cobro: { type: 'number' }, metodo: { type: 'string' } } },
      VentaLibre: { type: 'object', required: ['descripcion', 'monto'], properties: { descripcion: { type: 'string' }, monto: { type: 'number' }, metodo: { type: 'string' } } },

      CierreCreate: { type: 'object', required: ['baseDia'], properties: { baseDia: { type: 'number' }, comisiones: { type: 'number' }, salarios: { type: 'number' }, stockIniAgua: { type: 'integer' }, prodAgua: { type: 'integer' }, stockFinAgua: { type: 'integer' }, stockIniHielo: { type: 'integer' }, prodHielo: { type: 'integer' }, stockFinHielo: { type: 'integer' } } },
      CierreDiaCreate: { type: 'object', properties: { fecha: { type: 'string', format: 'date-time' }, numPedidos: { type: 'integer' }, totalVentas: { type: 'number' }, cobrado: { type: 'number' }, fiado: { type: 'number' }, efectivo: { type: 'number' }, transferencia: { type: 'number' }, nequi: { type: 'number' }, daviplata: { type: 'number' }, baseDia: { type: 'number' }, comisiones: { type: 'number' }, gastos: { type: 'number' }, stockIniAgua: { type: 'integer' }, stockFinAgua: { type: 'integer' }, stockIniHielo: { type: 'integer' }, stockFinHielo: { type: 'integer' }, netoCaja: { type: 'number' } } },

      FacturaCreate: { type: 'object', required: ['pedidoId'], properties: { pedidoId: { type: 'string' }, subtotal: { type: 'number' }, total: { type: 'number' }, saldo: { type: 'number' }, obs: { type: 'string' } } },
      AbonoCreate: { type: 'object', required: ['facturaId', 'monto', 'metodo'], properties: { facturaId: { type: 'string' }, monto: { type: 'number', minimum: 1 }, metodo: { type: 'string', enum: ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'] }, obs: { type: 'string' } } },
      GastoCreate: { type: 'object', required: ['monto', 'categoria', 'descripcion'], properties: { monto: { type: 'number', minimum: 0 }, categoria: { type: 'string' }, descripcion: { type: 'string' }, fecha: { type: 'string', format: 'date-time' }, metodoPago: { type: 'string' } } },
      NominaCreate: { type: 'object', required: ['trabajadorId', 'monto', 'periodoInicio', 'periodoFin'], properties: { trabajadorId: { type: 'string' }, monto: { type: 'number' }, periodoInicio: { type: 'string', format: 'date' }, periodoFin: { type: 'string', format: 'date' }, obs: { type: 'string' } } },
      CompraCreate: { type: 'object', required: ['insumoId', 'cantidad', 'costoUnitario'], properties: { insumoId: { type: 'string' }, cantidad: { type: 'number', minimum: 0 }, costoUnitario: { type: 'number', minimum: 0 }, proveedorId: { type: 'string' }, fecha: { type: 'string', format: 'date-time' }, obs: { type: 'string' } } },
      InsumoCreate: { type: 'object', required: ['nombre', 'unidad'], properties: { nombre: { type: 'string' }, unidad: { type: 'string' }, stockMin: { type: 'number' }, costoUnitario: { type: 'number' }, proveedorId: { type: 'string' } } },

      TrabajadorCreate: { type: 'object', required: ['nombre', 'rol'], properties: { nombre: { type: 'string' }, rol: { type: 'string', enum: ['REPARTIDOR', 'SELLADOR', 'OPERARIO'] }, telefono: { type: 'string' }, direccion: { type: 'string' }, email: { type: 'string', format: 'email' }, documento: { type: 'string' } } },
      TrabajadorUpdate: { type: 'object', properties: { nombre: { type: 'string' }, rol: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' }, email: { type: 'string' }, documento: { type: 'string' } } },

      ProveedorCreate: { type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' }, contacto: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' }, email: { type: 'string' }, obs: { type: 'string' } } },
      ProveedorUpdate: { type: 'object', properties: { nombre: { type: 'string' }, contacto: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' }, email: { type: 'string' }, obs: { type: 'string' } } },

      ProduccionCreate: { type: 'object', required: ['fecha'], properties: { fecha: { type: 'string', format: 'date-time' }, conteoAAgua: { type: 'integer' }, conteoBAgua: { type: 'integer' }, conteoAHielo: { type: 'integer' }, conteoBHielo: { type: 'integer' }, obs: { type: 'string' } } },

      RutaCreate: { type: 'object', required: ['nombre', 'dias'], properties: { nombre: { type: 'string' }, dias: { type: 'string', description: 'Días separados por coma' }, repartidorId: { type: 'string' }, repartidorRespaldoId: { type: 'string' }, horarioInicio: { type: 'string', pattern: '^\\d{2}:\\d{2}$' }, horarioFin: { type: 'string', pattern: '^\\d{2}:\\d{2}$' } } },
      RutaUpdate: { type: 'object', properties: { nombre: { type: 'string' }, dias: { type: 'string' }, repartidorId: { type: 'string' }, repartidorRespaldoId: { type: 'string' }, horarioInicio: { type: 'string' }, horarioFin: { type: 'string' } } },
      RecurrenteCreate: { type: 'object', required: ['clienteId', 'frecuencia'], properties: { clienteId: { type: 'string' }, frecuencia: { type: 'string', enum: ['DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL'] }, productos: { type: 'object', properties: { pacaAgua: { type: 'integer' }, pacaHielo: { type: 'integer' }, botellonFab: { type: 'integer' }, botellonDom: { type: 'integer' }, bolsaAgua: { type: 'integer' }, bolsaHielo: { type: 'integer' } } }, obs: { type: 'string' } } },
      RecurrenteUpdate: { type: 'object', properties: { frecuencia: { type: 'string' }, productos: { type: 'object' }, obs: { type: 'string' } } },

      PrecioVolumen: { type: 'object', required: ['precioVolumenId', 'precio'], properties: { precioVolumenId: { type: 'string' }, precio: { type: 'number', minimum: 0 } } },
      PrecioHistorial: { type: 'object', required: ['producto', 'precio'], properties: { producto: { type: 'string' }, precio: { type: 'number', minimum: 0 } } },
      ConfigCreate: { type: 'object', required: ['clave', 'valor'], properties: { clave: { type: 'string' }, valor: { type: 'string' }, descripcion: { type: 'string' } } },
    },
  },
}

export async function GET() {
  return apiSuccess(spec)
}
