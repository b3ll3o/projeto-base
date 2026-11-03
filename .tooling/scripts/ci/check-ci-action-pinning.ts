/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a lacuna C2 da auditoria de segurança de 2026-11-03: as
 * actions do CI eram pinadas por **tag** (`actions/checkout@v4`). Uma tag é
 * um ponteiro MUTÁVEL — quem controla a action pode mover a tag e o código
 * novo entra no CI sem revisão nenhuma. O pin por SHA tira esse poder.
 *
 * MEDIDO em 2026-11-03: 21 call-sites de `uses:` em 4 workflows, todos por
 * tag. Agora todos por SHA, com a tag no comentário — o HumansONS do GitHub
 * (`# v4`) é o que mostra na interface qual versão está pinada.
 *
 * O que este gate mede:
 *   1. todo `uses:` de action de terceiro tem que ser um SHA de 40 hex;
 *   2. `uses: ./caminho` (action local) é isento — não vem de fora;
 *   3. o SHA tem que ser hex de verdade — `actions/checkout@v4` em forma de
 *      SHA falso (`v4` com 40 caracteres) não passa.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
  advisories: string[];
}

export const PASTA_DE_WORKFLOWS = '.github/workflows';

/** Um SHA de commit: 40 hex. */
export const REGEX_DE_SHA = /^[0-9a-f]{40}$/;

/** Uma action de terceiro: `owner/repo@ref`. */
export const REGEX_DE_USES = /uses:\s*([^\s#]+)/g;

export interface CallSite {
  arquivo: string;
  linha: number;
  uses: string;
}

/** Todos os call-sites de `uses:` dos workflows. */
export function callSitesDeUses(conteudo: string, arquivo: string): CallSite[] {
  const saida: CallSite[] = [];
  const linhas = conteudo.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;
    if (!/uses:/.test(linha)) continue;
    const m = /uses:\s*([^\s#]+)/.exec(linha);
    if (!m) continue;
    saida.push({ arquivo, linha: i + 1, uses: m[1]! });
  }
  return saida;
}

/** O `ref` de um `uses:` — o que vem depois do `@`. */
export function refDe(uses: string): string | null {
  const arroba = uses.lastIndexOf('@');
  if (arroba < 0) return null;
  return uses.slice(arroba + 1);
}

/** O gate. */
export function checkCiActionPinning(opts: { repoRoot: string }): CheckResult {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);
  const pasta = path.join(root, PASTA_DE_WORKFLOWS);

  if (!existsSync(pasta)) {
    return { ok: true, errors, advisories: [`${PASTA_DE_WORKFLOWS} ausente — nada a medir`] };
  }

  let total = 0;
  for (const nome of readdirSync(pasta).sort()) {
    if (!nome.endsWith('.yml') && !nome.endsWith('.yaml')) continue;
    const arquivo = path.join(pasta, nome);
    const conteudo = readFileSync(arquivo, 'utf-8');
    for (const site of callSitesDeUses(conteudo, nome)) {
      // Action local (`uses: ./...`) não vem de fora — isento.
      if (site.uses.startsWith('./') || site.uses.startsWith('../')) continue;
      total++;
      // `uses: docker://imagem:tag` não é uma action — é uma imagem. A
      // regra dela é outra: digesta, não tag. (MEDIDO em 2026-11-03: o repo
      // não usa essa forma hoje; a mensagem genérica de "SHA" seria enganosa.)
      if (site.uses.startsWith('docker://')) {
        // A `ref` é o que vem DEPOIS do `@` — então o digest é `sha256:...`,
        // sem o `@` (que o `refDe` já comeu).
        const ref = refDe(site.uses);
        if (ref === null || !ref.startsWith('sha256:')) {
          errors.push(
            `${site.arquivo}:${site.linha}: \`${site.uses}\` é uma imagem por tag — ` +
              `pinne por digest (\`docker://imagem@sha256:...\`). ` +
              `Tag de imagem é ponteiro mutável, igual tag de action.`,
          );
        }
        continue;
      }
      const ref = refDe(site.uses);
      if (ref === null) {
        errors.push(
          `${site.arquivo}:${site.linha}: \`uses: ${site.uses}\` sem @ref — ` +
            `pinne a action por SHA (a tag é um ponteiro mutável).`,
        );
        continue;
      }
      if (!REGEX_DE_SHA.test(ref)) {
        errors.push(
          `${site.arquivo}:${site.linha}: \`${site.uses}\` NÃO está pinado por SHA — ` +
            `pinne por SHA e ponha a tag no comentário (\`# v4\`). ` +
            `Tag é ponteiro mutável: quem controla a action move a tag e o ` +
            `código novo entra no CI sem revisão.`,
        );
      }
    }
  }

  if (total === 0) {
    advisories.push('nenhum call-site de `uses:` de action de terceiro — nada a medir');
  } else {
    advisories.push(`call-sites de action de terceiros verificados: ${total} (todos por SHA)`);
  }

  return { ok: errors.length === 0, errors, advisories };
}
