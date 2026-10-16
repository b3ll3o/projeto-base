# Convenção: Desenvolvimento Orientado a Testes (TDD)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

**TODAS as aplicações do projeto DEVEM seguir o ciclo TDD canônico de Kent Beck.** Esta regra é absoluta e não admite exceção sem `AGENTS.override.md` documentado.

## As 3 Regras de TDD (Robert C. Martin / Kent Beck)

1. **Não é permitido escrever código de produção** a menos que seja para fazer um teste falho passar.
2. **Não é permitido escrever mais de um teste** do que o suficiente para falhar.
3. **Não é permitido escrever mais código de produção** do que o suficiente para passar o teste falho.

## Ciclo Red → Green → Refactor (obrigatório)

```text
🔴 RED       Escrever 1 teste que falha
        ↓
🟢 GREEN     Escrever APENAS o código mínimo para passar
        ↓
♻️ REFACTOR  Melhorar design mantendo testes verdes
        ↓
(repetir para o próximo incremento)
```

## Aplicação Prática

- **Bug fix**: escrever teste de regressão que reproduz o bug (red) → corrigir (green) → refatorar se necessário
- **Nova feature**: começar pelo teste de aceitação → decompor em testes unitários → implementar incrementalmente
- **Refatoração**: testes DEVEM existir ANTES de qualquer mudança de código de produção
- **Cobertura**: cada nova linha de código de produção vem com ≥ 1 teste (TDD garante isso por construção)

## Verificação Automática

O agent [`tdd-enforcer`](../../agents/tdd-enforcer.md) é despachado automaticamente em:

- Todo `git commit` que toca código de produção
- Todo `git push` / abertura de PR
- Todo despacho de `feature-mode`, `bugfix-mode`, `refactor-mode`

O agent valida:

- [ ] Commit de teste **antes** de commit de implementação (na história do git)
- [ ] Existe commit na fase RED (teste falhando)
- [ ] Existe commit na fase GREEN (teste passando)
- [ ] Existe commit na fase REFACTOR (se aplicável)
- [ ] Coverage ≥ 80% em todas as métricas

**Bloqueio:** TDD violado = merge bloqueado. Exceções apenas via `AGENTS.override.md` com justificativa.

## Regra: todos os testes devem estar passando

Nenhum merge com suíte vermelha, e nenhum push sem `pnpm ci:local`: a cadeia `&&`
de `ci:local` faz a suíte vermelha derrubar o pre-push inteiro, e o job `quality`
do `ci.yml` fecha a mesma regra no CI.

**Suíte que não roda não está verde.** "Todos os testes passando" só significa
algo se o conjunto for enumerado — sem isso é um critério inerte sobre conjunto
vazio, que passa com zero testes. O gate
[`check-test-set-covered`](../../../.tooling/scripts/ci/check-test-set-covered.ts)
reconcilia os scripts `test*` de cada pacote do workspace contra o que o
`ci:local` de fato executa, e a exceção é **declarada** na tabela abaixo — nunca
inferida do conteúdo do script, porque inferir transforma qualquer `echo` novo
em "sem testes" e a regra deixa de ter dono.

### Exceções: scripts `test*` que nenhum gate executa

| Pacote | Script | Por quê |
|---|---|---|
| `@projeto/shared-types` | `test` | pacote types-only: o que roda é `typecheck` (`tsc --noEmit`), que o `ci:local` inclui |
| `@projeto/eslint-config` | `test` | sem suíte própria ainda — o script é `echo … && exit 0` |
| `@repo/review-router-tooling` | `test` | roda, mas FORA do turbo: `tooling:test` na raiz (`vitest run --root tooling/scripts`), que é o último estágio do `ci:local`. Este gate lê invocações `turbo run`, então ele não enxerga essa — daí a linha |

Uma linha aqui é uma **promessa**, não uma descrição: se o script passar a rodar
(no `ci:local` ou em outro gate), a linha vira documentation lie e o gate acusa.
O inverso também — pacote novo com `test*` fora da tabela é vermelho.

### O que esta regra NÃO mede

Que a suíte **esteja** verde é o `turbo run` quebrando o build — este gate mede o
conjunto, não a execução. E ele não vê instabilidade: uma suíte que passa 9 de
10vezes está "verde" para todo mundo que olha uma execução. MEDIDO 2026-10-16,
`@projeto/api#test:e2e` falhou em **1 de 3** execuções de `ci:local` e passou nas
outras duas, e o teste que falhou não ficou registrado em lugar nenhum — o
`tail` da saída é o que existe. Detectar isso exige repetir a suíte, que é custo
de CI, não uma regra de convenção.

## Referências Canônicas

- Kent Beck, *Test-Driven Development: By Example* (2003)
- Robert C. Martin, "The Three Rules of TDD" — [Clean Coders](https://cleancoders.com/)
