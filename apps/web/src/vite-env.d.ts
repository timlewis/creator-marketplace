/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin of the application server, e.g. https://marketplace-api.fly.dev.
   * Leave unset when the API is served from the same origin as the page.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
