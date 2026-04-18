/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEADERBOARD_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
