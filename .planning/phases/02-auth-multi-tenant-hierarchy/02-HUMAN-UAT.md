---
status: partial
phase: 02-auth-multi-tenant-hierarchy
source: [02-VERIFICATION.md]
started: 2026-06-20T21:38:00Z
updated: 2026-06-20T21:38:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Login end-to-end
expected: Navigate to `/login`, submit `admin@demo.com` / `Admin123!`, receive redirect to `/` and `authjs.session-token` cookie present in DevTools.
result: [pending]

### 2. Logout cookie clearing
expected: Trigger `logoutAction` (via logout button or server action), confirm `authjs.session-token` cookie disappears from browser DevTools.
result: [pending]

### 3. Cross-tenant isolation
expected: Obtain a valid JWT for empresa A's user, attempt GET/POST on an Obra that belongs to empresa B — expect 404 response.
result: [pending]

### 4. SUSPENSO empresa rejection
expected: Set an empresa's status to SUSPENSO in DB, attempt login with that empresa's user — confirm error message ("Credenciais inválidas ou empresa suspensa") appears in login form.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
