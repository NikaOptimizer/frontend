/** Ribbon icon for the long/short position tools: profit zone over stop zone. */
export function PositionIcon({ long }: { long: boolean }) {
  const top = long ? '#26a69a' : '#ef5350'
  const bottom = long ? '#ef5350' : '#26a69a'
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <rect x="3" y="2" width="12" height="7" rx="1" fill={top} opacity="0.85" />
      <rect x="3" y="9" width="12" height="7" rx="1" fill={bottom} opacity="0.85" />
      <path d="M2 9h14" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
