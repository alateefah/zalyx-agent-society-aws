/**
 * DynamoDB Client — Zalyx Underwriting
 *
 * Two tables:
 *   zalyx-merchants   — merchant snapshots (partition key: id)
 *   zalyx-decisions   — underwriting reports (partition key: merchantId, sort key: requestId)
 *                        GSI: decision-index (decision HASH, createdAt RANGE)
 *                        → supports querying all approvals / rejections across merchants
 *
 * Uses DynamoDBDocumentClient for transparent JSON marshalling.
 * Falls back to local JSON files when AWS credentials are absent (mock mode).
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  ResourceNotFoundException,
  ProjectionType,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import path from "path";
import { ZalyxMerchantSnapshot, UnderwritingReport } from "./types";

// ── Config ────────────────────────────────────────────────────────────────────

const REGION = process.env.AWS_REGION || "us-east-1";
const MERCHANTS_TABLE = process.env.DYNAMODB_MERCHANTS_TABLE || "zalyx-merchants";
const DECISIONS_TABLE = process.env.DYNAMODB_DECISIONS_TABLE || "zalyx-decisions";

// ── Client setup ─────────────────────────────────────────────────────────────

let _docClient: DynamoDBDocumentClient | null = null;
export let dynamoMockMode = false;

function getDocClient(): DynamoDBDocumentClient {
  if (_docClient) return _docClient;

  const hasCredentials =
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.AWS_PROFILE ||
    fs.existsSync(path.join(process.env.HOME || "", ".aws", "credentials"));

  if (!hasCredentials && !process.env.AWS_REGION) {
    console.warn(
      "⚠️  No AWS credentials found — DynamoDB running in MOCK mode (reads from local JSON files)"
    );
    dynamoMockMode = true;
  }

  const raw = new DynamoDBClient({ region: REGION });
  _docClient = DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return _docClient;
}

// ── Table provisioning ────────────────────────────────────────────────────────

async function waitForActive(client: DynamoDBClient, tableName: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (Table?.TableStatus === "ACTIVE") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Table ${tableName} did not become ACTIVE in time`);
}

async function ensureTable(
  client: DynamoDBClient,
  tableName: string,
  keySchema: { AttributeName: string; KeyType: "HASH" | "RANGE" }[],
  attributeDefinitions: { AttributeName: string; AttributeType: "S" | "N" | "B" }[],
  globalSecondaryIndexes?: {
    IndexName: string;
    KeySchema: { AttributeName: string; KeyType: "HASH" | "RANGE" }[];
    Projection: { ProjectionType: ProjectionType };
  }[]
): Promise<void> {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (Table?.TableStatus !== "ACTIVE") {
      console.log(`  ⏳ Waiting for table to become ACTIVE: ${tableName}`);
      await waitForActive(client, tableName);
    }
    console.log(`  ✅ DynamoDB table exists: ${tableName}`);
  } catch (err: any) {
    if (err instanceof ResourceNotFoundException || err?.name === "ResourceNotFoundException") {
      console.log(`  📦 Creating DynamoDB table: ${tableName}...`);
      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: keySchema,
          AttributeDefinitions: attributeDefinitions,
          BillingMode: "PAY_PER_REQUEST",
          ...(globalSecondaryIndexes ? { GlobalSecondaryIndexes: globalSecondaryIndexes } : {}),
        })
      );
      console.log(`  ⏳ Waiting for ${tableName} to become ACTIVE...`);
      await waitForActive(client, tableName);
      console.log(`  ✅ Created: ${tableName}`);
    } else {
      throw err;
    }
  }
}

/** Add the decision-index GSI to an existing decisions table if it's missing. */
async function ensureDecisionGsi(client: DynamoDBClient): Promise<void> {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: DECISIONS_TABLE }));
    const hasGsi = Table?.GlobalSecondaryIndexes?.some((g) => g.IndexName === "decision-index");
    if (hasGsi) return;

    console.log("  📦 Adding decision-index GSI to decisions table...");
    await client.send(
      new UpdateTableCommand({
        TableName: DECISIONS_TABLE,
        AttributeDefinitions: [
          { AttributeName: "decision", AttributeType: "S" },
          { AttributeName: "createdAt", AttributeType: "S" },
        ],
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: "decision-index",
              KeySchema: [
                { AttributeName: "decision", KeyType: "HASH" },
                { AttributeName: "createdAt", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          },
        ],
      })
    );
    console.log("  ✅ decision-index GSI created (propagating in background)");
  } catch (err: any) {
    // If GSI creation fails (e.g. already exists or insufficient perms) just warn — not fatal
    if (!err?.message?.includes("already exists")) {
      console.warn("  ⚠️  Could not add decision-index GSI:", err?.message);
    }
  }
}

// ── Seed from local JSON snapshots ───────────────────────────────────────────

async function seedMerchantsIfEmpty(docClient: DynamoDBDocumentClient): Promise<void> {
  const snapshotsDir = path.join(__dirname, "../data/snapshots");
  if (!fs.existsSync(snapshotsDir)) return;

  const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return;

  for (const file of files) {
    const snapshot: ZalyxMerchantSnapshot = JSON.parse(
      fs.readFileSync(path.join(snapshotsDir, file), "utf-8")
    );

    // Only seed if not already present
    const existing = await docClient.send(
      new GetCommand({ TableName: MERCHANTS_TABLE, Key: { id: snapshot.id } })
    );
    if (!existing.Item) {
      await docClient.send(
        new PutCommand({ TableName: MERCHANTS_TABLE, Item: { ...snapshot } })
      );
      console.log(`  📥 Seeded merchant: ${snapshot.id} (${snapshot.businessName})`);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Initialise tables and seed merchant data. Call once on server start. */
export async function initDynamo(): Promise<void> {
  if (dynamoMockMode) {
    console.log("  ⚠️  DynamoDB mock mode — skipping table init");
    return;
  }

  try {
    const rawClient = new DynamoDBClient({
      region: REGION,
      ...(process.env.AWS_ENDPOINT_URL
        ? { endpoint: process.env.AWS_ENDPOINT_URL }
        : {}),
    });
    
    const docClient = getDocClient();

    await ensureTable(
      rawClient,
      MERCHANTS_TABLE,
      [{ AttributeName: "id", KeyType: "HASH" }],
      [{ AttributeName: "id", AttributeType: "S" }]
    );

    await ensureTable(
      rawClient,
      DECISIONS_TABLE,
      [
        { AttributeName: "merchantId", KeyType: "HASH" },
        { AttributeName: "requestId", KeyType: "RANGE" },
      ],
      [
        { AttributeName: "merchantId", AttributeType: "S" },
        { AttributeName: "requestId", AttributeType: "S" },
        { AttributeName: "decision", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
      ],
      [
        {
          IndexName: "decision-index",
          KeySchema: [
            { AttributeName: "decision", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: ProjectionType.ALL },
        },
      ]
    );
    // Ensure the GSI exists on already-provisioned tables
    await ensureDecisionGsi(rawClient);

    await seedMerchantsIfEmpty(docClient);
    console.log("✅ DynamoDB ready");
  } catch (err) {
    console.error("❌ DynamoDB init failed — falling back to mock mode:", err);
    dynamoMockMode = true;
  }
}

/** Load a merchant snapshot by ID. Falls back to local JSON in mock mode. */
export async function getMerchantSnapshot(id: string): Promise<ZalyxMerchantSnapshot | null> {
  if (dynamoMockMode) {
    const filePath = path.join(__dirname, `../data/snapshots/${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ZalyxMerchantSnapshot;
  }

  const result = await getDocClient().send(
    new GetCommand({ TableName: MERCHANTS_TABLE, Key: { id } })
  );
  return (result.Item as ZalyxMerchantSnapshot) ?? null;
}

/** List all merchant snapshots. */
export async function listMerchants(): Promise<ZalyxMerchantSnapshot[]> {
  if (dynamoMockMode) {
    const snapshotsDir = path.join(__dirname, "../data/snapshots");
    if (!fs.existsSync(snapshotsDir)) return [];
    return fs
      .readdirSync(snapshotsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(snapshotsDir, f), "utf-8")));
  }

  const result = await getDocClient().send(
    new ScanCommand({ TableName: MERCHANTS_TABLE })
  );
  return (result.Items as ZalyxMerchantSnapshot[]) ?? [];
}

/** Upsert a merchant snapshot — called when a custom merchant is submitted. */
export async function saveMerchantSnapshot(snapshot: ZalyxMerchantSnapshot): Promise<void> {
  if (dynamoMockMode) return;
  await getDocClient().send(
    new PutCommand({ TableName: MERCHANTS_TABLE, Item: { ...snapshot } })
  );
  console.log(`  💾 Saved merchant: ${snapshot.id} (${snapshot.businessName})`);
}

/** Persist a completed underwriting report. */
export async function saveUnderwritingDecision(report: UnderwritingReport): Promise<void> {
  if (dynamoMockMode) {
    // In mock mode, just log — no persistence
    console.log(`  📝 [Mock] Would save decision for ${report.merchantId} (${report.humanReview.finalRecommendation})`);
    return;
  }

  await getDocClient().send(
    new PutCommand({
      TableName: DECISIONS_TABLE,
      Item: {
        merchantId: report.merchantId,
        requestId: report.observability.requestId,
        decision: report.humanReview.finalRecommendation,
        approvedAmountNaira: report.humanReview.approvedAmountNaira ?? 0,
        createdAt: new Date().toISOString(),
        report, // full JSON blob
      },
    })
  );
  console.log(
    `  💾 Saved decision: ${report.merchantId} → ${report.humanReview.finalRecommendation} (requestId: ${report.observability.requestId})`
  );
}

/** Retrieve all past decisions for a merchant, newest first. */
export async function getDecisionsForMerchant(
  merchantId: string
): Promise<UnderwritingReport[]> {
  if (dynamoMockMode) return [];

  const result = await getDocClient().send(
    new QueryCommand({
      TableName: DECISIONS_TABLE,
      KeyConditionExpression: "merchantId = :mid",
      ExpressionAttributeValues: { ":mid": merchantId },
      ScanIndexForward: false, // newest first
    })
  );

  return ((result.Items ?? []) as any[]).map((item) => item.report as UnderwritingReport);
}

/**
 * Query all decisions of a specific type using the decision-index GSI.
 * Access pattern: "show me all approvals" / "show all rejections" across every merchant.
 * @param decisionType "approved" | "rejected" | "requires-clarification"
 * @param limit max results (default 50)
 */
export async function listDecisionsByType(
  decisionType: "approved" | "rejected" | "requires-clarification",
  limit = 50
): Promise<{ merchantId: string; requestId: string; decision: string; createdAt: string; approvedAmountNaira?: number }[]> {
  if (dynamoMockMode) return [];

  const result = await getDocClient().send(
    new QueryCommand({
      TableName: DECISIONS_TABLE,
      IndexName: "decision-index",
      KeyConditionExpression: "#d = :dt",
      ExpressionAttributeNames: { "#d": "decision" },
      ExpressionAttributeValues: { ":dt": decisionType },
      ScanIndexForward: false, // newest first
      Limit: limit,
      ProjectionExpression: "merchantId, requestId, #d, createdAt, approvedAmountNaira",
    })
  );

  return (result.Items ?? []) as any[];
}
