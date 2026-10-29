import type { DrawingController } from './drawing-controller'

/**
 * Pointer and keyboard handling on top of the chart. Listeners run in the
 * capture phase on the chart container: when a press lands on a drawing (or a
 * tool is armed) the event is stopped before Lightweight Charts sees it, so the
 * chart does not pan. The chart's own mouse/touch listeners stay untouched for
 * every other press.
 */
export class DrawingInteraction {
  private readonly container: HTMLElement
  private readonly controller: DrawingController
  private blockNative = false
  private pointerId: number | null = null
  private pendingMove: { x: number; y: number } | null = null
  private frame = 0

  constructor(container: HTMLElement, controller: DrawingController) {
    this.container = container
    this.controller = controller
  }

  attach() {
    const options = { capture: true }
    this.container.addEventListener('pointerdown', this.onPointerDown, options)
    this.container.addEventListener('pointermove', this.onPointerMove, options)
    this.container.addEventListener('pointerup', this.onPointerUp, options)
    this.container.addEventListener('pointercancel', this.onPointerUp, options)
    this.container.addEventListener('dblclick', this.onDoubleClick, options)
    for (const type of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'] as const) {
      this.container.addEventListener(type, this.blockWhileDragging, { capture: true, passive: false })
    }
    window.addEventListener('keydown', this.onKeyDown)
    return () => {
      this.container.removeEventListener('pointerdown', this.onPointerDown, options)
      this.container.removeEventListener('pointermove', this.onPointerMove, options)
      this.container.removeEventListener('pointerup', this.onPointerUp, options)
      this.container.removeEventListener('pointercancel', this.onPointerUp, options)
      this.container.removeEventListener('dblclick', this.onDoubleClick, options)
      for (const type of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'] as const) {
        this.container.removeEventListener(type, this.blockWhileDragging, options)
      }
      window.removeEventListener('keydown', this.onKeyDown)
      cancelAnimationFrame(this.frame)
    }
  }

  /** Pane-relative coordinates, or null when the point is on an axis. */
  private toPane(event: MouseEvent, clampToPane = false) {
    const chart = this.controller.chartApi
    if (!chart) return null
    const rect = chart.chartElement().getBoundingClientRect()
    const x = event.clientX - rect.left - chart.priceScale('left').width()
    const y = event.clientY - rect.top
    const { paneWidth, paneHeight } = this.controller.env
    if (clampToPane) return { x, y }
    return x >= 0 && x <= paneWidth && y >= 0 && y <= paneHeight ? { x, y } : null
  }

  private consume(event: Event) {
    event.preventDefault()
    event.stopPropagation()
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const point = this.toPane(event)
    if (!point) return

    if (this.controller.activeTool !== 'cursor') {
      this.consume(event)
      this.blockNative = true
      this.controller.createAt(point.x, point.y)
      return
    }

    const hit = this.controller.hitTest(point.x, point.y)
    if (!hit) {
      this.controller.select(null)
      return
    }

    this.consume(event)
    this.blockNative = true
    this.controller.select(hit.id)
    if (this.controller.beginDrag(hit, point.x, point.y)) {
      this.pointerId = event.pointerId
      this.container.setPointerCapture(event.pointerId)
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return
    this.consume(event)
    this.pendingMove = this.toPane(event, true)
    // Coalesce pointer moves to one drag update per animation frame.
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0
        if (this.pendingMove) this.controller.dragTo(this.pendingMove.x, this.pendingMove.y)
        this.pendingMove = null
      })
    }
  }

  private onPointerUp = (event: PointerEvent) => {
    if (this.pointerId !== null && event.pointerId === this.pointerId) {
      this.consume(event)
      cancelAnimationFrame(this.frame)
      this.frame = 0
      const last = this.toPane(event, true)
      if (last) this.controller.dragTo(last.x, last.y)
      this.pendingMove = null
      this.container.releasePointerCapture(event.pointerId)
      this.pointerId = null
      this.controller.endDrag()
    }
    this.blockNative = false
  }

  private blockWhileDragging = (event: Event) => {
    if (this.blockNative) this.consume(event)
  }

  private onDoubleClick = (event: MouseEvent) => {
    const point = this.toPane(event)
    const hit = point && this.controller.hitTest(point.x, point.y)
    if (!hit) return
    this.consume(event)
    this.controller.requestEdit(hit.id)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isEditable(event.target)) return
    if (event.key === 'Escape') {
      if (this.controller.activeTool !== 'cursor') this.controller.setTool('cursor')
      else this.controller.select(null)
      return
    }
    const selectedId = this.controller.selectedId
    if (selectedId && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault()
      this.controller.remove(selectedId)
    }
  }
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('dialog[open]') !== null
}
