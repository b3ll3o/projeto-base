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
import { execFileSync } from 'node:child_process';
import { listarPackageJsons, versoesDeclaradas } from './check-dependency-drift';

const RAIZ = process.cwd();
const SAIDA = path.join('.tooling', 'scripts', 'ci', 'dependencias-major-disponiveis.json');

/** A major de uma faixa declarada. */
function majorDeclarada(faixa: string): number | null {
  const m = faixa.match(/(\d+)(?:\.\d+)*/);
  return m ? Number(m[1]) : null;
}

/**
 * A major mais nova **ESTÁVEL** publicada no registro.
 *
 * `dist-tags.latest` não serve: MEDIDO 2026-11-09, o `latest` do `prisma` é
 * `8.0.0-rc.33` — um *release candidate*. Um RC não entra em `main` de um
 * template, e a major dele não é uma major "disponível": é uma promessa.
 *
 * O registro tem a tag `prev` para a versão estável anterior ao RC, e é ela
 * que diz a major estável real. Quando não existe `prev` (o pacote nunca
 * teve RC), o `latest` é usado — mas só se não for pre-release.
 */
function majorNoRegistro(pacote: string): number | null {
  try {
    const out = execFileSync('npm', ['view', pacote, 'dist-tags', '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
    });
    const tags = JSON.parse(out) as Record<string, string>;

    // A tag `prev` é a estável anterior a um RC; ela é a fonte da major real.
    const candidatas = [tags.prev, tags.latest].filter((v): v is string => !!v);
    for (const versao of candidatas) {
      if (isPreRelease(versao)) continue;
      const m = versao.match(/^(\d+)/);
      if (m) return Number(m[1]);
    }
    return null;
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

void main();
