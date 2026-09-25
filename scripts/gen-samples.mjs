// Generates realistic, chunky sample files for the ContextDiet demo.
// Run: node scripts/gen-samples.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "samples");
mkdirSync(join(root, "skills", "reviewer"), { recursive: true });
mkdirSync(join(root, "skills", "deployer"), { recursive: true });

const services = [
  "auth-gateway", "billing-core", "notification-hub", "search-indexer",
  "media-pipeline", "analytics-collector", "feature-flags", "audit-trail",
  "session-store", "rate-limiter", "webhook-relay", "cache-warmer",
];

const boiler = (s) =>
  `${s} All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.`;

const endpoints = [
  ["GET", "healthz", "Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency."],
  ["GET", "readyz", "Readiness probe. Checks database, cache, and message bus connectivity before reporting ready."],
  ["POST", "v1/resources", "Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours."],
  ["GET", "v1/resources/:id", "Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing."],
  ["PATCH", "v1/resources/:id", "Partial update. Only whitelisted fields may change; immutable fields are rejected with 422."],
  ["DELETE", "v1/resources/:id", "Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted."],
  ["GET", "v1/resources", "Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection."],
  ["POST", "v1/batch", "Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting."],
];

const envVars = [
  ["DATABASE_URL", "Primary Postgres connection string, pooled. Never log the full value; mask the password segment."],
  ["REDIS_URL", "Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable."],
  ["KAFKA_BROKERS", "Comma-separated broker list for the event bus. Consumers use the service name as the group id."],
  ["LOG_LEVEL", "One of debug, info, warn, error. Production defaults to info; debug is for local development only."],
  ["PORT", "HTTP listen port. Health checks assume this port in every environment."],
  ["TENANT_ISOLATION", "When true, every query is scoped by tenant_id at the repository layer, never in handlers."],
  ["REQUEST_TIMEOUT_MS", "Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs."],
  ["RETRY_MAX_ATTEMPTS", "Maximum retry attempts for idempotent operations, with exponential backoff and jitter."],
  ["FEATURE_FLAG_URL", "Endpoint of the feature-flags service. Flags are cached locally for 30 seconds."],
  ["METRICS_PORT", "Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration."],
];

// ---------------------------------------------------------------- CLAUDE.md
const c = [];
c.push(`# Project: Northwind Commerce Platform

> This file is loaded into the agent's context at the start of every session.
> Keep it accurate, current, and as short as you can while remaining useful.

## Overview
Northwind is a multi-tenant commerce platform serving roughly 40,000 storefronts. The monorepo contains twelve microservices, three shared libraries, and the storefront SPA. The platform processes on the order of two million checkouts per day at peak. ${boiler("Reliability is the top priority.")}

## Repository layout
\`\`\`
northwind/
  apps/
    storefront/        # Next.js SPA, deployed to the edge
    admin-console/     # Internal tooling, Vite + React
  services/
${services.map((s) => `    ${s}/             # Service: see its own README`).join("\n")}
  libs/
    ui-kit/            # Shared component library
    contracts/         # OpenAPI + protobuf contracts, single source of truth
    observability/    # Logging, tracing, metrics helpers
  infra/
    terraform/         # All cloud resources, no click-ops
    helm/              # Charts per service
\`\`\`

## Golden rules
1. Never commit secrets. Use the secret manager; reference secrets by name in config.
2. Every service exposes \`/healthz\` and \`/readyz\`; readiness must check downstream dependencies.
3. Structured logging only. Include \`request_id\`, \`tenant_id\`, and \`service\` on every line.
4. Database migrations are forward-only and must be backwards compatible for one release.
5. Feature flags gate every user-facing change; flags live in the feature-flags service.
6. Do not add dependencies without recording the reason in the PR description.

## Coding standards (TypeScript)
- Strict mode is on everywhere. No \`any\` without an eslint-disable comment that explains why.
- Prefer small pure functions. Functions longer than fifty lines are a smell; extract helpers.
- Errors are values: return \`Result<T, E>\` from \`libs/contracts\` instead of throwing across module boundaries.
- All async I/O must accept an \`AbortSignal\` so requests can be cancelled on shutdown.
- Dates are always ISO-8601 UTC strings at API boundaries; never pass \`Date\` objects over the wire.
- Money is always integer minor units (cents). Never use floating point for currency.

### Naming
${boiler("Names should reveal intent.")}
- Files: kebab-case. Tests live next to the file they test with a \`.test.ts\` suffix.
- Booleans read as questions: \`isReady\`, \`hasPermission\`, \`shouldRetry\`.
- Avoid abbreviations except the widely known ones (id, url, http, dto).

### Example: a well-formed service handler
\`\`\`ts
import { ok, err, type Result } from "@northwind/contracts";
import { createLogger } from "@northwind/observability";

const log = createLogger({ service: "billing-core" });

export async function chargeInvoice(
  invoiceId: string,
  opts: { signal?: AbortSignal; requestId?: string } = {},
): Promise<Result<Receipt, ChargeError>> {
  const started = Date.now();
  try {
    const invoice = await invoiceRepo.findById(invoiceId, opts.signal);
    if (!invoice) return err({ kind: "not-found", invoiceId });
    if (invoice.status !== "open") return err({ kind: "invalid-state", status: invoice.status });
    const receipt = await paymentProvider.charge({
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      idempotencyKey: \`invoice-\${invoiceId}\`,
      signal: opts.signal,
    });
    await invoiceRepo.markPaid(invoiceId, receipt.id);
    log.info("invoice charged", { request_id: opts.requestId, tenant_id: invoice.tenantId, invoice_id: invoiceId, latency_ms: Date.now() - started });
    return ok(receipt);
  } catch (e) {
    log.error("charge failed", { invoice_id: invoiceId, error: String(e) });
    return err({ kind: "provider-error", cause: e });
  }
}
\`\`\`

## Service reference
`);

for (const s of services) {
  c.push(`### ${s}
${boiler(`The ${s} service owns its data store and publishes domain events to the bus.`)}
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: \`docs/runbooks/${s}.md\` — read it before touching production config.
- Common pitfall: ${s} caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
${endpoints.map(([m, p, n]) => `| \`${m}\` | \`/${p}\` | ${n} |`).join("\n")}

#### Configuration
| Variable | Description |
| -------- | ----------- |
${envVars.map(([k, d]) => `| \`${k}\` | ${d} |`).join("\n")}

#### Event catalog
Publishes:
${["created", "updated", "deleted", "sync.requested", "sync.completed", "quota.exceeded"].map((e) => `- \`${s}.${e}\` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. ${boiler("Breaking event schemas pages the on-call.").slice(0, 100)}`).join("\n")}
Subscribes:
${["tenant.provisioned", "tenant.suspended", "deploy.completed", "flag.changed", "secret.rotated", "incident.declared"].map((e) => `- \`${e}\` — handled idempotently with a processed-events table keyed by event id. ${boiler("Duplicate delivery is normal, not exceptional.").slice(0, 100)}`).join("\n")}

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- \`pnpm --filter ${s} dev\` starts the service with hot reload against dockerized dependencies.
- Seed data: \`pnpm --filter ${s} db:seed\` loads a realistic tenant fixture in under a minute.
- ${boiler(`Debugging ${s} locally:`).slice(0, 60)} attach to the running process; source maps are enabled in dev.
`);
}

const adrs = [
  ["ADR-001", "Postgres as the system of record", "Evaluated Postgres, CockroachDB and PlanetScale. Chose Postgres for operational familiarity, mature tooling, and predictable costs at our scale. Revisit if multi-region writes become a requirement."],
  ["ADR-002", "Event-driven communication via Kafka", "Services communicate asynchronously through a central event bus instead of synchronous RPC, trading immediate consistency for resilience and independent deployability."],
  ["ADR-003", "Monorepo with pnpm workspaces", "One repository for all services keeps refactors atomic and contracts in sync. CI builds only affected packages using the dependency graph."],
  ["ADR-004", "Result types instead of exceptions", "Cross-module errors are returned as Result<T, E> values. Exceptions are reserved for truly exceptional, non-recoverable failures."],
  ["ADR-005", "Feature flags for every user-facing change", "All user-visible changes ship behind flags with owners and removal dates, enabling fast rollback without redeploys."],
  ["ADR-006", "UTC everywhere, ISO-8601 on the wire", "All timestamps are UTC. Date objects never cross API boundaries; only ISO-8601 strings do."],
  ["ADR-007", "Integer minor units for money", "Currency is stored and computed as integer minor units. Floating point is banned from any money path."],
  ["ADR-008", "Terraform for all infrastructure", "No click-ops. Every cloud resource is declared in Terraform and reviewed like application code."],
  ["ADR-009", "Structured JSON logging", "Every log line is JSON with request_id, tenant_id and service fields, enabling trace reconstruction across services."],
  ["ADR-010", "Canary deploys with automatic rollback", "Releases roll out 5% -> 25% -> 50% -> 100% with automatic rollback on error budget burn."],
  ["ADR-011", "Cursor pagination over offset", "All list endpoints use cursor pagination to stay stable under concurrent writes."],
  ["ADR-012", "Soft deletes with 30-day retention", "Deletes are soft for 30 days to support audit and recovery, then hard-deleted by a janitor job."],
  ["ADR-013", "Idempotency keys on mutating endpoints", "Clients send Idempotency-Key headers; duplicate keys return the original response for 24 hours."],
  ["ADR-014", "OpenAPI contracts as source of truth", "API contracts live in libs/contracts and generate both server stubs and client SDKs."],
  ["ADR-015", "Edge deployment for the storefront", "The storefront SPA deploys to the edge for sub-100ms TTFB worldwide; dynamic data is fetched client-side."],
];

c.push(`## Architecture decision records
${adrs.map(([id, title, body]) => `### ${id}: ${title}\n${body} ${boiler("This decision constrains future work.").slice(0, 120)}`).join("\n\n")}

## Testing
- Unit tests: colocated \`.test.ts\` files, run with \`pnpm test\`. Aim for meaningful assertions, not coverage theatre.
- Integration tests: testcontainers via \`pnpm test:integration\`. These run in CI on every PR.
- Load tests: k6 scripts in \`infra/load/\`. Run the smoke profile before any change to hot paths.
- Never hit production from tests. Staging mirrors production topology at 1/20th scale.

## Git workflow
- Default branch is \`main\`; it is always deployable. ${boiler("Releases are cut from main with semantic-release.")}
- Branch naming: \`<type>/<ticket>-<short-desc>\`, e.g. \`feat/NW-4821-retry-webhooks\`.
- Commit messages follow conventional commits. The changelog is generated; write for humans.
- Rebase onto main before requesting review; resolve conflicts yourself.

## Debugging cheat-sheet
- Tail logs: \`pnpm logs --service <name> --since 15m\`
- Trace a request: copy \`request_id\` from any log line, then \`pnpm trace <request_id>\`
- Common failure: clock skew between pods breaks idempotency keys — check NTP first.
- Database slow queries: \`pnpm db:slowlog --service <name>\` shows the last hour.

## Glossary
| Term | Meaning |
| ---- | ------- |
${["Tenant", "Storefront", "Checkout", "Idempotency key", "Error budget", "Runbook", "Feature flag", "Canary", "Backfill", "Saga", "Dead-letter queue", "Poison message", "Hot path", "Cold start", "Thundering herd", "Cache stampede", "Retry storm", "Bulkhead", "Circuit breaker", "Graceful degradation"]
  .map((t) => `| ${t} | In Northwind vocabulary, "${t.toLowerCase()}" has a precise operational meaning. ${boiler("Ask in #engineering if unsure.").slice(0, 110)} |`)
  .join("\n")}

---
*Last reviewed: 2026-09-01. If you change architecture, update this file in the same PR.*
`);
writeFileSync(join(root, "CLAUDE.md"), c.join("\n"));

// ------------------------------------------------------- reviewer SKILL.md
const r = [];
r.push(`---
name: reviewer
description: Senior code reviewer. Use when asked to review a diff, a pull request, or a design doc for correctness, security, and maintainability.
---

# Code Reviewer Skill

You are a senior staff engineer performing code review. Be direct, specific, and kind. Every comment must point at a line or hunk; no drive-by generalities.

## Review dimensions (in priority order)

### 1. Correctness
${boiler("Read the code as the machine will execute it, not as the author intended.")}
- Trace every branch. What happens on the unhappy path, on retry, on timeout?
- Check boundary conditions: empty inputs, null vs undefined, off-by-one in loops and pagination.
- Concurrency: shared mutable state, race conditions between check and act, duplicate delivery.
- Verify error handling actually handles: is the error surfaced, logged with context, and actionable?

### 2. Security
- Input validation at trust boundaries. Never trust client-supplied identifiers for authorization.
- Secrets: none in code, logs, or error messages. Watch for tokens in URLs and stack traces.
- Injection: parameterized queries only; be suspicious of string-built SQL, shell, or HTML.
- AuthN/AuthZ: every endpoint needs an explicit authorization check — "authenticated" is not "authorized".
- Dependencies: flag new dependencies and ask for justification; check for known CVEs.

### 3. Maintainability
${boiler("Code is read far more often than it is written. Optimize for the next reader.")}
- Naming: does the name reveal intent without reading the body?
- Size: functions over ~50 lines or files over ~500 lines deserve a comment explaining why they cannot be split.
- Duplication: three copies is a library. Two copies is a conversation.
- Tests: does the change include tests that would fail without the fix? Prefer that shape.

## Review pattern catalog
`);
const patterns = [
  ["Swallowed errors", "Empty catch blocks that discard the failure.", "Log with context and return a typed error; never silently continue."],
  ["Boolean parameters", "Functions taking bare booleans that read ambiguously at call sites.", "Prefer an options object or two named functions."],
  ["Magic numbers", "Unexplained numeric literals scattered through logic.", "Extract named constants with units in the name."],
  ["God objects", "A single class or module that knows about every subsystem.", "Split by responsibility; depend on abstractions."],
  ["Premature abstraction", "Interfaces with exactly one implementation and no consumer need.", "Duplicate twice, abstract on the third occurrence."],
  ["Log lines without correlation ids", "Logs that cannot be tied back to a request or tenant.", "Always include request_id and tenant_id."],
  ["Retry without jitter", "Fixed-interval retries that synchronize into thundering herds.", "Exponential backoff with full jitter and a cap."],
  ["Brittle tests", "Tests asserting implementation details instead of behavior.", "Test observable behavior; refactor freely underneath."],
  ["Restating comments", "Comments that paraphrase the code instead of explaining why.", "Delete or rewrite to capture intent and trade-offs."],
  ["Orphaned feature flags", "Flags with no owner and no removal date lingering for quarters.", "Every flag ships with an owner and a removal ticket."],
  ["N+1 queries", "A query inside a loop that fans out to the database.", "Batch with a dataloader or a single join."],
  ["String-built SQL", "Concatenated query strings inviting injection.", "Parameterized queries or a query builder, always."],
  ["Leaky abstractions", "Implementation details (table names, HTTP codes) surfacing through layers.", "Translate at boundaries; keep layers honest."],
  ["Temporal coupling", "Methods that must be called in a secret order to work.", "Make illegal states unrepresentable in the types."],
  ["Primitive obsession", "Bare strings and numbers where a domain type belongs.", "Introduce small value types: Email, Money, TenantId."],
  ["Shotgun surgery", "One logical change requiring edits in six files.", "Colocate what changes together."],
  ["Comments as deodorant", "Long comments excusing confusing code.", "Refactor until the comment is unnecessary."],
  ["Dead code", "Commented-out blocks and unreachable branches kept 'just in case'.", "Delete; version control remembers."],
  ["Inconsistent error shapes", "Every module inventing its own error envelope.", "One error type per boundary, documented in contracts."],
  ["Missing idempotency", "Mutating endpoints unsafe to retry.", "Idempotency-Key support on every mutation."],
  ["Pagination without cursors", "Offset pagination breaking under concurrent writes.", "Cursor pagination on all list endpoints."],
  ["Unbounded lists", "Endpoints returning unlimited result sets.", "Default page size 50, hard max 200."],
  ["Secrets in config files", "Keys and tokens checked into the repo.", "Secret manager references only."],
  ["Time bombs in tests", "Tests depending on wall-clock time or sleep durations.", "Inject clocks; use fake timers."],
  ["Flaky selectors", "UI tests coupled to CSS classes and DOM structure.", "Test ids and user-visible assertions."],
];
for (const [name, issue, fix] of patterns) {
  r.push(`### ${name}\n**Issue:** ${issue} ${boiler("This pattern has caused production incidents before.").slice(0, 130)}\n**Fix:** ${fix}\n`);
}
r.push(`## Language-specific checklists

### TypeScript
- \`strict\` null checks respected; no non-null assertions in library code.
- Discriminated unions instead of boolean soup for state machines.
- \`readonly\` on data that must not be mutated after construction.

### SQL / migrations
- Migrations are backwards compatible; new columns are nullable or have defaults.
- Indexes match query patterns; check \`EXPLAIN\` for sequential scans on hot paths.
- No data migration and schema migration in the same deploy step.

### Terraform
- No hardcoded credentials; all secrets via the secret manager data source.
- State locking enabled; never apply from a laptop without a plan file in CI.

## Output format
Return findings as a ranked list, most severe first. Each finding:
- **Severity:** blocker | major | minor | nit
- **Location:** file:line
- **Issue:** what is wrong, in one sentence
- **Why it matters:** the concrete failure mode
- **Suggestion:** the smallest change that fixes it

End with a verdict: **approve**, **approve with nits**, or **request changes** — and one paragraph explaining the verdict.

## Worked example
\`\`\`diff
- const total = price * qty;
+ const totalMinor = priceMinor * qty; // money in minor units, never floats
\`\`\`
**Severity:** blocker — **Location:** checkout.ts:42
**Issue:** floating-point arithmetic on currency.
**Why it matters:** \`0.1 + 0.2 !== 0.3\`; rounding errors accumulate into real money discrepancies.
**Suggestion:** keep amounts in integer minor units end to end, format only at display time.

---
*Reviewer skill v3.2 — calibrated against 400+ production incidents.*
`);
writeFileSync(join(root, "skills", "reviewer", "SKILL.md"), r.join("\n"));

// ------------------------------------------------------- deployer SKILL.md
const d = [];
d.push(`---
name: deployer
description: Release engineer. Use when cutting a release, rolling out a service, rolling back, or debugging a deploy.
---

# Deployer Skill

You own the path from \`main\` to production. Move deliberately; production is not a place for improvisation.

## Release checklist
1. \`main\` is green: CI passed on the exact SHA you will release.
2. Changelog entry exists and reads correctly for humans.
3. Database migrations (if any) are backwards compatible with the currently running version.
4. Feature flags for the new behavior exist, default off, with owner and removal date.
5. Dashboards and alerts for the touched services are known and linked in the release notes.
6. Rollback plan is written down: previous SHA, migration reversibility, flag kill-switch.

## Rollout strategy
- Start with the canary pool (5% of traffic) for at least 30 minutes.
- Promote in steps: 5% -> 25% -> 50% -> 100%, watching error budget at each step.
- ${boiler("If error budget burn exceeds 2x baseline for 10 minutes, roll back first and investigate second.")}
- Database migrations run before the code that needs them, never after.

## Rollback scenarios
`);
const scenarios = [
  ["Bad deploy, flag-covered", "The new behavior is behind a feature flag.", "Flip the flag off (under 60 seconds), then roll the deploy forward with a fix. No user impact beyond the canary window."],
  ["Bad deploy, no flag", "The regression is in unflagged code paths.", "Redeploy the previous SHA immediately. Verify health checks and error rates return to baseline before declaring recovery."],
  ["Migration already applied", "A backwards-incompatible migration ran before the bad code was detected.", "This is why migrations are forward-only and backwards compatible: the old code must still run against the new schema. Roll the code back, then plan a corrective migration."],
  ["Canary caught it", "Error budget burn spiked in the canary pool.", "Halt the rollout. The canary did its job. Keep the canary running for forensics, roll everything else back, and write the incident note."],
  ["Cascading failure", "Latency in one service is timing out its callers.", "Shed load first: enable the circuit breakers, raise the bulkhead limits temporarily, then roll back the offending change."],
  ["Config-only breakage", "A config change, not code, broke production.", "Revert the config commit and redeploy config. Config changes go through the same PR review as code — no exceptions."],
  ["Secret rotation gone wrong", "Consumers are failing after a secret rotation.", "Re-add the old secret version alongside the new one, redeploy consumers, then rotate again carefully."],
  ["Database overload after deploy", "A new query pattern is hammering the database.", "Kill the offending queries, add the missing index (concurrently, never blocking), then decide whether to roll back or hotfix."],
];
for (const [title, situation, action] of scenarios) {
  d.push(`### ${title}\n**Situation:** ${situation} ${boiler("Time matters more than elegance here.").slice(0, 110)}\n**Action:** ${action}\n`);
}
d.push(`## Environment matrix
| Environment | Purpose | Data | Deploy cadence |
| ----------- | ------- | ---- | -------------- |
| dev | Individual iteration | Synthetic | On every push |
| staging | Pre-prod validation | Production-like, scrubbed | Daily |
| prod-eu | European customers | Real | Twice weekly |
| prod-us | US customers | Real | Twice weekly |

${boiler("Never test in production. Staging exists precisely so production stays boring.")}

## Secrets and config
- All secrets come from the secret manager; config files reference names, never values.
- Rotating a secret: add the new version, deploy consumers, then revoke the old version.
- Environment-specific config lives in \`infra/helm/<env>/values.yaml\`, reviewed like code.

## Incident severities
- **SEV1:** full outage or data loss risk — all hands, page immediately.
- **SEV2:** major degradation — on-call plus service owner.
- **SEV3:** minor degradation — ticket, fix in the next cycle.

## Incident note template
\`\`\`md
# Incident: <title>
- Date: <yyyy-mm-dd>
- Severity: SEV1 | SEV2 | SEV3
- Duration: <minutes>
- Impact: <who was affected and how>
- Timeline: <minute-by-minute account>
- Root cause: <five whys>
- Action items: <owner + ticket for each>
\`\`\`
${boiler("Write the incident note within 24 hours while memories are fresh.")}

## Post-deploy verification
- [ ] Health endpoints green in all regions
- [ ] Error rate within 0.1% of baseline for 30 minutes
- [ ] p99 latency within 10% of baseline
- [ ] No new error signatures in the log aggregator
- [ ] Business metrics (checkout rate, signup rate) nominal

---
*Deployer skill v2.8 — last incident drill: 2026-08-14.*
`);
writeFileSync(join(root, "skills", "deployer", "SKILL.md"), d.join("\n"));

// ------------------------------------------------------------- .mcp.json
const mcpServers = {};
const mcpNames = [
  "postgres", "redis", "github", "slack", "linear", "sentry",
  "datadog", "playwright", "stripe", "openai", "filesystem", "memory",
];
for (const name of mcpNames) {
  const env = {
    [`${name.toUpperCase()}_API_KEY`]: `\${secrets.${name}_key}`,
    [`${name.toUpperCase()}_ENDPOINT`]: `https://${name}.internal.northwind.io`,
    LOG_FORMAT: "json",
    LOG_LEVEL: "info",
    REQUEST_TIMEOUT_MS: "30000",
  };
  mcpServers[name] = {
    command: "npx",
    args: ["-y", `@northwind/mcp-${name}`, "--verbose", "--log-level", "debug", "--tool-groups", "read,write,admin"],
    env,
    description: boiler(
      `The ${name} MCP server exposes the full ${name} API surface to the agent, including read and write operations, administrative endpoints, bulk import/export utilities, and webhook management. Enable only the tool groups the current task needs; each enabled tool costs context on every turn.`,
    ).slice(0, 520),
  };
}
writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers }, null, 2) + "\n");
console.log("samples written to", root);
