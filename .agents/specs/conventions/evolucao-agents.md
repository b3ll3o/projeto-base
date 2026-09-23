# Convenção: Evolução Contínua de Agents e Skills

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

**Agents e skills são entidades VIVAS que DEVEM evoluir junto com a aplicação.** Esta regra é absoluta.

## Fluxo Obrigatório ao Receber QUALQUER Tarefa

```text
1. ANALISAR  Consultar catálogo de agents em AGENTS.md §3
       │
       ▼
   Algum agent já cobre o pedido?
       │
       ├─ SIM → Despachar via agents:coordinate (§4)
       │
       └─ NÃO → 2. PESQUISAR referências canônicas na internet
                  │
                  ▼
              3. CRIAR ou ADAPTAR novo agent
                  │
                  ▼
              4. Atualizar AGENTS.md §3 (catálogo)
                  │
                  ▼
              5. Atualizar WORKFLOWS.md se aplicável
                  │
                  ▼
              6. Despachar via agents:coordinate
```

## Regra de Bloqueio por `gap_detected`

Quando `specialist-router` retorna `gap_detected: true`, controller **DEVE** bloquear planning e despachar `agent-architect` para criar o specialist ausente. **Inegociável** — alinhado com "Never implement manually when an appropriate agent exists".

**Fluxo:**

1. Router retorna gap + suggested_specialist
2. Controller loga + despacha `agent-architect` com tarefa `criar specialist <suggested_specialist>`
3. `agent-architect` cria agent + memory + atualiza AGENTS.md §3 + WORKFLOWS.md
4. Controller re-despacha router
5. Prosseguir com planning

**Exceções:**

- Se `suggested_specialist` for claramente trivial (e.g., mudança isolada em 1 arquivo) e o usuário aprovar bypass explícito, controller pode prosseguir diretamente. **Default é bloquear.**

**Cross-refs:**

- [`.agents/agents/specialist-router.md`](../../../agents/specialist-router.md) — orquestrador que detecta gap
- [`.agents/skills/specialist-routing/SKILL.md`](../../skills/specialist-routing/SKILL.md) — Passo 5 do controller (tratar gap)
- [`.agents/specs/conventions/specialist-routing.md`](./specialist-routing.md) §4 — `gap_detected` field no schema
- [`tooling/scripts/specialist-router.ts`](../../../tooling/scripts/specialist-router.ts) — classificador que emite gap_detected

## Regras Inegociáveis

1. **NUNCA implementar manualmente** tarefa que tem agent apropriado — SEMPRE despachar via `agents:coordinate`
2. **NUNCA criar código sem antes** verificar se algum agent já cobre o domínio
3. **SEMPRE usar agents** — implementação direta é anti-pattern
4. **Cada agent TEM arquivo de memória** em `.agents/memory/<agent-name>.md` com:
   - Decisões tomadas em execuções anteriores
   - Padrões descobertos no domínio
   - Lições aprendidas (erros e acertos)
   - Sugestões de evolução
5. **Agents DEVEM evoluir** — após uso significativo, atualizar o agent E sua memória
6. **Skills DEVEM evoluir** — revisar periodicamente e atualizar conforme aprendizados

## Meta-Agent Responsável

[`agent-architect`](../../../agents/agent-architect.md) é despachado quando:

- Novo domínio surge que nenhum agent cobre
- Lacuna funcional identificada em agent existente
- Aplicação cresce e precisa de nova especialidade
- Há referências canônicas novas para um domínio

## Memória por Agent — Estrutura

```text
.agents/
├── memory/                          # Memória acumulada por agent
│   ├── agent-architect.md
│   ├── orchestrator.md
│   ├── explorer.md
│   ├── code-reviewer.md
│   ├── security-auditor.md
│   ├── refactorer.md
│   ├── test-writer.md
│   ├── tdd-enforcer.md
│   ├── doc-writer.md
│   └── task-manager.md
└── skills/
    └── <skill-name>/
        └── MEMORY.md                # Skills também têm memória
```

## Quando Atualizar Memória de um Agent

- Após execução significativa (mudança de comportamento, novo padrão descoberto)
- Após finding novo em code-review ou security-auditor
- Após bug encontrado em produção causado por agent
- Após decisão arquitetural relevante tomada pelo agent
- Mensalmente, em revisão de evolução disparada por `agent-architect`
