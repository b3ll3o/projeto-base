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
 * O primeiro caminho em que dois valores JSON divergem.
 *
 * Devolve `null` quando são iguais (considerando a ORDEM das chaves
 * irrelevante: o `JSON.stringify` do `DocumentBuilder` pode emitir as chaves
 * numa ordem e o prettier reordena o objeto inteiro).
 */
export function primeiroDivergente(a: unknown, b: unknown, caminho = ''): string | null {
  if (Object.is(a, b)) return null;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return `${caminho} (${a.length} itens no versionado, ${b.length} no gerado)`;
    }
    for (let i = 0; i < a.length; i++) {
      const d = primeiroDivergente(a[i], b[i], `${caminho}[${i}]`);
      if (d !== null) return d;
    }
    return null;
  }

  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const chave of [...chaves].sort()) {
      const d = primeiroDivergente(
        (a as Record<string, unknown>)[chave],
        (b as Record<string, unknown>)[chave],
        caminho === '' ? chave : `${caminho}.${chave}`,
      );
      if (d !== null) return d;
    }
    return null;
  }

  return caminho === '' ? '(a raiz)' : caminho;
}

/**
 * Compara a spec GERADA com a VERSIONADA.
 *
 * ⚠️ A comparação é **SEMÂNTICA** (o JSON parseado), e não byte a byte —
 * e a razão é o `prettier`: o `lint-staged` reformatta o `.json` versionado
 * no commit, e um array curto como `"tags": ["Health"]` vira
 * `"tags": ["Health"]` em uma linha no versionado e em três no gerado. Um
 * gate byte-a-byte reprovaria por isso — e o primeiro_gate-que-não-pode-falhar
 * é o que não pode reprovar por formatação.
 *
 * A comparação semântica é a mais forte aqui: ela pega a diferença que
 * importa (um campo, um valor, um item a mais) e ignora a que não importa
 * (espaçamento, ordem das chaves).
 */
export function compararSpecs(gerada: string, versionada: string): string[] {
  const errors: string[] = [];

  if (gerada.trim() === versionada.trim()) return errors;

  const geradaJson = tentaJson(gerada);
  const versionadaJson = tentaJson(versionada);

  if (geradaJson !== null && versionadaJson !== null) {
    const divergente = primeiroDivergente(versionadaJson, geradaJson);
    if (divergente === null) return errors; // iguais no conteúdo
    errors.push(
      `O OpenAPI versionado (${CAMINHO_DA_SPEC}) diverge do que o código gera ` +
        `(${COMANDO_DE_EXPORT.join(' ')}) em: ${divergente}. ` +
        `Rode o export e commite o arquivo: a spec versionada é a baseline do contrato.`,
    );
    return errors;
  }

  // Um dos dois não é JSON válido — a comparação semântica é impossível, e a
  // diferença de TEXTO é a única informação que há.
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

/** `JSON.parse` que devolve `null` em vez de lançar. */
function tentaJson(texto: string): unknown | null {
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
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
