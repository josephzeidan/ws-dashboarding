'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { LiveEventType } from '@/lib/live/broadcaster'

type Handler = (payload: unknown) => void

interface LiveContextValue {
  connected: boolean
  on: (type: LiveEventType, handler: Handler) => () => void
  lastEventAt: Record<string, number>
}

const LiveContext = createContext<LiveContextValue | null>(null)

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<Record<string, number>>({})
  const handlers = useRef<Map<LiveEventType, Set<Handler>>>(new Map())

  const on = useCallback((type: LiveEventType, handler: Handler) => {
    let set = handlers.current.get(type)
    if (!set) {
      set = new Set()
      handlers.current.set(type, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }, [])

  useEffect(() => {
    let es: EventSource | null = null
    let retry: NodeJS.Timeout | null = null
    let closed = false

    const eventTypes: LiveEventType[] = ['prices-updated', 'holdings-updated', 'activity', 'ws-status', 'snapshot']

    function connect() {
      es = new EventSource('/api/stream')
      es.addEventListener('ready', () => setConnected(true))
      es.onopen = () => setConnected(true)
      es.onerror = () => {
        setConnected(false)
        es?.close()
        if (!closed) retry = setTimeout(connect, 3_000)
      }
      for (const type of eventTypes) {
        es.addEventListener(type, (e) => {
          let payload: unknown = {}
          try {
            payload = JSON.parse((e as MessageEvent).data)
          } catch {
            // ignore malformed
          }
          setLastEventAt((prev) => ({ ...prev, [type]: Date.now() }))
          handlers.current.get(type)?.forEach((h) => h(payload))
        })
      }
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      es?.close()
    }
  }, [])

  return <LiveContext.Provider value={{ connected, on, lastEventAt }}>{children}</LiveContext.Provider>
}

/** Subscribe to a live event type for the lifetime of the component. */
export function useLive(type: LiveEventType, handler: Handler) {
  const ctx = useContext(LiveContext)
  const saved = useRef(handler)
  saved.current = handler
  useEffect(() => {
    if (!ctx) return
    return ctx.on(type, (payload) => saved.current(payload))
  }, [ctx, type])
}

export function useLiveStatus() {
  const ctx = useContext(LiveContext)
  return { connected: ctx?.connected ?? false, lastEventAt: ctx?.lastEventAt ?? {} }
}
