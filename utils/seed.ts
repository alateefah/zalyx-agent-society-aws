/**
 * Seed script — inserts demo decisions into DynamoDB for all four merchants.
 * Run once after a fresh environment:
 *
 *   npx ts-node utils/seed.ts
 *
 * Uses the same AWS credentials / region as the server.
 * Requires AWS_REGION to be set (or defaults to us-east-1).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const REGION           = process.env.AWS_REGION || "us-east-1";
const DECISIONS_TABLE  = process.env.DYNAMODB_DECISIONS_TABLE || "zalyx-decisions";
const MERCHANTS_TABLE  = process.env.DYNAMODB_MERCHANTS_TABLE || "zalyx-merchants";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequestId(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeObservability(requestId: string) {
  return {
    requestId,
    mockMode: false,
    model: "amazon.nova-pro-v1:0",
    totalBedrockCalls: 12,
    totalMcpCalls: 0,
    agentTimings: [
      { agentName: "Data Validator",       durationMs: 3200, bedrockCallCount: 2, mcpCallCount: 0 },
      { agentName: "Revenue Analyst",      durationMs: 5800, bedrockCallCount: 3, mcpCallCount: 0 },
      { agentName: "Risk Scorer",          durationMs: 4900, bedrockCallCount: 3, mcpCallCount: 0 },
      { agentName: "Murabaha Structurer",  durationMs: 4100, bedrockCallCount: 2, mcpCallCount: 0 },
      { agentName: "Final Arbitrator",     durationMs: 3600, bedrockCallCount: 2, mcpCallCount: 0 },
    ],
    parallelStages: ["Revenue Analyst", "Risk Scorer"],
    debateRoundFired: false,
    stage4Skipped: false,
  };
}

// ── Decision templates ────────────────────────────────────────────────────────

const SEEDS: Array<{
  merchantId: string;
  decision: "approved" | "rejected" | "requires-clarification";
  approvedAmountNaira: number;
  executionTime: string;
  createdAt: string;
  report: object;
}> = [
  // ── ZALYX-004  Lagos Kitchen Co. ─────────────────────────────────────────
  {
    merchantId: "ZALYX-004",
    decision: "approved",
    approvedAmountNaira: 500000,
    executionTime: "38s",
    createdAt: daysAgo(10),
    report: {
      merchantId: "ZALYX-004",
      executionTime: "38s",
      dataQuality: {
        completenessScore: 98,
        anomaliesDetected: [],
        dataConfidence: "HIGH",
        recommendation: "Data is complete and consistent. No anomalies detected.",
      },
      businessAnalysis: {
        healthScore: 88,
        revenueGrowthRate: 12.5,
        avgMonthlyRevenueNaira: 2190000,
        customerRetentionEstimate: 0.82,
        seasonalityPattern: "Consistent with minor mid-month peaks",
        strengths: [
          "10 months of consistent trading history",
          "Revenue grew every month from Jan–May 2026",
          "High order completion rate (271/284 = 95%)",
          "Only 3 outstanding orders — negligible receivable risk",
          "24 active selling days in the last 30",
        ],
        concerns: ["Slight June revenue dip (partial month)"],
        overallAssessment:
          "Lagos Kitchen Co. presents an exceptionally strong financial profile for a merchant of its age. Revenue trajectory is positive, operational consistency is high, and receivable exposure is minimal.",
      },
      riskAssessment: {
        volatilityIndex: 14,
        concentrationRisk: "low",
        operationalStability: 91,
        riskFactors: ["Partial June data reduces 3-month average slightly"],
        overallRiskScore: 12,
        recommendation:
          "Risk profile is low. The merchant's history of consistent revenue and minimal outstanding orders warrants approval at the requested tier.",
      },
      financingStructure: {
        proposedAmount: "₦500,000",
        repaymentTerms: "6 months, fixed fee structure",
        paymentSchedule: "Monthly instalments of ₦91,667 + fixed fee allocation",
        riskMitigation: ["Revenue coverage ratio of 4.4x monthly repayment", "Strong collection track record"],
        rationale:
          "Murabaha structure at ₦500,000 is well within this merchant's repayment capacity. Monthly revenue of ~₦2.2M comfortably covers instalments.",
      },
      humanReview: {
        finalRecommendation: "approved",
        approvalAmount: "₦500,000",
        approvedAmountNaira: 500000,
        termsAdjustments: "None — standard Tier A terms apply.",
        agentDebateNotes: "All agents aligned on approval. No debate round required.",
        reason:
          "Lagos Kitchen Co. qualifies for the full ₦500,000 Murabaha offer. The merchant has demonstrated sustained revenue growth, high operational consistency, and negligible receivable risk over 10 months of trading.",
      },
      debateTranscript: [],
      decisionDelta: {
        baselineDecision: "approved",
        multiAgentDecision: "approved",
        deltaType: "same_decision",
        decisionChanged: false,
        reason: "Both approaches agreed — strong merchant profile left little room for disagreement.",
        valueAdded: ["Multi-agent provided per-signal breakdown", "Structured Murabaha terms with explicit repayment schedule"],
        structuredOutputAdvantage: "Baseline lacked receivable risk quantification and seasonal pattern analysis.",
        baselineExecutionTime: "12s",
        multiAgentExecutionTime: "38s",
      },
    },
  },

  // ── ZALYX-001  Bright Future Academy ─────────────────────────────────────
  {
    merchantId: "ZALYX-001",
    decision: "approved",
    approvedAmountNaira: 250000,
    executionTime: "44s",
    createdAt: daysAgo(13),
    report: {
      merchantId: "ZALYX-001",
      executionTime: "44s",
      dataQuality: {
        completenessScore: 92,
        anomaliesDetected: [],
        dataConfidence: "MED",
        recommendation: "Data is adequate. High outstanding receivables warrant closer scrutiny.",
      },
      businessAnalysis: {
        healthScore: 72,
        revenueGrowthRate: 28.4,
        avgMonthlyRevenueNaira: 1432667,
        customerRetentionEstimate: 0.71,
        seasonalityPattern: "Strong May spike consistent with school-term fee collection",
        strengths: [
          "Significant May revenue spike (₦2.65M) — consistent with school-term cycle",
          "Zero cancellations across 41 orders",
          "No data manipulation signals (edit/delete/backdate rates all zero)",
          "58 days of operation with positive revenue trajectory",
        ],
        concerns: [
          "High uncollected receivables (₦1.06M / 42% of total owed)",
          "Only 7 active days in last 30 (seasonal lull post-term)",
          "Short operating history limits trend confidence",
        ],
        overallAssessment:
          "Bright Future Academy shows strong seasonal revenue typical of educational institutions. The receivable exposure is elevated but contextually normal for school-term billing cycles.",
      },
      riskAssessment: {
        volatilityIndex: 38,
        concentrationRisk: "medium",
        operationalStability: 68,
        riskFactors: [
          "High receivable-to-revenue ratio (42%)",
          "Low activity in inter-term period",
          "Short trading history (58 days)",
        ],
        overallRiskScore: 34,
        recommendation:
          "Moderate risk. Receivable exposure is the primary concern. Recommend approval at reduced amount with 3-month tenor to align with next school term.",
      },
      financingStructure: {
        proposedAmount: "₦250,000",
        repaymentTerms: "3 months, fixed fee structure",
        paymentSchedule: "Monthly instalments of ₦91,667 + fixed fee allocation",
        riskMitigation: [
          "Reduced tenor aligns repayment with next school-term revenue cycle",
          "Amount sized to 24% of average monthly revenue — conservative coverage",
        ],
        rationale:
          "A smaller Murabaha offer at ₦250,000 over 3 months is appropriate. This is recoverable from a single month's fee collection and aligns with the school-term billing pattern.",
      },
      humanReview: {
        finalRecommendation: "approved",
        approvalAmount: "₦250,000",
        approvedAmountNaira: 250000,
        termsAdjustments: "Reduced to ₦250,000 (from potential ₦400,000) due to receivable concentration.",
        agentDebateNotes:
          "Debate fired: Risk agent challenged the receivable ratio. Business agent argued school-term seasonality makes this a structural feature, not a risk signal. Resolved with reduced offer amount.",
        reason:
          "Approved at ₦250,000 — the school's seasonal revenue pattern is strong and the zero-cancellation record is compelling. The offer is sized conservatively to account for the inter-term lull.",
      },
      debateTranscript: [],
    },
  },

  // ── ZALYX-002  Glow Naturals ─────────────────────────────────────────────
  {
    merchantId: "ZALYX-002",
    decision: "requires-clarification",
    approvedAmountNaira: 0,
    executionTime: "41s",
    createdAt: daysAgo(6),
    report: {
      merchantId: "ZALYX-002",
      executionTime: "41s",
      dataQuality: {
        completenessScore: 87,
        anomaliesDetected: ["Revenue declined 72% from April to May"],
        dataConfidence: "MED",
        recommendation: "Sharp revenue decline requires explanation before decision.",
      },
      businessAnalysis: {
        healthScore: 51,
        revenueGrowthRate: -71.7,
        avgMonthlyRevenueNaira: 84100,
        customerRetentionEstimate: 0.54,
        seasonalityPattern: "No clear pattern — high April may be anomalous",
        strengths: [
          "High order completion rate (29/31 = 94%)",
          "Negligible outstanding receivables (₦1,000)",
          "71 days of trading history",
        ],
        concerns: [
          "Revenue fell from ₦151,100 (April) to ₦42,700 (May) — a 72% drop",
          "Only 2 active selling days in last 30",
          "Customer base not growing: May and June have fewer unique customers than April",
        ],
        overallAssessment:
          "Glow Naturals shows a concerning revenue decline. The April spike may represent a one-off bulk order rather than recurring trade. Insufficient data to distinguish seasonal pattern from business deterioration.",
      },
      riskAssessment: {
        volatilityIndex: 67,
        concentrationRisk: "high",
        operationalStability: 44,
        riskFactors: [
          "Revenue volatility index of 67 — high",
          "Possible single large customer concentration in April",
          "2 active days in last 30 suggests near-inactivity",
        ],
        overallRiskScore: 61,
        recommendation:
          "Risk is too elevated for standard approval. The revenue decline pattern needs explanation. Requires clarification on whether April revenue is recurring.",
      },
      financingStructure: {
        proposedAmount: "Pending clarification",
        repaymentTerms: "To be determined",
        paymentSchedule: "Cannot be structured without stable revenue baseline",
        riskMitigation: [],
        rationale:
          "Structuring a Murabaha offer is not advisable until the revenue decline is explained and a stable baseline is established.",
      },
      humanReview: {
        finalRecommendation: "requires-clarification",
        approvalAmount: "₦0",
        approvedAmountNaira: 0,
        termsAdjustments: "None — decision deferred pending merchant response.",
        agentDebateNotes:
          "Agents flagged revenue volatility unanimously. Debate round fired on whether the April spike represents a real customer base or a one-off order.",
        reason:
          "Decision deferred. Glow Naturals must clarify whether April's ₦151,100 revenue came from recurring customers or a single large order. If recurring, a small offer may be possible. Current data cannot support a confident credit decision either way.",
      },
      debateTranscript: [],
    },
  },

  // ── ZALYX-003  Apex Creative Services ───────────────────────────────────
  {
    merchantId: "ZALYX-003",
    decision: "rejected",
    approvedAmountNaira: 0,
    executionTime: "36s",
    createdAt: daysAgo(4),
    report: {
      merchantId: "ZALYX-003",
      executionTime: "36s",
      dataQuality: {
        completenessScore: 78,
        anomaliesDetected: ["Zero activity in last 30 days", "All revenue concentrated in a single month"],
        dataConfidence: "LOW",
        recommendation: "Data quality is insufficient to support a positive decision.",
      },
      businessAnalysis: {
        healthScore: 31,
        revenueGrowthRate: 0,
        avgMonthlyRevenueNaira: 1105000,
        customerRetentionEstimate: 0.0,
        seasonalityPattern: "Cannot determine — single month of data",
        strengths: [
          "High May revenue (₦1.1M) — significant if recurring",
        ],
        concerns: [
          "Zero orders and zero revenue in last 30 days",
          "75% of receivables uncollected (₦575,000 of ₦1.425M)",
          "All revenue is from a single month — no trend data",
          "Only 39 days old — insufficient trading history",
          "6 of 8 orders are still outstanding",
        ],
        overallAssessment:
          "Apex Creative's profile is dominated by red flags. The entire revenue record comes from a single month and the business has been inactive for at least 30 days. It is not possible to establish a revenue baseline from this data.",
      },
      riskAssessment: {
        volatilityIndex: 92,
        concentrationRisk: "high",
        operationalStability: 18,
        riskFactors: [
          "100% revenue concentration in May — no evidence of recurring business",
          "Zero recent activity is the most significant risk flag",
          "75% receivable uncollection rate — cash flow is severely impaired",
          "Business too new (39 days) to assess viability",
        ],
        overallRiskScore: 89,
        recommendation:
          "Reject. The combination of zero recent activity, single-month revenue, and 75% uncollected receivables makes this merchant unsuitable for financing at this time.",
      },
      financingStructure: {
        proposedAmount: "₦0 — no offer",
        repaymentTerms: "N/A",
        paymentSchedule: "N/A",
        riskMitigation: [],
        rationale:
          "No Murabaha structure is viable. There is no revenue baseline to size a repayment plan against, and the business has no demonstrable capacity to service debt.",
      },
      humanReview: {
        finalRecommendation: "rejected",
        approvalAmount: "₦0",
        approvedAmountNaira: 0,
        termsAdjustments: "None.",
        agentDebateNotes: "All agents aligned on rejection. No debate round required.",
        reason:
          "Rejected. Apex Creative Services lacks the minimum trading history, revenue consistency, and receivable health required for a financing offer. The business should reapply after 3 months of active trading with at least 60% receivables collected.",
      },
      debateTranscript: [],
    },
  },
];

// ── Merchant records ──────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

function loadMerchants() {
  const dir = path.join(__dirname, "../data/snapshots");
  if (!fs.existsSync(dir)) { console.warn("  ⚠️  data/snapshots not found — skipping merchant seed"); return []; }
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
}

// ── Write to DynamoDB ─────────────────────────────────────────────────────────

async function seed() {
  // 1. Merchants
  const merchants = loadMerchants();
  console.log(`\n🌱  Seeding ${merchants.length} merchants into ${MERCHANTS_TABLE} (${REGION})\n`);
  for (const m of merchants) {
    await client.send(new PutCommand({ TableName: MERCHANTS_TABLE, Item: m }));
    console.log(`  ✅  ${m.id}  (${m.businessName})`);
  }

  // 2. Decisions
  console.log(`\n🌱  Seeding ${SEEDS.length} decisions into ${DECISIONS_TABLE}\n`);
  for (const s of SEEDS) {
    const requestId = makeRequestId();
    const item = {
      merchantId:          s.merchantId,
      requestId,
      decision:            s.decision,
      approvedAmountNaira: s.approvedAmountNaira,
      executionTime:       s.executionTime,
      createdAt:           s.createdAt,
      report:              { ...s.report, observability: makeObservability(requestId) },
    };
    await client.send(new PutCommand({ TableName: DECISIONS_TABLE, Item: item }));
    console.log(`  ✅  ${s.merchantId}  →  ${s.decision}  (${s.executionTime})`);
  }

  console.log("\n✨  Done.\n");
}

seed().catch((err) => {
  console.error("\n❌  Seed failed:", err.message);
  process.exit(1);
});
