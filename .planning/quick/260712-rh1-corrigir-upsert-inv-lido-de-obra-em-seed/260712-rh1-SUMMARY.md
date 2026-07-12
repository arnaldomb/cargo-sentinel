---
phase: quick
plan: 260712-rh1
subsystem: database-seed
tags: [prisma, seed, bugfix]
requires: []
provides: [seed.ts com upsert de Obra corrigido]
affects: [docker build (api, web)]
key-files:
  modified:
    - packages/database/src/seed.ts
key-decisions:
  - "Trocado upsert por findFirst+create em vez de adicionar @@unique([empresaId, nome]) no schema — evita migração extra para um caso de uso pontual de seed."
duration: ~5min
completed: 2026-07-12
---

# Quick Task 260712-rh1: Corrigir upsert de Obra em seed.ts

## Accomplishments

- `prisma.obra.upsert({ where: { empresaId_nome: {...} } })` (chave composta inexistente no schema) substituído por `findFirst({ where: { empresaId, nome } }) ?? create({...})`, idempotente.
- `pnpm --filter @cargo-sentinel/database build` passa sem erros de tsc.

## Task Commits

1. **Task 1: Substituir upsert por findFirst+create idempotente** - `2ae6e5f` (fix)

## Context

Bug descoberto ao rodar `docker compose build api web` após o quick task 260712-o0s (integração Z-API) — não relacionado ao Z-API, era um bug pré-existente em uma edição não commitada de seed.ts que bloqueava o build Docker.
