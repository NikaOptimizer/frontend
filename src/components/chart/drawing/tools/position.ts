import { barIndexAt } from '../core/time-index'
import type { AxisLabel, Bars, PositionData, PositionDrawing, PositionTool, ViewEnv } from '../types'
import { drawHandle, drawLabel, formatNumber, horizontalLine, nearPoint, withAlpha } from './canvas'

export const DEFAULT_ACCOUNT: PositionData['account'] = { size: 1000, lot_size: 1, risk_mode: 'percent', risk: 1 }
export const DEFAULT_POSITION_STYLE: PositionData['style'] = {
  line_color: '#9aa4b2',
  profit_color: '#26a69a',
  stop_color: '#ef5350',
}

/** New positions span this many bars and use this reward multiple of the stop distance. */
const DEFAULT_WIDTH_BARS = 20
const DEFAULT_REWARD_MULTIPLE = 2
/** Default stop distance as a fraction of the pane height at creation. */
const DEFAULT_STOP_FRACTION = 0.06
const FILL_ALPHA = 0.18
const OUTCOME_ALPHA = 0.32

export type PositionStats = {
  riskAmount: number
  quantity: number
  targetPercent: number
  stopPercent: number
  targetTicks: number
  stopTicks: number
  targetAmount: number
  stopAmount: number
  rewardRisk: number
}

export type PositionOutcome =
  | { status: 'pending' }
  | { status: 'open' | 'target' | 'stop'; fillTime: number; exitTime: number; exitPrice: number; pnl: number }

export type PositionGeometry = { x1: number; x2: number; yEntry: number; yTarget: number; yStop: number }

export function isLong(tool: PositionTool) {
  return tool === 'long_position'
}

export function positionStats(data: PositionData, minMove: number): PositionStats {
  const { entry, target_price: target, stop_price: stop, account } = data
  const riskAmount = account.risk_mode === 'percent' ? (account.size * account.risk) / 100 : account.risk
  const targetDistance = Math.abs(target - entry.price)
  const stopDistance = Math.abs(entry.price - stop)
  const quantity = stopDistance > 0 ? riskAmount / (stopDistance * account.lot_size) : 0
  const base = Math.abs(entry.price)
  return {
    riskAmount,
    quantity,
    targetPercent: base > 0 ? (targetDistance / base) * 100 : Number.NaN,
    stopPercent: base > 0 ? (stopDistance / base) * 100 : Number.NaN,
    targetTicks: Math.round(targetDistance / minMove),
    stopTicks: Math.round(stopDistance / minMove),
    targetAmount: quantity * account.lot_size * targetDistance,
    stopAmount: quantity * account.lot_size * stopDistance,
    rewardRisk: stopDistance > 0 ? targetDistance / stopDistance : 0,
  }
}

/**
 * Replays loaded bars inside the position's time range. The entry fills on the
 * first bar whose range touches the entry price; exits are checked from the
 * following bar. When one bar touches both levels the stop is assumed first
 * (conservative, since intra-bar order is unknown). This is a visual estimate,
 * not a Fisher backtest.
 */
export function positionOutcome(tool: PositionTool, data: PositionData, bars: Bars, stats: PositionStats): PositionOutcome {
  const { times, highs, lows, closes } = bars
  const { entry, end_time: endTime, target_price: target, stop_price: stop, account } = data
  const long = isLong(tool)
  const direction = long ? 1 : -1
  const pnlAt = (price: number) => (price - entry.price) * direction * stats.quantity * account.lot_size

  let index = Math.max(0, barIndexAt(bars, entry.time))
  let fill = -1
  for (; index < times.length && times[index] < endTime; index += 1) {
    if (lows[index] <= entry.price && entry.price <= highs[index]) {
      fill = index
      break
    }
  }
  if (fill < 0) return { status: 'pending' }

  let last = fill
  for (let bar = fill + 1; bar < times.length && times[bar] < endTime; bar += 1) {
    const hitStop = long ? lows[bar] <= stop : highs[bar] >= stop
    const hitTarget = long ? highs[bar] >= target : lows[bar] <= target
    if (hitStop || hitTarget) {
      const exitPrice = hitStop ? stop : target
      return { status: hitStop ? 'stop' : 'target', fillTime: times[fill], exitTime: times[bar], exitPrice, pnl: pnlAt(exitPrice) }
    }
    last = bar
  }
  return { status: 'open', fillTime: times[fill], exitTime: times[last], exitPrice: closes[last], pnl: pnlAt(closes[last]) }
}

export function createPosition(
  tool: PositionTool,
  x: number,
  y: number,
  env: ViewEnv,
  account: PositionData['account'],
  style: PositionData['style'],
): PositionData | null {
  const logical = env.xToLogical(x)
  const price = env.yToPrice(y)
  const offsetPrice = env.yToPrice(y + env.paneHeight * DEFAULT_STOP_FRACTION)
  if (logical === null || price === null || offsetPrice === null) return null

  const entry = env.roundPrice(price)
  const distance = Math.max(env.minMove, env.roundPrice(Math.abs(offsetPrice - price)))
  const direction = isLong(tool) ? 1 : -1
  return {
    entry: { time: env.logicalToTime(logical), price: entry },
    end_time: env.logicalToTime(logical + DEFAULT_WIDTH_BARS),
    target_price: env.roundPrice(entry + direction * distance * DEFAULT_REWARD_MULTIPLE),
    stop_price: env.roundPrice(entry - direction * distance),
    account: { ...account },
    style: { ...style },
  }
}

export function positionGeometry(drawing: PositionDrawing, env: ViewEnv): PositionGeometry | null {
  const { data } = drawing
  const x1 = env.timeToX(data.entry.time)
  const x2 = env.timeToX(data.end_time)
  const yEntry = env.priceToY(data.entry.price)
  const yTarget = env.priceToY(data.target_price)
  const yStop = env.priceToY(data.stop_price)
  if (x1 === null || x2 === null || yEntry === null || yTarget === null || yStop === null) return null
  return { x1, x2, yEntry, yTarget, yStop }
}

export function drawPosition(
  ctx: CanvasRenderingContext2D,
  drawing: PositionDrawing,
  geometry: PositionGeometry,
  env: ViewEnv,
  stats: PositionStats,
  outcome: PositionOutcome,
  selected: boolean,
) {
  const { x1, x2, yEntry, yTarget, yStop } = geometry
  if (x2 < 0 || x1 > env.paneWidth) return
  const { data } = drawing
  const { style } = data
  const width = Math.max(1, x2 - x1)

  ctx.fillStyle = withAlpha(style.profit_color, FILL_ALPHA)
  ctx.fillRect(x1, Math.min(yEntry, yTarget), width, Math.abs(yTarget - yEntry))
  ctx.fillStyle = withAlpha(style.stop_color, FILL_ALPHA)
  ctx.fillRect(x1, Math.min(yEntry, yStop), width, Math.abs(yStop - yEntry))

  if (outcome.status !== 'pending') {
    const fillX = env.timeToX(outcome.fillTime)
    const exitX = env.timeToX(outcome.exitTime)
    const exitY = env.priceToY(outcome.exitPrice)
    if (fillX !== null && exitX !== null && exitY !== null) {
      const color = outcome.pnl >= 0 ? style.profit_color : style.stop_color
      ctx.fillStyle = withAlpha(color, OUTCOME_ALPHA)
      ctx.fillRect(fillX, Math.min(yEntry, exitY), Math.max(1, exitX - fillX), Math.abs(exitY - yEntry))
      ctx.save()
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = style.line_color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(fillX, yEntry)
      ctx.lineTo(exitX, exitY)
      ctx.stroke()
      ctx.restore()
    }
  }

  ctx.lineWidth = 1
  ctx.strokeStyle = style.line_color
  horizontalLine(ctx, x1, x2, yEntry)

  if (width >= 40) {
    const long = isLong(drawing.tool)
    const cx = x1 + width / 2
    const price = env.formatPrice
    drawLabel(
      ctx,
      [`Target: ${price(data.target_price)} (${formatNumber(stats.targetPercent, 3)}%) ${stats.targetTicks}, Amount: ${formatNumber(stats.targetAmount)}`],
      cx,
      yTarget,
      long ? 'above' : 'below',
      style.profit_color,
    )
    drawLabel(
      ctx,
      [`Stop: ${price(data.stop_price)} (${formatNumber(stats.stopPercent, 3)}%) ${stats.stopTicks}, Amount: ${formatNumber(stats.stopAmount)}`],
      cx,
      yStop,
      long ? 'below' : 'above',
      style.stop_color,
    )
    const quantity = `Qty: ${formatNumber(stats.quantity, 3)}`
    const headline = outcome.status === 'pending'
      ? `Not filled, ${quantity}`
      : `${outcome.status === 'open' ? 'Open' : 'Closed'} P&L: ${formatNumber(outcome.pnl)}, ${quantity}`
    const background = outcome.status === 'pending'
      ? style.line_color
      : outcome.pnl >= 0 ? style.profit_color : style.stop_color
    drawLabel(ctx, [headline, `Risk/Reward Ratio: ${formatNumber(stats.rewardRisk)}`], cx, yEntry, 'center', background)
  }

  if (selected) {
    drawHandle(ctx, x1, yTarget, style.profit_color)
    drawHandle(ctx, x1, yEntry, style.line_color)
    drawHandle(ctx, x1, yStop, style.stop_color)
    drawHandle(ctx, x2, yEntry, style.line_color)
  }
}

export function hitPosition(geometry: PositionGeometry, x: number, y: number, selected: boolean) {
  const { x1, x2, yEntry, yTarget, yStop } = geometry
  if (selected) {
    if (nearPoint(x, y, x1, yTarget)) return { part: 'target', cursor: 'ns-resize' }
    if (nearPoint(x, y, x1, yStop)) return { part: 'stop', cursor: 'ns-resize' }
    if (nearPoint(x, y, x1, yEntry)) return { part: 'entry', cursor: 'move' }
    if (nearPoint(x, y, x2, yEntry)) return { part: 'end', cursor: 'ew-resize' }
  }
  const top = Math.min(yTarget, yStop)
  const bottom = Math.max(yTarget, yStop)
  if (x >= Math.min(x1, x2) - 2 && x <= Math.max(x1, x2) + 2 && y >= top - 2 && y <= bottom + 2) {
    return { part: 'body', cursor: selected ? 'move' : 'pointer' }
  }
  return null
}

export type DragPoint = { logical: number; price: number }

/** Pure drag update from the drag-start snapshot, so pointer moves never accumulate rounding drift. */
export function dragPosition(
  tool: PositionTool,
  original: PositionData,
  part: string,
  from: DragPoint,
  to: DragPoint,
  env: ViewEnv,
): PositionData {
  const step = env.minMove
  const direction = isLong(tool) ? 1 : -1
  const entryLogical = Math.round(env.timeToLogical(original.entry.time) ?? 0)
  const endLogical = Math.round(env.timeToLogical(original.end_time) ?? 0)
  const pointerPrice = env.roundPrice(to.price)
  const pointerLogical = Math.round(to.logical)

  switch (part) {
    case 'body': {
      const bars = Math.round(to.logical - from.logical)
      const delta = env.roundPrice(to.price - from.price)
      return {
        ...original,
        entry: {
          time: bars === 0 ? original.entry.time : env.logicalToTime(entryLogical + bars),
          price: env.roundPrice(original.entry.price + delta),
        },
        end_time: bars === 0 ? original.end_time : env.logicalToTime(endLogical + bars),
        target_price: env.roundPrice(original.target_price + delta),
        stop_price: env.roundPrice(original.stop_price + delta),
      }
    }
    case 'entry': {
      const low = Math.min(original.target_price, original.stop_price) + step
      const high = Math.max(original.target_price, original.stop_price) - step
      return {
        ...original,
        entry: {
          time: env.logicalToTime(Math.min(pointerLogical, endLogical - 1)),
          price: env.roundPrice(Math.min(high, Math.max(low, pointerPrice))),
        },
      }
    }
    case 'target': {
      const limit = original.entry.price + direction * step
      return { ...original, target_price: direction > 0 ? Math.max(pointerPrice, limit) : Math.min(pointerPrice, limit) }
    }
    case 'stop': {
      const limit = original.entry.price - direction * step
      return { ...original, stop_price: direction > 0 ? Math.min(pointerPrice, limit) : Math.max(pointerPrice, limit) }
    }
    case 'end':
      return { ...original, end_time: env.logicalToTime(Math.max(pointerLogical, entryLogical + 1)) }
    default:
      return original
  }
}

export function positionAxisLabels(drawing: PositionDrawing, env: ViewEnv): AxisLabel[] {
  const { data } = drawing
  return [
    { price: data.target_price, text: env.formatPrice(data.target_price), color: data.style.profit_color },
    { price: data.entry.price, text: env.formatPrice(data.entry.price), color: data.style.line_color },
    { price: data.stop_price, text: env.formatPrice(data.stop_price), color: data.style.stop_color },
  ]
}

/** Returns an error message when the values cannot form a valid position. */
export function validatePosition(tool: PositionTool, data: PositionData): string | null {
  const { entry, target_price: target, stop_price: stop, account } = data
  const numbers = [entry.price, target, stop, account.size, account.lot_size, account.risk]
  if (numbers.some((value) => !Number.isFinite(value))) return 'All values must be numbers.'
  if (isLong(tool) && !(stop < entry.price && entry.price < target)) return 'A long position needs stop < entry < target.'
  if (!isLong(tool) && !(target < entry.price && entry.price < stop)) return 'A short position needs target < entry < stop.'
  if (account.size <= 0 || account.lot_size <= 0 || account.risk <= 0) return 'Account size, lot size and risk must be positive.'
  if (account.risk_mode === 'percent' && account.risk > 100) return 'Risk cannot exceed 100%.'
  return null
}
