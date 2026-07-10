# Resaltar negocio coincidente en resultados de búsqueda de clientes

## Objetivo

Cuando un usuario busca en la lista de clientes y el resultado aparece porque coincide con un **negocio** (no con el dueño), la interfaz debe mostrar claramente el nombre de ese negocio. Esto elimina la confusión de ver un cliente sin entender por qué apareció en los resultados.

## Contexto

PR 1 ya implementó:
- Filtros de ubicación (cliente con link, negocios con/sin link).
- Visualización de negocios como chips en cada fila de cliente.
- Búsqueda que incluye campos de negocios formales (`nombre`, `direccion`, `barrio`, `tipoNegocio`, `referencia`).
- Modal de detalle y formulario de negocio accesibles desde la lista.

Lo que falta es la **retroalimentación visual de la coincidencia**: la búsqueda encuentra negocios, pero no indica cuál negocio hizo match.

## Comportamiento esperado

### Escenario 1: un solo negocio coincide

**Búsqueda:** `"la esquina"`

**Resultado:**
- Fila del cliente **Juan Pérez**.
- Debajo del nombre aparece: `"Coincide con el negocio: La Esquina"`.
- Al hacer click en el mensaje se abre el detalle del negocio.

### Escenario 2: varios negocios del mismo cliente coinciden

**Búsqueda:** `"calle 5"`

**Resultado:**
- Fila del cliente **María Gómez**.
- Debajo del nombre aparece: `"Coincide con 2 negocios"`.
- Al hacer click se abre el popover de negocios con los coincidentes ordenados primero y resaltados.

### Escenario 3: la búsqueda coincide con el cliente, no con un negocio

**Búsqueda:** `"Juan"`

**Resultado:**
- Fila del cliente **Juan Pérez**.
- No aparece mensaje de coincidencia de negocio.
- Se mantiene el comportamiento actual.

### Escenario 4: sin resultados

**Búsqueda:** `"xyz123"`

**Resultado:**
- Empty state actual. Sin cambios.

## Diseño de la interfaz

### Desktop (>640px)

```
[Avatar] Juan Pérez
         Coincide con el negocio: La Esquina  ← nueva línea, color azul/texto secundario
         [La Esquina] [Tienda] [+]
```

### Mobile (≤640px)

```
[Avatar] Juan Pérez
         Coincide con el negocio: La Esquina  ← misma línea debajo del nombre
         [La Esquina] [Tienda] [+]
```

El mensaje usa el mismo tamaño de texto que la línea de negocios para no competir visualmente con el nombre del cliente.

## Reglas de negocio

1. El mensaje solo aparece cuando hay un término de búsqueda activo y al menos un negocio formal activo del cliente coincide con el término.
2. Negocios inactivos no se consideran (el Server Component ya filtra `activo: true`).
3. Campos de negocio que producen coincidencia: `nombre`, `direccion`, `barrio`, `tipoNegocio`, `referencia`.
4. Búsqueda insensible a mayúsculas/minúsculas y acentos, consistente con la búsqueda existente.
5. Si coincide un solo negocio, el mensaje es clickable y abre el detalle.
6. Si coinciden varios, el mensaje abre el popover de negocios con los coincidentes primero.
7. Si la coincidencia es solo del cliente (nombre, teléfono, dirección, notas, contactos), no se muestra mensaje.

## Arquitectura

- **Helper puro** en `src/lib/cliente-filters.ts`: `getNegocioSearchMatch(cliente, term)` devuelve `{ matchedNegocios: NegocioMatch[] }`.
- **Componente presentacional** `src/components/negocio-search-match.tsx`: recibe `cliente`, `search` y callbacks; renderiza el mensaje o `null`.
- **Integración** en `src/app/(app)/clientes/clientes-client/cliente-table.tsx`: usar el componente dentro de cada fila cuando `search` no esté vacío.
- **No se toca el Server Component** ni se hacen peticiones adicionales. Todo es client-side sobre datos ya cargados.

## Tipos

```ts
interface NegocioMatch {
  id: string
  nombre: string
}

interface NegocioSearchMatchResult {
  matchedNegocios: NegocioMatch[]
}
```

## Manejo de errores

- Si `cliente.negocios` es `undefined`, el helper devuelve array vacío.
- Si `search` es vacío o tiene menos de 1 carácter, el componente devuelve `null`.
- El componente no lanza errores por datos parciales.

## Accesibilidad

- El mensaje clickable usa `<button>` con `aria-label` descriptivo, no solo un `div` con onClick.
- Foco visible consistente con `:focus-visible` definido en `globals.css`.
- Contraste suficiente con el fondo.

## Testing

### Unitarios

- `getNegocioSearchMatch` con un negocio que coincide por nombre.
- Coincidencia por dirección, barrio, tipo y referencia.
- Múltiples coincidencias.
- Sin coincidencias.
- Término vacío devuelve array vacío.
- Negocios `undefined` no rompen.

### E2E

- Buscar por nombre de negocio y verificar que aparece `"Coincide con el negocio: ..."`.
- Click en el mensaje abre el detalle del negocio.
- Buscar por nombre de cliente no muestra mensaje de negocio.

## Criterios de éxito

1. Al buscar un negocio por nombre, el usuario ve el nombre del negocio en el resultado.
2. Click en el mensaje de coincidencia abre el detalle o popover correspondiente.
3. `npx tsc --noEmit` pasa.
4. `npm run test` pasa (salvo flakiness preexistente).
5. `npx playwright test e2e/clientes.spec.ts --project=chromium` pasa.
6. No se degradan tiempos de carga ni se agregan peticiones de red.

## Alcance explícitamente fuera

- No se modifica la lógica de búsqueda existente.
- No se agregan nuevos endpoints.
- No se modifica la base de datos.
- No se implementa highlight de texto parcial dentro del nombre.
- No se agrega búsqueda fonética o fuzzy.
