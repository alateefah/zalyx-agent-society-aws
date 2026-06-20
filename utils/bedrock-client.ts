/**
 * Amazon Bedrock Client
 *
 * Uses the Bedrock Converse API which supports:
 *   • Standard chat completion   (analyzeWithContext / chat)
 *   • Tool use / function calling (chatWithTools)
 *
 * Default model: amazon.nova-pro-v1:0  (swap via BEDROCK_MODEL_ID env var)
 * Falls back to mock mode when AWS credentials are absent.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ToolChoice,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

// ── Re-export tool definitions (same OpenAI schema shape — converted internally) ──
export {
  SUBMIT_RISK_VERDICT_TOOL,
  SUBMIT_DATA_QUALITY_RESULT_TOOL,
  SUBMIT_BUSINESS_POSITION_TOOL,
  STRUCTURE_MURABAHA_OFFER_TOOL,
  ISSUE_UNDERWRITING_DECISION_TOOL,
} from "./tool-definitions";

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentResponse {
  message: string;
  agentName: string;
  timestamp: string;
}

export interface ToolCallResult {
  message: string;
  agentName: string;
  timestamp: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

// ── Format conversion: OpenAI tool → Bedrock tool ────────────────────────────

function toBedrockTool(openAiTool: {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}): Tool {
  return {
    toolSpec: {
      name: openAiTool.function.name,
      description: openAiTool.function.description,
      inputSchema: { json: openAiTool.function.parameters as any },
    },
  };
}

/** Convert our AgentMessage array to Bedrock's message format.
 *  System messages are extracted separately and returned as a tuple. */
function toBedrockMessages(messages: AgentMessage[], systemPrompt?: string): {
  system: { text: string }[] | undefined;
  messages: Message[];
} {
  const systemParts: string[] = [];
  if (systemPrompt) systemParts.push(systemPrompt);

  const bedrockMessages: Message[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      bedrockMessages.push({
        role: m.role as "user" | "assistant",
        content: [{ text: m.content }],
      });
    }
  }

  // Bedrock requires messages to start with "user"
  if (bedrockMessages.length === 0 || bedrockMessages[0].role !== "user") {
    bedrockMessages.unshift({ role: "user", content: [{ text: "Begin." }] });
  }

  return {
    system: systemParts.length > 0 ? systemParts.map((t) => ({ text: t })) : undefined,
    messages: bedrockMessages,
  };
}

// ── Mock data (same as before, just re-keyed) ─────────────────────────────────

const MOCK_MESSAGES: Record<string, string> = {
  "Data Quality Agent":
    "Data quality assessment complete. The merchant's records show adequate completeness with consistent date ordering. Minor anomalies flagged for review, but overall data is suitable for underwriting analysis.",
  "Business Analysis Agent":
    "Financial health analysis indicates a viable business with positive revenue trends. Monthly averages show consistent income streams. The profit margin trajectory supports financing eligibility. Recommend approval subject to risk review.",
  "Risk Assessment Agent":
    "CAUTION: Revenue concentration warrants scrutiny. While the business shows health indicators, seasonal volatility patterns present moderate risk. I challenge the Business Agent's optimism — a conservative financing structure is warranted.",
  "Business Analysis Agent (Rebuttal)":
    "I acknowledge the Risk Officer's receivables concern — legitimate. However, I stand firm on revenue trajectory. This merchant's business type drives lumpy, term-based patterns that look like inactivity between cycles but represent normal operations. I maintain this is an approvable case with appropriate mitigations.",
  "Risk Assessment Agent (Verdict)":
    "I accept the Business Analyst's seasonality argument — contextually sound. I revise downward on the inactivity flag. However, I hold firm on receivables collection efficiency before disbursal. FINAL VERDICT: Moderate risk. Approved with conditions.",
  "Financing Structure Agent":
    "Based on the health and risk analysis, I propose a structured Murabaha financing package with flexible repayment terms that account for seasonal patterns.",
  "Human Review Agent":
    "After reviewing the full agent debate the agents reached productive consensus. Final decision: APPROVED with conditions as specified.",
  "Baseline (Single Agent)":
    "DECISION: REQUIRES CLARIFICATION\n\nPROPOSED AMOUNT: Provisional ₦150,000 pending review\n\nRISK SUMMARY: Revenue volatility is high, 30-day activity is low, and uncollected receivables represent significant credit exposure.\n\nREASONING: The merchant shows inconsistent revenue. Requesting clarification before approving.",
};

const MOCK_TOOL_CALLS: Record<string, { name: string; arguments: Record<string, unknown> }> = {
  "Data Quality Agent": {
    name: "submit_data_quality_result",
    arguments: {
      completeness_score: 92,
      consistency_score: 88,
      anomalies: [
        "₦1.06M uncollected receivables across 17 outstanding orders (42% uncollected rate)",
        "Only 7 active days in last 30 days vs 17 over 90 days — activity gap present",
      ],
      overall_quality_score: 90,
      proceed_recommendation: "proceed_with_caveats",
      quality_notes:
        "Data is largely complete and internally consistent. Main flag is the outstanding receivables concentration and reduced 30-day activity. CBN compliance check: clear.",
    },
  },
  "Business Analysis Agent": {
    name: "submit_business_position",
    arguments: {
      monthly_revenue_average: 1432667,
      revenue_stability_score: 58,
      business_health_score: 65,
      profitability_indicator: "moderate",
      key_strengths: [
        "May 2026 revenue spike of ₦2.65M — strong term-fee collection cycle for school sector",
        "17 unique customers in June — healthy customer base for platform age of 58 days",
        "Zero edit, delete, or backdate rates — no data manipulation signals",
      ],
      key_concerns: [
        "₦1.06M uncollected on 17 orders — receivables collection rate needs monitoring",
        "7 active days in last 30 days — low engagement between term cycles",
      ],
      recommendation:
        "School sector term-fee pattern explains apparent inactivity. Business fundamentals support a moderate financing offer with receivables covenant.",
    },
  },
  "Risk Assessment Agent": {
    name: "submit_risk_verdict",
    arguments: {
      risk_level: "MODERATE",
      adjusted_risk_score: 42,
      key_risk_factors: [
        "₦1.06M uncollected receivables on 17 outstanding orders (42% of total revenue)",
        "Only 7 active days in last 30 days — platform engagement concern",
        "Revenue spike (May ₦2.65M) followed by decline (Jun ₦1.34M) — trend unclear",
      ],
      challenge_to_business_analyst:
        "The Business Analyst's health score of 65/100 does not adequately weight the receivables concentration. Over ₦1M in uncollected payments is significant credit exposure.",
      conditions_for_approval: [
        "Demonstrate collection on at least 50% of outstanding receivables before disbursement",
        "Confirm active business cycle has commenced (15+ active days)",
        "Monthly check-in for first 3 months post-disbursement",
      ],
    },
  },
  "Financing Structure Agent": {
    name: "structure_murabaha_offer",
    arguments: {
      principal_naira: 182665,
      fixed_fee_naira: 32235,
      fixed_fee_pct: 15,
      tenor_months: 3,
      disbursement_conditions: [
        "Collection of ₦530,000 in outstanding receivables (50% of uncollected balance)",
        "Confirmation that active business cycle has commenced",
      ],
      repayment_schedule_description: "₦71,633/month over 3 months (sale price: ₦214,900)",
      structuring_rationale:
        "Murabaha structure: sale price ₦214,900 = 15% of avg monthly GTV. Zalyx buys asset at cost ₦182,665, sells at fixed ₦214,900 (15% margin disclosed upfront). Monthly installment ₦71,633 = 5.0% of GTV — within affordability cap.",
    },
  },
  "Human Review Agent": {
    name: "issue_underwriting_decision",
    arguments: {
      decision: "approved",
      approved_amount_naira: 182665,
      decision_rationale_underwriter:
        "Agent debate reached productive consensus. Business Analyst identified term-fee seasonality. Risk Officer maintained receivables covenant. Financing Agent computed sale price ₦214,900 at 15% GTV moderate risk tier.",
      decision_rationale_merchant:
        "Your Murabaha financing has been approved. Zalyx will purchase assets at cost price ₦182,665, then sell to you at fixed sale price ₦214,900. You repay ₦71,633/month over 3 months.",
      mandatory_conditions: [
        "Collect ₦530,000+ in outstanding receivables before disbursal",
        "Confirm active business cycle has commenced (15+ active days)",
      ],
      what_debate_resolved:
        "A single-agent analysis flagged the 7-day activity gap as high risk. The debate allowed the Business Analyst to surface the term-fee payment pattern: the May spike and June gap are structural. The Risk Officer accepted this context while maintaining the receivables covenant.",
    },
  },
};

// ── BedrockClient ─────────────────────────────────────────────────────────────

export class BedrockClient {
  private client: BedrockRuntimeClient | null = null;
  private modelId: string;
  readonly mockMode: boolean;
  private _callCount = 0;

  getCallCount(): number { return this._callCount; }
  resetCallCount(): void { this._callCount = 0; }

  constructor() {
    this.modelId = process.env.BEDROCK_MODEL_ID || "amazon.nova-pro-v1:0";

    const hasCredentials =
      !!process.env.AWS_ACCESS_KEY_ID ||
      !!process.env.AWS_PROFILE ||
      process.env.BEDROCK_MOCK_MODE === "true";

    if (!hasCredentials && !process.env.AWS_REGION) {
      console.warn(
        "⚠️  No AWS credentials found — Bedrock running in MOCK mode. Set AWS_ACCESS_KEY_ID / AWS_REGION in .env."
      );
      this.mockMode = true;
    } else {
      this.mockMode = process.env.BEDROCK_MOCK_MODE === "true";
      this.client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || "us-east-1",
      });
    }
  }

  // ── Retry helper ─────────────────────────────────────────────────────────
  private async withRetry<T>(fn: () => Promise<T>, agentName: string, maxAttempts = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const isThrottling =
          err?.name === "ThrottlingException" || err?.$metadata?.httpStatusCode === 429;
        const isTransient =
          err?.name === "ServiceUnavailableException" || err?.$metadata?.httpStatusCode >= 500;
        if (attempt === maxAttempts || (!isThrottling && !isTransient)) throw err;
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(
          `⟳  ${agentName} attempt ${attempt} failed (${err?.name ?? "error"}) — retrying in ${(backoffMs / 1000).toFixed(1)}s`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw new Error(`${agentName}: max retries exceeded`);
  }

  // ── Standard chat ────────────────────────────────────────────────────────
  async chat(
    messages: AgentMessage[],
    agentName: string,
    systemPrompt?: string
  ): Promise<AgentResponse> {
    this._callCount++;
    if (this.mockMode) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      return {
        message: MOCK_MESSAGES[agentName] ?? `[Mock] ${agentName}: analysis complete.`,
        agentName,
        timestamp: new Date().toISOString(),
      };
    }

    return this.withRetry(async () => {
      const { system, messages: bedrockMessages } = toBedrockMessages(messages, systemPrompt);

      const response = await this.client!.send(
        new ConverseCommand({
          modelId: this.modelId,
          system,
          messages: bedrockMessages,
          inferenceConfig: { maxTokens: 1500, temperature: 0.7 },
        })
      );

      const textBlock = (response.output?.message?.content ?? []).find(
        (b: ContentBlock): b is ContentBlock & { text: string } => "text" in b
      );

      return {
        message: textBlock?.text ?? "No response generated",
        agentName,
        timestamp: new Date().toISOString(),
      };
    }, agentName);
  }

  // ── Function / tool calling ──────────────────────────────────────────────
  async chatWithTools(
    messages: AgentMessage[],
    tools: any[],                 // OpenAI-format tools — converted internally
    agentName: string,
    systemPrompt?: string,
    forceToolName?: string
  ): Promise<ToolCallResult> {
    this._callCount++;
    if (this.mockMode) {
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 700));
      return {
        message: MOCK_MESSAGES[agentName] ?? `[Mock] ${agentName}: analysis complete.`,
        agentName,
        timestamp: new Date().toISOString(),
        toolCall: MOCK_TOOL_CALLS[agentName],
      };
    }

    return this.withRetry(async () => {
      const { system, messages: bedrockMessages } = toBedrockMessages(messages, systemPrompt);
      const bedrockTools: Tool[] = tools.map(toBedrockTool);

      const toolChoice: ToolChoice = forceToolName
        ? { tool: { name: forceToolName } }
        : { auto: {} };

      const response = await this.client!.send(
        new ConverseCommand({
          modelId: this.modelId,
          system,
          messages: bedrockMessages,
          toolConfig: { tools: bedrockTools, toolChoice },
          inferenceConfig: { maxTokens: 4000, temperature: 0.7 },
        })
      );

      const content = response.output?.message?.content ?? [];

      // Extract tool use block
      const toolUseBlock = content.find(
        (b: ContentBlock): b is ContentBlock & { toolUse: { name: string; toolUseId: string; input: Record<string, unknown> } } =>
          "toolUse" in b
      );

      const textBlock = content.find(
        (b: ContentBlock): b is ContentBlock & { text: string } => "text" in b
      );

      if (toolUseBlock && response.stopReason === "tool_use") {
        return {
          message: textBlock?.text ?? "",
          agentName,
          timestamp: new Date().toISOString(),
          toolCall: {
            name: toolUseBlock.toolUse.name,
            arguments: toolUseBlock.toolUse.input,
          },
        };
      }

      // Model responded without calling a tool
      return {
        message: textBlock?.text ?? "No response generated",
        agentName,
        timestamp: new Date().toISOString(),
      };
    }, agentName);
  }

  // ── Convenience wrapper ──────────────────────────────────────────────────
  async analyzeWithContext(
    prompt: string,
    context: string,
    agentName: string
  ): Promise<AgentResponse> {
    return this.chat(
      [{ role: "user", content: `Context:\n${context}\n\nAnalysis request:\n${prompt}` }],
      agentName
    );
  }
}

// ── Singletons ────────────────────────────────────────────────────────────────

let _bedrockClient: BedrockClient | null = null;

/** Lazy singleton — constructed on first use */
export const bedrockClient = new Proxy({} as BedrockClient, {
  get(_target, prop) {
    if (!_bedrockClient) _bedrockClient = new BedrockClient();
    const value = (_bedrockClient as any)[prop];
    return typeof value === "function" ? value.bind(_bedrockClient) : value;
  },
});

