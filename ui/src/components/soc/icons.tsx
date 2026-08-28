import type { ReactNode } from "react";

/**
 * One 24px stroke grid for the console. Only the glyphs this product actually
 * names a thing with — a stage, a severity, a count. Nothing here exists to
 * fill a navigation rail.
 */
const PATHS = {
  alert: (
    <>
      <path d="M10.3 3.9 2.5 17.4a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.4v4.2M12 17.4h.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8" r="3.4" />
      <path d="M2.8 20.2a6.9 6.9 0 0 1 13.4 0" />
      <path d="M16.4 5.1a3.4 3.4 0 0 1 0 6.4M18 14.4a6 6 0 0 1 3.4 5" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.8L14 2.8Z" />
      <path d="M13.6 2.9V8h5M8.6 13h6.8M8.6 16.6h4.4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  download: (
    <path d="M12 3.4v11.4m0 0 4.2-4.2M12 14.8l-4.2-4.2M4 16.6v2.4a1.6 1.6 0 0 0 1.6 1.6h12.8a1.6 1.6 0 0 0 1.6-1.6v-2.4" />
  ),
  external: (
    <path d="M14 3.6h6.4V10M20 4 12.4 11.6M17.4 14v5.2a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6V8.2a1.6 1.6 0 0 1 1.6-1.6H10" />
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.4 3.6v5h-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="m8.2 12.2 2.7 2.7 5.1-5.6" />
    </>
  ),
  barChart: <path d="M5.4 20.2V13M12 20.2V4.6M18.6 20.2v-4.6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.6v3M12 19.4v3M22.4 12h-3M4.6 12h-3" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2.8" y="7.4" width="18.4" height="13" rx="2" />
      <path d="M8.6 7.4V5.6a1.8 1.8 0 0 1 1.8-1.8h3.2a1.8 1.8 0 0 1 1.8 1.8v1.8" />
      <path d="M2.8 12.6h18.4" />
    </>
  ),
  /** The dynamic lane: something running, being listened to. */
  live: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M6.4 6.4a8 8 0 0 0 0 11.2M17.6 17.6a8 8 0 0 0 0-11.2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.6,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
