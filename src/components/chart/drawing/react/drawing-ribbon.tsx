import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Cloud, CloudAlert, LoaderCircle, Trash2 } from 'lucide-react'

import type { DrawingController, DrawingSnapshot } from '../core/drawing-controller'
import type { ToolMode } from '../types'
import { TOOL_GROUPS, type ToolGroup } from './tool-icons'
import '../drawing.css'

type RibbonProps = { controller: DrawingController; snapshot: DrawingSnapshot }

export function DrawingRibbon({ controller, snapshot }: RibbonProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  // Each group button shows the tool last picked from its flyout, as in TradingView.
  const [groupChoice, setGroupChoice] = useState<Record<string, ToolMode>>({})

  function pick(group: ToolGroup, mode: ToolMode) {
    setGroupChoice((current) => ({ ...current, [group.id]: mode }))
    setOpenGroup(null)
    controller.setTool(mode === snapshot.activeTool ? 'cursor' : mode)
  }

  function removeAll() {
    if (snapshot.drawings.length && window.confirm(`Remove all ${snapshot.drawings.length} drawings on this chart?`)) {
      controller.removeAll()
    }
  }

  return (
    <nav className="drawing-ribbon" aria-label="Drawing tools">
      {TOOL_GROUPS.map((group) => {
        const current = group.tools.find((tool) => tool.mode === (groupChoice[group.id] ?? snapshot.activeTool)) ?? group.tools[0]
        const active = group.tools.some((tool) => tool.mode === snapshot.activeTool)
        return (
          <div key={group.id} className="drawing-ribbon-group">
            <button
              type="button"
              className="drawing-ribbon-button"
              data-active={active || undefined}
              aria-pressed={active}
              title={current.shortcut ? `${current.label} (${current.shortcut})` : current.label}
              onClick={() => pick(group, current.mode)}
            >
              {current.icon}
            </button>
            {group.tools.length > 1 && (
              <button
                type="button"
                className="drawing-ribbon-flyout-toggle"
                aria-label={`More ${group.label.toLowerCase()} tools`}
                aria-expanded={openGroup === group.id}
                onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              >
                <ChevronRight size={10} />
              </button>
            )}
            {openGroup === group.id && <Flyout group={group} activeTool={snapshot.activeTool} onPick={(mode) => pick(group, mode)} onClose={() => setOpenGroup(null)} />}
          </div>
        )
      })}

      <div className="drawing-ribbon-separator" />
      <button type="button" className="drawing-ribbon-button" title="Remove all drawings" disabled={!snapshot.drawings.length} onClick={removeAll}>
        <Trash2 size={18} />
      </button>
      <div className="drawing-ribbon-spacer" />
      <SaveStatus status={snapshot.saveStatus} />
    </nav>
  )
}

function Flyout({ group, activeTool, onPick, onClose }: { group: ToolGroup; activeTool: ToolMode; onPick: (mode: ToolMode) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div ref={ref} className="drawing-ribbon-flyout" role="menu" aria-label={group.label}>
      <p className="drawing-ribbon-flyout-title">{group.label}</p>
      {group.tools.map((tool) => (
        <button key={tool.mode} type="button" role="menuitem" data-active={tool.mode === activeTool || undefined} onClick={() => onPick(tool.mode)}>
          {tool.icon}
          <span>{tool.label}</span>
        </button>
      ))}
    </div>
  )
}

const STATUS = {
  loading: { icon: <LoaderCircle size={16} className="animate-spin" />, label: 'Loading drawings…' },
  saving: { icon: <LoaderCircle size={16} className="animate-spin" />, label: 'Saving drawings…' },
  saved: { icon: <Cloud size={16} />, label: 'Drawings saved' },
  error: { icon: <CloudAlert size={16} />, label: 'Some drawings could not be loaded or saved; retrying. See the console for details.' },
} as const

function SaveStatus({ status }: { status: DrawingSnapshot['saveStatus'] }) {
  const { icon, label } = STATUS[status]
  return (
    <span className="drawing-ribbon-status" data-status={status} title={label} role="status" aria-label={label}>
      {icon}
    </span>
  )
}
