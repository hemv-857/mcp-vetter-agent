import type { ReactNode } from "react";

/**
 * One 24px stroke grid for the console's chrome — the counts on the record and
 * the two page controls. The seven audit stages are NOT here: they share one
 * table with the graph that draws them (`STAGE_GLYPH`), so a stage cannot end
 * up wearing two different icons on the same page.
 */
const PATHS = {
  alert: (
    <>
      <path d="M10.3 3.9 2.5 17.4a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.4v4.2M12 17.4h.01" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.8L14 2.8Z" />
      <path d="M13.6 2.9V8h5M8.6 13h6.8M8.6 16.6h4.4" />
    </>
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
