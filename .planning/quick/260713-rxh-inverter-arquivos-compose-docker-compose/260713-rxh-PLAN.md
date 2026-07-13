---
type: quick
slug: 260713-rxh-inverter-arquivos-compose-docker-compose
autonomous: true
files_modified:
  - docker-compose.yml
  - docker-compose.local.yml
  - .github/workflows/deploy.yml
  - README.md
---

<objective>
Corrigir falha real de deploy no Hostinger Docker Manager: o painel sempre usa docker-compose.yml da raiz sem opção de escolher outro arquivo, então puxou a versão standalone (com Traefik próprio) e tentou bindar porta 80, já ocupada pelo Traefik compartilhado (traefik-traefik-1) usado pelo opencheck.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Inverter papéis dos arquivos compose</name>
  <files>docker-compose.yml, docker-compose.local.yml, .github/workflows/deploy.yml, README.md</files>
  <action>
git mv docker-compose.yml → docker-compose.local.yml (standalone, Traefik próprio, usado em dev local + override).
git mv docker-compose.vps.yml → docker-compose.yml (sem Traefik próprio, rede externa proxy — agora o arquivo padrão que Hostinger/CI usam).
Headers de ambos os arquivos atualizados para refletir os novos papéis.
.github/workflows/deploy.yml volta a rodar `docker compose` sem -f (aponta pro arquivo correto por padrão agora).
README.md: seção de deploy reescrita cobrindo as duas opções (Hostinger Docker Manager git-based e SSH manual), aviso sobre packages GHCR precisarem ser públicos, comandos de dev local atualizados com -f docker-compose.local.yml explícito, tabela de Stack corrigida (Z-API em vez de Evolution API, já obsoleto).
  </action>
  <verify>
    <automated>docker compose -f docker-compose.yml config --quiet && docker compose -f docker-compose.local.yml -f docker-compose.override.yml config --quiet</automated>
  </verify>
  <done>Ambos os composes validam; docker-compose.yml é a versão sem Traefik próprio; nenhuma referência solta a docker-compose.vps.yml fora de docs históricos (.planning).</done>
</task>

</tasks>

<verification>
- `docker compose -f docker-compose.yml config --quiet` passa.
- `docker compose -f docker-compose.local.yml -f docker-compose.override.yml config --quiet` passa.
- grep confirma zero referências a docker-compose.vps.yml fora de .planning/.
</verification>

<success_criteria>
- Próximo deploy via Hostinger Docker Manager ou CI usa o compose correto (sem Traefik próprio, sem tentar bindar porta 80/443).
- Dev local continua funcionando via docker-compose.local.yml + override.
- Packages GHCR do cargo-sentinel precisam ser tornados públicos manualmente pelo usuário (ação fora do repositório).
</success_criteria>
