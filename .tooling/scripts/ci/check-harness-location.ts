/**
 * SEM shebang, de propósito — ver preflight-gates.ts para a justificativa
 * (este módulo é importado, não executado).
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Fecha a lacuna documentada em `ci-defense-in-depth-dentes.md` §"A armadilha de
 * ler este registro por nome de arquivo": `tooling/` e `.tooling/` são
 * DOIS diretórios distintos. Os gates vivem em `.tooling/scripts/ci/`, o
 * lint de roteamento em `tooling/scripts/`. Convenção tácita, sem gate.
 *
 * O que este gate afirma:
 * 1. Nenhum arquivo `check-*.ts` vive em `tooling/scripts/` — o sufixo
 *    `check-` é exclusivo do diretório de gates.
 * 2. Nenhum arquivo `lint-*.ts` ou `*-gate.ts` vive em `.tooling/scripts/ci/`
 *    — esses são o namespace do `tooling/scripts/`.
 * 3. Toda entry de `PREFLIGHT_CHECKS` em `preflight-gates.ts` aponta para
 *    um arquivo que existe no disco (fecha a classe 1 de
 *    `guard-classes.md` — "condição inalcançável" — para o caso do
 *    `preflight-gates.ts` declarar um path que ninguém criou).
 * 4. Nenhum `check-*.ts` vive em SUBDIRETÓRIO de `.tooling/scripts/ci/`.
 *    O preflight descobre os gates por glob PLANO, então um subdir é
 *    sombreado: o gate continua registrado em `PREFLIGHT_CHECKS` (que aponta
 *    por path explícito e continua verde) e some da varredura por glob.
 *
 *    MEDIDO 2026-10-16: os três primeiros sub-checks não olhavam subdir, e
 *    o nome do gate no painel já prometia "sem subdirs" — o guard prometia
 *    pegar uma forma que ele não media. Plantar
 *    `.tooling/scripts/ci/sub/check-subdir-fantasma.ts` passava limpo por
 *    este gate E por `check-harness-owner` — a razão NÃO é o `readdirSync`
 *    dele (`check-harness-owner.ts:128` filtra `base.startsWith('check-')`
 *    POR NOME, então um `check-*` nunca entra na lista dele, na raiz ou em
 *    subdir; medido). Quem depurar pelo motivo errado instrumenta o gate
 *    errado.
 *
 * O que este gate NÃO pega (vide `guard-classes.md` §3, classe 1):
 * intenção errada sem ocorrência no repo. Se o caminho certo também não
 * existe, este gate não distingue "rule incorreta" de "rule describing
 * something absent". O diferencial contra o repo real é o que prova.
 */
export async function checkHarnessLocation(opts: { repoRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);

  /**
   * Os sub-checks (1), (2) e (4) dependem de `git ls-files`. Sem `git` — ou sem
   * history — os três caem juntos, e o `catch {}` vazio de cada um devolvia
   * `ok:true` sem ter medido nada: a §4 de `guard-classes.md` ("quem não pode
   * ser comparado é RECLASSIFICADO, nunca apagado") num gate que nem é do diff
   * desta branch. MEDIDO 2026-10-19: mesma árvore, mesmo argv, só o `git`
   * trocado por um stub que sai com 1 → `{"ok":true,"errors":[]}` com um
   * `tooling/scripts/check-vazado.ts` violando a regra (1) plantado, e o
   * painel imprimindo `✓`.
   *
   * `[]` é "medi e não achei"; `null` é "não medi". Os `?? []` nos laços não
   * apagam a diferença porque a contagem vive separada, em `semGit`, e sai no
   * `reason` do `skipped`.
   */
  const semGit: string[] = [];
  const lsFiles = (pathspec: string): string[] | null => {
    try {
      return execSync(`git ls-files --cached --others --exclude-standard ${pathspec}`, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } catch (err) {
      // MEDIDO 2026-10-19: `String(err).split('\n')[0]` devolvia só "Error:
      // Command failed: git ls-files … <pathspec>" — que repete o pathspec que
      // já está 20 caracteres antes e joga fora a CAUSA, que vive em
      // `err.stderr`. Três causas distintas (git ausente, não é repo, índice
      // corrompido) saíam idênticas, e um skip que não diz por que não mediu é
      // o `✓` de novo com outro formato.
      const causa =
        (err as { stderr?: Buffer | string }).stderr?.toString().trim().split('\n')[0] || '';
      semGit.push(causa ? `${pathspec} — ${causa}` : `${pathspec} (sem causa: git ausente?)`);
      return null;
    }
  };

  // (1) check-*.ts NÃO pode estar em tooling/scripts/
  for (const v of lsFiles('tooling/scripts/check-*.ts') ?? []) {
    errors.push(
      `harness check-* fora do lugar: '${v}' está em tooling/scripts/, mas gates vivem em .tooling/scripts/ci/`,
    );
  }

  // (2) lint-*.ts e *-gate.ts NÃO podem estar em .tooling/scripts/ci/
  for (const arq of lsFiles('.tooling/scripts/ci/') ?? []) {
    const base = path.basename(arq);
    if (
      base.startsWith('lint-') ||
      base.endsWith('-gate.ts') ||
      base === 'lint-review-routing.ts'
    ) {
      errors.push(
        `harness fora do lugar: '${arq}' está em .tooling/scripts/ci/, mas o sufixo 'lint-'/'*-gate' é exclusivo de tooling/scripts/`,
      );
    }
  }

  // (3) Toda entry de PREFLIGHT_CHECKS aponta para arquivo que existe
  // O `await import` falha em CJS-via-tsx com paths absolutos (devolve
  // `data:` URL que o resolver ESM recusa). Usamos `createRequire` que
  // resolve absoluto em CommonJS sem essa restrição.
  try {
    const gatesPath = path.join(root, '.tooling/scripts/ci/preflight-gates.ts');
    if (!existsSync(gatesPath)) {
      errors.push(
        `preflight-gates.ts não encontrado em '${gatesPath}' — gate não pode afirmar a paridade`,
      );
    } else {
      const req = createRequire(import.meta.url);
      const mod = req(gatesPath) as { PREFLIGHT_CHECKS?: Array<{ name: string; file: string }> };
      const gates = mod.PREFLIGHT_CHECKS ?? [];
      for (const g of gates) {
        const fullPath = path.join(root, g.file);
        if (!existsSync(fullPath)) {
          errors.push(
            `preflight-gates.ts declara '${g.name}' apontando para '${g.file}', mas o arquivo NÃO EXISTE no disco`,
          );
        }
      }
    }
  } catch (err) {
    errors.push(`falha ao validar paridade preflight-gates ↔ disco: ${err}`);
  }

  // (4) Nenhum check-*.ts em SUBDIRETÓRIO de .tooling/scripts/ci/
  // `git ls-files` devolve o path RELATIVO, então `sub/` aparece como
  // segmento do caminho — é isso que diferencia "na raiz" de "sombreado".
  for (const arq of lsFiles('.tooling/scripts/ci/') ?? []) {
    if (!arq.endsWith('.ts') || arq.endsWith('.spec.ts')) continue;
    // `dirname` devolve `.` para quem está na raiz — o `!==` é o filtro
    // que separa "na raiz" de "sombreado", e sem ele TODO check-*.ts do
    // diretório seria acusado (o spec pegou isso antes do push).
    if (path.dirname(arq) === '.tooling/scripts/ci') continue;
    if (path.basename(arq).startsWith('check-')) {
      errors.push(
        `harness em subdir: '${arq}' está em subdiretório de .tooling/scripts/ci/, ` +
          `mas o preflight descobre gates por glob PLANO — o arquivo fica sombreado ` +
          `(registrado em PREFLIGHT_CHECKS e verde, invisível na varredura)`,
      );
    }
  }

  // `ok` e `skipped` são independentes por contrato (`check-types.ts`): um erro
  // de (3) continua erro mesmo com o resto pulado, e `formatMark` troca o `✓`
  // por `–` para que ninguém leia um painel verde como "verifiquei e passei".
  if (semGit.length > 0) {
    return {
      ok: errors.length === 0,
      errors,
      skipped: true,
      reason:
        `${semGit.length} varredura(s) por \`git ls-files\` NÃO rodaram — os ` +
        `sub-checks (1), (2) e (4) deste gate não mediram nada, então o que ` +
        `sobrou é metade do que o nome dele afirma: ${semGit.join(' · ')}`,
    };
  }

  return { ok: errors.length === 0, errors };
}
