/**
 * Spec do gate que dá dentes à regra "todos os testes devem estar passando".
 *
 * A regra, em [`tdd.md`](../../agents/specs/conventions/tdd.md): suíte que não
 * roda **não está verde**. Sem um gate, "todos os testes passando" é um critério
 * inerte sobre conjunto vazio — passa com zero testes, e ninguém percebe.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reconciliarTestSet, declaredNoOps, type Pacote } from './check-test-set-covered.js';

const RAIZ: string[] = [];
function tmp(doc = ''): string {
  const r = mkdtempSync(join(tmpdir(), 'testset-'));
  RAIZ.push(r);
  if (doc) writeFileSync(join(r, 'convention.md'), doc, 'utf-8');
  return r;
}
afterEach(() => {
  while (RAIZ.length > 0) rmSync(RAIZ.pop()!, { recursive: true, force: true });
});

const pkg = (name: string, scripts: Record<string, string>): Pacote => ({ name, scripts });

/** `ci:local` que roda as duas tasks em dois pacotes, como o do repo. */
const CI_LOCAL = 'turbo run lint test:unit test:e2e --filter=@projeto/api --filter=@projeto/web';

// ── a reconciliação ─────────────────────────────────────────────────────────

describe('reconciliarTestSet', () => {
  it('verde quando todo script test* roda no ci:local', () => {
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [pkg('@projeto/api', { 'test:unit': 'vitest run', 'test:e2e': 'vitest run' })],
      declarados: new Set(),
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('VERMELHO quando um pacote declara test* e o ci:local NÃO executa', () => {
    // O caso que a regra existe para pegar: `test:smoke` declarado no pacote,
    // ausente das tasks do ci:local. O script é verde (turbo nem o vê), o
    // preflight é verde — e a suíte nunca rodou.
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [
        pkg('@projeto/api', { 'test:unit': 'vitest run' }),
        pkg('@projeto/web', { 'test:unit': 'vitest run', 'test:smoke': 'playwright smoke' }),
      ],
      declarados: new Set(),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('test:smoke');
    expect(r.errors.join('\n')).toContain('@projeto/web');
  });

  it('VERMELHO quando o pacote tem o script mas está fora dos --filter', () => {
    // Task pedida, pacote não alcançado: o turbo não roda nada nesse pacote e
    // sai 0. `check-ci-local-scope` cobre a task; aqui o que importa é que o
    // `test*` dele some do conjunto sem ninguém ver.
    const r = reconciliarTestSet({
      ciLocal: 'turbo run test:unit --filter=@projeto/api',
      pacotes: [pkg('@projeto/novo', { 'test:unit': 'vitest run' })],
      declarados: new Set(),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/novo');
  });

  it('VERMELHO quando a exceção declarada NÃO é mais necessária (linha envelheceu)', () => {
    // A direção inversa: a tabela de exceções é uma promessa, e promessa não
    // cumprida é mentira. Sem esta direção, apagar a exceção depois que o
    // script passou a rodar deixaria a tabela mentindo em silêncio.
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [pkg('@projeto/api', { 'test:unit': 'vitest run' })],
      declarados: new Set(['@projeto/api#test:unit']),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('exceção declarada que não se aplica');
  });

  it('VERMELHO quando a exceção cita script que o pacote não tem', () => {
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [pkg('@projeto/api', { 'test:unit': 'vitest run' })],
      declarados: new Set(['@projeto/api#test:fantasma']),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/api#test:fantasma');
  });

  it('VERMELHO quando não há nenhum script test* no workspace', () => {
    // Conjunto vazio: sem esta linha, "todos os testes passam" passa por
    // vacuidade num workspace que perdeu todos os testes sem ninguém perceber.
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [pkg('@projeto/api', { lint: 'eslint .' })],
      declarados: new Set(),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('0 script');
  });

  it('VERMELHO quando o ci:local está ausente', () => {
    // Sem `ci:local` não há conjunto contra o qual reconciliar; sair verde
    // seria afirmar que a regra é cumprida por não haver regra.
    const r = reconciliarTestSet({
      ciLocal: undefined,
      pacotes: [pkg('@projeto/api', { 'test:unit': 'vitest run' })],
      declarados: new Set(),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('ci:local');
  });

  it('NÃO acusa script que é ALIAS de outro que roda (mesmo comando, mesmo pacote)', () => {
    // MEDIDO no repo: `@projeto/api#test` e `@projeto/api#test:unit` são
    // literalmente `vitest run --project unit`; idem `@projeto/web`. Só o
    // `test:unit` entra no ci:local. Acusar o `test` seria acusar um nome
    // duplicado do MESMO comando — a suíte roda, e dizer que não roda seria
    // mandar o autor declarar uma exceção para um script que já é executado.
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [pkg('@projeto/api', { 'test:unit': 'vitest run', test: 'vitest run' })],
      declarados: new Set(),
    });
    expect(r.errors).toEqual([]);
    // Mas o alias fica VISÍVEL: um nome duplicado é dívida de nome, não
    // dívida de execução, e ninguém deve ler o verde como "não vi nada".
    expect((r.advisories ?? []).join('\n')).toContain('@projeto/api#test');
  });

  it('AINDA acusa quando o comando é diferente do que roda', () => {
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [pkg('@projeto/api', { 'test:unit': 'vitest run', test: 'vitest run --coverage' })],
      declarados: new Set(),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/api#test');
  });

  it('NÃO acusa `lint-staged` nem `turbo:redirect` — o filtro é `test*`', () => {
    // Um filtro `test` solto casaria com `test-staged`/`testable-utils`.
    const r = reconciliarTestSet({
      ciLocal: CI_LOCAL,
      pacotes: [
        pkg('@projeto/api', {
          'test:unit': 'vitest run',
          'lint-staged': 'lint-staged',
          'test:coverage': 'vitest run --coverage',
        }),
      ],
      declarados: new Set(),
    });
    // `test:coverage` NÃO está no ci:local deste fixture: tem de ser acusado.
    // O que não pode acontecer é `lint-staged` entrar na conta.
    expect(r.errors.join('\n')).toContain('test:coverage');
    expect(r.errors.join('\n')).not.toContain('lint-staged');
  });
});

// ── o parse da tabela de exceções ───────────────────────────────────────────

describe('declaredNoOps', () => {
  const DOC = `
| Pacote | Script | Por quê |
|---|---|---|
| \`@projeto/shared-types\` | \`test\` | types-only |
| \`@projeto/eslint-config\` | \`test\` | sem suíte |
`;

  it('lê a tabela pelo NOME das colunas, não pela posição', () => {
    const md = `### Exceções\n\n${DOC}`;
    expect([...declaredNoOps(md)]).toEqual([
      '@projeto/shared-types#test',
      '@projeto/eslint-config#test',
    ]);
  });

  it('reordenar as colunas não quebra o parse', () => {
    const md = `### Exceções\n\n| Script | Por quê | Pacote |\n|---|---|---|\n| \`test\` | types-only | \`@projeto/shared-types\` |\n`;
    expect([...declaredNoOps(md)]).toEqual(['@projeto/shared-types#test']);
  });

  it('devolve vazio quando a tabela não existe — e o gate acusa o resto', () => {
    expect([...declaredNoOps('# tdd\n\nsem tabela aqui\n')]).toEqual([]);
  });
});
