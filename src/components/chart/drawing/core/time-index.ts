import type { Bars, UnixTime } from '../types'

const EMPTY = new Float64Array(0)

export function emptyBars(intervalSeconds = 60): Bars {
  return { times: EMPTY, highs: EMPTY, lows: EMPTY, closes: EMPTY, intervalSeconds }
}

export function toBars(
  candles: readonly { time: unknown; high: number; low: number; close: number }[],
  intervalSeconds: number,
): Bars {
  const bars = {
    times: new Float64Array(candles.length),
    highs: new Float64Array(candles.length),
    lows: new Float64Array(candles.length),
    closes: new Float64Array(candles.length),
    intervalSeconds,
  }
  candles.forEach((candle, index) => {
    bars.times[index] = Number(candle.time)
    bars.highs[index] = candle.high
    bars.lows[index] = candle.low
    bars.closes[index] = candle.close
  })
  return bars
}

/** Index of the last bar opening at or before `time`, or -1. */
export function barIndexAt(bars: Bars, time: UnixTime): number {
  let low = 0
  let high = bars.times.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (bars.times[mid] <= time) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

/**
 * Fractional logical index for any timestamp. Times between bars interpolate;
 * times before the first or after the last bar extrapolate by the timeframe,
 * so drawings drawn on another timeframe or into the future stay positioned.
 */
export function timeToLogical(bars: Bars, time: UnixTime): number | null {
  const count = bars.times.length
  if (count === 0) return null
  const first = bars.times[0]
  const last = bars.times[count - 1]
  if (time <= first) return (time - first) / bars.intervalSeconds
  if (time >= last) return count - 1 + (time - last) / bars.intervalSeconds
  const index = barIndexAt(bars, time)
  const span = bars.times[index + 1] - bars.times[index]
  return index + (time - bars.times[index]) / span
}

/** Bar-snapped timestamp for a logical index, extrapolating outside the data. */
export function logicalToTime(bars: Bars, logical: number): UnixTime {
  const count = bars.times.length
  const index = Math.round(logical)
  if (count === 0) return 0
  if (index < 0) return bars.times[0] + index * bars.intervalSeconds
  if (index >= count) return bars.times[count - 1] + (index - count + 1) * bars.intervalSeconds
  return bars.times[index]
}
