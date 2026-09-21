# Convenção: Estrutura de Diretórios e Versionamento

> Sub-spec referenciada por [AGENTS.md §6](../../../../AGENTS.md).

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

## Histórico de Versões

| Versão | Mudanças |
|--------|----------|
| `1.0.0` | Lançamento inicial — 10 agents genéricos + skill `agents:coordinate` |
| `1.1.0` | Adicionados 3 specialists de stack (monorepo, nestjs, nextjs) + workflows detalhados + docs STACK.md e MONOREPO.md |
