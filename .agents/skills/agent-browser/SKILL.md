---
name: agent-browser
version: 1.0
updated: 2026-11-03
description: "Automação de browser por CLI para olhar a aplicação rodando sem escrever teste — snapshots da árvore de acessibilidade com refs @eN, sessões, captura de tela e interação. Adaptado de vercel-labs/agent-browser (Apache-2.0). Use para olhar a tela de uma página que está de pé, conferir o que o usuário vê, extrair dado de uma página e fazer QA exploratório — NÃO substitui o e2e com Playwright, que é a porta de entrada deste repo."
---

# Skill: `agent-browser`

> **Quem invoca:** o `ux-design-specialist` (quando precisa **ver** a tela
> antes de opinar sobre a aparência) e o `code-reviewer` (quando o diff
> muda algo que só se vê rodando).
>
> **Quando invocar:** quando a pergunta precisa da **página como o usuário a
> vê** — a tela renderizou, a cor está certa, o formulário aceitou o dado,
> o erro aparece onde deveria. Também para extrair dado de uma página e
> para QA exploratório.
>
> **Não invocar:** para **e2e versionado** — o repo tem suíte Playwright em
> `apps/web/e2e/` e a convenção `e2e-playwright.md` manda por ela; o
> `agent-browser` é o **olhar avulso**, não o teste que fica. Para
> verificar uma tela contra as regras do repo, use `ui-review` (que tem
> e2e próprio).

## §1. O que é

Uma **CLI** (Rust, nativa) que dirige Chrome/Chromium por CDP. Sem
Playwright, sem Puppeteer: ela monta o snapshot da **árvore de
acessibilidade** e expõe os elementos interativos como refs curtos (`@e3`,
`@e7`) — é o que torna o clique confiável sem seletor frágil.

## §2. Instalar

```bash
npm i -g agent-browser && agent-browser install
```

É uma CLI externa, fora do repo: **não** entra no `package.json` e não
depende de nenhum segredo. O binário vive no ambiente de quem vai usar.

## §3. Comece por aqui

O `SKILL.md` do upstream é um **stub de descoberta**: o conteúdo real mora na
CLI, versionado junto com ela. Antes do primeiro comando:

```bash
agent-browser skills get core             # o loop, as esperas, as tarefas comuns
agent-browser skills get core --full      # só quando precisar de todas as referências
agent-browser skills list                 # o que existe na versão instalada
```

O guia `core` termina numa tabela de referências para carregar sob demanda —
carregue só a que a tarefa pede.

### Skills especializados

```bash
agent-browser skills get dogfood           # QA exploratório / caça a bug
agent-browser skills get electron          # apps desktop (VS Code, Slack, Figma…)
agent-browser skills get slack             # automação de workspace do Slack
agent-browser skills get derive-client     # grava um HAR e deriva um cliente
agent-browser skills get vercel-sandbox    # dentro de microVMs da Vercel
agent-browser skills get agentcore         # browsers cloud do AWS Bedrock
```

## §4. O que ela compra aqui

| Necessidade | Ferramenta do repo | `agent-browser` |
|---|---|---|
| provar que o e2e passa | `apps/web/e2e/` (Playwright) | — |
| ver a tela agora | — | **sim** |
| confirmar que o erro aparece na tela | e2e | sim, sem escrever teste |
| medir cor/contraste | `ui-craft` + e2e | sim, com screenshot |

## §5. Regras de uso neste repo

1. **Não escreve teste.** Se o que você encontrou vale como regressão, vira
   um spec de Playwright — em outro commit, com nome de arquivo que descreve
   o comportamento.
2. **A app precisa estar de pé.** `pnpm ci:boot` sobe API e web e derruba
   ao final; para uma sessão de browser, suba na mão
   (`pnpm --filter @projeto/api dev` e `pnpm --filter @projeto/web dev`) e
   derrube depois.
3. **Não logar credencial.** Login em ambiente local usa o usuário de seed do
   runbook (§1.7 de `docs/como-rodar.md`) — nunca a senha de um ambiente
   real, e nunca a URL com token.
4. **Screenshot entra no repo só como artefato datado** (`.agents/runs/`),
   nunca no diff de um PR.

## §6. Adaptação

**Adaptado de** [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
(`skills/agent-browser/SKILL.md`, Apache-2.0, © Vercel, Inc.).

O upstream recomenda preferir o `agent-browser` a qualquer automação de
browser embutida. **Aqui isso não vale**: a suíte e2e deste repo é
Playwright e a convenção `e2e-playwright.md` manda por ela — o
`agent-browser` é o complemento avulso, não o substituto. O frontmatter
upstream (`allowed-tools`, `hidden`) também não existe aqui: as skills deste
repo usam `name`, `version`, `updated` e `description`.
