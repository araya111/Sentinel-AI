<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sentinel AI — Project Guardrails & Architecture Invariants

## 1. Core Framework & Constraints
- **Framework**: Next.js 16 (App Router, Turbopack), React 19, TypeScript strict (`"strict": true`), Tailwind CSS v4 (CSS-first, `@import "tailwindcss";`, no legacy `tailwind.config.ts`).
- **Next.js 16 Compatibility**:
  - Do NOT export legacy `export const dynamic = 'force-dynamic'` or `export const runtime = 'nodejs'` in any page or route handler (conflicts with Next.js 16 `cacheComponents`).
  - Keep `Date.now()`, `new Date()`, `Math.random()`, and `crypto.randomUUID()` strictly inside `'use client'` components, event callbacks, or request-time API handlers (after reading `request` / `request.signal`), never in prerendered Server Component bodies.
  - Zero `any` type casts and zero `@ts-ignore`.

## 2. Target AWS Architecture (Phases 2–4)
- **Generative Voice Deterrent**: **Amazon Bedrock — Amazon Nova 2 Sonic** (`amazon.nova-2-sonic-v1:0`) for native speech-to-speech, OR **Claude Haiku 4.5** (`global.anthropic.claude-haiku-4-5-20251001-v1:0`) + Amazon Polly Neural fallback. Never use retired `claude-3-haiku`.
- **Mapping & Routing**: **Amazon Location Service V2** via API key (`https://maps.geo.{region}.amazonaws.com/v2/styles/Standard/descriptor?key={apiKey}&color-scheme=Dark`) + `@aws-sdk/client-geo-routes`. Never use legacy V1 Map or RouteCalculator resource names.
- **Real-Time Mesh Sync**: **AWS AppSync Events** (managed WebSocket pub/sub) + **Amazon DynamoDB** + **Amazon SNS** SMS fallback.
- **Hosting**: **AWS Amplify**.

## 3. Architecture Rule
- All UI components MUST call `src/lib/aws/*` adapters — never import AWS SDKs directly into React components.
- In Phase 1, `NEXT_PUBLIC_USE_MOCK_AWS=true` activates local adapters, falling back gracefully to live AWS endpoints in future phases.

## 4. Security Rule
- Never hardcode AWS keys or secrets.
- Never commit `.env.local` to source control.
- Never execute billable AWS deployment commands without explicit user confirmation.
