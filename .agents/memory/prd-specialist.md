---
name: prd-specialist-memory
description: Memória acumulada do agent prd-specialist — o PRD deste repo é o do TEMPLATE (o usuário é quem deriva o app), e a métrica só vale com o comando que a reproduz.
---

# Memória: `prd-specialist`

> Arquivo de memória do agent `prd-specialist`.

## Decisões Tomadas

### 2026-11-18 — O PRD canônico descreve o template, não um produto

**Contexto:** o repo é o `projeto-base`, um template que um app derivado
copia. Não existe cliente final, receita, ou backlog de produto aqui — e a
matriz da convenção `kit-documentacao.md` §2.3 exige `docs/prd/0001-projeto-base.md`
mesmo assim.

**Decisão:** o usuário do PRD é **quem vai derivar o app**. O problema
declarado é o do template (dar tenancy, RBAC, auditoria e observabilidade
prontos, com a fronteira de confiança fechada), e não um problema de
negócio de algum produto fictício. Frase que não é sobre o template ou
sobre quem o deriva pertence ao PRD do app derivado — isso evita inventar
número de cliente, de receita ou de TAM, que é pior que ausência.

### 2026-11-18 — A métrica carrega o comando, ou não entra

**Contexto:** `documentacao.md` §4.1 e `tamanho-e-revisao.md`
§Verificabilidade exigem que todo claim numérico seja reproduzível por
comando documentado inline. O `check-doc-claims` só cobre o que está no
registry `.tooling/scripts/ci/doc-claims.json` — os claims fora do registry
são HUMANOS.

**Decisão:** o PRD escreve a métrica no formato `valor` + comando entre
crase, como o resto do repo já faz (ex.: `docs/api/users.md` abre com
"Medido em 2026-11-17" e o comando de contagem na mesma linha).

**Consequências:** métrica sem comando sai do PRD; prefiro 3 métricas com
comando a 8 sem.

### 2026-11-18 — O formato vem de `.agents/specs/templates/spec.md`

**Contexto:** o repo já tem um template de spec com §1 Intent, §2 Business
Rules e §3 Acceptance Criteria. Um PRD com outra forma cria um segundo
vocabulário para a mesma ideia.

**Decisão:** o PRD adota a mesma alma do template de spec — o que e por que
(§1), as regras (§2), os critérios de aceitação (§3) — mas em nível de
produto, não de feature. O link é a referência de formato, não uma
cópia.

**Consequências:** quem deriva o app lê a spec e o PRD com o mesmo vocabulário.

## Padrões Descobertos

- As famílias `docs/prd/` e `docs/tdr/` **nasceram com o kit** (medido em
  2026-11-18, `ls docs/prd docs/tdr` → as duas existem, com 1 instância
  cada e o índice `README.md` de cada uma).
- `apps/api/src/modules/` tem 6 bounded contexts (`auth`, `feature-flags`,
  `health`, `profiles`, `tenancy`, `users`) — `ls apps/api/src/modules/ | wc -l`
  → `6`. É o número que serve de métrica de "escopo entregue".
- O `check-doc-kit` exige que o índice cite o **basename** do doc canônico
  (`0001-projeto-base.md`), não o caminho completo — o gate compara com
  `path.posix.basename`.
- O gate mede a âncora por `conteudo.includes(ancora)`: a string literal
  precisa aparecer, com o mesmo acento e o mesmo `##`.

## Lições Aprendidas

- ❌ Escrever "o PRD precisa de um objetivo de negócio" e parar aí: a
  métrica é a parte que o gate e o leitor checam.
- ❌ Tratar `doc-writer` e `doc-sync` como rivais. Eles continuam válidos —
  `doc-writer` escreve doc genérica sob demanda, `doc-sync` reage ao diff. O
  PRD é o item 6 do kit, com dono próprio.
- ❌ Confundir o índice do item com o índice de ADRs (`docs/agents/domain.md`):
  cada item da matriz §2 tem o seu.

## Sugestões de Evolução

- [ ] Registrar no registry `.tooling/scripts/ci/doc-claims.json` as
  métricas do PRD — hoje elas dependem só de leitura humana.
- [ ] Um template `.agents/specs/templates/prd.md` próprio, para o app
  derivado preencher sem ler o PRD do template.
