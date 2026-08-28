/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the probe server origin, e.g. VITE_PROBE_ORIGIN=http://127.0.0.1:9000 */
  readonly VITE_PROBE_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
