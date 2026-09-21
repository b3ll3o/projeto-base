---
name: agents-coordinate
description: Protocolo de coordenação multi-agent. SEMPRE usar antes de despachar, receber handoff ou compor múltiplos agents. Define o formato canônico de task/context/expected_output/success_criteria que torna todos os agents interoperáveis.
---

# Skill: `agents:coordinate`

> **Esta skill é o coração do padrão genérico de agents.** Ela define **como** qualquer agent pode interoperar com qualquer outro agent — sem ela, agents seriam silos isolados.

## Princípio Fundamental

> **Todo agent pode chamar, ser chamado por, ou compor com qualquer outro agent** desde que sigam este protocolo.

A interoperabilidade é garantida por:

1. **Formato canônico de handoff** (mesma estrutura independente de quem chama ou é chamado)
2. **Triggers declarativos** (cada agent sabe quando pode/deve ser invocado)
3. **Outputs estruturados** (resultados parseáveis e componíveis)
4. **Composição explícita** (sequential, parallel, hierarchical)

## Índice do Protocolo

Esta skill está organizada em sub-documentos. Cada um foca em um aspecto:

| Seção | Arquivo | Conteúdo |
|-------|---------|----------|
| §1 Protocolo de Handoff | [`protocolos/dispatch.md`](./protocolos/dispatch.md) | Schema canônico de dispatch + exemplo real |
| §2 Mecanismos de Despacho | (nesta skill) | Como invocar dispatch via cada ferramenta |
| §3 Modos de Composição | [`protocolos/composicao.md`](./protocolos/composicao.md) | Sequential, parallel, hierarchical |
| §4 Outputs Estruturados | [`protocolos/outputs.md`](./protocolos/outputs.md) | Schema de retorno de qualquer agent |
| §5 Quando NÃO Coordenar | (nesta skill) | Casos de bypass da coordenação |
| §6 Validação do Protocolo | (nesta skill) | Checklist antes de despachar |
| §7 Exemplo Completo | [`exemplos/feature-mode.md`](./exemplos/feature-mode.md) | feature-mode end-to-end |
| §8 Versionamento | (nesta skill) | Estabilidade do protocolo |

---

## §2. Mecanismos de Despacho

### 2.1 Via Agent Tool (subagent dispatch)

Para ferramentas com Agent/Task tool (Claude Code, Cursor, Aider):

```yaml
Agent(
  prompt: <renderizar dispatch como prompt>,
  subagent_type: <to>,
  context: <files + code_snippets>,
  expected_output: <format>
)
```

### 2.2 Via Skill Tool

Para ferramentas com Skill tool (múltiplos vendors):

```yaml
Skill(
  skill: "agents-coordinate",
  args: { from, to, task, context, expected_output, success_criteria }
)
```

### 2.3 Via Handoff Manual

Para ferramentas sem dispatch nativo, codifique no prompt:

```markdown
Você está atuando como agent `<to>`, recebendo um dispatch de `<from>`.

## Task
<task.description>

## Context
<context.files>
<context.code_snippets>
<context.prior_outputs>
<context.constraints>

## Expected Output
Formato: <expected_output.format>
Schema: <expected_output.schema>

## Success Criteria
<success_criteria>

## On Failure
<on_failure>

Execute e retorne o resultado no formato esperado.
```

### 2.4 Via MCP / Task System

Para ferramentas com MCP ou task tracking:

```json
{
  "task": {
    "id": "TASK-<uuid>",
    "owner": "<to>",
    "created_by": "<from>",
    "payload": { /* dispatch completo */ },
    "status": "pending"
  }
}
```

---

## §5. Quando NÃO Coordenar

Use agents individuais (sem `agents:coordinate`) apenas quando:

1. **Tarefa trivial de um único agent** — ex.: "qual a sintaxe de X em Python?"
2. **Interação puramente conversacional** — sem execução
3. **Exploração read-only pontual** — `explorer` sozinho sem necessidade de specialists
4. **Decisão que cabe a um único especialista** — ex.: "este código tem bug?" → `code-reviewer` sozinho

Em todos os outros casos, **coordene**.

---

## §6. Validação do Protocolo

Antes de despachar, verifique:

- [ ] `task.description` é uma frase imperativa clara (não ambígua)
- [ ] `context.files` lista paths relativos ao repo (não absolutos)
- [ ] `expected_output.format` é parseável (yaml, json, markdown estruturado)
- [ ] `success_criteria` são **objetivos e verificáveis** (não "parecer bom")
- [ ] `on_failure` tem fallback ou política de retry explícita

Se algum item falhar, **revise o dispatch antes de enviar**.

---

## §8. Versionamento do Protocolo

| Versão | Mudanças |
|--------|----------|
| `1.0.0` | Lançamento inicial do protocolo |

**Estabilidade:** Os campos `dispatch.from`, `dispatch.to`, `dispatch.task`, `dispatch.expected_output` e `dispatch.success_criteria` são **estáveis**. Mudanças incompatíveis exigirão major bump.

---

**Mantido por:** projeto-base contributors
**Tipo:** Skill compartilhada (carregável por qualquer agent)
