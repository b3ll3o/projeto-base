---
name: agent-desktop
version: 1.0
updated: 2026-11-09
description: "Automação de desktop por CLI para operar apps nativos pela árvore de acessibilidade do SO — snapshot JSON com refs @id:eN, clique, digitação, seleção, menu, janela, clipboard e screenshot. Adaptado de vercel-labs/agent-desktop (Apache-2.0). Use para ver e operar um app de desktop nativo rodando — NÃO substitui o e2e com Playwright nem a agent-browser, que é a página web."
---

# Skill: `agent-desktop`

> **Quem invoca:** o `ux-design-specialist` (quando precisa **ver e operar** um
> app de desktop nativo, e não só a página web). É o agent que a carrega — o
> `code-reviewer` não a lista, e o binding do Claude Code (o symlink
> `~/.claude/skills/agent-desktop`) também aponta só para o `ux-design-specialist`.
>
> **Quando invocar:** quando a pergunta precisa do **app de desktop rodando** —
> a tela desenhou, o botão aceitou o clique, o campo gravou, o menu abriu, o
> erro apareceu onde deveria. Também para extrair dado de uma tela nativa e
> para QA exploratório.
>
> **Não invocar:** para **página web** — a `agent-browser` cobre o browser, e o
> e2e versionado do repo é Playwright (`apps/web/e2e/`), que a convenção
> `e2e-playwright.md` manda usar. Para **CI, Docker e container** — lá não há
> sessão gráfica nem bus de acessibilidade (§7). Para **e2e versionado de
> desktop** — o repo não tem suíte; esta skill é o **olhar avulso**, o mesmo
> contrato da `agent-browser`.

## §1. O que é

Uma **CLI** (nativa, Rust) que lê e opera apps de desktop pela **árvore de
acessibilidade do sistema operacional** — não por screenshot e não por
pixel-matching. A CLI **não é um agent**: o laço de observar → agir → verificar
roda em quem a chama.

Todo comando devolve **um envelope JSON**:

```json
{ "version": "2.6", "ok": true, "command": "snapshot", "data": { … } }
```

`ok: false` traz `error` com `code`, `message`, `details` e `disposition`.
Código de saída: `0` sucesso, `1` erro estruturado, `2` argumento inválido.

## §2. Instalar

```bash
npm install -g agent-desktop
```

> ⚠️ **npm ≥ 12 bloqueia o `postinstall`** por padrão, e o binário nativo não
> fica linkado: a CLI cai num launcher Node que acrescenta **~125 ms por
> chamada** e avisa a cada invocação. O install precisa do script aprovado:
>
> ```bash
> npm install -g agent-desktop --allow-scripts=agent-desktop
> ```
>
> MEDIDO 2026-11-09 com npm 12.2.0 / Node 24.15.0: sem a flag, `npm i -g`
> termina com exit `0` e **avisa** que o script ficou bloqueado — o install
> "passa" e a CLI fica mais lenta sem que nada falhe.

É uma CLI externa, fora do repo: **não** entra no `package.json` e não depende
de nenhum segredo. O binário vive no ambiente de quem vai usar.

## §3. Primeiro contato

```bash
agent-desktop status
agent-desktop permissions --guide   # guia de permissão do SO (macOS)
```

`status` devolve `platform`, `permissions`, `supported_surfaces` e `state_root`.
`supported_surfaces` **vazio** significa que o bus de acessibilidade não
respondeu — não que o desktop está vazio.

**O guia do sistema operacional vem do próprio binário, versionado com ele:**

```bash
agent-desktop skills get platform              # o que muda na sua plataforma
agent-desktop skills get desktop               # o laço, refs, retry
agent-desktop skills get desktop references/workflows.md
```

> A skill **não repete** a lista de flags nem o catálogo de comandos: `agent-desktop
> <comando> --help` é a fonte, e os guias do binário são a fonte do comportamento
> por plataforma. O que esta skill fixa é o **método** e o **contrato de
> entrega**, que é onde a automação erra.

## §4. O laço

Observar → agir → verificar. O `snapshot` **não** é o mesmo que o `screenshot`:
o primeiro devolve estrutura com refs; o segundo devolve pixels.

```bash
agent-desktop snapshot --skeleton --app "Notes" -i --compact   # mapa raso
agent-desktop snapshot --root @s8f3k2p9:e3 -i --compact        # desce numa região
agent-desktop click @s8f3k2p9:e12                              # age num ref qualificado
agent-desktop snapshot --root @s8f3k2p9:e3 -i --compact        # verifica: relê a região
```

- App pequeno dispensa esqueleto: `snapshot -i` inteiro basta.
- `-i` mantém só nós interativos; o rótulo de texto estático da linha some. Para
  saber a qual linha um botão repetido pertence, desce o container da linha com
  `--root` **sem** `-i`.
- `--root` **substitui** os refs que estavam dentro do drill — um ref velho ali
  volta `STALE_REF`. Fora da subárvore, os refs continuam válidos.
- `data.complete: false` significa **árvore parcial** (`truncated: true`): leia
  `complete` e NÃO espere `TIMEOUT`. Aumente `--timeout-ms` (default `3000`)
  ou desça com `--root`.
- `identity_unproven: true` significa que a janela não pôde ser lida inteira a
  tempo para provar a unicidade dos refs: refaça o snapshot com `--timeout-ms`
  maior **antes** de agir.
- App Chromium/Electron frio pode levar 10–25 s para expor a árvore web.
- **Nunca** faça esqueleto de uma *surface* (`--surface menu`, `sheet`,
  `alert`): ela já está focada.
- Ação que abre menu, sheet ou alert lista a surface em `data.surfaces`. O alvo
  seguinte é **aquela** surface.

**Espere por evento, não por tempo.** Depois de um passo assíncrono use
`wait` (`wait --window`, `wait --text`, `wait --element`, `wait --event`).
`sleep` é corrida.

## §5. Refs

- Ref qualificado: `@<snapshot_id>:e<N>` (ex.: `@s8f3k2p9:e1`). Um `@eN` solto
  devolve `INVALID_ARGS`.
- Vale **para um snapshot**. Depois de qualquer mudança de UI, refaça o snapshot
  da região afetada.
- Só elemento endereçável ganha ref: texto estático e container inerte ficam na
  árvore **sem** ref.
- O comando **reidentifica** o elemento antes de agir. No macOS o ref carrega o
  endereço do elemento, e gêmeos idênticos mantêm refs distintos. **No Windows
  e no Linux** o ref só resolve se o elemento era o **único** da janela com
  aquele papel, id nativo, nome e descrição, e exatamente um elemento vivo
  ainda casa. Gêmeo idêntico ali **não tem caminho por ref**: só
  `--headed mouse-click --xy X,Y` escolhe um — e sessão Wayland recusa.

## §6. Entrega e retry — a parte que não se negocia

A ação bem-sucedida reporta **o que aconteceu**, não só que rodou:

| Campo | Significado |
|---|---|
| `data.disposition.delivery` | `delivered_verified` (o efeito foi observado), `delivered_unverified` (o app disse que sim, sem mudança observável) |
| `data.post_state` | o estado do alvo depois da ação |
| `data.steps` | cada mecanismo tentado, em ordem, com `verified` |
| `data.surfaces` | overlays abertos quando a ação assentou |

**Regra única:** só repita (ou substitua) a ação quando `disposition.retry` é
`safe` **e** o delivery foi `not_delivered`. Qualquer outro valor de delivery
significa que a ação **pode ter landingsado** — repetir pode clicar, digitar ou
submeter duas vezes, e `toggle` pode se desfazer.

Quando o resultado não é seguro, **leia o estado vivo** (`get`, `is`, ou um
snapshot novo) e decida a partir dele. `details.post_state` ajuda quando vem.

- `set-value` e `type` verificam **o valor do elemento** — não o efeito no
  documento. Uma tabela que deveria ter crescido exige uma leitura independente.
- `check` e `uncheck` são idempotentes e verificam o estado final: prefira-os a
  `toggle`, que só serve quando o estado atual é desconhecido.
- `press` sempre entrega `delivered_unverified`: entrega não prova que o atalho
  fez o serviço. Espere o efeito com `--wait-for` / `--wait-for-gone`.

## §7. Erros que mudam a decisão

| Código | O que significa | O que fazer |
|---|---|---|
| `STALE_REF` (`saved_ref_absent`) | o elemento sumiu ou não casa mais | snapshot novo, ref novo |
| `AMBIGUOUS_TARGET` (`saved_ref_ambiguous`) | apareceu um elemento idêntico | aja num controle **único** na janela |
| `AMBIGUOUS_TARGET` (`identity_not_unique`) | o ref não foi provado único na captura | refaça o snapshot com `--timeout-ms` maior |
| `TIMEOUT` (`resolution_identity_unknown`) | a leitura viva não respondeu | **nada foi enviado** — pode repetir |
| `SNAPSHOT_NOT_FOUND` | o id do snapshot expirou | snapshot novo |
| `APP_NOT_FOUND` / `WINDOW_NOT_FOUND` | app não está rodando / janela não existe | `launch` / `list-windows` |
| `ACTION_FAILED` | a ação foi rejeitada ou contradita pelo resultado | leia `error.details.checks[]` |
| `ACTION_NOT_SUPPORTED` | o elemento não faz isso | outro comando |
| `POLICY_DENIED` | caminho físico/headed bloqueado | `--headed` se a intenção é input físico |
| `APP_UNRESPONSIVE` | a app travou depois de mutação incerta | snapshot novo; **espere** antes de repetir |
| `PERM_DENIED` | falta permissão do SO | `agent-desktop permissions --guide` |
| `INVALID_ARGS` | argumento errado | `--help` do comando |

**Branque no `error.code` e no `error.disposition`**, nunca no texto da
mensagem: mensagem e sugestão mudam de versão.

### Onde esta skill **não** roda

- **CI, Docker, container, `docker compose`**: sem sessão gráfica e sem bus
  de acessibilidade, `status` devolve `supported_surfaces` vazio e nenhum app
  aparece. Não tente — o `ux-design-specialist` perde tempo aqui.
- **Sessão Wayland no Linux**: o ponteiro não pode ser mirado. `hover`, `drag`,
  `double-click`, `triple-click` e `mouse-*` recusam com
  `ACTION_NOT_SUPPORTED`, e um gêmeo idêntico fica sem caminho por ref.

## §8. Headless e headed

A ação por ref é **headless** por padrão: usa chamada semântica de
acessibilidade, não move o cursor, não foca a janela, não sintetiza tecla, não
usa o clipboard. Se não existe caminho semântico, a ação **falha fechada**.

`--headed` é flag global (`agent-desktop --headed click @s8f3k2p9:e5`) e
significa **input físico** — exige que o usuário permita explicitamente
(double-click, hover, drag, foco). Nunca troque para headed para "recuperar"
uma falha headless: é assim que a automação vira efeito colateral no desktop do
usuário.

Coordenada crua (`--xy`) nunca implica foco.

## §9. O que muda por plataforma

| Plataforma | O que decide a execução |
|---|---|
| **Linux** | precisa de Ubuntu 24.04+, sessão gráfica **do usuário autenticado** e bus AT-SPI rodando. Rodar a CLI **dentro** da sessão alvo: bus, display e runtime directory vêm do ambiente dela. Um TTY, um SSH sem variáveis de sessão ou um container não vê app nenhum. `scroll` e gesto de ponteiro são input físico: Wayland recusa. `cmd`/`meta` é a tecla Super. |
| **macOS** | precisa da permissão de Accessibility (13+); `agent-desktop permissions --guide` abre o caminho. É a única plataforma onde gêmeo idêntico mantém ref próprio. |
| **Windows** | no PowerShell, **quote todo ref** (`'@s8f3k2p9:e1'`): `@token` solto é operador de splatting. Use `$env:NAME = 'value'` no lugar de `export`, e `| ConvertFrom-Json` no lugar de `$(...)`/`jq`. |

O guia completo, versionado com o binário, está em
`agent-desktop skills get platform`.

## §10. Fronteira com a `agent-browser`

| | `agent-browser` | `agent-desktop` |
|---|---|---|
| alvo | página **web** no browser | app **nativo** de desktop |
| água | CDP do Chromium | árvore de acessibilidade do SO |
| ref | `@eN` | `@<snapshot_id>:e<N>` |

Duas ferramentas, um contrato: as duas são **olhar avulso**, e o e2e versionado
do repo continua sendo Playwright (`apps/web/e2e/`).

## §11. Referências

- `agent-desktop skills get desktop` — o laço, os refs e as regras de retry,
  versionados com o binário.
- `agent-desktop skills get platform` — o que muda no SO onde a CLI roda.
- `agent-desktop skills get desktop references/workflows.md` — padrões
  prontos (formulário, menu, diálogo, esperar janela, scroll-find, drag) e a
  lista de anti-padrões.
- `agent-desktop <comando> --help` — as flags de um comando.

## Cross-references

- [`agent-browser`](../agent-browser/SKILL.md) — o irmão **web** desta skill.
- [`ui-review`](../ui-review/SKILL.md) — o processo de revisão de UI que
  consome o "olhar avulso" como evidência.
- [`e2e-playwright.md`](../../specs/conventions/e2e-playwright.md) — a porta de
  entrada versionada deste repo.
