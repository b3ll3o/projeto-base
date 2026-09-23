# Convenção: Estrutura de Diretórios e Versionamento

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## Estrutura de Diretórios

```text
projeto-base/
├── AGENTS.md                           # Spec canônica (≤ 300 linhas)
├── README.md                           # Visão geral do template
├── .markdownlint.json                  # Configuração do lint de Markdown
├── .agents/
│   ├── agents/                         # Definições de agents (cada um ≤ 300 linhas)
│   │   ├── <agent-name>.md             # 10 agents genéricos + 3 specialists de stack
│   ├── memory/                         # Memória acumulada por agent (evolução)
│   │   └── <agent-name>.md
│   ├── skills/
│   │   └── <skill-name>/
│   │       ├── SKILL.md                # Ponto de entrada da skill (≤ 300 linhas)
│   │       ├── MEMORY.md               # Memória da skill (opcional, recomendado)
│   │       ├── protocolos/             # Sub-protocolos (opcional)
│   │       └── exemplos/               # Exemplos de uso (opcional)
│   ├── workflows/                      # Workflows detalhados (opcional)
│   │   └── <workflow-id>.md            # 1 arquivo por workflow > 30 linhas
│   ├── specs/
│   │   └── conventions/                # Sub-specs referenciadas por AGENTS.md §6
│   │       ├── README.md               # Índice
│   │       ├── idioma.md
│   │       ├── tamanho-e-revisao.md
│   │       ├── tdd.md
│   │       ├── evolucao-agents.md
│   │       ├── git-workflow.md
│   │       └── estrutura-e-versionamento.md
│   └── WORKFLOWS.md                    # Índice de workflows pré-configurados
└── docs/
    ├── TEMPLATE_USAGE.md               # Guia principal (≤ 300 linhas)
    ├── MONOREPO.md                     # Convenções de monorepo
    ├── STACK.md                        # Stack escolhida e justificativas
    └── integrations/                   # Integração por ferramenta (uma por arquivo)
        ├── claude-code.md
        ├── cursor.md
        ├── windsurf.md
        ├── aider.md
        ├── continue.md
        ├── copilot.md
        ├── cline.md
        └── cody.md
```

> **Atenção:** Esta estrutura é referencial. Conforme regra de Tamanho Máximo, qualquer arquivo que ultrapasse 300 linhas DEVE ser dividido em arquivos irmãos com índice/links cruzados.

## Versionamento

- Mudanças em `.agents/` seguem versionamento semântico próprio
- Tags: `v1.0.0`, `v1.1.0`, `v2.0.0` (estável)
- Breaking changes no padrão de coordenação exigem major bump
- Adição de novo agent é minor bump
- Adição de nova skill é minor bump
- Mudanças em memory files são patch (não geram tag sozinhas)
- Toda tag DEVE passar pelo checklist de revisão (ver [`tamanho-e-revisao.md`](./tamanho-e-revisao.md))

**Fluxo automatizado:** o bump de versão no template (major/minor/patch) é orquestrado pelo workflow [`release-mode`](../../workflows/release-mode.md) e finalizado pelo workflow `.github/workflows/release-template.yml`. Após merge do PR `chore/bump-A.B.C`, a tag `vA.B.C` é criada automaticamente (idempotente via `git rev-parse --verify`). **Não rodar `git tag` manual** — isso gera divergência entre tag e Histórico de Versões.

## Arquitetura por Módulo (DDD/Hexagonal)

> **Regra canônica** (a partir de `v1.2.0`): apps backend (`apps/api` e futuros) adotam
> **DDD + Hexagonal (Ports & Adapters)** como paradigma arquitetural obrigatório,
> justificado pelo [ADR-0001 — DDD + Hexagonal + Auditoria](../../../docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md).

### Estrutura obrigatória por módulo

```text
apps/<backend-app>/src/modules/<feature>/
├── domain/          # TypeScript puro — entidades, VOs, eventos de domínio
├── application/     # Use cases + ports (interfaces) — depende só de domain
└── infrastructure/  # http/, persistence/, adapters — implementa ports
```

### Constraint de dependência entre camadas

```text
domain         ─→ (nada além de typescript padrão)
  ↑
application    ─→ domain + ports próprias
  ↑
infrastructure ─→ application + domain + libs externas (NestJS, Prisma)
```

- ❌ `domain/` **nunca** importa `@nestjs/*`, `@prisma/*`, `class-validator`, `reflect-metadata`, `rxjs`.
- ❌ `application/` **nunca** importa de `infrastructure/`.
- ✅ O fluxo inverso (camadas externas → internas) é livre.
- ✅ `infrastructure/http/` implementa os ports definidos em `application/ports/`.

### Guardiões mecânicos

- **Agent `stack-code-reviewer`** (D11 — pre-commit + CI): aplica lens DDD/Hexagonal.
- **Skill [`ddd-hexagonal-validation`](../../skills/ddd-hexagonal-validation/SKILL.md)**: checklist automatizado para auditoria de módulo.

Referência cruzada: [`docs/MONOREPO.md` §11](../../../docs/MONOREPO.md) e [`docs/STACK.md` §8](../../../docs/STACK.md).

## Histórico de Versões

| Versão | Mudanças |
|--------|----------|
| `1.0.0` | Lançamento inicial — 10 agents genéricos + skill `agents:coordinate` |
| `1.1.0` | Adicionados 3 specialists de stack (monorepo, nestjs, nextjs) + workflows detalhados + docs STACK.md e MONOREPO.md |
| `1.2.0` | Regra canônica DDD/Hexagonal por módulo (referência ao ADR-0001) |
| `1.3.0` | Skill `ddd-hexagonal-validation` (auditoria automatizada de boundaries) + ADR-0001 (DDD + Hexagonal + Auditoria via 3 tabelas) — BC `users` como template canônico validado end-to-end (HTTP + E2E + 250 testes) |
| `1.4.0` | Skill `ci-defense-in-depth` + convenção `ci-defense-in-depth.md` + workflow `release-mode` + memory files (`stack-code-reviewer`, `doc-sync`); updates cirúrgicos em 6 agents e 3 conventions (cross-refs defense-in-depth + release automation). Pendente: bump dos footers de `docs/MONOREPO.md` e `docs/STACK.md` via `release-mode` workflow. |
| `1.5.0` | Agent `review-router` (orquestra 2-stage review via `path_globs`+`commit_types`+`diff_patterns`) + bump matriz v1.1 (Seção 6 Gaps forthcoming v1.2) + 2 novas regras em `tamanho-e-revisao.md` (Verificabilidade de Claims Numéricos, Polish Inline Trivial) + passo router inserido em 5 workflows (`backend-feature`/`frontend-feature`/`ci-defense-mode`/`release-mode`/`retrospective-mode`) + memory `.agents/memory/review-router.md` atualizada — pilot 5-task P95=911ms |
| `1.5.1` | Matrix `review-router` bumped para v1.2 — resolve 2 gaps P1 (Seção 6): (1) propagação de `blocking: true` em `path_globs` (`e4c0971`+`22a056b`); (2) regex security narrow para call-site anchored — `bcrypt.{hash,compare,hashSync,compareSync}`+`argon2.{hash,hashSync,verify}`+`jwt.{sign,verify,decode}` (`f496b05`). Pilot Task 1: broad regex = 10 FPs no 50KB classifier window; narrow = 1 match (legítimo). 3 testes TDD em `review-router.spec.ts` (25/25 verde). Sem breaking change. |
| `1.6.0` | Matrix `review-router` bumped para v1.3 — resolve 3 gaps P2 (Seção 6): (1) enrich `domains[]` em `PathGlobRule`+`PathMatch`+`classify()` Set (`8e711a2`); (2) lint WARNING (não error) para `path_globs` com `blocking: true` em arquivos ilegíveis — helpers `globToRegexLocal`+`getRepoRoot` memoizado+`getTrackedFiles` cached (`38576e7`); (3) coverage scenarios multi-commit/multi-path — split em apêndice `.agents/specs/conventions/review-routing-examples.md` (104 linhas) com Cenário D (feat multi-commit breaking) + Cenário E (chore multi-path blocking:true) (`2e4b150`). 9 testes TDD (5+4). Sem breaking change. Padrões aplicados: split-by-responsibility (limite 300), cache memoization, DRY verification 2-way. |
