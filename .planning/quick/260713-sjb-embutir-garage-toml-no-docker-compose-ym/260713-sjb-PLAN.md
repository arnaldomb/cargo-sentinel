---
type: quick
slug: 260713-sjb-embutir-garage-toml-no-docker-compose-ym
autonomous: true
files_modified:
  - docker-compose.yml
  - .env.example
  - README.md
---

<objective>
Corrigir falha real em produção: garage crashando com "Error: IO error: Is a directory" ao ler /etc/garage.toml, travando toda a cadeia de dependências (api/migrate esperando garage healthy). Causa raiz: Hostinger Docker Manager só copia docker-compose.yml pra pasta persistente do projeto, não o resto do repositório — bind mount ./garage/garage.toml:/etc/garage.toml aponta pra arquivo inexistente no host, e Docker cria uma pasta vazia no lugar.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: garage.toml via configs inline em vez de bind mount</name>
  <files>docker-compose.yml, .env.example, README.md</files>
  <action>
Adicionado bloco top-level `configs: garage_toml: content: |...` com o conteúdo do garage.toml embutido diretamente no docker-compose.yml, interpolando GARAGE_RPC_SECRET/GARAGE_ADMIN_TOKEN do .env. Serviço garage trocou `volumes: [./garage/garage.toml:/etc/garage.toml]` por `configs: [{source: garage_toml, target: /etc/garage.toml}]`. .env.example ganhou as duas novas variáveis. README.md atualizado (removida instrução de copiar garage.toml manualmente, adicionada nota sobre o inline config).
Também revertido .env.example: ZAPI_CLIENT_TOKEN tinha um valor real carregado localmente (não commitado) — restaurado ao placeholder antes de commitar.
  </action>
  <verify>
    <automated>docker compose -f docker-compose.yml config --quiet</automated>
  </verify>
  <done>docker-compose.yml valida; configs.garage_toml.content interpola as variáveis corretamente (testado com docker compose config); nenhum bind mount de garage.toml restante no compose de produção.</done>
</task>

</tasks>

<verification>
- `docker compose -f docker-compose.yml config --quiet` passa.
- `docker compose -f docker-compose.yml config` mostra o conteúdo do garage.toml interpolado corretamente sob `configs:`.
- Confirmado em produção (VPS real, via usuário): garage sobe healthy após a correção.
</verification>

<success_criteria>
- Deploy via Hostinger Docker Manager não depende mais de nenhum arquivo do repositório além do docker-compose.yml da raiz.
- garage.toml nunca mais vira uma pasta vazia por bind mount de arquivo ausente.
</success_criteria>
