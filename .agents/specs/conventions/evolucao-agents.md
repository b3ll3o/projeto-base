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
