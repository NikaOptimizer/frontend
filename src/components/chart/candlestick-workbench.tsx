import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { Code2, Plus, SkipBack, SkipForward, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { toBars } from '@/components/chart/drawing/core/time-index'
import { DrawingRibbon } from '@/components/chart/drawing/react/drawing-ribbon'
import { DrawingSettingsDialog } from '@/components/chart/drawing/react/drawing-settings-dialog'
import { DrawingToolbar } from '@/components/chart/drawing/react/drawing-toolbar'
import { TOOL_LABELS } from '@/components/chart/drawing/react/tool-icons'
import { attachDrawingTools, useDrawingController } from '@/components/chart/drawing/react/use-drawing-tools'

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

type CandlestickWorkbenchProps = {
  strategyId: string
  symbol: string
  provider: string
  period: string
}

const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
const timeframeSeconds: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }
const indicatorColors = ['#f6b73c', '#7dd3fc', '#a78bfa', '#34d399', '#fb7185']

export function CandlestickWorkbench({ strategyId, symbol, provider, period }: CandlestickWorkbenchProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const { controller: drawings, snapshot: drawingState } = useDrawingController(strategyId, provider, symbol)

  const [timeframe, setTimeframe] = useState(timeframes[2])
  const [candles, setCandles] = useState<Candle[]>([])
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error' | 'empty'>('loading')
  const [fetchError, setFetchError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [indicators, setIndicators] = useState<Indicator[]>([
    { id: 'sma-20', name: 'SMA 20', color: indicatorColors[0] },
  ])
  const [indicatorName, setIndicatorName] = useState('EMA 50')
  const [isCustomEditorOpen, setIsCustomEditorOpen] = useState(false)
  const [customIndicatorCode, setCustomIndicatorCode] = useState(
    "def custom_indicator(candles):\n    '''Return a list of values aligned with candles.'''\n    return [candle['close'] for candle in candles]\n",
  )

  const candleEndpoint = useMemo(() => {
    const params = new URLSearchParams({ symbol, provider, timeframe, period, limit: '500' })
    return `/api/candles/?${params.toString()}`
  }, [symbol, provider, timeframe, period])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    async function loadCandles() {
      setFetchState('loading')
      setCandles([])
      setFetchError('')

      try {
        const response = await fetch(candleEndpoint, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Candle request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as { candles?: Candle[] }
        if (!Array.isArray(payload.candles)) {
          throw new Error('Invalid candle response')
        }

        if (!ignore) {
          setCandles(payload.candles)
          setFetchState(payload.candles.length ? 'idle' : 'empty')
        }
      } catch (error) {
        if (!ignore) {
          setCandles([])
          setFetchError(error instanceof Error ? error.message : 'Unable to load candles')
          setFetchState('error')
        }
      }
    }

    void loadCandles()

    return () => {
      ignore = true
      controller.abort()
    }
  }, [candleEndpoint, refresh])

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

    const indicatorSeries = indicatorSeriesRef.current
    const detachDrawings = attachDrawingTools(drawings, chart, candleSeries)

    chartRef.current = chart
    candleSeriesRef.current = candleSeries

    return () => {
      detachDrawings()
      indicatorSeries.clear()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
    }
  }, [drawings])

  useEffect(() => {
    candleSeriesRef.current?.setData(candles)
    chartRef.current?.timeScale().fitContent()
    drawings.setBars(toBars(candles, timeframeSeconds[timeframe]))
  }, [candles, drawings, timeframe])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) {
      return
    }

    for (const series of indicatorSeriesRef.current.values()) {
      chart.removeSeries(series)
    }
    indicatorSeriesRef.current.clear()
    if (candles.length === 0) return

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
          <Button type="button" variant="outline" size="sm" className="app-secondary-button" disabled={fetchState === 'loading'} onClick={() => setRefresh((value) => value + 1)}>Refresh candles</Button>
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
        </div>
      </div>

      <div className="app-chart-shell">
        <div className="drawing-chart-row">
          <DrawingRibbon controller={drawings} snapshot={drawingState} />
          <div className="drawing-chart-area">
            <div ref={containerRef} className="app-lightweight-chart" />
            <DrawingToolbar controller={drawings} snapshot={drawingState} />
          </div>
        </div>
        <div className="app-chart-fetch-state" role="status">
          {fetchState === 'loading' && 'Loading candles from backend...'}
          {fetchState === 'error' && `${fetchError}. Use Refresh candles to retry.`}
          {fetchState === 'empty' && 'No candles available for this selection.'}
          {fetchState === 'idle' && `${candles.length} stored candles loaded. Showing up to the latest 500 bars in the selected period.`}
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
          <p className="app-eyebrow">Drawings</p>
          <h3 className="font-semibold text-white">Chart annotations</h3>
          <p className="app-muted mt-2 text-sm">
            Saved through the backend per strategy and instrument, and shown on every timeframe.
          </p>
          <div className="mt-4 space-y-2">
            {drawingState.drawings.length === 0 ? (
              <p className="app-muted text-sm">No drawings yet. Pick a tool from the left ribbon, then click the chart.</p>
            ) : (
              drawingState.drawings.map((drawing) => (
                <div key={drawing.id} className="app-shape-row" data-selected={drawing.id === drawingState.selectedId || undefined}>
                  <button type="button" className="flex-1 text-left" onClick={() => drawings.select(drawing.id)}>
                    {TOOL_LABELS[drawing.tool]}
                  </button>
                  <span className="app-muted">{new Date(drawing.time * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
                  <button type="button" className="app-muted" aria-label={`Remove ${TOOL_LABELS[drawing.tool]}`} onClick={() => drawings.remove(drawing.id)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <DrawingSettingsDialog controller={drawings} />

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
