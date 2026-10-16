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
 * Fecha a lacuna documentada em `ci-defense-in-depth.md` §"A armadilha de
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
 *
 * O que este gate NÃO pega (vide `guard-classes.md` §3, classe 1):
 * intenção errada sem ocorrência no repo. Se o caminho certo também não
 * existe, este gate não distingue "rule incorreta" de "rule describing
 * something absent". O diferencial contra o repo real é o que prova.
 */
export async function checkHarnessLocation(opts: { repoRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);

  // (1) check-*.ts NÃO pode estar em tooling/scripts/
  try {
    const saida = execSync('git ls-files tooling/scripts/check-*.ts', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const vazamentos = saida
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const v of vazamentos) {
      errors.push(
        `harness check-* fora do lugar: '${v}' está em tooling/scripts/, mas gates vivem em .tooling/scripts/ci/`,
      );
    }
  } catch {
    // git não disponível ou repo sem history — sem `git ls-files` este sub-check é pulado.
  }

  // (2) lint-*.ts e *-gate.ts NÃO podem estar em .tooling/scripts/ci/
  try {
    const saida = execSync('git ls-files .tooling/scripts/ci/', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const arquivos = saida
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const arq of arquivos) {
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
  } catch {
    // mesmo motivo de (1)
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

  return { ok: errors.length === 0, errors };
}
