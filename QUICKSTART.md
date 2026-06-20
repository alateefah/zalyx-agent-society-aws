# Quick Start — Zalyx Agent Society

## Prerequisites

- Node.js 20+
- AWS account with Bedrock model access ([enable here](https://console.aws.amazon.com/bedrock/home#/modelaccess))
- AWS credentials with Bedrock + DynamoDB permissions

## Setup (5 minutes)

```bash
# 1. Clone
git clone https://github.com/alateefah/zalyx-agent-society-aws.git
cd zalyx-agent-society-aws

# 2. Install
npm install
cd frontend && npm install && cd ..

# 3. Configure
cp .env.example .env
# Edit .env — add your AWS credentials and region
```

`.env` minimum:
```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0
```

> **No AWS account yet?** Set `BEDROCK_MOCK_MODE=true` — all agents return realistic demo responses and DynamoDB falls back to local JSON files.

## Run

```bash
npm run dev
```

- API: http://localhost:3001
- UI: http://localhost:5173

DynamoDB tables (`zalyx-merchants`, `zalyx-decisions`) are created automatically on first boot and seeded with the three demo merchants.

## What to expect

```
🔧 Initialising AWS services...
  ✅ DynamoDB table exists: zalyx-merchants
  ✅ DynamoDB table exists: zalyx-decisions
🚀 Zalyx Agent Society API → http://localhost:3001
   ✅ Amazon Bedrock (amazon.nova-pro-v1:0)
   ✅ Amazon DynamoDB (us-east-1)

📊 Starting underwriting for Bright Future Academy (School)...
🔍 Stage 1+2: Data Quality + Business Analysis (parallel)
   🔌 MCP check_cbn_compliance → clear
   🔌 MCP get_industry_benchmarks → School benchmarks loaded
⚠️  Stage 3: Risk Assessment
   🔌 MCP get_sector_default_rate → 6.4% default rate for School/moderate
🔄 Stage 3b: Business Agent Rebuttal
⚖️  Stage 3c: Risk Agent Final Verdict
💰 Stage 4: Financing Structure (Murabaha)
👤 Stage 5: Human Review → APPROVED
💾 Saved decision: ZALYX-001 → approved
```

## Benchmark

```bash
npm run benchmark
# Results written to benchmark/results.md
```

## Project structure

```
zalyx-agent-society-aws/
├── agents/                     # Five underwriting agents
├── mcp-server/                 # MCP tools (CBN compliance, benchmarks, default rates)
├── orchestration/              # Pipeline orchestrator (parallel stages, conditional debate)
├── utils/
│   ├── bedrock-client.ts       # Amazon Bedrock (Converse API, tool use)
│   ├── dynamo.ts               # Amazon DynamoDB (merchants + decisions tables)
│   ├── tool-definitions.ts     # Shared tool schemas
│   ├── murabaha-engine.ts      # Pure Murabaha math (testable)
│   └── types.ts                # All TypeScript types
├── frontend/                   # React + Vite (deploy to Vercel)
├── data/snapshots/             # Demo merchant JSON (seeded into DynamoDB on boot)
├── benchmark/                  # Benchmark runner + committed results
├── tests/                      # 32 unit + integration tests
├── server.ts                   # Express API
├── docker-compose.yml
└── .env.example
```

## Troubleshooting

**"No AWS credentials found — DynamoDB running in MOCK mode"**
→ Add `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` to `.env`

**Bedrock returns 403 / AccessDeniedException**
→ Enable model access in AWS Console → Bedrock → Model access

**DynamoDB ResourceNotFoundException**
→ Tables are auto-created on boot — check your IAM role has `dynamodb:CreateTable` permission

**Run without any AWS setup**
→ Set `BEDROCK_MOCK_MODE=true` in `.env` — fully functional with mock AI responses
