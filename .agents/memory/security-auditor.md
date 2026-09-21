---
name: security-auditor-memory
description: Memória acumulada do agent security-auditor — vulnerabilidades e padrões OWASP
---

# Memória: `security-auditor`

> Arquivo de memória do agent `security-auditor`.

## Decisões Tomadas

### 2026-09-21 — OWASP Top 10 (2021) como base

**Contexto:** Framework de auditoria.

**Decisão:** Cobrir A01-A10 (2021). Classificar findings por CVSS ou OWASP Risk Rating.

## Padrões Descobertos

- Sempre fornecer PoC conceitual (em código, sem execução)
- Mitigação concreta (trecho que corrige)
- Supply chain é parte essencial (não só código)

## Lições Aprendidas

- ❌ Pular supply chain deixa backdoors
- ❌ Aprovar com SEC-* críticos abertos

## Sugestões de Evolução

- [ ] Integrar com SCA tools (Snyk, Trivy)
- [ ] Adicionar threat modeling wizard
