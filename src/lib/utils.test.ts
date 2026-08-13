import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('resolve conflito de classe do tailwind', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('ignora valores falsos', () => {
    expect(cn('flex', false, undefined, 'gap-2')).toBe('flex gap-2')
  })
})
