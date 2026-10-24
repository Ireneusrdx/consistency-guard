# Consistency Guard — Architecture

AI reliability evaluation platform. It runs the same question across multiple
AI models, repeatedly, and measures whether the answers agree with each other,
with themselves, and with evidence. It is not a "which AI is best" leaderboard.

Live: https://app.consistencyguard.me · Domain: consistencyguard.me

## System architecture

```mermaid
flowchart TB
    User([User / Recruiter Demo])

    subgraph Client["Client — React 19 + TypeScript + Vite"]
        Pages["16 pages<br/>Auth · Dashboard · Model Selection<br/>Question Workspace · Evaluation Running<br/>Results · Compare · Model Detail<br/>History · Benchmarks · Adversarial<br/>Prompt Intelligence · Reports · Settings"]
        ClientLib["React Router 6 · TanStack Query<br/>Recharts · Tailwind + StyleX<br/>React Hook Form + Zod · Lucide icons"]
        Pages --- ClientLib
    end

    subgraph Server["Server — Node.js + Express + TypeScript (single container)"]
        Middleware["Helmet · CORS · Rate limit<br/>300 req/min on /api · JSON body limit 2 MB"]
        Routes["REST Routes — server/src/routes<br/>/api/auth · /api/providers · /api/evaluations<br/>/api/dashboard · /api/analytics · /api/history<br/>/api/benchmarks · /api/prompts · /api/adversarial<br/>/api/reports · /api/settings"]
        Auth["Auth & Security<br/>JWT sessions · bcrypt password hashing<br/>Lockout after 5 failed attempts<br/>AES-256-GCM encrypted provider API keys<br/>Keys masked in UI, decrypted only server-side"]

        subgraph Engine["Evaluation Engine — server/src/engine"]
            Eval["evaluation.ts — orchestrator<br/>Repeated runs per model"]
            Norm["normalize.ts — response normalization"]
            Claims["claims.ts — fact-claim extraction"]
            Conflicts["conflicts.ts — contradiction detection<br/>direct · numerical · date · definition"]
            Evidence["evidence.ts — evidence support check"]
            Det["deterministic.ts — deterministic scoring<br/>TF-IDF · ROUGE-L · Levenshtein composite<br/>Claim-majority overlap · Numeric/date agreement<br/>Adversarial: paraphrase consistency,<br/>distractor resistance, constraint conflicts"]
            Scoring["scoring.ts · consistency.ts · uncertainty.ts<br/>Reliability · Consistency · Grounding<br/>Cross-model agreement · Hallucination risk"]
            Eval --> Norm --> Claims --> Conflicts
            Claims --> Evidence
            Conflicts --> Det
            Evidence --> Det --> Scoring
        end

        Providers["Provider Registry — server/src/providers<br/>registry.ts · liveModels.ts<br/>Live per-token pricing in INR (Pollinations price feed)"]
        Email["Email — server/src/lib/email.ts<br/>Brevo Transactional HTTP API<br/>Password-reset mail from hello@consistencyguard.me"]
        Reports["Reports — PDFKit<br/>Generated PDFs served only via<br/>authenticated, ownership-checked route"]
    end

    subgraph Data["Data — Prisma ORM"]
        DB[("Neon PostgreSQL — production<br/>SQLite — local development<br/>Same Postgres-compatible schema")]
        Tables["23 tables, grouped:<br/>Identity: User, Session, UserPreference<br/>Providers: AIProvider, AIModel, UserApiCredential<br/>Core: Question, Evaluation, EvaluationRun,<br/>ModelResponse, MetricResult<br/>Analysis: FactClaim, Conflict, EvidenceSource<br/>Benchmarks: Benchmark, BenchmarkQuestion,<br/>BenchmarkRun, UploadedDataset<br/>Prompts & Reports: PromptAnalysis, PromptHistory,<br/>PromptSuggestion, Report, History"]
        DB --- Tables
    end

    subgraph External["External AI Providers"]
        Pollinations["Pollinations — default gateway<br/>gen.pollinations.ai"]
        Direct["Direct adapters<br/>OpenAI · Anthropic · Gemini<br/>Mistral · Llama · Perplexity"]
    end

    subgraph Deploy["Deployment — $0/month"]
        Render["Render — Docker, free tier<br/>One container serves API + built client<br/>Health check: GET /api/health<br/>Migrations run on boot"]
        DNS["Namecheap DNS — consistencyguard.me<br/>ImprovMX: inbound mail forwarding"]
    end

    User -->|HTTPS| Pages
    Pages -->|REST / JSON, JWT| Middleware
    Middleware --> Routes
    Routes --> Auth
    Routes --> Engine
    Routes --> Reports
    Routes --> Email
    Engine --> Providers
    Providers --> Pollinations
    Providers --> Direct
    Routes -->|Prisma Client| DB
    Engine -->|Prisma Client| DB
    Email -->|HTTPS API| Deploy
    Server -.->|deployed as| Render
    Render -.-> DNS
```

## Evaluation flow

```mermaid
flowchart LR
    Q["1. Question<br/>User picks models,<br/>mode and runs<br/>quick / consistency /<br/>deep / adversarial"]
    Run["2. Repeated runs<br/>Same prompt sent<br/>N times per model<br/>Latency, tokens and<br/>cost recorded per run"]
    Norm2["3. Normalize<br/>Clean and align<br/>responses for<br/>fair comparison"]
    Claims2["4. Claims<br/>Extract factual,<br/>numeric and date<br/>claims per response"]
    Check["5. Check<br/>Conflicts between<br/>models + evidence<br/>support per claim"]
    Score["6. Deterministic score<br/>No LLM grades its<br/>own output. TF-IDF,<br/>ROUGE-L, Levenshtein,<br/>claim-majority,<br/>numeric/date agreement"]
    Out["7. Results<br/>Reliability, consistency,<br/>grounding, agreement,<br/>hallucination risk,<br/>cost in INR, explainability"]

    Q --> Run --> Norm2 --> Claims2 --> Check --> Score --> Out
```

## Design decisions that matter

| Decision | Why |
|---|---|
| Deterministic scoring only, no LLM-as-judge for the score | An LLM grading its own family of models is circular. Scores must be reproducible from the responses themselves. The old judge code is disabled and kept for reference. |
| Provider keys encrypted at rest (AES-256-GCM) | Users bring their own keys. Keys are never stored in plain text, never returned in full, and never logged. |
| Single Docker container serves API + client in production | Keeps the free-tier deployment simple and avoids CORS and split-deploy drift. Locally, Vite serves the client separately. |
| Postgres-compatible Prisma schema, SQLite locally | Local development needs zero setup, production on Neon Postgres needs no schema rewrite. |
| Reports never served as static files | A static URL would bypass auth. PDFs go out only through an authenticated, ownership-checked route. |
| Ground truth is labelled honestly | Accuracy is reported only when a reference answer exists. Otherwise results are labelled Cross-Model / Evidence-Based Reliability Analysis, never absolute factual accuracy. |

## Repository layout

```
client/   React 19 + TypeScript + Vite frontend (16 pages)
server/
  src/routes/      REST route handlers (11 route modules)
  src/engine/      Evaluation pipeline and deterministic scoring
  src/providers/   Provider adapters and registry (7 providers)
  src/middleware/  Auth and request guards
  src/lib/         Email (Brevo HTTP API) and shared helpers
  prisma/          Schema (23 models) and migrations
docs/     This architecture document
```
