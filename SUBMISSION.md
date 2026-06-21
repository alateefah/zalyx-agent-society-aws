# Zalyx Agent Society — Hackathon Submission

**H0: Hack the Zero Stack · Track 2: Monetizable B2B App**

---

## What we built

A five-agent underwriting system that debates every merchant financing application — built on real anonymized data from Zalyx, a Nigerian fintech platform serving 700+ merchants.

The core insight: a single LLM call makes risk decisions the same way a single analyst does — it sees what it's primed to see. Five specialized agents with different mandates, forced to challenge each other, consistently catch what one agent misses.

**AWS stack:**
- **Amazon Bedrock** (Nova Pro) — powers all five agents via the Converse API with tool use
- **Amazon DynamoDB** — stores merchant snapshots and every underwriting decision (full audit trail)
- **Vercel** — frontend deployment

---

## The problem

Zalyx offers Murabaha-compliant financing to Nigerian SME merchants. Murabaha is Islamic finance: Zalyx purchases an asset on the merchant's behalf at cost price, then sells it at a fixed sale price (cost + disclosed profit margin). No interest, no compounding, no late fees.

The underwriting challenge: the same revenue data looks different depending on what you're looking for. A school with ₦2M/month average GTV but only 7 active days in the last 30 days looks like churn to a risk model — until you understand that school term fees are collected twice a year in large batches, not daily. A single LLM call doesn't know this. A debate surfaces it.

---

## How it works

### Five agents, one pipeline

```
Stage 1+2 (parallel):
  Data Quality Agent    → validates data integrity, runs CBN compliance check via MCP
  Business Analysis     → assesses health score, calls MCP for sector benchmarks

Stage 3:
  Risk Assessment Agent → challenges Business Analyst, gets portfolio default rates via MCP

Stage 3b/3c (conditional — only fires when agents disagree):
  Business Analysis (rebuttal)  → defends or concedes
  Risk Assessment (verdict)     → issues final risk position

Stage 4 (skipped if very high risk):
  Financing Structure   → computes Murabaha terms from merchant's GTV

Stage 5:
  Human Review Agent   → synthesises full debate → approved / rejected / clarification
```

In parallel, a single-agent baseline runs the same data through one Bedrock call. The UI shows both results side by side so the difference is immediate and visible.

### Amazon Bedrock integration

All five agents use the Bedrock Converse API (`ConverseCommand`) with tool use. The client converts OpenAI-format tool schemas to Bedrock `toolSpec` format internally, so agent code is provider-agnostic:

```typescript
const response = await bedrockClient.chatWithTools(
  messages,
  [SUBMIT_RISK_VERDICT_TOOL],
  "Risk Assessment Agent"
);
// → toolCall: { name: "submit_risk_verdict", arguments: { risk_level, adjusted_risk_score, ... } }
```

Bedrock returns `stopReason: "tool_use"` with a `toolUse` block — the `input` is already-parsed JSON, no string parsing needed. Every field in the final report comes from a structured tool call argument.

### Amazon DynamoDB integration

Two tables, provisioned automatically on first boot:

- `zalyx-merchants` (partition key: `id`) — merchant snapshots, seeded from JSON on first run
- `zalyx-decisions` (partition key: `merchantId`, sort key: `requestId`) — full `UnderwritingReport` audit records

Every completed underwriting run is persisted to DynamoDB. The merchant workspace reads lightweight history summaries, while `/api/merchants/:merchantId/decisions/:requestId` retrieves one complete report with an O(1) composite-key lookup. A `decision-index` GSI supports cross-merchant outcome queries. Tables use `PAY_PER_REQUEST` billing — no capacity planning required.

### MCP integration

A dedicated MCP server (stdio transport) exposes three tools agents call during reasoning:

- `check_cbn_compliance` — blocks restricted merchants before underwriting begins
- `get_industry_benchmarks` — places this merchant vs sector peers (GTV, active days, completion rate)
- `get_sector_default_rate` — returns Zalyx's historical default rates for this sector + risk tier

### Murabaha financing logic

```
Sale price  = risk_tier_pct × avg monthly GTV  (25% low / 15% moderate / 5% high)
Cost price  = sale price × (1 − profit margin) (10% / 15% / 20% by tier)
Installment = sale price ÷ tenor months
Affordability cap: installment ≤ 20% of monthly GTV
```

A merchant doing ₦10M/month at moderate risk gets a sale price offer of ₦1.5M. Zalyx buys the asset at ₦1.27M and sells to the merchant at ₦1.5M — the ₦225k difference is Zalyx's disclosed profit, not interest.

---

## What the multi-agent approach produces differently

**ZALYX-001 (School)**
Baseline hedges with "requires clarification". The multi-agent pipeline produced a formal `DebateResolution` showing why the Business Agent defended the term-fee seasonality pattern (7 active days/month is normal for schools — fees collected twice a year), why the Risk Agent accepted it, and what disbursement conditions were negotiated. The DynamoDB-persisted `observability` object records every Bedrock call and MCP lookup. A loan officer can read the transcript and understand exactly how the decision was reached. Outcome: **approved with conditions**.

**ZALYX-002 (Natural products)**
Baseline approved at 60% confidence. The multi-agent pipeline used MCP sector benchmarks to confirm that a 72% month-over-month revenue decline and 2 active days in 30 days are below the sector floor for natural products — not a temporary dip. Flagged for clarification before funds are committed. Outcome: **requires clarification** (multi-agent more conservative than baseline).

**ZALYX-003 (Freelancer)**
Baseline approved at 55% confidence. The Risk Assessment Agent surfaced 6 structured risk factors — ₦575k uncollected receivables, 0 active days in the last 30 days, 39-day operating history, 75% receivable rate, single-month revenue window, no repeat customer base — and the Human Review Agent rejected the application. The baseline's single-call approach did not surface these factors in a structured, actionable form. Outcome: **rejected** (multi-agent reversed a high-risk approval the baseline missed).

**ZALYX-004 (Food & Beverage)**
Both approved. The multi-agent advantage here is decision quality: the single agent produces a paragraph; the multi-agent pipeline produces structured Murabaha terms, a formal debate transcript (debate fired, Risk Agent challenged the 5-month trend, Business Agent prevailed), and a DynamoDB-persisted audit trail. Outcome: **approved** — same decision, better evidence.

### Benchmark results (`benchmark/results.md`)

| Metric | Baseline | Multi-Agent |
|---|---|---|
| Merchants benchmarked | 4 | 4 |
| Decisions reversed vs baseline | — | **3/4** |
| High-risk approvals reversed | — | **2** (ZALYX-002, ZALYX-003) |
| Structured output completeness | ~40% (prose) | **100%** |
| Actionability score | — | **100/100** |
| Risk factors surfaced | unstructured prose | **16 structured items** |
| Debate round fired | N/A | **2/4** merchants |
| Bedrock calls | 1 | 5–8 (varies by stage skip + debate) |
| MCP calls | 0 | 3 |
| Avg latency | 0.5s | 5.6s |

The latency tradeoff is intentional: a high-risk approval on a ₦500k Murabaha offer that reaches disbursement exposes Zalyx to ~₦100k+ in default loss. 5.6s of structured multi-agent debate with a DynamoDB-persisted audit trail is a sound tradeoff for a regulated lending product.

---

## Technical stack

| Layer | Technology |
|---|---|
| AI | Amazon Bedrock (Nova Pro), Converse API, tool use |
| Database | Amazon DynamoDB (PAY_PER_REQUEST, two tables) |
| MCP | `@modelcontextprotocol/sdk` v1.29, stdio, 3 tools |
| Backend | Node.js, Express, TypeScript |
| Frontend | React, Vite → deployed on Vercel |
| Infrastructure | Docker, Vercel (frontend), AWS (backend) |

---

## Real-world context

This is not a demo built for the hackathon. Zalyx serves 700+ Nigerian merchants and the underwriting problem described here is real. The merchant snapshots use anonymized but real transaction data. The Murabaha structure reflects Zalyx's actual financing model. The CBN compliance requirement is a real Nigerian regulatory concern.

The agent society pattern is the right architecture for this problem because underwriting is adversarial by nature — optimists and skeptics need to argue, and the truth usually lives in the resolution of that argument.

---

## Repository

[github.com/alateefah/zalyx-agent-society-aws](https://github.com/alateefah/zalyx-agent-society-aws)
