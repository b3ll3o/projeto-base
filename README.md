# projeto-base

> **Template genérico** para projetos que usam agents de IA interoperáveis.
> Vendor-neutral — funciona com Claude Code, Cursor, Windsurf, Aider, Continue, Cline e outras ferramentas.

---

## O que é

Um **scaffold reutilizável** que implementa o **padrão genérico de agents de IA** onde todos os agents podem interoperar entre si via coordenação explícita. Use como ponto de partida para qualquer projeto que queira organizar trabalho multi-agent de forma consistente.

## Estrutura

```text
projeto-base/
├── AGENTS.md                           # Spec canônica do padrão (LEIA PRIMEIRO, ≤ 300 linhas)
├── README.md                           # Este arquivo
├── .markdownlint.json                  # Configuração do lint de Markdown
├── .agents/
│   ├── agents/                         # 10 agents genéricos (cada um ≤ 300 linhas)
│   ├── memory/                         # Memória acumulada por agent
│   ├── skills/
│   │   └── agents-coordinate/          # Skill de coordenação multi-agent
│   │       ├── SKILL.md                # Ponto de entrada (≤ 300 linhas)
│   │       ├── protocolos/             # dispatch, composição, outputs
│   │       └── exemplos/               # feature-mode completo
│   ├── specs/
│   │   └── conventions/                # Sub-specs referenciadas por AGENTS.md §6
│   │       ├── README.md               # Índice das convenções
│   │       ├── idioma.md               # pt-BR
│   │       ├── tamanho-e-revisao.md    # ≤ 300 linhas + checklist
│   │       ├── tdd.md                  # Red→Green→Refactor
│   │       ├── evolucao-agents.md      # Agents/skills evoluem
│   │       └── estrutura-e-versionamento.md
│   └── WORKFLOWS.md                    # Fluxos pré-configurados
└── docs/
    ├── TEMPLATE_USAGE.md               # Guia principal (≤ 300 linhas)
    └── integrations/                   # Integração por ferramenta
        ├── claude-code.md
        ├── cursor.md
        ├── windsurf.md
        ├── aider.md
        ├── continue.md
        ├── copilot.md
        ├── cline.md
        └── cody.md
```

## Como usar

### Opção 1: Copiar para novo projeto

```bash
cp -r projeto-base/ meu-novo-projeto/
cd meu-novo-projeto/
# Customize à vontade — o padrão de interoperabilidade permanece
```

### Opção 2: Usar como submodule

```bash
git submodule add https://github.com/seu-org/projeto-base.git .agents-base
# Sincronize updates do padrão sem perder customizações locais
```

### Opção 3: Fork + personalizar

Faça fork deste repositório e customize para sua organização. Mantenha a `§1` do `AGENTS.md` intacta para preservar a interoperabilidade.

## Regra Mandatória

> **SEMPRE use o padrão genérico de agents de IA onde TODOS os agents podem interoperar entre si** via a skill `agents:coordinate`.

Detalhes completos em [`AGENTS.md`](./AGENTS.md) (seção §1).

## Agents Inclusos

| Agent            | Uso                                              |
| ---------------- | ------------------------------------------------ |
| `agent-architect`| Cria/evolui agents (meta-agent)                  |
| `orchestrator`   | Despacha tarefas multi-step                      |
| `explorer`       | Mapeia código (read-only)                        |
| `code-reviewer`  | Revisão de código                                |
| `security-auditor` | Auditoria OWASP                                |
| `refactorer`     | Refatoração incremental                          |
| `test-writer`    | Criação de testes (TDD)                          |
| `tdd-enforcer`   | Valida ciclo Red→Green→Refactor (bloqueia merge) |
| `doc-writer`     | Documentação                                     |
| `task-manager`   | Gestão de tarefas                                |

Cada agent possui arquivo de **memória** em `.agents/memory/<nome>.md` que armazena decisões, padrões e sugestões de evolução — garantindo que os agents evoluam junto com a aplicação.

## Workflows Pré-Configurados

- `feature-mode` — implementar nova feature
- `bugfix-mode` — corrigir bug
- `refactor-mode` — refatorar
- `security-mode` — auditoria de segurança
- `docs-mode` — documentar
- `task-mode` — gerenciar tarefas
- `explore-mode` — explorar código
- `review-mode` — revisar PR/diff

Detalhes em [`.agents/WORKFLOWS.md`](./.agents/WORKFLOWS.md).

## Compatibilidade por Ferramenta

| Ferramenta         | Suporte     | Como integrar                                    |
| ------------------ | ----------- | ------------------------------------------------ |
| Claude Code        | ✅ Nativo   | `AGENTS.md` carregado automaticamente            |
| Cursor             | ✅          | `AGENTS.md` + `.cursorrules` opcional            |
| Windsurf           | ✅          | `AGENTS.md` + `.windsurf/memories/`              |
| Aider              | ✅          | `--read AGENTS.md`                               |
| Continue           | ✅          | Custom slash commands                            |
| GitHub Copilot     | ✅          | `AGENTS.md` + `.github/copilot-instructions.md`  |
| Cline / Roo Code   | ✅          | `.clinerules`                                    |
| Cody               | ✅          | `.vscode/cody.json` recipes                      |

Detalhes completos em [`docs/TEMPLATE_USAGE.md`](./docs/TEMPLATE_USAGE.md).

## Versão

**1.0.0** — Lançamento inicial estável.

## Licença

MIT
