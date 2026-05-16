# Cierre UX Redesign

## Problem
Current cierre page has 15+ card sections with no hierarchy, mixed read-only/editable data, redundant alerts, and no workflow order. Users find it chaotic.

## User Profile
- Admin/Asistente at Agua Bambú SAS
- Rural Colombia, 2G/3G connectivity
- Closes day daily (high-frequency task)
- End of day = tired, wants minimal friction
- Needs to verify numbers before irreversible close
- Counts physical Colombian cash (10 denominations)

## Design Principles Applied
1. **Task-based layout**: Organize around user workflow, not data structure
2. **Progressive disclosure**: Show what's needed, when needed
3. **5-second rule**: Status graspable in 2-3 seconds
4. **Group by action**: Read-only together, editable together
5. **Remove redundancy**: No duplicate info, no checklist separate from button state

## Layout (4 blocks, top to bottom)

### Block 1: Status Bar (always visible, compact)
- Date | Status badge (✅/❌) | Total ventas
- Right side: badge shows "Listo" or "Pendiente: N embarques"

### Block 2: Resumen Financiero (read-only)
- Top row: 6 KPI cells (Ventas, Cobrado, Fiado, Gastos, Cartera, Notas Crédito)
- Sub-section: Métodos de Pago (compact inline grid, 5 methods)
- Conditional: Ventas por Origen, Facturas, Embarques, Pedidos Perdidos, Clientes Nuevos, Descuentos
  — these are thin/summary, not full cards

### Block 3: Datos a Ingresar (editable inputs grouped)
- Base de Caja | Comisiones | Salarios
- Stock Agua: 3 inputs (Ini, Prod, Fin)
- Stock Hielo: 3 inputs (Ini, Prod, Fin)

### Block 4: Arqueo de Caja
- Trigger button "Contar Efectivo Físico" → opens modal (existing ArqueoCaja)
- After counting: shows Total Contado + Diferencia (inline summary)

### Block 5: Acciones
- Cerrar Día (primary button, disabled if conditions not met)
- Ver Reporte para Imprimir (secondary)

## What's Removed vs Current
- ❌ Checklist card (redundant — button disabled state communicates)
- ❌ Alertas card (fiado visible in resumen, diferencia in arqueo)
- ❌ Separate Stock cards (merged into block 3)
- ❌ "Volver al Dashboard" (yaCerrado state — kept but simplified)

## What's Kept
- ✅ ArqueoCaja modal (denominations component)
- ✅ Type-to-confirm for irreversible close (already implemented)
- ✅ Confirm modal (already implemented)
- ✅ BaseCajaModal (separate, not part of cierre page)
- ✅ Printable report page

## Visual Style
- No Card wrappers for internal sections — use simple divs with border-bottom or bg-gray-50
- KPI cells: bordered rectangles with large bold number + small label
- Block headers: sticky sub-header with section number/number
- Compact spacing: reduced padding, tighter grid
- Consistent color coding: green for positive, red for negative

## Behavioral
- Stock block shows inline formula: `Ini + Prod - Vendido = Fin`
- Arqueo block toggles between "Contar" button and summary once counted
- Cerrar button disabled if: statusCierre=INCOMPLETO || baseDia===0 || arqueo.totalContado===0

## Implementation Order
1. Restructure cierre-client/index.tsx (this file)
2. Remove redundant sections (checklist, alertas, stock cards)
3. Create new layout with 4 blocks
4. Compact spacing and visual hierarchy
5. Verify tsc + tests

## Sources
- Odoo POS closing screen (production, 6M users): single-page overlay, count in modal
- Lightspeed Retail: per-method breakdown inline
- Square POS: minimal modal (rejected for hiding difference)
- NNGroup: accordions fail when users need multi-section access
- NNGroup: wizards for infrequent tasks, not daily
- GOV.UK: accordions add interaction cost without benefit
