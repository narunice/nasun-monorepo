// Minimal Pado spot pool config for the nasun-website summary card.
//
// Pado's full pool config (apps/pado/frontend/src/config/network.ts) carries
// fees, tick/lot sizes, and on-chain caps that the dashboard does not need.
// We only need pool ID + base/quote types + decimals to issue the read-only
// devInspect query for open orders, so we re-derive a thin shape here from
// @nasun/devnet-config exports. Decimals match Pado's TOKENS table; if Pado
// ever changes them this file must follow.
//
// NASUN_NUSDC pool is intentionally omitted: devnet-config only exposes the
// three NUSDC-quoted pools that have ID exports today.

import {
  NBTC_TYPE,
  NETH_TYPE,
  NSOL_TYPE,
  NUSDC_TYPE,
  POOL_NBTC_NUSDC,
  POOL_NETH_NUSDC,
  POOL_NSOL_NUSDC,
} from "@nasun/devnet-config";

export interface PadoSpotPool {
  id: string;
  baseType: string;
  quoteType: string;
  baseDecimals: number;
  quoteDecimals: number;
}

export const PADO_SPOT_POOLS: PadoSpotPool[] = [
  {
    id: POOL_NBTC_NUSDC,
    baseType: NBTC_TYPE,
    quoteType: NUSDC_TYPE,
    baseDecimals: 8,
    quoteDecimals: 6,
  },
  {
    id: POOL_NETH_NUSDC,
    baseType: NETH_TYPE,
    quoteType: NUSDC_TYPE,
    baseDecimals: 8,
    quoteDecimals: 6,
  },
  {
    id: POOL_NSOL_NUSDC,
    baseType: NSOL_TYPE,
    quoteType: NUSDC_TYPE,
    baseDecimals: 9,
    quoteDecimals: 6,
  },
];
