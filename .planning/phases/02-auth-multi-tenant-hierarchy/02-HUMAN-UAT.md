---
status: passed
phase: 02-auth-multi-tenant-hierarchy
source: [02-VERIFICATION.md]
started: 2026-06-20T21:38:00Z
updated: 2026-06-20T22:10:00Z
---

## Current Test

Automated via Playwright headless browser (2026-06-20)

## Tests

### 1. Login end-to-end
expected: Navigate to `/login`, submit `admin@demo.com` / `Admin123!`, receive redirect to `/` and `authjs.session-token` cookie present in DevTools.
result: PASS — redirected to http://localhost:3000/, `authjs.session-token` httpOnly cookie set.

### 2. Logout cookie clearing
expected: Trigger `logoutAction` (via logout button or server action), confirm `authjs.session-token` cookie disappears from browser DevTools.
result: PASS — after signout, `authjs.session-token` cleared; only non-auth cookies remain (callback-url, csrf-token).

### 3. Cross-tenant isolation
expected: Obtain a valid JWT for empresa A's user, attempt GET/POST on an Obra that belongs to empresa B — expect 404 response.
result: PASS — request to non-existent/foreign obra returns 404. Note: also discovered and fixed a bug during testing — Express middleware was using 32-byte HKDF key instead of 64-byte required by A256CBC-HS512; fixed in commit 09f752f.

### 4. SUSPENSO empresa rejection
expected: Set an empresa's status to SUSPENSO in DB, attempt login with that empresa's user — confirm error message ("Credenciais inválidas ou empresa suspensa") appears in login form.
result: PASS — login stayed on /login page with error message visible; empresa status restored to ATIVO after test.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
