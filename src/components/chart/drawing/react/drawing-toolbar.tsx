import { Settings2, Trash2 } from 'lucide-react'

import type { DrawingController, DrawingSnapshot } from '../core/drawing-controller'
import { TOOL_LABELS } from './tool-icons'

/** Floating toolbar for the selected drawing, like TradingView's. */
export function DrawingToolbar({ controller, snapshot }: { controller: DrawingController; snapshot: DrawingSnapshot }) {
  const selected = snapshot.drawings.find((drawing) => drawing.id === snapshot.selectedId)
  if (!selected) return null
  return (
    <div className="drawing-toolbar" role="toolbar" aria-label={`${TOOL_LABELS[selected.tool]} actions`}>
      <span className="drawing-toolbar-label">{TOOL_LABELS[selected.tool]}</span>
      <button type="button" title="Settings (double-click the drawing)" onClick={() => controller.requestEdit(selected.id)}>
        <Settings2 size={16} />
      </button>
      <button type="button" title="Remove (Delete)" onClick={() => controller.remove(selected.id)}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}
