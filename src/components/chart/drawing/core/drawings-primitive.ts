import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'

import type { DrawingController } from './drawing-controller'

const MAX_AXIS_LABELS = 3

class AxisLabelView implements ISeriesPrimitiveAxisView {
  y = 0
  label = ''
  color = '#000000'
  shown = false

  coordinate() {
    return this.y
  }

  text() {
    return this.label
  }

  textColor() {
    return '#ffffff'
  }

  backColor() {
    return this.color
  }

  visible() {
    return this.shown
  }
}

/**
 * A single series primitive draws every drawing in one pass and provides hit
 * testing, so the chart shows the right cursor without a separate hover scan.
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private readonly controller: DrawingController
  private readonly renderer: IPrimitivePaneRenderer
  private readonly views: readonly IPrimitivePaneView[]
  private readonly axisViews = Array.from({ length: MAX_AXIS_LABELS }, () => new AxisLabelView())

  constructor(controller: DrawingController) {
    this.controller = controller
    this.renderer = {
      draw: (target) => target.useMediaCoordinateSpace(({ context }) => controller.draw(context)),
    }
    this.views = [{ zOrder: () => 'normal', renderer: () => this.renderer }]
  }

  attached({ requestUpdate }: SeriesAttachedParameter<Time>) {
    this.controller.setRenderRequester(requestUpdate)
  }

  detached() {
    this.controller.setRenderRequester(null)
  }

  updateAllViews() {
    this.controller.updateGeometry()
    const labels = this.controller.axisLabels()
    this.axisViews.forEach((view, index) => {
      const label = labels[index]
      const y = label ? this.controller.env.priceToY(label.price) : null
      view.shown = y !== null
      if (label && y !== null) {
        view.y = y
        view.label = label.text
        view.color = label.color
      }
    })
  }

  paneViews() {
    return this.views
  }

  priceAxisViews() {
    return this.axisViews
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    // While a drawing tool is armed the chart keeps its crosshair cursor.
    if (this.controller.activeTool !== 'cursor') return null
    const hit = this.controller.hitTest(x, y)
    return hit ? { externalId: hit.id, cursorStyle: hit.cursor, zOrder: 'normal' } : null
  }
}
