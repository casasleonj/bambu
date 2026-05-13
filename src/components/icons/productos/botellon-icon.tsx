'use client'

interface IconProps {
  size?: number
  className?: string
}

export function BotellonIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 2h4v4l3 2v12a2 2 0 01-2 2H9a2 2 0 01-2-2V8l3-2V2z"
        fill="#dbeafe"
        stroke="#3b82f6"
        strokeWidth="1.5"
      />
      <line x1="7" y1="12" x2="17" y2="12" stroke="#93c5fd" strokeWidth="1.5" />
      <line x1="7" y1="16" x2="17" y2="16" stroke="#93c5fd" strokeWidth="1.5" />
    </svg>
  )
}
