#!/usr/bin/env bash
# chmod +x scripts/smoke-test.sh antes de executar
#
# Cargo Sentinel — Smoke Test End-to-End
# Valida um deploy de produção em 4 etapas automatizadas:
#   1. Health endpoint da API
#   2. Webhook LPR mock (câmera Intelbras)
#   3. Evento persistido no banco (processamento assíncrono BullMQ)
#   4. Idempotência — reenvio não duplica registro
#
# Uso:
#   ./scripts/smoke-test.sh
#   API_URL="https://app.seudominio.com.br" DB_URL="postgresql://sentinel:SENHA@localhost:5432/cargo_sentinel" ./scripts/smoke-test.sh
#
# Pré-requisitos:
#   - psql client instalado (apt install postgresql-client)
#   - Serviços rodando e acessíveis

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
API_URL="${API_URL:-http://localhost:4000}"
DB_URL="${DB_URL:-postgresql://sentinel:sentinel@localhost:5432/cargo_sentinel}"
PLATE="SMOKE$(date +%s)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }

echo "============================================"
echo " Cargo Sentinel — Smoke Test"
echo " API: $API_URL"
echo " Placa de teste: $PLATE"
echo "============================================"

# ---------------------------------------------------------------------------
# ETAPA 1: Health check
# ---------------------------------------------------------------------------
echo ""
echo "--- Etapa 1: Health endpoint ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health")
[ "$STATUS" = "200" ] && pass "GET /api/health → 200" || fail "GET /api/health → $STATUS (esperado 200)"

# ---------------------------------------------------------------------------
# Preparação: garantir câmera de smoke no banco (usa dados do seed)
# ---------------------------------------------------------------------------
echo ""
echo "--- Preparação: garantindo câmera de smoke (LPR-SMOKE-01) ---"
EMPRESA_ID=$(psql "$DB_URL" -t -c "SELECT id FROM \"Empresa\" LIMIT 1;" 2>/dev/null | tr -d ' \n' || true)
OBRA_ID=""
if [ -n "$EMPRESA_ID" ]; then
  OBRA_ID=$(psql "$DB_URL" -t -c "SELECT id FROM \"Obra\" WHERE \"empresaId\" = '$EMPRESA_ID' LIMIT 1;" 2>/dev/null | tr -d ' \n' || true)
fi

if [ -n "$EMPRESA_ID" ] && [ -n "$OBRA_ID" ]; then
  psql "$DB_URL" -c "INSERT INTO \"Camera\" (\"codigoLpr\", \"obraId\", \"empresaId\", \"ativo\", \"createdAt\")
    VALUES ('LPR-SMOKE-01', '$OBRA_ID', '$EMPRESA_ID', true, NOW())
    ON CONFLICT (\"codigoLpr\") DO NOTHING;" 2>/dev/null || true
  echo "[INFO] Câmera LPR-SMOKE-01 garantida para empresa $EMPRESA_ID / obra $OBRA_ID"
else
  echo "[WARN] Nenhuma empresa/obra encontrada no banco — câmera LPR-SMOKE-01 não será criada automaticamente."
  echo "       O webhook retornará 200, mas o worker pode não persistir o evento."
  echo "       Execute o seed antes do smoke test: pnpm --filter @cargo-sentinel/database run seed"
fi

# ---------------------------------------------------------------------------
# ETAPA 2: Webhook LPR mock (câmera Intelbras)
# ---------------------------------------------------------------------------
echo ""
echo "--- Etapa 2: Webhook LPR mock ---"
# Payload mínimo com base64 de 1x1 pixel PNG transparente
TINY_IMAGE="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
PAYLOAD=$(printf '{"plateNumber":"%s","cameraCode":"LPR-SMOKE-01","direction":"ENTRADA","capturedAt":"%s","imageBase64":"%s"}' \
  "$PLATE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TINY_IMAGE")
LPR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$API_URL/api/lpr/NotificationInfo/vehicle" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
[ "$LPR_STATUS" = "200" ] && pass "POST /api/lpr/NotificationInfo/vehicle → 200" || fail "LPR webhook → $LPR_STATUS (esperado 200)"

# ---------------------------------------------------------------------------
# ETAPA 3: Aguardar processamento assíncrono (BullMQ worker, max 10s)
# ---------------------------------------------------------------------------
echo ""
echo "--- Etapa 3: Aguardar processamento assíncrono (max 10s) ---"
FOUND=0
for i in $(seq 1 10); do
  sleep 1
  COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM \"Evento\" WHERE \"placaNumero\" = '$PLATE';" 2>/dev/null | tr -d ' \n' || echo "0")
  if [ "${COUNT:-0}" -gt "0" ]; then
    FOUND=1
    break
  fi
  echo "[INFO] Aguardando... (${i}s)"
done
[ "$FOUND" = "1" ] && pass "Evento com placa $PLATE encontrado no banco após processamento" \
  || fail "Evento com placa $PLATE NÃO encontrado no banco após 10s — verifique o worker BullMQ e se a câmera LPR-SMOKE-01 está cadastrada"

# ---------------------------------------------------------------------------
# ETAPA 4: Idempotência — reenviar mesmo payload não duplica registro
# ---------------------------------------------------------------------------
echo ""
echo "--- Etapa 4: Idempotência (reenvio não duplica) ---"
curl -s -o /dev/null -X POST "$API_URL/api/lpr/NotificationInfo/vehicle" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
sleep 2
COUNT2=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM \"Evento\" WHERE \"placaNumero\" = '$PLATE';" 2>/dev/null | tr -d ' \n' || echo "0")
[ "${COUNT2:-0}" = "1" ] && pass "Idempotência OK — $PLATE tem exatamente 1 registro após 2 envios" \
  || fail "Idempotência FALHOU — $PLATE tem $COUNT2 registros (esperado 1)"

# ---------------------------------------------------------------------------
# Resultado final
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo " SMOKE TEST CONCLUÍDO COM SUCESSO"
echo "============================================"

# ---------------------------------------------------------------------------
# Limpeza (comentada por padrão — descomentar para ambiente efêmero)
# ---------------------------------------------------------------------------
# psql "$DB_URL" -c "DELETE FROM \"Evento\" WHERE \"placaNumero\" = '$PLATE';"
