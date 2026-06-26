import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProgressiveImage } from './useProgressiveImage'

// Fake Image so we control when the preload "loads": each `new Image()` is
// recorded, and a test fires its `onload` to simulate the hires decode landing.
class FakeImage {
  onload: (() => void) | null = null
  src = ''
  constructor() {
    instances.push(this)
  }
}
let instances: FakeImage[] = []

beforeEach(() => {
  instances = []
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useProgressiveImage', () => {
  it('reveals hires only once the preload has loaded', () => {
    const { result } = renderHook(() =>
      useProgressiveImage('low.png', 'high.png'),
    )
    expect(result.current.showHires).toBe(false)

    act(() => result.current.upgrade())
    // Preload kicked off for the hires URL, but it hasn't loaded yet.
    expect(instances).toHaveLength(1)
    expect(instances[0].src).toBe('high.png')
    expect(result.current.showHires).toBe(false)

    act(() => instances[0].onload?.())
    expect(result.current.showHires).toBe(true)
  })

  it('does nothing when there is no hires URL', () => {
    const { result } = renderHook(() => useProgressiveImage('low.png', undefined))
    act(() => result.current.upgrade())
    expect(instances).toHaveLength(0)
    expect(result.current.showHires).toBe(false)
  })

  it('does nothing when hires equals low-res (thumbnailUrl was a no-op)', () => {
    const { result } = renderHook(() =>
      useProgressiveImage('same.png', 'same.png'),
    )
    act(() => result.current.upgrade())
    expect(instances).toHaveLength(0)
    expect(result.current.showHires).toBe(false)
  })

  it('upgrades at most once across repeated calls', () => {
    const { result } = renderHook(() =>
      useProgressiveImage('low.png', 'high.png'),
    )
    act(() => {
      result.current.upgrade()
      result.current.upgrade()
      result.current.upgrade()
    })
    expect(instances).toHaveLength(1)
  })

  it('resets to low-res when the inputs change (tile recycled)', () => {
    const { result, rerender } = renderHook(
      ({ low, hi }) => useProgressiveImage(low, hi),
      { initialProps: { low: 'low1.png', hi: 'high1.png' } },
    )
    act(() => result.current.upgrade())
    act(() => instances[0].onload?.())
    expect(result.current.showHires).toBe(true)

    // Recycle: new card → hires hidden again, and a fresh upgrade is allowed.
    rerender({ low: 'low2.png', hi: 'high2.png' })
    expect(result.current.showHires).toBe(false)
    act(() => result.current.upgrade())
    expect(instances).toHaveLength(2)
    expect(instances[1].src).toBe('high2.png')
  })
})
