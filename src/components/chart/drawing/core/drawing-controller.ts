import type { IChartApi, ISeriesApi, Logical, SeriesType } from 'lightweight-charts'

import { createMarker, drawMarker, dragMarker, hitMarker, markerGeometry, type MarkerGeometry } from '../tools/marker'
import {
  DEFAULT_ACCOUNT,
  DEFAULT_POSITION_STYLE,
  createPosition,
  dragPosition,
  drawPosition,
  hitPosition,
  positionAxisLabels,
  positionGeometry,
  positionOutcome,
  positionStats,
  type DragPoint,
  type PositionGeometry,
  type PositionOutcome,
  type PositionStats,
} from '../tools/position'
import {
  isPosition,
  type AxisLabel,
  type Drawing,
  type DrawingTool,
  type HitResult,
  type PositionDrawing,
  type ToolMode,
  type UnixTime,
  type ViewEnv,
} from '../types'
import { emptyBars, logicalToTime, timeToLogical } from './time-index'

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error'

export type DrawingSummary = { id: string; tool: DrawingTool; time: UnixTime }

/** Coarse state for React; recreated only when it changes, never during a drag. */
export type DrawingSnapshot = {
  activeTool: ToolMode
  selectedId: string | null
  drawings: readonly DrawingSummary[]
  saveStatus: SaveStatus
}

export type CommitEvent = { type: 'upsert'; drawing: Drawing } | { type: 'delete'; id: string }

type Geometry = PositionGeometry | MarkerGeometry
type DragState = { id: string; part: string; from: DragPoint; original: Drawing['data']; moved: boolean }
type Cached<T> = { version: number; barsVersion: number; value: T }

/**
 * Owns drawing state and everything frame-related: geometry, hit testing and
 * rendering. It is framework-free; React subscribes to coarse snapshots, and
 * pointer moves only mutate state and request a chart repaint.
 */
export class DrawingController {
  private drawings = new Map<string, Drawing>()
  private versions = new Map<string, number>()
  private geometries = new Map<string, Geometry>()
  private positionCache = new Map<string, Cached<{ stats: PositionStats; outcome: PositionOutcome }>>()
  private listeners = new Set<() => void>()
  private commitListeners = new Set<(event: CommitEvent) => void>()
  private editListeners = new Set<(id: string) => void>()
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private requestRender: (() => void) | null = null
  private drag: DragState | null = null
  private barsVersion = 0
  private priceDecimals = 2
  private snapshot: DrawingSnapshot = { activeTool: 'cursor', selectedId: null, drawings: [], saveStatus: 'loading' }

  /** Mutable per-frame environment; its closures stay stable across frames. */
  readonly env: ViewEnv = {
    bars: emptyBars(),
    minMove: 0.01,
    paneWidth: 0,
    paneHeight: 0,
    timeToX: (time) => {
      const logical = timeToLogical(this.env.bars, time)
      if (logical === null || !this.chart) return null
      // logicalToCoordinate only accepts whole indexes (fractions return 0), so
      // interpolate between neighbouring bars for times drawn on finer timeframes.
      const timeScale = this.chart.timeScale()
      const base = Math.floor(logical)
      const left = timeScale.logicalToCoordinate(base as Logical)
      const right = timeScale.logicalToCoordinate((base + 1) as Logical)
      return left === null || right === null ? null : left + (right - left) * (logical - base)
    },
    xToLogical: (x) => this.chart?.timeScale().coordinateToLogical(x) ?? null,
    timeToLogical: (time) => timeToLogical(this.env.bars, time),
    logicalToTime: (logical) => logicalToTime(this.env.bars, logical),
    priceToY: (price) => this.series?.priceToCoordinate(price) ?? null,
    yToPrice: (y) => this.series?.coordinateToPrice(y) ?? null,
    roundPrice: (price) => Number((Math.round(price / this.env.minMove) * this.env.minMove).toFixed(this.priceDecimals)),
    formatPrice: (price) => price.toFixed(this.priceDecimals),
  }

  // ---- lifecycle -------------------------------------------------------

  attach(chart: IChartApi, series: ISeriesApi<SeriesType>) {
    this.chart = chart
    this.series = series
    const format = series.options().priceFormat
    const minMove = 'minMove' in format && format.minMove ? format.minMove : 0.01
    this.env.minMove = minMove
    this.priceDecimals = String(minMove).split('.')[1]?.length ?? 0
  }

  detach() {
    this.chart = null
    this.series = null
    this.drag = null
  }

  setRenderRequester(requestRender: (() => void) | null) {
    this.requestRender = requestRender
  }

  setBars(bars: ViewEnv['bars']) {
    this.env.bars = bars
    this.barsVersion += 1
    this.render()
  }

  get chartApi() {
    return this.chart
  }

  // ---- React subscription ---------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  onCommit(listener: (event: CommitEvent) => void) {
    this.commitListeners.add(listener)
    return () => {
      this.commitListeners.delete(listener)
    }
  }

  onEditRequest(listener: (id: string) => void) {
    this.editListeners.add(listener)
    return () => {
      this.editListeners.delete(listener)
    }
  }

  requestEdit(id: string) {
    this.editListeners.forEach((listener) => listener(id))
  }

  private emit(patch: Partial<DrawingSnapshot> = {}, listChanged = false) {
    const drawings = listChanged ? [...this.drawings.values()].map(summarize) : this.snapshot.drawings
    this.snapshot = { ...this.snapshot, ...patch, drawings }
    this.listeners.forEach((listener) => listener())
  }

  setSaveStatus(saveStatus: SaveStatus) {
    if (saveStatus !== this.snapshot.saveStatus) this.emit({ saveStatus })
  }

  // ---- state -------------------------------------------------------------

  get(id: string) {
    return this.drawings.get(id)
  }

  get activeTool() {
    return this.snapshot.activeTool
  }

  get selectedId() {
    return this.snapshot.selectedId
  }

  setTool(activeTool: ToolMode) {
    if (activeTool !== this.snapshot.activeTool) this.emit({ activeTool })
  }

  select(selectedId: string | null) {
    if (selectedId === this.snapshot.selectedId) return
    // Selected drawings render last so their handles sit on top.
    if (selectedId) this.raise(selectedId)
    this.emit({ selectedId })
    this.render()
  }

  /** Adds server drawings without overwriting newer local ones. */
  load(drawings: Drawing[]) {
    for (const drawing of drawings) {
      const local = this.drawings.get(drawing.id)
      if (!local || local.revision < drawing.revision) this.setDrawing(drawing)
    }
    this.emit({}, true)
    this.render()
  }

  /** Adopts a newer server version after a conflict. */
  applyRemote(drawing: Drawing) {
    if (!this.drawings.has(drawing.id)) return
    this.setDrawing(drawing)
    this.emit({}, true)
    this.render()
  }

  /** Applies data without saving; used for live dialog previews. */
  preview(id: string, data: Drawing['data']) {
    const drawing = this.drawings.get(id)
    if (!drawing) return
    this.setDrawing({ ...drawing, data } as Drawing)
    this.render()
  }

  /** Marks the current state of a drawing as a saved edit. */
  commit(id: string) {
    const drawing = this.drawings.get(id)
    if (!drawing) return
    const next = { ...drawing, revision: drawing.revision + 1 }
    this.setDrawing(next)
    this.emit({}, true)
    this.commitListeners.forEach((listener) => listener({ type: 'upsert', drawing: next }))
  }

  remove(id: string) {
    if (!this.drawings.delete(id)) return
    this.versions.delete(id)
    this.geometries.delete(id)
    this.positionCache.delete(id)
    if (this.drag?.id === id) this.drag = null
    this.emit({ selectedId: this.snapshot.selectedId === id ? null : this.snapshot.selectedId }, true)
    this.render()
    this.commitListeners.forEach((listener) => listener({ type: 'delete', id }))
  }

  removeAll() {
    for (const id of [...this.drawings.keys()]) this.remove(id)
  }

  private setDrawing(drawing: Drawing) {
    this.drawings.set(drawing.id, drawing)
    this.versions.set(drawing.id, (this.versions.get(drawing.id) ?? 0) + 1)
  }

  private raise(id: string) {
    const drawing = this.drawings.get(id)
    if (!drawing) return
    this.drawings.delete(id)
    this.drawings.set(id, drawing)
  }

  // ---- creation and dragging (pane coordinates) -------------------------

  /** Creates a drawing for the active tool at a pane point; returns its id. */
  createAt(x: number, y: number): string | null {
    const tool = this.snapshot.activeTool
    if (tool === 'cursor' || this.env.bars.times.length === 0) return null
    const id = crypto.randomUUID()
    let drawing: Drawing | null = null
    if (tool === 'marker') {
      const data = createMarker(x, this.env)
      if (data) drawing = { id, tool, revision: 0, data }
    } else {
      // New positions reuse the most recent position's account and style, as TradingView does.
      const previous = [...this.drawings.values()].reverse().find(isPosition)
      const data = createPosition(tool, x, y, this.env, previous?.data.account ?? DEFAULT_ACCOUNT, previous?.data.style ?? DEFAULT_POSITION_STYLE)
      if (data) drawing = { id, tool, revision: 0, data }
    }
    if (!drawing) return null
    this.setDrawing(drawing)
    this.emit({ activeTool: 'cursor', selectedId: id }, true)
    this.commit(id)
    this.render()
    return id
  }

  beginDrag(hit: HitResult, x: number, y: number): boolean {
    const drawing = this.drawings.get(hit.id)
    const logical = this.env.xToLogical(x)
    const price = this.env.yToPrice(y)
    if (!drawing || logical === null || price === null) return false
    this.drag = { id: hit.id, part: hit.part, from: { logical, price }, original: drawing.data, moved: false }
    return true
  }

  dragTo(x: number, y: number) {
    const drag = this.drag
    const drawing = drag && this.drawings.get(drag.id)
    const logical = this.env.xToLogical(x)
    const price = this.env.yToPrice(y)
    if (!drag || !drawing || logical === null || price === null) return
    const to = { logical, price }
    const data = isPosition(drawing)
      ? dragPosition(drawing.tool, drag.original as PositionDrawing['data'], drag.part, drag.from, to, this.env)
      : dragMarker(drag.original as typeof drawing.data, drag.from.logical, logical, this.env)
    if (JSON.stringify(data) === JSON.stringify(drawing.data)) return
    drag.moved = true
    this.setDrawing({ ...drawing, data } as Drawing)
    this.render()
  }

  endDrag() {
    const drag = this.drag
    this.drag = null
    if (drag?.moved) this.commit(drag.id)
  }

  get isDragging() {
    return this.drag !== null
  }

  // ---- frame work -------------------------------------------------------

  render() {
    this.requestRender?.()
  }

  /** Called by the primitive once per chart update, before drawing and hit tests. */
  updateGeometry() {
    if (!this.chart) return
    this.env.paneWidth = this.chart.timeScale().width()
    this.env.paneHeight = this.chart.paneSize(0).height
    this.geometries.clear()
    for (const drawing of this.drawings.values()) {
      const geometry = isPosition(drawing) ? positionGeometry(drawing, this.env) : markerGeometry(drawing, this.env)
      if (geometry) this.geometries.set(drawing.id, geometry)
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const drawing of this.drawings.values()) {
      const geometry = this.geometries.get(drawing.id)
      if (!geometry) continue
      const selected = drawing.id === this.snapshot.selectedId
      if (isPosition(drawing)) {
        const { stats, outcome } = this.positionResult(drawing)
        drawPosition(ctx, drawing, geometry as PositionGeometry, this.env, stats, outcome, selected)
      } else {
        drawMarker(ctx, drawing, geometry as MarkerGeometry, selected)
      }
    }
  }

  /** Topmost hit first; the selected drawing wins so its handles stay reachable. */
  hitTest(x: number, y: number): HitResult | null {
    const selectedId = this.snapshot.selectedId
    const ordered = [...this.drawings.values()].reverse()
    for (const drawing of ordered) {
      const geometry = this.geometries.get(drawing.id)
      if (!geometry) continue
      const selected = drawing.id === selectedId
      const hit = isPosition(drawing)
        ? hitPosition(geometry as PositionGeometry, x, y, selected)
        : hitMarker(geometry as MarkerGeometry, x, y, selected)
      if (hit) return { id: drawing.id, ...hit }
    }
    return null
  }

  axisLabels(): AxisLabel[] {
    const selected = this.snapshot.selectedId ? this.drawings.get(this.snapshot.selectedId) : undefined
    return selected && isPosition(selected) ? positionAxisLabels(selected, this.env) : []
  }

  /** Stats and outcome are cached per drawing edit and candle load, not recomputed per frame. */
  positionResult(drawing: PositionDrawing) {
    const version = this.versions.get(drawing.id) ?? 0
    const cached = this.positionCache.get(drawing.id)
    if (cached && cached.version === version && cached.barsVersion === this.barsVersion) return cached.value
    const stats = positionStats(drawing.data, this.env.minMove)
    const value = { stats, outcome: positionOutcome(drawing.tool, drawing.data, this.env.bars, stats) }
    this.positionCache.set(drawing.id, { version, barsVersion: this.barsVersion, value })
    return value
  }
}

function summarize(drawing: Drawing): DrawingSummary {
  return { id: drawing.id, tool: drawing.tool, time: isPosition(drawing) ? drawing.data.entry.time : drawing.data.time }
}
