/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do #126: os footers de versão dos docs canônicos
 * divergirem.
 *
 * A raiz do defeito NÃO era o footer — era a PROCEDÊNCIA. MEDIDO em
 * `.agents/workflows/release-mode.md:30`: o handoff do `doc-writer` nomeava
 * TRÊS dos arquivos versionados (`docs/TEMPLATE_USAGE.md` não estava
 * na lista), e o `release-template.yml` — que LÊ os seis e aborta se
 * divergirem — só descobre isso no momento do release.
 *
 * Este gate move a checagem para o PR: a divergência é barrada aqui, e o
 * `release-template` nunca chega a abortar.
 *
 * A segunda regra: a versão dos seis não pode estar ATRÁS da da última tag.
 * Sem ela, os seis podem concordar numa versão já ultrapassada — que é o
 * que acontece quando um bump esquece um dos arquivos (o defeito do #126) e
 * ninguém percebe até o release abortar.
 *
 * A terceira regra: o RODAPÉ (a linha do rótulo) mudou e a versão não — o
 * rótulo de versão nomeando DOIS conteúdos. MEDIDO 2026-11-19: comparar o
 * ARQUIVO inteiro (e não o rodapé) reprovava 25 de 72 commits do histórico,
 * inclusive PRs já mergeados cujo rodapé era byte-idêntico. Com a linha,
 * sobram 2 — e são os 2 commits deste PR em que as contagens do `README.md`
 * mudaram sem a versão acompanhar: a classe que a regra existe para pegar.
 *
 * A âncora da 3ª regra é o COMMIT que instalou a versão atual, não a última
 * tag: ancorar na tag deixa a regra inerte depois de um bump no meio da
 * janela (MEDIDO 2026-11-23).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CheckResult } from './check-types';

/**
 * Um footer de versão: onde ele está e como o texto dele é.
 *
 * EXPORTADO porque o script de release (`tooling/scripts/bump-version.ts`)
 * importa a LISTA daqui — e a lista e o tipo têm de ser a mesma coisa. O
 * tipo repetido no consumidor era o mesmo fato declarado em três lugares
 * (a interface local, o cast da spec e a lista).
 */
export interface FooterEsperado {
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
 * A LINHA do rodapé — a que carrega o rótulo e a versão — ou `null`.
 *
 * ⚠️ É a LINHA, e não o arquivo. MEDIDO 2026-11-19 (PR #172): comparar o
 * arquivo INTEIRO reprovava **25 de 72** commits do histórico — inclusive
 * PRs já MERGED (#166 NestJS 12, #170 cards de empresa) cujo rodapé era
 * byte-idêntico e cuja versão estava certa. O motivo: o repositório muda
 * prosa o tempo todo (a rotina é PR de feature + PR de release separado —
 * `post-merge-release.md` §Bump manual), e a regra do arquivo inteiro
 * transformava TODO PR que tocasse um dos seis num PR de release.
 *
 * A linha é o que a regra quer: o rótulo de versão nomeia o conteúdo que
 * está NA LINHA (no `README.md`, as contagens do disco). Se a linha é a
 * mesma, o rótulo nomeia UM conteúdo — a prosa em volta não muda o que o
 * rodapé nomeia.
 */
export function extrairRodape(texto: string, rotulo: string): string | null {
  const re = new RegExp(`${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+\\.\\d+\\.\\d+`);
  for (const linha of texto.split('\n')) {
    if (re.test(linha)) return linha.trim();
  }
  return null;
}

/**
 * O COMMIT que instalou a versão atual do rodapé — ou `null`.
 *
 * ⚠️ A âncora é o commit que TROUXE a versão, não a última tag. MEDIDO
 * 2026-11-23 (PR #172): ancorar na tag deixa a 3ª regra INERTE depois de um
 * bump no meio da janela — o gate devolvia `[]` com o rodapé do `README.md`
 * alterado (48 → 49 agents) e a versão em `1.32.0`, que era a versão já
 * bumpeada. O rótulo `1.32.0` nomeava DOIS conteúdos, e a regra existia
 * justamente para isso.
 *
 * O comentário antigo ("um bump no meio da janela cobre a janela") era
 * FALSO: o bump cobre só o que veio ANTES dele.
 *
 * `git log -S` acha o commit em que a string aparece (ou some) — com
 * `--format=%H` e `head -1` é o mais recente. Sem shell: argv em array.
 */
export function commitQueInstalou(
  repoRoot: string,
  arquivo: string,
  rotulo: string,
  versao: string,
): string | null {
  try {
    const saida = execFileSync(
      'git',
      ['log', '--format=%H', '-S', `${rotulo} ${versao}`, '--', arquivo],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const primeira = saida.trim().split('\n')[0];
    return primeira === undefined || primeira === '' ? null : primeira;
  } catch {
    return null;
  }
}

/** O conteúdo de um arquivo NUM COMMIT — ou `null` se ele não existia nele. */
function conteudoNoCommit(repoRoot: string, commit: string, arquivo: string): string | null {
  try {
    return execFileSync('git', ['show', `${commit}:${arquivo}`], {
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
  const advisories: string[] = [];
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
  if (tag === null) {
    // ⚠️ Sem tag não há o que comparar — e o gate NÃO pode devolver verde
    // mudo: `guard-classes.md` diz que quem não pode ser comparado é
    // RECLASSIFICADO (skipped com motivo), nunca apagado em silêncio.
    // MEDIDO 2026-11-23: fora de um repo git, ou num repo sem tag, as regras
    // 2 e 3 não rodavam e o gate devolvia `{ok:true, errors:[]}` — verde por
    // ausência. No CI o risco é contido (o `ci.yml` usa `fetch-depth: 0`), mas
    // nada cobra esse fetch-depth para ESTE gate.
    advisories.push(
      `não há tag neste repositório (ou o git não respondeu) — a regra da ` +
        `versão-atrás-da-tag e a do rodapé-mudou-sem-bump NÃO RODARAM. ` +
        `O verde aqui é só a concordância entre os seis footers.`,
    );
  }
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
      // esquecido, ou um revert que mexeu só num dos seis).
      errors.push(
        `A versão dos footers (${distintas[0]}) está ATRÁS da última tag (${tag}). ` +
          `O bump de versão é o que o release consome — e é a PROCEDÊNCIA do bump ` +
          `que ficou com um arquivo de fora (o #126).`,
      );
    }
  }

  // (3) o CONTEÚDO do RODAPÉ mudou e a versão NÃO.
  //
  // ⚠️ Esta é a regra que faltava no PR #172: o rodapé do `README.md` passou
  // de 47/49/17 para 48/50/18 e o rótulo continuou `1.30.0` — que já era o da
  // tag publicada. As duas primeiras regras medem o NÚMERO (concordância
  // entre os seis, e não-atrás-da-tag): as duas PASSAM quando o conteúdo
  // muda e o número fica. O rótulo passou a nomear DOIS conteúdos.
  //
  // O que se compara é o RODAPÉ (a LINHA do rótulo), não o arquivo. MEDIDO
  // 2026-11-19: a versão que comparava o arquivo inteiro reprovava 25 de 72
  // commits do histórico — inclusive PRs já MERGED (#166, #170) cujo rodapé
  // era byte-idêntico. O repositório muda prosa o tempo todo, e a regra do
  // arquivo inteiro transformava TODO PR que tocasse um dos seis num PR de
  // release. A linha é o que o rótulo nomeia: no `README.md`, as contagens
  // do disco; a prosa em volta não muda o que o rodapé nomeia.
  //
  // A ÂNCORA é o COMMIT que instalou a versão atual, e não a última tag.
  // MEDIDO 2026-11-23: ancorar na tag deixa a regra INERTE depois de um bump
  // no meio da janela (o gate devolvia `[]` com o rodapé alterado e a versão
  // já bumpeada — o rótulo nomeava DOIS conteúdos e ninguém via). O bump
  // cobre o que veio ANTES dele, não o que vem depois.
  for (const footer of FOOTERS_DE_VERSAO) {
    const atual = await lerConteudo(root, footer.arquivo);
    const versaoAtual = encontradas.get(footer.arquivo);
    if (atual === null || versaoAtual === undefined) continue;

    const rodapeAtual = extrairRodape(atual, footer.rotulo);
    if (rodapeAtual === null) continue;

    // A âncora: o commit que trouxe a versão atual para este arquivo. Sem
    // ele (versão nunca commitada, ou `git` indisponível), não há com o que
    // comparar — e a regra não mede.
    const ancora = commitQueInstalou(root, footer.arquivo, footer.rotulo, versaoAtual);
    if (ancora === null) continue;

    const naAncora = conteudoNoCommit(root, ancora, footer.arquivo);
    if (naAncora === null) continue;

    const rodapeNaAncora = extrairRodape(naAncora, footer.rotulo);
    // O rodapé não mudou desde que a versão foi instalada: o rótulo nomeia UM
    // conteúdo. A prosa em volta pode ter mudado — não é o que a regra mede.
    if (rodapeNaAncora === null || rodapeNaAncora === rodapeAtual) continue;

    errors.push(
      `${footer.arquivo}: o rodapé mudou desde que a versão ${versaoAtual} foi ` +
        `instalada (commit ${ancora.slice(0, 8)}) e a versão não mudou — o rótulo ` +
        `de versão nomeia DOIS conteúdos. ` +
        `O bump é o que consome o rodapé (o release-template.yml aborta se os ` +
        `seis divergirem), e um doc que muda sem bump entra na main sem tag: ` +
        `bumpe a versão (minor ou patch, conforme ` +
        `'.agents/specs/conventions/estrutura-e-versionamento.md').`,
    );
  }

  return advisories.length > 0
    ? { ok: errors.length === 0, errors, advisories }
    : { ok: errors.length === 0, errors };
}
