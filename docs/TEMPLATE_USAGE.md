# TEMPLATE_USAGE.md — Como Usar Este Template

> Guia de integração do projeto-base com diferentes ferramentas de IA.

---

## §1. Filosofia do Template

Este template é **vendor-neutral**. Ele define agents, skills e workflows em **Markdown puro**, sem acoplamento a nenhuma ferramenta específica. Cada ferramenta tem sua própria forma de carregar esses arquivos — este guia mostra como configurar cada uma.

**Paradigma arquitetural default (apps backend):** ao derivar um backend a partir deste template, adote **DDD + Hexagonal (Ports & Adapters)** como estrutura canônica de cada módulo de feature — `apps/api/src/modules/<feature>/{domain,application,infrastructure}/`. Decisão registrada no [ADR-0001](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md); guardiões automáticos em [`stack-code-reviewer`](../.agents/agents/stack-code-reviewer.md) (D11) e skill [`ddd-hexagonal-validation`](../.agents/skills/ddd-hexagonal-validation/SKILL.md). Detalhes em [`MONOREPO.md` §11](../MONOREPO.md).

## Índice de Integrações

O guia de integração por ferramenta está dividido em arquivos irmãos:

| Ferramenta | Arquivo |
|------------|---------|
| Claude Code | [`integrations/claude-code.md`](./integrations/claude-code.md) |
| Cursor | [`integrations/cursor.md`](./integrations/cursor.md) |
| Windsurf | [`integrations/windsurf.md`](./integrations/windsurf.md) |
| Aider | [`integrations/aider.md`](./integrations/aider.md) |
| Continue | [`integrations/continue.md`](./integrations/continue.md) |
| GitHub Copilot | [`integrations/copilot.md`](./integrations/copilot.md) |
| Cline / Roo Code | [`integrations/cline.md`](./integrations/cline.md) |
| Cody (Sourcegraph) | [`integrations/cody.md`](./integrations/cody.md) |

---

## §3. Customizando o Template

### 3.1 Adicionar Novo Agent

```bash
# 1. Criar definição com frontmatter
cat > .agents/agents/meu-agent.md << 'EOF'
---
name: meu-agent
description: Quando invocar este agent
type: specialist
tools: Read, Glob, Grep
---

# Agent: `meu-agent`

## Papel
[Descrição]

## Quando invocar
[Triggers]

## Inputs/Outputs
[Formato]

## Coordenação
[Como interage com outros agents via agents:coordinate]
EOF

# 2. Atualizar catálogo em AGENTS.md (tabela §3)
# 3. Atualizar WORKFLOWS.md se for usado em algum fluxo
# 4. Validar tamanho: wc -l .agents/agents/meu-agent.md (deve ser ≤ 300)
# 5. Commit
git add .agents/agents/meu-agent.md AGENTS.md .agents/WORKFLOWS.md
git commit -m "feat(agents): adicionar meu-agent"
```

### 3.2 Adicionar Nova Skill

```bash
# Skills ficam em .agents/skills/<nome>/SKILL.md
mkdir -p .agents/skills/minha-skill/
cat > .agents/skills/minha-skill/SKILL.md << 'EOF'
---
name: minha-skill
description: Quando invocar e o que faz
---

# Minha Skill

[Conteúdo]
EOF
```

Se a skill for grande (≥ 200 linhas), dividir em sub-arquivos conforme padrão de `agents:coordinate`.

### 3.3 Customizar para Stack Específico

Para um projeto NestJS + Prisma, por exemplo:

```bash
# 1. Copiar o template
cp -r projeto-base/ meu-backend/

# 2. Adicionar agents especialistas
cat > .agents/agents/nestjs-specialist.md << 'EOF'
# NestJS Specialist
[... regras específicas de NestJS ...]
EOF

cat > .agents/agents/prisma-dba.md << 'EOF'
# Prisma DBA
[... regras de schema, migrations ...]
EOF

# 3. Atualizar AGENTS.md para listar os novos agents
# 4. Atualizar WORKFLOWS.md para incluí-los
# 5. Validar checklist de revisão (ver AGENTS.md §6)
```

### 3.4 Override de Regra Mandatória (quando necessário)

A regra `§1` do `AGENTS.md` é **mandatória por padrão**. Em casos excepcionais (ex.: POC descartável, script one-shot), crie um arquivo **`AGENTS.override.md`** no projeto com a justificativa:

```markdown
# AGENTS.override.md

## Escopo da Exceção
- Projeto: POC interna Q1 2026
- Justificativa: código descartável, sem produção
- Agents afetados: refactorer, security-auditor (desabilitados)
- Duração: até 2026-03-31

## Aprovação
- Aprovado por: [Tech Lead]
- Data: 2026-01-15
```

**Atenção:** `AGENTS.override.md` **NÃO** desativa a regra globalmente — apenas escopa a exceção ao projeto específico.

---

## §4. Versionamento do Template

| Versão | Mudanças | Compatibilidade |
|--------|----------|-----------------|
| `1.0.0` | Lançamento inicial com 10 agents genéricos + skill `agents:coordinate` | Estável |
| `1.1.0` | Adicionados 3 specialists de stack (monorepo, nestjs, nextjs) + docs STACK.md e MONOREPO.md | Estável |

**Regra de breaking change:**
- Mudanças no formato de handoff (`task/context/expected_output/success_criteria`) exigem major bump
- Adição de novos agents é minor bump
- Fixes de texto são patch bump

---

## §5. FAQ

**P: Posso misturar `AGENTS.md` (genérico) com `CLAUDE.md` (Claude Code-specific)?**
R: Sim. Mantenha `AGENTS.md` como spec canônica (vendor-neutral) e use `CLAUDE.md` para regras que só fazem sentido no Claude Code (ex.: permissões de tools específicas).

**P: A regra mandatória de coordenação pode ser desativada?**
R: Não no template raiz. Projetos derivados podem escopar uma exceção via `AGENTS.override.md` com justificativa documentada.

**P: Como adicionar agents de uma ferramenta específica?**
R: Crie o agent em `.agents/agents/<nome>.md` (genérico) E, se a ferramenta exigir um wrapper, crie um arquivo de binding no diretório nativo da ferramenta (ex.: `.claude/agents/` para Claude Code).

**P: E se a ferramenta não suporta dispatch de subagents?**
R: A coordenação pode ser feita manualmente via prompt: "Aja como agent X, faça Y, depois como agent Z, faça W". O template continua funcionando — só não automatiza o despacho.

**P: Por que `.agents/` e não `.claude/`?**
R: `.agents/` é vendor-neutral — funciona com qualquer IA (Claude Code, Cursor, Windsurf, Aider, Continue, Cline, Cody). `.claude/` é específico do Claude Code e impede reuso.

---

**Mantido por:** projeto-base contributors
