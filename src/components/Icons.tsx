import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 14,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconMark({ size = 18, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M8 0.8v14.4" />
      <path d="M8 3.2 4.6 0.9M8 5.6 4.2 3.3M8 8 4.2 5.7M8 10.4 4.2 8.1" />
      <path d="M8 3.2 11.4 0.9M8 5.6 11.8 3.3M8 8 11.8 5.7M8 10.4 11.8 8.1" />
    </Svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="1.5" width="5" height="5" />
      <rect x="9.5" y="1.5" width="5" height="3" />
      <rect x="1.5" y="9.5" width="5" height="5" />
      <rect x="9.5" y="7.5" width="5" height="7" />
    </Svg>
  );
}

export function IconSessions(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
      <rect x="1.5" y="1.5" width="13" height="13" />
    </Svg>
  );
}

export function IconPrograms(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="5.5" width="13" height="8.5" />
      <path d="M5.5 5.5V3.5h5v2" />
      <path d="M1.5 9h13" />
    </Svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5 7 9" />
      <path d="M11.5 9.5v4h-9v-9h4" />
    </Svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </Svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 3h13" />
      <path d="M4 8h8" />
      <path d="M6.5 13h3" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2v8" />
      <path d="M4.5 6.5 8 10l3.5-3.5" />
      <path d="M2 13.5h12" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4.5h10" />
      <path d="M5.5 4.5V2.5h5v2" />
      <path d="M4 4.5l.6 9h6.8l.6-9" />
      <path d="M6.5 7v4M9.5 7v4" />
    </Svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="3" width="13" height="3" />
      <path d="M2.5 6v7.5h11V6" />
      <path d="M6.5 9h3" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </Svg>
  );
}

export function IconRules(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 4.25h12M2 8h12M2 11.75h12" />
      <path d="M6 2.75v3M10.5 6.5v3M4.5 10.5v3" />
    </Svg>
  );
}

export function IconSync(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 6.5A5.5 5.5 0 0 0 3.2 4.2" />
      <path d="M3 1.8v2.8h2.8" />
      <path d="M2.5 9.5a5.5 5.5 0 0 0 10.3 2.3" />
      <path d="M13 14.2v-2.8h-2.8" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5v11M2.5 8h11" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3l10 10M13 3L3 13" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="5.5" width="8" height="8" />
      <path d="M10.5 5.5v-3h-8v8h3" />
    </Svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 4.5V13h13V4.5H7.5L6 2.5H1.5z" />
    </Svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 8.5l3.5 3.5 7.5-8" />
    </Svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </Svg>
  );
}
