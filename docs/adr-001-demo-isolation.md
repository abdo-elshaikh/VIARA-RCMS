# ADR-001 — Demo isolation model: per-stack, not per-tenant

> **Status:** Accepted · **Date:** 2026-09-29 · **Scope:** Demo Cloud provisioning

---

## Context

The trial plan proposes a "Demo Cloud Instance" (option B): one hosted instance serving
several prospects, each with an isolated tenant. Before building it, the current data
model was checked. The finding changes the design, so it is recorded here before any
infrastructure is written.

---

## Finding 1 — VIARA has no tenant isolation, and no branch scoping either

A search across all 182 migrations and the schema returns **no `tenant_id`, no
`org_id`, no `organization_id`** anywhere.

`branch_id` does exist — but only on **financial** tables (`invoices`, `payments`,
`expenses`, …) added by `066_financial_reporting_v2.sql` for multi-branch financial
reporting. It was never extended to the clinical core.

| Table | Branch/tenant scoping |
|---|---|
| `patients`, `appointments`, `examinations` | **none** |
| `users`, `referring_doctors` | **none** |
| `invoices`, `payments`, `expenses` | `branch_id` (financial reporting only) |

The controllers confirm it: `patientController.js` and `appointmentController.js`
contain **no `branch_id` / `branchId` filter at all**.

### Consequence

Two prospects sharing one database would see each other's patients, studies, and
reports. In a radiology system that data is diagnostic images and PII, and the
project advertises HIPAA and GDPR compliance. A shared demo instance is therefore
**not shippable** without first adding real multi-tenancy — which means a schema
migration touching the clinical core of a system with 182 migrations and live
clinical data.

---

## Finding 2 — Two stacks cannot run on one host, and the reason is narrow

`docker-compose.yml` pins **seven** container names:

```yaml
container_name: VIARA_db          # + clamav, backend, frontend, portal, orthanc, ohif, pacs_ai_worker
```

A fixed `container_name` **defeats Compose project namespacing**. `docker compose -p
viara-demo-acme up` still asks Docker for a container literally named `VIARA_db`, which
collides with the running main stack. `-p` prefixes volume and network names but cannot
help here.

**The published ports are not the problem** — they are already parameterised and a demo
stack can be given its own port range today:

```yaml
- "${BACKEND_BIND:-127.0.0.1}:${BACKEND_PORT:-3000}:3000"
- "${FRONTEND_BIND:-127.0.0.1}:${FRONTEND_PORT:-5173}:80"
- "${POSTGRES_PORT:-5432}:5432"      # + OHIF_PORT, PACS_AI_WORKER_PORT, PORTAL_PORT
```

Only Orthanc's DICOM port is still fixed (`127.0.0.1:8042:8042`, line 190).

So the blocker is one thing, not two: **drop `container_name` from all seven services**
and per-prospect stacks become runnable on a single host. That is a small, mechanical
change with no bearing on the data model — which is the main reason the per-stack model
is affordable here.

### Blast radius of removing `container_name` — checked, and it is small

A repo-wide sweep for the seven names returns 94 hits, but most are false positives:
`VIARA_db_pool_connections` and friends in `backend/src/config/metrics.js` are
**Prometheus metric names**, not containers, and `performance-tests/scratch_check.js`
matches a *database* name (`viara_db`) in a connection string.

The genuine references are three, and none are application code:

| Location | Form | Impact |
|---|---|---|
| `docs/runbooks/RESTORE.md` (6×) | `<VIARA_db container>` placeholders | None — already parameterised by hand |
| `README.md` (1×) | container-name table row | One stale row |
| `docker-compose.yml` (7×) | the definitions | The change itself |

**No runtime code depends on the container name.** That is the fact that makes this
safe to do now, rather than deferring it. Worth recording explicitly, because a
disaster-recovery runbook is exactly the kind of thing that should have been a blocker
and turns out not to be.

### Resolved

`docker-compose.demo.yml` was added as an **overlay** rather than by editing the
production file. It uses `container_name: !reset null` (Compose v2.24+) on the six
unprofiled services, so containers fall back to `<project>-<service>-<index>` naming and
`-p` takes effect. `docker-compose.yml` is untouched apart from one line: Orthanc's REST
port is now `${ORTHANC_REST_PORT:-8042}` — **default behaviour unchanged**.

Two things worth knowing:

- `pacs_ai_worker` is **not** in the overlay. It sits behind `profiles: ["ai"]`, and
  naming a profile-gated service in an override pulls it into the default set, where it
  has no build context and `docker compose config` fails outright. Demo stacks do not
  need the optional AI worker.
- Only `container_name` needed resetting. The base file already namespaces volumes and
  networks by project (`viara-demo-acme_postgres_data`), so two stacks never touch the
  same storage.

Verified: base config still emits all 7 `container_name` values and ports `4242`/`8042`;
overlay config emits zero `container_name` values and all 9 resources namespaced.

---

## Decision

**Isolation is enforced at the database boundary, not in application code.**

Each demo is a **separate stack** with its own PostgreSQL instance and its own Orthanc
storage volume. A prospect's data is unreachable from any other prospect's stack because
there is no shared process holding both.

This requires **no schema change**, which is the main reason it is preferred over
retrofitting multi-tenancy into the clinical tables.

Rejected alternatives:

| Option | Why not |
|---|---|
| Shared instance, tenant column added to all clinical tables | Weeks of migration work on live clinical data; row-level security across ~50 tables; unacceptable regression risk for a signed-off product |
| Shared instance, tenant filter added ad hoc per query | One forgotten `WHERE` leaks a patient's entire record. Unreviewable at this table count |
| Shared instance, trust the seed data | A prospect who creates a patient is real data, not seed data. The leak appears exactly when a demo is working |

### Consequence accepted

Isolation is bought with **one PostgreSQL and one Orthanc volume per prospect**. That
caps concurrent demos on a single host by memory and disk, not by licence count. This
is a deliberate trade: predictable isolation over demo density.

---

## What was built

**`scripts/lib/demoLeaseStore.js`** — the registry that makes per-stack demos auditable
and, more importantly, reclaimable. A demo stack that outlives its trial keeps prospect
data on disk; every lease is tracked so it can be torn down on a known date.

The load-bearing part is `assertOwnedProject()`. Reclamation deletes containers and
volumes, so it must be impossible to point it at the wrong stack. It refuses any project
name that is not both namespaced under `viara-demo-` **and** present in the ledger. A
production stack (`viara`), a developer's local stack, or a hand-typed name all fail
closed. The ledger is written atomically, and a corrupt ledger throws rather than
resolving to "no leases" — silently treating corruption as empty would disable exactly
that guard.

**`docker-compose.demo.yml`** — the overlay described above.

**`scripts/demo-provision.js`** — `provision`, `list`, `reclaim`, `reap`. Per-demo host
ports are handed over through a generated env file rather than by editing the base
compose. `reclaim`/`reap` call `down --volumes`, so a reclaimed demo does not leave
patient data on disk.

Two safeguards worth noting, because they are layered rather than single:

- `getLease()` re-derives the project name from the customer reference instead of
  trusting the `project` field stored in the ledger. A hand-edited ledger therefore
  cannot point a teardown at an arbitrary stack, even before `assertOwnedProject()`
  runs. Both layers are kept.
- The ledger lives at `.demo/leases.json` and is now git-ignored — it holds customer
  names. `VIARA_DEMO_LEDGER` overrides the location.

`provision` issues a real licence, isolates the demo's secrets, and loads demo data:

- The licence comes from `scripts/generate-license.js` with the **same day count as
  the lease**, so a demo cannot outlive its own registration in the ledger. The key is
  written only into the demo env file, never into the ledger.
- Every demo gets **freshly generated secrets** for `POSTGRES_PASSWORD`, `JWT_SECRET`,
  `ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `ORTHANC_PASSWORD`,
  `PACS_WEBHOOK_SECRET`, and `TEST_USER_PASSWORD` (32 bytes of hex). Inheriting these
  from the main stack would have been a real vulnerability: a shared `JWT_SECRET` lets
  anyone who reaches a publicly-facing demo forge production session tokens.
- `DATABASE_URL` is re-pointed at the demo's own database and password. Inheriting the
  root one would have run the seed against the main stack.
- `VITE_OHIF_URL` and `PORTAL_PUBLIC_URL` are required by `docker-compose.yml` and baked
  into the frontend image at build time, so they are re-pointed at the demo's own ports.
- Demo data is loaded by the existing `backend/seed.js`, which already produces a
  realistic radiology workload: 16 users across every role, 150 patients, ~260
  appointments, ~190 examinations, plus insurance, inventory, maintenance and CRM. It
  is reused rather than replaced — a prospect opening an empty VIARA learns nothing.
  Its own guards are respected: it requires `TEST_USER_PASSWORD` rather than falling
  back to a committed default, and the demo supplies its own.

**On encryption.** Patient names are stored AES-GCM encrypted, so the seed must run with
the same `ENCRYPTION_KEY` the server will use. Seeding with a different key would leave
every seeded record permanently unreadable. Verified by decrypting seeded records with
the demo's own key after loading.

Verified by 51 tests across `backend/tests/demo-provision.test.js` and
`backend/tests/demo-lease-store.test.js`, plus two end-to-end runs against a real
throwaway database: one proving a fresh install migrates and seeds cleanly, and one
proving the *generated demo env file* alone is sufficient to do both.

A note for whoever runs this next: `migrate.js` cannot run standalone. The enum types it
depends on (`user_role` and friends) are created by `schema.sql`, so a fresh database
needs `schema.sql` applied first and then the migrations — which is what the compose
`migrate` service does, and what `migrate --fresh` does in CI.

---

## Blocker found and fixed: fresh installs could not migrate

Provisioning a demo means creating a database from nothing. Doing that exposed a
defect that had nothing to do with demos and would have affected **every new
customer install**.

Migration 083 seeds three default payroll rules. One of them:

```sql
('Late', 'Late arrival minute deduction', 'PerMinute', 0.0000, ...)
```

Migration 117 adds `payroll_rules_logic_check` requiring `value > 0` — but as
`NOT VALID`, which checks existing rows not at all. The zero-valued row therefore
survived. Migration 147 then backfills `branch_id`/`currency_code` with an
`UPDATE`, and updating a row *does* evaluate the constraint, so the migration
aborted:

```
❌ Migration failed: new row for relation "payroll_rules"
   violates check constraint "payroll_rules_logic_check"
```

**Why it was never noticed:** the live `rcms` database contains zero
`payroll_rules` rows, so 147's `UPDATE` matched nothing and never evaluated the
constraint. The bug only exists on a database that actually ran 083's seed.

**Fix:** the `Late`/PerMinute row is no longer seeded. Giving it a value would
have meant inventing a monetary rate, which is a business decision, not a
migration's. A late-arrival rule is created by an administrator who sets the real
rate for their centre. The change had to be made in 083 rather than in a new
migration, because 147 runs before any migration added later.

Verified by rebuilding a database the way a new install does — `schema.sql` then
all 183 migrations — which now completes clean. `rcms` is unaffected: 083 is
already recorded as applied there, and the insert is `ON CONFLICT DO NOTHING`.

Note that CI already runs `npm run migrate -- --fresh`, which is precisely the path
that was broken. That guard either has not been green since these migrations
landed, or is not being run; it should be confirmed rather than assumed.

One apparent gap is not a gap: `patient_loyalty_ledger` and
`referring_doctor_interactions` exist in `rcms` but no migration creates them.
The application creates both lazily with `CREATE TABLE IF NOT EXISTS` at runtime
(`loyaltyRewardService.js:9`, `referringDoctorController.js:270`), so a fresh
install is correct without them.

---

## Still required before a demo is actually sold

1. ~~**Seed data**~~ — **Done**, via `backend/seed.js` (see "What was built").
2. ~~**A scheduled reaper**~~ — **Done.** `reap` gained `--dry-run`, an audit log,
   and per-lease error isolation (one stack refusing to come down no longer strands
   the rest). `scripts/demo-reaper-schedule.js` registers it: Windows Task Scheduler
   (this host), or a crontab entry on Linux/macOS, at 04:17 daily. It only ever
   installs a schedule — the scheduled task runs `reap --yes`, which re-applies the
   ownership guard. Registration is not automatic: run
   `node scripts/demo-reaper-schedule.js install` on the demo host.
3. **Run `provision` once, end to end.** The core claim was verified against a real
   stack (see "End-to-end verification"), but only the database service was
   exercised. A full `provision` still needs a decision about where demos run.
4. **Credential handling.** Demo portal credentials exist in
   `scratch/demo-portal-access.json` (git-ignored) and must never be emailed in clear.
   Each demo now gets its own generated `TEST_USER_PASSWORD`, but whoever hands over
   access still needs a defined channel.

---

## End-to-end verification

A demo stack was actually run alongside the main one, with the database service only
so the resource cost stayed bounded.

- `docker compose -p viara-demo-e2e-check -f docker-compose.yml -f docker-compose.demo.yml up -d postgres`
  started `viara-demo-e2e-check-postgres-1` bound to `127.0.0.1:55432`, while the main
  `viara` project kept running with `VIARA_ohif` and `VIARA_orthanc`. Both projects
  coexisted; nothing collided.
- Migrations and seed ran over that real demo port: 16 users, 150 patients, 258
  appointments, 174 examinations, and patient names decrypted correctly with the
  demo's own `ENCRYPTION_KEY`.
- **Isolation confirmed by what did *not* change.** The main `rcms` database still had
  141 tables, 12 patients and 21 users afterwards — not the 150 patients and 16 users
  that had just been written. The seed went to the demo database and nowhere else.
- Teardown with `--volumes` removed the container, both networks and the volume. Only
  the main `viara_*` volumes remained.

One discrepancy worth recording: the first attempt at this failed with
`ports are not available: exposing port TCP 127.0.0.1:5432`, and a Windows
`WSAEACCES`-style bind error. The identical command succeeded immediately afterwards,
and `docker compose config` resolved `POSTGRES_PORT` to `55432` correctly both before
and after, with no duplicate key in the generated env file. It could not be
reproduced and the cause remains unexplained. If it recurs in provisioning, check that
the generated env file is being passed with `--env-file` before concluding the port
assignment is wrong.

---

## Resolved: an uncommitted change that let Orthanc start silently broken

`docker-compose.yml` carried an uncommitted removal of Orthanc's startup dependency on
Postgres:

```diff
   orthanc:
-    depends_on:
-      postgres:
-        condition: service_healthy
```

It was not authored as part of this work. It was assessed rather than assumed, because
the obvious read — "Orthanc now races Postgres and crashes" — turned out to be wrong,
and the real problem is worse than a crash.

Orthanc was observed **running and reporting `healthy` with no Postgres running at
all**. Its healthcheck only calls `GET /system`, which serves from the process itself
and never touches the database. `/queries` returned HTTP 200 with an empty result set.
So dropping `depends_on` does not produce a visible failure: Orthanc starts, passes its
healthcheck, and reports healthy while its PostgreSQL index is unavailable. A study
archived at that moment would fail in a way nothing in the stack would surface.

That inverts the risk. The dependency costs only startup time; removing it trades that
for silent data-path failure. The committed ordering was therefore restored, and the
file now differs from `HEAD` by exactly one line — the deliberate
`ORTHANC_REST_PORT` variable.

Worth noting independently: **Orthanc's healthcheck does not verify its database.**
Whichever way the startup ordering is eventually decided, a healthcheck that cannot
tell a working PACS index from an empty one will keep hiding this class of failure.

---

## Explicitly out of scope

Real multi-tenancy remains the only way to offer a genuinely shared instance. If a
higher demo count per host becomes commercially necessary, that is the change to make —
as a dedicated project with its own migration plan and a full clinical regression pass,
not as part of demo tooling.
