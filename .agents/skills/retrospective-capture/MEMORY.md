# Memória: Skill `retrospective-capture`

> Memória cumulativa da skill. Atualizada após cada execução significativa.

## Decisões Tomadas

### 2026-09-22 — Skill publicada na v1.4.0

**Contexto:** aprendizados pós-atividade eram capturados ad-hoc via
`b<N>-result.md`, sem trigger automático, sem metodologia consistente,
sem captura granular (bugfixes se perdiam).

**Decisão:** criar workflow `retrospective-mode` + skill
`retrospective-capture` + convenção `retrospective-capture.md` em
v1.4.0. Triggers explícitos (T1: plano multi-task; T2: bugfix
não-trivial; T3: 1ª adoção de padrão). Threshold de confidence (≥ 70)
para proposals; abaixo disso, comentário.

**Consequências:** b<N>-result.md segue sendo narrativa; proposals
de harness viram PRs separados com a skill/memory update + convite
para revisão. Coverage retroativo: aplicável a partir de b11+.

## Padrões Descobertos

- **Triangulação diff + conversation + memories** é o input mais rico:
  diff captura O QUE mudou; conversation captura POR QUÊ; memories
  capturam o estado anterior. Os 3 juntos revelam decisões tácitas.
- **Confidence scoring** deve usar repetição + impacto + clareza —
  heurística simples mas calibrada em ~70 evita proposals sem valor.
- **Result file vs proposal PR:** separar narrativa de mudança de
  harness reduz ruído no diff do plano original.

## Lições Aprendidas

- Threshold de 70 calibrado em 5 retrospectivas de validação (B5-B10).
- Items com confidence < 70 ainda são úteis: viram comentário no
  result file e alimentam re-calibração futura.
- Escrever retrospective SEM olhar diff = narrativa sem valor.

## Sugestões de Evolução

- [ ] Adicionar Calibrador de Confidence (skill adjacente) para
      treinar threshold por tipo de decision-list item
- [ ] Integrar com `review-and-fix-after-each-task`: dispara
      retrospectiva automaticamente quando review foi ≥ 2 rounds
- [ ] Wire ao Husky `post-commit` ou CI workflow para auto-trigger
      em commits grandes (> N LOC)
