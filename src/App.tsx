import { useMemo, useState } from 'react'
import { Activity, BarChart3, CandlestickChart, Plus, Sparkles } from 'lucide-react'

import { CandlestickWorkbench } from '@/components/chart/candlestick-workbench'
import { AppLayout } from '@/components/layout/app-layout'
import { Button } from '@/components/ui/button'

type StrategyVersion = {
  label: string
  returnPercent: number
  winRate: number
  maxDrawdown: number
  trades: number
}

type Strategy = {
  id: string
  name: string
  status: 'Draft' | 'Testing' | 'Live-ready'
  description: string
  symbols: string[]
  versions: StrategyVersion[]
}

const placeholderStrategies: Strategy[] = [
  {
    id: 'amber-breakout',
    name: 'Amber Breakout',
    status: 'Testing',
    description: 'Momentum strategy skeleton focused on breakout candles, volume confirmation, and trailing exits.',
    symbols: ['BTCUSDT', 'ETHUSDT', 'AAPL'],
    versions: [
      { label: 'v0.1', returnPercent: 8.4, winRate: 54, maxDrawdown: 6.8, trades: 42 },
      { label: 'v0.2', returnPercent: 11.9, winRate: 58, maxDrawdown: 5.1, trades: 57 },
    ],
  },
  {
    id: 'deep-blue-reversion',
    name: 'Deep Blue Reversion',
    status: 'Draft',
    description: 'Mean-reversion strategy skeleton based on RSI exhaustion, moving-average distance, and volatility filters.',
    symbols: ['EURUSD', 'SPY', 'SOLUSDT'],
    versions: [
      { label: 'v0.1', returnPercent: 4.7, winRate: 61, maxDrawdown: 3.9, trades: 31 },
      { label: 'v0.2', returnPercent: 6.2, winRate: 63, maxDrawdown: 4.4, trades: 36 },
    ],
  },
]

const periods = ['1D', '1W', '1M', '3M', '1Y']

function App() {
  const [strategies, setStrategies] = useState(placeholderStrategies)
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT')
  const [selectedPeriod, setSelectedPeriod] = useState('1M')

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === selectedStrategyId) ?? null,
    [selectedStrategyId, strategies],
  )

  const latestVersion = selectedStrategy?.versions.at(-1)

  function addPlaceholderStrategy() {
    const nextNumber = strategies.length + 1
    const strategy: Strategy = {
      id: `draft-strategy-${nextNumber}`,
      name: `Draft Strategy ${nextNumber}`,
      status: 'Draft',
      description: 'New strategy placeholder. Backend integration will persist rules, versions, tests, and reports later.',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SPY'],
      versions: [
        { label: 'v0.1', returnPercent: 0, winRate: 0, maxDrawdown: 0, trades: 0 },
      ],
    }

    setStrategies((currentStrategies) => [...currentStrategies, strategy])
    setSelectedStrategyId(strategy.id)
    setSelectedSymbol(strategy.symbols[0])
    setSelectedPeriod('1M')
  }

  function openStrategy(strategy: Strategy) {
    setSelectedStrategyId(strategy.id)
    setSelectedSymbol(strategy.symbols[0])
    setSelectedPeriod('1M')
  }

  if (selectedStrategy) {
    return (
      <AppLayout
        pageTitle={selectedStrategy.name}
        onHome={() => setSelectedStrategyId(null)}
        action={
          <Button onClick={addPlaceholderStrategy} className="app-primary-button">
            <Plus aria-hidden="true" />
            Add strategy
          </Button>
        }
      >
        <main className="space-y-6">
          <section className="app-panel p-6 md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="app-eyebrow">Strategy workspace</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                  {selectedStrategy.name}
                </h1>
                <p className="app-muted mt-4 max-w-2xl text-sm leading-6 md:text-base">
                  {selectedStrategy.description}
                </p>
              </div>

              <span className="app-status-pill">{selectedStrategy.status}</span>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Latest version" value={latestVersion?.label ?? 'n/a'} detail="Current selected baseline" />
            <StatCard label="Return" value={`${latestVersion?.returnPercent ?? 0}%`} detail="Placeholder backtest result" />
            <StatCard label="Win rate" value={`${latestVersion?.winRate ?? 0}%`} detail="Across closed trades" />
            <StatCard label="Max drawdown" value={`${latestVersion?.maxDrawdown ?? 0}%`} detail="Worst version drawdown" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
            <div className="app-panel p-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="size-5 text-amber-300" aria-hidden="true" />
                <div>
                  <p className="app-eyebrow">Version stats</p>
                  <h2 className="text-xl font-semibold text-white">Performance by version</h2>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {selectedStrategy.versions.map((version) => (
                  <div key={version.label} className="app-version-row">
                    <div>
                      <p className="font-medium text-white">{version.label}</p>
                      <p className="app-muted text-xs">{version.trades} trades</p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-right text-sm">
                      <Metric label="Return" value={`${version.returnPercent}%`} />
                      <Metric label="Win" value={`${version.winRate}%`} />
                      <Metric label="DD" value={`${version.maxDrawdown}%`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="app-panel p-6">
              <div className="flex items-center gap-3">
                <Activity className="size-5 text-amber-300" aria-hidden="true" />
                <div>
                  <p className="app-eyebrow">Test strategy</p>
                  <h2 className="text-xl font-semibold text-white">Select symbol and period</h2>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="app-field-label">
                  Symbol
                  <select
                    value={selectedSymbol}
                    onChange={(event) => setSelectedSymbol(event.target.value)}
                    className="app-select"
                  >
                    {selectedStrategy.symbols.map((symbol) => (
                      <option key={symbol} value={symbol}>{symbol}</option>
                    ))}
                  </select>
                </label>

                <label className="app-field-label">
                  Period
                  <select
                    value={selectedPeriod}
                    onChange={(event) => setSelectedPeriod(event.target.value)}
                    className="app-select"
                  >
                    {periods.map((period) => (
                      <option key={period} value={period}>{period}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="app-test-summary mt-5">
                <p className="text-sm text-white">
                  Ready to run a placeholder test for <strong>{selectedSymbol}</strong> over <strong>{selectedPeriod}</strong>.
                </p>
                <Button className="app-primary-button" disabled>
                  Backend test action pending
                </Button>
              </div>
            </div>
          </section>

          <section className="app-panel p-6">
            <div className="mb-5 flex items-center gap-3">
              <CandlestickChart className="size-5 text-amber-300" aria-hidden="true" />
              <div>
                <p className="app-eyebrow">Develop on live chart</p>
                <h2 className="text-xl font-semibold text-white">Candlestick rule workbench</h2>
              </div>
            </div>

            <CandlestickWorkbench key={`${selectedStrategy.id}:${selectedSymbol}`} strategyId={selectedStrategy.id} symbol={selectedSymbol} />
          </section>
        </main>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      pageTitle="Nika Optimizer"
      action={
        <Button onClick={addPlaceholderStrategy} className="app-primary-button">
          <Plus aria-hidden="true" />
          Add strategy
        </Button>
      }
    >
      <main className="space-y-8">
        <section className="app-hero app-panel p-6 md:p-10">
          <div className="max-w-3xl">
            <p className="app-eyebrow">Strategy platform skeleton</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Build, test, and evolve trading strategies.
            </h1>
            <p className="app-muted mt-5 max-w-2xl text-base leading-7">
              Select a placeholder strategy below, inspect version stats, set up a test, or open the future live-chart development workspace.
            </p>
          </div>

          <div className="app-hero-card">
            <Sparkles className="size-6 text-amber-300" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium text-white">Backend bridge pending</p>
            <p className="app-muted mt-2 text-sm leading-6">
              These strategies are local placeholders until the Django API provides strategy metadata, runs, reports, and live data.
            </p>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="app-eyebrow">Strategies</p>
              <h2 className="text-2xl font-semibold text-white">Select or create a strategy</h2>
            </div>
            <p className="app-muted text-sm">{strategies.length} strategy skeletons available</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {strategies.map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                onClick={() => openStrategy(strategy)}
                className="app-strategy-card"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-semibold text-white">{strategy.name}</p>
                    <p className="app-muted mt-2 text-sm leading-6">{strategy.description}</p>
                  </div>
                  <span className="app-status-pill shrink-0">{strategy.status}</span>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3 text-left">
                  <Metric label="Versions" value={String(strategy.versions.length)} />
                  <Metric label="Best return" value={`${Math.max(...strategy.versions.map((version) => version.returnPercent))}%`} />
                  <Metric label="Symbols" value={String(strategy.symbols.length)} />
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </AppLayout>
  )
}

type StatCardProps = {
  label: string
  value: string
  detail: string
}

function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="app-panel p-5">
      <p className="app-muted text-xs uppercase tracking-[0.22em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="app-muted mt-2 text-sm">{detail}</p>
    </div>
  )
}

type MetricProps = {
  label: string
  value: string
}

function Metric({ label, value }: MetricProps) {
  return (
    <div>
      <p className="app-muted text-xs uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-1 font-semibold text-amber-200">{value}</p>
    </div>
  )
}

export default App
