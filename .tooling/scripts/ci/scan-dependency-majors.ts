/**
 * SEM shebang, de propósito.
 *
 * Mede quais dependências do workspace têm uma **major** mais nova no
 * registro, e grava o resultado em
 * `.tooling/scripts/ci/dependencias-major-disponiveis.json`.
 *
 * O gate `check-dependency-freshness` é **hermético** (sem rede, por
 * desenho: um gate de CI que depende de rede falha por causa de rede). Este
 * script é o passo que **tem** rede, roda fora do CI, e o resultado é
 * commitado — é assim que o gate sabe o que existe de novo.
 *
 * Uso:
 *   pnpm run deps:major-scan
 *
 * MEDIDO 2026-11-09: o `.github/dependabot.yml` afirma que o pnpm tem "dono
 * próprio" (renovate), mas **não existe `renovate.json`, `.renovaterc` nem
 * `renovate` no `package.json`** — o dono do pnpm não existe. Este script,
 * junto com a tabela de pendências, é o que dá dono e medida à dívida.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { listarPackageJsons, versoesDeclaradas } from './check-dependency-drift';

// A raiz vem do PRÓPRIO SCRIPT, e não do `process.cwd()`: MEDIDO 2026-11-24,
// rodar o script de outro diretório media o manifesto daquele diretório e
// gravava o arquivo versionado no lugar errado (ou morria com ENOENT).
const RAIZ = resolve(__dirname, '..', '..', '..');
const SAIDA = path.join('.tooling', 'scripts', 'ci', 'dependencias-major-disponiveis.json');

/** A major de uma faixa declarada. */
function majorDeclarada(faixa: string): number | null {
  const m = faixa.match(/(\d+)(?:\.\d+)*/);
  return m ? Number(m[1]) : null;
}

/**
 * As tags de distribuição do registro, como um mapa `tag → versão`.
 *
 * MEDIDO 2026-11-23: o `npm` 12 devolve o `dist-tags --json` como uma LISTA
 * de objetos (`[{ "latest": "12.6.0", ... }]`), e não como o objeto plano
 * (`{ "latest": "12.6.0" }`) que o `npm` 10 devolvia. O script lia o objeto
 * plano, recebia uma lista, e `tags.prev`/`tags.latest` davam `undefined` —
 * TODOS os pacotes caíam em "sem consulta ao registro" e o arquivo versionado
 * era escrito com `majors: {}`, ou seja, o gate perdia a medição sem acusar
 * nada. Por isso a normalização é explícita e as DUAS formas são aceitas.
 */
export function normalizaDistTags(bruto: unknown): Record<string, string> {
  const registros = Array.isArray(bruto) ? bruto : [bruto];
  const tags: Record<string, string> = {};
  for (const registro of registros) {
    if (registro && typeof registro === 'object') {
      Object.assign(tags, registro as Record<string, string>);
    }
  }
  return tags;
}

/**
 * A major mais nova **ESTÁVEL** publicada no registro.
 *
 * A ordem das tags é `latest` → `prev`, e ela importa. MEDIDO 2026-11-24:
 * o `@prisma/client` publica `latest: 7.10.1` (ESTÁVEL) e `prev: 6.19.3`
 * (a estável que sobrou de um RC antigo) — medir o `prev` primeiro gravava
 * major **6** e escondia a major 7 que existe. A major que o repo deve subir
 * é a do `latest` quando ele é estável.
 *
 * O `latest` nem sempre serve: MEDIDO 2026-11-09, o `latest` do `prisma` é
 * `8.0.0-rc.33` — um *release candidate*. Um RC não entra em `main` de um
 * template, e a major dele não é uma major "disponível": é uma promessa.
 * Quando o `latest` é pre-release, a fonte da major estável real é a tag
 * `prev` (a estável anterior ao RC).
 */
export function majorEstavelNasTags(tags: Record<string, string>): number | null {
  // `latest` primeiro (a major mais nova); `prev` é o plano B para quando o
  // `latest` é um RC.
  const candidatas = [tags.latest, tags.prev].filter((v): v is string => !!v);
  for (const versao of candidatas) {
    if (isPreRelease(versao)) continue;
    const m = versao.match(/^(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

function majorNoRegistro(pacote: string): number | null {
  try {
    const out = execFileSync('npm', ['view', pacote, 'dist-tags', '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
    });
    return majorEstavelNasTags(normalizaDistTags(JSON.parse(out)));
  } catch {
    return null;
  }
}

/** A versão é pre-release (`-rc`, `-beta`, `-alpha`, `-dev`, `-canary`)? */
export function isPreRelease(versao: string): boolean {
  return /-(rc|beta|alpha|dev|canary|next|experimental)/i.test(versao);
}

async function main(): Promise<void> {
  const arquivos = await listarPackageJsons(RAIZ);
  const declaradas = new Map<string, string>();
  for (const arquivo of arquivos) {
    const raw = await fs.readFile(path.join(RAIZ, arquivo), 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    for (const [nome, faixa] of versoesDeclaradas(pkg as never)) {
      declaradas.set(nome, faixa);
    }
  }

  const majors: Record<string, number> = {};
  const semConsulta: string[] = [];
  for (const pacote of [...declaradas.keys()].sort()) {
    const major = majorNoRegistro(pacote);
    if (major === null) {
      semConsulta.push(pacote);
      continue;
    }
    majors[pacote] = major;
  }

  const doc = {
    _nota:
      "Gerado por 'pnpm run deps:major-scan'. O gate check-dependency-freshness le este " +
      'arquivo (hermético, sem rede) e compara com as faixas declaradas no workspace. ' +
      'Não editar à mão: rode o script.',
    medidoEm: new Date().toISOString().slice(0, 10),
    totalDeclaradas: declaradas.size,
    majors,
    semConsulta,
  };

  await fs.writeFile(path.join(RAIZ, SAIDA), `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');

  const pendentes = Object.entries(majors).filter(([pacote, major]) => {
    const atual = majorDeclarada(declaradas.get(pacote)!);
    return atual !== null && major > atual;
  });
  console.log(
    `escrito '${SAIDA}': ${declaradas.size} dependências, ${pendentes.length} com major pendente`,
  );
  for (const [pacote, major] of pendentes) {
    console.log(`  ${pacote}: ${declaradas.get(pacote)} -> major ${major}`);
  }
  if (semConsulta.length) {
    console.log(`  (${semConsulta.length} sem consulta ao registro: ${semConsulta.join(', ')})`);
  }
}

// O `main()` só roda quando o arquivo é o ENTRADA do processo — o mesmo
// guard que os outros scripts do repo usam (`check-archive-integrity.ts`,
// `boot-local.ts`, …). Sem ele, importar este módulo (o que o spec faz para
// testar o `normalizaDistTags`) dispara a varredura de rede e REESCREVE o
// arquivo versionado no meio da suíte de testes.
if (process.argv[1]?.endsWith('scan-dependency-majors.ts')) {
  void main();
}
