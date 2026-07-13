---
type: quick
slug: 260713-qzz-corrigir-deploy-vps-ci-aponta-pra-docker
autonomous: true
files_modified:
  - .github/workflows/deploy.yml
  - docker-compose.vps.yml
  - README.md
---

<objective>
Comparar a configuração de deploy (Traefik/docker-compose) do cargo-sentinel com o opencheck (já rodando no Traefik compartilhado da VPS) e corrigir as lacunas encontradas para garantir que os dois projetos coexistam com segurança no mesmo host.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: CI aponta explicitamente para docker-compose.vps.yml</name>
  <files>.github/workflows/deploy.yml</files>
  <action>
`docker compose pull`/`up -d --force-recreate` sem `-f` dependia de qual arquivo estivesse nomeado `docker-compose.yml` no VPS. Como o `docker-compose.yml` deste repo é a variante standalone (sobe Traefik próprio), passou a apontar explicitamente `-f docker-compose.vps.yml`.
  </action>
  <verify>
    <manual>grep confirma "-f docker-compose.vps.yml" nos dois comandos do step de deploy.</manual>
  </verify>
  <done>Workflow usa docker-compose.vps.yml explicitamente.</done>
</task>

<task type="auto">
  <name>Task 2: healthcheck disable no serviço web</name>
  <files>docker-compose.vps.yml</files>
  <action>
Adicionado `healthcheck: disable: true` ao serviço `web`, replicando o padrão documentado pelo opencheck (Next.js standalone atrás de Traefik em host-mode não deve ter healthcheck Docker, senão o Traefik pode tratar o container como unhealthy).
  </action>
  <verify>
    <automated>docker compose -f docker-compose.vps.yml config --quiet</automated>
  </verify>
  <done>docker-compose.vps.yml válido; web tem healthcheck desabilitado.</done>
</task>

<task type="auto">
  <name>Task 3: Reescrever seção de Deploy do README</name>
  <files>README.md</files>
  <action>
Seção "Deploy em Produção" documentava o fluxo errado (docker-compose.yml standalone, acme.json, Evolution API já removida, senhas de seed desatualizadas). Reescrita para refletir o fluxo real: Traefik compartilhado externo, rede proxy, docker-compose.vps.yml, credenciais de seed atuais. Seção "Segurança" também corrigida (remoção de referência a Evolution API, ajuste de nota sobre acme.json).
  </action>
  <verify>
    <manual>Revisão manual do texto — sem referências a Evolution API ou docker-compose.yml como arquivo de produção.</manual>
  </verify>
  <done>README reflete o deploy real via docker-compose.vps.yml + Traefik compartilhado.</done>
</task>

</tasks>

<verification>
- `docker compose -f docker-compose.vps.yml config --quiet` passa.
- Nenhuma colisão de nome de router ou domínio com opencheck (confirmado via pesquisa comparativa).
</verification>

<success_criteria>
- Próximo deploy via CI usa o compose correto (sem Traefik próprio), sem risco de brigar por portas 80/443 com o Traefik compartilhado.
- Documentação do README consistente com o deploy real.
</success_criteria>
