---
type: quick
slug: 260712-rtv-corrigir-cookie-de-sess-o-auth-js-quebra
autonomous: true
files_modified:
  - docker-compose.override.yml
---

<objective>
Corrigir login quebrado em dev local via Docker: o container `web` herdava `AUTH_COOKIE_DOMAIN=.ggtronic.com.br` do `.env` de produção, fazendo o navegador rejeitar o cookie de sessão do Auth.js ao acessar via `http://localhost:3000` (Domain attribute não corresponde ao host da requisição).
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Sobrescrever AUTH_URL/AUTH_COOKIE_DOMAIN/NODE_ENV para dev local no override</name>
  <files>docker-compose.override.yml</files>
  <action>
No serviço `web` de docker-compose.override.yml, adicionar `NODE_ENV: development`, `AUTH_URL: "http://localhost:3000"` e `AUTH_COOKIE_DOMAIN: ""` (vazio, sem domínio-pai de produção) para que o cookie de sessão seja válido em `localhost`.
  </action>
  <verify>
    <manual>docker compose up -d web; POST /api/auth/callback/credentials com credenciais válidas retorna Set-Cookie sem atributo Domain e GET /api/auth/session subsequente retorna o usuário autenticado.</manual>
  </verify>
  <done>Login via localhost:3000 funciona; cookie de sessão sem Domain=.ggtronic.com.br.</done>
</task>

</tasks>

<verification>
- Fluxo curl: GET /api/auth/csrf → POST /api/auth/callback/credentials → GET /api/auth/session retorna `{"user": {...}}`.
</verification>

<success_criteria>
- Login funciona em ambiente de dev local via docker-compose (localhost:3000) com as três contas seed (superadmin, admin, operador).
- `docker-compose.yml` (produção) não foi alterado — fix isolado no override de dev.
</success_criteria>
