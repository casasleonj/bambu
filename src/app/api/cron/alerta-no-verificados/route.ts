import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requireCronSecret } from '@/lib/cron-auth'

/**
 * POST /api/cron/alerta-no-verificados
 * Runs daily at 6am. Finds unverified clients older than threshold days (default 30).
 * Protected by CRON_SECRET via x-cron-secret header.
 */
export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  try {
    // Leer umbral de Config, default 30 días
    const config = await prisma.config.findUnique({ where: { clave: 'DIAS_ALERTA_NO_VERIFICADO' } })
    const diasThreshold = config ? parseInt(config.valor, 10) : 30
    if (isNaN(diasThreshold) || diasThreshold <= 0) {
      logger.warn({ diasThreshold }, 'Umbral inválido, usando default 30')
    }
    const dias = isNaN(diasThreshold) || diasThreshold <= 0 ? 30 : diasThreshold

    const ahora = new Date()
    const fechaLimite = new Date(ahora)
    fechaLimite.setDate(fechaLimite.getDate() - dias)

    const clientesAlerta = await prisma.cliente.findMany({
      where: {
        verificado: false,
        createdAt: { lt: fechaLimite },
        activo: true,
      },
      select: {
        id: true,
        nombre: true,
        telefono: true,
        createdAt: true,
        creadoPorRol: true,
      },
    })

    let alertasCreadas = 0
    const fallos: string[] = []

    for (const cliente of clientesAlerta) {
      try {
        await prisma.historial.create({
          data: {
            entidad: 'Cliente',
            registroId: cliente.id,
            accion: 'ALERTA_NO_VERIFICADO',
            datos: JSON.stringify({
              nombre: cliente.nombre,
              telefono: cliente.telefono,
              diasSinVerificar: Math.floor((ahora.getTime() - cliente.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
              creadoPorRol: cliente.creadoPorRol,
            }),
          },
        })
        alertasCreadas++
      } catch (e) {
        logger.error({ err: e instanceof Error ? e.message : 'Unknown', clienteId: cliente.id }, 'Error creando alerta no verificado')
        fallos.push(`Cliente ${cliente.nombre}`)
      }
    }

    logger.info({ alertasCreadas, fallos: fallos.length, dias }, 'Cron alerta-no-verificados completado')

    return apiSuccess({
      alertasCreadas,
      diasThreshold: dias,
      fallos,
      mensaje: `${alertasCreadas} alerta(s) creada(s) para clientes no verificados (> ${dias} días)`,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error en cron alerta-no-verificados')
    return apiError('Error procesando alertas no verificados')
  }
}
