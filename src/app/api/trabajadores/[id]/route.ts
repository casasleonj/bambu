import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorUpdateSchema, normalizeTrabajador } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = TrabajadorUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const raw = parsed.data
    const data = normalizeTrabajador(raw)
    const trabajador = await prisma.trabajador.update({
      where: { id },
      data: {
        ...data,
        comRepartAgua: data.comRepartAgua ?? 0,
        comRepartHielo: data.comRepartHielo ?? 0,
        comRepartBotellon: data.comRepartBotellon ?? 0,
      },
    })

    logAudit({
      entidad: 'Trabajador',
      registroId: trabajador.id,
      accion: 'UPDATE',
      datos: { nombre: trabajador.nombre, rol: trabajador.rol },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ trabajador })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('PUT trabajador error:', msg)
    return apiError(`Error actualizando trabajador: ${msg}`)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    // FIX F-N18 (hallazgo 31): read+check+update DENTRO de tx.
    //
    // Antes: el read del trabajdor y el count de embarques activos
    // se hacían FUERA de tx. Dos requests casi simultáneos podían:
    //   T0: Admin A lee trabajdor (activo=true), count embarques=0
    //   T0: Admin B crea embarque para ese trabajdor (ABIERTO)
    //   T1: Admin A update trabajdor (activo=false)
    //   Estado final: trabajdor inactivo con embarque abierto
    //
    // Ahora: prisma.$transaction con row lock implícito. Si B hace
    // un INSERT en embarque entre el count y el update, A espera
    // el row lock del trabajdor (re-lee) y ve count>0 → rechaza.
    const result = await prisma.$transaction(async (tx) => {
      const trabajador = await tx.trabajador.findUnique({ where: { id } })
      if (!trabajador) {
        throw new Error('TRABAJADOR_NOT_FOUND')
      }
      if (!trabajador.activo) {
        throw new Error('TRABAJADOR_YA_DESACTIVADO')
      }

      const embarquesActivos = await tx.embarque.count({
        where: { trabajadorId: id, estado: { in: ['ABIERTO', 'EN_RUTA'] } },
      })
      if (embarquesActivos > 0) {
        throw new Error(`EMBARQUES_ACTIVOS:${embarquesActivos}`)
      }

      return tx.trabajador.update({
        where: { id },
        data: { activo: false },
      })
    })

    logAudit({
      entidad: 'Trabajador',
      registroId: result.id,
      accion: 'DELETE',
      datos: { nombre: result.nombre, rol: result.rol },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({})
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRABAJADOR_NOT_FOUND') return apiError('Trabajador no encontrado', 404)
      if (error.message === 'TRABAJADOR_YA_DESACTIVADO') return apiError('El trabajador ya esta desactivado', 409)
      if (error.message.startsWith('EMBARQUES_ACTIVOS:')) {
        const count = error.message.split(':')[1]
        return apiError(
          `No se puede desactivar: tiene ${count} embarque(s) activo(s) (abierto o en ruta). Cierrellos primero.`,
          400
        )
      }
    }
    return apiError('Error eliminando trabajador')
  }
}
