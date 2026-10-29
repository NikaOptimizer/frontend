import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

import type { DrawingController } from '../core/drawing-controller'
import { isLong, positionStats, validatePosition } from '../tools/position'
import { formatNumber } from '../tools/canvas'
import type { Drawing, MarkerDrawing, PositionData, PositionDrawing } from '../types'
import { TOOL_LABELS } from './tool-icons'

/** Opens on double-click or the toolbar gear. Changes preview live; Cancel restores the original. */
export function DrawingSettingsDialog({ controller }: { controller: DrawingController }) {
  const [editing, setEditing] = useState<Drawing | null>(null)

  useEffect(() => controller.onEditRequest((id) => setEditing(controller.get(id) ?? null)), [controller])

  if (!editing) return null
  const close = () => setEditing(null)
  return editing.tool === 'marker'
    ? <MarkerSettings key={editing.id} controller={controller} drawing={editing} onClose={close} />
    : <PositionSettings key={editing.id} controller={controller} drawing={editing} onClose={close} />
}

type SettingsProps<T> = { controller: DrawingController; drawing: T; onClose: () => void }

function SettingsDialog({ title, error, onApply, onCancel, children }: {
  title: string
  error: string | null
  onApply: () => void
  onCancel: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement | null>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="drawing-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          if (!error) onApply()
        }}
      >
        <header className="drawing-dialog-header">
          <h2>{title}</h2>
          <button type="button" aria-label="Close" onClick={onCancel}>
            <X size={16} />
          </button>
        </header>
        <div className="drawing-dialog-body">{children}</div>
        {error && <p className="drawing-dialog-error" role="alert">{error}</p>}
        <footer className="drawing-dialog-footer">
          <button type="button" className="drawing-dialog-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="drawing-dialog-primary" disabled={Boolean(error)}>Ok</button>
        </footer>
      </form>
    </dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="drawing-dialog-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

type PositionForm = {
  size: string
  lotSize: string
  risk: string
  riskMode: PositionData['account']['risk_mode']
  entry: string
  target: string
  stop: string
  style: PositionData['style']
}

function toForm(data: PositionData): PositionForm {
  return {
    size: String(data.account.size),
    lotSize: String(data.account.lot_size),
    risk: String(data.account.risk),
    riskMode: data.account.risk_mode,
    entry: String(data.entry.price),
    target: String(data.target_price),
    stop: String(data.stop_price),
    style: data.style,
  }
}

function fromForm(form: PositionForm, original: PositionData): PositionData {
  return {
    ...original,
    entry: { ...original.entry, price: Number(form.entry) },
    target_price: Number(form.target),
    stop_price: Number(form.stop),
    account: { size: Number(form.size), lot_size: Number(form.lotSize), risk: Number(form.risk), risk_mode: form.riskMode },
    style: form.style,
  }
}

function PositionSettings({ controller, drawing, onClose }: SettingsProps<PositionDrawing>) {
  const [original] = useState(drawing.data)
  const [form, setForm] = useState(() => toForm(drawing.data))
  const [tab, setTab] = useState<'inputs' | 'style'>('inputs')
  const { env } = controller
  const candidate = fromForm(form, original)
  const error = validatePosition(drawing.tool, candidate)
  const stats = positionStats(candidate, env.minMove)
  const direction = isLong(drawing.tool) ? 1 : -1

  function update(patch: Partial<PositionForm>) {
    const next = { ...form, ...patch }
    setForm(next)
    const data = fromForm(next, original)
    if (!validatePosition(drawing.tool, data)) controller.preview(drawing.id, data)
  }

  /** Ticks are a view of the price distance from entry; editing them rewrites the price. */
  function ticksToPrice(ticks: string, sign: number) {
    const value = Number(ticks)
    return Number.isFinite(value) ? String(env.roundPrice(Number(form.entry) + sign * value * env.minMove)) : form.entry
  }

  function cancel() {
    controller.preview(drawing.id, original)
    onClose()
  }

  function apply() {
    controller.preview(drawing.id, candidate)
    if (JSON.stringify(candidate) !== JSON.stringify(original)) controller.commit(drawing.id)
    onClose()
  }

  return (
    <SettingsDialog title={TOOL_LABELS[drawing.tool]} error={error} onApply={apply} onCancel={cancel}>
      <div className="drawing-dialog-tabs" role="tablist">
        {(['inputs', 'style'] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>
            {item === 'inputs' ? 'Inputs' : 'Style'}
          </button>
        ))}
      </div>

      {tab === 'inputs' ? (
        <div className="drawing-dialog-grid">
          <Field label="Account size">
            <input type="number" min="0" step="any" value={form.size} onChange={(event) => update({ size: event.target.value })} />
          </Field>
          <Field label="Lot size">
            <input type="number" min="0" step="any" value={form.lotSize} onChange={(event) => update({ lotSize: event.target.value })} />
          </Field>
          <Field label="Risk">
            <div className="drawing-dialog-inline">
              <input type="number" min="0" step="any" value={form.risk} onChange={(event) => update({ risk: event.target.value })} />
              <select value={form.riskMode} onChange={(event) => update({ riskMode: event.target.value as PositionForm['riskMode'] })}>
                <option value="percent">%</option>
                <option value="amount">Amount</option>
              </select>
            </div>
          </Field>
          <Field label="Entry price">
            <input type="number" step={env.minMove} value={form.entry} onChange={(event) => update({ entry: event.target.value })} />
          </Field>
          <Field label="Profit level">
            <div className="drawing-dialog-inline">
              <input type="number" step={env.minMove} aria-label="Target price" value={form.target} onChange={(event) => update({ target: event.target.value })} />
              <input type="number" min="0" step="1" aria-label="Target ticks" value={stats.targetTicks} onChange={(event) => update({ target: ticksToPrice(event.target.value, direction) })} />
            </div>
          </Field>
          <Field label="Stop level">
            <div className="drawing-dialog-inline">
              <input type="number" step={env.minMove} aria-label="Stop price" value={form.stop} onChange={(event) => update({ stop: event.target.value })} />
              <input type="number" min="0" step="1" aria-label="Stop ticks" value={stats.stopTicks} onChange={(event) => update({ stop: ticksToPrice(event.target.value, -direction) })} />
            </div>
          </Field>
          <p className="drawing-dialog-summary">
            Qty {formatNumber(stats.quantity, 3)} · Risk {formatNumber(stats.riskAmount)} · R:R {formatNumber(stats.rewardRisk)}
          </p>
        </div>
      ) : (
        <div className="drawing-dialog-grid">
          {([['line_color', 'Lines'], ['profit_color', 'Profit background'], ['stop_color', 'Stop background']] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <input type="color" value={form.style[key].slice(0, 7)} onChange={(event) => update({ style: { ...form.style, [key]: event.target.value } })} />
            </Field>
          ))}
        </div>
      )}
    </SettingsDialog>
  )
}

function MarkerSettings({ controller, drawing, onClose }: SettingsProps<MarkerDrawing>) {
  const [original] = useState(drawing.data)
  const [label, setLabel] = useState(drawing.data.label)
  const [color, setColor] = useState(drawing.data.color)
  const error = label.trim() && label.trim().length <= 80 ? null : 'Label must be 1–80 characters.'

  function preview(nextLabel: string, nextColor: string) {
    setLabel(nextLabel)
    setColor(nextColor)
    if (nextLabel.trim()) controller.preview(drawing.id, { ...original, label: nextLabel, color: nextColor })
  }

  function cancel() {
    controller.preview(drawing.id, original)
    onClose()
  }

  function apply() {
    const data = { ...original, label: label.trim(), color }
    controller.preview(drawing.id, data)
    if (data.label !== original.label || data.color !== original.color) controller.commit(drawing.id)
    onClose()
  }

  return (
    <SettingsDialog title="Marker" error={error} onApply={apply} onCancel={cancel}>
      <div className="drawing-dialog-grid">
        <Field label="Label">
          <input value={label} maxLength={80} onChange={(event) => preview(event.target.value, color)} />
        </Field>
        <Field label="Color">
          <input type="color" value={color.slice(0, 7)} onChange={(event) => preview(label, event.target.value)} />
        </Field>
      </div>
    </SettingsDialog>
  )
}
