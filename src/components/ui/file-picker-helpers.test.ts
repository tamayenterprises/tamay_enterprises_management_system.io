import { afterEach, describe, expect, it } from 'vitest'
import {
  clearNativeFilePickerFlag,
  isNativeFilePickerOpen,
  markNativeFilePickerOpen,
} from './file-picker-helpers'

afterEach(() => {
  clearNativeFilePickerFlag()
})

describe('native file picker flag', () => {
  it('clears immediately so a dialog close button can dismiss', () => {
    markNativeFilePickerOpen()
    expect(isNativeFilePickerOpen()).toBe(true)
    clearNativeFilePickerFlag()
    expect(isNativeFilePickerOpen()).toBe(false)
  })
})
