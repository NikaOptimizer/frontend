import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Bug, Database, ArrowLeft, RefreshCw } from 'lucide-react'
import { CandlestickSeries, HistogramSeries, LineSeries, ColorType, createChart } from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'
import { AppLayout } from '@/components/layout/app-layout'
import { Button } from '@/components/ui/button'
import './debug-dashboard.css'

type Dataset = { id: string; symbol: string; source: string; table: string | null; storage: string; timezone: string; volume_kind: string; interval_seconds: number; row_count: number; first_clock: string | null; last_clock: string | null; generated_at: string; sha256?: string; timezone_assumption?: string; timezone_warning?: string; simulation?: { simulated_candles: number; model_id: string; policy: string; validation: { holdout_year: number; masked_blocks: number; evaluated_candles: number; simulated_close_mae_usd: number | null; linear_bridge_close_mae_usd: number | null; tick_count_mae: number | null } } }
type Row = { clock: string; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null; is_simulated?: boolean; candle_kind?: string; utc_offset?: string; model_id?: string; is_outlier?: boolean; outlier_reasons?: { metric: string; value: number; threshold: number }[] }
type OutlierExample = { clock: string; ordinal: number; day_index: number; is_simulated: boolean; severity: number; reasons: { metric: string; value: number; threshold: number; severity: number }[] }
type OutlierCounts = { total: number; evaluated: number; flagged: number; percent: number | null }
type OutlierReport = { definition: string; observed: OutlierCounts; simulated: OutlierCounts; examples: OutlierExample[]; metric_counts: Record<string, number> }
type Gap = { before: string; after: string; seconds: number }
type Inspection = { dataset: Dataset; day: string; offset: number; limit: number; total: number; rows: Row[]; report: { outliers?: OutlierReport; stats: Record<string, number>; coverage: Record<string, number>; heatmap: Record<string, number>; gaps: Record<string, number>; sessions: Gap[]; largest_gaps: Gap[]; returns: Record<string, number>; ranges: Record<string, number>; extremes: { percent: number; clock: string }[] } }
const number = (value: number) => value.toLocaleString()
const clockNumber = (clock: string) => Date.parse(clock.replace(' ', 'T') + 'Z')
const minute = (clock: string) => Number(clock.slice(11, 13)) * 60 + Number(clock.slice(14, 16))

async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status}).`)
  return payload as T
}

export function DebugDashboard({ onHome }: { onHome: () => void }) {
  const [tool, setTool] = useState<'dashboard' | 'data'>('dashboard')
  return <AppLayout pageTitle={tool === 'dashboard' ? 'Debug dashboard' : 'Debug / Data Inspector'} onHome={onHome} action={tool === 'data' ? <Button className="app-secondary-button" onClick={() => setTool('dashboard')}><ArrowLeft />Debug dashboard</Button> : undefined}>
    {tool === 'dashboard' ? <main className="space-y-6">
      <section className="app-panel p-8"><p className="app-eyebrow">Developer tools</p><h1 className="mt-3 text-4xl font-semibold">Debug dashboard</h1><p className="app-muted mt-4">Inspect Nika’s data and investigate unexpected behavior.</p></section>
      <button className="app-strategy-card max-w-xl" onClick={() => setTool('data')}><Database className="text-amber-300" /><h2 className="mt-4 text-2xl font-semibold">Data Inspector</h2><p className="app-muted mt-3">Browse datasets, candle quality, market sessions, coverage and gaps.</p><span className="mt-5 inline-block text-amber-200">Open inspector →</span></button>
      <p className="app-muted text-sm flex items-center gap-2"><Bug size={16} />More debug tools can be added here as Nika grows.</p>
    </main> : <DataInspector />}
  </AppLayout>
}

function Panel({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return <section className="app-panel p-5 min-w-0"><h2 className="text-xl font-semibold">{title}</h2>{detail && <p className="app-muted mt-2 text-sm">{detail}</p>}<div className="mt-4">{children}</div></section>
}

function DataInspector() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selected, setSelected] = useState('')
  const [day, setDay] = useState('')
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [catalogError, setCatalogError] = useState('')
  const [error, setError] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Inspection | null>(null)
  const [row, setRow] = useState<Row | null>(null)
  const [sessionMonth, setSessionMonth] = useState('all')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setCatalogLoading(true)
      setCatalogError('')
      try {
        const payload = await get<{ datasets: Dataset[] }>('/api/debug/datasets/', controller.signal)
        if (controller.signal.aborted) return
        setDatasets(payload.datasets)
        setSelected(current => payload.datasets.some(d => d.id === current) ? current : payload.datasets[0]?.id || '')
      } catch (e) {
        if (!controller.signal.aborted) setCatalogError(e instanceof Error ? e.message : 'Unable to load datasets.')
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setData(null)
      setRow(null)
      setError('')
      const query = new URLSearchParams({ dataset: selected, offset: String(offset), limit: '300' })
      if (day) query.set('day', day)
      try {
        const payload = await get<Inspection>(`/api/debug/inspection/?${query}`, controller.signal)
        if (!controller.signal.aborted) setData(payload)
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load inspection.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [selected, day, offset, refresh])
  function chooseDay(value: string) { setDay(value); setOffset(0); setRow(null) }
  const meta = data?.dataset || datasets.find(d => d.id === selected)
  const sessions = data?.report.sessions.filter(s => sessionMonth === 'all' || s.before.startsWith(sessionMonth)) || []
  const months = [...new Set(data?.report.sessions.map(s => s.before.slice(0, 7)) || [])]
  return <main className="space-y-6">
    <section className="app-panel p-6">
      <p className="app-eyebrow">Data Inspector</p><h1 className="mt-2 text-3xl font-semibold">Candle datasets</h1>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="app-field-label flex-1 min-w-0">Dataset<select aria-label="Dataset" className="app-select w-full" value={selected} disabled={catalogLoading || !datasets.length} onChange={e => { setSelected(e.target.value); setDay(''); setOffset(0); setSessionMonth('all') }}>
          {!datasets.length && <option value="">{catalogLoading ? 'Loading datasets…' : 'No inspection datasets'}</option>}
          {datasets.map(d => <option key={d.id} value={d.id}>{d.symbol} · {d.source} · {d.interval_seconds}s</option>)}
        </select></label>
        <Button className="app-secondary-button" disabled={loading || catalogLoading} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={16} />Refresh archive</Button>
      </div>
      {meta && <><p className="mt-4 text-amber-200 font-medium">{meta.timezone === 'unknown' ? 'Source time — timezone unknown. No timestamp normalization applied.' : meta.timezone === 'UTC' ? 'Times displayed in UTC.' : `Source clock: ${meta.timezone}. Original clock values preserved.`}</p>{meta.timezone_warning && <p className="mt-2 text-sm text-amber-200">{meta.timezone_warning}</p>}<p className="app-muted mt-2 text-sm">{meta.storage}{meta.table ? ` · Table: ${meta.table}` : ' · Not imported into QuestDB'} · Volume: {meta.volume_kind}</p><p className="app-muted mt-1 text-sm">Snapshot generated {meta.generated_at}. Refresh reloads the archive; rebuilding is a separate operation.</p></>}
      {(catalogError || error) && <p className="mt-4 text-red-300" role="alert">{catalogError || error}</p>}
      {(catalogLoading || loading) && <p className="mt-4 app-muted" role="status">Loading inspection…</p>}
      {!catalogLoading && !catalogError && !datasets.length && <p className="mt-4" role="status">No datasets are available. Generate an inspection archive first.</p>}
    </section>
    {data && <>
      {data.dataset.simulation && <Panel title="Simulation preview — estimated candles" detail="Purple candles are simulated; they are not recovered market observations. This dataset is a separate retrospective research preview and uses the next observed candle as an anchor.">
        <p className="text-amber-200">{number(data.dataset.simulation.simulated_candles)} simulated candles · observed source data preserved.</p>
        <p className="app-muted text-sm mt-3">{data.dataset.simulation.policy} The broker calendar is unknown; uncertain closures remain untouched.</p>
        <p className="app-muted text-sm mt-3">Held-out {data.dataset.simulation.validation.holdout_year}: {number(data.dataset.simulation.validation.evaluated_candles)} masked candles in {data.dataset.simulation.validation.masked_blocks} blocks. Close-price MAE: ${data.dataset.simulation.validation.simulated_close_mae_usd?.toFixed(4) ?? 'unavailable'}; linear-bridge baseline: ${data.dataset.simulation.validation.linear_bridge_close_mae_usd?.toFixed(4) ?? 'unavailable'}. Random paths model plausible variation; they do not establish the true missing price.</p>
      </Panel>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Candles', number(data.dataset.row_count)], ['First source clock', data.dataset.first_clock || 'Empty'], ['Last source clock', data.dataset.last_clock || 'Empty'], ['Interval / clock', `${data.dataset.interval_seconds}s / ${data.dataset.timezone}`]].map(([label, value]) => <div className="app-panel p-5" key={label}><p className="app-muted text-sm">{label}</p><p className="mt-2 font-semibold text-lg">{value}</p></div>)}</div>
      <Panel title="Validation" detail="Full snapshot counts. Missing prices include nonfinite values. Zero range or zero volume is an observation, not automatically an error.">
        <dl className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">{Object.entries(data.report.stats).filter(([key]) => key !== 'rows').map(([key, value]) => <div key={key} className="debug-stat"><dt>{key.replaceAll('_', ' ')}</dt><dd>{number(value)}</dd></div>)}</dl>
      </Panel>
      <Panel title="Candle outliers" detail="Unusually large ranges, bodies or adjacent-minute price changes compared with recent observed candles. These flags identify observations to review, not proven data errors.">
        {data.report.outliers ? <>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="debug-stat"><dt>Observed outliers</dt><dd>{number(data.report.outliers.observed.flagged)}</dd></div>
            <div className="debug-stat"><dt>Observed outlier rate</dt><dd>{data.report.outliers.observed.percent === null ? 'Not enough history' : `${data.report.outliers.observed.percent.toFixed(3)}%`}</dd></div>
            <div className="debug-stat"><dt>Observed candles evaluated</dt><dd>{number(data.report.outliers.observed.evaluated)}</dd></div>
            {data.report.outliers.simulated.total > 0 && <div className="debug-stat"><dt>Simulated outliers</dt><dd>{number(data.report.outliers.simulated.flagged)} <span className="text-sm">({data.report.outliers.simulated.percent?.toFixed(3) ?? 'n/a'}%)</span></dd></div>}
          </dl>
          <details className="mt-4"><summary className="debug-link cursor-pointer">Detection method</summary><p className="app-muted mt-2 text-sm">{data.report.outliers.definition} Invalid OHLC and duplicate timestamps are excluded. Simulated candles do not train the baseline. Each flagged candle is counted once even if several metrics flag it.</p></details>
          <div className="debug-scroll mt-4">{data.report.outliers.examples.map(example => <button key={example.ordinal} className="debug-list-row" title={example.reasons.map(r => `${r.metric}: ${r.value.toPrecision(5)} > ${r.threshold.toPrecision(5)}`).join('; ')} onClick={() => { chooseDay(example.clock.slice(0, 10)); setOffset(Math.floor(example.day_index / 300) * 300) }}><span>{example.clock} · {example.is_simulated ? 'Simulated' : 'Observed'}</span><span>{example.reasons.map(r => r.metric.replaceAll('_', ' ')).join(', ')} · {example.severity.toFixed(1)}× threshold</span></button>)}</div>
          {data.report.outliers.observed.flagged + data.report.outliers.simulated.flagged === 0 && <p className="mt-3 app-muted">{data.report.outliers.observed.evaluated ? 'No outliers detected at this threshold.' : 'Not enough varying observed history to evaluate outliers.'}</p>}
          <p className="app-muted text-xs mt-2">Showing up to 50 largest flags from the full dataset. Click one to open its candle page.</p>
        </> : <p className="app-muted">Outlier statistics are unavailable in this archive. Rebuild its outlier report.</p>}
      </Panel>
      <Panel title="Candles & volume" detail="Select a date or click a coverage cell, gap, or extreme return. Click a candle to inspect its raw values.">
        <div className="flex flex-wrap items-end gap-3 mb-4"><label className="app-field-label">Date<input type="date" className="app-text-input" value={day || data.day} onChange={e => chooseDay(e.target.value)} /></label><Button className="app-secondary-button" onClick={() => setOffset(Math.max(0, offset - 300))} disabled={!offset}>Previous rows</Button><Button className="app-secondary-button" onClick={() => setOffset(offset + 300)} disabled={offset + data.rows.length >= data.total}>Next rows</Button><span className="app-muted text-sm">{data.total ? `${offset + 1}–${offset + data.rows.length} of ${number(data.total)}` : 'No candles on this date'}</span></div>
        <CandleChart rows={data.rows} onRow={setRow} />
        <p className="app-muted text-xs mt-2">Purple = simulated preview. Invalid or duplicate candles stay visible in raw rows; the chart shows the first valid candle per timestamp.</p>
        {row && <pre className="debug-raw mt-3" aria-live="polite">{JSON.stringify(row, null, 2)}</pre>}
        <details className="mt-4"><summary className="cursor-pointer text-amber-200">Raw rows for this page</summary><div className="debug-table-wrap debug-scroll"><table className="debug-table"><thead><tr>{['Clock', 'Origin', 'Assumed UTC offset', 'Outlier', 'Open', 'High', 'Low', 'Close', data.dataset.volume_kind].map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{data.rows.map((r, i) => <tr key={`${r.clock}:${i}`}><td><button className="debug-link" onClick={() => setRow(r)}>{r.clock}</button></td><td className={r.is_simulated ? 'text-purple-300' : ''}>{r.is_simulated ? 'Simulated' : 'Observed'}</td><td>{r.utc_offset || (data.dataset.timezone === 'UTC' ? '+0000' : 'Unresolved')}</td><td title={r.outlier_reasons?.map(reason => reason.metric).join(', ')}>{r.is_outlier ? 'Flagged' : '—'}</td>{[r.open, r.high, r.low, r.close, r.volume].map((v, j) => <td key={j}>{v ?? 'null'}</td>)}</tr>)}</tbody></table></div></details>
      </Panel>
      <Panel title="Coverage calendar" detail="Daily observed candle counts. Unshaded dates have no rows; no trading-calendar completeness is assumed."><Coverage coverage={data.report.coverage} onDay={chooseDay} /></Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Weekday × hour" detail={`Candle counts in ${data.dataset.timezone === 'unknown' ? 'unresolved source time' : data.dataset.timezone}. Hover or focus cells for counts.`}><Heatmap values={data.report.heatmap} /></Panel>
        <Panel title="Gaps between candles" detail="Only gaps longer than the declared 60-second interval. Scheduled breaks and missing observations are not distinguished."><Bars values={data.report.gaps} label={k => `${Number(k) / 60} min`} /><div className="debug-scroll mt-4">{data.report.largest_gaps.map((g, i) => <button key={i} className="debug-list-row" onClick={() => chooseDay(g.after.slice(0, 10))}><span>{g.before} → {g.after}</span><strong>{(g.seconds / 3600).toFixed(2)} h</strong></button>)}</div></Panel>
      </div>
      <Panel title="Session boundaries over time" detail="Each dot is the last candle before a gap over 30 minutes (amber) or first candle after it (blue). Vertical position is source clock time. Click a dot to browse that date.">
        <label className="app-field-label max-w-xs">Month<select aria-label="Month" className="app-select" value={sessionMonth} onChange={e => setSessionMonth(e.target.value)}><option value="all">All months</option>{months.map(m => <option key={m}>{m}</option>)}</select></label>
        <Sessions gaps={sessions} onDay={chooseDay} />
      </Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Close-to-close returns" detail="Adjacent one-minute candles only; gaps are excluded. Percentage change uses the absolute previous close, supporting negative spread prices. Quarter-percent bins; edge bins include overflow."><Bars values={data.report.returns} label={k => `${(Number(k) * .25).toFixed(2)}%`} /></Panel>
        <Panel title="Candle ranges" detail="(High − low) / |open|, excluding zero or missing open. Quarter-percent bins; final bin includes values ≥10%."><Bars values={data.report.ranges} label={k => `${(Number(k) * .25).toFixed(2)}%`} /></Panel>
      </div>
      <Panel title="Compare datasets" detail="Compare overlapping source-clock observations without joining histories. XAUUSD and MGC futures are different instruments; price differences can reflect basis and contract rolls, not data errors.">
        <Comparison key={data.dataset.id} baseline={data} datasets={datasets} />
      </Panel>
      <Panel title="Largest one-minute price changes" detail="Ranked observations for review; a large change alone does not prove bad data."><div className="debug-scroll">{data.report.extremes.map((e, i) => <button key={i} className="debug-list-row" onClick={() => chooseDay(e.clock.slice(0, 10))}><span>{e.clock}</span><strong>{e.percent.toFixed(4)}%</strong></button>)}</div></Panel>
    </>}
  </main>
}

function CandleChart({ rows, onRow }: { rows: Row[]; onRow: (row: Row) => void }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current) return
    const chart = createChart(container.current, { autoSize: true, height: 360, layout: { background: { type: ColorType.Solid, color: '#071735' }, textColor: '#a9b9d6', attributionLogo: true }, grid: { vertLines: { color: '#142b50' }, horzLines: { color: '#142b50' } }, timeScale: { timeVisible: true, secondsVisible: false } })
    const candle = chart.addSeries(CandlestickSeries, { upColor: '#34d399', downColor: '#fb7185', wickUpColor: '#34d399', wickDownColor: '#fb7185', borderVisible: false })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' })
    candle.priceScale().applyOptions({ scaleMargins: { top: .1, bottom: .3 } })
    volume.priceScale().applyOptions({ scaleMargins: { top: .78, bottom: 0 } })
    const seen = new Set<string>()
    const valid = rows.filter(r => [r.open, r.high, r.low, r.close].every(v => v !== null && Number.isFinite(v)) && r.high! >= Math.max(r.open!, r.close!) && r.low! <= Math.min(r.open!, r.close!) && !seen.has(r.clock) && Boolean(seen.add(r.clock)))
    // UTC encoding is used only to place naive clock labels on the chart; it is not persisted or asserted as the source timezone.
    candle.setData(valid.map(r => ({ time: (clockNumber(r.clock) / 1000) as UTCTimestamp, open: r.open!, high: r.high!, low: r.low!, close: r.close!, ...(r.is_simulated ? { color: '#c4b5fd', wickColor: '#c4b5fd' } : {}) })))
    volume.setData(valid.filter(r => r.volume !== null).map(r => ({ time: (clockNumber(r.clock) / 1000) as UTCTimestamp, value: r.volume!, color: r.is_simulated ? '#c4b5fd99' : '#f6b73c66' })))
    chart.subscribeClick(param => { if (param.time) { const found = valid.find(r => clockNumber(r.clock) / 1000 === param.time); if (found) onRow(found) } })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [rows, onRow])
  return <div ref={container} className="debug-chart" role="img" aria-label="Candlestick and volume chart; raw values are available in the table below" />
}

function Coverage({ coverage, onDay }: { coverage: Record<string, number>; onDay: (day: string) => void }) {
  const dates = Object.keys(coverage).sort()
  if (!dates.length) return <p>No observations.</p>
  const years = [...new Set(dates.map(d => d.slice(0, 4)))]
  const maximum = Math.max(1, ...Object.values(coverage))
  return <div className="debug-coverage">{years.map(year => {
    const start = Date.parse(`${year}-01-01T00:00:00Z`)
    const end = Date.parse(`${Number(year) + 1}-01-01T00:00:00Z`)
    const days = Array.from({ length: (end - start) / 86400000 }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10))
    return <div key={year}><p className="mb-2 text-sm app-muted">{year}</p><div className="debug-year">{days.map(day => <button key={day} title={`${day}: ${number(coverage[day] || 0)} candles`} aria-label={`${day}: ${number(coverage[day] || 0)} candles`} onClick={() => onDay(day)} style={{ background: coverage[day] ? `rgba(246,183,60,${.2 + .8 * coverage[day] / maximum})` : '#182b49' }} />)}</div></div>
  })}<p className="app-muted text-xs">Days run top to bottom, left to right, starting January 1. Brighter amber = more candles (maximum {number(maximum)} / day).</p></div>
}

function Heatmap({ values }: { values: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(values))
  return <div className="debug-table-wrap"><table className="debug-heat"><thead><tr><th>Day</th>{Array.from({ length: 24 }, (_, h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, d) => <tr key={day}><th>{day}</th>{Array.from({ length: 24 }, (_, h) => <td key={h}><span tabIndex={0} title={`${day} ${h}:00 · ${number(values[`${d}:${h}`] || 0)} candles`} aria-label={`${day} ${h}:00 · ${number(values[`${d}:${h}`] || 0)} candles`} style={{ background: `rgba(246,183,60,${.06 + .94 * (values[`${d}:${h}`] || 0) / max})` }} /></td>)}</tr>)}</tbody></table><p className="app-muted text-xs mt-3">Brighter amber = more observations.</p></div>
}

function Bars({ values, label }: { values: Record<string, number>; label: (key: string) => string }) {
  const entries = Object.entries(values).sort((a, b) => Number(a[0]) - Number(b[0]))
  const max = Math.max(1, ...entries.map(([, count]) => count))
  return entries.length ? <div className="debug-bars">{entries.map(([key, count]) => <div className="debug-bar" key={key}><span>{label(key)}</span><div><i style={{ width: `${Math.max(.5, 100 * count / max)}%` }} /></div><span>{number(count)}</span></div>)}</div> : <p className="app-muted">No observations for this distribution.</p>
}

function Sessions({ gaps, onDay }: { gaps: Gap[]; onDay: (day: string) => void }) {
  if (!gaps.length) return <p className="mt-4 app-muted">No gaps longer than 30 minutes.</p>
  const clocks = gaps.flatMap(g => [g.before, g.after])
  const min = Math.min(...clocks.map(clockNumber)), max = Math.max(...clocks.map(clockNumber))
  return <><svg viewBox="0 0 1000 300" className="debug-sessions mt-4" role="img" aria-label="Session closing and opening clock times across dates">
    {[0, 6, 12, 18, 24].map(h => <g key={h}><line x1="55" x2="985" y1={260 - h / 24 * 240} y2={260 - h / 24 * 240} stroke="#294361" /><text x="5" y={265 - h / 24 * 240} fill="#a9b9d6" fontSize="12">{h}:00</text></g>)}
    {gaps.flatMap((g, i) => [g.before, g.after].map((clock, j) => <circle key={`${i}:${j}`} cx={55 + (clockNumber(clock) - min) / Math.max(1, max - min) * 930} cy={260 - minute(clock) / 1440 * 240} r="3" fill={j ? '#7dd3fc' : '#f6b73c'} onClick={() => onDay(clock.slice(0, 10))}><title>{j ? 'Reopen' : 'Close'}: {clock} · gap {g.seconds / 60} min</title></circle>))}
    <text x="55" y="290" fill="#a9b9d6" fontSize="12">{clocks[0]?.slice(0, 10)}</text><text x="985" y="290" textAnchor="end" fill="#a9b9d6" fontSize="12">{clocks.at(-1)?.slice(0, 10)}</text>
  </svg><p className="app-muted text-xs">Amber: before break · Blue: after break. Exact times are also available in the session list.</p><details className="mt-3"><summary className="debug-link cursor-pointer">Session list ({number(gaps.length)})</summary><div className="debug-scroll">{gaps.map((g, i) => <button key={i} className="debug-list-row" onClick={() => onDay(g.after.slice(0, 10))}>{g.before} → {g.after}</button>)}</div></details></>
}

function Comparison({ baseline, datasets }: { baseline: Inspection; datasets: Dataset[] }) {
  const [other, setOther] = useState('')
  const [shift, setShift] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ time: number; left: number; right: number; difference: number }[] | null>(null)
  const [coverage, setCoverage] = useState('')
  const [request, setRequest] = useState<{ other: string; shift: number; day: string; id: number } | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const currentResult = request?.day === baseline.day ? result : null
  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      setResult(null)
      try {
        const fetchDay = (dataset: string, day: string) => get<Inspection>(`/api/debug/inspection/?${new URLSearchParams({ dataset, day, limit: '2000' })}`, controller.signal)
        // Offset is an exploratory clock shift, never a timezone conversion.
        const start = clockNumber(`${request!.day} 00:00:00`) - request!.shift * 60000
        const end = start + 86400000 - 1
        const days = [...new Set([new Date(start).toISOString().slice(0, 10), new Date(end).toISOString().slice(0, 10)])]
        const [left, ...right] = await Promise.all([fetchDay(baseline.dataset.id, request!.day), ...days.map(d => fetchDay(request!.other, d))])
        if (controller.signal.aborted) return
        const lookup = new Map<number, number>()
        for (const page of right) for (const row of page.rows) if (row.close !== null) lookup.set(clockNumber(row.clock) + request!.shift * 60000, row.close)
        const points = left.rows.flatMap(row => {
          const time = clockNumber(row.clock)
          const value = lookup.get(time)
          return row.close !== null && value !== undefined ? [{ time, left: row.close, right: value, difference: row.close - value }] : []
        })
        const unique = [...new Map(points.map(p => [p.time, p])).values()]
        setResult(unique)
        setCoverage(`${unique.length} matched timestamps on ${request!.day}. ${left.total} baseline observations. ${[left, ...right].some(p => p.total > p.rows.length) ? 'A date exceeds the 2000-row comparison cap; results are partial.' : 'All rows for the requested dates were considered.'}`)
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Comparison failed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [request, baseline.dataset.id])
  useEffect(() => {
    if (!container.current || !currentResult?.length) return
    const chart = createChart(container.current, { autoSize: true, height: 360, layout: { background: { type: ColorType.Solid, color: '#071735' }, textColor: '#a9b9d6' }, timeScale: { timeVisible: true } })
    const left = chart.addSeries(LineSeries, { color: '#f6b73c', title: baseline.dataset.symbol })
    const right = chart.addSeries(LineSeries, { color: '#7dd3fc', title: 'Comparison' })
    const difference = chart.addSeries(LineSeries, { color: '#c4b5fd', title: 'Baseline − comparison' }, 1)
    left.setData(currentResult.map(p => ({ time: p.time / 1000 as UTCTimestamp, value: p.left })))
    right.setData(currentResult.map(p => ({ time: p.time / 1000 as UTCTimestamp, value: p.right })))
    difference.setData(currentResult.map(p => ({ time: p.time / 1000 as UTCTimestamp, value: p.difference })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [currentResult, baseline.dataset.symbol])
  const matching = datasets.find(d => d.id === other)
  return <div>
    <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] items-end">
      <label className="app-field-label min-w-0">Comparison dataset<select aria-label="Comparison dataset" className="app-select w-full" value={other} onChange={e => { setOther(e.target.value); setResult(null); setRequest(null); setError('') }}><option value="">Choose a dataset</option>{datasets.filter(d => d.id !== baseline.dataset.id).map(d => <option key={d.id} value={d.id}>{d.symbol} · {d.source}</option>)}</select></label>
      <label className="app-field-label">Shift other clock (min)<input className="app-text-input" type="number" min={-1440} max={1440} value={shift} onChange={e => { setShift(Number(e.target.value)); setResult(null); setRequest(null); setError('') }} /></label>
      <Button className="app-secondary-button" disabled={!other || loading || !Number.isInteger(shift) || Math.abs(shift) > 1440} onClick={() => setRequest({ other, shift, day: baseline.day, id: Date.now() })}>Compare selected date</Button>
    </div>
    {matching && <p className="app-muted text-sm mt-3">Other clock: {matching.timezone}. Other volume: {matching.volume_kind}. Positive shift moves the other dataset’s clock later. No source timestamps are changed.</p>}
    {loading && <p className="mt-3" role="status">Loading comparison…</p>}
    {error && <p className="mt-3 text-red-300" role="alert">{error}</p>}
    {currentResult && <><p className="mt-3 app-muted text-sm">{coverage}</p>{currentResult.length === 0 && <p className="mt-3">No overlapping timestamps. Try another date or exploratory clock offset.</p>}<div ref={container} className={currentResult.length ? 'debug-chart mt-3' : ''} />
    <details className="mt-3"><summary className="debug-link cursor-pointer">Matched prices and differences</summary><div className="debug-table-wrap debug-scroll"><table className="debug-table"><thead><tr><th>Baseline clock</th><th>Baseline</th><th>Comparison</th><th>Difference</th></tr></thead><tbody>{currentResult.map(p => <tr key={p.time}><td>{new Date(p.time).toISOString().replace('T', ' ').slice(0, 19)}</td><td>{p.left}</td><td>{p.right}</td><td>{p.difference.toFixed(6)}</td></tr>)}</tbody></table></div></details></>}
  </div>
}
