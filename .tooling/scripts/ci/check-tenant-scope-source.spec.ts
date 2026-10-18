// .tooling/scripts/ci/check-tenant-scope-source.spec.ts
//
// Dentes do gate `check-tenant-scope-source`.
//
// A CLASSE que este spec fecha é a do gate que passa porque não mediu: o
// `escopoVemDaRota` devolvendo `false` para TUDO deixa a árvore real verde e o
// spec inteiro verde, e ninguém sabe qual dos dois está errado. Por isso o
// primeiro bloco não testa "o gate passa" — testa "o gate diz COMO VEIO DA
// ROTA, nomeando arquivo, linha e argumento", contra um fixture que tem a
// forma COMUM e a forma RARA.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  achamChamadasDeEscopo,
  checkTenantScopeSource,
  escopoVemDaRota,
  semRuido,
} from './check-tenant-scope-source.js';

function arvoreCom(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'escopo-'));
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const caminho = join(raiz, rel);
    mkdirSync(join(caminho, '..'), { recursive: true });
    writeFileSync(caminho, conteudo);
  }
  return raiz;
}

describe('checkTenantScopeSource', () => {
  it('🔴 acusa a forma COMUM: um `@Param` do MESMO arquivo indo para o escopo', () => {
    const raiz = arvoreCom({
      'tenancy.controller.ts': `
        @Post('tenants/:id/convites')
        async convidar(@Param('id') tenantId: string) {
          return comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) => tx.a.findMany());
        }
      `,
    });

    const r = checkTenantScopeSource({ srcRoot: raiz });

    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('QUE VEIO DA ROTA');
    expect(r.errors[0]).toContain('amarrado a um decorator de rota');
    // O erro precisa ser APONTÁVEL: arquivo, linha e o argumento literal.
    expect(r.errors[0]).toContain('tenancy.controller.ts');
    expect(r.errors[0]).toMatch(/tenancy\.controller\.ts:\d+ — `escopoDoTenant\(… tenantId …\)`/);
  });

  it('🔴 acusa a forma RARA: acesso direto a `request` dentro do escopo', () => {
    // A forma que alguém copia da primeira: o header lido na mão. As DUAS
    // chamadas da linha são UM furo — acusar duas vezes manda quem lê procurar
    // dois bugs num só.
    const raiz = arvoreCom({
      'repo.ts': `await comEscopo(this.prisma, escopoDoTenant(request.headers['x-tenant-id']), fn);`,
    });

    const r = checkTenantScopeSource({ srcRoot: raiz });

    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('request.headers');
  });

  it('o resíduo cross-file é CONTADO, e não virado acusação nem silêncio', () => {
    // O repositório recebe o id de outro arquivo: o texto não prova de onde
    // veio. Um gate que acusasse aqui acusaria todos os call sites do repo; um que
    // não dissesse nada esconderia o resíduo. O número é o meio-termo.
    const raiz = arvoreCom({
      'tenancy.controller.ts': `async convidar(@Param('id') tenantId: string) { return this.repo.listar(tenantId); }`,
      'repo.ts': `async listar(tenantId: string) { return comEscopo(this.prisma, escopoDoTenant(tenantId), fn); }`,
    });

    const r = checkTenantScopeSource({ srcRoot: raiz });

    expect(r.errors).toEqual([]);
    // Duas: `comEscopo` e o `escopoDoTenant` aninhado. Nenhuma nomeia a rota.
    expect(r.advisories?.[1]).toContain('2 call site(s) abriram o escopo SEM PROVA');
    expect(r.advisories?.[1]).toContain('exige mudar a assinatura');
    // MEDIDO 2026-10-17: o advisory dizia "fechar exige mudar a assinatura" sem
    // o resto, e a prosa do cabeçalho prometia que o número avisava quando
    // crescia — NÃO há gate que compare com o run anterior. A spec fixa a frase
    // honesta para que a promessa antiga não volte por reescrita de prosa.
    expect(r.advisories?.[1]).toContain('Nenhum gate compara este número com o do run anterior');
  });

  it('o corpus real do repo está VERDE e o gate diz quantos call sites mediu', () => {
    const r = checkTenantScopeSource({ srcRoot: 'apps/api/src' });

    expect(r.errors).toEqual([]);
    // O número é o que separa "a classe está fechada" de "o corpus sumiu".
    // MEDIDO 2026-10-17: 66 chamadas. MEDIDO 2026-10-18 (#106): 68 — as duas a
    // mais são `perfilEfetivoPorUsuario` em `prisma-user.repository.ts`, que
    // abre o escopo para ler `tenant_memberships`. Subir o número com o PR que
    // o mediu é o comportamento certo deste gate: ele conta, não julga.
    expect(r.advisories?.[0]).toContain('68 call site(s)');
  });

  it('🔴 corpus VAZIO é vermelho — o gate não pode reportar verde sem medir', () => {
    const raiz = arvoreCom({ 'vazio.ts': `export const nada = 1;` });

    const r = checkTenantScopeSource({ srcRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('ZERO call sites');
  });

  it('`*.spec.ts` fica de fora — o gate mede código que roda, não o que testa', () => {
    const raiz = arvoreCom({
      'algo.spec.ts': `const x = escopoDoTenant(request.params.id);`,
    });

    const r = checkTenantScopeSource({ srcRoot: raiz });

    // Zero chamadas porque só havia spec: e o gate DIZ isso, em vez de virarse.
    expect(r.errors[0]).toContain('ZERO call sites');
  });

  it('🔴 um comentário que documenta o furo NÃO vira defeito — e a linha não desloca', () => {
    // MEDIDO no repo: `auth-use-cases.ts:95`, `user-repository.port.ts:61` e
    // `users.controller.ts:169` citam `escopoDoTenant(null)` em prosa. Um gate
    // que acusa a própria documentação é um gate que a gente começa a desligar.
    const raiz = arvoreCom({
      'repo.ts': [
        '// a remoção de membro usa escopoDoTenant(request.params.id), e isso é um furo',
        '/* e aqui embaixo: escopoDoTenant(headers["x-tenant-id"]) */',
        'export const ok = escopoDoTenant(tenantId);',
      ].join('\n'),
    });

    const r = checkTenantScopeSource({ srcRoot: raiz });

    expect(r.errors).toEqual([]);
    expect(r.advisories?.[0]).toContain('1 call site(s)');
    // A linha precisa ser a 3 — remover comentário sem preservar \n desloca o
    // número e manda quem lê procurar o defeito no lugar errado.
    expect(achamChamadasDeEscopo(readFileSync(join(raiz, 'repo.ts'), 'utf8'))[0]?.linha).toBe(3);
  });

  it('a DEFINIÇÃO dos helpers não conta como chamada — senão acusa `escopo.ts`', () => {
    const achadas = achamChamadasDeEscopo(`
      export function escopoDoTenant(tenantId: string | null): string { return ''; }
      export async function abrirEscopo(tx: T, escopo: string) {}
      export async function comEscopo(p: P, escopo: string, fn: F) {}
    `);

    expect(achadas).toEqual([]);
  });

  it('o aninhamento `comEscopo(p, escopoDoTenant(x), fn)` conta as DUAS chamadas', () => {
    const achadas = achamChamadasDeEscopo(
      `await comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) => tx.user.findMany({ where: { a: 1 } }));`,
    );

    expect(achadas).toHaveLength(2);
    expect(achadas.map((c) => c.funcao).sort()).toEqual(['comEscopo', 'escopoDoTenant']);
    // O escopo do `comEscopo` é o SEGUNDO argumento, e não uma fração do callback.
    expect(achadas.find((c) => c.funcao === 'comEscopo')?.escopo).toBe('escopoDoTenant(tenantId)');
  });

  it('🔴 `abrirEscopo` lê o escopo no SEGUNDO argumento, como `comEscopo`', () => {
    // Se os dois lessem o primeiro, `abrirEscopo(tx, body.tenantId)` passaria
    // por alto — e é literalmente a assinatura do `provisionarEmpresaPropria`.
    expect(escopoVemDaRota('body.tenantId')).toBe(true);
    const raiz = arvoreCom({ 'onboarding.ts': `await abrirEscopo(tx, params.tenantId);` });
    expect(checkTenantScopeSource({ srcRoot: raiz }).errors).toHaveLength(1);
  });

  it('um valor de DOMÍNIO não é valor de rota — o gate não pode ser ruidoso', () => {
    for (const escopo of [
      'tenantId',
      'null',
      'ctx.tenantId',
      'input.ctx.tenantId',
      'profile.tenantId()',
      'convite.tenantId',
      'atual.tenantId',
      'escopo',
      'tenant.id',
    ]) {
      expect(escopoVemDaRota(escopo), `${escopo} não devia ser acusada`).toBe(false);
    }
  });

  it('o comentário de LINHA não engole a chamada seguinte (o `:` do ternário)', () => {
    const limpo = semRuido(`const a = b ? c : d; // escopoDoTenant(x)\nconst e = 1;`);
    expect(limpo).not.toContain('escopoDoTenant');
    expect(limpo).toContain('const a = b ? c : d;');
  });

  // ── Dentes dos furos que o revisor mediu em 2026-10-17 ──────────────────
  // Os três de abaixo passaram pelo gate antes da correção, e os três são a
  // mesma classe: um literal tratado como sintaxe. A primeira versão engole o
  // resto da linha (o call site SAI do corpus, e a contagem defasa em silêncio);
  // a segunda parte o argumento no lugar errado; a terceira volta do nada para
  // dentro de um "argumento" que era texto.

  it('🔴 `//` dentro de string NÃO come o call site do fim da linha', () => {
    // ⚠️ O call site é DA MESMA LINHA, e isso é o teste inteiro. MEDIDO
    // 2026-10-18 (achado do revisor): com um `\n` entre a string e a chamada,
    // a cauda que o `//` comeria era VAZIA — e a string neutra e a string
    // tratada davam as DUAS a mesma resposta, então o teste passava com o
    // defeito presente. O `\n` saiu e a asserção passou a ler `linha === 1`.
    const achadas = achamChamadasDeEscopo(
      `const u = 'x//y'; await escopoDoTenant(request.params.id);`,
    );
    expect(achadas).toHaveLength(1);
    // `?.` e não `!`: o `toHaveLength(1)` acima é que garante que existe — e
    // `expect(undefined).toBe(1)` falha, então o `?.` não abre vácuo. MEDIDO
    // 2026-10-17: sem ele, `noUncheckedIndexedAccess` deixa o `tsc` vermelho
    // enquanto o Vitest roda verde (a classe de `spec-verde-com-tsc-vermelho`).
    expect(achadas[0]?.linha).toBe(1);
  });

  it('🔴 vírgula dentro de string NÃO parte o argumento de escopo', () => {
    const achadas = achamChamadasDeEscopo(
      `await escopoDoTenant('padrao,invalido' + request.params.id);`,
    );
    expect(achadas).toHaveLength(1);
    // Antes da correção o escopo saía como `'padrao` e a rota nunca era lida.
    expect(achadas[0]?.escopo).toContain('request.params.id');
  });

  it('🔴 parêntese dentro de string NÃO rouba o fim da chamada', () => {
    const achadas = achamChamadasDeEscopo(`await escopoDoTenant(sufixo(')') + request.query.t);`);
    expect(achadas).toHaveLength(1);
    expect(achadas[0]?.escopo).toContain('request.query.t');
  });

  it('o `//` de um comentário NÃO abre uma string que engole o arquivo', () => {
    // A aspa de `don't` iniciava string e limpava o resto do arquivo inteiro.
    const limpo = semRuido(`// don't\nconst a = 1;\nawait escopoDoTenant(x);`);
    expect(limpo).toContain('const a = 1;');
    expect(limpo).toContain('await escopoDoTenant(x);');
  });
});
