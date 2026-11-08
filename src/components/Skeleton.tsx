import { IconMark } from "./Icons";

interface BarProps {
  width: number | string;
  height?: number;
}

function Bar({ width, height = 10 }: BarProps) {
  return <span className="sk" style={{ width, height }} />;
}

/** Skeleton rows for a table that is swapping views. */
export function SkeletonRows({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <tr key={index} className="sk-tbody-row" aria-hidden="true">
          <td className="col-rank">
            <Bar width={14} />
          </td>
          <td className="col-score">
            <Bar width={86} />
          </td>
          <td>
            <div className="sk-endpoint">
              <Bar width={28} height={12} />
              <Bar width={`${44 + ((index * 13) % 32)}%`} height={11} />
            </div>
          </td>
          <td className="col-signals">
            <Bar width={126} />
          </td>
          <td className="col-depth">
            <Bar width={10} />
          </td>
        </tr>
      ))}
    </>
  );
}

/** First paint: mirrors the real shell so the app never flashes an empty frame. */
export function AppSkeleton() {
  return (
    <div
      className="app app-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Opening workspace"
    >
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <IconMark size={17} />
          </span>
          <span className="brand-text">
            <span className="brand-name">SHRIKE</span>
            <span className="brand-sub">Bounty discovery</span>
          </span>
        </div>

        <div className="sk-nav">
          {[0, 1, 2].map((index) => (
            <div className="sk-nav-row" key={index}>
              <Bar width={14} height={14} />
              <Bar width={index === 0 ? 92 : 74} />
            </div>
          ))}
        </div>

        <div className="sidebar-spacer" />

        <div className="sk-sync">
          <Bar width={64} />
          <Bar width="100%" height={8} />
          <Bar width="84%" height={8} />
          <Bar width="100%" height={26} />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <Bar width={168} height={16} />
          </div>
          <div className="topbar-right">
            <Bar width={96} height={24} />
            <Bar width={132} height={30} />
            <Bar width={124} height={30} />
          </div>
        </header>

        <div className="sk-stats">
          {[0, 1, 2, 3].map((index) => (
            <div className="sk-stat" key={index}>
              <Bar width={62} />
              <Bar width={42} height={22} />
            </div>
          ))}
        </div>

        <div className="sk-toolbar">
          <Bar width={260} height={30} />
          <Bar width={220} height={30} />
          <span className="sk-grow" />
          <Bar width={148} height={30} />
        </div>

        <div className="sk-table">
          <div className="sk-row sk-head">
            <Bar width={10} />
            <Bar width={40} />
            <Bar width="30%" />
            <Bar width={90} />
            <Bar width={16} />
          </div>
          {Array.from({ length: 13 }, (_, index) => (
            <div className="sk-row" key={index}>
              <Bar width={14} />
              <Bar width={86} />
              <Bar width={`${40 + ((index * 17) % 36)}%`} />
              <Bar width={110} />
              <Bar width={10} />
            </div>
          ))}
        </div>

        <div className="sk-status">
          <span className="sk-status-dot" />
          <span>Opening workspace · reading bounty cache and saved views</span>
        </div>
      </div>
    </div>
  );
}
