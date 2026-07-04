# Vestra 2026 Stack Benchmark

## 1. AI-native property search (RAG)
**Winner: pgvector + Cohere Embed v4 multilingual.** Same Postgres, ACID-consistent with listings, HNSW returns 5-8ms local vs Pinecone 10-20ms. Cohere Embed v4 is only production-grade Swahili/Sheng retrieval per AfriMTEB Oct 2025. Cost 10k/100k/1M users: **$50/$200/$1.2k/mo**.

## 2. Voice-first Swahili/Sheng NLU
**Winner: Deepgram Nova-3 streaming + Whisper large-v3 self-host (AfriSpeech-200 fine-tune) async fallback.** Stock Whisper hits 25%+ WER on Swahili. Google Chirp 2 no Sheng handling + 2x cost. Downstream LLM: **Claude Sonnet 4.6** best at Sheng. Vestra should build 500-example Sheng eval set as moat. Cost 10k/100k/1M MAU: **$100/$800/$6k/mo**.

## 3. Kenya map + geocoding
**Winner: MapTiler tiles + Google Plus Codes.** Google Maps $6-7k/mo at 100k users. MapTiler session pricing undercuts Mapbox 40%. **Plus Codes are the KE-critical piece** — Google partnered Kisumu + Vihiga for 20k+ codes each — de facto addressing for informal settlements and rural counties. Cost 100k loads: **MapTiler $25/mo, Google reverse-geocode $50/mo**.

## 4. Kenya KYC
**Winner: Smile Identity.** Purpose-built for Africa: direct IPRS + KRA PIN integration, Fime Level 2 PAD-certified selfie biometrics (Jan 2025), 5-30s end-to-end. $0.30-1.00 per full biometric KYC. **Only global provider registered as Data Processor with Kenya ODPC.** CBK 2026 digital-lender rules explicitly reference this style flow.

## 5. Payments beyond Daraja
**Winner: IntaSend primary + Flutterwave multi-rail fallback.** IntaSend Nairobi-based, clean REST, first-class B2C disbursement + PesaLink. Flutterwave adds Airtel + cards + pan-African. Fees: IntaSend 3.5% STK / 1.5% Buy Goods, PesaLink 0.5% + KES 20. Negotiate <1.5% once monthly volume clears KES 20M.

## 6. Search infrastructure
**Winner: Typesense.** 16.75ms vs Meilisearch 21.75ms vs Algolia 23ms. Best-in-class geo out of box. Swahili tokenization works via `sw` locale. **$0/$20/$80/mo self-hosted** (fits existing Ubuntu box). Combine with pgvector for hybrid.

## 7. Media pipeline
**Winner: Cloudflare R2 + Bunny.net Optimizer + Bunny CDN.** 2TB storage on R2 = **$30/mo zero egress**. Bunny Optimizer flat $9.50/mo unlimited AVIF/WebP. Bunny CDN egress ~$0.01/GB from JNB + Nairobi PoPs. Cloudinary $99-549/mo at Vestra scale. Total 500k images / 10TB egress: **~$60/mo**.

## 8. Realtime + messaging
**Winner: Soketi self-hosted → Cloudflare Durable Objects at scale.** SSE from Express directly for updates, Soketi (Pusher-compatible) on Ubuntu box until 10k concurrent. Ably Growth $30 scales linearly — $500+ at 100k concurrent. **Skip Ably.** Cost 10k/100k/1M MAU (~1% concurrent): **$0/$50/$600/mo**.

## 9. Observability
**Winner: Grafana Cloud Pro + Sentry (errors + RUM).** Grafana Cloud ~50% Datadog cost every team size. Axiom for logs specifically ($25-99/mo, 10x cheaper than Datadog logs). Sentry RUM $0.45/1k sessions vs Datadog $1.50-1.80. Stack: pino → OTel SDK → Grafana Alloy → Grafana Cloud + Sentry SDK. Cost 50k MAU: **~$150/mo**.

## 10. Job queue
**Winner: BullMQ on existing Redis, watch pg-boss.** Vestra already needs Redis for cache + rate-limit; BullMQ atomic Lua transitions + mature retries + Bull Board UI. Inngest/Trigger.dev for AI/LLM step-durable workflows only. Cost: **$0** (same Redis).

## 11. Feature flags + experimentation
**Winner: PostHog Cloud.** 1M feature-flag requests free monthly, bundles product analytics + session replay. <10k MAU = $0-50/mo. **Consolidate flags + analytics + replay in one vendor.** Statsig has DPA-2019 posture concern (OpenAI-owned). LaunchDarkly enterprise pricing. Cost 10k/100k/1M MAU: **$0/$200/$2k/mo**.

## 12. CI/CD
**Winner: GitHub Actions + Fly.io (jnb region) + Cloudflare Pages + EAS Build.** Fly.io Johannesburg ~40ms to Nairobi vs Render/Railway US-only +250ms. Cost 50k MAU: **$15 Fly + $0 Pages + $99 EAS + $0 GH Actions = ~$115/mo**.

## 13. Mobile push + inbox
**Winner: OneSignal (unlimited free push) + Novu self-hosted orchestration.** OneSignal Capacitor plugin maintained. Novu at month 3 when workflows compound (branching notifications: "escalate SMS if not read in 24h"). Cost 100k devices: **$0-30/mo**.

## 14. AI chat / concierge
**Winner: Claude Sonnet 4.6 default + Haiku 4.6 for classification + prompt caching.** Sonnet 4.6 $3/$15 per M tokens with 1M context — best Sheng of frontier models. Haiku 4.6 (~$1/$5 per M) for query classification. Anthropic prompt caching cuts recurring context cost 90%. Cost 10k/100k/1M chats/mo (4k in + 500 out, 90% cache hit): **$70/$700/$7k/mo**.

## 15. Emerging plays
- **3D tours**: Skip Matterport ($69-300/mo + $350-1k per scan). Use **Google Immersive View** + **iPhone LiDAR + Polycam** ($15/mo). Matterport for luxury >$500k only.
- **Drone**: DJI Mavic 3 + **SkyeBrowse** ($99/mo). Wingtra overkill. KCAA drone operator registration required.
- **Digital signatures**: Kenya Business Laws (Amendment) Act 2020 + KICA make advanced e-sigs binding for tenancy; land title transfers still require wet ink. **Docusign** cross-border + **eSign KE** for KES-denominated agreements.

---

## Stack decision matrix (50k MAU)

| Area | Recommendation | Migration effort | ~Monthly cost |
|---|---|---|---|
| Vector search | pgvector + Cohere Embed v4 | 3 days | $120 |
| Voice ASR | Deepgram Nova-3 + Whisper self-host | 2 weeks | $400 |
| Maps | MapTiler + Leaflet + Plus Codes | 1 day | $50 |
| KYC | Smile Identity | 2 weeks | $500 (usage) |
| Payments | Daraja + IntaSend + Flutterwave | 3 weeks | % of GMV |
| Search | Typesense self-hosted | 3 days | $20 |
| Media | R2 + Bunny Optimizer + Bunny CDN | 2 days | $60 |
| Realtime | Soketi self-hosted (SSE + WS) | 1 day | $30 |
| Observability | Grafana Cloud + Sentry | 1 week | $150 |
| Job queue | BullMQ on existing Redis | 2 days | $0 |
| Feature flags | PostHog Cloud | 2 days | $50 |
| CI/CD | GH Actions + Fly.io jnb + CF Pages + EAS | 2 weeks | $115 |
| Push | OneSignal + Novu self-host | 3 days | $30 |
| AI chat | Claude Sonnet 4.6 + Haiku 4.6 + caching | 1 week | $350 |
| 3D / eSign | Immersive View + Polycam; Docusign + eSign KE | 1 week | $80 |

**Total 50k MAU: ~$2,000/mo** (excluding % payment fees and KYC per-verification).

---

## 90-day migration plan

**Weeks 1-3 — foundation, zero user risk.** Enable pgvector on existing Postgres. Deploy Typesense Docker container. Prisma middleware fan-out to both indexes. Migrate media to R2 + Bunny. Add pino + OTel SDK → Grafana Cloud free tier. Wire Sentry errors + RUM. Add BullMQ to existing Redis. Ship OneSignal push via Capacitor plugin.

**Weeks 4-7 — trust unlock via payments + KYC.** Integrate Smile Identity behind /kyc route, gate landlord verification on National ID + KRA PIN + selfie liveness. Wrap Daraja + IntaSend behind internal `PaymentProvider` interface. Add IntaSend for B2B landlord payouts (biggest manual pain point at every KE proptech). Flutterwave as card + Airtel + fallback. Wire eSign KE for tenancy agreements.

**Weeks 8-11 — AI moat.** Batch-embed all 50k listings via Cohere Embed v4 ($5 one-time). RAG endpoint: Typesense keyword+geo → pgvector semantic re-rank → Claude Sonnet 4.6 with prompt-cached Kenya context. Voice search: Deepgram Nova-3 streaming, Whisper large-v3 async on $50/mo GPU box. Start 500-example Sheng eval set — permanent AI moat, fundraising artifact.

**Weeks 12-13 — production polish.** MapTiler tile migration, Plus Codes on every listing, PostHog feature flags on risky flows.

**Defer explicitly:** Fly.io migration (only when Ubuntu box strains, probably 100k MAU), Cloudflare Durable Objects (Soketi handles <10k concurrent), Matterport (luxury tier only), Novu orchestration (add when workflows branch), LaunchDarkly tier flag governance, dedicated vector DB migration. All "problems of success" — premature to solve.
