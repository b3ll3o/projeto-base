/**
 * SEM shebang, de propósito.
 *
 * Fecha uma lacuna que MEDI em 2026-11-09: o `check-dependency-audit` mede
 * **advisory** (risco de segurança — o pacote tem CVE aberta). Ninguém mede
 * **idade** (risco de obsolescência — o pacote ficou para trás da major).
 *
 * O `.github/dependabot.yml` afirma, no próprio comentário:
 *
 *   "Só o ecosystem `github-actions`: o resto do repo (pnpm) tem o
 *    `renovate`/lockfile próprio, e um segundo dono de atualização é pior do
 *    que nenhum."
 *
 * MEDIDO 2026-11-09: **não existe `renovate.json`, nem `.renovaterc`, nem
 * `renovate` no `package.json`**. O dono do pnpm **não existe** — o config
 * aponta para uma ferramenta que não está no repo. Resultado medido:
 * **53 pacotes** desatualizados, **26 deles em major**.
 *
 * Este gate não exige que a major suba (isso é decisão de produto, e o
 * `prisma` 8.0.0-rc.33 é *release candidate* — RC não entra em `main`).
 * O gate exige que a major pendente:
 *
 * 1. **esteja declarada** numa tabela versionada, com o motivo; e
 * 2. **não tenha envelhecido** — a pendência reprova quando o pacote é
 *    removido do workspace, ou quando a faixa declarada **já permite** a
 *    major (aí a pendência virou um bug de configuração: o range diz que
 *    pode subir, mas o lockfile não subiu).
 *
 * É a mesma disciplina do `check-dependency-audit`: a exceção é explícita,
 * versionada e reconciliada — não uma boa intenção.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type CheckResult, linhasDoRelato } from './check-types';
import { listarPackageJsons, versoesDeclaradas } from './check-dependency-drift';

interface PackageJson {
  [key: string]: unknown;
}

/** Uma major pendente, declarada com o motivo de não subir agora. */
export interface MajorPendente {
  pacote: string;
  /** A faixa de versão declarada hoje no workspace. */
  faixaAtual: string;
  /** A major mais nova disponível no registro. */
  majorNova: number;
  /** A major que está em uso hoje. */
  majorAtual: number;
  /** Por que a major não sobe agora. */
  motivo: string;
  /** Quando essa pendência foi declarada (YYYY-MM-DD). */
  declaradaEm: string;
}

export const ARQUIVO_MAJORES = path.join(
  '.tooling',
  'scripts',
  'ci',
  'dependencias-major-disponiveis.json',
);

/** O arquivo de pendências, versionado, ao lado do gate. */
export const ARQUIVO_PENDENCIAS = path.join(
  '.tooling',
  'scripts',
  'ci',
  'dependencias-major-pendentes.json',
);

/**
 * Extrai a major de uma faixa declarada.
 *
 * `^1.2.3` → 1; `~1.2.3` → 1; `>=1.2.3` → 1; `1.2.3` → 1.
 * Devolve `null` quando a faixa não é numérica (`workspace:*`, `latest`,
 * `file:`, `git+…`) — o gate não inventa major para spec que ele não entende.
 */
export function majorDeclarada(faixa: string): number | null {
  const m = faixa.match(/(\d+)(?:\.\d+)*/);
  if (!m) return null;
  return Number(m[1]);
}
/**
 * A faixa declarada **permite** a major nova?
 *
 * `^1.2.3` permite major 1, não 2. `>=1.2.3` permite **qualquer** major
 * maior — é o caso em que o range já diz "pode subir" e o lockfile é que
 * ficou atrás: a pendência envelheceu e precisa reprovar.
 */
export function faixaPermiteMajor(faixa: string, majorNova: number): boolean {
  const op = faixa.trim().match(/^(\^|~|>=|>|=)?/)?.[1] ?? '=';
  const atual = majorDeclarada(faixa);
  if (atual === null) return false; // spec que não-entendemos: não julgamos
  if (op === '^') return majorNova === atual;
  if (op === '~') return majorNova === atual;
  if (op === '>=' || op === '>') return majorNova >= atual;
  return majorNova === atual; // exato
}

/** Lê as pendências declaradas. Arquivo ausente = lista vazia. */
export async function lerPendencias(repoRoot: string): Promise<MajorPendente[]> {
  try {
    const raw = await fs.readFile(path.join(repoRoot, ARQUIVO_PENDENCIAS), 'utf-8');
    const dados = JSON.parse(raw) as { pendencias?: MajorPendente[] };
    return dados.pendencias ?? [];
  } catch {
    return [];
  }
}

/**
 * As majors declaradas no registro, por pacote.
 *
 * Esta função **não** consulta a rede: o gate é hermético, como o resto do
 * `preflight`. O dado vem do arquivo versionado `major-novas-disponiveis.json`,
 * que é atualizado por um passo explícito (`pnpm run deps:major-scan`) e
 * commitado. Sem ele, o gate não tem como saber o que existe de novo — e
 * nesse caso ele é `skipped` com motivo, nunca verde-por-ignorância.
 */
export const ARQUIVO_MAORES = path.join(
  '.tooling',
  'scripts',
  'ci',
  'dependencias-major-disponiveis.json',
);

export async function lerMajoresDisponiveis(repoRoot: string): Promise<Map<string, number> | null> {
  try {
    const raw = await fs.readFile(path.join(repoRoot, ARQUIVO_MAJORES), 'utf-8');
    const dados = JSON.parse(raw) as {
      medidoEm?: string;
      majors?: Record<string, number>;
    };
    if (!dados.majors) return null;
    return new Map(Object.entries(dados.majors));
  } catch {
    return null;
  }
}

export async function checkDependencyFreshness(opts: {
  repoRoot: string;
  packageJsons?: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);

  const majors = await lerMajoresDisponiveis(root);
  if (!majors) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason:
        `não existe '${ARQUIVO_MAJORES}' — o gate não tem como saber ` +
        `quais majors existem (sem rede, por desenho). Rode 'pnpm run deps:major-scan' ` +
        `e commite o resultado para habilitar a medição.`,
    };
  }

  const arquivos = opts.packageJsons ?? (await listarPackageJsons(root));
  const declaradas = new Map<string, string>();
  for (const arquivo of arquivos) {
    try {
      const raw = await fs.readFile(path.join(root, arquivo), 'utf-8');
      const pkg = JSON.parse(raw) as PackageJson;
      for (const [nome, faixa] of versoesDeclaradas(pkg)) {
        declaradas.set(nome, faixa);
      }
    } catch {
      advisories.push(`'${arquivo}' não pôde ser lido — a cobertura deste gate ficou menor`);
    }
  }

  const pendencias = await lerPendencias(root);
  const porPacote = new Map(pendencias.map((p) => [p.pacote, p]));

  for (const [pacote, majorNova] of majors) {
    const faixa = declaradas.get(pacote);
    if (!faixa) continue; // o pacote não está mais no workspace — verificado abaixo
    const majorAtual = majorDeclarada(faixa);
    if (majorAtual === null) continue;
    if (majorNova <= majorAtual) continue; // não há major pendente

    const pendencia = porPacote.get(pacote);
    if (!pendencia) {
      errors.push(
        `major não declarada: '${pacote}' está em ${faixa} (major ${majorAtual}) e existe major ` +
          `${majorNova} no registro, sem pendência declarada em '${ARQUIVO_PENDENCIAS}'. ` +
          `Ou declare a pendência com o motivo, ou suba a major.`,
      );
      continue;
    }

    if (!faixaPermiteMajor(faixa, majorNova)) continue; // a pendência é coerente

    errors.push(
      `pendência envelhecida: a faixa declarada de '${pacote}' ('${faixa}') **já permite** a major ` +
        `${majorNova}, mas a pendência em '${ARQUIVO_PENDENCIAS}' ainda diz que não sobe. ` +
        `O range e a pendência estão contradizendo — suba a major ou estreite o range.`,
    );
  }

  // Uma pendência cujo pacote saiu do workspace envelheceu: a lista descreve
  // uma dívida que não existe mais.
  for (const pendencia of pendencias) {
    if (declaradas.has(pendencia.pacote)) continue;
    errors.push(
      `pendência envelhecida: '${pendencia.pacote}' está em '${ARQUIVO_PENDENCIAS}' mas não é ` +
        `mais declarado no workspace. A pendência descreve um pacote que saiu — remova-a.`,
    );
  }

  const totalPendentes = pendencias.filter((p) => declaradas.has(p.pacote)).length;
  advisories.push(
    `${totalPendentes} major(s) declarada(s) como pendentes, com dono e motivo, em ` +
      `'${ARQUIVO_PENDENCIAS}'. Isto NÃO é defeito: é a dívida medida.`,
  );

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
if (process.argv[1]?.endsWith('check-dependency-freshness.ts')) {
  checkDependencyFreshness({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
