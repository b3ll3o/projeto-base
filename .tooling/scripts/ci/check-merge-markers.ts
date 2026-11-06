/**
 * SEM shebang, de propósito — ver preflight-gates.ts para a justificativa
 * (este módulo é importado, não executado).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Fecha a classe "merge conflict resolvido no papel": **marcador de conflito
 * versionado**.
 *
 * ## O defeito (medido em 2026-11-03)
 *
 * O merge do #143 deixou no `main` publicado, dentro da tabela de histórico
 * de versões de `.agents/specs/conventions/estrutura-e-versionamento.md`:
 *
 * ```
 * <<<< HEAD
 * ======
 * | `1.16.0` | **Auditoria de segurança** (minor bump — ...
 * | `1.15.2` | Bump patch — ...
 * >>>> bbd0a9a (chore(version): 1.16.0 — a auditoria de seguranca)
 * ```
 *
 * ⚠️ Os marcadores aqui estão **partidos** (7 → 4) de propósito: escritos
 * inteiros, este arquivo seria o próprio alvo do gate (classe 3 de
 * `guard-classes.md` — o guard que dispara em si mesmo). O `<<<<` com 4
 * caracteres não casa `/^<<<<<<< /`, e o `>>>>` com 4 não casa
 * `/^>>>>>>> /`.
 *
 * Três linhas de marcador dentro de um arquivo de convenção, com as duas
 * linhas de versão duplicadas (a `1.15.2` já existia na tabela, e a `1.16.0`
 * do bloco de conflito era a **errada** — a auditoria de segurança é a
 * `1.17.0`).
 *
 * ## Por que nada pegou
 *
 * - `check-bloco-duplicado` mede **linhas de código** nas raízes de
 *   produção (`apps/`), não `.md` — a duplicação das linhas de versão estava
 *   fora do que ele varre.
 * - `check-doc-size` mede teto de linhas, não conteúdo.
 * - `check-doc-refs` valida links, não marcadores.
 * - A CI do #143 ficou **verde**: o merge resolvido no papel produz um
 *   arquivo que compila, linka e tem o tamanho certo.
 *
 * Ou seja: a classe inteira — "conflito de merge que ninguém notou" — não
 * tinha instrumento. Este gate é o instrumento.
 *
 * ## A regra
 *
 * `<<<<<<< ` e `>>>>>>> ` no início da linha são **ambíguos**: não existem em
 * sintaxe de nenhum formato de texto deste repo. `=======` **existe** — é o
 * underline de um heading setext em Markdown —, então ele **não** é
 * marcador sozinho: só conta **dentro** de um bloco de conflito **fechado**.
 *
 * ## O que é medido: o índice E o disco
 *
 * "Versionado" tem **dois** lados, e o gate mede os dois:
 *
 * - **O índice** (`git cat-file --batch` sobre os blobs de stage 0) — é o que
 *   `git commit` publica. Um arquivo **staged** com marcador e depois apagado
 *   do disco passaria se o gate só lesse o disco, e seria publicado com o
 *   marcador dentro (MEDIDO 2026-11-05).
 * - **O disco** (a working tree) — é onde o **conflito não resolvido** mora:
 *   num `git merge` real, o índice tem os 3 estágios (base/ours/theirs, sem
 *   marcador) e o **marcador só existe no arquivo do disco** (MEDIDO
 *   2026-11-05). Ler só o índice deixaria passar o caso que o gate existe
 *   para pegar.
 *
 * Por isso o gate lê as duas coisas e reporta o que achar em qualquer uma.
 *
 * ## O escopo
 *
 * **Todo arquivo de texto versionado.** A allowlist de extensões que existou
 * antes (2026-11-05) deixava de fora **44** arquivos versionados (MEDIDO:
 * 94 fora da allowlist, dos quais 50 estão nas 2 categorias isentas) — as 15
 * `migration.sql` do Prisma, o `schema.prisma`, os 2 `Dockerfile`, os 3
 * hooks do `husky` e o `.dockerignore` — e a linha da convenção
 * (`ci-defense-in-depth.md`) prometia *"qualquer arquivo de texto versionado"*.
 * A doc é a especificação: o gate mede o que ela promete.
 *
 * "Arquivo de texto" = o mesmo heurístico do git (byte NULO nos primeiros
 * 8000 bytes ⇒ binário). MEDIDO 2026-11-05: 0 binários em 1229 arquivos
 * versionados (69,5 MB). O gate completo (índice + working tree) leva
 * **~435 ms** — 3 rodadas de `npx tsx -e "...checkMergeMarkers({repoRoot:process.cwd()})"`
 * no repo real.
 */

export interface Conflito {
  /** O caminho relativo do arquivo. */
  arquivo: string;
  /** A linha 1-based onde o marcador aparece. */
  linha: number;
  /** O texto do marcador encontrado. */
  marcador: string;
  /**
   * De onde veio o achado: `índice` (o blob que o `git commit` publica) ou
   * `working tree` (o disco, onde mora o conflito não resolvido). Sem isso,
   * o mesmo arquivo com marcador em linhas diferentes nos dois lados sai 2× e
   * o leitor não sabe qual é o que será publicado.
   */
  origem?: 'índice' | 'working tree';
}

/**
 * Os caminhos onde um marcador é **legítimo**: são registro datado de uma
 * execução, e citam o marcador como conteúdo (a passagem de um conflito é
 * conteúdo de plano, não um conflito no arquivo). Mesmas duas categorias do
 * `check-doc-size` — `registro-datado` e `artefato-de-execucao`.
 */
export const CAMINHOS_IGNORADOS = ['docs/superpowers/', '.agents/runs/'];

/** Quantos bytes iniciais decide se o arquivo é texto (heurístico do git). */
export const JANELA_BINARIO = 8000;

/** O início de um marcador de conflito — inequívoco em qualquer formato. */
const MARCADOR_INICIO = /^<<<<<<< /;
const MARCADOR_FIM = /^>>>>>>> /;
/** O separador — só vale dentro de um bloco de conflito. */
const MARCADOR_SEPARADOR = /^=======\s*$/;

/**
 * Encontra os marcadores de conflito num conteúdo.
 *
 * Função pura: o teste mede ela direto, e o gate mede o disco.
 *
 * O separador só conta se o bloco foi **aberto E fechado**: um `<<<<<<< `
 * sem `>>>>>>> ` correspondente é um conflito truncado, e não pode
 * transformar todo underline de heading setext do resto do arquivo em
 * "marcador" (falso positivo medido em 2026-11-05).
 */
export function detectaConflitos(conteudo: string): { linha: number; marcador: string }[] {
  const linhas = conteudo.split('\n');
  const achados: { linha: number; marcador: string }[] = [];
  // Separadores pendentes: vistos dentro de um bloco, mas só contam se o
  // bloco for **fechado** depois. O `=======` vem ANTES do `>>>>>>>`, então
  // a decisão só pode ser tomada no fim do bloco.
  let separadoresPendentes: { linha: number; marcador: string }[] = [];
  let dentroDoBloco = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha === undefined) continue;
    if (MARCADOR_INICIO.test(linha)) {
      // Um bloco que abre sobre outro cancela os separadores pendentes:
      // o bloco anterior nunca foi fechado.
      separadoresPendentes = [];
      dentroDoBloco = true;
      achados.push({ linha: i + 1, marcador: linha.trimEnd() });
      continue;
    }
    if (MARCADOR_FIM.test(linha)) {
      dentroDoBloco = false;
      // O bloco fechou: os separadores pendentes eram mesmo separadores.
      achados.push(...separadoresPendentes);
      separadoresPendentes = [];
      achados.push({ linha: i + 1, marcador: linha.trimEnd() });
      continue;
    }
    // O separador só é marcador DENTRO de um bloco — fora dele é o underline
    // de um heading setext, que é sintaxe válida de Markdown. E um bloco
    // truncado (sem `>>>>>>>`) não envenena o resto do arquivo: os
    // separadores ficam pendentes e morrem sem ser achados.
    if (dentroDoBloco && MARCADOR_SEPARADOR.test(linha)) {
      separadoresPendentes.push({ linha: i + 1, marcador: linha.trimEnd() });
    }
  }

  // Um bloco que nunca fechou: os separadores pendentes são descartados
  // (é o que impede o underline de heading setext de virar falso positivo).
  return achados.sort((a, b) => a.linha - b.linha);
}

/** O arquivo é um dos que o gate ignora? */
export function ehIgnorado(caminho: string): boolean {
  return CAMINHOS_IGNORADOS.some((prefixo) => caminho.startsWith(prefixo));
}

/**
 * O conteúdo é de TEXTO? Heurístico do git: byte NULO nos primeiros 8000
 * bytes ⇒ binário.
 */
export function ehArquivoDeTexto(buf: Buffer): boolean {
  return !buf.subarray(0, JANELA_BINARIO).includes(0);
}

/** Uma entrada do índice: o blob que o `git commit` vai publicar. */
export interface EntradaIndice {
  /** O caminho relativo à raiz do repo. */
  caminho: string;
  /** O hash do blob (SHA-1) no índice. */
  sha: string;
  /** O stage no índice: `0` = versionado, `1`/`2`/`3` = conflito não resolvido. */
  stage: string;
}

/**
 * Os arquivos versionados que o gate varre, **relativos à raiz do repo**.
 *
 * `null` quando o git não roda — o gate então não tem o que comparar, e
 * devolve `skipped` (mesma distinção de `check-doc-size.listarMarkdown`:
 * `null` = não mediu, `[]` = mediu e não achou).
 *
 * `-z`: os paths saem separados por NUL, o que **elimina o quoting** do git
 * (`core.quotepath`) — sem isso, um path não-ASCII sairia escapado e o arquivo
 * seria pulado em silêncio.
 *
 * `--full-name`: os paths saem relativos à **raiz do repo**, não ao cwd — com
 * um `repoRoot` que é subdiretório, sem essa flag o gate mediria a subárvore
 * e diria que mediu o repo inteiro.
 *
 * O stage distingue o arquivo normal (stage `0`) do **unmerged** (stages
 * 1/2/3) — o mesmo path aparece 3 vezes no índice durante um conflito, e o
 * gate tem que contar o arquivo **uma vez**. Num conflito, o stage 0 não
 * existe: o blob com o marcador está só no **disco** (o gate lê os dois).
 */
export function entradasDoIndice(repoRoot: string): EntradaIndice[] | null {
  let saida: string;
  try {
    // O pathspec `:/` é o que traz a árvore INTEIRA: sem ele, o `git ls-files`
    // lista só o que está **debaixo** do cwd (MEDIDO 2026-11-05: de dentro de
    // `a/`, `--full-name` sozinho devolve só `a/one.txt`; com `:/` vem a
    // árvore toda). `--full-name` só muda o FORMATO do path, não o escopo.
    saida = execFileSync('git', ['ls-files', '-s', '-z', '--full-name', '--', ':/'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }

  const porCaminho = new Map<string, EntradaIndice>();
  for (const registro of saida.split('\0')) {
    if (registro.length === 0) continue;
    const tab = registro.indexOf('\t');
    if (tab < 0) continue;
    const meta = registro.slice(0, tab).split(' ');
    const caminho = registro.slice(tab + 1);
    const sha = meta[1];
    const stage = meta[2] ?? '0';
    if (!sha) continue;
    // Stage 0 = versionado normal. Stages 1/2/3 = conflito de merge não
    // resolvido: o mesmo path aparece 3 vezes. Fica o primeiro.
    if (!porCaminho.has(caminho)) porCaminho.set(caminho, { caminho, sha, stage });
  }

  const entradas = [...porCaminho.values()];
  return entradas.length > 0 ? entradas : null;
}

/**
 * Lê o conteúdo dos blobs do índice, **em lote** (`git cat-file --batch`).
 *
 * Ler do índice (e não do disco) é o que fecha o buraco do arquivo staged e
 * depois apagado: o blob que o `git commit` publica é o do índice.
 *
 * @returns o conteúdo por caminho; o path é omitido quando o blob não pôde
 *   ser lido.
 */
export function lerBlobsDoIndice(
  repoRoot: string,
  entradas: EntradaIndice[],
): { conteudos: Map<string, Buffer>; ilegiveis: string[] } {
  const conteudos = new Map<string, Buffer>();
  const ilegiveis: string[] = [];
  if (entradas.length === 0) return { conteudos, ilegiveis };

  let bruto: Buffer;
  try {
    bruto = execFileSync('git', ['cat-file', '--batch'], {
      cwd: repoRoot,
      input: entradas.map((e) => e.sha).join('\n') + '\n',
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return { conteudos, ilegiveis: entradas.map((e) => e.caminho) };
  }

  // O `--batch` responde: "<sha> <tipo> <tamanho>\n<conteúdo>\n" — mas um
  // objeto AUSENTE responde "<sha> missing\n", **sem** campo de tamanho.
  //
  // O offset tem que andar pelo **tamanho declarado**, senão um `missing`
  // desalinha o parser e o arquivo seguinte é lido do byte errado — com o
  // marcador dele perdido e o gate devolvendo verde (MEDIDO 2026-11-05).
  let offset = 0;
  for (const entrada of entradas) {
    const fimDaLinha = bruto.indexOf(10, offset);
    if (fimDaLinha < 0) {
      ilegiveis.push(entrada.caminho);
      break;
    }
    const cabecalho = bruto.toString('utf-8', offset, fimDaLinha);
    const partes = cabecalho.split(' ');
    // "missing" (e qualquer tipo sem tamanho) ⇒ não há corpo: o offset avança
    // só até o fim da linha do cabeçalho.
    const tamanho = partes.length >= 3 ? Number(partes[2]) : NaN;
    if (!Number.isFinite(tamanho)) {
      ilegiveis.push(entrada.caminho);
      offset = fimDaLinha + 1;
      continue;
    }
    const inicio = fimDaLinha + 1;
    const fim = inicio + tamanho;
    if (fim > bruto.length) {
      ilegiveis.push(entrada.caminho);
      break;
    }
    conteudos.set(entrada.caminho, bruto.subarray(inicio, fim));
    offset = fim + 1;
  }

  return { conteudos, ilegiveis };
}

/**
 * A raiz real do repo — o `repoRoot` pode ser um subdiretório, e os paths do
 * índice são relativos à raiz.
 */
export function raizDoRepo(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return repoRoot;
  }
}

/**
 * Varre UM conteúdo e devolve os marcadores.
 *
 * O BOM fica no início da 1ª linha e esconderia o 1º marcador.
 */
export function marcadoresDe(buf: Buffer): { linha: number; marcador: string }[] {
  if (!ehArquivoDeTexto(buf)) return [];
  return detectaConflitos(buf.toString('utf-8').replace(/^﻿/, ''));
}

/**
 * Os arquivos cuja **working tree** diverge do índice — é só esses que
 * precisam ser lidos do disco.
 *
 * `git diff-files` lista exatamente os arquivos com mudança **não staged**,
 * e o `git ls-files -v` traz os marcados como `assume-unchanged` /
 * `skip-worktree` (que o `diff-files` **omite**). MEDIDO 2026-11-05: as duas
 * consultas juntas levam **~10 ms** num repo com 1229 arquivos versionados —
 * o número de arquivos que elas devolvem muda com a working tree, então o
 * que importa é o custo, não a contagem. Os demais têm o disco idêntico ao
 * índice, e o índice já foi lido.
 */
export function modificadosNaWorkingTree(repoRoot: string): Set<string> {
  const modificados = new Set<string>();
  try {
    const saida = execFileSync('git', ['diff-files', '--name-only', '-z'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
    for (const f of saida.split('\0')) if (f.length > 0) modificados.add(f);
  } catch {
    /* sem diff-files: a lista de flags abaixo ainda cobre o caso */
  }

  // `git diff-files` **omite** os arquivos com `assume-unchanged` ou
  // `skip-worktree` — e o índice continua em stage 0 (MEDIDO 2026-11-05: com
  // `git update-index --assume-unchanged`, o arquivo não aparece e o gate
  // passava verde com o marcador na working tree). `git ls-files -v` marca
  // esses arquivos com uma letra diferente de `H` (o normal).
  try {
    const saida = execFileSync('git', ['ls-files', '-v', '-z'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
    // O formato é "<tag> <path>" (separados por espaço, com `-z` o path vem
    // depois de 1 espaço).
    for (const registro of saida.split('\0')) {
      if (registro.length < 3) continue;
      const marca = registro[0];
      // `H` = normal (cache válido); `h` = assume-unchanged; `S` = skip-worktree.
      if (marca === 'H') continue;
      const caminho = registro.slice(2);
      if (caminho.length > 0) modificados.add(caminho);
    }
  } catch {
    /* sem ls-files -v: fica só o diff-files */
  }

  return modificados;
}

export function checkMergeMarkers(opts: { repoRoot: string }): CheckResult {
  const repoRoot = opts.repoRoot;
  const erros: string[] = [];
  const advisories: string[] = [];
  const conflitos: Conflito[] = [];
  /** Os arquivos que o gate NÃO mediu (blob ilegível). */
  const naoMedidos: string[] = [];

  const entradas = entradasDoIndice(repoRoot);
  if (entradas === null) {
    // Sem git não há "versionado" — e verde por ausência é a classe 5 de
    // `guard-classes.md`. Mesma forma do `check-doc-size`.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason:
        "'git ls-files' indisponível — o gate mede arquivos VERSIONADOS e não tem o que comparar",
    };
  }

  const raiz = raizDoRepo(repoRoot);
  // Os arquivos cuja working tree pode divergir do índice — o disco deles é
  // lido; o resto tem disco idêntico ao índice (que já é lido inteiro).
  const modificados = modificadosNaWorkingTree(repoRoot);

  // ⚠️ O índice é lido **inteiro**, não só onde pode divergir do disco.
  //
  // A otimização de ler só os arquivos "modificados" foi tentada e
  // **revertida**: `git diff-files` lista só mudança **não staged** — um
  // arquivo recém-staged (index ≠ HEAD, disco = index) não aparece em lugar
  // nenhum, e o gate deixava de ver o marcador que o `git commit` publicaria
  // (MEDIDO 2026-11-05: 6 specs caíram). O índice é a fonte da verdade do
  // que será publicado — ler tudo é o que fecha o buraco.
  const { conteudos, ilegiveis } = lerBlobsDoIndice(repoRoot, entradas);

  for (const entrada of entradas) {
    if (ehIgnorado(entrada.caminho)) continue;

    // (1) O ÍNDICE — o que o `git commit` publica. Só é lido onde pode
    //     divergir do disco (ver `paraLerDoIndice`).
    const blob = conteudos.get(entrada.caminho);
    if (blob) {
      for (const achado of marcadoresDe(blob)) {
        conflitos.push({
          arquivo: entrada.caminho,
          linha: achado.linha,
          marcador: achado.marcador,
          origem: 'índice',
        });
      }
    } else if (ilegiveis.includes(entrada.caminho)) {
      // O blob do índice não pôde ser lido. **Não é** defeito no objeto
      // medido — é verdade sobre a própria medição: o arquivo NÃO foi
      // medido. Um arquivo não medido não é um arquivo limpo: por isso o
      // gate se declara `skipped` no fim (verde por ausência é a classe 5
      // de `guard-classes.md`), e o motivo nomeia o arquivo.
      naoMedidos.push(entrada.caminho);
      advisories.push(
        `não consegui ler o blob indexado de '${entrada.caminho}' — o gate não mediu esse arquivo`,
      );
    }

    // (2) O DISCO — onde mora o conflito **não resolvido**: num `git merge`
    //     real o índice tem os 3 estágios (sem marcador) e o marcador só
    //     existe no arquivo do disco.
    //
    //     O disco só é lido quando ele **pode** divergir do índice: o arquivo
    //     tem mudança não staged (`git diff-files`) ou o índice está
    //     unmerged (conflito aberto). Nos demais casos o disco é idêntico ao
    //     índice, que já foi lido — e ler 69,5 MB de novo seria o dobro do
    //     custo do gate à toa.
    const discoPodeDivergir = modificados.has(entrada.caminho) || entrada.stage !== '0';
    if (!discoPodeDivergir) continue;

    let doDisco: Buffer;
    try {
      doDisco = readFileSync(join(raiz, entrada.caminho));
    } catch {
      continue; // apagado do disco: o índice (1) já mediu o que será publicado
    }
    for (const achado of marcadoresDe(doDisco)) {
      const jaContado = conflitos.some(
        (c) => c.arquivo === entrada.caminho && c.linha === achado.linha,
      );
      if (!jaContado) {
        conflitos.push({
          arquivo: entrada.caminho,
          linha: achado.linha,
          marcador: achado.marcador,
          origem: 'working tree',
        });
      }
    }
  }

  for (const c of conflitos) {
    erros.push(
      `marcador de conflito versionado em '${c.arquivo}:${c.linha}': '${c.marcador}'` +
        `${c.origem ? ` (${c.origem})` : ''} — ` +
        `resolva o conflito (a linha entre <<<<<<< e >>>>>>> é a que vale) e versione o arquivo resolvido`,
    );
  }

  // Um arquivo versionado que o gate **não mediu** não pode sair verde: o
  // gate não sabe se o marcador está lá ou não. Ele se declara `skipped` com
  // o motivo — verde por ausência é a classe 5 de `guard-classes.md`.
  if (naoMedidos.length > 0) {
    return {
      ok: true,
      errors: erros,
      skipped: true,
      reason:
        `${naoMedidos.length} arquivo(s) versionado(s) não puderam ser lidos do índice ` +
        `(${naoMedidos.slice(0, 3).join(', ')}${naoMedidos.length > 3 ? '…' : ''}) — o gate não mediu esses arquivos`,
      ...(advisories.length > 0 ? { advisories } : {}),
    };
  }

  return {
    ok: erros.length === 0,
    errors: erros,
    ...(advisories.length > 0 ? { advisories } : {}),
  };
}
