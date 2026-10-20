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

> ```
> $ <comando>
> <saída real>
> ```
> <!--pr-refresh:live-->

O marcador fica **dentro** do blockquote, colado da saída — e o motivo é
medido, não estético: o gate escopa o marcador pelo parágrafo
(`linhasVivas`, em `pr-refresh-apply.ts`), e parágrafo fecha em linha
vazia. Marcado fora, ele cobre a instrução e deixa a saída — que é onde a
claim vive — sem cobertura, e o PR sai vermelho contra o próprio
template. MEDIDO com o gate real: nesta forma, exit 1; com o marcador
colado na saída, exit 0.

## Merge Danger

**Door:** o que esta mudança abre — módulo, rota, migration, hook, gate novo.
"Nada" é uma resposta legítima, desde que seja dito.

**Blast Radius:** o que quebra junto com ela, e o que **não** quebra. Se um
gate novo entrou no `preflight`, diga qual §Tabela de Checks recebeu a linha.
