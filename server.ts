import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import { AgentOrchestrator } from "./orchestration/agent-orchestrator";
import { BaselineAgent } from "./agents/baseline-agent";
import { ZalyxMerchantSnapshot, AgentProgressEvent } from "./utils/types";
import { mcpClient } from "./utils/mcp-client";
import { bedrockClient } from "./utils/bedrock-client";
import {
  initDynamo,
  dynamoMockMode,
  getMerchantSnapshot,
  listMerchants,
  saveUnderwritingDecision,
  saveMerchantSnapshot,
  getDecisionsForMerchant,
  listDecisionsByType,
} from "./utils/dynamo";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const orchestrator = new AgentOrchestrator();
const baselineAgent = new BaselineAgent();

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    ai: {
      provider: "Amazon Bedrock",
      model: process.env.BEDROCK_MODEL_ID || "amazon.nova-pro-v1:0",
      mockMode: bedrockClient.mockMode,
    },
    database: {
      provider: "Amazon DynamoDB",
      region: process.env.AWS_REGION || "us-east-1",
      mockMode: dynamoMockMode,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Merchants ─────────────────────────────────────────────────────────────────

/** List all merchants available for underwriting */
app.get("/api/merchants", async (_req: Request, res: Response) => {
  try {
    const merchants = await listMerchants();
    res.json(merchants);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list merchants" });
  }
});

/** Load a specific merchant snapshot by ID */
app.get("/api/merchants/:id", async (req: Request, res: Response) => {
  try {
    const snapshot = await getMerchantSnapshot(req.params.id);
    if (!snapshot) {
      res.status(404).json({ error: `Merchant ${req.params.id} not found` });
      return;
    }
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load merchant" });
  }
});

// ── Underwriting ──────────────────────────────────────────────────────────────

/** SSE streaming endpoint — emits AgentProgressEvent per agent stage in real-time */
app.post("/api/underwrite/stream", async (req: Request, res: Response) => {
  const snapshot: ZalyxMerchantSnapshot = req.body;

  if (!snapshot.id || !snapshot.businessName || !snapshot.signals || !snapshot.monthlyRevenue) {
    res.status(400).json({ error: "Invalid snapshot." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: AgentProgressEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    console.log(`\n🌊 SSE underwriting: ${snapshot.businessName}`);
    const report = await orchestrator.runUnderwriting(snapshot, send);
    // Persist merchant + decision to DynamoDB
    await saveMerchantSnapshot(snapshot);
    await saveUnderwritingDecision(report);
    send({ type: "done", report });
    console.log(`✅ SSE complete: ${report.humanReview.finalRecommendation.toUpperCase()} — ${report.executionTime}`);
  } catch (error: any) {
    console.error("❌ SSE underwriting error:", error);
    send({ type: "error", message: error?.message || "Underwriting failed" });
  } finally {
    res.end();
  }
});

/** Non-streaming underwriting (for scripts / direct API calls) */
app.post("/api/underwrite", async (req: Request, res: Response) => {
  try {
    const snapshot: ZalyxMerchantSnapshot = req.body;

    if (!snapshot.id || !snapshot.businessName || !snapshot.signals || !snapshot.monthlyRevenue) {
      res.status(400).json({
        error: "Invalid snapshot. Required: id, businessName, businessType, ageInDays, orders, receivables, monthlyRevenue[], signals",
      });
      return;
    }

    console.log(`\n🔄 Underwriting: ${snapshot.businessName}`);
    const report = await orchestrator.runUnderwriting(snapshot);
    await saveMerchantSnapshot(snapshot);
    await saveUnderwritingDecision(report);
    console.log(`✅ Completed: ${report.humanReview.finalRecommendation.toUpperCase()} — ${report.executionTime}`);

    res.json(report);
  } catch (error: any) {
    console.error("❌ Underwriting error:", error);
    res.status(500).json({ error: error?.message || "Underwriting failed" });
  }
});

/** Single-agent baseline (for comparison) */
app.post("/api/baseline", async (req: Request, res: Response) => {
  try {
    const snapshot: ZalyxMerchantSnapshot = req.body;

    if (!snapshot.id || !snapshot.businessName || !snapshot.signals || !snapshot.monthlyRevenue) {
      res.status(400).json({ error: "Invalid snapshot." });
      return;
    }

    console.log(`\n🎯 Baseline: ${snapshot.businessName}`);
    const report = await baselineAgent.evaluate(snapshot);
    console.log(`✅ Baseline: ${report.decision.toUpperCase()} — ${report.executionTime}`);

    res.json(report);
  } catch (error: any) {
    console.error("❌ Baseline error:", error);
    res.status(500).json({ error: error?.message || "Baseline failed" });
  }
});

// ── Decision history ──────────────────────────────────────────────────────────

/** Retrieve all past underwriting decisions for a merchant from DynamoDB */
app.get("/api/decisions/:merchantId", async (req: Request, res: Response) => {
  try {
    const decisions = await getDecisionsForMerchant(req.params.merchantId);
    res.json(decisions);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load decisions" });
  }
});

/**
 * Query decisions across all merchants by type using the decision-index GSI.
 * GET /api/decisions?type=approved
 * GET /api/decisions?type=rejected
 * GET /api/decisions?type=requires-clarification
 */
app.get("/api/decisions", async (req: Request, res: Response) => {
  const type = (req.query.type as string) || "approved";
  if (!["approved", "rejected", "requires-clarification"].includes(type)) {
    res.status(400).json({ error: "type must be approved | rejected | requires-clarification" });
    return;
  }
  try {
    const decisions = await listDecisionsByType(
      type as "approved" | "rejected" | "requires-clarification",
      Number(req.query.limit) || 50
    );
    res.json(decisions);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to query decisions" });
  }
});

// ── Frontend (production) ─────────────────────────────────────────────────────

const frontendDist = path.join(__dirname, "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// ── Boot ──────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001", 10);

(async () => {
  console.log("\n🔧 Initialising AWS services...");
  await initDynamo();

  app.listen(PORT, () => {
    console.log(`\n🚀 Zalyx Agent Society API → http://localhost:${PORT}`);
    console.log(`   POST /api/underwrite/stream — SSE streaming (live agent progress)`);
    console.log(`   POST /api/underwrite        — Non-streaming underwriting`);
    console.log(`   POST /api/baseline          — Single-agent baseline comparison`);
    console.log(`   GET  /api/merchants         — List merchants (from DynamoDB)`);
    console.log(`   GET  /api/merchants/:id     — Load merchant snapshot`);
    console.log(`   GET  /api/decisions/:id     — Past decisions for a merchant`);
    console.log(`   GET  /api/decisions?type=   — Query by decision type via GSI`);
    console.log(`   GET  /api/health            — Health check`);

    if (bedrockClient.mockMode) {
      console.log(`\n   ⚠️  AI MOCK MODE — set AWS_ACCESS_KEY_ID + AWS_REGION in .env`);
    } else {
      console.log(`\n   ✅ Amazon Bedrock (${process.env.BEDROCK_MODEL_ID || "amazon.nova-pro-v1:0"})`);
    }
    if (dynamoMockMode) {
      console.log(`   ⚠️  DynamoDB MOCK MODE — reading from local JSON files`);
    } else {
      console.log(`   ✅ Amazon DynamoDB (${process.env.AWS_REGION || "us-east-1"})`);
    }
  });
})();

process.on("SIGTERM", async () => { await mcpClient.disconnect(); process.exit(0); });
process.on("SIGINT",  async () => { await mcpClient.disconnect(); process.exit(0); });
