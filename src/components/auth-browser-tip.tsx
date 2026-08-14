/** Short tip for mobile Chrome password-manager / translate quirks on auth screens. */
export function AuthBrowserTip() {
  return (
    <p className="rounded-lg border border-border bg-[#fbfcff] px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      If your browser asks to save or update the password, tap <span className="font-medium text-foreground">Save</span>
      /<span className="font-medium text-foreground">Update</span>, then use{' '}
      <span className="font-medium text-foreground">Sign in</span>. Prefer Safari or Chrome without page translate for
      the first signup if anything looks off.
    </p>
  )
}
