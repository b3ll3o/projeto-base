# Convenção: Idioma Padrão (pt-BR)

> Sub-spec referenciada por [AGENTS.md §6](../../../../AGENTS.md).

**pt-BR é o idioma padrão e obrigatório** do projeto. Aplicar a:

- Documentação (`AGENTS.md`, `WORKFLOWS.md`, specs, ADRs, READMEs, comentários inline)
- Mensagens de commit (Conventional Commits em pt-BR: `feat(escopo): descrição em pt-BR`)
- Mensagens de erro, validação, log
- UI, mensagens ao usuário final
- Outputs e respostas dos agents

## Exceções Permitidas (inglês técnico, APENAS)

- Nomes de variáveis, funções, classes, tipos, métodos (convenção técnica universal)
- Identificadores de bibliotecas, frameworks, APIs externas
- Palavras-chave reservadas da linguagem (`if`, `for`, `class`, etc.)
- Nomes de RFCs, padrões e protocolos técnicos

## Regra Prática

Se cabe em código compilado → inglês técnico permitido. Se é prosa para humanos → pt-BR obrigatório.
