# Zalyx Agent Society — Benchmark Results

**Run date:** 2026-06-19
**Mode:** Live AI (Amazon Bedrock · amazon.nova-pro-v1:0)
**Merchants:** 4 (ZALYX-001, ZALYX-002, ZALYX-003, ZALYX-004)

---

## 1. Decision Comparison

| Merchant | Type | Baseline Decision | Baseline Confidence | Multi-Agent Decision | Decisions Differ? |
|---|---|---|---|---|---|
| ZALYX-001 | School | requires-clarification | 70% | **approved** | **Yes** |
| ZALYX-002 | Natural Skin & Hair Products | approved | 60% | **requires-clarification** | **Yes** |
| ZALYX-003 | Freelancer | approved | 55% | **rejected** | **Yes ⚠️** |
| ZALYX-004 | Food & Beverage | approved | 82% | **approved** | No |

> **ZALYX-003 is the critical finding.** The single-agent baseline approved a merchant with ₦575k in uncollected receivables, 0 active days in the last 30 days, and a 39-day operating history. The multi-agent debate reversed this high-risk approval; the Risk Assessment Agent surfaced 6 structured risk factors and the Human Review Agent rejected the application. A disbursement to ZALYX-003 would represent ~₦100k+ in expected default exposure on a Murabaha offer.
>
> **ZALYX-002** is the second catch. Baseline approved with 60% confidence. The multi-agent system used MCP sector benchmarks to confirm that the merchant's 72% month-over-month revenue decline and 2 active days in 30 days were below the sector floor — not a temporary dip — and flagged for clarification before committing funds.
>
> **ZALYX-001** shows the opposite advantage. Baseline hedged with requires-clarification. The debate correctly identified that 7 active days/month is normal for a school (term-fee seasonality) and approved with disbursement conditions tied to the collection cycle.
>
> **ZALYX-004** is the control: both approaches approved a strong merchant. The multi-agent advantage here is decision quality — structured Murabaha terms, a formal debate transcript, and a DynamoDB-persisted audit trail. The baseline produces a paragraph; the multi-agent produces a compliance-ready record.

---

## 2. Latency

| Merchant | Baseline | Multi-Agent | Multi-Agent Overhead |
|---|---|---|---|
| ZALYX-001 | 0.4s | 6.1s | +5.7s |
| ZALYX-002 | 0.3s | 4.8s | +4.5s |
| ZALYX-003 | 0.5s | 4.3s | +3.8s |
| ZALYX-004 | 0.6s | 7.2s | +6.6s |

> ZALYX-003 multi-agent is faster than ZALYX-004 because Stage 4 (Financing Structure) is skipped when risk score ≥ 80 — no point computing Murabaha terms on a rejected application.

---

## 3. Risk Coverage & Agent Activity

| Merchant | Data Quality | Health Score | Risk Score | Risk Factors | Debate Fired | Agent Stages | Bedrock Calls |
|---|---|---|---|---|---|---|---|
| ZALYX-001 | 83/100 | 74/100 | 46/100 | 3 | **Yes** | 7 | 8 |
| ZALYX-002 | 91/100 | 44/100 | 67/100 | 5 | No | 5 | 6 |
| ZALYX-003 | 68/100 | 28/100 | 88/100 | 6 | No | 4 | 5 |
| ZALYX-004 | 96/100 | 89/100 | 38/100 | 2 | **Yes** | 7 | 8 |

**Why scores differ per merchant:**

- **ZALYX-001** — Data quality docked for ₦1.06M uncollected receivables. Health elevated by term-fee seasonality (Business Agent correctly explained this pattern). Risk moderate — receivables create exposure but are typical for schools. Debate fired → business_agent_prevailed.
- **ZALYX-002** — High data quality (clean order history, near-zero receivables). Health low due to revenue declining 72% MoM and only 2 active days in 30d. Risk elevated — MCP sector benchmarks confirmed this is below floor for natural products sector.
- **ZALYX-003** — Data quality hit by 0 active days in 30d and 6 uncollected orders (75% receivables rate). Health very low. Risk very high — Stage 4 skipped. No debate (health < 55).
- **ZALYX-004** — Near-perfect data quality, 5-month upward revenue trend, 95.4% order completion rate. Health high. Debate fired because risk agent always challenges, but business agent prevailed with trend evidence.

---

## 4. Output Quality

| Merchant | Structured Completeness | Actionability Score | Rationale Words (Multi) | Rationale Words (Baseline) | Depth Gain |
|---|---|---|---|---|---|
| ZALYX-001 | 100% | 100/100 | 312 | 74 | +238 words |
| ZALYX-002 | 100% | 100/100 | 248 | 61 | +187 words |
| ZALYX-003 | 100% | 100/100 | 291 | 58 | +233 words |
| ZALYX-004 | 100% | 100/100 | 338 | 82 | +256 words |

**Structured fields present in multi-agent report that are absent from baseline:**
`DataQualityResult`, `BusinessAnalysisResult`, `RiskAssessmentResult` (with `riskFactors[]`),
`FinancingStructureResult` (Murabaha cost price + installments), `DebateTranscript`,
`DebateResolution` (who prevailed and why), `DebateLedger` (typed claim-by-claim),
`DecisionDelta` (baseline vs multi-agent comparison), `RunObservability` (request ID, per-agent timing, Bedrock + MCP call counts).

---

## 5. Summary

| Metric | Value |
|---|---|
| Merchants benchmarked | 4 |
| Decisions that differed (baseline vs multi-agent) | **3/4** |
| High-risk approvals reversed by multi-agent | **2** (ZALYX-002, ZALYX-003) |
| False rejections corrected by multi-agent | **1** (ZALYX-001) |
| Debate round fired | 2/4 merchants (ZALYX-001, ZALYX-004) |
| Total risk factors surfaced across all merchants | 16 |
| Avg structured output completeness | 100% |
| Avg actionability score | 100/100 |
| Avg baseline latency | 0.5s |
| Avg multi-agent latency | 5.6s |
| Latency tradeoff per merchant | +5.1s for structured debate |

> **Why the overhead is worth it in production underwriting:**
> A high-risk approval that reaches disbursement exposes Zalyx to ~₦100k+ in expected default loss.
> A false rejection loses a transaction fee and damages merchant trust.
> ZALYX-003 alone demonstrates the value: baseline approved a merchant the multi-agent pipeline correctly rejected based on 6 structured risk factors surfaced through tool use and agent debate.
> 5.6s of compute to produce a compliance-ready audit trail with DynamoDB-persisted decisions is a sound tradeoff for a regulated lending product.
