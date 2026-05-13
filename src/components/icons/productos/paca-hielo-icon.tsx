'use client'

interface IconProps {
  size?: number
  className?: string
}

export function PacaHieloIcon({ size = 24, className }: IconProps) {
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
        fill="#ecfeff"
        stroke="#06b6d4"
        strokeWidth="1.5"
      />
      <rect x="5" y="8" width="4" height="4" rx="1" fill="#06b6d4" transform="rotate(10 7 10)" />
      <rect x="10" y="8" width="4" height="4" rx="1" fill="#06b6d4" transform="rotate(-8 12 10)" />
      <rect x="15" y="8" width="4" height="4" rx="1" fill="#06b6d4" transform="rotate(15 17 10)" />
      <rect x="5" y="14" width="4" height="4" rx="1" fill="#06b6d4" transform="rotate(-12 7 16)" />
      <rect x="10" y="14" width="4" height="4" rx="1" fill="#06b6d4" transform="rotate(8 12 16)" />
      <rect x="15" y="14" width="4" height="4" rx="1" fill="#06b6d4" transform="rotate(-5 17 16)" />
    </svg>
  )
}
