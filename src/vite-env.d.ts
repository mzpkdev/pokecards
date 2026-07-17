/// <reference types="vite/client" />

// Typed access to the sync client's one env var. VITE_SYNC_URL points the sync client at the Worker
// origin; unset means same-origin (see src/sync/sync.ts) and "" disables sync. Optional because the
// common deployment leaves it unset.
interface ImportMetaEnv {
  readonly VITE_SYNC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
