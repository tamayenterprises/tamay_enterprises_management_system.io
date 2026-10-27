import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import selectSource from './select.tsx?raw'
import shellSource from '../layout/app-shell.tsx?raw'

describe('layout while menus are open', () => {
  it('keeps a stable scrollbar gutter so the sidebar does not jump', () => {
    expect(css).toContain('scrollbar-gutter: stable')
    expect(css).toContain('body[data-scroll-locked]')
  })

  it('opens select menus downward and keeps the navy nav fixed', () => {
    expect(selectSource).toContain("side = 'bottom'")
    expect(selectSource).toContain('avoidCollisions = false')
    expect(shellSource).toContain('lg:pl-[240px]')
    expect(shellSource).not.toContain('lg:sticky')
  })
})
