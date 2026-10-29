import type { ReactNode } from 'react'
import { MapPin, MousePointer2 } from 'lucide-react'

import type { ToolMode } from '../types'
import { PositionIcon } from './position-icon'

export type ToolDefinition = { mode: ToolMode; label: string; shortcut?: string; icon: ReactNode }
export type ToolGroup = { id: string; label: string; tools: ToolDefinition[] }

/** Ribbon layout; new tools are added here and in the controller's tool switch. */
export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'cursor', label: 'Cursor', tools: [{ mode: 'cursor', label: 'Cursor', shortcut: 'Esc', icon: <MousePointer2 size={18} /> }] },
  {
    id: 'forecasting',
    label: 'Forecasting',
    tools: [
      { mode: 'long_position', label: 'Long position', icon: <PositionIcon long /> },
      { mode: 'short_position', label: 'Short position', icon: <PositionIcon long={false} /> },
    ],
  },
  { id: 'annotation', label: 'Annotations', tools: [{ mode: 'marker', label: 'Marker', icon: <MapPin size={18} /> }] },
]

export const TOOL_LABELS: Record<ToolMode, string> = Object.fromEntries(
  TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => [tool.mode, tool.label])),
) as Record<ToolMode, string>
