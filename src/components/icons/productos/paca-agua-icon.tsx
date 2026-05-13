'use client'

interface IconProps {
  size?: number
  className?: string
}

export function PacaAguaIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2" y="5" width="20" height="15" rx="2"
        fill="#dbeafe"
        stroke="#3b82f6"
        strokeWidth="1.5"
      />
      <rect x="5" y="8" width="4" height="4" rx="0.5" fill="#3b82f6" />
      <rect x="10" y="8" width="4" height="4" rx="0.5" fill="#3b82f6" />
      <rect x="15" y="8" width="4" height="4" rx="0.5" fill="#3b82f6" />
      <rect x="5" y="14" width="4" height="4" rx="0.5" fill="#3b82f6" />
      <rect x="10" y="14" width="4" height="4" rx="0.5" fill="#3b82f6" />
      <rect x="15" y="14" width="4" height="4" rx="0.5" fill="#3b82f6" />
    </svg>
  )
}
