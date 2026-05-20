import { useState, useEffect, useCallback } from 'react'
import {
  startSyncLoop,
  stopSyncLoop,
  flushOfflineQueue,
  getPendingCount,
  onSyncEvent,
} from '../lib/sync'

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'pending'

export function useSyncManager() {
  const [status, setStatus] = useState<SyncStatus>(navigator.onLine ? 'online' : 'offline')
  const [pendingCount, setPendingCount] = useState(0)

  const refreshCount = useCallback(async () => {
    const n = await getPendingCount()
    setPendingCount(n)
  }, [])

  useEffect(() => {
    const updateOnlineStatus = () => {
      setStatus(navigator.onLine ? (pendingCount > 0 ? 'pending' : 'online') : 'offline')
    }

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    const unSyncStart = onSyncEvent('sync:start', () => setStatus('syncing'))
    const unSyncDone = onSyncEvent('sync:done', () => {
      setStatus('online')
      refreshCount()
    })
    const unSyncFailed = onSyncEvent('sync:failed', () => {
      setStatus(navigator.onLine ? 'pending' : 'offline')
      refreshCount()
    })
    const unQueued = onSyncEvent('offline:queued', () => {
      setStatus('pending')
      refreshCount()
    })

    startSyncLoop()
    refreshCount()

    return () => {
      stopSyncLoop()
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
      unSyncStart()
      unSyncDone()
      unSyncFailed()
      unQueued()
    }
  }, [pendingCount, refreshCount])

  const manualSync = useCallback(async () => {
    if (!navigator.onLine) return
    setStatus('syncing')
    const { synced, failed } = await flushOfflineQueue()
    setStatus(failed > 0 ? 'pending' : 'online')
    await refreshCount()
    return { synced, failed }
  }, [refreshCount])

  return { status, pendingCount, manualSync }
}
