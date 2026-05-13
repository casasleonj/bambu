'use client'

interface IconProps {
  size?: number
  className?: string
}

export function BolsaHieloIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 3h8l1 17a1 1 0 01-1 1H8a1 1 0 01-1-1L8 3z"
        fill="#ecfeff"
        stroke="#06b6d4"
        strokeWidth="1.5"
      />
      <path
        d="M12 7v10M7 12h10M8.5 8.5l7 7M15.5 8.5l-7 7"
        stroke="#06b6d4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
