// Sync manager — web is online-only; this hook is a lightweight stub.
// Offline sync belongs only in the Android APK (mobile/).

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'pending'

export function useSyncManager() {
  return {
    status: 'online' as SyncStatus,
    pendingCount: 0,
    manualSync: async () => ({ synced: 0, failed: 0 }),
  }
}
