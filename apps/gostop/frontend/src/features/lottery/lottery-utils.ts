import { LOTTERY_MAX_NUMBER, LOTTERY_NUMBERS_COUNT } from '../../lib/gostop-config'

// NOT fairness-critical: player-chosen numbers. Modulo bias (2^32 % 25) negligible.
export function autoPickNumbers(): number[] {
  const pool = Array.from({ length: LOTTERY_MAX_NUMBER }, (_, i) => i + 1)
  const picked: number[] = []
  while (picked.length < LOTTERY_NUMBERS_COUNT) {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    const idx = arr[0] % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked.sort((a, b) => a - b)
}
