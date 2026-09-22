# AGENTS.md — Padrão Genérico de Agents de IA

> **Spec canônica** para configuração de agents de IA em qualquer projeto.
> Vendor-neutral: funciona com Claude Code, Cursor, Windsurf, Aider, Continue, Cline, GitHub Copilot Workspace e qualquer ferramenta que carregue arquivos Markdown como contexto de agent.

---

## §1. REGRA MANDATÓRIA — Padrão Genérico de Agents de IA

> ### ⛔ Esta regra é OBRIGATÓRIA e não pode ser desativada

**SEMPRE use o padrão genérico de agents de IA onde TODOS os agents podem interoperar entre si.**

Esta regra vale para:

- Todo agent definido em `.agents/agents/*.md`
- Toda skill definida em `.agents/skills/`
- Todo workflow documentado em `.agents/WORKFLOWS.md`
- Qualquer execução (manual, automatizada, CI/CD, hook, etc.)

**Princípios irrenunciáveis:**

1. **Nenhum agent é silo isolado.** Todo agent tem o direito e o dever de despachar trabalho para outros agents quando a tarefa exigir.
2. **Coordenação obrigatória.** Sempre que uma tarefa envolver mais de uma especialidade, use a skill `agents:coordinate` para estruturar o despacho.
3. **Handoff estruturado.** Toda transferência de trabalho entre agents DEVE seguir o formato definido em `.agents/skills/agents-coordinate/SKILL.md` (task, context, expected_output, success_criteria).
4. **Composição explícita.** Agents podem ser encadeados (sequential), paralelizados (parallel) ou organizados hierarquicamente (orchestrator → specialists) — mas o modo de composição DEVE ser documentado no despacho.
5. **Modelo-agnóstico.** Agents são definidos em Markdown puro. Não há acoplamento com vendor. Toda instrução específica de ferramenta (Claude Code, Cursor, etc.) vive em `docs/TEMPLATE_USAGE.md`, nunca no corpo do agent.

**Quando NÃO aplicar esta regra:**

- Tarefa trivial resolvida por um único agent sem dependências externas
- Interação puramente conversacional (sem execução)
- Exploração read-only de um único arquivo ou trecho

Em todos os outros casos, **coordene via `agents:coordinate`**.

---

## §2. Como Usar Este Template

Este repositório é um **template reutilizável**. Para começar um novo projeto:

```bash
# 1. Copie o template
cp -r projeto-base/ meu-novo-projeto/
cd meu-novo-projeto/

# 2. Customize o que precisar
# - Edite AGENTS.md para adicionar regras específicas do projeto
# - Adicione novos agents em .agents/agents/
# - Ajuste workflows em .agents/WORKFLOWS.md

# 3. O padrão genérico permanece intacto:
#    todos os agents continuam interoperando via agents:coordinate
```

Veja `docs/TEMPLATE_USAGE.md` para detalhes de integração com cada ferramenta (Claude Code, Cursor, Windsurf, etc.).

---

## §3. Catálogo de Agents Genéricos

| Agent              | Arquivo                                                                  | Memória                                            | Papel                                | Quando invocar                                       |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| **agent-architect**| [`.agents/agents/agent-architect.md`](./.agents/agents/agent-architect.md)| [memory](../.agents/memory/agent-architect.md)     | Cria/evolui agents, pesquisa refs    | Novo domínio, lacuna detectada, revisão periódica    |
| **orchestrator**   | [`.agents/agents/orchestrator.md`](./.agents/agents/orchestrator.md)      | [memory](../.agents/memory/orchestrator.md)        | Despacha tarefas para specialists    | Tarefas multi-step que exigem múltiplas especialidades |
| **explorer**       | [`.agents/agents/explorer.md`](./.agents/agents/explorer.md)              | [memory](../.agents/memory/explorer.md)            | Mapeia código, busca padrões         | "Onde fica X?", "Como funciona Y?"                   |
| **code-reviewer**  | [`.agents/agents/code-reviewer.md`](./.agents/agents/code-reviewer.md)    | [memory](../.agents/memory/code-reviewer.md)       | Revisa código (bugs, smells, qualidade)| Antes de merge, em PR, após feature completa         |
| **stack-code-reviewer**| [`.agents/agents/stack-code-reviewer.md`](./.agents/agents/stack-code-reviewer.md)| [memory](../.agents/memory/stack-code-reviewer.md)| Revisa código com lens de stack (NestJS, NextJS, Prisma, DDD/Hexagonal) | **Toda alteração de código** (pre-commit + CI automático) |
| **security-auditor**| [`.agents/agents/security-auditor.md`](./.agents/agents/security-auditor.md)| [memory](../.agents/memory/security-auditor.md)| Auditoria OWASP Top 10 + supply chain | Alterações em auth, secrets, payments, deps          |
| **doc-sync**        | [`.agents/agents/doc-sync.md`](./.agents/agents/doc-sync.md)              | [memory](../.agents/memory/doc-sync.md)            | Sincroniza docs após alteração de código (reativo) | **Toda alteração de código** (pre-commit + CI automático) |
| **refactorer**     | [`.agents/agents/refactorer.md`](./.agents/agents/refactorer.md)          | [memory](../.agents/memory/refactorer.md)          | Refatoração incremental TDD-driven   | "Refatorar X", code smells, débito técnico           |
| **test-writer**    | [`.agents/agents/test-writer.md`](./.agents/agents/test-writer.md)        | [memory](../.agents/memory/test-writer.md)         | Criação de testes (TDD/BDD/ATDD)     | Cobertura < 80%, nova feature, bug fix               |
| **tdd-enforcer**   | [`.agents/agents/tdd-enforcer.md`](./.agents/agents/tdd-enforcer.md)      | [memory](../.agents/memory/tdd-enforcer.md)        | Valida ciclo Red→Green→Refactor      | Antes de merge, em PR, em git hooks                  |
| **doc-writer**     | [`.agents/agents/doc-writer.md`](./.agents/agents/doc-writer.md)          | [memory](../.agents/memory/doc-writer.md)          | Geração de documentação              | README, ADRs, API docs, user guides                  |
| **task-manager**   | [`.agents/agents/task-manager.md`](./.agents/agents/task-manager.md)      | [memory](../.agents/memory/task-manager.md)        | Gestão de tarefas e backlog          | "Todo", "tarefa", priorização                        |

### §3.1 Specialists de Stack (incluso a partir de v1.1.0)

| Agent                  | Arquivo                                                                          | Memória                                                  | Papel                                       | Quando invocar                                              |
| ---------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| **monorepo-specialist**| [`.agents/agents/monorepo-specialist.md`](./.agents/agents/monorepo-specialist.md)| [memory](../.agents/memory/monorepo-specialist.md)        | Arquiteto de monorepo (workspaces, pipelines) | Adicionar/remover/mover apps ou packages, configurar turbo  |
| **nestjs-specialist**  | [`.agents/agents/nestjs-specialist.md`](./.agents/agents/nestjs-specialist.md)    | [memory](../.agents/memory/nestjs-specialist.md)          | Arquiteto backend NestJS                    | Criar/refatorar módulo NestJS, DI, validação, Swagger       |
| **nextjs-specialist**  | [`.agents/agents/nextjs-specialist.md`](./.agents/agents/nextjs-specialist.md)    | [memory](../.agents/memory/nextjs-specialist.md)          | Arquiteto frontend Next.js                  | Criar rota/página, decidir RSC vs. Client, Server Actions    |

> **Lens DDD/Hexagonal (a partir de v1.2.0, com adoção do ADR-0001):** ao criar/refatorar módulo NestJS,
> `nestjs-specialist` aplica a lens DDD/Hexagonal — validar boundary `domain/application/infrastructure`
> e audit fields obrigatórios. A mesma lens é parte da atuação do `stack-code-reviewer` (D11) em pre-commit
> (Husky) e em CI. Ver [`.agents/specs/conventions/estrutura-e-versionamento.md`](./.agents/specs/conventions/estrutura-e-versionamento.md).

---

## §4. Mecanismo de Coordenação

Toda coordenação multi-agent passa pela skill **`agents:coordinate`**.

**Definição:** [`.agents/skills/agents-coordinate/SKILL.md`](./.agents/skills/agents-coordinate/SKILL.md)

**Resumo do protocolo:**

```text
Agent A recebe tarefa
       │
       ▼
A identifica que precisa de B
       │
       ▼
A invoca B via:
  • Agent tool (subagent dispatch) — Claude Code, Aider
  • Skill tool (se B é uma skill) — múltiplos vendors
  • Handoff estruturado — TaskCreate/MCP
       │
       ▼
B executa e devolve resultado no formato:
  { task, context, expected_output, success_criteria }
       │
       ▼
A consolida ou encadeia próximo agent
```

**Modos de composição suportados:**

- **Sequential**: `A → B → C` (cada um depende do anterior)
- **Parallel**: `A, B, C → merge` (independentes, juntar resultados)
- **Hierarchical**: `orchestrator → specialists` (despacho centralizado)

---

## §5. Workflows Padrão

Workflows genéricos prontos para uso estão em [`.agents/WORKFLOWS.md`](./.agents/WORKFLOWS.md). Workflows detalhados por stack estão em [`.agents/workflows/`](./.agents/workflows/).

| Workflow             | Trigger                | Agents encadeados                                       |
|----------------------|------------------------|---------------------------------------------------------|
| `feature-mode`       | "implementar X"        | orchestrator → explorer → test-writer → code-reviewer   |
| `bugfix-mode`        | "corrigir bug"         | orchestrator → explorer → test-writer → code-reviewer   |
| `refactor-mode`      | "refatorar"            | refactorer → test-writer → code-reviewer                 |
| `security-mode`      | "auditoria segurança"  | security-auditor → code-reviewer                         |
| `docs-mode`          | "documentar"           | doc-writer → code-reviewer                               |
| `task-mode`          | "todo / tarefa"        | task-manager                                            |
| `backend-feature`    | "endpoint NestJS"      | nestjs-specialist → test-writer → code-reviewer          |
| `frontend-feature`   | "página/rota Next.js"  | nextjs-specialist → test-writer → code-reviewer          |
| `monorepo-change`    | "adicionar app/package"| monorepo-specialist → code-reviewer                      |
| `release-mode`       | "preparar release / bumpar versão" | doc-writer → code-reviewer → task-manager    |
| `ci-defense-mode`    | "blindar CI / auditar pipeline" | monorepo-specialist → ci-defense-in-depth → code-reviewer |
| `retrospective-mode` | "capturar aprendizados / post-mortem" | explorer → retrospective-capture → doc-writer (+ task-manager em paralelo) |

---

## §6. Convenções do Template

As convenções estão detalhadas em arquivos próprios sob [`.agents/specs/conventions/`](./.agents/specs/conventions/README.md) para manter este spec ≤ 300 linhas.

| Convenção             | Sub-spec                                                                  | Resumo                                                |
|-----------------------|---------------------------------------------------------------------------|-------------------------------------------------------|
| Idioma pt-BR          | [`idioma.md`](./.agents/specs/conventions/idioma.md)                      | pt-BR obrigatório em toda prosa                       |
| Tamanho & Revisão     | [`tamanho-e-revisao.md`](./.agents/specs/conventions/tamanho-e-revisao.md)| `.md` ≤ 300 linhas + checklist de revisão obrigatório |
| TDD                   | [`tdd.md`](./.agents/specs/conventions/tdd.md)                            | Red→Green→Refactor de Kent Beck, bloqueia merge       |
| Evolução de Agents    | [`evolucao-agents.md`](./.agents/specs/conventions/evolucao-agents.md)    | Agents/skills evoluem com a aplicação + memória       |
| Git Workflow          | [`git-workflow.md`](./.agents/specs/conventions/git-workflow.md)          | `main` protegida; merge apenas via PR                 |
| Estrutura & Versionamento | [`estrutura-e-versionamento.md`](./.agents/specs/conventions/estrutura-e-versionamento.md) | Layout de diretórios + versionamento semântico |
| Cobertura de Testes   | [`cobertura-testes.md`](./.agents/specs/conventions/cobertura-testes.md)| Mínimo 80% agregado por projeto vitest; hard fail CI |
| Release Automático    | [`post-merge-release.md`](./.agents/specs/conventions/post-merge-release.md) | Auto-tagging `vX.Y.Z` em main via `.github/workflows/release-template.yml` |
| CI Defense in Depth   | [`ci-defense-in-depth.md`](./.agents/specs/conventions/ci-defense-in-depth.md) | 3 camadas: pre-push local + preflight CI + quality CI gated |
| Retrospective Capture | [`retrospective-capture.md`](./.agents/specs/conventions/retrospective-capture.md) | Captura estruturada de aprendizados pós-atividade (T1/T2/T3 + threshold confidence ≥ 70) |

- **Pre-push obrigatório:** rodar `pnpm ci:local` antes de push (ver [git-workflow.md §Pre-Push Quality Gate](./.agents/specs/conventions/git-workflow.md))

---

## §7.5. Captura de Aprendizados Pós-Atividade (v1.4.0+)

Após cada **grande atividade** (plano multi-task, bugfix não-trivial,
ou adoção de novo padrão), o workflow [`retrospective-mode`](./.agents/workflows/retrospective-mode.md)
DEVE ser disparado para codificar aprendizados em memory files + proposals
de harness. Triggers e metodologia completos em [convenção dedicada](./.agents/specs/conventions/retrospective-capture.md).

---

## §7. Garantias do Padrão

Quando seguido corretamente, este padrão garante:

✅ **Interoperabilidade** — qualquer agent pode chamar qualquer outro agent
✅ **Vendor-neutrality** — funciona em Claude Code, Cursor, Windsurf, Aider, etc.
✅ **Reusabilidade** — copy-paste em novos projetos mantém a regra
✅ **Rastreabilidade** — todo despacho tem task, context, expected_output, success_criteria
✅ **Componibilidade** — workflows são compostos de agents simples
✅ **Observabilidade** — chain of dispatch é explícita e auditável

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Status:** Estável
