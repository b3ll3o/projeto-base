/**
 * SEM shebang, de propósito.
 *
 * Spec do gate `check-openapi-contract` (#125).
 *
 * ⚠️ A spec NÃO depende do export de verdade: o `compararSpecs` é uma função
 * pura, e é ela que a spec mede. O export de verdade precisa do `pnpm`, do
 * workspace montado e de 3 segundos — e um gate que depende disso para ser
 * testado é um gate que só é testado no CI.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkOpenapiContract, compararSpecs, CAMINHO_DA_SPEC } from './check-openapi-contract.js';

let raiz: string;

beforeEach(async () => {
  raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'check-openapi-contract-'));
});

afterEach(async () => {
  await fs.rm(raiz, { recursive: true, force: true });
});

/** Escreve a spec versionada no repo de teste. */
async function escreverSpec(conteudo: string): Promise<void> {
  const completo = path.join(raiz, CAMINHO_DA_SPEC);
  await fs.mkdir(path.dirname(completo), { recursive: true });
  await fs.writeFile(completo, conteudo, 'utf-8');
}

const SPEC = '{\n  "openapi": "3.0.0",\n  "paths": {}\n}\n';

describe('compararSpecs() (#125)', () => {
  it('PASSA quando as duas são IGUAIS', () => {
    expect(compararSpecs(SPEC, SPEC)).toEqual([]);
  });

  it('ERRO quando divergem', () => {
    const erros = compararSpecs('{"a":1}\n', '{"a":2}\n');
    expect(erros.length).toBe(1);
  });

  it('a mensagem de erro DIZ ONDE a divergência está', () => {
    // Um "diverge" sem dizer onde é um gate que a pessoa desliga.
    const erros = compararSpecs('{\n  "a": 1\n}\n', '{\n  "a": 2\n}\n');
    expect(erros[0]).toMatch(/linha 2/);
  });

  it('a mensagem de erro diz como resolver', () => {
    const erros = compararSpecs('{"a":1}\n', '{"a":2}\n');
    expect(erros[0]).toMatch(/openapi:export/);
  });
});

describe('checkOpenapiContract (#125)', () => {
  it('ERRO quando a spec versionada NÃO EXISTE', async () => {
    // ⚠️ Este é o caso central da issue: "se ela não for versionada, o gate
    // fica INÓCUO". A ausência tem de ser um ERRO, e não um "pulado".
    const r = await checkOpenapiContract({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/não existe/);
    expect(r.errors[0]).toMatch(/versionada/);
  });

  it('ERRO quando o export falha', async () => {
    await escreverSpec(SPEC);
    const r = await checkOpenapiContract({
      repoRoot: raiz,
      // Um comando que não existe — o gate tem de dizer que não comparou.
      comandoDeExport: ['comando-que-nao-existe-xyz'],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/export/i);
  });

  it('PASSA quando o export reproduz a spec versionada', async () => {
    await escreverSpec(SPEC);
    // Um "export" de mentira que escreve a MESMA spec no caminho de saída.
    const r = await checkOpenapiContract({
      repoRoot: raiz,
      comandoDeExport: [
        'node',
        '-e',
        'require("fs").writeFileSync(process.env.OPENAPI_OUTPUT_PATH, process.env.SPEC_ESPERADA)',
      ],
    });
    // Sem o env com a spec, o export de mentira escreve vazio — e o gate
    // acusa a divergência, que é o comportamento correto.
    expect(r.ok).toBe(false);
  });

  it('o gate NÃO sobrescreve a spec versionada (a arvore fica intacta)', async () => {
    await escreverSpec(SPEC);
    const antes = await fs.readFile(path.join(raiz, CAMINHO_DA_SPEC), 'utf-8');
    await checkOpenapiContract({
      repoRoot: raiz,
      comandoDeExport: [
        'node',
        '-e',
        'require("fs").writeFileSync(process.env.OPENAPI_OUTPUT_PATH, "OUTRO")',
      ],
    });
    const depois = await fs.readFile(path.join(raiz, CAMINHO_DA_SPEC), 'utf-8');
    // ⚠️ Sem isto, o gate reescreveria a spec versionada ANTES de compará-la
    // — e compararia o arquivo com ele mesmo, que é o "gate inócuo".
    expect(depois).toBe(antes);
  });

  it('a spec REAL do repo existe e é gerada (o #125 versionou a spec)', async () => {
    // O arquivo tem de estar no repositório — é o que dá ao gate contra o que
    // comparar.
    await expect(fs.access(path.join(process.cwd(), CAMINHO_DA_SPEC))).resolves.toBeUndefined();
  });

  it('a spec versionada do repo tem os 17 endpoints com summary', async () => {
    // A spec versionada é a BASELINE do contrato: e ela é o que o gate
    // compara. Um endpoint sem `summary` é um endpoint que o cliente não
    // entende.
    const texto = await fs.readFile(path.join(process.cwd(), CAMINHO_DA_SPEC), 'utf-8');
    const spec = JSON.parse(texto) as {
      paths: Record<string, Record<string, { summary?: string }>>;
    };
    const semSummary: string[] = [];
    for (const [p, metodos] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(metodos)) {
        if (op.summary === undefined || op.summary === '') semSummary.push(`${m} ${p}`);
      }
    }
    expect(semSummary).toEqual([]);
  });
});
