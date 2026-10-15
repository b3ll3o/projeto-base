# Memória: Skill `learning-observation`

> Memória cumulativa da skill. Atualizada após cada execução significativa.

## Decisões Tomadas

### 2026-10-14 — Nasce como camada DURANTE do par com `retrospective-capture`

**Contexto:** MEDIDO 2026-10-14 — o harness já grava memória estruturada
durante a tarefa e a cristalização DEPOIS não existe:
`grep -l originSessionId <memdir>/*.md | wc -l` sobre `ls -1 <memdir>/*.md | wc -l`
→ **113 de 116**. Das **73** do corpus que o gate mede, **33** não estão
citadas em nenhum `.md` versionado: a regra foi absorvida pela convenção e a
procedência evaporou.

**Decisão:** criar a camada DURANTE, com o que o harness não faz — tri-taxonomia
(T1 regra nova / T2 regra escrita que não pegou / T3 regra que deve morrer),
filtro negativo, e auto-suficiência (toda observação cita o comando que a
mediu). Nenhuma estrutura de log nova: o destino é a memória que o harness já
escreve.

**Consequências:** `pendente` vira dívida **declarada** no ledger (advisory), e
a triagem é lida pelo `check-memory-crystallization` nas duas direções.

## Padrões Descobertos

- **T2 é o tipo que o repo mais perde.** MEDIDO: `git grep -lF "<slug>" -- '*.md'`
  → **0** para a maioria das memórias. A regra foi absorvida sem procedência, e
  ninguém sabe se ela alguma vez foi seguida.
- **Ledger só de acréscimo é dívida que não encolhe.** Daí a 5ª destinação,
  `removida:` — sem tombstone, apagar uma memória vira citação permanente de um
  arquivo que ninguém tem.
- **`pendente` como advisory, não erro.** Gate que bloqueia por dívida
  declarada treina quem escreve a pular a etapa.

## Lições Aprendidas

- **O gate que escrevi mediu 0 sem dizer que media 0.** Dentro de um `.filter`,
  o parâmetro `e` sombreou o `Dirent`, e `e.test(e.name, …)` chamou a própria
  *exclusão* com o nome dela — `'MEMORY.md' === 'MEMORY.md'` é verdadeiro para
  todo arquivo. Sintoma: corpus inteiro isento, gate verde.
- **A primeira mutação do veredito NÃO caiu** (17/17 verde com `ok: true`):
  os testes de integração só cobriam *early returns*, e nenhum defeito real
  chegava à linha do veredito. Corrigido com 3 testes que atravessam o corpo
  principal; a mutação agora derruba 3.
- **Exceção escrita contra vocabulário imaginado não exclui ninguém.** O plano
  usava `state: true`; `grep -l "^state:" <memdir>/*.md | wc -l` → **0**. O
  vocabulário real é `metadata.type` — `grep -c "^  type: " <memdir>/*.md`
  mede **111** dos 115 arquivos (`feedback` 55, `project` 53, `reference` 3); os
  **4** restantes são o índice, dois result files e uma memória sem o campo, e
  foi somar 55+53+3 contra 115 sem explicar os 4 que produziu a conta quebrada.

## Sugestões de Evolução

- [ ] Promover as `pendente` que são **praticadas mas nunca enunciadas**
      (mutação que não cai, `patch` medido só no caminho do defeito,
      `red-gate-hides-the-queue`) — o repo já as segue, não as escreve.
- [ ] 8ª classe de guard: "detector que fabrica o próprio dado" — as frases e o
      `git grep` de cada uma estão na memória `a-detector-that-fabricates-its-finding`;
      o que falta aqui é o enunciado, não a medição.
