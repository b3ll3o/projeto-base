---
name: docker
description: Convenções e processos docker específicos do monorepo projeto-base. Cobre ordem de build (db:generate → tsc), next.config.mjs output: 'standalone', entrypoint com prisma migrate deploy, .dockerignore mínimo, Compose profiles dev/prod, networks bridge, volumes nomeados, healthchecks via curl, non-root user, BuildKit cache mounts para pnpm. Use sempre que criar/editar Dockerfile, compose, ou .dockerignore no projeto.
---

# Skill `docker` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/docker/SKILL.md`](../../../.agents/skills/docker/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/docker/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/docker/SKILL.md` |
| Binding Claude Code | `.claude/skills/docker/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
