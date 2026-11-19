---
name: tdr-specialist-memory
description: Memória acumulada do agent tdr-specialist — TDR é o raciocínio ANTES da decisão (alternativas, riscos, rollout com rollback); ADR é a decisão datada; plano é a execução. docs/superpowers/plans/** é histórico, não é o TDR vivo.
---

# Memória: `tdr-specialist`

## Decisões Tomadas

### 2026-11-18 — Três artefatos, três donos, três momentos

**Contexto:** o repo já tinha ADR (`docs/adr/`), planos
(`docs/superpowers/plans/`) e a spec (`.agents/specs/templates/spec.md`), e o
kit acrescenta o TDR. Sem a distinção, o item 7 vira mais um lugar onde a
mesma decisão é narrada três vezes.

**Decisão:**
- **TDR** (item 7, `docs/tdr/`) — o raciocínio de engenharia **antes** da
  decisão: proposta, alternativas rejeitadas, riscos com dono, segurança,
  rollout com rollback, revisão crítica.
- **ADR** (item 8, `docs/adr/`) — a decisão **datada e imutável**: contexto,
  decisão, consequências.
- **Plano** — a execução: fases, tasks, agents.

Quando a proposta é aceita, ela vira ADR e o TDR deixa de ser o dono do
"porquê". O TDR aponta o ADR; não o reescreve.

### 2026-11-18 — `docs/superpowers/plans/**` NÃO é o TDR do kit

**Contexto:** a convenção `kit-documentacao.md` §7 diz que o histórico
(`docs/superpowers/plans/**` e `.agents/runs/**`) está fora do alcance do
kit, e `tamanho-e-revisao.md` classifica `docs/superpowers/**` como
`registro-datado` — envelhecer é a função dele.

**Decisão:** o TDR **vivo** do kit vive em `docs/tdr/`, com índice próprio
`docs/tdr/README.md`. O plano histórico serve de referência de *como se
planeja*, não de *onde o TDR mora* — buscá-lo em `docs/superpowers/plans/`
dá arquivo antigo e imutável, e um gate que contasse aquilo mediria
registro, não o item 7.

### 2026-11-18 — Rollout sem rollback é proposta incompleta

**Contexto:** o repo tem um histórico de mudança de papel de banco e de
migração que afeta dado já gravado (ADR-0011 e ADR-0012 no mesmo dia). O
padrão de 3 passos (`migracao-de-dados.md`) só é reversível se o rollback
estiver escrito ao lado.

**Decisão:** a `## Rollout` lista os passos **e** o rollback de cada um, e a
`## Revisão` diz quando o TDR é reavaliado e o que dispara a reavaliação.

**Consequências:** um TDR sem rollback é recusado no review, mesmo que a
proposta seja boa.

## Padrões Descobertos

- O exemplo real mais próximo do item 7 é o
  `docs/adr/0010-system-design-canonico.md`: ele tem as seções
  `## Contexto`, `## Decisão`, `## Consequências`, `## Alternativas
  consideradas` e `## Ver Também` — a forma que o TDR herda.
- O `docs/adr/0010` é também a fonte da regra que **proíbe** o system design
  de repetir o ADR: "o ADR é o dono da decisão; o doc de system design
  aponta, não reescreve".
- A matriz §2.3 do kit dá ao TDR **5 âncoras** (`## Proposta`, `## Riscos`,
  `## Segurança`, `## Rollout`, `## Revisão`) — mais que qualquer outro item
  do kit: o gate compara com `includes()`, então a string tem que aparecer
  literal.
- O `docs/tdr/` **nasceu com o kit** (medido em 2026-11-18: `ls docs/tdr`
  → existe, com o índice e 1 instância).

## Lições Aprendidas

- ❌ Escrever TDR para uma entrega pequena. O item 7 é do **kit** — o kit
  mede presença de lugar, não presença de burocracia.
- ❌ "Revisão crítica" como selo de aprovação: a seção tem que dizer **quando**
  e **contra o quê**.
- ❌ Colar o contexto do ADR dentro do TDR para o leitor não ter de abrir
  dois arquivos — é duplicação (`dry.md`), e a duplicação envelhece nos dois.

## Sugestões de Evolução

- [ ] Um template `.agents/specs/templates/tdr.md` com as 5 âncoras já
  preenchidas como esqueleto, para o app derivado não recriar a estrutura.
- [ ] Ligar o `## Revisão` do TDR a um runbook de observação já existente
  (`docs/runbooks/`), para a reavaliação ter gatilho concreto.
