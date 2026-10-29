# frontend

React + TypeScript + Vite frontend for Nika Optimizer.

The frontend is now a client-only app at the repository root. It does not need the previous Bun/Elysia server because the Django `backend` repository is the API bridge to the Python strategy/data/backtest packages.

## Run

```bash
bun install
bun run dev
```

Default Vite URL:

```text
http://127.0.0.1:5173
```

## Build and lint

```bash
bun run build
bun run lint
```

## Backend calls

The app should call the Django backend API directly. During development, Vite can proxy API paths such as `/api/*` to the Django server if needed. The current candlestick workbench requests candles from:

```text
/api/candles/?symbol=<symbol>&timeframe=<timeframe>&strategy_id=<strategyId>
```

Until that backend endpoint exists, the chart component falls back to placeholder candles.

## Stored candle workbench

The instrument selector loads `/api/instruments/` through Django. The chart
requests `/api/candles/` with the selected instrument ID, provider, timeframe,
period and a 500-bar limit. It displays real empty/error states, never synthetic
fallback candles. Refresh instruments/candles while importing more test data.
Periods end at the latest stored candle, making historical imports visible.
Instrument UUIDs are displayed until readable symbol metadata is available.
Strategy definitions and performance metrics remain prototype placeholders.

## Debug dashboard

The header's Debug button opens a dashboard with Data Inspector. Its dataset
dropdown selects isolated source/instrument streams, including timezone-unknown
CSV staging data. Django serves `/api/debug/datasets/` and
`/api/debug/inspection/` through the existing Vite proxy. Configure an inspection
archive in the backend; missing archives produce an explicit error with retry.
See `../documentation/debug-dashboard.md` for generation, API and chart semantics.

The inspector also supports an explicitly labeled simulation-preview dataset.
Synthetic candles are purple, raw rows show their origin/model ID, and the
preview displays held-out errors against a linear interpolation baseline.
Assumed Bucharest clocks display seasonal offset labels without changing source
clock values. The known 2023 DST mismatch remains visible.
