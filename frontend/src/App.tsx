import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Zap, Database } from "lucide-react";
import "./App.css";

import { Header }               from "./components/layout/Header";
import { MerchantCard }         from "./components/merchant/MerchantCard";
import { MerchantSnapshot }     from "./components/merchant/MerchantSnapshot";
import { PipelineSteps }        from "./components/underwriting/PipelineSteps";
import { CustomJsonInput }      from "./components/underwriting/CustomJsonInput";
import { ProcessingView }       from "./components/processing/ProcessingView";
import { ReportView }           from "./components/report/ReportView";
import { DecisionHistoryPanel } from "./components/history/DecisionHistoryPanel";

import { useMerchants }     from "./hooks/useMerchants";
import { useUnderwriting }  from "./hooks/useUnderwriting";
import { fetchDecisionHistory } from "./utils/api";

import type { ZalyxMerchantSnapshot, UnderwritingReport } from "./types";

export default function App() {
  const { merchantId: merchantIdParam, requestId: requestIdParam } =
    useParams<{ merchantId?: string; requestId?: string }>();
  const navigate = useNavigate();

  const {
    merchants,
    selectedMerchant,
    isMock,
    selectMerchant,
    addMerchant,
    refreshIsMock,
  } = useMerchants(merchantIdParam);

  const {
    view,
    report,
    baseline,
    processingLabel,
    liveMessages,
    error,
    run,
    loadPreviousReport,
    reset,
  } = useUnderwriting();

  const [formMode, setFormMode]     = useState<"demo" | "custom">("demo");
  const [customJson, setCustomJson] = useState("");
  const [customJsonError, setCustomJsonError] = useState("");
  const [pendingCustom, setPendingCustom] = useState<ZalyxMerchantSnapshot | null>(null);

  // Deep-link: load a specific report when the URL has /reports/:requestId
  useEffect(() => {
    if (!requestIdParam || !merchantIdParam || view !== "form") return;
    fetchDecisionHistory(merchantIdParam)
      .then((entries) => {
        const entry = entries.find((e) => e.requestId === requestIdParam);
        if (entry) loadPreviousReport(entry.report);
      })
      .catch(() => undefined);
  }, [requestIdParam, merchantIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectMerchant = (merchant: ZalyxMerchantSnapshot) => {
    selectMerchant(merchant);
    navigate(`/applications/${merchant.id}`);
  };

  const handleCustomJsonChange = (raw: string, parsed: ZalyxMerchantSnapshot | null) => {
    setCustomJson(raw);
    setCustomJsonError(parsed === null && raw.trim() ? "Invalid JSON" : "");
    if (parsed) setPendingCustom(parsed);
  };

  const handleRun = async () => {
    refreshIsMock();
    const snapshot = formMode === "custom" && pendingCustom ? pendingCustom : selectedMerchant;
    const result = await run(snapshot);
    if (result) {
      addMerchant(snapshot);
      setFormMode("demo");
      setCustomJson("");
      setPendingCustom(null);
      const reqId = result.observability?.requestId;
      navigate(`/applications/${snapshot.id}${reqId ? `/reports/${reqId}` : ""}`);
    }
  };

  const handleBack = () => {
    reset();
    navigate(`/applications/${selectedMerchant.id}`);
  };

  const handleLoadPreviousReport = (previousReport: UnderwritingReport) => {
    loadPreviousReport(previousReport);
    const reqId = previousReport.observability?.requestId;
    navigate(`/applications/${selectedMerchant.id}${reqId ? `/reports/${reqId}` : ""}`);
  };

  const runDisabled = formMode === "custom" && (!!customJsonError || !customJson.trim());

  return (
    <div className="app">
      <Header isMock={isMock} showBack={view === "report"} onBack={handleBack} />

      <main className="app-main">

        {/* ── Form ─────────────────────────────────────────────────────────── */}
        {view === "form" && (
          <div className="form-container">
            <div className="page-title">New underwriting application</div>
            <div className="page-sub">
              Five agents debate every application — data quality, business health, risk, financing, and final review.
            </div>

            <PipelineSteps />

            <div className="form-card">

              {/* Merchant selector */}
              <div className="form-section">
                <div className="form-section-label">Select merchant</div>
                <div className="tab-bar">
                  <button
                    className={`tab${formMode === "demo" ? " active" : ""}`}
                    onClick={() => setFormMode("demo")}
                  >
                    Demo merchants
                  </button>
                  <button
                    className={`tab${formMode === "custom" ? " active" : ""}`}
                    onClick={() => setFormMode("custom")}
                  >
                    Custom JSON
                  </button>
                </div>

                {formMode === "demo" && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "var(--text-muted)" }}>
                      <Database size={11} color="#06b6d4" />
                      Merchants loaded from DynamoDB · {merchants.length} available
                    </div>
                    <div className="demo-grid">
                      {merchants.map((m) => (
                        <MerchantCard
                          key={m.id}
                          merchant={m}
                          selected={selectedMerchant.id === m.id}
                          onSelect={handleSelectMerchant}
                        />
                      ))}
                    </div>
                    <DecisionHistoryPanel
                      key={selectedMerchant.id}
                      merchantId={selectedMerchant.id}
                      onLoadReport={handleLoadPreviousReport}
                    />
                  </>
                )}

                {formMode === "custom" && (
                  <CustomJsonInput
                    value={customJson}
                    error={customJsonError}
                    onChange={handleCustomJsonChange}
                  />
                )}
              </div>

              {/* Merchant snapshot preview */}
              <div className="form-section">
                <div className="form-section-label">Merchant snapshot</div>
                <MerchantSnapshot
                  merchant={formMode === "custom" && pendingCustom ? pendingCustom : selectedMerchant}
                />
              </div>

              {/* Submit */}
              <div className="form-section">
                {error && <div className="alert-error">{error}</div>}
                <button className="btn-primary" onClick={handleRun} disabled={runDisabled}>
                  <Zap size={15} /> Run underwriting
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Processing ───────────────────────────────────────────────────── */}
        {view === "processing" && (
          <ProcessingView
            merchantId={selectedMerchant.id}
            label={processingLabel}
            isMock={isMock}
            liveMessages={liveMessages}
          />
        )}

        {/* ── Report ───────────────────────────────────────────────────────── */}
        {view === "report" && report && (
          <ReportView
            report={report}
            baseline={baseline}
            isMock={isMock}
            merchantId={selectedMerchant.id}
            onBack={handleBack}
          />
        )}
      </main>
    </div>
  );
}
