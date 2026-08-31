/**
 * Gauge panel state.
 *
 * A snapshot, a refresh flag, and which provider the detail sheet is open on.
 * Readings are never merged or patched: main sends whole snapshots, and a
 * renderer that stitched a new reading into an old snapshot would be inventing
 * a mixed-age view — exactly the thing `stale` exists to make visible.
 */
import { create } from 'zustand'
import type { ProviderId, QuotaSnapshot } from '../../shared/types/quota'

export interface GaugeState {
  snapshot: QuotaSnapshot | null
  /** True while a manual refresh is in flight. Background polls do not set it. */
  refreshing: boolean
  /** Set when the last refresh threw. Cleared by the next successful one. */
  refreshError: string | null
  /** The provider whose detail sheet is open. */
  detailId: ProviderId | null

  setSnapshot: (snapshot: QuotaSnapshot) => void
  setRefreshing: (refreshing: boolean) => void
  setRefreshError: (message: string | null) => void
  openDetail: (id: ProviderId) => void
  closeDetail: () => void
}

export const useGaugeStore = create<GaugeState>()((set) => ({
  snapshot: null,
  refreshing: false,
  refreshError: null,
  detailId: null,

  setSnapshot: (snapshot) =>
    set((state) => ({
      snapshot,
      refreshError: null,
      // A provider the user disabled between snapshots must not leave an
      // orphan sheet open over an empty row.
      detailId: snapshot.readings.some((r) => r.providerId === state.detailId)
        ? state.detailId
        : null
    })),

  setRefreshing: (refreshing) => set({ refreshing }),
  setRefreshError: (refreshError) => set({ refreshError }),
  openDetail: (detailId) => set({ detailId }),
  closeDetail: () => set({ detailId: null })
}))
