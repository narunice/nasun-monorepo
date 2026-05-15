// Shared formatters for the Pado positions card. Both spot orders and
// prediction bets denominate notionals in NUSDC, which Pado treats as
// $1 throughout its UI; we mirror that convention here.

const NUSDC_DECIMALS = 6;

// Format a NUSDC raw bigint (6 decimals) as a short USD-style string with
// thousands separators and 2-decimal precision. Banker-style rounding to
// cents via `+ divisor/2` so display values stay stable across refetches.
export function formatNusdcAsUsd(amount: bigint): string {
  const divisor = BigInt(10 ** NUSDC_DECIMALS);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const cents = (remainder * 100n + divisor / 2n) / divisor;
  let displayWhole = whole;
  let displayCents = cents;
  if (cents >= 100n) {
    displayWhole += 1n;
    displayCents = 0n;
  }
  const centsStr = displayCents.toString().padStart(2, "0");
  const wholeStr = displayWhole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${wholeStr}.${centsStr}`;
}
