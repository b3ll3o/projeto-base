# PRD-0001 — projeto-base

> O PRD **do próprio template**. O produto aqui não é um app de negócio: é o
> `projeto-base`, o monorepo que serve de ponto de partida para apps
> NestJS + Next.js com agents de IA interoperáveis.
>
> O formato dos PRD deste repo está em [`docs/prd/README.md`](./README.md).

- **Status:** Aceito
- **Data:** 2026-11-18
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Relacionados:** [ADR-0010 — system design canônico](../adr/0010-system-design-canonico.md) · [TDR-0001 — system design canônico](../tdr/0001-system-design-canonico.md) · [`docs/system-design/`](../system-design/README.md)

## Problema

Um time que constrói um app full-stack com NestJS + Next.js **repete o mesmo
andaime**, e o andaime não é o código: são as **decisões** que o código
embute.

O que toda app precisa decidir antes de escrever a primeira feature:

| A decisão | Por que ela não é óbvia |
|---|---|
| Onde a fronteira do domínio fica (`domain` / `application` / `infrastructure`) | a resposta errada não quebra o build — quebra a testabilidade, anos depois |
| Qual credencial atravessa o banco | "só mais um `where`" isola enquanto o código estiver certo |
| O que uma rota que **esqueceu** o escopo de empresa lê | a resposta errada é **zero linhas**, e "a lista veio vazia" não parece bug |
| Se o refresh token é revogável | a resposta errada é um token de 7 dias que se renova sozinho, e que nada invalida |
| O que "auditoria" significa | cada time inventa o seu formato, e o histórico fica ilegível |
| Como o que foi decidido é **registrado** | sem ADR, a decisão vive na cabeça de quem partiu |

O custo não é a linha de código: é a **decisão re-feita** e o **modo de falha
silencioso**. E o efeito é maior quando o time também quer agents de IA que
funcionem em qualquer ferramenta — o que exige um padrão de coordenação, de
convenções e de gates que ninguém reescreve por app.

O resultado medido no repositório: o mesmo tema de tenancy, refresh token,
idempotência e orçamento de tempo apareceu como **problema real** quatro vezes
(ADR-0004, ADR-0007, ADR-0011 e ADR-0012), e cada uma delas custou um plano
inteiro de implementação.

## Objetivo de negócio

> **Um app derivado do `projeto-base` chega ao primeiro deploy em horas, com as
> decisões de arquitetura já tomadas, registradas e com instrumento — e cada
> decisão nova começa de um ADR, não do zero.**

O valor não está no código copiado (que qualquer um copia). Está em **não
decidir de novo**, e em **decidir com o registro e o gate que obrigam o
registro a continuar verdadeiro**.

## Escopo

### Entra

- O **monorepo** com `apps/api` (NestJS) e `apps/web` (Next.js), já
  implementados: autenticação, tenancy multi-empresa, RBAC por perfil,
  feature flags, auditoria e administração de sistema.
- As **convenções** que regem o repositório — inclusive o padrão genérico de
  agents de IA, que é o que torna o template vendor-neutral.
- Os **gates** que cobram as convenções: o que não é medido por instrumento
  envelhece sem ninguém perceber.
- O **desenho do sistema** (`docs/system-design/`) e o **contrato de
  extensão** — a parte que faz um app derivado *estender* o padrão em vez de
  só copiá-lo.
- O **kit de documentação moderna**, com um doc canônico, um dono e um auditor
  por item ([`kit-documentacao.md`](../../.agents/specs/conventions/kit-documentacao.md)).

### Não entra

- **O produto de quem deriva.** O template não decide o domínio de negócio.
- **As decisões de domínio de cada app.** O derivado estende o desenho; os
  ADRs novos dele nascem **no diretório de ADR do derivado**, não aqui.
- **A infraestrutura de produção de quem deriva.** O template entrega o
  desenho e o procedimento ([`docs/runbooks/`](../runbooks/)), não o cluster.
- **Um produto fechado.** O template é reutilizável por definição; um app
  derivado que não puder ser customizado quebrou o objetivo.

## Métricas de sucesso

| # | Métrica | Estado | O que mede |
|---|---|---|---|
| **M1** | **Tempo até o primeiro deploy** de um app derivado | a medir | do `cp -r` do template até o primeiro deploy que responde |
| **M2** | **Decisões que o derivado precisou tomar sozinho** | a medir | quantas decisões de arquitetura o derivado teve de tomar sem registro prévio aqui |
| **M3** | **Nº de apps derivados** | **medido** | repositórios derivados do template |

## Como se mede

Cada métrica tem **instrumento** — o comando ou a fonte que produz o número.
Sem instrumento, a métrica não entra.

### M1 — Tempo até o primeiro deploy

**Instrumento:** no repositório derivado, o intervalo entre o primeiro commit e
o primeiro deploy que responde.

```bash
# no repo derivado
git log --reverse --format=%cI | head -1     # data do primeiro commit
# a data do primeiro deploy vem do CI: a run mais antiga do workflow de deploy
gh run list --limit 1 --created "<data-do-primeiro-commit>" --json createdAt
```

**Quem mede:** quem deriva, ao publicar o primeiro deploy.
**Quando:** a cada app derivado novo.
**Estado:** **a medir** — nenhum app derivado foi publicado a partir deste
template até 2026-11-18, e o repo não tem onde registrar a data.

### M2 — Decisões que o derivado precisou tomar sozinho

**Instrumento:** a contagem de ADRs **novos** no repo derivado, comparada com o
que o template já registra.

```bash
# o que o template já decide (a linha de base)
ls docs/adr/*.md | wc -l                       # → 12 ADRs, em 2026-11-18

# o que o derivado precisou decidir sozinho (a diferença)
ls <repo-derivado>/docs/adr/*.md | wc -l
```

Um ADR novo **sem correspondente aqui** é uma decisão que o derivado teve de
tomar sozinho — que é exatamente o que a métrica quer contar. Um ADR novo
**com** correspondente é o template sendo estendido, e não uma lacuna.

**Quem mede:** quem deriva, no primeiro ADR novo.
**Quando:** a cada app derivado.
**Estado:** **a medir** — não há app derivado para medir.

### M3 — Nº de apps derivados

**Instrumento:** a API do GitHub, que conta os repositórios derivados deste
template.

```bash
gh api repos/b3ll3o/projeto-base --jq '.forks_count'
```

**Medido em 2026-11-18:** `0`.

⚠️ O número é um **proxy**, e ele **subdeclara**: a Opção 1 de derivação
(`cp -r`) não deixa rastro no GitHub. O número real de apps derivados é, no
mínimo, o do proxy — e a diferença não é mensurável por este instrumento.

**Quem mede:** a auditoria periódica do `documentation-specialist`.
**Quando:** a cada ciclo de auditoria.

## Ver Também

- [`docs/prd/README.md`](./README.md) — o índice dos PRD deste repo.
- [`../system-design/README.md`](../system-design/README.md) — o desenho que este PRD entrega.
- [`../tdr/0001-system-design-canonico.md`](../tdr/0001-system-design-canonico.md) — a decisão que deu forma ao desenho.
- [`../adr/0010-system-design-canonico.md`](../adr/0010-system-design-canonico.md) — o ADR dono da decisão.
- [`../../.agents/specs/conventions/kit-documentacao.md`](../../.agents/specs/conventions/kit-documentacao.md) — o kit de documentação que este PRD exige.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.30.0
