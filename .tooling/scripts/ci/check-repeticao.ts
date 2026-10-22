// .tooling/scripts/ci/check-repeticao.ts
//
// Gate da regra DRY (parte 1): **termo de domínio com UM dono**.
//
// Exit: 0 = ok, 1 = erro.
//
// ⚠️ O QUE ESTE GATE NÃO FAZ: ele NÃO mede "quantos literais repetem no
// repo". A árvore inteira tem 134 literais repetidos em 3+ arquivos de
// produção, e quase todos são import path, classe de CSS ou nome de
// framework — enumerá-los numa lista de exceções seria insustentível, e um
// gate que mantém 134 exceções vivas é um gate que ninguém lê.
//
// ⚠️ O QUE ELE FAZ: mede os termos **DECLARADOS** em `dry-termos.json` —
// a declaração é a revisão, e o gate é a cobrança. Um termo declarado que
// NINGUÉM mais hardcodeia passa a `estado: 'ok'`; a partir daí, voltar a
// hardcodar é erro.
//
// Um termo em `estado: 'declarado'` é DÍVIDA CONHECIDA: o gate a publica como
// ressalva (com o motivo), e ela sai da lista quando a fase do plano pagar.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { CheckResult } from './check-types.js';
import { removeComentarios, varreArquivos } from '../../../tooling/scripts/analisa-repeticao.js';

export interface TermoDeclarado {
  /** O texto que é termo de domínio. */
  valor: string;
  /** O arquivo que é o DONO do termo. */
  dono: string;
  /** A constante que o dono deve exportar. */
  constante: string;
  /** `ok` = ninguém hardcodeia; `declarado` = dívida declarada. */
  estado: 'ok' | 'declarado';
  /** Por que a dívida existe. */
  motivo?: string;
}

export interface Declaracao {
  termos: TermoDeclarado[];
}

export const ARQUIVO_DECLARACAO = 'dry-termos.json';

/** As raízes de código de produção (specs fora — ver a convenção). */
export const RAIZES_PRODUCAO = [
  'apps/api/src',
  'apps/web/app',
  'apps/web/lib',
  'apps/web/components',
  'packages/shared-types/src',
];

export function carregaDeclaracao(repoRoot: string): Declaracao {
  const caminho = join(repoRoot, '.tooling', 'scripts', 'ci', ARQUIVO_DECLARACAO);
  const cru = JSON.parse(readFileSync(caminho, 'utf8')) as Declaracao;
  return { termos: cru.termos ?? [] };
}

/**
 * Os arquivos de PRODUÇÃO que carregam um literal.
 *
 * ⚠️ Specs ficam de fora, e o motivo é o DENTE: um spec que AFIRMA o valor
 * do termo escreve o literal de propósito — se ele importasse a constante,
 * o teste passaria com o catálogo errado (as duas pontas mudariam juntas).
 */
export function arquivosQueHardcodam(
  repoRoot: string,
  valor: string,
  raizes: string[] = RAIZES_PRODUCAO,
): string[] {
  const achados: string[] = [];
  for (const raiz of raizes) {
    const base = join(repoRoot, raiz);
    for (const arquivo of varreArquivos(base)) {
      if (arquivo.includes('.spec.')) continue;
      const texto = removeComentarios(readFileSync(arquivo, 'utf8'));
      // ⚠️ O BACKTICK é o terceiro formato, e ele faltava. MEDIDO 2026-10-22:
      // um termo de domínio hardcoded em template literal
      // (`const p = \`gerente\``) era INVISÍVEL para o gate — que é o
      // instrumento que COBRA. Um termo que o gate não vê é um termo que
      // ninguém paga a dívida.
      const formas = [`'${valor}'`, `"${valor}"`, `\`${valor}\``];
      if (!formas.some((forma) => texto.includes(forma))) continue;
      achados.push(relative(repoRoot, arquivo));
    }
  }
  return achados.sort();
}

export function checkRepeticao(opts: { repoRoot: string }): CheckResult {
  const repoRoot = resolve(opts.repoRoot);
  const errors: string[] = [];
  const advisories: string[] = [];

  let declaracao: Declaracao;
  try {
    declaracao = carregaDeclaracao(repoRoot);
  } catch (erro) {
    return {
      ok: false,
      errors: [
        `declaração de termos ilegível (${ARQUIVO_DECLARACAO}): ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      ],
    };
  }

  if (declaracao.termos.length === 0) {
    // Anti-vacuuidade: um gate com lista vazia não mede nada, e sair verde
    // seria vender silêncio como cobertura.
    return {
      ok: false,
      errors: [
        `a declaração de termos (${ARQUIVO_DECLARACAO}) está VAZIA — o gate não tem o que medir.`,
      ],
    };
  }

  const devendo: { termo: TermoDeclarado; arquivos: number }[] = [];
  for (const termo of declaracao.termos) {
    // ⚠️ A DECLARAÇÃO é uma PROMESSA, e uma promessa que ninguém confere não
    // é promessa. MEDIDO 2026-10-22: o termo `VALIDATION_ERROR` declarava um
    // dono (`codigos-de-problema.ts`) que NÃO EXISTIA — e a mensagem de erro
    // mandava "importe a constante de 'apps/api/src/shared/infrastructure/
    // http/codigos-de-problema.ts'", uma instrução que ninguém pode seguir,
    // porque o arquivo não está lá. O `dono` existir é o MÍNIMO que a
    // declaração precisa: sem ele, a dívida não é pública — ela é uma
    // referência a lugar nenhum.
    if (!existsSync(join(repoRoot, termo.dono))) {
      errors.push(
        `termo de domínio '${termo.valor}' declara o dono '${termo.dono}', e esse ` +
          `arquivo NÃO EXISTE — a dívida não é pública se ninguém sabe onde ela está.`,
      );
      continue;
    }
    // E o MOTIVO: a convenção promete uma dívida pública COM a razão dela
    // (`dry.md` §5). Um termo `declarado` sem motivo é uma dívida sem
    // explicação — e a ressalva do gate prometia mostrá-lo.
    if (termo.estado === 'declarado' && (termo.motivo ?? '').trim() === '') {
      errors.push(
        `termo de domínio '${termo.valor}' está em estado 'declarado' e NÃO tem ` +
          `motivo — a dívida é pública COM o motivo (ver dry.md §5).`,
      );
      continue;
    }

    const hardcoded = arquivosQueHardcodam(repoRoot, termo.valor).filter(
      (arquivo) => arquivo !== termo.dono,
    );
    if (termo.estado === 'declarado') {
      if (hardcoded.length > 0) devendo.push({ termo, arquivos: hardcoded.length });
      continue;
    }
    if (hardcoded.length > 0) {
      errors.push(
        `termo de domínio '${termo.valor}' hardcoded em ${hardcoded.length} arquivo(s) de ` +
          `produção, e o estado declarado é 'ok' — importe a constante ` +
          `'${termo.constante}' de '${termo.dono}':\n` +
          hardcoded.map((a) => `      ${a}\n`).join(''),
      );
    }
  }

  if (devendo.length > 0) {
    advisories.push(
      `dívida DRY declarada: ${devendo.length} termo(s) com hardcode em produção — ` +
        devendo
          .map((d) => `'${d.termo.valor}' (${d.arquivos} arq.) — ${d.termo.motivo ?? 'SEM MOTIVO'}`)
          .join('; ') +
        `. A lista completa está em ${ARQUIVO_DECLARACAO}, e a fase que paga cada ` +
        `um está no plano docs/superpowers/plans/2026-10-22-termos-de-dominio.md.`,
    );
  }

  return { ok: errors.length === 0, errors, advisories };
}
