/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do #126: os footers de versão dos docs canônicos
 * divergirem.
 *
 * A raiz do defeito NÃO era o footer — era a PROCEDÊNCIA. MEDIDO em
 * `.agents/workflows/release-mode.md:30`: o handoff do `doc-writer` nomeava
 * TRÊS dos quatro arquivos versionados (`docs/TEMPLATE_USAGE.md` não estava
 * na lista), e o `release-template.yml` — que LÊ os quatro e aborta se
 * divergirem — só descobre isso no momento do release.
 *
 * Este gate move a checagem para o PR: a divergência é barrada aqui, e o
 * `release-template` nunca chega a abortar.
 *
 * A segunda regra: a versão dos quatro não pode estar ATRÁS da da última tag.
 * Sem ela, os quatro podem concordar numa versão já ultrapassada — que é o
 * que acontece quando um bump esquece um dos arquivos (o defeito do #126) e
 * ninguém percebe até o release abortar.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CheckResult } from './check-types';

/** Um footer de versão: onde ele está e como o texto dele é. */
interface FooterEsperado {
  arquivo: string;
  /** O rótulo que precede a versão, com os `**` do markdown. */
  rotulo: string;
}

/**
 * Os SEIS footers.
 *
 * ⚠️ A lista é o que este gate mede — e ela é a RAIZ do #126: a lista do
 * `release-mode.md` nomeava três. Por isso ela está EXPORTADA, e a spec a
 * prende (o mesmo motivo do `HOSTS_DESTINO_LOCAL` do PR #115): uma lista de
 * segurança que ninguém prende é uma lista que alguém encolhe sem querer.
 *
 * MEDIDO em 2026-10-29: a lista nomeava QUATRO e o repo tem SEIS arquivos com
 * footer de versão — `AGENTS.md` e `README.md` ficaram de fora, e o drift
 * aconteceu: `AGENTS.md` foi para `1.13.0` no merge do #116 enquanto os
 * quatro seguiam em `1.12.0`, e **nenhum gate olhou**. A mesma classe do
 * #126 (um arquivo que não está na lista não é atualizado) reincidiu dentro
 * do próprio gate que existe para fechá-la.
 */
export const FOOTERS_DE_VERSAO: readonly FooterEsperado[] = [
  { arquivo: 'docs/MONOREPO.md', rotulo: '**Versão do documento:**' },
  { arquivo: 'docs/STACK.md', rotulo: '**Versão da stack:**' },
  { arquivo: 'docs/TEMPLATE_USAGE.md', rotulo: '**Versão do documento:**' },
  {
    arquivo: '.agents/specs/conventions/estrutura-e-versionamento.md',
    rotulo: '**Versão da convenção:**',
  },
  // Os dois que faltavam (medido em 2026-10-29, ver o cabeçalho): o
  // `AGENTS.md` já tinha divergido para 1.13.0 sem nenhum gate ver.
  { arquivo: 'AGENTS.md', rotulo: '**Versão do documento:**' },
  { arquivo: 'README.md', rotulo: '**Versão:**' },
];

/** A versão como tripla de números, ou `null` se não é uma versão. */
export function versaoNumerica(versao: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(versao);
  if (m === null) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Compara duas versões: negativo se `a` < `b`. */
export function compararVersoes(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

/**
 * A última tag do repositório, ou `null` se não houver tag.
 *
 * Sem shell: `execFileSync('git', ['describe', …])` com o argv em array (o
 * gate `check-shell-injection` cobra isso — e o gate tem de passar no gate).
 */
export function ultimaTag(repoRoot: string): string | null {
  try {
    const saida = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return saida === '' ? null : saida;
  } catch {
    return null;
  }
}

/** Lê o conteúdo de um arquivo do disco, ou `null` se ele não existe. */
async function lerConteudo(repoRoot: string, arquivo: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(repoRoot, arquivo), 'utf-8');
  } catch {
    return null;
  }
}

/** Lê a versão de um footer, ou `null` se o rótulo não estiver no arquivo. */
async function lerVersao(repoRoot: string, footer: FooterEsperado): Promise<string | null> {
  let texto: string;
  try {
    texto = await fs.readFile(path.join(repoRoot, footer.arquivo), 'utf-8');
  } catch {
    return null;
  }
  return extrairVersao(texto, footer.rotulo);
}

/** A versão que um texto de footer declara, ou `null` se ele não declara. */
export function extrairVersao(texto: string, rotulo: string): string | null {
  const re = new RegExp(`${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+\\.\\d+\\.\\d+)`);
  const m = re.exec(texto);
  return m === null ? null : m[1]!;
}

/**
 * O conteúdo de um arquivo NA TAG — ou `null` se ele não existia nela.
 *
 * Sem shell: argv em array, pelo mesmo motivo do gate `check-shell-injection`
 * (que este gate tem de passar).
 */
function conteudoNaTag(repoRoot: string, tag: string, arquivo: string): string | null {
  try {
    return execFileSync('git', ['show', `${tag}:${arquivo}`], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

/**
 * Gate: os seis footers declaram a mesma versão, e ela é maior que a da
 * última tag.
 */
export async function checkVersionFooters(opts: { repoRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);

  const encontradas = new Map<string, string>();
  for (const footer of FOOTERS_DE_VERSAO) {
    const versao = await lerVersao(root, footer);
    if (versao === null) {
      errors.push(
        `${footer.arquivo}: não achei o footer '${footer.rotulo} X.Y.Z' — ` +
          `os ${FOOTERS_DE_VERSAO.length} footers de versão têm de estar presentes (o #126).`,
      );
      continue;
    }
    encontradas.set(footer.arquivo, versao);
  }

  // (1) os seis têm de concordar.
  const distintas = [...new Set(encontradas.values())];
  if (distintas.length > 1) {
    const detalhe = [...encontradas.entries()]
      .map(([arquivo, versao]) => `${arquivo}=${versao}`)
      .join(', ');
    errors.push(
      `Os footers de versão divergem (#126): ${detalhe}. ` +
        `A release aborta no ` +
        `release-template.yml quando isso chega lá — e a divergência nasce da ` +
        `PROCEDENCIA: o handoff do release-mode.md nomeia os arquivos que o bump ` +
        `deve atualizar, e um arquivo que não está na lista não é atualizado.`,
    );
  }

  // (2) a versão tem de ser maior que a da última tag.
  const tag = ultimaTag(root);
  if (tag !== null && distintas.length === 1) {
    const atual = versaoNumerica(distintas[0]!);
    const ultima = versaoNumerica(tag.replace(/^v/, ''));
    if (atual === null) {
      errors.push(`A versão dos footers ('${distintas[0]}') não é uma versão X.Y.Z.`);
    } else if (ultima !== null && compararVersoes(atual, ultima) < 0) {
      // ⚠️ MENOR, e não "diferente": depois do release, os footers ficam
      // IGUAIS à tag que acabou de ser criada — e o gate roda em todo preflight
      // depois disso. Igualdade é o estado NORMAL entre um release e o
      // próximo; o que é defeito é os footers ficarem ATRÁS da tag (um bump
      // esquecido, ou um revert que mexeu só num dos quatro).
      errors.push(
        `A versão dos footers (${distintas[0]}) está ATRÁS da última tag (${tag}). ` +
          `O bump de versão é o que o release consome — e é a PROCEDÊNCIA do bump ` +
          `que ficou com um arquivo de fora (o #126).`,
      );
    }
  }

  // (3) o CONTEÚDO de um footer mudou desde a última tag e a versão NÃO.
  //
  // ⚠️ Esta é a regra que faltava no PR #172: o rodapé do `README.md` passou
  // de 47/49/17 para 48/50/18 e o rótulo continuou `1.30.0` — que já era o da
  // tag publicada. As duas primeiras regras medem o NÚMERO (concordância
  // entre os seis, e não-atrás-da-tag): as duas PASSAM quando o conteúdo
  // muda e o número fica. O rótulo passou a nomear DOIS conteúdos.
  //
  // A janela medida é a do ÚLTIMO RELEASE: desde a tag, o conteúdo mudou e a
  // versão não mudou em lugar nenhum. Um bump no meio da janela cobre a
  // janela — que é o caso normal do PR que faz o bump e o ajuste no mesmo
  // diff (o `AGENTS.md` que ganha a linha do workflow depois do bump).
  if (tag !== null) {
    for (const footer of FOOTERS_DE_VERSAO) {
      const atual = await lerConteudo(root, footer.arquivo);
      const naTag = conteudoNaTag(root, tag, footer.arquivo);
      // Sem base de comparação (o arquivo não existia na tag) ou sem mudança:
      // nada a medir.
      if (atual === null || naTag === null || atual === naTag) continue;

      const versaoAtual = encontradas.get(footer.arquivo);
      const versaoNaTag = extrairVersao(naTag, footer.rotulo);
      if (versaoAtual === undefined || versaoNaTag === null || versaoAtual !== versaoNaTag) {
        continue;
      }

      errors.push(
        `${footer.arquivo}: o conteúdo mudou desde a tag ${tag} e a versão continua ` +
          `${versaoAtual} — o rótulo de versão nomeia DOIS conteúdos. ` +
          `O bump é o que consome o rodapé (o release-template.yml aborta se os ` +
          `seis divergirem), e um doc que muda sem bump entra na main sem tag: ` +
          `bumpe a versão (minor ou patch, conforme ` +
          `'.agents/specs/conventions/estrutura-e-versionamento.md').`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
