import { prisma } from '@/lib/prisma'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/config-claves-restringidas'
import ConfiguracionClient from './configuracion-client'

export default async function ConfiguracionPage() {
  const configs = await prisma.config.findMany()
  const configMap: Record<string, string> = {}
  configs.forEach(c => { configMap[c.clave] = c.valor })

  const initialData = {
    empresa_nombre: configMap.empresa_nombre || '',
    empresa_nit: configMap.empresa_nit || '',
    empresa_direccion: configMap.empresa_direccion || '',
    empresa_telefono: configMap.empresa_telefono || '',
    empresa_email: configMap.empresa_email || '',
    BASE_DIA: configMap.BASE_DIA || '100000',
    DIAS_ALERTA_NO_VERIFICADO: configMap.DIAS_ALERTA_NO_VERIFICADO || '30',
    DIAS_VENCIMIENTO_PROMESA: configMap.DIAS_VENCIMIENTO_PROMESA || '2',
    MAX_PEDIDOS_DIA_ALERTA: configMap.MAX_PEDIDOS_DIA_ALERTA || '2',
    LIMITE_PEDIDOS_FIADOS_DEFAULT: configMap.LIMITE_PEDIDOS_FIADOS_DEFAULT || String(LIMITE_FIADOS_DEFAULT),
    MAX_UNIDADES_EMBARQUE: configMap.MAX_UNIDADES_EMBARQUE || '70',
    HORARIO_MANANA_INICIO: configMap.HORARIO_MANANA_INICIO || '06:00',
    HORARIO_MANANA_FIN: configMap.HORARIO_MANANA_FIN || '12:00',
    HORARIO_TARDE_INICIO: configMap.HORARIO_TARDE_INICIO || '14:00',
    HORARIO_TARDE_FIN: configMap.HORARIO_TARDE_FIN || '17:00',
    UMBRAL_HORAS_HABILES_RIESGO: configMap.UMBRAL_HORAS_HABILES_RIESGO || '2',
  }

  // TEMPORAL-SIN-EMBARQUE(#472): estado del interruptor y «último cambio» (quién y cuándo).
  const filaGestion = configs.find((c) => c.clave === CLAVE_GESTION_ADMIN_SIN_EMBARQUE)
  const ultimo = filaGestion
    ? await prisma.historial.findFirst({
        where: { entidad: 'Config', datos: { contains: `"${CLAVE_GESTION_ADMIN_SIN_EMBARQUE}"` } },
        orderBy: { fecha: 'desc' },
        select: { fecha: true, usuarioId: true },
      })
    : null
  const autor = ultimo?.usuarioId
    ? await prisma.user.findUnique({ where: { id: ultimo.usuarioId }, select: { username: true } })
    : null
  const gestionSinEmbarques = {
    activa: filaGestion?.valor === 'true',
    cambio: filaGestion
      ? { fecha: (ultimo?.fecha ?? filaGestion.updatedAt).toISOString(), por: autor?.username ?? null }
      : null,
  }

  return <ConfiguracionClient initialData={initialData} gestionSinEmbarques={gestionSinEmbarques} />
}
