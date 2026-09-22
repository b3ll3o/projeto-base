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

O agent [`tdd-enforcer`](../../../agents/tdd-enforcer.md) é despachado automaticamente em:

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

## Referências Canônicas

- Kent Beck, *Test-Driven Development: By Example* (2003)
- Robert C. Martin, "The Three Rules of TDD" — [Clean Coders](https://cleancoders.com/)
