/** Scroll to a deep-linked element after lists finish rendering. */
export function scheduleScrollToId(id: string | null | undefined) {
  if (!id || typeof document === 'undefined') return () => {}
  const delays = [50, 180, 400, 800, 1400]
  const timers = delays.map((ms) =>
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, ms),
  )
  return () => timers.forEach((timer) => window.clearTimeout(timer))
}
