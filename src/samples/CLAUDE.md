# Project: Northwind Commerce Platform

> This file is loaded into the agent's context at the start of every session.
> Keep it accurate, current, and as short as you can while remaining useful.

## Overview
Northwind is a multi-tenant commerce platform serving roughly 40,000 storefronts. The monorepo contains twelve microservices, three shared libraries, and the storefront SPA. The platform processes on the order of two million checkouts per day at peak. Reliability is the top priority. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.

## Repository layout
```
northwind/
  apps/
    storefront/        # Next.js SPA, deployed to the edge
    admin-console/     # Internal tooling, Vite + React
  services/
    auth-gateway/             # Service: see its own README
    billing-core/             # Service: see its own README
    notification-hub/             # Service: see its own README
    search-indexer/             # Service: see its own README
    media-pipeline/             # Service: see its own README
    analytics-collector/             # Service: see its own README
    feature-flags/             # Service: see its own README
    audit-trail/             # Service: see its own README
    session-store/             # Service: see its own README
    rate-limiter/             # Service: see its own README
    webhook-relay/             # Service: see its own README
    cache-warmer/             # Service: see its own README
  libs/
    ui-kit/            # Shared component library
    contracts/         # OpenAPI + protobuf contracts, single source of truth
    observability/    # Logging, tracing, metrics helpers
  infra/
    terraform/         # All cloud resources, no click-ops
    helm/              # Charts per service
```

## Golden rules
1. Never commit secrets. Use the secret manager; reference secrets by name in config.
2. Every service exposes `/healthz` and `/readyz`; readiness must check downstream dependencies.
3. Structured logging only. Include `request_id`, `tenant_id`, and `service` on every line.
4. Database migrations are forward-only and must be backwards compatible for one release.
5. Feature flags gate every user-facing change; flags live in the feature-flags service.
6. Do not add dependencies without recording the reason in the PR description.

## Coding standards (TypeScript)
- Strict mode is on everywhere. No `any` without an eslint-disable comment that explains why.
- Prefer small pure functions. Functions longer than fifty lines are a smell; extract helpers.
- Errors are values: return `Result<T, E>` from `libs/contracts` instead of throwing across module boundaries.
- All async I/O must accept an `AbortSignal` so requests can be cancelled on shutdown.
- Dates are always ISO-8601 UTC strings at API boundaries; never pass `Date` objects over the wire.
- Money is always integer minor units (cents). Never use floating point for currency.

### Naming
Names should reveal intent. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Files: kebab-case. Tests live next to the file they test with a `.test.ts` suffix.
- Booleans read as questions: `isReady`, `hasPermission`, `shouldRetry`.
- Avoid abbreviations except the widely known ones (id, url, http, dto).

### Example: a well-formed service handler
```ts
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
      idempotencyKey: `invoice-${invoiceId}`,
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
```

## Service reference

### auth-gateway
The auth-gateway service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/auth-gateway.md` — read it before touching production config.
- Common pitfall: auth-gateway caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `auth-gateway.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `auth-gateway.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `auth-gateway.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `auth-gateway.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `auth-gateway.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `auth-gateway.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter auth-gateway dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter auth-gateway db:seed` loads a realistic tenant fixture in under a minute.
- Debugging auth-gateway locally: All changes to this area mus attach to the running process; source maps are enabled in dev.

### billing-core
The billing-core service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/billing-core.md` — read it before touching production config.
- Common pitfall: billing-core caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `billing-core.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `billing-core.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `billing-core.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `billing-core.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `billing-core.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `billing-core.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter billing-core dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter billing-core db:seed` loads a realistic tenant fixture in under a minute.
- Debugging billing-core locally: All changes to this area mus attach to the running process; source maps are enabled in dev.

### notification-hub
The notification-hub service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/notification-hub.md` — read it before touching production config.
- Common pitfall: notification-hub caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `notification-hub.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `notification-hub.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `notification-hub.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `notification-hub.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `notification-hub.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `notification-hub.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter notification-hub dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter notification-hub db:seed` loads a realistic tenant fixture in under a minute.
- Debugging notification-hub locally: All changes to this area attach to the running process; source maps are enabled in dev.

### search-indexer
The search-indexer service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/search-indexer.md` — read it before touching production config.
- Common pitfall: search-indexer caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `search-indexer.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `search-indexer.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `search-indexer.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `search-indexer.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `search-indexer.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `search-indexer.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter search-indexer dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter search-indexer db:seed` loads a realistic tenant fixture in under a minute.
- Debugging search-indexer locally: All changes to this area m attach to the running process; source maps are enabled in dev.

### media-pipeline
The media-pipeline service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/media-pipeline.md` — read it before touching production config.
- Common pitfall: media-pipeline caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `media-pipeline.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `media-pipeline.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `media-pipeline.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `media-pipeline.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `media-pipeline.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `media-pipeline.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter media-pipeline dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter media-pipeline db:seed` loads a realistic tenant fixture in under a minute.
- Debugging media-pipeline locally: All changes to this area m attach to the running process; source maps are enabled in dev.

### analytics-collector
The analytics-collector service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/analytics-collector.md` — read it before touching production config.
- Common pitfall: analytics-collector caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `analytics-collector.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `analytics-collector.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `analytics-collector.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `analytics-collector.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `analytics-collector.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `analytics-collector.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter analytics-collector dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter analytics-collector db:seed` loads a realistic tenant fixture in under a minute.
- Debugging analytics-collector locally: All changes to this a attach to the running process; source maps are enabled in dev.

### feature-flags
The feature-flags service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/feature-flags.md` — read it before touching production config.
- Common pitfall: feature-flags caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `feature-flags.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `feature-flags.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `feature-flags.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `feature-flags.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `feature-flags.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `feature-flags.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter feature-flags dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter feature-flags db:seed` loads a realistic tenant fixture in under a minute.
- Debugging feature-flags locally: All changes to this area mu attach to the running process; source maps are enabled in dev.

### audit-trail
The audit-trail service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/audit-trail.md` — read it before touching production config.
- Common pitfall: audit-trail caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `audit-trail.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `audit-trail.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `audit-trail.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `audit-trail.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `audit-trail.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `audit-trail.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter audit-trail dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter audit-trail db:seed` loads a realistic tenant fixture in under a minute.
- Debugging audit-trail locally: All changes to this area must attach to the running process; source maps are enabled in dev.

### session-store
The session-store service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/session-store.md` — read it before touching production config.
- Common pitfall: session-store caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `session-store.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `session-store.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `session-store.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `session-store.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `session-store.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `session-store.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter session-store dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter session-store db:seed` loads a realistic tenant fixture in under a minute.
- Debugging session-store locally: All changes to this area mu attach to the running process; source maps are enabled in dev.

### rate-limiter
The rate-limiter service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/rate-limiter.md` — read it before touching production config.
- Common pitfall: rate-limiter caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `rate-limiter.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `rate-limiter.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `rate-limiter.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `rate-limiter.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `rate-limiter.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `rate-limiter.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter rate-limiter dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter rate-limiter db:seed` loads a realistic tenant fixture in under a minute.
- Debugging rate-limiter locally: All changes to this area mus attach to the running process; source maps are enabled in dev.

### webhook-relay
The webhook-relay service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/webhook-relay.md` — read it before touching production config.
- Common pitfall: webhook-relay caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `webhook-relay.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `webhook-relay.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `webhook-relay.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `webhook-relay.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `webhook-relay.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `webhook-relay.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter webhook-relay dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter webhook-relay db:seed` loads a realistic tenant fixture in under a minute.
- Debugging webhook-relay locally: All changes to this area mu attach to the running process; source maps are enabled in dev.

### cache-warmer
The cache-warmer service owns its data store and publishes domain events to the bus. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Scaling: horizontal pod autoscaling on p99 latency, target 250ms, min 2 / max 20 replicas.
- Alerts: page on error budget burn faster than 2x for more than 15 minutes.
- Runbook: `docs/runbooks/cache-warmer.md` — read it before touching production config.
- Common pitfall: cache-warmer caches aggressively; after deploys, verify cache version headers before declaring victory.

#### API surface
| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/healthz` | Liveness probe. Must respond in under 50ms without touching the database or any downstream dependency. |
| `GET` | `/readyz` | Readiness probe. Checks database, cache, and message bus connectivity before reporting ready. |
| `POST` | `/v1/resources` | Creates a new resource. Idempotency-Key header is required; duplicate keys return the original response for 24 hours. |
| `GET` | `/v1/resources/:id` | Fetches a single resource by id. Returns 404 with a machine-readable error envelope when missing. |
| `PATCH` | `/v1/resources/:id` | Partial update. Only whitelisted fields may change; immutable fields are rejected with 422. |
| `DELETE` | `/v1/resources/:id` | Soft delete. The record is retained for 30 days for audit and recovery, then hard-deleted. |
| `GET` | `/v1/resources` | Cursor-paginated list. Default page size 50, max 200. Supports filtering, sorting, and field selection. |
| `POST` | `/v1/batch` | Bulk operation endpoint. Processes up to 100 items atomically per request with per-item status reporting. |

#### Configuration
| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Primary Postgres connection string, pooled. Never log the full value; mask the password segment. |
| `REDIS_URL` | Cache and session store endpoint. The service must degrade gracefully when the cache is unavailable. |
| `KAFKA_BROKERS` | Comma-separated broker list for the event bus. Consumers use the service name as the group id. |
| `LOG_LEVEL` | One of debug, info, warn, error. Production defaults to info; debug is for local development only. |
| `PORT` | HTTP listen port. Health checks assume this port in every environment. |
| `TENANT_ISOLATION` | When true, every query is scoped by tenant_id at the repository layer, never in handlers. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Set below the load balancer idle timeout to avoid cascading hangs. |
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for idempotent operations, with exponential backoff and jitter. |
| `FEATURE_FLAG_URL` | Endpoint of the feature-flags service. Flags are cached locally for 30 seconds. |
| `METRICS_PORT` | Prometheus scrape port. Every service exposes RED metrics: rate, errors, duration. |

#### Event catalog
Publishes:
- `cache-warmer.created` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `cache-warmer.updated` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `cache-warmer.deleted` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `cache-warmer.sync.requested` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `cache-warmer.sync.completed` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
- `cache-warmer.quota.exceeded` — versioned at v1. Consumers must tolerate unknown fields; producers never rename fields, only add optional ones. Breaking event schemas pages the on-call. All changes to this area must go through the standard pull
Subscribes:
- `tenant.provisioned` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `tenant.suspended` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `deploy.completed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `flag.changed` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `secret.rotated` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard
- `incident.declared` — handled idempotently with a processed-events table keyed by event id. Duplicate delivery is normal, not exceptional. All changes to this area must go through the standard

#### SLOs and alerts
| SLO | Target | Alert |
| --- | ------ | ----- |
| Availability | 99.95% monthly | Page after 5 min of burn at 14x rate |
| p99 latency | < 250ms | Ticket after 30 min above target |
| Event lag | < 60s | Page after 10 min above target |
| Error rate | < 0.1% | Ticket after 15 min above target |
| Deploy success | > 98% | Page the release captain on 2 consecutive failures |

#### Local development
- `pnpm --filter cache-warmer dev` starts the service with hot reload against dockerized dependencies.
- Seed data: `pnpm --filter cache-warmer db:seed` loads a realistic tenant fixture in under a minute.
- Debugging cache-warmer locally: All changes to this area mus attach to the running process; source maps are enabled in dev.

## Architecture decision records
### ADR-001: Postgres as the system of record
Evaluated Postgres, CockroachDB and PlanetScale. Chose Postgres for operational familiarity, mature tooling, and predictable costs at our scale. Revisit if multi-region writes become a requirement. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-002: Event-driven communication via Kafka
Services communicate asynchronously through a central event bus instead of synchronous RPC, trading immediate consistency for resilience and independent deployability. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-003: Monorepo with pnpm workspaces
One repository for all services keeps refactors atomic and contracts in sync. CI builds only affected packages using the dependency graph. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-004: Result types instead of exceptions
Cross-module errors are returned as Result<T, E> values. Exceptions are reserved for truly exceptional, non-recoverable failures. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-005: Feature flags for every user-facing change
All user-visible changes ship behind flags with owners and removal dates, enabling fast rollback without redeploys. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-006: UTC everywhere, ISO-8601 on the wire
All timestamps are UTC. Date objects never cross API boundaries; only ISO-8601 strings do. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-007: Integer minor units for money
Currency is stored and computed as integer minor units. Floating point is banned from any money path. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-008: Terraform for all infrastructure
No click-ops. Every cloud resource is declared in Terraform and reviewed like application code. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-009: Structured JSON logging
Every log line is JSON with request_id, tenant_id and service fields, enabling trace reconstruction across services. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-010: Canary deploys with automatic rollback
Releases roll out 5% -> 25% -> 50% -> 100% with automatic rollback on error budget burn. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-011: Cursor pagination over offset
All list endpoints use cursor pagination to stay stable under concurrent writes. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-012: Soft deletes with 30-day retention
Deletes are soft for 30 days to support audit and recovery, then hard-deleted by a janitor job. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-013: Idempotency keys on mutating endpoints
Clients send Idempotency-Key headers; duplicate keys return the original response for 24 hours. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-014: OpenAPI contracts as source of truth
API contracts live in libs/contracts and generate both server stubs and client SDKs. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

### ADR-015: Edge deployment for the storefront
The storefront SPA deploys to the edge for sub-100ms TTFB worldwide; dynamic data is fetched client-side. This decision constrains future work. All changes to this area must go through the standard pull request workflow with a

## Testing
- Unit tests: colocated `.test.ts` files, run with `pnpm test`. Aim for meaningful assertions, not coverage theatre.
- Integration tests: testcontainers via `pnpm test:integration`. These run in CI on every PR.
- Load tests: k6 scripts in `infra/load/`. Run the smoke profile before any change to hot paths.
- Never hit production from tests. Staging mirrors production topology at 1/20th scale.

## Git workflow
- Default branch is `main`; it is always deployable. Releases are cut from main with semantic-release. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Branch naming: `<type>/<ticket>-<short-desc>`, e.g. `feat/NW-4821-retry-webhooks`.
- Commit messages follow conventional commits. The changelog is generated; write for humans.
- Rebase onto main before requesting review; resolve conflicts yourself.

## Debugging cheat-sheet
- Tail logs: `pnpm logs --service <name> --since 15m`
- Trace a request: copy `request_id` from any log line, then `pnpm trace <request_id>`
- Common failure: clock skew between pods breaks idempotency keys — check NTP first.
- Database slow queries: `pnpm db:slowlog --service <name>` shows the last hour.

## Glossary
| Term | Meaning |
| ---- | ------- |
| Tenant | In Northwind vocabulary, "tenant" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Storefront | In Northwind vocabulary, "storefront" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Checkout | In Northwind vocabulary, "checkout" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Idempotency key | In Northwind vocabulary, "idempotency key" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Error budget | In Northwind vocabulary, "error budget" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Runbook | In Northwind vocabulary, "runbook" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Feature flag | In Northwind vocabulary, "feature flag" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Canary | In Northwind vocabulary, "canary" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Backfill | In Northwind vocabulary, "backfill" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Saga | In Northwind vocabulary, "saga" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Dead-letter queue | In Northwind vocabulary, "dead-letter queue" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Poison message | In Northwind vocabulary, "poison message" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Hot path | In Northwind vocabulary, "hot path" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Cold start | In Northwind vocabulary, "cold start" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Thundering herd | In Northwind vocabulary, "thundering herd" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Cache stampede | In Northwind vocabulary, "cache stampede" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Retry storm | In Northwind vocabulary, "retry storm" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Bulkhead | In Northwind vocabulary, "bulkhead" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Circuit breaker | In Northwind vocabulary, "circuit breaker" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |
| Graceful degradation | In Northwind vocabulary, "graceful degradation" has a precise operational meaning. Ask in #engineering if unsure. All changes to this area must go through the standard pull request workflow wit |

---
*Last reviewed: 2026-09-01. If you change architecture, update this file in the same PR.*
