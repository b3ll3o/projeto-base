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
│   ├── memory/                         # Memória acumulada por agent (evolução)
│   ├── skills/
│   │   └── <skill-name>/
│   │       ├── SKILL.md                # Ponto de entrada da skill (≤ 300 linhas)
│   │       ├── protocolos/             # Sub-protocolos (opcional)
│   │       └── exemplos/               # Exemplos de uso (opcional)
│   ├── specs/
│   │   └── conventions/                # Sub-specs referenciadas por AGENTS.md §6
│   │       ├── README.md               # Índice
│   │       ├── idioma.md
│   │       ├── tamanho-e-revisao.md
│   │       ├── tdd.md
│   │       ├── evolucao-agents.md
│   │       ├── git-workflow.md
│   │       └── estrutura-e-versionamento.md
│   └── WORKFLOWS.md                    # Fluxos pré-configurados
└── docs/
    ├── TEMPLATE_USAGE.md               # Guia principal (≤ 300 linhas)
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
- Tags: `v0.1.0`, `v0.2.0`, `v1.0.0` (estável)
- Breaking changes no padrão de coordenação exigem major bump
- Toda tag DEVE passar pelo checklist de revisão (ver [`tamanho-e-revisao.md`](./tamanho-e-revisao.md))
