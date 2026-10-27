import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'

describe('layout while menus are open', () => {
  it('keeps a stable scrollbar gutter so the sidebar does not jump', () => {
    expect(css).toContain('scrollbar-gutter: stable')
    expect(css).toContain('body[data-scroll-locked]')
  })
})
