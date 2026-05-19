// Minimal GoStop lottery config for the nasun-website summary card.
//
// GoStop maintains its own devnet-ids.json (apps/gostop/devnet-ids.json)
// separate from @nasun/devnet-config, since the on-chain packages are
// versioned independently and the bankroll/lottery/scratchcard set is not
// part of the shared cross-app infra (deepbook, tokens). We re-derive the
// single constant we need here so this file does not pull in gostop's
// full config surface across a workspace boundary.
//
// originalPackageId is what we key off — Move struct types survive upgrades
// only when addressed by the package's first published ID. Sync if gostop
// republishes the lottery package (fresh publish, not in-place upgrade).
// Source of truth: apps/gostop/devnet-ids.json `lottery.originalPackageId`.

const GOSTOP_LOTTERY_ORIGINAL_PACKAGE_ID =
  "0xc0be188b342c4ee7c6cb3cef351a800b1b549cac75311a3d9a80a0a3f54634a3";

export const GOSTOP_LOTTERY_TICKET_TYPE = `${GOSTOP_LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::Ticket`;

export const GOSTOP_LOTTERY_ROUND_CREATED_EVENT_TYPE = `${GOSTOP_LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::RoundCreated`;

export const GOSTOP_URL = "https://gostop.app";
