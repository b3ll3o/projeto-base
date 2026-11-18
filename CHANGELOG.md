# CHANGELOG

> Registro de versão do template, em **pt-BR**, no formato
> [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
>
> A versão corrente do template é **1.30.0**. O **fato** de cada versão é a
> tag correspondente no git — este arquivo é o **leitura** do que a tag
> contém, e a tag é a que se confere.

## [Unreleased]

### Adicionado

- Nada ainda — a próxima versão a ser fechada entra aqui.

### Corrigido

- Nada ainda — a próxima versão a ser fechada entra aqui.

### Quebras de compatibilidade

- Nada ainda — a próxima versão a ser fechada entra aqui.

## [1.30.0] — 2026-11-18

### Adicionado

- Convenção [`kit-documentacao`](./.agents/specs/conventions/kit-documentacao.md): o **kit completo de documentação moderna** passa a ser obrigação do repo — 5 pilares, 14 itens, e para cada item **um doc canônico, um specialist dono e um auditor**.
- Gate [`check-doc-kit`](./.tooling/scripts/ci/check-doc-kit.ts): mede a cobertura do kit — doc canônico presente, âncoras mínimas contidas, índice citando o doc, e specialist e auditor existentes em `.agents/agents/`.
- **14 specialists** de documentação, um por item do kit: `readme-specialist`, `contributing-specialist`, `glossary-specialist`, `hld-specialist`, `c4-specialist`, `prd-specialist`, `tdr-specialist`, `adr-specialist`, `openapi-doc-specialist`, `asyncapi-specialist`, `erd-specialist`, `runbook-specialist`, `postmortem-specialist` e `changelog-specialist`.
- **5 auditadores**, um por pilar, cada um com a sua skill de processo: `onboarding-docs-auditor`, `architecture-docs-auditor`, `decision-docs-auditor`, `contract-docs-auditor` e `operations-docs-auditor`.
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

## Histórico anterior a 1.30.0

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
