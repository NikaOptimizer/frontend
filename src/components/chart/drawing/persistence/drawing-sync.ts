import type { CommitEvent, DrawingController } from '../core/drawing-controller'
import { SCHEMA_VERSION, type Drawing, type DrawingScope } from '../types'

const SAVE_DEBOUNCE_MS = 400
const RETRY_START_MS = 2000
const RETRY_MAX_MS = 30000
const TOOLS = new Set(['long_position', 'short_position', 'marker'])

type ServerDrawing = Drawing & { schema_version: number }

/**
 * Persists drawings through Django. Each drawing saves independently: commits
 * are debounced, at most one request per drawing is in flight (so responses
 * cannot arrive out of order), and the server rejects stale revisions.
 */
export class DrawingSync {
  private readonly scope: DrawingScope
  private readonly controller: DrawingController
  private timers = new Map<string, number>()
  private inflight = new Map<string, Promise<void>>()
  private savedRevision = new Map<string, number>()
  private retryDelay = new Map<string, number>()
  private failed = new Set<string>()
  private deleting = new Set<string>()
  private loading = true
  private disposed = false
  private abort = new AbortController()
  private unsubscribe: () => void = () => {}

  constructor(scope: DrawingScope, controller: DrawingController) {
    this.scope = scope
    this.controller = controller
  }

  start() {
    this.unsubscribe = this.controller.onCommit(this.onCommit)
    window.addEventListener('pagehide', this.flushAll)
    void this.load()
  }

  dispose() {
    this.disposed = true
    this.flushAll()
    this.abort.abort()
    this.unsubscribe()
    window.removeEventListener('pagehide', this.flushAll)
  }

  private async load() {
    this.controller.setSaveStatus('loading')
    try {
      const params = new URLSearchParams(this.scope)
      const response = await fetch(`/api/drawings/?${params.toString()}`, { signal: this.abort.signal })
      if (!response.ok) throw new Error(`Drawing request failed with status ${response.status}`)
      const payload = (await response.json()) as { drawings?: unknown }
      const drawings = Array.isArray(payload.drawings) ? payload.drawings.filter(isServerDrawing) : []
      drawings.forEach((drawing) => this.savedRevision.set(drawing.id, drawing.revision))
      this.controller.load(drawings.map(toDrawing))
      this.loading = false
    } catch (error) {
      if (this.abort.signal.aborted) return
      console.error('Unable to load drawings', error)
      this.loading = false
      this.failed.add('load')
    }
    this.updateStatus()
  }

  private onCommit = (event: CommitEvent) => {
    if (event.type === 'upsert') {
      this.failed.delete(event.drawing.id)
      this.schedule(event.drawing.id, SAVE_DEBOUNCE_MS)
    } else {
      window.clearTimeout(this.timers.get(event.id))
      this.timers.delete(event.id)
      this.retryDelay.delete(event.id)
      this.failed.delete(event.id)
      this.deleting.add(event.id)
      void this.after(event.id, () => this.remove(event.id))
    }
    this.updateStatus()
  }

  private schedule(id: string, delay: number) {
    window.clearTimeout(this.timers.get(id))
    this.timers.set(id, window.setTimeout(() => {
      this.timers.delete(id)
      void this.after(id, () => this.save(id))
    }, delay))
  }

  /** Runs `task` once any in-flight request for the same drawing finishes. */
  private after(id: string, task: () => Promise<void>) {
    const previous = this.inflight.get(id) ?? Promise.resolve()
    const next = previous.then(task).finally(() => {
      if (this.inflight.get(id) === next) this.inflight.delete(id)
      this.updateStatus()
    })
    this.inflight.set(id, next)
    this.updateStatus()
    return next
  }

  private async save(id: string) {
    const drawing = this.controller.get(id)
    if (!drawing || (this.savedRevision.get(id) ?? 0) >= drawing.revision) return
    try {
      const response = await this.put(drawing)
      if (response.ok) {
        this.savedRevision.set(id, drawing.revision)
        this.succeeded(id)
      } else if (response.status === 409) {
        // Another tab saved a newer revision; adopt it.
        const payload = (await response.json()) as { drawing?: unknown }
        if (isServerDrawing(payload.drawing)) {
          this.savedRevision.set(id, payload.drawing.revision)
          this.controller.applyRemote(toDrawing(payload.drawing))
        }
        this.succeeded(id)
      } else if (response.status === 400) {
        console.error('Drawing rejected by the backend', id, await response.text())
        this.failed.add(id)
      } else {
        throw new Error(`Drawing save failed with status ${response.status}`)
      }
    } catch (error) {
      if (this.disposed) return
      console.warn('Drawing save failed; retrying', error)
      this.retry(id, () => this.schedule(id, 0))
    }
  }

  private async remove(id: string) {
    try {
      const response = await fetch(`/api/drawings/${id}/`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`Drawing delete failed with status ${response.status}`)
      this.savedRevision.delete(id)
      this.deleting.delete(id)
      this.succeeded(id)
    } catch (error) {
      if (this.disposed) return
      console.warn('Drawing delete failed; retrying', error)
      this.retry(id, () => void this.after(id, () => this.remove(id)))
    }
  }

  private put(drawing: Drawing, keepalive = false) {
    return fetch(`/api/drawings/${drawing.id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...this.scope, tool: drawing.tool, schema_version: SCHEMA_VERSION, revision: drawing.revision, data: drawing.data }),
      // Saves are never aborted: an unmount must not drop an edit already in flight.
      keepalive,
    })
  }

  private retry(id: string, task: () => void) {
    this.failed.add(id)
    const delay = Math.min(RETRY_MAX_MS, this.retryDelay.get(id) ?? RETRY_START_MS)
    this.retryDelay.set(id, delay * 2)
    window.clearTimeout(this.timers.get(id))
    this.timers.set(id, window.setTimeout(() => {
      this.timers.delete(id)
      task()
    }, delay))
  }

  private succeeded(id: string) {
    this.failed.delete(id)
    this.retryDelay.delete(id)
    const drawing = this.controller.get(id)
    // A newer edit may have been committed while this request was in flight.
    if (drawing && drawing.revision > (this.savedRevision.get(id) ?? 0) && !this.timers.has(id)) this.schedule(id, 0)
  }

  /** Sends pending saves and deletes immediately, surviving page unload via keepalive. */
  private flushAll = () => {
    for (const [id, timer] of this.timers) {
      window.clearTimeout(timer)
      const drawing = this.controller.get(id)
      if (drawing && (this.savedRevision.get(id) ?? 0) < drawing.revision) {
        void this.put(drawing, true).catch(() => undefined)
      } else if (!drawing && this.deleting.has(id)) {
        void fetch(`/api/drawings/${id}/`, { method: 'DELETE', keepalive: true }).catch(() => undefined)
      }
    }
    this.timers.clear()
  }

  private updateStatus() {
    if (this.disposed) return
    if (this.loading) this.controller.setSaveStatus('loading')
    else if (this.failed.size > 0) this.controller.setSaveStatus('error')
    else if (this.timers.size > 0 || this.inflight.size > 0) this.controller.setSaveStatus('saving')
    else this.controller.setSaveStatus('saved')
  }
}

function isServerDrawing(value: unknown): value is ServerDrawing {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string'
    && typeof item.tool === 'string' && TOOLS.has(item.tool)
    && item.schema_version === SCHEMA_VERSION
    && typeof item.revision === 'number'
    && typeof item.data === 'object' && item.data !== null
}

function toDrawing(drawing: ServerDrawing): Drawing {
  return { id: drawing.id, tool: drawing.tool, revision: drawing.revision, data: drawing.data } as Drawing
}
