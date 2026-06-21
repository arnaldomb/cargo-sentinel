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

## Deploy em Produção (Hostinger VPS)

### Pré-requisitos

- VPS Ubuntu 22.04+ com no mínimo 2 vCPUs e 4 GB RAM
- Docker Engine 24+ e Docker Compose Plugin instalados
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- Domínio apontado para o IP da VPS (registro A configurado no DNS)
- Portas **80** e **443** abertas no firewall da VPS
- Cliente `psql` instalado para o smoke test: `apt install postgresql-client`

---

### Passo a passo

#### 1. Clonar o repositório

```bash
git clone <url-do-repo> cargo-sentinel
cd cargo-sentinel
```

#### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env   # Preencher todos os valores (ver comentários no arquivo)
```

Variáveis obrigatórias:

| Variável | Descrição | Como gerar |
|----------|-----------|------------|
| `AUTH_SECRET` | Segredo JWT das sessões | `openssl rand -base64 32` |
| `PUBLIC_DOMAIN` | Domínio sem `https://` (ex: `app.seudominio.com.br`) | — |
| `ACME_EMAIL` | Email para certificados Let's Encrypt | — |
| `POSTGRES_USER` | Usuário do PostgreSQL | ex: `sentinel` |
| `POSTGRES_PASSWORD` | Senha do banco de dados | `openssl rand -hex 16` |
| `POSTGRES_DB` | Nome do banco | ex: `cargo_sentinel` |
| `DATABASE_URL` | URL de conexão completa | ex: `postgresql://sentinel:SENHA@postgres:5432/cargo_sentinel` |
| `GARAGE_ACCESS_KEY` | Chave de acesso do Garage (deve começar com `GK`) | `GK$(openssl rand -hex 16)` |
| `GARAGE_SECRET_KEY` | Chave secreta do Garage | `openssl rand -hex 32` |
| `GARAGE_SERVER_URL` | URL pública HTTPS do Garage | ex: `https://media.seudominio.com.br` |
| `EVOLUTION_API_KEY` | Chave de autenticação da Evolution API | `openssl rand -hex 32` |
| `EVOLUTION_INSTANCE_NAME` | Nome da instância WhatsApp | ex: `cargo-sentinel` |

#### 3. Preparar volumes persistentes

```bash
# Certificado Let's Encrypt — deve existir antes do primeiro up
mkdir -p traefik
touch traefik/acme.json
chmod 600 traefik/acme.json

# Garage — arquivo de configuração (já incluído no repositório)
# garage/garage.toml está versionado; revisar se necessário
ls garage/garage.toml
```

#### 4. Build e subida dos serviços

```bash
# Produção: usa apenas docker-compose.yml (sem override de dev)
docker compose -f docker-compose.yml build

docker compose -f docker-compose.yml up -d
```

#### 5. Migração do banco e seed inicial

```bash
# Executar migration + seed uma única vez no primeiro deploy
docker compose -f docker-compose.yml run --rm api \
  sh -c "pnpm --filter @cargo-sentinel/database run db:push && pnpm --filter @cargo-sentinel/database run seed"
```

> O seed cria: 1 Super Admin, 1 empresa de demonstração, 1 obra, 1 câmera e usuários de exemplo.

#### 6. Verificar status dos serviços

```bash
docker compose -f docker-compose.yml ps
```

Todos os serviços devem exibir **Up (healthy)**. O Traefik emite o certificado Let's Encrypt
automaticamente na primeira requisição HTTPS.

```bash
# Ver logs em tempo real
docker compose -f docker-compose.yml logs -f api
docker compose -f docker-compose.yml logs -f traefik
```

#### 7. Smoke test de produção

```bash
chmod +x scripts/smoke-test.sh

# Usando domínio de produção
API_URL="https://app.seudominio.com.br" \
DB_URL="postgresql://sentinel:SENHA@localhost:5432/cargo_sentinel" \
./scripts/smoke-test.sh
```

Saída esperada: **[PASS]** em todas as 4 etapas.

---

### Credenciais de demonstração (seed)

| Role | Email | Senha |
|------|-------|-------|
| Super Admin | super@sentinel.dev | sentinel123 |
| Admin Empresa | admin@demo.com | sentinel123 |
| Operador | operador@demo.com | sentinel123 |

> **IMPORTANTE: Trocar todas as senhas imediatamente após o primeiro login em produção.**

---

### Atualização de versão

```bash
git pull

docker compose -f docker-compose.yml build

docker compose -f docker-compose.yml up -d

# Migrations: rodar manualmente após cada atualização de schema
docker compose -f docker-compose.yml run --rm api \
  sh -c "pnpm --filter @cargo-sentinel/database run db:push"
```

---

### Troubleshooting

**Traefik não emite certificado Let's Encrypt:**
- Verificar que `traefik/acme.json` existe e tem permissão `600`
- Verificar que o domínio está apontado para o IP da VPS (`dig A app.seudominio.com.br`)
- Ver logs: `docker compose logs traefik`

**API não inicia (exit code 1 imediato):**
- Verificar variáveis obrigatórias ausentes: `docker compose logs api | head -20`
- Erro "Variáveis de ambiente obrigatórias não configuradas" → revisar `.env`
- Confirmar que `AUTH_SECRET`, `DATABASE_URL`, `GARAGE_ACCESS_KEY`, `GARAGE_SECRET_KEY`,
  `GARAGE_SERVER_URL` e `REDIS_URL` estão preenchidos

**Garage não aceita uploads / URLs de imagem quebradas:**
- `GARAGE_SERVER_URL` deve ser a URL HTTPS pública acessível externamente (não `http://garage:3900`)
- A chave de acesso deve começar com `GK`
- Ver logs: `docker compose logs garage`

**Evolution API não envia mensagens WhatsApp:**
- A versão está hardpinned em **2.3.7** — NÃO atualizar para 2.4.0+ (requer licença externa)
- A instância deve ser criada e o QR code lido no painel da Evolution API antes do primeiro envio
- Ver logs: `docker compose logs evolution-api`

**Smoke test falha na Etapa 3 (evento não encontrado):**
- Verificar se o seed foi executado (câmera `LPR-SMOKE-01` precisa existir ou ser criada pelo script)
- Ver logs do worker: `docker compose logs api | grep -i "bullmq\|worker\|lpr"`
- Confirmar que `REDIS_URL` está correto (worker usa Redis para fila BullMQ)

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
- Evolution API hardpinned em 2.3.7 — monitorar releases, mas NÃO atualizar para 2.4.0+
- `traefik/acme.json` deve ter permissão `600` (apenas root lê/escreve)
- Trocar as senhas do seed (`sentinel123`) antes de colocar em produção

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
