# Frontend Architecture

React + Vite + TypeScript. Deployed on Vercel. Calls the Express backend via `/api/*` proxy.

## Directory structure

```
frontend/src/
├── types/
│   └── index.ts              # All TypeScript interfaces (merchant, report, events, history)
├── utils/
│   ├── api.ts                # All fetch calls — fetchMerchants, streamUnderwriting, fetchDecisionHistory, etc.
│   ├── constants.ts          # DEMO_MERCHANTS fallback, AGENT_META, MSG_TYPE_STYLE, RISK_MAP
│   └── format.ts             # fmt() currency formatter, fmtDate(), fmtTime()
├── hooks/
│   ├── useMerchants.ts       # Load merchants from DynamoDB, select/add merchant, isMock state
│   └── useUnderwriting.ts    # Run underwriting via SSE, track view state, load previous reports
├── components/
│   ├── layout/
│   │   └── Header.tsx        # Top bar — logo, live/mock badge, back button
│   ├── merchant/
│   │   ├── MerchantCard.tsx  # Clickable card in the demo grid
│   │   └── MerchantSnapshot.tsx  # Key-value preview of the selected merchant
│   ├── underwriting/
│   │   ├── PipelineSteps.tsx # 5-step pipeline diagram shown above the form
│   │   └── CustomJsonInput.tsx   # Textarea + JSON validation for custom merchant entry
│   ├── processing/
│   │   └── ProcessingView.tsx    # Spinner + live SSE transcript during agent run
│   ├── report/
│   │   ├── AgentCard.tsx     # Collapsible card for a single agent message
│   │   └── ReportView.tsx    # Full report — comparison strip, scores, transcript, export
│   └── history/
│       └── DecisionHistoryPanel.tsx  # Collapsible past-decisions panel; click any row to reload report
└── App.tsx                   # Thin coordinator — composes hooks + components, no business logic
```

## Data flow

```
DynamoDB ──► fetchMerchants() ──► useMerchants ──► MerchantCard grid
                                                  └► MerchantSnapshot preview

[Run underwriting]
  ├─ fetchBaseline()           ──► BaselineReport
  └─ streamUnderwriting() SSE  ──► ProcessingView (live)
                                └► ReportView (final)

[Click past decision]
  fetchDecisionHistory(merchantId) ──► DecisionHistoryPanel rows
  click row ──► loadPreviousReport(fullReport) ──► ReportView
```

## Adding a new merchant type

1. Add the merchant JSON to `data/snapshots/` in the backend.
2. Add an entry to `RISK_MAP` in `utils/constants.ts` with the matching `businessType` string.

## Environment variables

| Variable       | Purpose                                    |
|----------------|--------------------------------------------|
| `VITE_API_URL` | Backend base URL (empty = relative, for local dev) |

Set in Vercel project settings for production. Leave empty for `npm run dev`.

## Coding conventions

- **No business logic in App.tsx** — it only composes hooks and components.
- **API calls live in `utils/api.ts`** — no `fetch()` calls inside components or hooks directly.
- **Types live in `types/index.ts`** — no inline interface declarations in component files.
- **CSS classes stay in `App.css`** — no CSS modules or Tailwind; keep the existing class naming.
