import { useEffect, useState, useSyncExternalStore } from 'react'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'

import { DrawingController } from '../core/drawing-controller'
import { DrawingsPrimitive } from '../core/drawings-primitive'
import { DrawingInteraction } from '../core/interaction'
import { DrawingSync } from '../persistence/drawing-sync'

/** One controller per workbench mount; React re-renders only on coarse snapshot changes. */
export function useDrawingController(strategy: string, provider: string, instrument: string) {
  const [controller] = useState(() => new DrawingController())
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => {
    const sync = new DrawingSync({ strategy, provider, instrument }, controller)
    sync.start()
    return () => sync.dispose()
  }, [controller, strategy, provider, instrument])

  return { controller, snapshot }
}

/** Wires the controller into a chart; call from the effect that owns the chart. */
export function attachDrawingTools(controller: DrawingController, chart: IChartApi, series: ISeriesApi<SeriesType>) {
  controller.attach(chart, series)
  const primitive = new DrawingsPrimitive(controller)
  series.attachPrimitive(primitive)
  const detachInteraction = new DrawingInteraction(chart.chartElement().parentElement ?? chart.chartElement(), controller).attach()
  return () => {
    detachInteraction()
    series.detachPrimitive(primitive)
    controller.detach()
  }
}
