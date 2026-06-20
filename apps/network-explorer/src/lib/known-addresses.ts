// Known address labels for Nasun Explorer
// System addresses (permanent — Sui protocol):
//   0x1, 0x2, 0x3, 0x5, 0x6, 0x403 never change across resets.
// Devnet-specific addresses: update after each devnet reset (sync with devnet-ids.json).

export const KNOWN_ADDRESSES: Record<string, string> = {
  // Nasun system packages (permanent)
  '0x0000000000000000000000000000000000000000000000000000000000000001': 'Move Stdlib',
  '0x0000000000000000000000000000000000000000000000000000000000000002': 'Nasun Framework',
  '0x0000000000000000000000000000000000000000000000000000000000000003': 'Nasun System',
  // Nasun shared objects (permanent)
  '0x0000000000000000000000000000000000000000000000000000000000000005': 'NasunSystem',
  '0x0000000000000000000000000000000000000000000000000000000000000006': 'Clock',
  '0x0000000000000000000000000000000000000000000000000000000000000403': 'Random',
  // Nasun Devnet v8 fresh genesis (69cd1d45). Synced 2026-06-19.
  '0x98f5339a8d5c6ba1c1478d8b405711c816e13250553a2c20ec8b839abf454a6c': 'Admin',
  '0x336c5db9b9aef143feddb1376c4a7f2a6dc10dabdf6185947f3ac48ddadaf6ff': 'Token Faucet',
  // v8: NETH + NSOL consolidated, one faucet_v2 object mints both.
  '0xf6ff5936a307f0c02e7a812c03a17a3ce95e7252a00ec27a809ead96641fcb36': 'Token Faucet V2 (NETH + NSOL)',
  '0x2e368f28f15c35a1be424da5974481eb0e8d6b8fa51b5ad38da31cd023a2ab61': 'Governance Dashboard',
  '0xd1f79b00a86ac2f767a47fff88bd5c81597a557e19d645f7f93cf4ce7bce8f76': 'DeepBook Registry',
  '0x8c40955ec42b1119614812fb01cd69f4df2f633ea41891fefb1abc129fcbf0d2': 'Lottery Registry',
  '0x5fce00b3db60c0da2595afc374bd0bce30d16257c4894fbffbba444ca11c803c': 'Alliance Registry',
  // Deferred in v8 (not yet deployed): Baram/Executor/AER/Attestation/Oracle
  // registries, Lending Pool, Margin Registry. Prediction has no shared State
  // object in v8 (markets are standalone). Re-add labels when those deploy.
};
