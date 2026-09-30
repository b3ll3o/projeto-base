---
name: business-rules
version: 1.0
updated: 2026-09-30
description: "Template de artefato separado de Business Rules (G3 do engineering-loop.md). Usado quando BRs têm reuso cross-spec ou vêm de regulação externa. Para specs self-contained, deixar BRs inline em spec.md §2."
extraction_criteria:
  - "BRs referenciadas em ≥ 2 outras specs"
  - "Spec tem ≥ 10 BRs"
  - "BRs vêm de regulação externa (BACEN, LGPD, PCI-DSS)"
usage: |
  Copie para specs/<NNN>-<feature>/business-rules.md
  Preencha com a lista enumerada de BRs.
  Cada BR referencia 1+ AC em spec.md (regra de rastreabilidade).
---

# Business Rules — `<NNN>-<feature-name>`

> **Quando usar:** ver `engineering-loop.md` §3 (critérios de extração).
> **Rastreabilidade:** toda BR referencia ≥1 AC em [`./spec.md`](./spec.md) que referencia ≥1 Eval em [`./evals/`](./evals/).

## Metadata

```yaml
feature: <NNN>-<feature-name>
version: 1.0
updated: <YYYY-MM-DD>
owner: <github-handle>
sources:
  - <PRD ou conversa>
  - <regulação externa: BACEN, LGPD, PCI-DSS>
spec_ref: ./spec.md
evals_ref: ./evals/
```

## Business Rules

### BR-001 — <título curto>

```yaml
- id: BR-001
  statement: "<regra de negócio completa em 1 frase>"
  rationale: "<por que essa regra existe — origem regulatória ou decisão de produto>"
  source: "<link ou referência>"
  priority: high | medium | low
  status: active | deprecated | under-review
  version: "1.0"
  references:
    ac: [AC-001, AC-002]   # ACs que endereçam esta BR
    eval: [EVAL-D-001]     # Evals que verificam esta BR
```

### BR-002 — <título curto>

```yaml
- id: BR-002
  statement: "<...>"
  rationale: "<...>"
  source: "<...>"
  priority: high | medium | low
  status: active
  version: "1.0"
  references:
    ac: [AC-003]
    eval: [EVAL-D-002, EVAL-I-002]
```

### BR-003 — <título curto>

```yaml
- id: BR-003
  statement: "<...>"
  rationale: "<...>"
  source: "<...>"
  priority: high | medium | low
  status: active
  version: "1.0"
  references:
    ac: [AC-004]
    eval: [EVAL-A-001]   # Architecture Eval
```

## Histórico de versões

| Versão | Data       | Mudança                          | Autor        |
|--------|------------|----------------------------------|--------------|
| 1.0    | <YYYY-MM-DD> | Publicação inicial              | <github-handle> |

---

## Checklist de Revisão (`tamanho-e-revisao.md`)

- [ ] Metadata preenchido (feature, version, owner, sources)
- [ ] Cada BR tem `id` único sequencial (BR-001, BR-002, ...)
- [ ] Cada BR tem `statement` em 1 frase (sem ambiguidade)
- [ ] Cada BR tem `rationale` (origem da regra)
- [ ] Cada BR tem `references.ac` (≥ 1 AC em `spec.md`)
- [ ] Cada BR tem `references.eval` (≥ 1 Eval em `evals/`)
- [ ] Critério de extração atendido (ver `engineering-loop.md` §3)
- [ ] Mudanças em BRs versionadas (não editar em silêncio)
