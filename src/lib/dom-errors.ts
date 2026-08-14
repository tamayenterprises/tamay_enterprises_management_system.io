/** Browser extensions (password managers, translate) often mutate the DOM mid-React update. */
export function isBrowserDomConflictError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    /removeChild|insertBefore|NotFoundError|The node (to be removed|before which the new node) is not a child/i.test(
      message,
    )
  )
}
