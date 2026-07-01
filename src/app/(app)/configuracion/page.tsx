import { prisma } from '@/lib/prisma'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
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
  }

  return <ConfiguracionClient initialData={initialData} />
}
