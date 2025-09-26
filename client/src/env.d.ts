/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YOUTUBE_API_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}