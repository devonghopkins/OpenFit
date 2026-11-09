// iOS doesn't shrink the layout when the on-screen keyboard opens, so
// bottom-anchored sheets end up hidden behind it. Track how much of the
// layout viewport the keyboard covers and expose it as --kb-inset.
export function trackKeyboardInset() {
  const vv = window.visualViewport
  if (!vv) return

  const root = document.documentElement
  let frame = 0

  const update = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      // Small differences come from pinch zoom or toolbar resizing, not a keyboard
      root.style.setProperty('--kb-inset', inset > 80 ? `${inset}px` : '0px')
    })
  }

  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()
}
