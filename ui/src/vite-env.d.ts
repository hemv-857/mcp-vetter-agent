/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the probe server origin, e.g. VITE_PROBE_ORIGIN=http://127.0.0.1:9000 */
  readonly VITE_PROBE_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// threejs-components ships no types. Declared narrowly — only the surface this
// codebase calls — rather than pulling `any` through the whole module.
declare module "threejs-components/build/cursors/tubes1.min.js" {
  interface TubesHandle {
    tubes: {
      setColors(colors: string[]): void;
      setLightsColors(colors: string[]): void;
    };
    dispose(): void;
  }
  export default function TubesCursor(
    canvas: HTMLCanvasElement,
    options?: {
      tubes?: {
        colors?: string[];
        lights?: { intensity?: number; colors?: string[] };
      };
    },
  ): TubesHandle;
}
