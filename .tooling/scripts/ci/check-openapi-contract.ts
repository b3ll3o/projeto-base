/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do #125: o documento OpenAPI versionado divergir do
 * que o código gera.
 *
 * A issue acerta o ponto: "o gate compara a spec versionada com a gerada, e
 * ela é gerada por um script — se ela não for versionada, o gate fica
 * INÓCUO". Sem a spec no repositório, o gate não teria contra o que
 * comparar, e a derivação do `@Api*` decorator viraria a única fonte — que é
 * justamente o que se quer perder.
 *
 * A comparação é de TEXTO INTEIRO, e não de semântica: um `JSON.parse` dos
 * dois lados e uma comparação de campos deixaria passar uma reformatação
 * (chave reordenada, espaço a mais) que é ruído — e também deixaria passar
 * um campo a mais que é a DIFFERENÇA que interessa. O arquivo é gerado por
 * uma ferramenta, então é determinístico: byte a byte.
 *
 * ⚠️ O EXPORT NÃO PRECISA DE BANCO. O `export-openapi.ts` monta a aplicação
 * com um `PrismaService` stub e um `JWT_SECRET` stub — não há conexão nem
 * migration no caminho. É o que faz o gate poder rodar em todo preflight.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CheckResult } from './check-types';

/** O caminho da spec versionada, relativo à raiz do repo. */
export const CAMINHO_DA_SPEC = 'apps/api/openapi.json';

/** O comando que regenera a spec (relativo à raiz do repo). */
export const COMANDO_DE_EXPORT = [
  'pnpm',
  '--config.engine-strict=false',
  '--filter',
  '@projeto/api',
  'run',
  'openapi:export',
];

/**
 * Compara a spec GERADA com a VERSIONADA.
 *
 * Função pura, e separada do gate de propósito: a spec não pode depender do
 * export de verdade (que é lento e frágil) — ela mede a COMPARAÇÃO, que é
 * onde o veredito mora.
 */
export function compararSpecs(gerada: string, versionada: string): string[] {
  const errors: string[] = [];

  if (gerada.trim() === versionada.trim()) return errors;

  // A diferença precisa ser LIDA, não só contada: "diverge" sem dizer onde
  // é um gate que a pessoa desliga.
  const linhasGeradas = gerada.split('\n');
  const linhasVersionadas = versionada.split('\n');
  const diferente = linhasGeradas.findIndex((linha, i) => linha !== linhasVersionadas[i]);

  errors.push(
    `O OpenAPI versionado (${CAMINHO_DA_SPEC}) diverge do que o código gera ` +
      `(${COMANDO_DE_EXPORT.join(' ')}). ` +
      `Primeira diferença na linha ${diferente + 1}. ` +
      `Rode o export e commite o arquivo: a spec versionada é a baseline do contrato.`,
  );

  return errors;
}

/**
 * Gate: a spec versionada é igual à spec gerada.
 */
export async function checkOpenapiContract(opts: {
  repoRoot: string;
  /**
   * O comando de export. Injetável para a spec não depender do export real
   * (que precisa do `pnpm` e do workspace montado).
   */
  comandoDeExport?: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);
  const caminhoSpec = path.join(root, CAMINHO_DA_SPEC);

  let versionada: string;
  try {
    versionada = await fs.readFile(caminhoSpec, 'utf-8');
  } catch {
    return {
      ok: false,
      errors: [
        `${CAMINHO_DA_SPEC} não existe — e ele PRECISA existir (#125): o gate compara a spec ` +
          `versionada com a gerada, e sem a versionada o gate fica inócuo. ` +
          `Rode \`${COMANDO_DE_EXPORT.join(' ')}\` e commite o arquivo.`,
      ],
    };
  }

  const comando = opts.comandoDeExport ?? COMANDO_DE_EXPORT;

  // ⚠️ O export ESCREVE no arquivo. Sem um caminho de saída próprio, o gate
  // sobrescreveria a spec versionada ANTES de compará-la — e compararia o
  // arquivo com ele mesmo, que é o "gate inócuo" que a issue descreve. Por
  // isso o export vai para um arquivo temporário, e a árvore de trabalho não
  // é tocada.
  const temporario = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'openapi-contract-')),
    'openapi.json',
  );

  let gerada: string;
  try {
    execFileSync(comando[0]!, comando.slice(1), {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, OPENAPI_OUTPUT_PATH: temporario },
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    return {
      ok: false,
      errors: [
        `O export do OpenAPI falhou (\`${comando.join(' ')}\`): ` +
          `${stderr.trim() || (err as Error).message}. ` +
          `Sem a spec gerada, o gate não tem contra o que comparar.`,
      ],
    };
  }

  try {
    gerada = await fs.readFile(temporario, 'utf-8');
  } catch {
    return {
      ok: false,
      errors: [
        `O export não produziu a spec em \`${temporario}\` — o gate não tem o que comparar.`,
      ],
    };
  } finally {
    await fs.rm(path.dirname(temporario), { recursive: true, force: true });
  }

  errors.push(...compararSpecs(gerada, versionada));

  return { ok: errors.length === 0, errors };
}
