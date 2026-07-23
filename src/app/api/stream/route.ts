import { subscribe } from '@/lib/live/broadcaster'
import { startPoller } from '@/lib/live/poller'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Server-Sent Events endpoint. Opening it also lazily boots the poller, so the
// background sync runs whenever at least one browser tab has the app open.
export async function GET(req: Request) {
  startPoller()

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeat: NodeJS.Timeout | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // controller closed
        }
      }

      send(`event: ready\ndata: {"ok":true}\n\n`)

      unsubscribe = subscribe((event) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event.payload ?? {})}\n\n`)
      })

      heartbeat = setInterval(() => send(`: heartbeat\n\n`), 25_000)

      req.signal.addEventListener('abort', () => {
        if (heartbeat) clearInterval(heartbeat)
        unsubscribe?.()
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat)
      unsubscribe?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
