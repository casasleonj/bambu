import type { ComponentType, SVGProps } from 'react'
import { BolsaAguaIcon } from '@/components/icons/productos/bolsa-agua-icon'
import { BolsaHieloIcon } from '@/components/icons/productos/bolsa-hielo-icon'
import { PacaAguaIcon } from '@/components/icons/productos/paca-agua-icon'
import { PacaHieloIcon } from '@/components/icons/productos/paca-hielo-icon'
import { BotellonIcon } from '@/components/icons/productos/botellon-icon'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

interface ProductoIconConfig {
  label: string
  Icon: IconComponent
}

export const PRODUCTO_ICONOS: Record<string, ProductoIconConfig> = {
  BOLSA_AGUA: { label: 'Bolsa Agua', Icon: BolsaAguaIcon },
  BOLSA_HIELO: { label: 'Bolsa Hielo', Icon: BolsaHieloIcon },
  PACA_AGUA: { label: 'Paca Agua', Icon: PacaAguaIcon },
  PACA_HIELO: { label: 'Paca Hielo', Icon: PacaHieloIcon },
  BOTELLON: { label: 'Botellón', Icon: BotellonIcon },
  BOTELLON_FAB: { label: 'Botellón Fábrica', Icon: BotellonIcon },
  BOTELLON_DOM: { label: 'Botellón Domicilio', Icon: BotellonIcon },
}

function FallbackIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  )
}

export function getProductoIconConfig(codigo: string): ProductoIconConfig {
  return PRODUCTO_ICONOS[codigo] || { label: codigo, Icon: FallbackIcon }
}
