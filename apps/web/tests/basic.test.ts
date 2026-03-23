import { describe, it, expect } from 'vitest'

describe('Basic Test Suite', () => {
  it('should pass basic assertion', () => {
    expect(true).toBe(true)
  })

  it('should perform math correctly', () => {
    expect(2 + 2).toBe(4)
  })
})
