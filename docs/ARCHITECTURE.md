# Zalyx Agent Society — Architecture

**H0: Hack the Zero Stack · Track 2: Monetizable B2B App**

See the visual diagram: [`/architecture.svg`](../architecture.svg)

---

## Overview

Zalyx Agent Society is a five-agent underwriting system that debates every merchant financing application. Built on Amazon Bedrock (Nova Pro), Amazon DynamoDB, and Vercel.

The core insight: a single LLM call makes risk decisions the same way a single analyst does — it sees what it's primed to see. Five specialized agents with different mandates, forced to challenge each other, consistently surface what one agent misses.

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI | Amazon Bedrock (amazon.nova-pro-v1:0) · Converse API · Tool Use |
| Database | Amazon DynamoDB · 2 tables · PAY_PER_REQUEST · decision-index GSI |
| MCP | @modelcontextprotocol/sdk v1.29 · stdio transport · 3 tools |
| Backend | Node.js · Express · TypeScript |
| Frontend | React + Vite → deployed on Vercel |

---

## System Flow

```
[Vercel UI]  ──SSE──▶  [Express.js API]  ──▶  [Agent Orchestrator]
 React+Vite               Node.js/TS              Parallel + Conditional

                    ┌──────────┬───────────┬──────────┬──────────┐
                    ▼          ▼           ▼          ▼          ▼
              [Data Quality] [Business] [Risk]   [Financing] [Human Rev]
              Stage 1       Stage 2    Stage 3   Stage 4     Stage 5
              (parallel)    (parallel) ↓debate?

                    ▼ MCP calls              ▼ Bedrock calls
              [MCP Server]           [Amazon Bedrock]
              3 tools                Nova Pro · Converse API · Tool Use

                                     [Amazon DynamoDB]
                                     zalyx-merchants table
                                     zalyx-decisions table + decision-index GSI
```

---

## Agent Pipeline

### Stage 1+2 — Parallel

**Data Quality Agent** (`agents/data-quality-agent.ts`)
- Validates completeness and consistency of merchant snapshot
- Detects anomalies: high receivables, edit/delete/backdate rates, batch entry patterns
- Calls MCP `check_cbn_compliance` to block restricted merchant categories
- 1 Bedrock call · position message

**Business Analysis Agent** (`agents/business-analysis-agent.ts`)
- Computes business health score (0–100) from revenue trend, active days, order completion rate
- Contextualises seasonality patterns (school term fees, market cycles)
- Calls MCP `get_industry_benchmarks` to compare merchant GTV vs sector peers
- 1 Bedrock call (initial) + 1 Bedrock call (rebuttal if debate fires)

### Stage 3 — Risk Assessment

**Risk Assessment Agent** (`agents/risk-assessment-agent.ts`)
- Directly challenges the Business Agent's position
- Flags volatility, concentration risk, receivables exposure, operating history
- Calls MCP `get_sector_default_rate` to ground risk in Zalyx's historical portfolio data
- 1 Bedrock call (challenge) + 1 Bedrock call (final verdict if debate fires)

### Stages 3b/3c — Conditional Debate (fires when health > 55 AND risk > 35)

When agents have conflicting assessments, a second exchange is forced:
- **Business Agent rebuttal**: defends or concedes the contested claims
- **Risk Agent final verdict**: accepts, maintains, or finds a compromise position
- A `DebateResolution` record and `DebateLedger` (typed claim-by-claim breakdown) are built from the exchange
- The debate outcome is the primary input to the Human Review Agent

### Stage 4 — Financing Structure (skipped if risk ≥ 80)

**Financing Structure Agent** (`agents/financing-structure-agent.ts`)
- Computes a Murabaha-compliant financing offer from the merchant's GTV
- Murabaha: Zalyx buys an asset at cost price, sells to merchant at sale price (cost + disclosed profit margin). No interest, no compounding, no late fees.
- Affordability cap: monthly installment ≤ 20% of average monthly GTV
- 1 Bedrock call

### Stage 5 — Human Review

**Human Review Agent** (`agents/human-review-agent.ts`)
- Synthesises all prior stages and the full debate transcript
- Issues final recommendation: `approved` | `rejected` | `requires-clarification`
- Specifies approval amount, disbursement conditions, terms adjustments
- 2 Bedrock calls

---

## Amazon Bedrock Integration

All agents use the Bedrock Converse API via `utils/bedrock-client.ts`:

```typescript
// Tool use — agents request structured output via tool calls
const response = await bedrockClient.chatWithTools(
  messages,
  [SUBMIT_RISK_VERDICT_TOOL],   // OpenAI-format tool schema
  "Risk Assessment Agent"
);
// → { toolCall: { name: "submit_risk_verdict", arguments: { risk_level, adjusted_risk_score, ... } } }
```

The client converts OpenAI-format tool schemas to Bedrock `toolSpec` internally:
```typescript
{ toolSpec: { name, description, inputSchema: { json: parameters } } }
```

Bedrock returns `stopReason: "tool_use"` with a `toolUse` block containing already-parsed JSON — no string parsing needed. Every structured field in the final report comes from a tool call argument.

**Per run: 8 Bedrock calls total** (varies by whether debate fires and stage 4 is skipped).

---

## Amazon DynamoDB Integration

Two tables, provisioned automatically on first boot via `utils/dynamo.ts`:

### `zalyx-merchants`
- **Partition key:** `id` (S)
- Stores `ZalyxMerchantSnapshot` objects
- Seeded from `/data/snapshots/*.json` on first boot
- Read by `GET /api/merchants` (list) and `GET /api/merchants/:id`

### `zalyx-decisions`
- **Partition key:** `merchantId` (S)
- **Sort key:** `requestId` (S)
- Stores complete `UnderwritingReport` blobs (full audit trail)
- Written after every completed underwriting run

### `decision-index` GSI
- **Hash key:** `decision` (S) — `approved` | `rejected` | `requires-clarification`
- **Range key:** `createdAt` (S)
- Enables cross-merchant queries: "show all rejections this week"
- Supports `GET /api/decisions?type=rejected` endpoint
- Added via `UpdateTableCommand` on existing tables if missing

All tables use `PAY_PER_REQUEST` billing — no capacity planning required.

---

## MCP Server

`mcp-server/` implements three tools over stdio transport:

| Tool | Purpose | Called by |
|---|---|---|
| `check_cbn_compliance` | Blocks restricted merchant categories (CBN regulation) | Data Quality Agent |
| `get_industry_benchmarks` | Merchant GTV vs sector peers | Business Analysis Agent |
| `get_sector_default_rate` | Zalyx portfolio default rates by sector + risk tier | Risk Assessment Agent |

3 MCP calls per underwriting run.

---

## Observability

Every `UnderwritingReport` includes a `RunObservability` object:

```typescript
{
  requestId: string,          // UUID for this run
  model: string,              // "amazon.nova-pro-v1:0"
  totalBedrockCalls: number,  // typically 8
  totalMcpCalls: number,      // typically 3
  agentTimings: AgentTiming[], // per-stage durationMs + call counts
  debateRoundFired: boolean,
  stage4Skipped: boolean,
}
```

A `DecisionDelta` compares the single-agent baseline decision vs the multi-agent outcome — attached to every report so the value of the debate is immediately visible.

---

## Data Model — Key Types

```typescript
ZalyxMerchantSnapshot   // Input: real merchant data from Zalyx pipeline
UnderwritingReport      // Output: full structured report (stored in DynamoDB)
  ├── DataQualityResult
  ├── BusinessAnalysisResult
  ├── RiskAssessmentResult
  ├── FinancingStructureResult (Murabaha terms)
  ├── HumanReviewResult
  ├── AgentDebateMessage[]   // Full transcript
  ├── DebateResolution       // Who prevailed and why
  ├── DebateLedger           // Typed claim-by-claim breakdown
  ├── DecisionDelta          // Baseline vs multi-agent comparison
  └── RunObservability       // Audit trail
```
