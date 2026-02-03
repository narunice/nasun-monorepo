# @nasun/baram-sdk

Node.js SDK for the **Baram AI Settlement Layer** on Nasun Network.

Baram provides an on-chain escrow → AI execution → settlement → compliance pipeline. This SDK gives programmatic access to the entire flow from Node.js agents, CLI tools, and backend services.

## Installation

```bash
npm install @nasun/baram-sdk @mysten/sui
```

`@mysten/sui` is a peer dependency — install it alongside the SDK.

## Quick Start

```typescript
import { BaramClient, createDevnetConfig } from '@nasun/baram-sdk';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const client = new BaramClient({
  config: createDevnetConfig(),
  signer: Ed25519Keypair.fromSecretKey(yourPrivateKey),
});

const result = await client.execute({
  prompt: 'Analyze risk factors for BTC/USD',
  model: 'llama-3.3-70b-versatile',
});

console.log(result.response);
console.log(result.ecr?.objectId); // On-chain compliance record
```

## Prerequisites

- **Node.js 20+**
- **NUSDC tokens** — Get test tokens from the [Token Faucet](https://explorer.nasun.io/devnet)
- **Ed25519 keypair** — Generate via `@mysten/sui/keypairs/ed25519`

## API Reference

### `BaramClient`

#### Constructor

```typescript
new BaramClient({
  config: createDevnetConfig(),
  signer: keypair,
  executorTimeoutMs: 30000,   // optional
  ecrPollIntervalMs: 2000,    // optional
  ecrPollRetries: 3,          // optional
});
```

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `execute(params)` | `Promise<ExecuteResult>` | Run AI inference through the full pipeline |
| `cancel(requestId)` | `Promise<string>` | Cancel a pending request, release escrow |
| `getExecutors()` | `Promise<ExecutorInfo[]>` | List active executors from on-chain registry |
| `getECR(requestId)` | `Promise<ECRData \| null>` | Fetch compliance record by request ID |
| `getBalance()` | `Promise<number>` | Get NUSDC balance (smallest units, 1e6 = 1 NUSDC) |
| `getAddress()` | `string` | Get signer wallet address |

#### `ExecuteParams`

```typescript
{
  prompt: string;        // AI prompt text
  model: string;         // Model identifier (see Models below)
  minTier?: TierLevel;   // Minimum executor tier (0-3, default: 1)
  teeRequired?: boolean; // Require TEE execution
}
```

### `createDevnetConfig()`

Returns a `BaramConfig` preset for Nasun Devnet with all contract addresses pre-configured.

For custom networks, construct `BaramConfig` manually:

```typescript
const config: BaramConfig = {
  rpcUrl: 'https://your-rpc-url',
  baram: { packageId: '0x...', registryId: '0x...' },
  executor: { packageId: '0x...', registryId: '0x...', processedRequestsId: '0x...', tierRegistryId: '0x...' },
  compliance: { packageId: '0x...', registryId: '0x...' },
  tokens: { nusdcType: '0x...::nusdc::NUSDC' },
};
```

## Models

| Model ID | Name | Price | Provider |
|----------|------|-------|----------|
| `llama-3.1-8b-instant` | Llama 3.1 8B | 0.1 NUSDC | Groq Cloud |
| `llama-3.3-70b-versatile` | Llama 3.3 70B | 0.1 NUSDC | Groq Cloud |
| `llama-3.2-3b-local` | Llama 3.2 3B | 0.1 NUSDC | TEE Enclave |

## Error Handling

All SDK errors extend `BaramError` with a `code` property for programmatic handling:

```typescript
import {
  BaramError,
  InsufficientBalanceError,
  NoCoinsError,
  NoExecutorError,
  ExecutorApiError,
  TransactionError,
  TimeoutError,
} from '@nasun/baram-sdk';

try {
  await client.execute({ prompt, model });
} catch (err) {
  if (err instanceof InsufficientBalanceError) {
    console.log(`Need ${err.required / 1e6} NUSDC, have ${err.available / 1e6}`);
  } else if (err instanceof TimeoutError) {
    console.log(`Operation timed out: ${err.code}`);
  } else if (err instanceof BaramError) {
    console.log(`Baram error [${err.code}]: ${err.message}`);
  }
}
```

| Error Class | Code | When |
|-------------|------|------|
| `InsufficientBalanceError` | `INSUFFICIENT_BALANCE` | Not enough NUSDC |
| `NoCoinsError` | `NO_COINS` | No NUSDC coins found |
| `NoExecutorError` | `NO_EXECUTOR` | No eligible executor |
| `ExecutorApiError` | `EXECUTOR_API_ERROR` | Executor HTTP error |
| `TransactionError` | `TRANSACTION_ERROR` | On-chain TX failure |
| `TimeoutError` | `TIMEOUT` | Executor API timeout |

## Low-Level API

For advanced use cases, all internal service functions are exported:

```typescript
import {
  fetchExecutors,
  selectExecutorWeightedRandom,
  calculateTierClient,
  sha256,
  hexToBytes,
  getNusdcCoins,
  buildCreateRequestTransaction,
  buildCancelRequestTransaction,
  fetchECRByRequestId,
} from '@nasun/baram-sdk';
```

## Security Considerations

- **Private keys**: Never hardcode private keys in source code. Always use environment variables or a secure key management service.
- **Non-TEE executors**: Prompts are transmitted as Base64-encoded plaintext (not encrypted). Do not send sensitive data to non-TEE executors.
- **TEE executors**: For privacy-critical prompts, use `teeRequired: true` to enforce TEE execution (AWS Nitro, Intel SGX, AMD SEV).
- **Executor URLs**: The SDK validates that executor endpoints use HTTP/HTTPS protocols. Executor URLs come from the on-chain registry.

## Network Info

| Spec | Value |
|------|-------|
| Network | Nasun Devnet |
| RPC | https://rpc.devnet.nasun.io |
| Chain ID | `12bf3808` |
| Explorer | https://explorer.nasun.io/devnet |
| Faucet | https://faucet.devnet.nasun.io |

## License

MIT
