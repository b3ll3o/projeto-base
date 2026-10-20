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

O marcador fica **colado na saída** — e o motivo é medido, não estético: o
gate escopa o marcador pelo **parágrafo** (`linhasVivas`, em
`pr-refresh-apply.ts`), e parágrafo fecha em linha vazia. Marcado depois de
uma linha em branco, ele cobre a instrução e deixa a saída — que é onde a
claim vive — sem cobertura, e o PR sai vermelho contra o próprio template.
MEDIDO com o gate real, nos dois sentidos: marcador separado por linha em
branco → exit 1; marcador **no mesmo parágrafo** da saída, como acima →
exit 0.

Repare que o que escopa é o parágrafo, não o blockquote: as linhas `> ` acima
são as 5 linhas do bloco de código, e o marcador está na 5ª delas. Tirar o
`> ` sem pôr linha em branco continua sendo o mesmo parágrafo e continua
passando — MEDIDO 2026-10-20.

**O que o marcador arma:** ele não só desarma o gate — ele também marca a
região como *viva* para o `pr-refresh`, que **reescreve** toda claim divergente
que estiver naquele parágrafo. Passar no gate e ter a evidência reescrita são o
mesmo evento visto de dois lados. Antes de colar a saída, confira se ela tem
algum número em formato **mensurável** — só `N commits`, `N arquivos`, `+N/−M`
são (são as contagens do próprio PR); `N testes` é reconhecido mas nunca
reescrito, e `501 passed` não é reconhecido. Se a saída tiver uma das três
primeiras, o que está escrito deixa de ser a saída que o comando produziu.


## Merge Danger

**Door:** o que esta mudança abre — módulo, rota, migration, hook, gate novo.
"Nada" é uma resposta legítima, desde que seja dito.

**Blast Radius:** o que quebra junto com ela, e o que **não** quebra. Se um
gate novo entrou no `preflight`, diga qual §Tabela de Checks recebeu a linha.
