/**
 * Shelf panel state.
 *
 * Only what is genuinely panel-wide lives here: the item list main owns, the
 * search query, the multi-select set and which item the preview sheet is
 * showing. Everything else — hover, focus, transient button state — stays
 * local to the component that owns it, because putting it in a store makes
 * every card re-render when one of them is hovered.
 *
 * The items array is replaced wholesale, never mutated. Main is the source of
 * truth: every mutating IPC call returns the new list, and `shelf:items`
 * pushes it when the clipboard changes underneath us. The renderer never
 * predicts what the list will become.
 */
import { create } from 'zustand'
import type { ClipboardItem } from '../../shared/types/clipboard'

export interface ShelfState {
  items: ClipboardItem[]
  query: string
  /** Multi-select mode. Entered by the toolbar, or by selecting a first item. */
  selecting: boolean
  /** Ids, in the order the user picked them. */
  selection: string[]
  /** The item the preview sheet is showing, or null when it is closed. */
  previewId: string | null
  /** Which stack member is being previewed, or null for the item itself. */
  previewMemberIndex: number | null

  setItems: (items: ClipboardItem[]) => void
  setQuery: (query: string) => void
  toggleSelection: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  setSelecting: (selecting: boolean) => void
  openPreview: (id: string, memberIndex?: number | null) => void
  closePreview: () => void
}

export const useShelfStore = create<ShelfState>()((set) => ({
  items: [],
  query: '',
  selecting: false,
  selection: [],
  previewId: null,
  previewMemberIndex: null,

  setItems: (items) =>
    set((state) => {
      // Deleted items must not linger in the selection or the sheet: an id
      // that no longer exists would send a delete for something main has
      // already dropped, and the sheet would render a blank panel.
      const live = new Set(items.map((item) => item.id))
      const selection = state.selection.filter((id) => live.has(id))
      const previewId = state.previewId && live.has(state.previewId) ? state.previewId : null
      return {
        items,
        selection,
        previewId,
        previewMemberIndex: previewId ? state.previewMemberIndex : null,
        selecting: state.selecting && selection.length > 0 ? state.selecting : state.selecting
      }
    }),

  setQuery: (query) => set({ query }),

  toggleSelection: (id) =>
    set((state) => {
      const has = state.selection.includes(id)
      const selection = has
        ? state.selection.filter((other) => other !== id)
        : [...state.selection, id]
      // Selecting the first item turns the mode on; deselecting the last does
      // not turn it off, or a mis-click would exit the mode mid-task.
      return { selection, selecting: state.selecting || selection.length > 0 }
    }),

  selectAll: (ids) => set({ selection: ids, selecting: true }),

  clearSelection: () => set({ selection: [], selecting: false }),

  setSelecting: (selecting) => set(selecting ? { selecting } : { selecting, selection: [] }),

  openPreview: (id, memberIndex = null) =>
    set({ previewId: id, previewMemberIndex: memberIndex }),

  closePreview: () => set({ previewId: null, previewMemberIndex: null })
}))
