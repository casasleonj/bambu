/**
 * POST /api/cron/alerta-no-verificados
 *
 * commit 3.3 plan antifraude: este cron ahora crea Casos (no
 * solo entries en Historial) y reusa el partial unique index
 * `caso_dedup_abierto_cliente_unique` para dedup.
 *
 * Comportamiento:
 *
 * 1. Lee el umbral de Config `DIAS_ALERTA_NO_VERIFICADO` (default 30).
 * 2. Encuentra clientes activos con `verificado: false` y
 *    `createdAt < (now - umbral)`.
 * 3. Para cada cliente:
 *    a. Si ya existe Caso ABIERTO con alertaTipo='CLIENTE_NO_VERIFICADO'
 *       para ese cliente → skip (dedup via partial unique index).
 *    b. Si existe Caso RESUELTO/CERRADO con esa alertaTipo → REABRIR
 *       como ABIERTO (la condicion persiste, el admin cerro pero no
 *       arreglo la causa raiz).
 *    c. Si no existe Caso para ese cliente → crear uno nuevo.
 * 4. Auto-cierre: Caso con status=ABIERTO y createdAt < (now - 30d)
 *    sin accion del admin → cerrar como CERRADO con evento
 *    'auto_cierre' (commit 3.3: evita acumulacion infinita de casos
 *    abiertos que el admin ignora).
 *
 * Auth: requireCronSecret (header x-cron-secret).
 *
 * Idempotencia: corre diario, el partial unique index garantiza
 * que no se acumulen duplicados.
 */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requireCronSecret } from '@/lib/cron-auth'

const SISTEMA_USERNAME = 'system@bambu.local'
const AUTO_CIERRE_DIAS = 30

export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  try {
    // 1. SYSTEM user (commit 0a)
    const systemUser = await prisma.user.findUnique({
      where: { username: SISTEMA_USERNAME },
      select: { id: true },
    })
    if (!systemUser) {
      logger.error('[cron no-verificados] SYSTEM user no existe. Corre el seed.')
      return apiError('SYSTEM user no existe. Ejecutar seed primero.', 500)
    }

    // 2. Umbral de dias desde Config
    const config = await prisma.config.findUnique({
      where: { clave: 'DIAS_ALERTA_NO_VERIFICADO' },
    })
    const parsedDias = config ? parseInt(config.valor, 10) : 30
    const dias =
      isNaN(parsedDias) || parsedDias <= 0 ? 30 : parsedDias

    const ahora = new Date()
    const fechaLimite = new Date(ahora)
    fechaLimite.setDate(fechaLimite.getDate() - dias)

    // 3. Clientes candidatos
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

    let casosCreados = 0
    let casosReabiertos = 0
    const fallos: string[] = []

    // 4. Para cada cliente: dedup o crear/reabrir
    for (const cliente of clientesAlerta) {
      try {
        const casoExistente = await prisma.caso.findFirst({
          where: {
            clienteId: cliente.id,
            alertaTipo: 'CLIENTE_NO_VERIFICADO',
          },
          orderBy: { createdAt: 'desc' },
        })

        const diasSinVerificar = Math.floor(
          (ahora.getTime() - cliente.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        )
        const titulo = `Cliente ${cliente.nombre} sin verificar hace ${diasSinVerificar} días`
        const descripcion = `Detectado por cron diario. creadoPorRol: ${cliente.creadoPorRol ?? 'desconocido'}.`

        if (!casoExistente) {
          // Crear nuevo Caso. El partial unique index
          // (caso_dedup_abierto_cliente_unique) garantiza que no hay
          // duplicados con status=ABIERTO.
          await prisma.caso.create({
            data: {
              alertaTipo: 'CLIENTE_NO_VERIFICADO',
              severidad: 'MEDIA',
              titulo,
              descripcion,
              clienteId: cliente.id,
              creadoPorId: systemUser.id,
              status: 'ABIERTO',
            },
          })
          casosCreados++
        } else if (casoExistente.status === 'ABIERTO') {
          // Dedup: ya existe un caso ABIERTO para este cliente.
          // No hacemos nada (el unique index ya impide duplicados a
          // nivel DB, pero este check evita log spam).
          continue
        } else {
          // Caso existe pero esta RESUELTO o CERRADO: la condicion
          // persiste (cliente sigue sin verificar). Reabrir.
          // Optimistic lock con updatedAt (commit F-N19).
          const updateResult = await prisma.caso.updateMany({
            where: { id: casoExistente.id, updatedAt: casoExistente.updatedAt },
            data: {
              status: 'ABIERTO',
              cerradoEn: null,
              resueltoEn: null,
              titulo,
              descripcion,
            },
          })
          if (updateResult.count === 0) {
            // Otro admin modificó el caso concurrentemente
            logger.warn({ casoId: casoExistente.id }, '[cron] skip reabrir, caso modificado por otro usuario')
            continue
          }
          // Crear evento de re-apertura
          await prisma.casoEvento.create({
            data: {
              casoId: casoExistente.id,
              userId: systemUser.id,
              accion: 'reabierto',
              valorPre: casoExistente.status,
              valorPost: 'ABIERTO',
              comentario: 'Cron: condicion persiste, re-abierto automaticamente',
            },
          })
          casosReabiertos++
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown'
        logger.error({ err: errMsg, clienteId: cliente.id }, '[cron] error procesando cliente')
        fallos.push(`Cliente ${cliente.nombre}: ${errMsg}`)
      }
    }

    // 5. Auto-cierre de Casos viejos (ABIERTO + createdAt < 30d)
    const fechaAutoCierre = new Date(ahora)
    fechaAutoCierre.setDate(fechaAutoCierre.getDate() - AUTO_CIERRE_DIAS)

    const casosViejos = await prisma.caso.findMany({
      where: {
        status: 'ABIERTO',
        createdAt: { lt: fechaAutoCierre },
      },
      select: {
        id: true,
        titulo: true,
        updatedAt: true,
        alertaTipo: true,
        clienteId: true,
      },
      take: 100, // safety cap
    })

    let casosCerrados = 0
    for (const caso of casosViejos) {
      try {
        const updateResult = await prisma.caso.updateMany({
          where: { id: caso.id, updatedAt: caso.updatedAt, status: 'ABIERTO' },
          data: { status: 'CERRADO', cerradoEn: ahora },
        })
        if (updateResult.count === 0) {
          // Otro proceso modificó este caso (ej. admin lo resolvio
          // mientras el cron corria). Skip.
          continue
        }
        await prisma.casoEvento.create({
          data: {
            casoId: caso.id,
            userId: systemUser.id,
            accion: 'auto_cierre',
            valorPre: 'ABIERTO',
            valorPost: 'CERRADO',
            comentario: `Auto-cerrado por inactividad: ${AUTO_CIERRE_DIAS} días sin accion del admin`,
          },
        })
        casosCerrados++
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown'
        logger.error({ err: errMsg, casoId: caso.id }, '[cron] error auto-cerrando caso')
      }
    }

    const summary = {
      clientesCandidatos: clientesAlerta.length,
      casosCreados,
      casosReabiertos,
      casosAutoCerrados: casosCerrados,
      diasUmbral: dias,
      autoCierreDias: AUTO_CIERRE_DIAS,
      fallos,
    }

    logger.info(summary, '[cron no-verificados] completado')

    return apiSuccess({
      ...summary,
      mensaje:
        `${casosCreados} caso(s) nuevo(s), ${casosReabiertos} reabierto(s), ` +
        `${casosCerrados} auto-cerrado(s) por inactividad`,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: errMsg }, '[cron no-verificados] error general')
    return apiError('Error procesando alertas no verificados')
  }
}
