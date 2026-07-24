import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import { Code2, Eraser, MousePointer2, Plus, SkipBack, SkipForward } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Candle = {
  time: Time
  open: number
  high: number
  low: number
  close: number
}

type Indicator = {
  id: string
  name: string
  color: string
}

type ChartShape = {
  id: string
  time: Time
  label: string
  color: string
}

type CandlestickWorkbenchProps = {
  strategyId: string
  symbol: string
}

const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
const indicatorColors = ['#f6b73c', '#7dd3fc', '#a78bfa', '#34d399', '#fb7185']

export function CandlestickWorkbench({ strategyId, symbol }: CandlestickWorkbenchProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markerApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const isDrawingRef = useRef(false)

  const [timeframe, setTimeframe] = useState(timeframes[2])
  const [candles, setCandles] = useState<Candle[]>([])
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'fallback'>('idle')
  const [indicators, setIndicators] = useState<Indicator[]>([
    { id: 'sma-20', name: 'SMA 20', color: indicatorColors[0] },
  ])
  const [indicatorName, setIndicatorName] = useState('EMA 50')
  const [isDrawing, setIsDrawing] = useState(false)
  const [shapes, setShapes] = useState<ChartShape[]>(() => readPersistedShapes(strategyId, symbol))
  const [isCustomEditorOpen, setIsCustomEditorOpen] = useState(false)
  const [customIndicatorCode, setCustomIndicatorCode] = useState(
    "def custom_indicator(candles):\n    '''Return a list of values aligned with candles.'''\n    return [candle['close'] for candle in candles]\n",
  )

  const candleEndpoint = useMemo(() => {
    const params = new URLSearchParams({ symbol, timeframe, strategy_id: strategyId })
    return `/api/candles/?${params.toString()}`
  }, [strategyId, symbol, timeframe])

  useEffect(() => {
    isDrawingRef.current = isDrawing
  }, [isDrawing])

  useEffect(() => {
    let ignore = false

    async function loadCandles() {
      setFetchState('loading')

      try {
        const response = await fetch(candleEndpoint)
        if (!response.ok) {
          throw new Error(`Candle request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as { candles?: Candle[] }
        if (!payload.candles?.length) {
          throw new Error('Candle response did not include candles')
        }

        if (!ignore) {
          setCandles(payload.candles)
          setFetchState('idle')
        }
      } catch {
        if (!ignore) {
          setCandles(generatePlaceholderCandles(symbol, timeframe))
          setFetchState('fallback')
        }
      }
    }

    void loadCandles()

    return () => {
      ignore = true
    }
  }, [candleEndpoint, symbol, timeframe])

  useEffect(() => {
    if (!containerRef.current) {
      return undefined
    }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: '#071735' },
        textColor: '#a9b9d6',
      },
      grid: {
        vertLines: { color: 'rgba(169, 185, 214, 0.09)' },
        horzLines: { color: 'rgba(169, 185, 214, 0.09)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(246, 183, 60, 0.24)' },
      timeScale: {
        borderColor: 'rgba(246, 183, 60, 0.24)',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#fb7185',
      borderUpColor: '#34d399',
      borderDownColor: '#fb7185',
      wickUpColor: '#8ee6c1',
      wickDownColor: '#fca5a5',
    })

    const markers = createSeriesMarkers(candleSeries, [])
    const indicatorSeries = indicatorSeriesRef.current

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    markerApiRef.current = markers

    const handleClick = (param: { time?: Time }) => {
      if (!isDrawingRef.current || param.time === undefined) {
        return
      }

      const shape: ChartShape = {
        id: `${Date.now()}`,
        time: param.time,
        label: 'Rule marker',
        color: '#f6b73c',
      }

      setShapes((currentShapes) => [...currentShapes, shape])
      setIsDrawing(false)
    }

    chart.subscribeClick(handleClick)

    return () => {
      chart.unsubscribeClick(handleClick)
      indicatorSeries.clear()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      markerApiRef.current = null
    }
  }, [])

  useEffect(() => {
    candleSeriesRef.current?.setData(candles)
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    markerApiRef.current?.setMarkers(shapes.map(shapeToMarker))
    localStorage.setItem(shapeStorageKey(strategyId, symbol), JSON.stringify(shapes))
  }, [shapes, strategyId, symbol])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || candles.length === 0) {
      return
    }

    for (const series of indicatorSeriesRef.current.values()) {
      chart.removeSeries(series)
    }
    indicatorSeriesRef.current.clear()

    indicators.forEach((indicator) => {
      const series = chart.addSeries(LineSeries, {
        color: indicator.color,
        lineWidth: 2,
        title: indicator.name,
      })
      series.setData(calculateIndicator(indicator.name, candles))
      indicatorSeriesRef.current.set(indicator.id, series)
    })
  }, [candles, indicators])

  function addIndicator() {
    const trimmedName = indicatorName.trim()
    if (!trimmedName) {
      return
    }

    const color = indicatorColors[indicators.length % indicatorColors.length]
    setIndicators((currentIndicators) => [
      ...currentIndicators,
      { id: `${trimmedName.toLowerCase().replaceAll(' ', '-')}-${Date.now()}`, name: trimmedName, color },
    ])
    setIndicatorName('')
  }

  function removeIndicator(id: string) {
    setIndicators((currentIndicators) => currentIndicators.filter((indicator) => indicator.id !== id))
  }

  function scrollChart(direction: 'back' | 'forward') {
    chartRef.current?.timeScale().scrollToPosition(direction === 'back' ? 40 : -10, true)
  }

  return (
    <div className="space-y-5">
      <div className="app-chart-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          {timeframes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTimeframe(item)}
              className={item === timeframe ? 'app-timeframe-button-active' : 'app-timeframe-button'}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => scrollChart('back')} className="app-secondary-button">
            <SkipBack aria-hidden="true" />
            Back
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => scrollChart('forward')} className="app-secondary-button">
            <SkipForward aria-hidden="true" />
            Forward
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsDrawing(true)} className="app-secondary-button">
            <MousePointer2 aria-hidden="true" />
            {isDrawing ? 'Click chart...' : 'Draw marker'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShapes([])} className="app-secondary-button">
            <Eraser aria-hidden="true" />
            Clear shapes
          </Button>
        </div>
      </div>

      <div className="app-chart-shell">
        <div ref={containerRef} className="app-lightweight-chart" />
        <div className="app-chart-fetch-state">
          {fetchState === 'loading' && 'Loading candles from backend...'}
          {fetchState === 'fallback' && `Using placeholder candles until ${candleEndpoint} is implemented.`}
          {fetchState === 'idle' && `Candles loaded from ${candleEndpoint}`}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="app-chart-control-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="app-eyebrow">Indicators</p>
              <h3 className="font-semibold text-white">Add by name</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCustomEditorOpen((isOpen) => !isOpen)} className="app-secondary-button">
              <Code2 aria-hidden="true" />
              Custom Python
            </Button>
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={indicatorName}
              onChange={(event) => setIndicatorName(event.target.value)}
              placeholder="SMA 20, EMA 50, RSI 14..."
              className="app-text-input"
            />
            <Button type="button" onClick={addIndicator} className="app-primary-button">
              <Plus aria-hidden="true" />
              Add
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {indicators.map((indicator) => (
              <button
                key={indicator.id}
                type="button"
                onClick={() => removeIndicator(indicator.id)}
                className="app-indicator-pill"
                style={{ borderColor: indicator.color, color: indicator.color }}
              >
                {indicator.name} ×
              </button>
            ))}
          </div>
        </div>

        <div className="app-chart-control-panel">
          <p className="app-eyebrow">Persistent shapes</p>
          <h3 className="font-semibold text-white">Chart annotations</h3>
          <p className="app-muted mt-2 text-sm">
            Markers are saved in browser storage per strategy and symbol until the backend persists shapes.
          </p>
          <div className="mt-4 space-y-2">
            {shapes.length === 0 ? (
              <p className="app-muted text-sm">No shapes drawn yet. Click Draw marker, then click the chart.</p>
            ) : (
              shapes.map((shape) => (
                <div key={shape.id} className="app-shape-row">
                  <span>{shape.label}</span>
                  <span className="app-muted">{String(shape.time)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {isCustomEditorOpen && (
        <div className="app-python-editor">
          <div>
            <p className="app-eyebrow">Custom indicator editor</p>
            <h3 className="font-semibold text-white">Python method skeleton</h3>
            <p className="app-muted mt-2 text-sm">
              This editor is UI-only for now. Later it will save to the Django backend and run through the Python indicator pipeline.
            </p>
          </div>
          <textarea
            value={customIndicatorCode}
            onChange={(event) => setCustomIndicatorCode(event.target.value)}
            spellCheck={false}
            className="app-code-editor"
          />
        </div>
      )}
    </div>
  )
}

function readPersistedShapes(strategyId: string, symbol: string): ChartShape[] {
  try {
    const raw = localStorage.getItem(shapeStorageKey(strategyId, symbol))
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as ChartShape[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function shapeStorageKey(strategyId: string, symbol: string) {
  return `nika-chart-shapes:${strategyId}:${symbol}`
}

function shapeToMarker(shape: ChartShape): SeriesMarker<Time> {
  return {
    time: shape.time,
    position: 'aboveBar',
    color: shape.color,
    shape: 'circle',
    text: shape.label,
  }
}

function calculateIndicator(name: string, candles: Candle[]) {
  const normalizedName = name.toLowerCase()
  const periodMatch = normalizedName.match(/\d+/)
  const period = periodMatch ? Number(periodMatch[0]) : 20

  if (normalizedName.includes('ema')) {
    return calculateEma(candles, period)
  }

  if (normalizedName.includes('rsi')) {
    return calculateRsi(candles, period)
  }

  return calculateSma(candles, period)
}

function calculateSma(candles: Candle[], period: number) {
  return candles
    .map((candle, index) => {
      if (index < period - 1) {
        return null
      }

      const window = candles.slice(index - period + 1, index + 1)
      const value = window.reduce((sum, item) => sum + item.close, 0) / period
      return { time: candle.time, value }
    })
    .filter((item): item is { time: Time; value: number } => item !== null)
}

function calculateEma(candles: Candle[], period: number) {
  const multiplier = 2 / (period + 1)
  let ema = candles[0]?.close ?? 0

  return candles.map((candle) => {
    ema = candle.close * multiplier + ema * (1 - multiplier)
    return { time: candle.time, value: ema }
  })
}

function calculateRsi(candles: Candle[], period: number) {
  return candles
    .map((candle, index) => {
      if (index < period) {
        return null
      }

      const window = candles.slice(index - period + 1, index + 1)
      let gains = 0
      let losses = 0

      for (let i = 1; i < window.length; i += 1) {
        const change = window[i].close - window[i - 1].close
        if (change >= 0) {
          gains += change
        } else {
          losses += Math.abs(change)
        }
      }

      const rs = losses === 0 ? 100 : gains / losses
      const value = 100 - 100 / (1 + rs)
      return { time: candle.time, value }
    })
    .filter((item): item is { time: Time; value: number } => item !== null)
}

function generatePlaceholderCandles(symbol: string, timeframe: string): Candle[] {
  const seed = Array.from(symbol + timeframe).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const now = Math.floor(Date.now() / 1000)
  const step = timeframeToSeconds(timeframe)
  const candles: Candle[] = []
  let close = 100 + (seed % 80)

  for (let index = 160; index >= 0; index -= 1) {
    const time = (now - index * step) as Time
    const wave = Math.sin((160 - index + seed) / 7) * 2.2
    const drift = Math.cos((160 - index) / 13) * 1.1
    const open = close
    close = Math.max(1, close + wave + drift + ((index + seed) % 5 - 2) * 0.18)
    const high = Math.max(open, close) + 1.2 + ((index + seed) % 4) * 0.25
    const low = Math.min(open, close) - 1.2 - ((index + seed) % 3) * 0.2

    candles.push({
      time,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
    })
  }

  return candles
}

function timeframeToSeconds(timeframe: string) {
  const unit = timeframe.at(-1)
  const value = Number(timeframe.slice(0, -1))

  if (unit === 'm') {
    return value * 60
  }

  if (unit === 'h') {
    return value * 60 * 60
  }

  return value * 24 * 60 * 60
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100
}
