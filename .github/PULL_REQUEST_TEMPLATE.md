<!--
  Template de PR. Três seções, texto livre, sem checklist que ninguém marca.

  Uma ressalva que não é óbvia: NÃO preencha números aqui. A `## Evidence` é
  reescrita a cada push por `pr-refresh`, e um número copiado do template vira
  uma claim viva que o gate mede contra o HEAD — e diverge no primeiro commit.
  Escreva o comando, cole a saída real.
-->

## Summary

O que muda e por quê. Duas ou três frases: o problema, a decisão, o efeito.

## Evidence

O comando e a saída — antes e depois. Sem isto, o texto acima é afirmação.

Toda claim numérica deste parágrafo precisa do marcador abaixo, senão
`pr-refresh-gate` acusa divergência no CI:

<!--pr-refresh:live-->

> ```
> $ <comando>
> <saída real>
> ```

## Merge Danger

**Door:** o que esta mudança abre — módulo, rota, migration, hook, gate novo.
"Nada" é uma resposta legítima, desde que seja dito.

**Blast Radius:** o que quebra junto com ela, e o que **não** quebra. Se um
gate novo entrou no `preflight`, diga qual §Tabela de Checks recebeu a linha.
