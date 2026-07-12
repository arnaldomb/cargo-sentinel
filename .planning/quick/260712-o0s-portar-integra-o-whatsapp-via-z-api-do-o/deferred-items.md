# Deferred Items — 260712-o0s

Out-of-scope issues discovered during execution, not fixed (per scope boundary rule).

## 1. Pre-existing test failures in eventos.test.ts / placas.test.ts

- **Found during:** Task 1 verification (`pnpm --filter @cargo-sentinel/api test:unit`)
- **Issue:** 3 test files fail with `Error: [vitest] No "getThumbnailProxyUrl" export is defined on the "../services/garage" mock` — an incomplete mock of `../services/garage` in `eventos.test.ts` and `placas.test.ts`.
- **Root cause:** Unrelated to WhatsApp/Z-API work — these tests mock `../services/garage` without including `getThumbnailProxyUrl`, which `eventos.ts`/`placas.ts` call directly (not touched by this plan).
- **Scope:** Not caused by any file modified in this plan (`packages/database/prisma/schema.prisma`, `apps/api/src/jobs/alert-worker.ts`, `apps/api/src/services/whatsapp.ts`, `apps/api/src/routes/configuracoes-alerta.ts`, `apps/api/src/index.ts`). Confirmed pre-existing by running `alert-worker.test.ts` in isolation (14/14 passed).
- **Action:** Not fixed — out of scope per plan boundary. Flagging for a future quick task / phase.
