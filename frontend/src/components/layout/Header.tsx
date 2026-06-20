import { ArrowLeft } from "lucide-react";

interface Props {
  isMock: boolean | null;
  showBack: boolean;
  onBack: () => void;
}

function ZalyxLogo({ height = 32 }: { height?: number }) {
  return (
    <img
      src="/zalyx-logo.png"
      height={height}
      style={{ display: "block", width: "auto" }}
      alt="Zalyx logo"
    />
  );
}

export function Header({ isMock, showBack, onBack }: Props) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="logo">
          <ZalyxLogo height={26} />
          <div className="logo-divider" />
          <span className="logo-sub">Underwriting</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isMock !== null && (
            <span className={`api-badge ${isMock ? "api-badge-mock" : "api-badge-live"}`}>
              <span className="api-badge-dot" />
              {isMock ? "Mock mode" : "Live · Bedrock + DynamoDB"}
            </span>
          )}
          {showBack && (
            <button className="btn-secondary" onClick={onBack}>
              <ArrowLeft size={13} /> New application
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
