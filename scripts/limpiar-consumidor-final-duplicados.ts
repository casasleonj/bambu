/**
 * Script de limpieza manual: consolida duplicados del cliente canónico
 * CONSUMIDOR_FINAL y asegura que el registro canónico tenga los valores
 * esperados (activo=false, nombre='Consumidor Final', telefono='').
 *
 * Contexto: Fase 3 / Fase 5 del fix de pedidos. El id 'CONSUMIDOR_FINAL' es
 * un registro sistémico para ventas anónimas. Si por algún motivo existen
 * duplicados (por imports históricos, bugs previos o entornos sin seed),
 * este script los consolida de forma idempotente.
 *
 * Uso:
 *   npx tsx scripts/limpiar-consumidor-final-duplicados.ts [--dry-run]
 *
 * --dry-run: solo reporta, no modifica la base de datos.
 */

import { prisma } from '@/lib/prisma'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const duplicados = await prisma.cliente.findMany({
    where: {
      id: { not: CANONICAL_CONSUMIDOR_FINAL_ID },
      nombre: { equals: 'Consumidor Final', mode: 'insensitive' },
      telefono: '',
    },
    select: { id: true, nombre: true, _count: { select: { pedidos: true, facturas: true } } },
  })

  const canonico = await prisma.cliente.findUnique({
    where: { id: CANONICAL_CONSUMIDOR_FINAL_ID },
    select: { id: true, nombre: true, activo: true, telefono: true },
  })

  // eslint-disable-next-line no-console
  console.log(`Cliente canónico: ${canonico ? 'OK' : 'FALTANTE'}`)
  if (canonico) {
    // eslint-disable-next-line no-console
    console.log(`  id=${canonico.id}, nombre=${canonico.nombre}, activo=${canonico.activo}, telefono="${canonico.telefono}"`)
  }

  // eslint-disable-next-line no-console
  console.log(`Duplicados encontrados: ${duplicados.length}`)
  for (const d of duplicados) {
    // eslint-disable-next-line no-console
    console.log(`  - ${d.id}: ${d._count.pedidos} pedidos, ${d._count.facturas} facturas`)
  }

  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log('Modo dry-run: no se realizaron cambios.')
    return
  }

  let reasignados = 0
  for (const d of duplicados) {
    // Reasignar pedidos y facturas del duplicado al canónico
    const [pedidos, facturas] = await prisma.$transaction([
      prisma.pedido.updateMany({ where: { clienteId: d.id }, data: { clienteId: CANONICAL_CONSUMIDOR_FINAL_ID } }),
      prisma.factura.updateMany({ where: { clienteId: d.id }, data: { clienteId: CANONICAL_CONSUMIDOR_FINAL_ID } }),
    ])
    reasignados += pedidos.count + facturas.count

    // Eliminar el duplicado vacío
    await prisma.cliente.delete({ where: { id: d.id } })
  }

  // Asegurar que el canónico tenga los valores esperados
  if (canonico) {
    await prisma.cliente.update({
      where: { id: CANONICAL_CONSUMIDOR_FINAL_ID },
      data: { activo: false, telefono: '', nombre: 'Consumidor Final' },
    })
  }

  // eslint-disable-next-line no-console
  console.log(`Limpieza completada: ${duplicados.length} duplicado(s) eliminado(s), ${reasignados} registro(s) reasignado(s).`)
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Error en limpieza:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
