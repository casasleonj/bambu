'use client'

interface IconProps {
  size?: number
  className?: string
}

export function BolsaAguaIcon({ size = 24, className }: IconProps) {
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
        fill="#dbeafe"
        stroke="#3b82f6"
        strokeWidth="1.5"
      />
      <path
        d="M12 7c0 0-3 4-3 6a3 3 0 006 0c0-2-3-6-3-6z"
        fill="#3b82f6"
      />
    </svg>
  )
}
