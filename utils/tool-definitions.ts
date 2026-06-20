/**
 * Shared tool definitions (OpenAI function-calling schema format).
 * Imported by both bedrock-client.ts (which converts them to Bedrock format)
 * and any tests that need the raw schema.
 */

export const SUBMIT_RISK_VERDICT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_risk_verdict",
    description:
      "Submit your formal risk assessment verdict with structured findings. Call this after completing your analysis.",
    parameters: {
      type: "object",
      properties: {
        risk_level: {
          type: "string",
          enum: ["LOW", "MODERATE", "HIGH"],
          description: "Your overall risk classification",
        },
        adjusted_risk_score: {
          type: "number",
          description: "Your risk score 0-100.",
        },
        key_risk_factors: {
          type: "array",
          items: { type: "string" },
          description: "Top 2-4 specific risk factors with actual numbers.",
        },
        challenge_to_business_analyst: {
          type: "string",
          description: "Your specific pushback on the Business Analyst's assessment.",
        },
        conditions_for_approval: {
          type: "array",
          items: { type: "string" },
          description: "Conditions under which you support approval. Empty = recommend rejection.",
        },
      },
      required: ["risk_level", "adjusted_risk_score", "key_risk_factors", "challenge_to_business_analyst"],
    },
  },
};

export const SUBMIT_DATA_QUALITY_RESULT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_data_quality_result",
    description: "Submit your structured data quality assessment.",
    parameters: {
      type: "object",
      properties: {
        completeness_score: { type: "number", description: "Score 0–100 for data completeness." },
        consistency_score: { type: "number", description: "Score 0–100 for internal consistency." },
        anomalies: {
          type: "array",
          items: { type: "string" },
          description: "Specific anomalies found. Empty if none.",
        },
        overall_quality_score: { type: "number", description: "Combined quality score 0–100." },
        proceed_recommendation: {
          type: "string",
          enum: ["proceed", "proceed_with_caveats", "block"],
        },
        quality_notes: { type: "string", description: "One paragraph summary for subsequent agents." },
      },
      required: [
        "completeness_score", "consistency_score", "anomalies",
        "overall_quality_score", "proceed_recommendation", "quality_notes",
      ],
    },
  },
};

export const SUBMIT_BUSINESS_POSITION_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_business_position",
    description: "Submit your structured business health assessment and debate position.",
    parameters: {
      type: "object",
      properties: {
        monthly_revenue_average: { type: "number", description: "Average monthly revenue in naira." },
        revenue_stability_score: { type: "number", description: "Score 0–100 for revenue stability." },
        business_health_score: { type: "number", description: "Overall business health 0–100." },
        profitability_indicator: {
          type: "string",
          enum: ["strong", "moderate", "weak", "insufficient_data"],
        },
        key_strengths: { type: "array", items: { type: "string" }, description: "2–4 specific strengths." },
        key_concerns: { type: "array", items: { type: "string" }, description: "2–4 specific concerns." },
        recommendation: { type: "string", description: "Your position in one sentence." },
      },
      required: [
        "monthly_revenue_average", "revenue_stability_score", "business_health_score",
        "profitability_indicator", "key_strengths", "key_concerns", "recommendation",
      ],
    },
  },
};

export const STRUCTURE_MURABAHA_OFFER_TOOL = {
  type: "function" as const,
  function: {
    name: "structure_murabaha_offer",
    description: "Submit your Murabaha-compliant financing offer. Murabaha = fixed fee, no interest, no compounding.",
    parameters: {
      type: "object",
      properties: {
        principal_naira: { type: "number", description: "Principal financing amount in naira." },
        fixed_fee_naira: { type: "number", description: "Fixed Murabaha fee in naira (flat, not interest)." },
        fixed_fee_pct: { type: "number", description: "Fixed fee as % of principal." },
        tenor_months: { type: "number", description: "Repayment period in months." },
        disbursement_conditions: { type: "array", items: { type: "string" } },
        repayment_schedule_description: { type: "string" },
        structuring_rationale: { type: "string" },
      },
      required: [
        "principal_naira", "fixed_fee_naira", "fixed_fee_pct",
        "tenor_months", "repayment_schedule_description", "structuring_rationale",
      ],
    },
  },
};

export const ISSUE_UNDERWRITING_DECISION_TOOL = {
  type: "function" as const,
  function: {
    name: "issue_underwriting_decision",
    description: "Issue the final underwriting decision after reviewing all agent inputs and the full debate transcript.",
    parameters: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["approved", "rejected", "requires-clarification"],
        },
        approved_amount_naira: { type: "number", description: "Approved amount in naira. 0 if rejected." },
        decision_rationale_underwriter: { type: "string" },
        decision_rationale_merchant: { type: "string" },
        mandatory_conditions: { type: "array", items: { type: "string" } },
        what_debate_resolved: { type: "string" },
      },
      required: [
        "decision", "approved_amount_naira",
        "decision_rationale_underwriter", "decision_rationale_merchant", "what_debate_resolved",
      ],
    },
  },
};
