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

## Verificabilidade de Claims Numéricos

Quando um commit, doc, agent memory ou comentário citar um claim numérico
(linha, contagem de matches, byte count, file size, latência, contagem de
arquivos), esse claim **DEVE** ser reproduzível via shell command documentado
inline.

**Regra:** se você não consegue rodar um comando que reproduz o número, **NÃO
cite o número**. Substitua por um derivation path (ex: "ver `git show <sha>:<path> |
grep -cE <pattern>`") ou remova o claim por completo.

### Por quê

O code-quality reviewer identificou 3 IMPORTANT no pilot-summary do review-router
(corrigidos em commit `b40f207`):

1. **Line numbers fabricated** — claimed 777-1510 mas o arquivo tinha 255
   linhas; matches reais em 148-177 (verificável via `git show <sha>:<path> |
   grep -nE <pattern>`).
2. **Match count inflado** — claimed 10 matches mas `grep -cE` retorna 7.
3. **Diff cap claim misleading** — cited 51.200 bytes como "truncamento
   ineficaz" quando o raw era 130.219 bytes e a captura foi apenas 39,3%
   do total.

Em todos os 3 casos o problema era a mesma raiz: o autor citou números que
**pareciam plausíveis** mas não rodou o comando de verificação.

### Como aplicar

```text
ERRADO:  "Linhas 777, 797, 804-805, 1454, 1510 contêm tokens de segurança"
CERTO:   "Linhas verificadas: 148, 150, 152, 167, 173, 174, 177
          (verificado via git show 7ddb93e:tooling/scripts/review-router.spec.ts
          | grep -nE 'bcrypt|argon2|jwt\\.sign|jwt\\.verify')"

ERRADO:  "10 matches de bcrypt|argon2|hash\(|jwt.sign|jwt.verify"
CERTO:   "7 matches (verificado via ... | grep -cE 'bcrypt|argon2|jwt\\.sign|jwt\\.verify')"

ERRADO:  "Diff de 51.200 bytes (= cap de 50 KB)"
CERTO:   "Diff bruto = 130.219 bytes; classificador aplicou cap de 50 KB
          e capturou 51.200 bytes (= 39,3% do total) → truncamento efetivo"
```

### Critério objetivo

Antes de incluir um claim numérico, o autor DEVE:

1. Rodar o comando de verificação (ou anotar que será rodado pelo reviewer).
2. Colar o output real no doc/comment **OU** descrever o derivation path
   inline (comando + argumentos completos).

Se o comando falhar, o ambiente não permitir rodar, ou o output contradisser
o número que você queria citar: **NÃO cite o número**. Reescreva a frase
sem o claim ou reformule como range/estimativa derivada de fato verificável.

### Quando essa regra se aplica

- Mensagens de commit que citam line numbers, contagens ou métricas.
- Pilot summaries, retro files e reports de sprint.
- Agent memories que acumulam aprendizados com números concretos.
- Comentários em PR (descrição ou inline) referenciando números.

### Quando NÃO se aplica

- Code (constantes literais são, por definição, auto-verificáveis).
- Outputs de comandos colados literalmente — o output É a evidência.
- Ranges qualitativos sem número específico ("alguns", "vários", "poucos").
