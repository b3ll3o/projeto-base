/**
 * SEM shebang, de propósito.
 *
 * Fecha uma lacuna que MEDI em 2026-11-09: o `check-ci-action-pinning` confere
 * **só o formato** do SHA (40 hex) e que a action está pinada. O
 * **comentário de versão** — que é o que o HumansONS do GitHub mostra ao
 * humano que aprova o PR — **não é medido por ninguém**.
 *
 * O próprio `.github/dependabot.yml` admite a lacuna:
 *
 *   "Ele NÃO resolve a tag, NÃO tem rede, e NÃO exige o comentário `# v4`."
 *
 * MEDIDO 2026-11-09 nos 5 PRs do Dependabot: 4 comentarios batem com a major
 * do pin proposto; **1 erra** — o PR #154 sobe `pnpm/action-setup` para
 * **6.1.1** e deixa o comentario `# v3`. O CI passa (o SHA está pinado, o
 * formato está certo) e o humano lê "v3" na interface do GitHub.
 *
 * Isto não é cosmético. O pin por SHA é o que fecha o supply chain; o
 * comentario é o que dá **legibilidade** ao pin. Um comentário que mente
 * ensina o aprovador a desconfiar do pin.
 *
 * Duas regras:
 * 1. **O comentario tem que dizer a major do pin.** A fonte da verdade do
 *    "o que está pinado" é a tabela versionada
 *    `.tooling/scripts/ci/ci-action-pins.json` — o gate confere o comentario
 *    do workflow contra ela.
 * 2. **A mesma action não pode estar pinada em SHAs diferentes** em workflows
 *    diferentes. Dois pins da mesma action = duas versões em produção, e
 *    nenhum gate media isso.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type CheckResult, linhasDoRelato } from './check-types';

/** Um `uses:` de action de terceiro encontrado num workflow. */
export interface UsoDeAction {
  arquivo: string;
  linha: number;
  /** `owner/repo` */
  action: string;
  /** o SHA pinado */
  sha: string;
  /** o comentario de versao declarado, se houver */
  comentario?: string;
  /** a linha crua */
  bruto: string;
}

/** Um pin declarado na tabela versionada. */
export interface PinDeclarado {
  action: string;
  sha: string;
  /** a versao que o comentario deve dizer (ex.: 'v7.0.1') */
  versao: string;
  /** o que a action faz no repo */
  papel?: string;
}

/** A tabela de pins: fonte da verdade do que o repo pinou. */
export const ARQUIVO_PINS = path.join('.tooling', 'scripts', 'ci', 'ci-action-pins.json');

/**
 * Extrai os `uses:` de action de terceiro de um workflow.
 *
 * Filtra:
 * - `uses: ./local` — action local do repo, não é terceira parte;
 * - `uses: docker://imagem` — é uma imagem, e a regra dela é digesta (o
 *   `check-ci-action-pinning` já trata).
 */
export function extrairUsos(conteudo: string, arquivo: string): UsoDeAction[] {
  const out: UsoDeAction[] = [];
  const linhas = conteudo.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i]!.match(/uses:\s*([^\s#]+)(?:\s*#\s*(.*))?$/);
    if (!m) continue;
    const alvo = m[1]!;
    if (alvo.startsWith('./') || alvo.startsWith('docker://')) continue;
    if (!alvo.includes('@')) continue;
    const [action, sha] = alvo.split('@');
    if (!action || !sha) continue;
    out.push({
      arquivo,
      linha: i + 1,
      action,
      sha,
      ...(m[2]?.trim() ? { comentario: m[2].trim() } : {}),
      bruto: linhas[i]!,
    });
  }
  return out;
}

/** A major do comentario (`v7.0.1` → 7). `null` se não houver major. */
export function majorDoComentario(comentario: string | undefined): number | null {
  if (!comentario) return null;
  const m = comentario.match(/^v?(\d+)(?:\.\d+)*/);
  if (!m) return null;
  return Number(m[1]);
}

/** A major da versao declarada (`v7.0.1` → 7, `7.0.1` → 7). */
export function majorDaVersao(versao: string): number | null {
  const m = versao.match(/^v?(\d+)(?:\.\d+)*/);
  if (!m) return null;
  return Number(m[1]);
}

/** Lê a tabela de pins. */
export async function lerPins(repoRoot: string): Promise<PinDeclarado[]> {
  try {
    const raw = await fs.readFile(path.join(repoRoot, ARQUIVO_PINS), 'utf-8');
    const dados = JSON.parse(raw) as { pins?: PinDeclarado[] };
    return dados.pins ?? [];
  } catch {
    return [];
  }
}

/** Lista os workflows do repo. */
export async function listarWorkflows(repoRoot: string): Promise<string[]> {
  const dir = path.join(repoRoot, '.github', 'workflows');
  try {
    const entradas = await fs.readdir(dir, { withFileTypes: true });
    return entradas
      .filter((e) => e.isFile() && /\.ya?ml$/.test(e.name))
      .map((e) => path.join('.github', 'workflows', e.name))
      .sort();
  } catch {
    return [];
  }
}

export async function checkActionVersionComment(opts: {
  repoRoot: string;
  workflows?: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);

  const workflows = opts.workflows ?? (await listarWorkflows(root));
  if (workflows.length === 0) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: "nenhum workflow encontrado em '.github/workflows'",
    };
  }

  const usos: UsoDeAction[] = [];
  for (const wf of workflows) {
    try {
      const conteudo = await fs.readFile(path.join(root, wf), 'utf-8');
      usos.push(...extrairUsos(conteudo, wf));
    } catch {
      advisories.push(`'${wf}' não pôde ser lido — a cobertura deste gate ficou menor`);
    }
  }

  if (usos.length === 0) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: 'nenhum `uses:` de action de terceiro encontrado nos workflows',
    };
  }

  const pins = await lerPins(root);
  const porAction = new Map(pins.map((p) => [p.action, p]));

  // Regra 1 — o comentario tem que dizer a major do pin declarado.
  for (const uso of usos) {
    const pin = porAction.get(uso.action);
    if (!pin) {
      errors.push(
        `action '${uso.action}' (${uso.arquivo}:${uso.linha}) está pinada mas **não está declarada** ` +
          `em '${ARQUIVO_PINS}'. A tabela é a fonte da verdade do que o repo pinou — declare-a ` +
          `com o SHA e a versão, para que o comentario possa ser conferido.`,
      );
      continue;
    }

    if (uso.sha !== pin.sha) {
      errors.push(
        `SHA divergente: '${uso.action}' está pinada em '${uso.sha}' (${uso.arquivo}:${uso.linha}) ` +
          `mas a tabela '${ARQUIVO_PINS}' declara '${pin.sha}'. Uma action em duas versões ao mesmo ` +
          `tempo é o que o pin por SHA existe para evitar.`,
      );
      continue;
    }

    if (!uso.comentario) {
      errors.push(
        `comentário de versão ausente: '${uso.action}' (${uso.arquivo}:${uso.linha}) está pinada sem ` +
          `comentário. O HumansONS do GitHub mostra o comentario — sem ele, o aprovador não sabe ` +
          `o que está rodando.`,
      );
      continue;
    }

    const majorComentario = majorDoComentario(uso.comentario);
    const majorEsperado = majorDaVersao(pin.versao);
    if (majorComentario === null) {
      errors.push(
        `comentário de versão ilegível: '${uso.action}' (${uso.arquivo}:${uso.linha}) tem o comentario ` +
          `'${uso.comentario}', que não começa com uma versao (ex.: '# v7.0.1').`,
      );
      continue;
    }
    if (majorEsperado !== null && majorComentario !== majorEsperado) {
      errors.push(
        `comentário mente: '${uso.action}' (${uso.arquivo}:${uso.linha}) está pinada em ` +
          `${pin.versao} (major ${majorEsperado}) mas o comentario diz '# ${uso.comentario}' ` +
          `(major ${majorComentario}). O HumansONS do GitHub mostra o comentario — quem aprova lê ` +
          `a versão errada.`,
      );
    }
  }

  // Regra 2 — a mesma action nao pode estar em SHAs diferentes.
  const porActionSha = new Map<string, Map<string, string[]>>();
  for (const uso of usos) {
    const shas = porActionSha.get(uso.action) ?? new Map<string, string[]>();
    const onde = shas.get(uso.sha) ?? [];
    onde.push(`${uso.arquivo}:${uso.linha}`);
    shas.set(uso.sha, onde);
    porActionSha.set(uso.action, shas);
  }
  for (const [action, shas] of porActionSha) {
    if (shas.size < 2) continue;
    const detalhe = [...shas.entries()]
      .map(([sha, onde]) => `${sha.slice(0, 8)} (${onde.join(', ')})`)
      .join('  x  ');
    errors.push(
      `a mesma action em SHAs diferentes: '${action}' aparece em ${shas.size} pins distintos — ` +
        `${detalhe}. Duas versões da mesma action em producao, sem nenhum gate que visse.`,
    );
  }

  // Uma action na tabela que nao aparece em nenhum workflow envelheceu.
  const usadas = new Set(usos.map((u) => u.action));
  for (const pin of pins) {
    if (usadas.has(pin.action)) continue;
    errors.push(
      `pin envelhecido: '${pin.action}' está declarada em '${ARQUIVO_PINS}' mas não aparece em ` +
        `nenhum workflow. Ou a action saiu de uso e a linha tem que sair da tabela, ` +
        `ou o workflow que a usa sumiu.`,
    );
  }

  return { ok: errors.length === 0, errors, advisories };
}

// Executado como CLI.
//
// `check{...}` é **assíncrono**, então o bloco usa `.then()` — o mesmo padrão
// de `check-skill-coverage.ts`. Um `const r = check{...}(...)` sem `await`
// daria `r.ok === undefined` e sairia **1** sempre.
//
// Sem este bloco, rodar o gate pela linha de comando não mede nada: ele
// importa o módulo, não chama a função, e sai **0** — o verde-por-ignorância
// que `guard-classes.md` chama de classe 5. MEDIDO 2026-11-09: as 3 mutações
// que deveriam reprovar este gate passavam com exit 0 por causa deste bloco
// ausente.
if (process.argv[1]?.endsWith('check-action-version-comment.ts')) {
  checkActionVersionComment({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
