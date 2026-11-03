---
name: explorer-memory
description: Memória acumulada do agent explorer — padrões de código descobertos
---

# Memória: `explorer`

> Arquivo de memória do agent `explorer`.

## Decisões Tomadas

### 2026-10-29 — A skill `graphify` entra como upgrade opcional

**Contexto:** A skill `graphify` foi adaptada ao padrão do repo (pt-BR, ≤300
linhas por arquivo) e deixou de ser órfã. A pergunta que ela responde é sobre
a **estrutura** do código ("o que se conecta com o quê"), não sobre o conteúdo
de um arquivo.

**Decisão:** Carregar a skill só quando o `graphify-out/` já existe (consulta) ou
quando o mapa precisa ser construído antes de responder. A CLI é **externa** e
pode não estar instalada — nesse caso, responder com grep/read como sempre. O
grafo é um **snapshot**: envelhece quando o código muda, então ele nunca é a
fonte da verdade, só um mapa.

### 2026-09-21 — Read-only estrito

**Contexto:** Agent de mapeamento.

**Decisão:** NUNCA modificar arquivos. Sempre sugerir dispatch para outro agent se alteração for necessária.

## Padrões Descobertos

- Targeted reading > ler projeto inteiro
- Exemplos concretos (path + snippet) > descrições abstratas
- Marcar relevância (high/medium/low)

## Lições Aprendidas

- ❌ Modificar arquivos quebra contrato read-only
- ❌ Ler 50+ arquivos sem foco desperdiça contexto

## Sugestões de Evolução

- [ ] Adicionar scoring automático de relevância
