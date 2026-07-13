---
type: quick
slug: 260712-udi-enviar-foto-do-evento-junto-do-alerta-wh
autonomous: true
files_modified:
  - apps/api/src/infra/zapi/zapi.service.ts
  - apps/api/src/jobs/alert-worker.ts
  - apps/api/src/jobs/alert-worker.test.ts
  - apps/api/src/jobs/worker.ts
---

<objective>
Enviar a foto do evento junto da mensagem de alerta WhatsApp (antes só texto). Usa o endpoint /send-image da Z-API, enviando a imagem como base64 inline (data URI) em vez de URL pública presignada do Garage, evitando dependência de rede externa/pública.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: sendWhatsAppImage no cliente Z-API + fotoBase64 no payload + envio condicional</name>
  <files>apps/api/src/infra/zapi/zapi.service.ts, apps/api/src/jobs/alert-worker.ts, apps/api/src/jobs/alert-worker.test.ts, apps/api/src/jobs/worker.ts</files>
  <action>
1. zapi.service.ts: sendWhatsAppImage(cfg, to, imageDataUri, caption?) via POST /send-image, mesmo padrão de sendWhatsAppText.
2. alert-worker.ts: WhatsAppAlertPayload ganha fotoBase64?: string; envio usa sendWhatsAppImage (mensagem como caption) quando presente, sendWhatsAppText como fallback.
3. worker.ts: whatsAppPayload (ambos os branches, cross-site e placa pré-cadastrada) ganha fotoBase64 = `data:image/jpeg;base64,${ImageBase64}` — reaproveitando o buffer já disponível ANTES do upload pro Garage.
4. Testes: novo caso cobrindo envio via sendWhatsAppImage com fotoBase64 presente; casos existentes (sem fotoBase64) preservados.
  </action>
  <verify>
    <automated>pnpm --filter @cargo-sentinel/api build && cd apps/api && npx vitest run alert-worker</automated>
  </verify>
  <done>Build passa; 15/15 testes de alert-worker.test.ts passam (14 existentes + 1 novo).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @cargo-sentinel/api build` passa.
- `npx vitest run alert-worker` — 15/15 passam.
</verification>

<success_criteria>
- Alertas WhatsApp de placa SUSPEITO/CRITICO incluem a foto do evento como imagem com legenda, quando disponível.
- Sem imagem disponível, comportamento de texto puro preservado.
</success_criteria>
