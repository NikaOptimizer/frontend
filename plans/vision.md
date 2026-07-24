Nika Optimizer (NO) - a full pipeline for creating trading strategies.

NO is a web paltform with a Python backend.

The intended backend bridge is a Django API layer between the frontend and the existing Python repositories. Django should own web concerns such as API endpoints, auth-ready workflow metadata, validation, admin tooling, and background-job dispatch while the existing repositories keep ownership of their domain logic.

NO should facilitate an easy way to create, test and use trading strategies.

NO manages its own candlestick data from desired providers.

NO allows the addition of default and custom indicators.

NO allows auto-backtesting strategies.

NO allows manual walk-through backtested trades and changing live the rules.

NO allowws having an AI agent assisstant for a strategy that councils the user and learns the strong/weak points of the strategy.

NO allows creating a ruleset from the webapp.

NO allows applying a learning algorithm on the ruleset.

NO can show live data.

NO creates strategy reports uppon backtests.

The frontend should consume the Django API instead of calling `data-manager`, `strategist`, `fisher`, `no-calculator`, MongoDB, or other internals directly.
