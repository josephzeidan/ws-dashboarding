// Boots the background poller when the Next.js server process starts, so live
// sync runs even before the first browser tab opens the SSE stream.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPoller } = await import('@/lib/live/poller')
    startPoller()
  }
}
