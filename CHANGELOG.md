# CHANGELOG

> Registro de versão do template, em **pt-BR**, no formato
> [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
>
> A versão corrente do template é **1.31.0**. O **fato** de cada versão é a
> tag correspondente no git — este arquivo é o **leitura** do que a tag
> contém, e a tag é a que se confere.

## [Unreleased]

### Adicionado

- Nada ainda — a próxima versão a ser fechada entra aqui.

### Corrigido

- Nada ainda — a próxima versão a ser fechada entra aqui.

### Quebras de compatibilidade

- Nada ainda — a próxima versão a ser fechada entra aqui.

## [1.31.0] — 2026-11-19

### Adicionado

- Agent [`e2e-specialist`](./.agents/agents/e2e-specialist.md): o dono do ciclo de cobertura e2e de fluxos de usuário. Antes de todo push que toque `apps/web/**`, ele audita se toda tela da aplicação tem spec e2e que a atravessa; quando falta, monta o plano (com o `state_snapshot`), revisa o plano com outro agent, implementa o spec, roda `pnpm ci:local`, revisa o spec e commita/pusha na branch. A regra que ele executa é a convenção [`e2e-playwright`](./.agents/specs/conventions/e2e-playwright.md) — todo fluxo de usuário com tela tem spec e2e que atravessa o backend. O gate [`check-e2e-flow-coverage`](./.tooling/scripts/ci/check-e2e-flow-coverage.ts) mede a metade **declarativa** (paridade entre inventário, specs e `page.tsx`); o agent fecha a **semântica** (o spec afirma o efeito? a recusa está coberta com dado plantado? a semente é pela API?).
- Workflow [`e2e-coverage-mode`](./.agents/workflows/e2e-coverage-mode.md): o mesmo ciclo em formato de dispatch canônico ([`protocolos/dispatch.md`](./.agents/skills/agents-coordinate/protocolos/dispatch.md)), com revisão do plano **e** revisão do spec implementado.
- Roteamento: a matriz [`specialist-routing`](./.agents/specs/conventions/specialist-routing.md) v1.8 ganha 2 path_globs (`apps/web/e2e/**` + `apps/web/app/**/page.tsx`) e 1 demand_keyword; a matriz [`review-routing`](./.agents/specs/conventions/review-routing.md) v1.10 dá aos specs de fluxo um dono próprio.
- 3ª regra do gate [`check-version-footers`](./.tooling/scripts/ci/check-version-footers.ts): o **conteúdo** de um dos seis footers de versão mudou desde a última tag e a versão **não** mudou. As duas regras anteriores medem o número (concordância entre os seis, e não-atrás-da-tag) — as duas passavam quando o conteúdo muda e o número fica, que é a classe do rodapé que nomeava dois conteúdos. A janela medida é a do último release: um bump no meio da janela cobre a janela.

### Corrigido

- O rodapé do `README.md` passava a descrever **dois conteúdos com o mesmo rótulo de versão**: as contagens do disco foram re-medidas (48 agents · 50 memórias · 18 workflows) sem o número da versão acompanhar. Agora o rótulo da versão e as contagens andam juntos — a versão do documento sobe para 1.31.0.
- O script [`tooling:bump-version`](./tooling/scripts/bump-version.ts) escrevia **quatro** dos seis footers de versão: o `AGENTS.md` e o `README.md` ficavam de fora, e o bump produzia exatamente a divergência que o gate acusa — o mesmo defeito do #126, que o gate media só quatro. A lista agora é a do gate (`FOOTERS_DE_VERSAO`), importada de lá: uma lista só.
- A convenção [`post-merge-release`](./.agents/specs/conventions/post-merge-release.md) e o handoff do workflow [`release-mode`](./.agents/workflows/release-mode.md) diziam "3/4 arquivos versionados" — o gate mede **seis** desde a v1.15.0. O conjunto e o procedimento foram alinhados.

### Quebras de compatibilidade

- Nenhuma em runtime: nenhum endpoint, script, migration, tabela ou contrato de API mudou.

## [1.30.0] — 2026-11-18

### Adicionado

- Convenção [`kit-documentacao`](./.agents/specs/conventions/kit-documentacao.md): o **kit completo de documentação moderna** passa a ser obrigação do repo — 5 pilares, 14 itens, e para cada item **um doc canônico, um specialist dono e um auditor**. As contagens: `grep -cE '^### §2\.[0-9] Pilar ' .agents/specs/conventions/kit-documentacao.md` → **5**, e `grep -cE '^\| [0-9]+ \| ' .agents/specs/conventions/kit-documentacao.md` → **14**.
- Gate [`check-doc-kit`](./.tooling/scripts/ci/check-doc-kit.ts): mede a cobertura do kit — doc canônico presente, âncoras mínimas contidas, índice citando o doc, e specialist e auditor existentes em `.agents/agents/`.
- **14 specialists** de documentação, um por item do kit (`grep -E '^\| [0-9]+ \|' .agents/specs/conventions/kit-documentacao.md | grep -oE '[a-z0-9-]+-specialist' | sort -u | wc -l` → **14**): `readme-specialist`, `contributing-specialist`, `glossary-specialist`, `hld-specialist`, `c4-specialist`, `prd-specialist`, `tdr-specialist`, `adr-specialist`, `openapi-doc-specialist`, `asyncapi-specialist`, `erd-specialist`, `runbook-specialist`, `postmortem-specialist` e `changelog-specialist`.
- **5 auditadores**, um por pilar, cada um com a sua skill de processo (`grep -E '^\| [0-9]+ \|' .agents/specs/conventions/kit-documentacao.md | grep -oE '[a-z0-9-]+-docs-auditor' | sort -u | wc -l` → **5**): `onboarding-docs-auditor`, `architecture-docs-auditor`, `decision-docs-auditor`, `contract-docs-auditor` e `operations-docs-auditor`.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): guia de convivência técnica — padrão de commits, fluxo de branches, code review, estilo de código, e onde a documentação do projeto vive.
- [`GLOSSARY.md`](./GLOSSARY.md): o vocabulário canônico do domínio — termo, definição e o caminho real onde ele aparece.
- [`CHANGELOG.md`](./CHANGELOG.md): este arquivo.
- [`docs/prd/0001-projeto-base.md`](./docs/prd/0001-projeto-base.md): o PRD do próprio template, com problema, objetivo de negócio, escopo e métricas de sucesso — indexado em [`docs/prd/README.md`](./docs/prd/README.md).
- [`docs/tdr/0001-system-design-canonico.md`](./docs/tdr/0001-system-design-canonico.md): o TDR que registra o raciocínio da mudança que introduziu o system design canônico — indexado em [`docs/tdr/README.md`](./docs/tdr/README.md).
- [`docs/post-mortems/README.md`](./docs/post-mortems/README.md): o formato do post-mortem blameless e a regra que proíbe nomear culpado.

### Corrigido

- [`docs/agents/domain.md`](./docs/agents/domain.md) afirmava que o `GLOSSARY.md` **não existia** e mandava "siga em silêncio" — com o glossário criado, esse texto virou uma mentira (doc que mente é defeito P0). Os parágrafos que falavam do glossário agora apontam para o arquivo.

### Quebras de compatibilidade

- Nenhuma em runtime: nenhum endpoint, script, migration, tabela ou contrato de API mudou.
- Uma mudança de comportamento, em [`docs/agents/domain.md`](./docs/agents/domain.md): a instrução "se `GLOSSARY.md` não existir, siga em silêncio" foi retirada, porque o arquivo passa a existir a partir desta versão.

## Histórico anterior a 1.31.0

O histórico **anterior** a esta versão não está neste arquivo — ele vive nas
**tags do git**, que são o registro datado do que foi feito em cada versão.

```bash
# o que entrou entre duas tags
git log --oneline v1.28.0..v1.29.0

# a lista de tags, da mais nova para a mais velha
git tag --list 'v*' --sort=-v:refname
```

A regra do repo é que **o fato tem UM dono**
([`dry.md`](./.agents/specs/conventions/dry.md)): o histórico é do git, e este
arquivo é a leitura por versão. Quem precisar do que aconteceu numa versão
antiga consulta a tag — e não um CHANGELOG reescrito à mão.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
