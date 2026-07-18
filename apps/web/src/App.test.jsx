import { describe, expect, it } from 'vitest'

describe('POS foundation', () => {
  it('keeps the supported sales channels explicit', () => {
    const channels = ['Dine-in', 'Takeout', 'Store delivery', 'GrabFood']
    expect(channels).toHaveLength(4)
    expect(channels).not.toContain('Foodpanda')
    expect(channels).not.toContain('GrabExpress')
  })
})
