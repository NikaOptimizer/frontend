import { barIndexAt } from '../core/time-index'
import type { MarkerData, MarkerDrawing, ViewEnv } from '../types'
import { drawLabel, nearPoint } from './canvas'

export const DEFAULT_MARKER: Omit<MarkerData, 'time'> = { label: 'Rule marker', color: '#f6b73c' }

const MARKER_RADIUS = 5
const MARKER_GAP = 12

export type MarkerGeometry = { x: number; y: number }

/** Markers sit above the high of the bar containing their time. */
export function markerGeometry(drawing: MarkerDrawing, env: ViewEnv): MarkerGeometry | null {
  const index = barIndexAt(env.bars, drawing.data.time)
  if (index < 0) return null
  const x = env.timeToX(env.bars.times[index])
  const y = env.priceToY(env.bars.highs[index])
  return x === null || y === null ? null : { x, y: y - MARKER_GAP }
}

export function createMarker(x: number, env: ViewEnv): MarkerData | null {
  const logical = env.xToLogical(x)
  if (logical === null) return null
  const index = Math.min(Math.max(Math.round(logical), 0), env.bars.times.length - 1)
  return index < 0 ? null : { time: env.bars.times[index], ...DEFAULT_MARKER }
}

export function drawMarker(ctx: CanvasRenderingContext2D, drawing: MarkerDrawing, geometry: MarkerGeometry, selected: boolean) {
  const { x, y } = geometry
  ctx.beginPath()
  ctx.arc(x, y, MARKER_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = drawing.data.color
  ctx.fill()
  if (selected) {
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }
  drawLabel(ctx, [drawing.data.label], x, y - MARKER_RADIUS, 'above', drawing.data.color)
}

export function hitMarker(geometry: MarkerGeometry, x: number, y: number, selected: boolean) {
  return nearPoint(x, y, geometry.x, geometry.y, 9) ? { part: 'body', cursor: selected ? 'ew-resize' : 'pointer' } : null
}

/** Markers move along bars only; their vertical position follows the bar high. */
export function dragMarker(original: MarkerData, fromLogical: number, toLogical: number, env: ViewEnv): MarkerData {
  const bars = Math.round(toLogical - fromLogical)
  if (bars === 0) return original
  const start = Math.round(env.timeToLogical(original.time) ?? 0)
  const last = env.bars.times.length - 1
  return { ...original, time: env.logicalToTime(Math.min(Math.max(start + bars, 0), last)) }
}
