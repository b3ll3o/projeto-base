/**
 * Spec do gate de contrato das feature flags.
 *
 * Os fixtures abaixo cobrem as DUAS direções do diff, e cada uma tem um alvo
 * vermelho explícito. Um gate que só prova o caminho verde passa com uma
 * função que devolve `{ok: true}` — por isso nenhum teste aqui aceita "não
 * lancei erro" como prova.
 *
 * O último bloco roda contra os arquivos REAIS do repositório, que é o que
 * distingue o gate de uma spec que só mede os fixtures escolhidos por quem
 * escreveu o gate.
 */

import { describe, it, expect } from 'vitest';
import { checkFeatureFlagContract } from './check-feature-flag-contract';

const CATALOGO_DUAS = `export const FEATURE_FLAGS = [
  {
    chave: 'tenancy.invites',
    descricao: 'Emissão e aceite de convites.',
  },
  {
    chave: 'telemetry.otel',
    descricao: 'Telemetria OTel no servidor.',
  },
] as const;`;

const CONTRATO_IGUAL = `\`\`\`json
[
  { "chave": "tenancy.invites", "descricao": "Emissão e aceite de convites." },
  { "chave": "telemetry.otel", "descricao": "Telemetria OTel no servidor." }
]
\`\`\``;

const roda = (catalogoTexto: string, contratoTexto: string) =>
  checkFeatureFlagContract({ catalogoTexto, contratoTexto });

describe('checkFeatureFlagContract — as duas direções do diff', () => {
  it('alinhado: verde', () => {
    const r = roda(CATALOGO_DUAS, CONTRATO_IGUAL);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('DIREÇÃO 1 — descrição que mudou no catálogo e não seguiu o contrato é ERRO', () => {
    const catalogo = CATALOGO_DUAS.replace('Emissão e aceite', 'Emissão apenas');
    const r = roda(catalogo, CONTRATO_IGUAL);

    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('tenancy.invites');
    expect(r.errors[0]).toContain('Emissão apenas');
  });

  it('DIREÇÃO 2 — chave que o contrato exemplifica e o catálogo não tem é ERRO', () => {
    const r = roda(CATALOGO_DUAS, `${CONTRATO_IGUAL}\n  { "chave": "tenancy.exports" }`);

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('tenancy.exports'))).toBe(true);
  });

  it('a chave que SAI do catálogo e deixa o exemplo para trás é ERRO, não silêncio', () => {
    // É o modo de falha que a direção 1 não pega: a descrição some junto, então
    // o contrato continua bem formado e descreve um recurso que não existe.
    const catalogo = `export const FEATURE_FLAGS = [
  { chave: 'telemetry.otel', descricao: 'Telemetria OTel no servidor.' },
] as const;`;
    const r = roda(catalogo, CONTRATO_IGUAL);

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('tenancy.invites'))).toBe(true);
  });
});

describe('checkFeatureFlagContract — anti-vacuuidade', () => {
  it('catálogo com ZERO chaves é ERRO, não verde', () => {
    // A classe 5 de `guard-classes.md` aplicada ao próprio gate: um check que
    // não mediu nada não pode reportar sucesso.
    const r = roda('export const FEATURE_FLAGS = [] as const;', CONTRATO_IGUAL);

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('ZERO chaves');
  });

  it('contrato com ZERO chaves é ERRO', () => {
    const r = roda(CATALOGO_DUAS, '# Contrato\n\nSem exemplo nenhum.\n');

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('ZERO'))).toBe(true);
  });

  it('chave do catálogo SEM `descricao` é ERRO — não é uma chave a menos em silêncio', () => {
    // O `Math.min` do pareamento por POSIÇÃO truncava no menor dos dois arrays:
    // a chave excedente não entrava no mapa, não gerava erro e não mudava
    // contagem nenhuma. O advisory — a única saída que nomeia a contagem — então
    // afirmava "1 chave conferida" num catálogo que tinha 2. É a classe que a
    // §4 de `guard-classes.md` proíbe, dentro do gate que a §4 motivou.
    const catalogo = `export const FEATURE_FLAGS = [
  {
    chave: 'tenancy.invites',
    descricao: 'Emissão e aceite de convites.',
  },
  { chave: 'tenancy.outros' },
] as const;`;
    const r = roda(catalogo, CONTRATO_IGUAL);

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('tenancy.outros') && e.includes('descricao'))).toBe(
      true,
    );
    // E o advisory NÃO pode afirmar a contagem truncada: é o silêncio sobre a
    // contagem que fez o truncamento passar.
    expect(r.advisories).toHaveLength(0);
  });

  it('`descricao` a mais que `chave` também é ERRO, pelo mesmo motivo', () => {
    // O outro lado do desalinhamento: sobrou descrição, não sobrou chave.
    const catalogo = `export const FEATURE_FLAGS = [
  { chave: 'tenancy.invites', descricao: 'Emissão e aceite de convites.' },
  { descricao: 'Telemetria OTel no servidor.' },
] as const;`;
    const r = roda(catalogo, CONTRATO_IGUAL);

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('desalinhado') || e.includes('descricao'))).toBe(true);
  });

  it('descrição VAZIA no catálogo é ERRO — includes de string vazia sempre casa', () => {
    // MEDIDO 2026-10-19 por auditoria independente: plantar `descricao: ''` no
    // catálogo real dava EXIT=0, e o advisory ainda afirmava "1 chave conferida
    // nos dois sentidos". `''.includes('')` é sempre verdadeiro, então a
    // direção 1 não media nada — e o relatório dizia que media. É a §4 de
    // `guard-classes.md` aplicada ao VALOR, não à contagem: `catalogo.size`
    // estava guardado, `descricao === ''` não. O próprio JSDoc do catálogo diz
    // "sem descrição a linha não se explica".
    const catalogo = `export const FEATURE_FLAGS = [
  { chave: 'tenancy.invites', descricao: '' },
  { chave: 'telemetry.otel', descricao: 'Telemetria OTel no servidor.' },
] as const;`;
    const r = roda(catalogo, CONTRATO_IGUAL);

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('tenancy.invites') && e.includes('descrição'))).toBe(
      true,
    );
    expect(r.advisories).toHaveLength(0);
  });

  it('descrição que só é SUBSTRING do contrato é ERRO — comparar texto não é comparar valor', () => {
    // MEDIDO 2026-10-19: `descricao: 'tenancy.invites'` passava, porque a
    // string aparece no contrato — mas como o VALOR da `chave`, não da
    // `descricao`, e `includes` varre o documento inteiro sem perguntar "é a
    // descrição DESTE exemplo". Comparar por valor separa "a descrição está
    // no contrato" de "essa palavra está em algum lugar do contrato".
    const catalogo = CATALOGO_DUAS.replace('Emissão e aceite de convites.', 'tenancy.invites');
    const r = roda(catalogo, CONTRATO_IGUAL);

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('tenancy.invites'))).toBe(true);
  });

  it('o MESMO par repetido no contrato não vira "chave sem `descricao`"', () => {
    // MEDIDO 2026-10-19 contra o arquivo real: o contrato declara o par duas
    // vezes (a listagem §4 e o exemplo do PUT). O `Map` colapsa duplicata, então
    // contar por `pares.size` dava 1 iteração onde houve 2 — e acusava uma chave
    // sem `descricao` que estava ali, num gate cujo trabalho é acusar divergência.
    // O alarme falso é a forma de morrer de um gate de texto.
    const catalogo = `export const FEATURE_FLAGS = [
  { chave: 'tenancy.invites', descricao: 'Emissão e aceite de convites.' },
] as const;`;
    const contrato = `\`\`\`json
[
  { "chave": "tenancy.invites", "descricao": "Emissão e aceite de convites." }
]
\`\`\`
Request: { "chave": "tenancy.invites", "descricao": "Emissão e aceite de convites." }`;

    const r = roda(catalogo, contrato);

    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('a descrição atravessada por quebra de linha no catálogo ainda casa', () => {
    // O prettier quebra a string em linhas longas. Um leitor que não aceita
    // `\n?\s*` acusaria divergência no primeiro catálogo reformatado, e o gate
    // viraria alarme falso — que é a forma de morrer de um gate de texto.
    const descricao =
      'Emissão e aceite de convites por empresa. Desligar tranca as duas portas: nem o dono convida, nem quem tem token entra.';
    const catalogo = `export const FEATURE_FLAGS = [
  {
    chave: 'tenancy.invites',
    descricao:
      '${descricao}',
  },
] as const;`;
    const contrato = `\`\`\`json
  { "chave": "tenancy.invites", "descricao": "${descricao}" }
\`\`\``;

    expect(roda(catalogo, contrato).ok).toBe(true);
  });
});

describe('checkFeatureFlagContract — contra os arquivos REAIS do repositório', () => {
  // Spec escrita a partir do repo mede o repo. As specs acima medem fixtures
  // que EU escolhi — e um gate cujo único corpus é o fixture escolhido por quem
  // escreveu o gate não viu nada.
  it('o catálogo e o contrato no disco estão alinhados agora', () => {
    const r = checkFeatureFlagContract();

    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('o gate leu pelo menos UMA chave — a lista não está vazia', () => {
    // Positivo com DENTE: um gate que devolvesse `ok: true` sem ler nada
    // passaria no teste acima. Este diz quantas chaves ele viu.
    expect(checkFeatureFlagContract().advisories[0]).toMatch(/\d+ chave\(s\)/);
  });
});
