/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * Fecha a regra de `AGENTS.md` §1.3: **este repo tem UMA pasta de tooling de
 * IA — `.agents/`.**
 *
 * ## O defeito que este gate fecha
 *
 * Até 2026-11-09 o repo carregava DUAS árvores paralelas: `.agents/` (canônica)
 * e `.claude/` (binding do Claude Code). A segunda existia por causa de uma
 * limitação real do Claude Code — e a limitação foi **medida**, não aceita:
 *
 * - **Sonda 1 (2026-11-09):** uma pasta contendo **só** `.agents/skills/
 *   probe-skill/SKILL.md` devolveu **zero** skills de projeto ao Claude Code
 *   2.1.319. A descoberta de skill de projeto é só em `.claude/skills/`.
 * - **Sonda 2 (2026-11-09):** a mesma pasta com `.claude` como **symlink** para
 *   `.agents` devolveu **30 skills e 28 agents** de projeto — os arquivos
 *   canônicos, sem wrapper nenhum.
 *
 * A sonda 2 é o achado que fecha a discussão: **o wrapper não era
 * necessário**. O `SKILL.md` canônico já tem `name` e `description` no
 * frontmatter, que é tudo que o harness lê para descobrir. Os 30 wrappers
 * eram cópias do frontmatter — a duplicação que este gate impede de voltar.
 *
 * ## As 2 regras, e por que cada uma existe
 *
 * 1. **NO DISCO** — a pasta de vendor existe na árvore de trabalho. Cobre o
 *    caso que mais importa: a ferramenta criou a pasta sozinha (o Claude Code
 *    cria `.claude/` ao rodar `/config`, `/hooks`, `/mcp`; o Cursor cria
 *    `.cursor/`). O `.gitignore` já a esconde do `git status`, então sem esta
 *    regra a pasta apareceria e **ninguém veria**. A **exceção**: a pasta que
 *    só tem o `settings.local.json` (permissão local da máquina).
 * 2. **VERSIONADA** — algum path sob a pasta de vendor está no **índice** do
 *    git. Cobre o commit que já aconteceu: a pasta foi removida do disco, mas
 *    o índice ainda a carrega, e o próximo `git commit` publica arquivos que
 *    ninguém editou.
 *
 * As duas regras medem a raiz do **repo** — `git rev-parse --show-toplevel` —
 * e não o diretório de onde o gate foi chamado.
 *
 * ## O que este gate NÃO mede
 *
 * - **O conteúdo de `.agents/`** — a cobertura da camada de skills é do
 *   `check-skill-coverage`; a existência da pasta é deste gate.
 * - **O binding na máquina** — o Claude Code descobre as skills por
 *   `~/.claude/skills/` (symlink para `.agents/skills/<nome>`), que fica
 *   **fora** do repo e é por isso que não há regra sobre ele aqui.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { linhasDoRelato, type CheckResult } from './check-types';

/**
 * As pastas de vendor que **não** podem existir neste repo.
 *
 * A lista é a fonte única: `AGENTS.md` §1.3 manda "só pode existir
 * `.agents/`", e esta lista é a forma mensurável dessa frase.
 *
 * **Por que só `.claude` e não as outras.** As pastas dos outros vendors
 * (`.cursor/`, `.windsurf/`, `.continue/`, …) são criadas **de propósito** por
 * quem usa aquela ferramenta, e as receitas que mandam criá-las estão em
 * [`docs/integrations/`](../../../docs/integrations/) — proibi-las aqui
 * reprovaria um projeto derivado que seguiu a receita. O `.claude/` é
 * diferente: ele nasce **sozinho** (o Claude Code cria a pasta ao rodar
 * `/config`, `/hooks`, `/mcp`) e ele era, até 2026-11-09, uma **cópia** da
 * árvore canônica — 29 wrappers de skill e 3 de agent que repetiam o
 * `name`/`description` que o arquivo canônico já tinha. É a duplicata que
 * esta regra existe para impedir de voltar.
 *
 * O `.github/` **não** entra: ele é do GitHub, não da ferramenta, e o repo usa
 * `.github/` para os workflows.
 */
export const PASTAS_DE_VENDOR: readonly string[] = ['.claude'];

/**
 * O arquivo que o Claude Code escreve no projeto e que **não** é cópia da
 * árvore canônica.
 *
 * `settings.local.json` é o registro local de permissões: quando o usuário
 * aprova uma permissão com "não perguntar de novo", o Claude Code grava
 * esse arquivo em `.claude/`. Ele é estado da **máquina**, não uma segunda
 * árvore de definição — e reprovar ele deixaria o pre-push vermelho em
 * qualquer máquina que usa o Claude Code neste repo.
 */
export const ARQUIVO_LOCAL_PERMISSOES = 'settings.local.json';

/** Onde a regra mora, para a mensagem apontar o caminho certo. */
export const REGRA = 'AGENTS.md §1.3';

/** Uma pasta de vendor que não deveria existir. */
export interface LacunaPasta {
  /** O nome da pasta (`".claude"`). */
  pasta: string;
  /** Qual regra foi violada. */
  regra: 'no-disco' | 'versionada';
  /** Detalhe legível do problema. */
  detalhe: string;
}

/**
 * As lacunas, a partir do que foi medido.
 *
 * Separado de {@link checkPastaUnica} para que o spec possa exercitar a
 * reconciliação sem passar pelo disco — e porque a função é a que o **dente**
 * mede.
 *
 * @param pastasNoDisco as pastas de vendor que existem na árvore de trabalho.
 * @param pathsVersionados os paths do índice do git, ou `null` quando o git
 *   não pôde ser lido (a regra VERSIONADA fica sem medir).
 */
export function lacunasDePasta(
  pastasNoDisco: string[],
  pathsVersionados: string[] | null,
): LacunaPasta[] {
  const lacunas: LacunaPasta[] = [];

  for (const pasta of pastasNoDisco) {
    lacunas.push({
      pasta,
      regra: 'no-disco',
      detalhe:
        `a pasta '${pasta}/' existe na árvore de trabalho — este repo tem UMA ` +
        `pasta de tooling de IA, e ela é '.agents/' (${REGRA}). O conteúdo dela ` +
        `é migrado para '.agents/' (ou para '~/.claude/' da máquina, no caso do ` +
        `binding do Claude Code) e a pasta é removida.`,
    });
  }

  if (pathsVersionados !== null) {
    for (const path of pathsVersionados) {
      const barra = path.indexOf('/');
      const pasta = barra === -1 ? path : path.slice(0, barra);
      if (!PASTAS_DE_VENDOR.includes(pasta)) continue;
      lacunas.push({
        pasta,
        regra: 'versionada',
        detalhe:
          `o path '${path}' está no índice do git — o próximo commit publica ` +
          `arquivo de uma pasta de vendor que não pode existir neste repo ` +
          `(${REGRA}). Remova-o do índice: 'git rm --cached ${path}'.`,
      });
    }
  }

  // A ordem das mensagens é estável: primeiro a regra NO DISCO, na ordem da
  // lista; depois a VERSIONADA, em ordem alfabética de path. Duas execuções
  // produzem a mesma saída, e uma mensagem que reordena não é diffável.
  const ordem: Record<LacunaPasta['regra'], number> = { 'no-disco': 0, versionada: 1 };
  return lacunas.sort(
    (a, b) =>
      ordem[a.regra] - ordem[b.regra] ||
      a.pasta.localeCompare(b.pasta) ||
      a.detalhe.localeCompare(b.detalhe),
  );
}

/**
 * As pastas de vendor que existem na árvore de trabalho.
 *
 * `lstat` — não `stat`: um **symlink** para fora do repo também é a pasta de
 * vendor aparecendo, e `stat` seguiria o link e mediria o destino.
 */
/**
 * A raiz do repo —independentemente de onde o gate foi chamado.
 *
 * `git ls-files` e o `lstat` são relativos ao **cwd**: rodando de um
 * subdiretório, o gate media só aquela subárvore (MEDIDO 2026-11-09: de
 * `apps/api`, o `ls-files` devolve 284 paths em vez dos 1276 da raiz, e a
 * pasta `.claude/` da raiz não é vista). Um gate que fica **mudo** quando
 * roda de outro lugar é a classe 5 de `guard-classes.md`.
 *
 * O `git rev-parse --show-toplevel` é a fonte; sem git, o `repoRoot` que
 * chegou é o que há.
 */
export function raizDoRepo(repoRoot: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const raiz = out.trim();
    return raiz === '' ? path.resolve(repoRoot) : raiz;
  } catch {
    return path.resolve(repoRoot);
  }
}

/**
 * As pastas de vendor que existem na árvore de trabalho.
 *
 * A pasta `.claude/` com **só** o `settings.local.json` **não** é violação:
 * esse arquivo é o registro local de permissões que o Claude Code escreve
 * no projeto quando o usuário aprova uma permissão ("não perguntar de novo"),
 * e ele NÃO é uma cópia da árvore canônica — é estado da máquina. Sem a
 * exceção, o gate reprovaria o pre-push de quem usa o Claude Code neste
 * repo, e o remédio ("apague a pasta") apagaria as permissões.
 */
export async function listarPastasDeVendor(repoRoot: string): Promise<string[]> {
  const achadas: string[] = [];
  for (const pasta of PASTAS_DE_VENDOR) {
    const alvo = path.join(repoRoot, pasta);
    try {
      const st = await fs.lstat(alvo);
      if (!st.isDirectory()) {
        achadas.push(pasta);
        continue;
      }
      const entradas = await fs.readdir(alvo);
      const somenteLocal = entradas.every((e) => e === ARQUIVO_LOCAL_PERMISSOES);
      if (!somenteLocal) achadas.push(pasta);
    } catch {
      // não existe — que é o estado esperado
    }
  }
  return achadas;
}

/**
 * Os paths versionados no índice do git, ou `null` quando o git não pôde ser
 * lido.
 *
 * `null` é "não medi" — e é diferente de `[]` ("medi e não achei"). O gate
 * distingue os dois: com `null`, a regra VERSIONADA é declarada como não
 * medida, e não como "verde".
 */
export function listarVersionados(repoRoot: string): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '-z'], {
      cwd: raizDoRepo(repoRoot),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

export async function checkPastaUnica(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = raizDoRepo(opts.repoRoot);

  const pastasNoDisco = await listarPastasDeVendor(root);
  const pathsVersionados = listarVersionados(root);

  const lacunas = lacunasDePasta(pastasNoDisco, pathsVersionados);

  const errors = lacunas.map((l) => `pasta de vendor [${l.regra}] ${l.pasta}: ${l.detalhe}`);

  const advisories: string[] = [];
  if (pathsVersionados === null) {
    advisories.push(
      'o índice do git não pôde ser lido — a regra VERSIONADA não foi medida ' +
        '(só a NO DISCO foi). Um path de vendor já commitado escaparia deste gate.',
    );
  }

  return { ok: errors.length === 0, errors, advisories };
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-pasta-unica.ts')) {
  checkPastaUnica({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
