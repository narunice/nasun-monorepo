/**
 * Reveal-hold tests.
 *
 * The wheel leaked its result through the Available figure: the balance moved
 * to the post-payout number while the wheel was still turning. Deferring the
 * post-transaction refresh was not enough, because useBalanceSync polls every
 * 15s from the app root and that poll writes here too. These cover the hold
 * that closes the window for every writer.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useBalanceStore } from './useBalanceStore'

const store = () => useBalanceStore.getState()

beforeEach(() => {
  store().reset()
})

describe('reveal hold', () => {
  it('applies balances normally when nothing is held', () => {
    store().setBalance(100n)
    expect(store().totalNusdc).toBe(100n)
    expect(store().isInitialized).toBe(true)
  })

  it('keeps the displayed balance frozen while a reveal is in flight', () => {
    store().setBalance(100n)
    store().holdForReveal()

    // This is the background poll landing mid-spin.
    store().setBalance(180n)

    expect(store().totalNusdc).toBe(100n)
  })

  it('applies the held balance once the reveal completes', () => {
    store().setBalance(100n)
    store().holdForReveal()
    store().setBalance(180n)

    store().releaseReveal()

    expect(store().totalNusdc).toBe(180n)
    expect(store().heldNusdc).toBeNull()
  })

  it('keeps the last value when several writes land during one hold', () => {
    store().setBalance(100n)
    store().holdForReveal()
    store().setBalance(150n)
    store().setBalance(180n)
    store().releaseReveal()

    expect(store().totalNusdc).toBe(180n)
  })

  it('leaves the balance untouched when a hold ends with no writes', () => {
    store().setBalance(100n)
    store().holdForReveal()
    store().releaseReveal()

    expect(store().totalNusdc).toBe(100n)
  })

  // Counted rather than boolean: two overlapping reveals must not let the first
  // release unfreeze the balance while the second is still animating.
  it('holds until every overlapping reveal has released', () => {
    store().setBalance(100n)
    store().holdForReveal()
    store().holdForReveal()
    store().setBalance(180n)

    store().releaseReveal()
    expect(store().totalNusdc).toBe(100n)

    store().releaseReveal()
    expect(store().totalNusdc).toBe(180n)
  })

  it('never drives the hold count negative', () => {
    store().releaseReveal()
    expect(store().revealHolds).toBe(0)

    store().holdForReveal()
    store().setBalance(180n)
    store().releaseReveal()
    expect(store().totalNusdc).toBe(180n)
  })

  it('marks initialized even when the first balance arrives during a hold', () => {
    store().holdForReveal()
    store().setBalance(50n)

    expect(store().isInitialized).toBe(true)
    expect(store().totalNusdc).toBe(0n)

    store().releaseReveal()
    expect(store().totalNusdc).toBe(50n)
  })

  it('drops a held balance on reset so a new session cannot inherit it', () => {
    store().setBalance(100n)
    store().holdForReveal()
    store().setBalance(180n)

    store().reset()

    expect(store().revealHolds).toBe(0)
    expect(store().heldNusdc).toBeNull()
    expect(store().totalNusdc).toBe(0n)
  })
})
