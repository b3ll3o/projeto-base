# System Design — projeto-base

> **O que este conjunto é:** a arquitetura do `projeto-base` desenhada em
> camadas, do ator ao banco, com um **contrato de extensão** — a parte que
> faz um aplicativo derivado *estender* este padrão em vez de só copiá-lo.
>
> **Medido em 2026-11-09:** a topologia confere com `docker-compose.yml`
> (`docker compose config --services` → 7 serviços) e com `apps/api/src/`.
>
> **Para quem é:**
> 1. **Quem vai derivar um app** a partir deste template — leia na ordem
>    [`contexto.md`](./contexto.md) → [`modulo.md`](./modulo.md) →
>    [`extensao.md`](./extensao.md) e copie o
>    [template](../../.agents/specs/templates/system-design.md).
> 2. **Quem vai mexer no sistema** — vá direto ao tema
>    ([dados](./dados.md), [segurança](./seguranca.md),
>    [operação](./operacao.md)) e siga o **Ver Também** de cada doc.
> 3. **Quem vai revisar** — o **índice de ADRs** é
>    [`docs/agents/domain.md`](../agents/domain.md): ele diz qual ADR
>    responde a qual pergunta. A decisão **não** é sua para tomar de novo.
>
> **A regra que governa o conjunto:** o **ADR** é o dono da decisão; este
> conjunto é o dono do **desenho** (topologia, fronteira, caminho do
> request, contrato de extensão). Onde os dois falam do mesmo fato, **o
> conjunto aponta** — não repete. Ver
> [ADR-0010](../adr/0010-system-design-canonico.md).

---

## §1. Ordem de leitura

```text
README (índice + linguagem visual)
  │
  ├─ contexto.md   ── C4 L1 (o sistema) + L2 (os contêineres) + fronteira
  │                   de confiança + as redes + topologia de implantação
  ├─ modulo.md     ── C4 L3 (um bounded context por dentro) + a cadeia de
  │                   um request + a regra de dependência
  ├─ dados.md      ── onde o dado mora, quem escreve, escopo, consistência,
  │                   concorrência, auditoria, idempotência, migração
  ├─ seguranca.md  ── fronteiras, ameaças × defesas, credenciais, identidade
  ├─ operacao.md   ── telemetria, correlação, SLO, proteção, escala,
  │                   degradação, ambientes
  └─ extensao.md   ── ONDE EU PLUGO (o contrato de extensão)
```

**7 arquivos**: este índice + 6 documentos focais. O nível C4 **"código" não
é um documento**: ele é o repositório, e o dono dele é a convenção
[`estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md).
Escrever um quarto nível duplicaria o que a convenção já mede.

---

## §2. A linguagem visual

> Um diagrama de arquitetura é lido por **convenção**, não por leitura. Este
> conjunto fixa a convenção, e **todo** diagrama nasce com ela.

### §2.1 Forma = tipo

**Uma forma por papel.** Duas cores para a mesma forma não carregam
significado — o formato carrega.

| Papel | Forma Mermaid | Classe | Cor | O que é |
|---|---|---|---|---|
| **Ator** | `([ … ])` — cápsula | `ator` | violeta | pessoa ou sistema que age de fora |
| **Contêiner** | `[ … ]` — retângulo | `app` | azul | processo que executa código |
| **Dado** | `[( … )]` — cilindro | `dado` | verde | estado que persiste |
| **Observabilidade** | `{{ … }}` — hexágono | `obs` | âmbar | quem coleta, guarda ou mostra |
| **Guarda** | `{ … }` — losango | `seg` | vermelho | quem decide se passa |
| **Externo** | `[/ … /]` — paralelogramo | `ext` | cinza | terceiro, fora do sistema |

### §2.2 A paleta (canônica)

```text
classDef ator fill:#ede9fe,stroke:#6d28d9,color:#2e1065,stroke-width:1px
classDef app  fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a,stroke-width:1px
classDef dado fill:#dcfce7,stroke:#15803d,color:#14532d,stroke-width:1px
classDef obs  fill:#fef3c7,stroke:#b45309,color:#78350f,stroke-width:1px
classDef seg  fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d,stroke-width:1px
classDef ext  fill:#f1f5f9,stroke:#64748b,color:#0f172a,stroke-width:1px,stroke-dasharray: 5 4
```

### §2.3 O bloco `%%{init}%%` (canônico)

Todo diagrama deste conjunto começa com este bloco — ele fixa o tema e as
variáveis, para o render **não depender do tema do GitHub** (que muda de
claro para escuro conforme a preferência do leitor):

````text
%%{init: {"theme":"base","themeVariables":{"fontFamily":"ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif","primaryColor":"#dbeafe","primaryTextColor":"#1e3a8a","primaryBorderColor":"#1d4ed8","secondaryColor":"#dcfce7","tertiaryColor":"#fef3c7","lineColor":"#64748b","textColor":"#0f172a","mainBkg":"#f8fafc","background":"#ffffff","clusterBkg":"#f8fafc","clusterBorder":"#cbd5e1","edgeLabelBackground":"#ffffff","fontSize":"14px","actorBkg":"#dbeafe","actorBorder":"#1d4ed8","actorTextColor":"#1e3a8a","signalColor":"#334155","signalTextColor":"#334155","labelBoxBkgColor":"#dbeafe","labelBoxBorderColor":"#1d4ed8","labelTextColor":"#1e3a8a","noteBkgColor":"#fef3c7","noteBorderColor":"#b45309","noteTextColor":"#78350f","activationBkgColor":"#ede9fe","activationBorderColor":"#6d28d9"},"flowchart":{"curve":"basis","nodeSpacing":45,"rankSpacing":55,"padding":12,"htmlLabels":true,"useMaxWidth":true},"sequence":{"useMaxWidth":true,"wrap":true,"diagramMarginX":20,"diagramMarginY":10},"er":{"layoutDirection":"LR","entityPadding":12,"minEntityWidth":140}}}%%
````

> **Exceção declarada ao DRY:** o bloco é **duplicado** em cada arquivo, e as
> `classDef` também. O Mermaid lê a diretiva **por documento** — não existe
> include, nem herança entre arquivos. A alternativa (sem `init`) deixa o
> diagrama no tema do GitHub. A duplicação é o preço da consistência visual,
> e ela é **declarada** aqui em vez de escondida. Para o diagrama de
> entidades (`erDiagram`), o `primaryColor` do `init` é trocado por
> `#dcfce7` — ver [`dados.md`](./dados.md).

### §2.4 As três regras de leitura

1. **Sólido = dentro do sistema.** Borda tracejada = fora.
2. **Seta cheia = chamada síncrona; tracejada = outra coisa** (telemetria,
   chamada a terceiro, fluxo assíncrono).
3. **O rótulo da seta é o protocolo ou o dado**, nunca "chama".

---

## §3. Os 8 princípios

Cada princípio tem **um** dono. Um princípio sem dono é um conselho, e
conselho não sobrevive ao primeiro prazo.

| # | Princípio | O que significa | Dono |
|---|---|---|---|
| **P1** | **A dependência aponta para dentro** | `domain` não conhece `application`; `application` não conhece `infrastructure`. O fluxo inverso é livre | [ADR-0001](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md) · [convenção `estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md) |
| **P2** | **A fronteira é a credencial, não o dado** | Quem atravessa o bucket de sistema é a **credencial** (`app_system`), não um valor que a sessão escreve | [ADR-0004](../adr/0004-tenancy-multi-empresa.md) |
| **P3** | **Fail-closed por omissão** | Rota nova que esquece o escopo lê **zero linhas** — não a empresa vizinha | [ADR-0004](../adr/0004-tenancy-multi-empresa.md) |
| **P4** | **Decisão não óbvia vira ADR** | O ADR é o dono; o doc de system design **aponta**. Consequência negative explicitada: quem escreve um doc que repete o ADR está errado | [ADR-0010](../adr/0010-system-design-canonico.md) |
| **P5** | **Fato e recomendação têm rótulos diferentes** | `[derivado]` marca o que **não** é fato deste repo. Um SLO inventado como fato é a pior mentira possível | [ADR-0010](../adr/0010-system-design-canonico.md) |
| **P6** | **A forma carrega o significado** | A linguagem visual deste §2 é a única; um diagrama novo nasce com ela | este README |
| **P7** | **Nenhum número sem o comando que o produz** | O `→ \`N\`` com o comando é o formato; a regra é da convenção `tamanho-e-revisao.md` | [convenção `documentacao.md`](../../.agents/specs/conventions/documentacao.md) |
| **P8** | **O que não existe é parte do design** | A ausência de fila, de cache distribuído e de idempotência é **escrita**, com o custo que teria | [`dados.md`](./dados.md) §Lacunas |

---

## §4. Como um aplicativo derivado estende isto

Em uma frase: **copia o template, preenche os marcadores, e pluga a peça
nova no ponto que o contrato de extensão nomeia.**

```bash
# 1. Copiar o template do system design para o app derivado
cp .agents/specs/templates/system-design.md docs/system-design.md

# 2. Ler o contrato de extensão antes de escrever código
less docs/system-design/extensao.md
```

O **catálogo do que existe** e o **catálogo do que é novo** vivem lado a
lado em [`extensao.md`](./extensao.md) §2 — e o checklist de conformidade
(§4 do mesmo doc) é o que o derivado roda antes de abrir o PR.

**O que o derivado NÃO faz:** copiar as decisões. As decisões são do
`projeto-base`; o derivado **estende** o desenho, e quando um ADR novo for
necessário, ele nasce no diretório de ADR do derivado — não aqui.

---

## §5. Manutenção

| Pergunta | Resposta |
|---|---|
| **Quem é o dono da versão deste conjunto?** | Este README. Os demais documentos **apontam** para cá — a versão do conjunto mora num lugar só |
| **Quem mantém o conteúdo?** | [`documentation-specialist`](../../.agents/agents/documentation-specialist.md), com a matriz de cobertura em [`documentacao.md`](../../.agents/specs/conventions/documentacao.md) §2 |
| **Como o conjunto se mantém verdadeiro?** | **Parcialmente.** O `doc-sync` tem um mapa **editável** (`tooling/scripts/doc-sync.ts`): `apps/api/prisma/schema.prisma` → **`docs/system-design/dados.md`**, para o modelo de dados não envelhecer. O resto do conjunto **não** tem instrumento automático — a lacuna está registrada como **Em aberto** no [ADR-0010](../adr/0010-system-design-canonico.md). Até ela ser fechada, a verificação é a **revisão** |
| **Qual gate mede o tamanho?** | `check-doc-size` — teto de **300 linhas** por documento |
| **Qual gate mede os links?** | `check-doc-refs` — link relativo quebrado reprova |
| **Este conjunto entra na matriz de cobertura do `check-doc-coverage`?** | **Não** — e isso é declarado, não esquecido: o gate mede *unidade de código → doc canônico* (BC, rota, package), e o conjunto **não é** unidade de código. O dono do desenho está declarado na tabela de donos de [`documentacao.md` §2](../../.agents/specs/conventions/documentacao.md) |

---

## Ver Também

- [`../STACK.md`](../STACK.md) — o dono das versões e da justificativa de
  cada tecnologia.
- [`../MONOREPO.md`](../MONOREPO.md) — o dono das convenções de monorepo.
- [`../agents/domain.md`](../agents/domain.md) — o **índice de ADRs** (o
  dono da lista de decisões).
- [`../superpowers/plans/2026-11-09-system-design-padrao.md`](../superpowers/plans/2026-11-09-system-design-padrao.md)
  — o plano que produziu este conjunto.
- [`../adr/0010-system-design-canonico.md`](../adr/0010-system-design-canonico.md)
  — a decisão.

---

**Mantido por:** projeto-base contributors
**Versão do conjunto:** 1.0.0
