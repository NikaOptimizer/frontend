/** UTC Unix seconds, matching the candle API. */
export type UnixTime = number

export type PositionTool = 'long_position' | 'short_position'
export type DrawingTool = PositionTool | 'marker'
export type ToolMode = 'cursor' | DrawingTool

export type PositionData = {
  entry: { time: UnixTime; price: number }
  end_time: UnixTime
  target_price: number
  stop_price: number
  account: { size: number; lot_size: number; risk_mode: 'percent' | 'amount'; risk: number }
  style: { line_color: string; profit_color: string; stop_color: string }
}

export type MarkerData = { time: UnixTime; label: string; color: string }

type DrawingBase = { id: string; revision: number }
export type PositionDrawing = DrawingBase & { tool: PositionTool; data: PositionData }
export type MarkerDrawing = DrawingBase & { tool: 'marker'; data: MarkerData }
export type Drawing = PositionDrawing | MarkerDrawing

/** Drawings belong to one strategy view of one instrument stream. */
export type DrawingScope = { strategy: string; provider: string; instrument: string }

export const SCHEMA_VERSION = 1

export function isPosition(drawing: Drawing): drawing is PositionDrawing {
  return drawing.tool === 'long_position' || drawing.tool === 'short_position'
}

/** Candle columns kept as typed arrays for binary search and outcome scans. */
export type Bars = {
  times: Float64Array
  highs: Float64Array
  lows: Float64Array
  closes: Float64Array
  intervalSeconds: number
}

/** Pixel/value conversions for the current frame, owned by the controller. */
export type ViewEnv = {
  bars: Bars
  minMove: number
  paneWidth: number
  paneHeight: number
  timeToX(time: UnixTime): number | null
  xToLogical(x: number): number | null
  timeToLogical(time: UnixTime): number | null
  logicalToTime(logical: number): UnixTime
  priceToY(price: number): number | null
  yToPrice(y: number): number | null
  roundPrice(price: number): number
  formatPrice(price: number): string
}

export type HitResult = { id: string; part: string; cursor: string }

export type AxisLabel = { price: number; text: string; color: string }
