# Convenção: Tamanho Máximo e Revisão Obrigatória

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## Tamanho Máximo de Arquivos

- **Arquivos Markdown (`.md`)** DEVEM ter no máximo **300 linhas**.
- Arquivos que excederem esse limite DEVEM ser **divididos** em múltiplos arquivos irmãos com:
  - Um arquivo índice que lista e linka os sub-arquivos
  - Sub-arquivos com escopo bem definido
  - Links cruzados consistentes em ambos os sentidos
- **Agents, skills e workflows** seguem a mesma regra (definições devem ser focadas e legíveis)
- A divisão é responsabilidade do agent que criar o arquivo; revisão posterior deve validar

## Etapa Obrigatória de Revisão e Correção

Após QUALQUER alteração em QUALQUER arquivo do projeto, executar uma etapa explícita de revisão com o checklist abaixo:

- [ ] **Tamanho**: `wc -l <arquivo>` ≤ 300 linhas (`.md`) ou limite definido
- [ ] **Consistência de conteúdo**: sem placeholders, TODOs vagos ou seções incompletas
- [ ] **Referências cruzadas**: todos os links internos funcionam (`.agents/...`, `docs/...`)
- [ ] **Lint Markdown**: fenced code blocks com linguagem especificada; tabelas formatadas consistentemente
- [ ] **Idioma**: pt-BR por padrão (ver [`idioma.md`](./idioma.md))
- [ ] **Frontmatter** (para agents/skills): `name`, `description` e `type` preenchidos
- [ ] **Sem duplicação**: conteúdo não duplicado entre arquivos

Esta etapa é responsabilidade de quem altera o arquivo. Pode ser feita manualmente ou despachando o agent `code-reviewer` para revisão automatizada.
