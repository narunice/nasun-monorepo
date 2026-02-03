# Changelog

## 0.1.0

Initial release.

- `BaramClient` high-level SDK client with `execute()`, `cancel()`, `getExecutors()`, `getECR()`, `getBalance()`
- Devnet preset via `createDevnetConfig()`
- Custom error classes: `BaramError`, `InsufficientBalanceError`, `NoCoinsError`, `NoExecutorError`, `ExecutorApiError`, `TransactionError`, `TimeoutError`
- Configurable executor timeout, ECR poll interval, and poll retries
- Weighted random executor selection with tier filtering
- Low-level service functions exported for advanced use
- ESM + CJS dual build via tsup
