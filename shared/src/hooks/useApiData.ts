// ============================================================
// @tenpos/shared — useApiData hook
// Generic data-fetching hook. Works in React (web) and
// React Native (mobile) — no platform-specific code.
// ============================================================

import { useState, useEffect, useRef } from 'react'

export interface UseApiDataResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Generic async data fetching hook with loading/error state
 * and a refetch trigger.
 *
 * @example
 * const { data, loading, error, refetch } = useApiData(
 *   () => fetchProducts(),
 *   [branchId]
 * )
 */
export function useApiData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): UseApiDataResult<T> {
  const [data,    setData]    = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tick,    setTick]    = useState(0)

  // Keep a stable ref so the effect doesn't re-run if the caller
  // passes an inline arrow function.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetcherRef.current()
      .then((r) => {
        if (!cancelled) { setData(r); setLoading(false) }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, refetch: () => setTick((t) => t + 1) }
}
