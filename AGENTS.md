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

## 2. Target AWS Architecture & Phase 2/3 Invariants
- **Authentication**: Isolated CLI profile `AWS_PROFILE=sentinel-ai` configured via `aws login` (`AWS_SDK_LOAD_CONFIG=1`). No blank `AWS_ACCESS_KEY_ID=` or `AWS_SECRET_ACCESS_KEY=` keys.
- **Generative Voice Deterrent (Phase 2 Live)**:
  - **Amazon Bedrock `ConverseCommand`**: Amazon Nova 2 Lite (`us.amazon.nova-2-lite-v1:0`) primary, with automatic 3-model cascade to Nova Lite (`us.amazon.nova-lite-v1:0`) and Nova Micro (`us.amazon.nova-micro-v1:0`). Forced structured tool call (`deterrent_response`) with strict conversation sanitizer (alternating user/assistant turns, 8 turn cap).
  - **Amazon Polly**: Neural voice engine (`Ruth`) synthesizing live deterrent audio, with automatic fallback to Standard engine.
  - **Stage-Safe Failover**: Seamless fallback to realistic mock deterrent if AWS credentials are unconfigured or remote services are unavailable, ensuring zero stage crashes.
- **Mapping & Routing (Phase 3 Live)**:
  - **Amazon Location Service V2**: Map API key `sentinel-ai-maps-key` restricted to `geo-maps:GetTile` and `geo-maps:GetStaticMap` (`https://maps.geo.{region}.amazonaws.com/v2/styles/Standard/descriptor?key={apiKey}&color-scheme=Dark`).
  - **Server-Side Routing**: `@aws-sdk/client-geo-routes` (`CalculateRoutesCommand`) calculating parallel pedestrian routes (Fastest Standard Shortcut vs. Safety-Weighted Brightest Corridor passing verified Safe Havens).
- **Persistence (Phase 3 Live)**:
  - **Amazon DynamoDB**: Table `sentinel-ai-incidents` (`pk: S` HASH, `sk: S` RANGE, PAY_PER_REQUEST billing).
  - Seed items: `pk: "SAFE_HAVEN"` (`HAVEN#1..3`), `pk: "RESPONDER"` (`RESP#1..3`).
  - Incidents: `pk: "INCIDENT"` (`sk: "INC#<incidentId>"`). Deep-merging state updates for `ACTIVE`, `DISPATCHED`, and `RESOLVED` states with reserved keyword aliasing.
- **Real-Time Mesh Sync (Phase 4 Live)**:
  - **AWS AppSync Events**: Managed WebSocket pub/sub API `sentinel-ai-events`, channel `/sentinel/live`, with native `aws-appsync-event-ws` subprotocol client adapter and automatic SSE fallback.
  - **Amazon SNS SOS Fallback**: Topic `sentinel-ai-sos-fallback` publishing SMS-grade beacon payloads with live incident coordinates and Google Maps routing link.
- **Hosting (Phase 4 Live SSR Prep)**:
  - **AWS Amplify Hosting**: Least-privilege compute role `sentinel-ai-amplify-compute-role` granting Bedrock, Polly, GeoRoutes, DynamoDB, SNS, and CloudWatch Logs permissions. Configured via `amplify.yml` for Next.js 16 SSR on Node 22 (`WEB_COMPUTE`).

## 3. Architecture Rule
- All UI components MUST call `src/lib/aws/*` adapters — never import AWS SDKs directly into React components.
- Server-side routes instantiate AWS SDK clients (`BedrockRuntimeClient`, `PollyClient`, `GeoRoutesClient`, `DynamoDBClient`) without explicit credentials, delegating to the AWS default credential provider chain (`sentinel-ai` profile locally, IAM roles on Amplify).

## 4. Security Rule
- Never hardcode AWS keys or secrets.
- Never commit `.env.local` to source control.
- Never execute billable AWS deployment commands without explicit user confirmation.
