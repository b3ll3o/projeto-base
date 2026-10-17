# Convenção: Idioma Padrão (pt-BR)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

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

## Varrer antes de commitar: caractere fora do alfabeto latino

O modo de falha MEDIDO (3× em 2026-10): a prosa pt-BR sai com caractere CJK
(Kanji/Kana/Hangul) colado no meio da frase. **Nenhum gate acusa** — o arquivo
continua sintaticamente válido, o TypeScript compila, o Prettier formata e o
`tsc` passa. O defeito só aparece na revisão humana.

```bash
grep -rlP '[\x{4E00}-\x{9FFF}\x{3040}-\x{30FF}\x{AC00}-\x{D7AF}]' <arquivos alterados>
```

Rodar sobre **os arquivos alterados**, nunca sobre o diretório inteiro: um hit
em arquivo de terceiro não é defeito desta change. Saída vazia é o alvo.
