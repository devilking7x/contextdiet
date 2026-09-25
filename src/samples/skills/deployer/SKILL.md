---
name: deployer
description: Release engineer. Use when cutting a release, rolling out a service, rolling back, or debugging a deploy.
---

# Deployer Skill

You own the path from `main` to production. Move deliberately; production is not a place for improvisation.

## Release checklist
1. `main` is green: CI passed on the exact SHA you will release.
2. Changelog entry exists and reads correctly for humans.
3. Database migrations (if any) are backwards compatible with the currently running version.
4. Feature flags for the new behavior exist, default off, with owner and removal date.
5. Dashboards and alerts for the touched services are known and linked in the release notes.
6. Rollback plan is written down: previous SHA, migration reversibility, flag kill-switch.

## Rollout strategy
- Start with the canary pool (5% of traffic) for at least 30 minutes.
- Promote in steps: 5% -> 25% -> 50% -> 100%, watching error budget at each step.
- If error budget burn exceeds 2x baseline for 10 minutes, roll back first and investigate second. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.
- Database migrations run before the code that needs them, never after.

## Rollback scenarios

### Bad deploy, flag-covered
**Situation:** The new behavior is behind a feature flag. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** Flip the flag off (under 60 seconds), then roll the deploy forward with a fix. No user impact beyond the canary window.

### Bad deploy, no flag
**Situation:** The regression is in unflagged code paths. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** Redeploy the previous SHA immediately. Verify health checks and error rates return to baseline before declaring recovery.

### Migration already applied
**Situation:** A backwards-incompatible migration ran before the bad code was detected. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** This is why migrations are forward-only and backwards compatible: the old code must still run against the new schema. Roll the code back, then plan a corrective migration.

### Canary caught it
**Situation:** Error budget burn spiked in the canary pool. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** Halt the rollout. The canary did its job. Keep the canary running for forensics, roll everything else back, and write the incident note.

### Cascading failure
**Situation:** Latency in one service is timing out its callers. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** Shed load first: enable the circuit breakers, raise the bulkhead limits temporarily, then roll back the offending change.

### Config-only breakage
**Situation:** A config change, not code, broke production. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** Revert the config commit and redeploy config. Config changes go through the same PR review as code — no exceptions.

### Secret rotation gone wrong
**Situation:** Consumers are failing after a secret rotation. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** Re-add the old secret version alongside the new one, redeploy consumers, then rotate again carefully.

### Database overload after deploy
**Situation:** A new query pattern is hammering the database. Time matters more than elegance here. All changes to this area must go through the standard pull request workf
**Action:** Kill the offending queries, add the missing index (concurrently, never blocking), then decide whether to roll back or hotfix.

## Environment matrix
| Environment | Purpose | Data | Deploy cadence |
| ----------- | ------- | ---- | -------------- |
| dev | Individual iteration | Synthetic | On every push |
| staging | Pre-prod validation | Production-like, scrubbed | Daily |
| prod-eu | European customers | Real | Twice weekly |
| prod-us | US customers | Real | Twice weekly |

Never test in production. Staging exists precisely so production stays boring. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.

## Secrets and config
- All secrets come from the secret manager; config files reference names, never values.
- Rotating a secret: add the new version, deploy consumers, then revoke the old version.
- Environment-specific config lives in `infra/helm/<env>/values.yaml`, reviewed like code.

## Incident severities
- **SEV1:** full outage or data loss risk — all hands, page immediately.
- **SEV2:** major degradation — on-call plus service owner.
- **SEV3:** minor degradation — ticket, fix in the next cycle.

## Incident note template
```md
# Incident: <title>
- Date: <yyyy-mm-dd>
- Severity: SEV1 | SEV2 | SEV3
- Duration: <minutes>
- Impact: <who was affected and how>
- Timeline: <minute-by-minute account>
- Root cause: <five whys>
- Action items: <owner + ticket for each>
```
Write the incident note within 24 hours while memories are fresh. All changes to this area must go through the standard pull request workflow with at least one approval from a code owner. Do not merge your own pull requests. Keep pull requests focused and under four hundred lines of diff where possible. Every pull request description must explain the why, not just the what, and must link the tracking issue.

## Post-deploy verification
- [ ] Health endpoints green in all regions
- [ ] Error rate within 0.1% of baseline for 30 minutes
- [ ] p99 latency within 10% of baseline
- [ ] No new error signatures in the log aggregator
- [ ] Business metrics (checkout rate, signup rate) nominal

---
*Deployer skill v2.8 — last incident drill: 2026-08-14.*
