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
