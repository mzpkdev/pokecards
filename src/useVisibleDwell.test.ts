import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVisibleDwell } from './useVisibleDwell'

// Fake IntersectionObserver (jsdom has none): records instances and lets a test
// drive intersection callbacks via `emit`.
class FakeIO {
  cb: (entries: { isIntersecting: boolean }[]) => void
  options: IntersectionObserverInit | undefined
  observed: Element[] = []
  disconnected = false
  constructor(
    cb: (entries: { isIntersecting: boolean }[]) => void,
    options?: IntersectionObserverInit,
  ) {
    this.cb = cb
    this.options = options
    instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  takeRecords() {
    return []
  }
  emit(isIntersecting: boolean) {
    this.cb([{ isIntersecting }])
  }
}
let instances: FakeIO[] = []

beforeEach(() => {
  instances = []
  vi.useFakeTimers()
  vi.stubGlobal('IntersectionObserver', FakeIO)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useVisibleDwell', () => {
  it('fires after the element is continuously visible for `ms`', () => {
    const onDwell = vi.fn()
    const { result } = renderHook(() => useVisibleDwell(onDwell, 1500))
    result.current(document.createElement('a'))
    expect(instances).toHaveLength(1)
    expect(instances[0].options).toEqual({ threshold: 0.5 })

    instances[0].emit(true) // visible → start countdown
    expect(onDwell).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1499)
    expect(onDwell).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  it('cancels if the element leaves view before `ms`', () => {
    const onDwell = vi.fn()
    const { result } = renderHook(() => useVisibleDwell(onDwell, 1500))
    result.current(document.createElement('a'))

    instances[0].emit(true)
    vi.advanceTimersByTime(1000)
    instances[0].emit(false) // scrolled away → reset
    vi.advanceTimersByTime(1000) // would have fired at 1500 had it stayed
    expect(onDwell).not.toHaveBeenCalled()
  })

  it('restarts the countdown when the element re-enters view', () => {
    const onDwell = vi.fn()
    const { result } = renderHook(() => useVisibleDwell(onDwell, 1500))
    result.current(document.createElement('a'))

    instances[0].emit(true)
    vi.advanceTimersByTime(1000)
    instances[0].emit(false) // cancel at 1000
    instances[0].emit(true) // re-enter → fresh countdown
    vi.advanceTimersByTime(1499)
    expect(onDwell).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  it('disconnects and cancels when detached (ref called with null)', () => {
    const onDwell = vi.fn()
    const { result } = renderHook(() => useVisibleDwell(onDwell, 1500))
    result.current(document.createElement('a'))
    instances[0].emit(true)

    result.current(null) // detach
    expect(instances[0].disconnected).toBe(true)
    vi.advanceTimersByTime(1500)
    expect(onDwell).not.toHaveBeenCalled()
  })
})
