---
type: quick
slug: 260712-tuj-corrigir-whatsapp-client-tsx-usando-apib
autonomous: true
files_modified:
  - apps/web/src/app/(admin)/configuracoes/whatsapp/whatsapp-client.tsx
---

<objective>
Corrigir apps/web/src/app/(admin)/configuracoes/whatsapp/whatsapp-client.tsx: os 7 fetch() do componente chamavam `${apiBaseUrl}/api/configuracoes-whatsapp-proxy...`, onde `apiBaseUrl` (via `resolveApiBaseUrl`) retorna `NEXT_PUBLIC_API_BASE_URL` quando definido — uma URL absoluta de domínio diferente onde a rota BFF `/api/configuracoes-whatsapp-proxy*` (que só existe no próprio Next.js) não existe. A chamada falhava silenciosamente e a tela sempre mostrava "não provisionada".
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Trocar fetch absoluto por fetch relativo (proxy same-origin)</name>
  <files>apps/web/src/app/(admin)/configuracoes/whatsapp/whatsapp-client.tsx</files>
  <action>
Remover a lógica de `apiBaseUrl`/`resolveApiBaseUrl`/`window.location` e trocar as 7 ocorrências de `${apiBaseUrl}/api/configuracoes-whatsapp-proxy...` por caminhos relativos, mesmo padrão usado por usuarios-tab.tsx/empresa-detail-shell.tsx/whatsapp-provision-client.tsx.
  </action>
  <verify>
    <automated>pnpm --filter @cargo-sentinel/web build</automated>
  </verify>
  <done>Nenhuma referência a apiBaseUrl/resolveApiBaseUrl restante no arquivo; build web passa.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @cargo-sentinel/web build` passa sem erros.
- grep confirma zero ocorrências de `apiBaseUrl`/`resolveApiBaseUrl` no arquivo.
</verification>

<success_criteria>
- Tela de Configurações → WhatsApp do tenant reflete corretamente o estado real da instância (vinculada/não vinculada) via proxy same-origin.
</success_criteria>
