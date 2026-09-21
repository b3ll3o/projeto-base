# Integração: Windsurf

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Windsurf.

## Como o Windsurf Carrega

- `AGENTS.md` na raiz → regras do projeto
- `.windsurfrules` (legacy) → ainda suportado
- Custom agents via `~/.codeium/windsurf/memories/` ou regras inline

## Configuração Recomendada

```bash
# Windsurf lê AGENTS.md automaticamente
# Para custom agents, use Memories em .windsurf/memories/
mkdir -p .windsurf/memories/
cp .agents/agents/*.md .windsurf/memories/
```

## Vantagens

- Memories são carregadas automaticamente pelo Cascade
- Suporte a multiple memory sources
- Integração nativa com `.windsurfrules`

---

**Mantido por:** projeto-base contributors
