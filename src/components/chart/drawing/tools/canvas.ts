/** Small canvas helpers shared by the drawing tools (media coordinate space). */

export const HANDLE_RADIUS = 5
export const HANDLE_HIT_RADIUS = 8
const LABEL_FONT = '11px "Geist Variable", system-ui, sans-serif'
const LABEL_LINE_HEIGHT = 14
const LABEL_PADDING_X = 6
const LABEL_PADDING_Y = 3

const rgbaCache = new Map<string, string>()

/** `#rrggbb` (or `#rrggbbaa`) to `rgba()` with the given alpha; cached per color/alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const key = `${hex}:${alpha}`
  let value = rgbaCache.get(key)
  if (!value) {
    const red = parseInt(hex.slice(1, 3), 16)
    const green = parseInt(hex.slice(3, 5), 16)
    const blue = parseInt(hex.slice(5, 7), 16)
    value = `rgba(${red}, ${green}, ${blue}, ${alpha})`
    rgbaCache.set(key, value)
  }
  return value
}

export function horizontalLine(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number) {
  const crispY = Math.round(y) + 0.5
  ctx.beginPath()
  ctx.moveTo(x1, crispY)
  ctx.lineTo(x2, crispY)
  ctx.stroke()
}

export function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.beginPath()
  ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.stroke()
}

export function nearPoint(x: number, y: number, px: number, py: number, radius = HANDLE_HIT_RADIUS) {
  const dx = x - px
  const dy = y - py
  return dx * dx + dy * dy <= radius * radius
}

/**
 * Draws a rounded label box centred on `cx`. `placement` puts the box above or
 * below `y` (with a small gap) or centres it on `y`.
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  cx: number,
  y: number,
  placement: 'above' | 'below' | 'center',
  background: string,
) {
  ctx.font = LABEL_FONT
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + LABEL_PADDING_X * 2
  const height = lines.length * LABEL_LINE_HEIGHT + LABEL_PADDING_Y * 2
  const top = placement === 'above' ? y - height - 4 : placement === 'below' ? y + 4 : y - height / 2
  const left = cx - width / 2

  ctx.fillStyle = background
  ctx.beginPath()
  ctx.roundRect(left, top, width, height, 3)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, index) => {
    ctx.fillText(line, cx, top + LABEL_PADDING_Y + LABEL_LINE_HEIGHT * (index + 0.5))
  })
}

export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: maxDecimals, minimumFractionDigits: 0 })
}
