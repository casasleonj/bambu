'use client'

function BaseBill({
  id, from, to, label, alt, children,
}: {
  id: string
  from: string
  to: string
  label: string
  alt: string
  children: React.ReactNode
}) {
  const gId = (s: string) => `${s}-${id}`
  return (
    <svg viewBox="0 0 140 66" className="w-full h-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={alt}>
      <defs>
        <linearGradient id={gId('bg')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <linearGradient id={gId('thread')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.7)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.7)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
        </linearGradient>
        <filter id={gId('shadow')}>
          <feDropShadow dx="1" dy="1" stdDeviation="1" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter={`url(#${gId('shadow')})`}>
        <rect x="0" y="0" width="140" height="66" rx="4" fill={`url(#${gId('bg')})`} />
        <rect x="2.5" y="2.5" width="135" height="61" rx="3" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <rect x="4" y="4" width="132" height="58" rx="2" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      </g>
      <rect x="68" y="3" width="4" height="60" fill={`url(#${gId('thread')})`} rx="1" />
      <text x="70" y="15" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="5" fontWeight="bold" fontFamily="sans-serif" letterSpacing="1">BANCO DE LA REPÚBLICA</text>
      <text x="70" y="36" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold" fontFamily="sans-serif">{label}</text>
      <text x="70" y="59" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="4" fontFamily="monospace" letterSpacing="1.5">{id.toUpperCase()} 12345678</text>
      {children}
    </svg>
  )
}

export function Billete100k({ width }: { width?: number }) {
  return (
    <div style={{ width: width ?? 100, aspectRatio: '140/66' }}>
      <BaseBill id="100k" from="#B71C1C" to="#E53935" label="$100.000" alt="Billete de 100 mil pesos">
        <g transform="translate(8,8)">
          <ellipse cx="17" cy="25" rx="14" ry="20" fill="rgba(255,255,255,0.12)" />
          <ellipse cx="17" cy="25" rx="12" ry="18" fill="rgba(255,255,255,0.06)" />
          <ellipse cx="17" cy="19" rx="6" ry="7" fill="rgba(255,255,255,0.5)" />
          <rect x="11" y="24" width="12" height="10" rx="3" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="15" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="4" fontWeight="bold">CLR</text>
        </g>
        <g transform="translate(98,8)">
          <rect x="0" y="0" width="34" height="50" rx="3" fill="rgba(255,255,255,0.08)" />
          <text x="17" y="8" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="3.5">COCORA</text>
          <line x1="17" y1="42" x2="17" y2="14" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 18 Q12 10 17 14 Q22 10 26 18" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <path d="M10 14 Q14 7 17 11 Q20 7 24 14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <circle cx="17" cy="11" r="1.5" fill="rgba(255,255,255,0.4)" />
          <text x="17" y="46" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="5" fontWeight="bold">100</text>
        </g>
      </BaseBill>
    </div>
  )
}

export function Billete50k({ width }: { width?: number }) {
  return (
    <div style={{ width: width ?? 100, aspectRatio: '140/66' }}>
      <BaseBill id="50k" from="#4A0072" to="#7B1FA2" label="$50.000" alt="Billete de 50 mil pesos">
        <g transform="translate(8,8)">
          <ellipse cx="17" cy="25" rx="14" ry="20" fill="rgba(255,255,255,0.12)" />
          <ellipse cx="17" cy="25" rx="12" ry="18" fill="rgba(255,255,255,0.06)" />
          <circle cx="17" cy="19" r="6" fill="rgba(255,255,255,0.5)" />
          <rect x="11" y="24" width="12" height="10" rx="3" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="14" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="3.5">GGM</text>
          <text x="17" y="18" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="3">★</text>
        </g>
        <g transform="translate(98,8)">
          <rect x="0" y="0" width="34" height="50" rx="3" fill="rgba(255,255,255,0.08)" />
          <text x="17" y="8" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="3">SIERRA</text>
          <path d="M5 42 L17 14 L29 42" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9 42 L17 22 L25 42" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinejoin="round" />
          <circle cx="17" cy="14" r="1.5" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="46" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="5" fontWeight="bold">50</text>
        </g>
      </BaseBill>
    </div>
  )
}

export function Billete20k({ width }: { width?: number }) {
  return (
    <div style={{ width: width ?? 100, aspectRatio: '140/66' }}>
      <BaseBill id="20k" from="#BF360C" to="#F57C00" label="$20.000" alt="Billete de 20 mil pesos">
        <g transform="translate(8,8)">
          <ellipse cx="17" cy="25" rx="14" ry="20" fill="rgba(255,255,255,0.12)" />
          <ellipse cx="17" cy="25" rx="12" ry="18" fill="rgba(255,255,255,0.06)" />
          <ellipse cx="17" cy="19" rx="6" ry="7" fill="rgba(255,255,255,0.5)" />
          <rect x="11" y="24" width="12" height="10" rx="3" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="15" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="4" fontWeight="bold">ALM</text>
        </g>
        <g transform="translate(98,8)">
          <rect x="0" y="0" width="34" height="50" rx="3" fill="rgba(255,255,255,0.08)" />
          <text x="17" y="8" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="3">ZENÚ</text>
          <ellipse cx="17" cy="25" rx="10" ry="4" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <path d="M7 27 Q12 33 17 28 Q22 33 27 27" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <line x1="17" y1="21" x2="17" y2="29" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <text x="17" y="46" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="5" fontWeight="bold">20</text>
        </g>
      </BaseBill>
    </div>
  )
}

export function Billete10k({ width }: { width?: number }) {
  return (
    <div style={{ width: width ?? 100, aspectRatio: '140/66' }}>
      <BaseBill id="10k" from="#7F0000" to="#D32F2F" label="$10.000" alt="Billete de 10 mil pesos">
        <g transform="translate(8,8)">
          <ellipse cx="17" cy="25" rx="14" ry="20" fill="rgba(255,255,255,0.12)" />
          <ellipse cx="17" cy="25" rx="12" ry="18" fill="rgba(255,255,255,0.06)" />
          <ellipse cx="17" cy="19" rx="6" ry="7" fill="rgba(255,255,255,0.5)" />
          <rect x="11" y="24" width="12" height="10" rx="3" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="15" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="4" fontWeight="bold">VG</text>
        </g>
        <g transform="translate(98,8)">
          <rect x="0" y="0" width="34" height="50" rx="3" fill="rgba(255,255,255,0.08)" />
          <text x="17" y="8" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="3">AMAZ</text>
          <ellipse cx="17" cy="24" rx="8" ry="6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <path d="M9 26 Q13 18 17 22 Q21 18 25 26" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <circle cx="14" cy="26" r="1.5" fill="rgba(255,255,255,0.3)" />
          <circle cx="20" cy="26" r="1.5" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="46" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="5" fontWeight="bold">10</text>
        </g>
      </BaseBill>
    </div>
  )
}

export function Billete5k({ width }: { width?: number }) {
  return (
    <div style={{ width: width ?? 100, aspectRatio: '140/66' }}>
      <BaseBill id="5k" from="#0D47A1" to="#1E88E5" label="$5.000" alt="Billete de 5 mil pesos">
        <g transform="translate(8,8)">
          <ellipse cx="17" cy="25" rx="14" ry="20" fill="rgba(255,255,255,0.12)" />
          <ellipse cx="17" cy="25" rx="12" ry="18" fill="rgba(255,255,255,0.06)" />
          <ellipse cx="17" cy="19" rx="6" ry="7" fill="rgba(255,255,255,0.5)" />
          <rect x="11" y="24" width="12" height="10" rx="3" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="15" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="4" fontWeight="bold">JAS</text>
        </g>
        <g transform="translate(98,8)">
          <rect x="0" y="0" width="34" height="50" rx="3" fill="rgba(255,255,255,0.08)" />
          <text x="17" y="8" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="3">PÁRAMO</text>
          <path d="M12 42 L17 15 L22 42" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M7 42 L12 28 L17 42" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M17 42 L22 28 L27 42" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeLinejoin="round" />
          <circle cx="17" cy="15" r="1.5" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="46" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="5" fontWeight="bold">5</text>
        </g>
      </BaseBill>
    </div>
  )
}

export function Billete2k({ width }: { width?: number }) {
  return (
    <div style={{ width: width ?? 100, aspectRatio: '140/66' }}>
      <BaseBill id="2k" from="#311B92" to="#5E35B1" label="$2.000" alt="Billete de 2 mil pesos">
        <g transform="translate(8,8)">
          <ellipse cx="17" cy="25" rx="14" ry="20" fill="rgba(255,255,255,0.12)" />
          <ellipse cx="17" cy="25" rx="12" ry="18" fill="rgba(255,255,255,0.06)" />
          <circle cx="17" cy="19" r="6" fill="rgba(255,255,255,0.5)" />
          <rect x="11" y="24" width="12" height="10" rx="3" fill="rgba(255,255,255,0.3)" />
          <text x="17" y="15" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="4" fontWeight="bold">DA</text>
        </g>
        <g transform="translate(98,8)">
          <rect x="0" y="0" width="34" height="50" rx="3" fill="rgba(255,255,255,0.08)" />
          <text x="17" y="8" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="3">CAÑO</text>
          <path d="M6 18 Q12 14 17 20 Q22 26 28 22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 24 Q12 20 17 26 Q22 32 28 28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M6 30 Q12 26 17 32 Q22 38 28 34" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeLinecap="round" />
          <text x="17" y="46" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="5" fontWeight="bold">2</text>
        </g>
      </BaseBill>
    </div>
  )
}
