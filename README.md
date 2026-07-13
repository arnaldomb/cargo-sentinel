# Cargo Sentinel

Plataforma SaaS multi-tenant de inteligência de perímetro logístico para canteiros de obra.
Monitora entrada, saída e recorrência de veículos via câmeras LPR Intelbras, classificando
cada placa em 5 níveis de risco (Liberado → Crítico) e cruzando eventos entre múltiplas obras
da mesma empresa em tempo real.

**Core Value:** Em 1 clique, o operador classifica um veículo suspeito. Na próxima leitura em
qualquer obra da empresa, o alerta dispara automaticamente.

---

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | Next.js | 15 (App Router) |
| API | Express | 4.x |
| Banco de dados | PostgreSQL | 16 |
| ORM | Prisma | 7.x |
| Tempo real | Socket.IO | 4.x + Redis adapter |
| Object storage | Garage | v2.3.0 (substituto do MinIO) |
| Alertas WhatsApp | Evolution API | **2.3.7 — HARDPINNED, NÃO atualizar para 2.4.0+** |
| Reverse proxy / TLS | Traefik | v3 |
| Monorepo | Turborepo + pnpm | — |
| Cache / pub-sub | Redis | 7.x |

---

## Deploy em Produção (VPS compartilhada)

O cargo-sentinel roda na mesma VPS de outros projetos (ex: opencheck), atrás de um **Traefik
compartilhado** já em execução (container `traefik-traefik-1`, `network_mode: host`). Este
projeto **não sobe Traefik próprio** — `docker-compose.vps.yml` é o arquivo real de produção,
diferente do `docker-compose.yml` da raiz (que sobe um Traefik standalone e serve só para rodar
o stack completo isoladamente, ex: em outra VPS/ambiente sem Traefik compartilhado).

```
Internet → Cloudflare DNS → VPS
                               └── Traefik (network_mode: host, porta 80/443, compartilhado)
                                     ├── portal.ggtronic.com.br              → cargo-sentinel_web:3000
                                     ├── lpr.ggtronic.com.br                 → cargo-sentinel_api:4000
                                     └── storage.sentinel.ggtronic.com.br    → cargo-sentinel_garage:3900
```

### Pré-requisitos

- Traefik compartilhado já rodando na VPS (fora deste repositório)
- Rede Docker externa `proxy` já criada:
  ```bash
  docker network create proxy   # só se ainda não existir
  docker network ls | grep proxy
  ```
- DNS (Cloudflare, registros A → IP da VPS): `portal.ggtronic.com.br`, `lpr.ggtronic.com.br`,
  `storage.sentinel.ggtronic.com.br`
- Cliente `psql` instalado para o smoke test: `apt install postgresql-client`

---

### Passo a passo (primeiro deploy)

#### 1. Preparar a pasta na VPS

A VPS **não é um checkout git** — os arquivos de deploy são copiados manualmente:

```bash
mkdir -p /docker/cargo-sentinel/garage
cd /docker/cargo-sentinel

curl -o docker-compose.vps.yml \
  https://raw.githubusercontent.com/arnaldomb/cargo-sentinel/master/docker-compose.vps.yml
curl -o garage/garage.toml \
  https://raw.githubusercontent.com/arnaldomb/cargo-sentinel/master/garage/garage.toml
```

#### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env   # copiar do repo e preencher
nano .env
```

Variáveis obrigatórias:

| Variável | Descrição | Como gerar |
|----------|-----------|------------|
| `AUTH_SECRET` | Segredo JWT das sessões | `openssl rand -base64 32` |
| `WEB_PUBLIC_URL` | URL pública do portal (Auth.js `AUTH_URL`) | `https://portal.ggtronic.com.br` |
| `AUTH_COOKIE_DOMAIN` | Domínio-pai do cookie de sessão (com ponto inicial) | `.ggtronic.com.br` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais do Postgres | `openssl rand -hex 16` para a senha |
| `GARAGE_ACCESS_KEY` | Chave de acesso do Garage (deve começar com `GK`) | `GK$(openssl rand -hex 16)` |
| `GARAGE_SECRET_KEY` | Chave secreta do Garage | `openssl rand -hex 32` |
| `GARAGE_SERVER_URL` | URL pública HTTPS do Garage | `https://storage.sentinel.ggtronic.com.br` |
| `ZAPI_CLIENT_TOKEN` | Client-Token global opcional (fallback Z-API) | ver painel Z-API |

> `ACME_EMAIL`/`PUBLIC_DOMAIN` do `.env.example` só se aplicam ao `docker-compose.yml`
> standalone (dev/ambiente isolado) — **não são usados** por `docker-compose.vps.yml`, já que
> o TLS é gerenciado pelo Traefik compartilhado.

#### 3. Subida dos serviços

```bash
docker compose -f docker-compose.vps.yml pull
docker compose -f docker-compose.vps.yml up -d
```

O container `migrate` roda uma vez (`db:push` + `seed`) e sai — isso é esperado.

> O seed cria: 1 Super Admin, 1 empresa de demonstração, 1 obra, 1 câmera e usuários de exemplo.

#### 4. Verificar status dos serviços

```bash
docker compose -f docker-compose.vps.yml ps
docker ps --format "{{.Names}}\t{{.Status}}" | grep cargo-sentinel
```

`postgres`, `redis`, `garage` e `api` devem estar **healthy**; `web` não expõe healthcheck
Docker (desabilitado de propósito — ver Troubleshooting) mas deve estar **Up**.

```bash
# Ver logs em tempo real
docker compose -f docker-compose.vps.yml logs -f api
docker compose -f docker-compose.vps.yml logs -f web
```

#### 5. Smoke test de produção

```bash
chmod +x scripts/smoke-test.sh

API_URL="https://lpr.ggtronic.com.br" \
DB_URL="postgresql://sentinel:SENHA@localhost:5433/cargo_sentinel" \
./scripts/smoke-test.sh
```

Saída esperada: **[PASS]** em todas as etapas.

---

### Credenciais de demonstração (seed)

| Role | Email | Senha |
|------|-------|-------|
| Super Admin | superadmin@cargosentinel.com | SuperAdmin123! |
| Admin Empresa | admin@demo.com | Admin123! |
| Operador | operador@demo.com | Operador123! |

> **IMPORTANTE: Trocar todas as senhas imediatamente após o primeiro login em produção.**

---

### Deploy contínuo (CI/CD)

`.github/workflows/deploy.yml` builda as 3 imagens (`migrate`, `api`, `web`), publica no
`ghcr.io/arnaldomb/cargo-sentinel-*` e via SSH roda na VPS:

```bash
cd /docker/cargo-sentinel
docker compose -f docker-compose.vps.yml pull
docker compose -f docker-compose.vps.yml up -d --force-recreate
docker image prune -f
```

A CI **não** copia `docker-compose.vps.yml` para a VPS — mudanças no compose (novo serviço,
nova label, novo volume) exigem repetir o passo 1 manualmente (`curl` do arquivo atualizado).

---

### Troubleshooting

**502 / site não carrega mesmo com containers "Up":**
- Confirmar que `web`/`api`/`garage` estão na rede `proxy` (`docker network inspect proxy`)
- Confirmar `HOSTNAME: "0.0.0.0"` no serviço `web` (Next.js standalone bind — sem isso, escuta só
  no loopback interno do container e o Traefik em host-mode não alcança)
- O healthcheck Docker do `web` é desabilitado de propósito (`healthcheck: disable: true`) —
  reabilitá-lo pode fazer o Traefik tratar o container como unhealthy

**Traefik não roteia para um novo serviço:**
- Verificar labels: `traefik.docker.network=proxy` + `loadbalancer.server.port` (não usar
  `server.url=http://127.0.0.1:<porta>` — não funciona com Traefik em `network_mode: host`)
- Ver logs do Traefik compartilhado: `docker logs traefik-traefik-1`

**API não inicia (exit code 1 imediato):**
- Verificar variáveis obrigatórias ausentes: `docker compose -f docker-compose.vps.yml logs api | head -20`
- Confirmar que `AUTH_SECRET`, `DATABASE_URL`, `GARAGE_ACCESS_KEY`, `GARAGE_SECRET_KEY`,
  `GARAGE_SERVER_URL` estão preenchidos no `.env`

**Garage não aceita uploads / URLs de imagem quebradas:**
- `GARAGE_SERVER_URL` deve ser a URL HTTPS pública acessível externamente (não `http://garage:3900`)
- A chave de acesso deve começar com `GK`
- Ver logs: `docker compose -f docker-compose.vps.yml logs garage`

**Alertas WhatsApp não chegam:**
- Ver `docker compose -f docker-compose.vps.yml logs api | grep alert-worker` — cada skip
  (instância desconectada, classificação fora do filtro, sem destino) é logado explicitamente
- Instância Z-API é provisionada pelo SUPER_ADMIN em `/admin/empresas/[id]` (aba WhatsApp), não
  por variável de ambiente

**Smoke test falha na Etapa 3 (evento não encontrado):**
- Verificar se o seed foi executado (câmera `LPR-SMOKE-01` precisa existir ou ser criada pelo script)
- Ver logs do worker: `docker compose -f docker-compose.vps.yml logs api | grep -i "bullmq\|worker\|lpr"`

---

## Desenvolvimento Local

```bash
# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com valores locais (senhas de dev, localhost, etc.)

# Subir serviços de infraestrutura (postgres, redis, garage, traefik dev, migration)
docker compose up -d

# Iniciar servidores de desenvolvimento (Next.js + Express em paralelo via Turborepo)
pnpm dev
```

URLs de desenvolvimento:
- Dashboard: http://localhost:3000
- API: http://localhost:4000
- API Health: http://localhost:4000/api/health

### Comandos úteis

```bash
# Build completo (todos os pacotes)
pnpm build

# Rodar testes
pnpm test

# Aplicar migrations Prisma
pnpm --filter @cargo-sentinel/database run db:push

# Rodar seed de dados de demonstração
pnpm --filter @cargo-sentinel/database run seed

# Ver logs dos containers
docker compose logs -f postgres
docker compose logs -f redis
```

---

## Segurança

- Nunca commitar o arquivo `.env` — ele está no `.gitignore`
- Rotacionar `AUTH_SECRET` periodicamente (`openssl rand -base64 32`)
- Credenciais Z-API são por empresa (provisionadas pelo SUPER_ADMIN), nunca em variável de ambiente
- `traefik/acme.json` (permissão `600`) só se aplica ao `docker-compose.yml` standalone — a VPS
  compartilhada usa TLS do Traefik externo, sem acme.json neste repositório
- Trocar as senhas do seed (ver tabela acima) antes de colocar em produção

---

## Arquitetura

```
                    ┌─────────────────────────────────┐
                    │         Traefik v3 (TLS)         │
                    │    Let's Encrypt automático      │
                    └────┬──────────┬─────────┬───────┘
                         │ /api     │ /media  │ /
                    ┌────▼──────┐ ┌─▼───────┐ ┌▼──────────┐
                    │  Express  │ │ Garage  │ │  Next.js  │
                    │  API :4000│ │ S3 :3900│ │  Web :3000│
                    └────┬──────┘ └─────────┘ └▲──────────┘
                         │                      │
              ┌──────────▼──────────────────────┘
              │         PostgreSQL 16
              │         Redis 7
              └──────────────────────────────────
```

Monorepo Turborepo:
- `apps/api` — Express: LPR ingestion, REST API, Socket.IO, BullMQ workers
- `apps/web` — Next.js 15: dashboard operacional, super admin panel
- `packages/database` — Prisma schema, migrations, seed
- `packages/shared` — tipos TypeScript compartilhados
