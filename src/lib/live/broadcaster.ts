// In-process pub/sub for Server-Sent Events. A globalThis singleton so it
// survives Next.js dev-server hot reloads (same trick as the prisma client).

export type LiveEventType = 'prices-updated' | 'holdings-updated' | 'activity' | 'ws-status' | 'snapshot' | 'alert'

export interface LiveEvent {
  type: LiveEventType
  payload?: unknown
}

type Subscriber = (event: LiveEvent) => void

interface BroadcasterState {
  subscribers: Set<Subscriber>
}

const g = globalThis as unknown as { __wsBroadcaster?: BroadcasterState }
const state: BroadcasterState = g.__wsBroadcaster ?? { subscribers: new Set() }
if (!g.__wsBroadcaster) g.__wsBroadcaster = state

export function subscribe(fn: Subscriber): () => void {
  state.subscribers.add(fn)
  return () => state.subscribers.delete(fn)
}

export function broadcast(type: LiveEventType, payload?: unknown): void {
  const event: LiveEvent = { type, payload }
  for (const fn of state.subscribers) {
    try {
      fn(event)
    } catch {
      // a dead subscriber must not break the others
    }
  }
}

export function subscriberCount(): number {
  return state.subscribers.size
}
