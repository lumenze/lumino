# Lumino — Security & Compliance Implementation Plan

> **Last updated:** March 2026
> **Status:** Phase 1 MVP — Pre-pilot

---

## Table of Contents

1. [Overview](#overview)
2. [Deployment Models](#deployment-models)
3. [Current Security Posture](#current-security-posture)
4. [Known Gaps](#known-gaps)
5. [SaaS Security Architecture](#saas-security-architecture)
6. [Phased Remediation Roadmap](#phased-remediation-roadmap)
7. [Compliance Frameworks](#compliance-frameworks)
8. [Data Privacy](#data-privacy)

---

## Overview

Lumino is an AI-native digital adoption platform with an embeddable SDK for in-app walkthroughs. The **primary deployment model is SaaS** (multi-tenant cloud), which enables AI-powered features like auto-healing, intelligent relevance scoring, and behavioral analytics that require centralized ML infrastructure. An **on-premise option** will be available for regulated industries with strict data residency requirements, though with reduced AI capabilities.

This document outlines what security controls exist today and the roadmap toward enterprise / regulated-industry readiness (banking, healthcare, etc.).

---

## Deployment Models

### SaaS (Primary — Recommended)

The SaaS model is Lumino's primary offering. Customers embed the SDK in their web app; all server-side processing, AI inference, and data storage runs on Lumino's cloud infrastructure.

**Why SaaS is primary:**
- **AI features require centralized infrastructure** — Auto-healing (DOM change detection + selector repair), ML-based relevance scoring, behavioral pattern analysis, and cross-customer model training all need GPU compute and shared model serving that is impractical to ship on-premise
- **Continuous improvement** — AI models improve across the customer base (federated / aggregated, never sharing raw data between tenants)
- **Zero maintenance** — Customers don't manage servers, databases, or upgrades
- **Faster iteration** — New features ship instantly without customer-side deployments

**SaaS architecture:**

```
Customer's Web App
  └── Lumino SDK (embedded, runs in browser)
        ├── Walkthrough rendering (Shadow DOM, local)
        ├── Event capture (local → encrypted → Lumino Cloud)
        └── Auth (JWT issued by customer's backend → verified by Lumino)

Lumino Cloud (multi-tenant)
  ├── API Gateway (TLS, rate limiting, tenant isolation)
  ├── Walkthrough Service (CRUD, versioning, publishing)
  ├── Analytics Service (events, aggregation, dashboards)
  ├── AI Services
  │   ├── Auto-healing engine (selector repair on DOM changes)
  │   ├── Relevance scoring (who needs what walkthrough)
  │   └── Behavioral analysis (drop-off prediction, CX signals)
  ├── PostgreSQL (per-tenant schema or row-level isolation)
  └── Redis (caching, rate limiting)
```

### On-Premise (Enterprise Option)

For customers in highly regulated industries (banking, healthcare, government) who cannot send data off-network, Lumino offers an on-premise Docker Compose deployment.

**Trade-offs:**
| Capability | SaaS | On-Premise |
|-----------|------|------------|
| Core walkthrough engine | Full | Full |
| Recording & replay | Full | Full |
| Analytics & dashboards | Full | Full |
| Auto-healing (AI) | Full (cloud GPU) | Limited (rule-based fallback, no ML) |
| Relevance scoring (AI) | Full (ML models) | Limited (rule-based only) |
| Behavioral analysis | Full (cross-customer patterns) | Single-tenant only |
| Model updates | Continuous | Manual update cycles |
| Maintenance burden | Zero (Lumino-managed) | Customer-managed |

**On-premise AI considerations:**
- Auto-healing falls back to heuristic-based selector repair (CSS specificity matching, attribute proximity) instead of ML-based prediction
- Relevance scoring uses rule-based triggers (role, page, behavior counters) without ML personalization
- Customers can optionally allow outbound calls to Lumino's AI API for enhanced features while keeping all user data on-premise (hybrid model)

### Hybrid Model (Future)

A middle ground for regulated customers who want AI capabilities:
- All user data and PII stays on-premise
- Only anonymized, aggregated signals (e.g., "selector `#btn-submit` broke on 40% of sessions") are sent to Lumino Cloud for AI processing
- AI responses (e.g., "suggested new selector: `button[data-action='submit']`") are returned without Lumino ever seeing user data
- Customer controls exactly what signals leave their network via allowlist configuration

---

## Current Security Posture

### Authentication & Authorization

| Control | Status | Details |
|---------|--------|---------|
| JWT-based auth | Implemented | HS256 HMAC with configurable secret via `JWT_SECRET` env var |
| Timing-safe signature verification | Implemented | `crypto.timingSafeEqual` prevents timing attacks (`modules/auth/index.ts`) |
| Token expiration enforcement | Implemented | Server rejects expired tokens; SDK detects and re-authenticates |
| Role-based access control (RBAC) | Implemented | Three roles: `admin`, `author`, `customer` — enforced via `requireRole()` middleware |
| Zod claim validation | Implemented | JWT payload validated against `LuminoJwtPayloadSchema` after decode |

### Input Validation & Injection Prevention

| Control | Status | Details |
|---------|--------|---------|
| Zod request validation | Implemented | All API endpoints validate request bodies/params with Zod schemas |
| Prisma ORM (SQL injection prevention) | Implemented | No raw SQL queries — all DB access through Prisma parameterized queries |
| HTML escaping in SDK | Implemented | `escapeHtml()` utility sanitizes walkthrough content before DOM injection |
| Shadow DOM isolation | Implemented | SDK UI renders inside Shadow DOM, preventing CSS/JS leakage into host app |

### Infrastructure

| Control | Status | Details |
|---------|--------|---------|
| On-premise deployment | Implemented | Docker Compose — data never leaves customer network |
| Environment-based configuration | Implemented | Secrets via env vars, not hardcoded in source |
| PostgreSQL with Prisma | Implemented | Structured data storage with migration-based schema management |
| Redis for caching | Implemented | Session/config caching layer |

---

## Known Gaps

### Critical (Must fix before pilot)

| Gap | Risk | Remediation |
|-----|------|-------------|
| **Wildcard CORS (`*`)** | Any origin can call the API with a user's credentials | Restrict to explicit allowed origins via `ALLOWED_ORIGINS` env var |
| **Hardcoded JWT secret default** | Dev secret (`dev-secret-change-in-production`) ships in code — if env var is unset, production uses a guessable secret | Remove default; fail fast on startup if `JWT_SECRET` is not set in production |
| **Redis without authentication** | Any container on the Docker network can read/write Redis | Enable `requirepass` in Redis config; pass `REDIS_PASSWORD` env var |
| **No TLS / HTTPS enforcement** | Traffic between browser → server → DB is unencrypted | Add TLS termination (reverse proxy or Node TLS); enforce `Secure` flag on tokens |
| **No rate limiting** | API is vulnerable to brute-force and abuse | Add `@fastify/rate-limit` with configurable thresholds per endpoint |

### High (Before enterprise pilots)

| Gap | Risk | Remediation |
|-----|------|-------------|
| **No audit logging** | Cannot trace who did what — required for SOC 2, HIPAA | Add structured audit log for auth events, admin actions, data access |
| **No data retention policy** | Analytics events accumulate indefinitely | Implement configurable TTL with automated cleanup job |
| **PII in analytics** | `userId` and `pageUrl` stored in analytics events may contain PII | Hash or pseudonymize user identifiers; strip query params from URLs |
| **No CSRF protection** | State-changing endpoints lack CSRF tokens | Add `@fastify/csrf-protection` or use SameSite cookie attributes |
| **No request size limits** | Large payloads could cause OOM | Configure `bodyLimit` on Fastify and per-route max sizes |
| **No Content Security Policy** | SDK-injected content lacks CSP headers | Define and enforce CSP for SDK iframe/shadow DOM context |

### Medium (Enterprise readiness)

| Gap | Risk | Remediation |
|-----|------|-------------|
| **No encryption at rest** | Database and Redis data stored unencrypted on disk | Enable PostgreSQL TDE or volume-level encryption; Redis persistence encryption |
| **No key rotation** | JWT secret is static — compromise requires manual rotation | Implement key versioning with graceful rollover (accept old key for N minutes) |
| **No vulnerability scanning** | Dependencies may have known CVEs | Add `npm audit` / Snyk / Trivy to CI pipeline |
| **No penetration testing** | No third-party security validation | Schedule annual pentest before enterprise launch |

---

## SaaS Security Architecture

The SaaS model introduces additional security requirements beyond on-premise. This section covers the multi-tenant cloud security plan.

### Tenant Isolation

| Layer | Strategy | Details |
|-------|----------|---------|
| **Data isolation** | Row-level security (RLS) | Every DB row tagged with `tenantId`; Prisma middleware enforces tenant context on every query |
| **Schema isolation** (enterprise tier) | Separate PostgreSQL schemas | For banking/healthcare customers who require physical data separation |
| **API isolation** | Tenant-scoped JWT claims | `tenantId` embedded in JWT; server validates tenant context on every request |
| **Network isolation** | VPC per region | Customer data stays in their chosen region (US, EU, APAC) |
| **Cache isolation** | Redis key prefixing | All Redis keys prefixed with `tenant:{id}:` to prevent cross-tenant leakage |

### SaaS Authentication Flow

```
Customer Backend                    Lumino Cloud
     │                                   │
     │  1. Generate JWT with:             │
     │     - sub (user ID)                │
     │     - role (admin/author/customer) │
     │     - tenantId (Lumino org ID)     │
     │     - Signed with shared secret    │
     │                                    │
     └──── SDK sends JWT ───────────────→ │
                                          │  2. Verify signature (timing-safe)
                                          │  3. Validate claims (Zod)
                                          │  4. Extract tenantId → scope all queries
                                          │  5. Return tenant-scoped data
```

### Data in Transit

| Path | Encryption | Status |
|------|-----------|--------|
| Browser → Lumino Cloud API | TLS 1.3 (mandatory) | Phase 2 |
| Lumino API → PostgreSQL | TLS (within VPC) | Phase 2 |
| Lumino API → Redis | TLS (within VPC) | Phase 2 |
| Lumino API → AI Services | mTLS (service mesh) | Phase 3 |
| SDK → Customer Backend (token fetch) | Customer's HTTPS | Customer responsibility |

### Data at Rest

| Store | Encryption | Status |
|-------|-----------|--------|
| PostgreSQL | AES-256 (AWS RDS / volume encryption) | Phase 3 |
| Redis | In-memory only (no persistence in SaaS) | N/A |
| AI model storage | Encrypted S3 buckets | Phase 3 |
| Backups | Encrypted + access-logged | Phase 3 |

### Multi-Tenant AI Security

| Concern | Mitigation |
|---------|-----------|
| **Cross-tenant data leakage in ML** | Models trained on aggregated, anonymized metrics only — never raw user data. No tenant's walkthrough content enters another tenant's context |
| **Prompt injection via walkthrough content** | AI services receive structured selector data, not free-text user input. Content is sanitized before AI processing |
| **Model poisoning** | Anomaly detection on input signals; outlier tenants excluded from aggregate training |
| **AI decision auditability** | All AI recommendations (selector repairs, relevance scores) logged with reasoning for customer review |

---

## Phased Remediation Roadmap

### Phase 1 — Immediate (Before next demo)

1. **Lock down CORS** — Replace wildcard with explicit origin allowlist
2. **Remove JWT secret default** — Fail on startup if `JWT_SECRET` env var is missing
3. **Enable Redis auth** — Add `requirepass` in Redis config; pass `REDIS_PASSWORD` env var
4. **Add rate limiting** — `@fastify/rate-limit` on auth and analytics endpoints

### Phase 2 — Pre-Pilot / SaaS Launch

5. **TLS everywhere** — All traffic encrypted; TLS 1.3 for browser-facing, TLS within VPC for internal
6. **Tenant isolation** — Add `tenantId` to JWT claims, Prisma middleware for row-level scoping
7. **Audit logging** — Structured logs for: login, role changes, walkthrough publish/unpublish, data access, admin actions
8. **Data retention** — Configurable TTL per tenant for analytics events (default 90 days), automated purge cron
9. **PII handling** — Hash `userId` in analytics, strip URL query params, document what data is collected
10. **CSRF protection** — Token-based CSRF or strict SameSite cookies
11. **Request size limits** — 1MB default body limit, 100-event batch cap (already enforced)
12. **Security headers** — `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`
13. **API gateway** — Centralized auth, rate limiting, tenant routing, DDoS protection
14. **Data residency** — Region-aware deployment (US, EU) for customer data locality requirements

### Phase 3 — Enterprise / Regulated Industry Readiness

15. **Encryption at rest** — AWS RDS encryption, encrypted backups, encrypted S3 for AI models
16. **Key rotation** — JWT key versioning with graceful rollover window
17. **CI security scanning** — `npm audit`, container scanning (Trivy), SAST in CI pipeline
18. **SOC 2 Type II** — Formal policies, access controls, continuous monitoring, annual audit
19. **GDPR compliance** — Right-to-delete API, data export (Article 15), consent management, DPA template
20. **HIPAA readiness** — BAA template, PHI isolation, access logging (for healthcare customers)
21. **Penetration testing** — Third-party annual assessment + bug bounty program
22. **BYOK (Bring Your Own Key)** — Customer-managed encryption keys for enterprise tier
23. **AI security hardening** — Model input validation, cross-tenant isolation in ML pipelines, decision audit trail
24. **On-premise package** — Hardened Docker images, offline installer, customer-managed upgrade path

### Phase 4 — Scale & Advanced AI Security

25. **Hybrid deployment support** — On-prem data plane + cloud AI plane with anonymized signal bridge
26. **Zero-trust networking** — mTLS between all internal services, service mesh (Istio/Linkerd)
27. **AI model governance** — Model versioning, rollback, bias monitoring, explainability logs
28. **Multi-region HA** — Active-active across regions with encrypted cross-region replication
29. **ISO 27001 certification** — Full ISMS implementation
30. **FedRAMP** (if targeting US government) — Cloud security authorization

---

## Compliance Frameworks

| Framework | Target Vertical | Current Status | Readiness | Deployment |
|-----------|----------------|----------------|-----------|------------|
| **SOC 2 Type II** | All enterprise | Not started | Phase 3 | SaaS (required) |
| **GDPR** | EU customers | Not started | Phase 3 | SaaS + On-Prem |
| **HIPAA** | Healthcare | Not started | Phase 3 | SaaS + On-Prem |
| **PCI DSS** | Banking/Fintech | Not applicable (no card data) | N/A | N/A |
| **ISO 27001** | All enterprise | Not started | Phase 4 | SaaS |
| **FedRAMP** | US Government | Not started | Phase 4 | SaaS |

### Compliance by Deployment Model

**SaaS:**
- Lumino is responsible for infrastructure security, encryption, access controls, and compliance certifications
- Customers receive a shared responsibility matrix and DPA (Data Processing Agreement)
- SOC 2 report and pentest results available under NDA

**On-Premise:**
- Customer is responsible for infrastructure, network, and encryption
- Lumino provides hardened Docker images, security configuration guides, and upgrade advisories
- Compliance scope is significantly reduced — Lumino is a software vendor, not a data processor
- Data never leaves customer's network (except in hybrid mode, where only anonymized signals are sent)

---

## Data Privacy

### What Lumino Collects Today

| Data | Where Stored | Purpose | PII Risk |
|------|-------------|---------|----------|
| User ID (from JWT `sub` claim) | `analyticsEvent.userId`, `userProgress.userId` | Analytics attribution, progress tracking | Medium — depends on customer's ID format |
| Page URL | `analyticsEvent.pageUrl` | Step-level analytics | Low-Medium — may contain query params |
| Walkthrough interaction events | `analyticsEvent` table | Completion/drop-off analytics | Low |
| Step progress | `userProgress` table | Resume-on-revisit | Low |
| JWT token (in-memory only) | SDK runtime memory | Authentication | Low — short-lived, never persisted |

### Recommended Privacy Controls (Phase 2+)

- **Pseudonymization**: Hash user IDs before storing in analytics
- **URL sanitization**: Strip query parameters from `pageUrl` before storage
- **Data minimization**: Only collect events needed for core analytics
- **Retention policy**: Auto-delete analytics older than configurable TTL
- **Right to delete**: API endpoint to purge all data for a given user ID
- **Data export**: API endpoint to export all data for a given user ID (GDPR Article 15)
- **Privacy documentation**: Customer-facing data processing description

---

## Summary

Lumino's **primary model is SaaS** — this is where the AI-powered features (auto-healing, relevance scoring, behavioral analysis) live and where the product differentiates. The on-premise option exists for regulated customers who need data to stay on their network, with a hybrid bridge available for customers who want AI capabilities without exposing user data.

**Immediate priorities** (Phase 1): CORS lockdown, JWT secret enforcement, Redis auth, rate limiting — all straightforward fixes with no architectural impact.

**SaaS launch blockers** (Phase 2): TLS, tenant isolation, audit logging, data residency — required before any customer goes live on the cloud platform.

**Enterprise readiness** (Phase 3-4): SOC 2, GDPR, HIPAA, encryption at rest, AI security hardening — required for banking/healthcare verticals.

The architecture supports both deployment models from the same codebase. SaaS adds tenant isolation middleware and cloud infrastructure; on-premise strips the AI services to rule-based fallbacks and ships as hardened Docker images.
