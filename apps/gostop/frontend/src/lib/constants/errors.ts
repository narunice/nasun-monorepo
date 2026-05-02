export const GAME_ERRORS = {
  INSUFFICIENT_BALANCE: (required: string) => `Insufficient NUSDC balance (need ${required} NUSDC).`,
  WALLET_NOT_CONNECTED: 'Please connect your wallet to play.',
  MIN_BET: (min: string) => `Minimum bet is ${min} NUSDC.`,
  MAX_BET: (max: string) => `Maximum bet is ${max} NUSDC.`,
  ROUND_ENDED: 'Round ended before your action landed. Please try again.',
  TX_FAILED: 'Transaction failed. Please try again.',
} as const;
