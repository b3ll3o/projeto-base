---
name: c4-specialist-memory
description: Memória acumulada do agent c4-specialist — a topologia em 7 contêineres e 3 redes, as 3 fronteiras de confiança e as ausências que o desenho escreve
---

# Memória: `c4-specialist`

> Arquivo de memória do agent `c4-specialist`.

## Decisões Tomadas

### 2026-11-18 — O C4 guarda a topologia e a política; nunca a lista de endpoints

**Contexto:** a lista de endpoints existe em `docs/api/<bc>.md` (contrato
legível) e no `apps/api/openapi.json` versionado (contrato gerado). O §5 do
`contexto.md` guarda só a **política**: prefixo global `/api/v1`, "breaking
change abre `/api/v2`", o formato de erro RFC 7807, e onde o Swagger é
habilitado.

**Decisão:** o §5 é **regra**, não inventário. Nenhum path de endpoint entra
no `contexto.md`; o contrato tem dono e o desenho aponta.

**Consequências:** o doc não cresce a cada rota nova, e o leitor que procura
"qual é a URL" vai ao lugar certo.

### 2026-11-18 — 3 fronteiras, 1 mecanismo de defesa cada

**Contexto:** o §3 do `contexto.md` tem 3 fronteiras — borda (HTTPS do
browser), serviço (HTTP interno + `Authorization: Bearer`) e dados (Prisma
com escopo). Cada uma tem **um** mecanismo: `helmet` + CORS whitelist;
`JwtAuthGuard` + `PermissionsGuard` + `FeatureFlagGuard` + `Throttler`; e a
policy de RLS do banco.

**Decisão:** a fronteira 3 é a única que **sobrevive ao bug** — as duas
primeiras dependem do código estar certo, a terceira depende do **banco**
recusar. Fronteira nova entra com **um** mecanismo, e a tabela diz como ela
falha em profundidade.

**Consequências:** "quem decide" e "falha em profundidade" são as duas
colunas que impedem a fronteira de virar lista de features.

### 2026-11-18 — A ausência de topologia é escrita, com o comando que a prova

**Contexto:** o §2.3 lista o que o desenho **não** tem: fila/mensageria
(nenhum broker — `grep -l 'bullmq\|redis\|kafka' apps/*/package.json` → nada),
cache distribuído (o único cache é in-process, de 5 s, e é do **perfil**),
service mesh/API gateway (a borda é o próprio web) e CDN no caminho da
requisição (a Cloudflare aparece num runbook de verificação de conta, não no
caminho da request).

**Decisão:** cada ausência é escrita com a **evidência** que a prova. É a
regra P8 do índice: o que não existe é parte do design.

**Consequências:** o próximo desenho não "reinventa" um Redis — ele sabe que
a ausência foi pensada, e sabe o que ela custaria.

## Padrões Descobertos

- A topologia são **7 serviços** no Compose: **3 sem profile** (web, api,
  postgres) e **4 no profile `observability`** (otel-collector, tempo,
  prometheus, grafana). O comando:
  `docker compose --profile observability config --services` → 7.
- As **3 redes** são parte do desenho, não detalhe do Compose: `frontend`
  (web, api, otel-collector), `backend` (postgres, api) e `observability`
  (otel-collector, tempo, prometheus, grafana). A justificativa da terceira
  está no próprio `docker-compose.yml`: a observabilidade é separada **de
  propósito**, para o painel não virar porta de entrada do banco.
- O `postgres` do Compose **não publica porta no host** desde o #91
  (`expose` sem `ports`) — o `README.md` e o runbook §1.1 avisam, e a API
  na máquina não o alcança. É a afirmação que mais quebra o manual.
- O **browser nunca fala com a API**: todo tráfego passa por Server Action
  (`apps/web/lib/sessao.ts:9-14`). A seta `visitante --> web` do §1 é
  literal, e a afirmação tem dono com linha.
- O `contexto.md` tem **3** diagramas (`grep -c '%%{init:'` → 3): o L1, o L2
  e a fronteira de confiança — os 3 nascem com o bloco e a paleta da §2 do
  índice.
- O §4 lista os trade-offs como **decisão · alternativa rejeitada · o que
  se paga**: schema único + `tenant_id` + RLS (paga: `users` e
  `users_history` não têm `tenant_id` e são isolados por
  `usuario_no_escopo()`), bucket de sistema por credencial (paga: 2 URIs e 2
  papéis), contexto de empresa no header (paga: trocar de empresa não emite
  token novo), refresh token revogável (paga: tabela `refresh_tokens`),
  `FORCE ROW LEVEL SECURITY` **não** usado (paga: migrations e seed podem
  escrever em tudo), perfil por membership, JWT stateless, sem cache
  distribuído.
- O `contexto.md` tem **259 linhas** pela contagem do `check-doc-size` — 41
  de folga até o teto.

## Lições Aprendidas

- ❌ **Contagem sem comando.** "7 serviços" sem o
  `docker compose --profile observability config --services` é uma
  afirmação que envelhece.
- ❌ **Serviço novo só no diagrama.** Sem a linha na tabela §2.2, ele não
  tem imagem, não tem dono do detalhe e não tem porta.
- ❌ **Desenhar o endpoint.** A lista é de `docs/api/<bc>.md`; aqui mora só
  a política.
- ❌ **Ausência silenciosa.** Redis, fila, CDN e service mesh não existem —
  e isso precisa estar escrito, com o comando que prova.
- ❌ **Decidir.** O §4 resume a decisão registrada; o motivo completo é do
  ADR citado ao lado.

## Sugestões de Evolução

- [ ] O `docker-compose.yml` **não** tem entrada no mapa do `doc-sync`
      (`tooling/scripts/doc-sync.ts`) — a topologia é o item que mais muda
      por mudança de infra, e é o doc que mais envelhece sem mapa.
- [ ] As imagens do §2.2 são versionadas **por digest**
      (`postgres:16-alpine`, `otel/opentelemetry-collector-contrib:0.103.0`,
      `grafana/tempo:2.5.0`, `prom/prometheus:v2.54.1`,
      `grafana/grafana:11.2.0`) — o digest é o dado que impede a versão de
      mentir; verificar se o doc traz o digest, não só a tag.
