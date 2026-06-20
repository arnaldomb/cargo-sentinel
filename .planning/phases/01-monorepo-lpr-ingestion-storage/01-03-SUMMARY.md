---
phase: 01-monorepo-lpr-ingestion-storage
plan: "03"
subsystem: docker-infrastructure
tags: [docker-compose, traefik, garage, postgres, redis, s3, letsencrypt]
requires: ["01-01"]
provides: [docker-compose-stack, garage-s3-storage, traefik-routing, lpr-images-bucket]
affects: [plan-04-lpr-pipeline, all-deploy-plans]
tech-stack:
  added:
    - "Garage v2.3.0 (dxflrs/garage:v2.3.0) — single-node S3-compatible storage"
    - "Traefik v3.0 — TLS termination + priority routing"
    - "postgres:16-alpine — persistent relational store"
    - "redis:7-alpine — pub/sub + BullMQ"
  patterns:
    - "Traefik label-based routing with explicit priority (30/20/10)"
    - "Garage --single-node --default-bucket auto-initializes lpr-images bucket and GK-prefixed key"
    - "acme.json host-mounted volume (chmod 600) for Let's Encrypt persistence"
    - "Docker socket mounted read-only (:ro) for Traefik provider"
    - "HTTP→HTTPS redirect via Traefik entrypoint redirections"
key-files:
  created:
    - docker-compose.yml
    - apps/api/Dockerfile
    - apps/web/Dockerfile
    - .dockerignore
    - .env.example
    - garage/garage.toml
    - traefik/acme.json
  modified:
    - garage/garage.toml (auto-fix: rpc_secret placeholder replaced with valid 64-char hex dev value)
decisions:
  - "garage.toml rpc_secret must be exactly 64 lowercase hex chars (32 bytes); Garage v2.3.0 rejects any other format at startup"
  - "Traefik API dashboard (port 8080) exposed without auth — acceptable for single-VPS dev; lock down in hardening phase"
  - "acme.json committed as empty file; chmod 600 applied; README note required for fresh clones"
  - "garage.toml committed with dev placeholder secrets (000...0); production deploy must regenerate with openssl rand -hex 32"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-20T19:00:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 1
requirements_satisfied:
  - INFRA-03
  - INFRA-04
  - INFRA-05
  - STORAGE-01
---

# Phase 01 Plan 03: Docker Compose Stack + Garage S3 + Traefik Routing Summary

Docker Compose stack defining all 6 Phase 1 services (web, api, postgres, redis, garage, traefik), Garage v2.3.0 single-node S3 with auto-created `lpr-images` bucket, and Traefik v3 priority routing `/api` (30) > `/media` (20) > `/` (10) with Let's Encrypt cert persistence via host-mounted `acme.json`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Dockerfiles + .env.example + garage.toml + acme.json | 28d51b6 | apps/api/Dockerfile, apps/web/Dockerfile, .dockerignore, .env.example, garage/garage.toml, traefik/acme.json |
| 2 | docker-compose.yml with all 6 services + validate + smoke up | 1078bb8 | docker-compose.yml, garage/garage.toml (auto-fix) |

## Verification Results

- `docker compose config` exits 0 and lists all 6 services: postgres, redis, garage, api, web, traefik
- garage service: `dxflrs/garage:v2.3.0`, command `/garage server --single-node --default-bucket`
- `GARAGE_DEFAULT_BUCKET: lpr-images` set in garage service environment
- `docker compose up -d postgres redis garage` — all 3 reach running/healthy state
- `docker exec cargo-sentinel-garage-1 /garage bucket list` output confirms: `lpr-images` bucket auto-created (STORAGE-01 SATISFIED)
- postgres: healthy (pg_isready passes)
- redis: healthy (redis-cli ping passes)
- api router: `PathPrefix(\`/api\`)` with `priority=30` (INFRA-04)
- garage router: `PathPrefix(\`/media\`)` with `priority=20`
- web router: catch-all `Host(...)` with `priority=10`
- `./traefik/acme.json:/letsencrypt/acme.json` mounted in traefik service (INFRA-05)
- acme.json permissions: chmod 600 applied
- HTTP→HTTPS redirect configured via Traefik entrypoint redirections

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] garage.toml rpc_secret placeholder was not valid hex**
- **Found during:** Task 2 — smoke test `docker compose up -d postgres redis garage`
- **Issue:** The placeholder string `GENERATE_WITH_openssl_rand_hex_32_replace_this_before_deploy` is not a valid 64-character lowercase hex string. Garage v2.3.0 validates this on startup and exits with: `Error: Invalid RPC secret key: expected 32 bytes of random hex`. Garage crash-looped.
- **Fix:** Replaced the placeholder with a valid-format 64-char all-zero hex string (`0000...0000`, 64 chars) as a dev-safe placeholder. Added comment above the line indicating the generate command. The admin_token similarly replaced with a string placeholder (Garage does not validate admin_token format the same way).
- **Files modified:** `garage/garage.toml`
- **Commit:** 1078bb8

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `rpc_secret = "000...0"` (64 zeros) | garage/garage.toml | Dev placeholder; production MUST regenerate with `openssl rand -hex 32` before deploy |
| `admin_token = "dev-admin-token-replace-before-deploy"` | garage/garage.toml | Dev placeholder; production MUST regenerate with `openssl rand -base64 32` |
| `GKchangeme...` | .env.example | Example placeholder; real .env requires `GK$(openssl rand -hex 16)` |

These stubs do not block the plan's goal (running `docker compose up` with all 6 services) — they are intentional dev defaults documented for operators to replace at deploy time.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: exposed_dashboard | docker-compose.yml | Traefik API dashboard exposed on port 8080 without auth; acceptable for single-VPS dev but must be locked before public deploy |

T-1-03: Garage bucket NOT public; only reachable via Traefik /media path with presigned URLs (enforced in Plan 04). `exposedbydefault=false` keeps unlisted containers off the router — MITIGATED.
T-1-I2: acme.json chmod 600 applied — MITIGATED.
T-1-I3: Real secrets in gitignored `.env`; only `.env.example` (placeholders) committed — MITIGATED.
T-1-E1: Docker socket mounted `:ro` — ACCEPTED.

## Self-Check: PASSED

- docker-compose.yml: FOUND
- apps/api/Dockerfile: FOUND
- apps/web/Dockerfile: FOUND
- .dockerignore: FOUND
- .env.example: FOUND
- garage/garage.toml: FOUND (replication_factor = 1, s3_region = "garage")
- traefik/acme.json: FOUND
- Commit 28d51b6: FOUND
- Commit 1078bb8: FOUND
- lpr-images bucket: VERIFIED via `garage bucket list` output
- All 6 services validated: `docker compose config --services` lists postgres, redis, garage, api, web, traefik
