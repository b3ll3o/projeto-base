// .tooling/scripts/ci/check-harness-owner.spec.ts
//
// Testes do check de CONTROLE DESLIGADO — task 3.4 do plano
// docs/superpowers/plans/2026-10-03-guard-classes.md.
//
// Regra geral, duas instâncias:
//
//   (a) todo harness referenciado é INVOCADO por algo
//   (b) todo destino declarado tem um guard LIGADO
//
// A (a) NASCE VERMELHA, e o plano diz por quê: *"o aceite é o check
// disparar, não ele virar verde"*. Um detector de dívida que só descreve
// como o mundo deveria ficar não mede nada — ele mede o quanto o mundo
// está devendo. A (a) só esverdeia na task 4.1, quando o differential
// ganha dono.

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  checkHarnessOwner,
  findOwners,
  harnessFiles,
  orphanDestinationRules,
  orphanHarnesses,
} from './check-harness-owner.js';
import { PROTECTED_DESTINATION } from './check-memory-dir-concordance.js';

const HARNESS = '.tooling/scripts/ci/turbo-redirect-differential.sh';

/**
 * Envelopa um trecho de fonte no formato que `OwnerSources` espera.
 *
 * MEDIDO 2026-10-08: a posse saiu de `main()` em `preflight.ts` para a lista
 * compartilhada `PREFLIGHT_CHECKS` de `preflight-gates.ts`, e junto saiu o
 * campo `file:` que o guard lê. Com o guard ainda apontando só para o
 * `preflight.ts`, `checkHarnessOwner()` acusou 3 harnesses órfãos num repo que
 * não tinha nenhum — o guard estava olhando a fonte que deixou de declarar.
 */
const comoFonte = (source: string, path = 'preflight.ts', simbolo = 'checks') => [
  { path, simbolo, source },
];

// ── (a) o que é harness ─────────────────────────────────────────────────────

describe('harnessFiles', () => {
  it('acha o harness .sh e ignora os módulos de gate', () => {
    expect(
      harnessFiles({
        [HARNESS]: '#!/usr/bin/env bash\n',
        '.tooling/scripts/ci/check-doc-refs.ts': '#!/usr/bin/env tsx\n',
        '.tooling/scripts/ci/check-doc-refs.spec.ts': '',
        '.tooling/scripts/ci/preflight.ts': '#!/usr/bin/env tsx\n',
        '.tooling/scripts/ci/check-types.ts': '',
      }),
    ).toEqual([HARNESS]);
  });

  it('acha um SEGUNDO harness de outra extensão, não só .sh', () => {
    // Classe 2 evitada. Um detector escrito contra o caso que ele conhece
    // (`turbo-redirect-differential.sh`, o único .sh) passa no teste e falha
    // no primeiro instrumento novo. O repo já tropeçou nessa: a task B29
    // precisou de um wrapper `.mts` para rodar um parser sob ESM.
    expect(
      harnessFiles({
        [HARNESS]: '#!/usr/bin/env bash\n',
        '.tooling/scripts/ci/agent-flow-differential.mts': '',
        'tooling/scripts/nao-e-harness.sh': '',
      }),
    ).toEqual(['.tooling/scripts/ci/agent-flow-differential.mts', HARNESS]);
  });

  it('um .ts que NÃO é check-* e tem shebang é harness', () => {
    // O discriminador é "executado por outro runtime", não "não é .ts": um
    // `measure-helper.ts` com shebang, que o preflight não roda e sim outro
    // instrumento executa, é instrumental — e o dono dele também precisa
    // existir. Um `.ts` sem shebang é um módulo, e módulo não é executado
    // diretamente.
    expect(
      harnessFiles({ '.tooling/scripts/ci/measure-helper.ts': '#!/usr/bin/env tsx\n' }),
    ).toEqual(['.tooling/scripts/ci/measure-helper.ts']);
    expect(harnessFiles({ '.tooling/scripts/ci/measure-helper.ts': '' })).toEqual([]);
  });
});

// ── (a) quem é o dono ────────────────────────────────────────────────────────

describe('findOwners', () => {
  const PREFLIGHT_SEM_DONO = `const checks = [{ name: 'x', file: '.tooling/scripts/ci/check-doc-refs.ts' }];`;
  const PREFLIGHT_COM_DONO = `const checks = [{ name: 'd', file: '${HARNESS}' }];`;

  it('o array checks do preflight é dono', () => {
    expect(
      findOwners(HARNESS, { poseSources: comoFonte(PREFLIGHT_COM_DONO), packageJsonScripts: {} }),
    ).toEqual(['preflight.ts#checks']);
  });

  it('qualquer script de package.json que EXECUTA o harness é dono', () => {
    // Invariante combinada com a task 4.1, escrita no plano: o dono pode ser
    // o `ci:local`. Sem este braço, a 4.1 teria duas respostas válidas e o
    // check só reconheceria uma delas.
    expect(
      findOwners(HARNESS, {
        poseSources: comoFonte(PREFLIGHT_SEM_DONO),
        packageJsonScripts: { 'ci:local': `pnpm ci:preflight && bash ${HARNESS}` },
      }),
    ).toEqual(['package.json#scripts.ci:local']);
  });

  it('a MENÇÃO no corpo de um script não é dono', () => {
    // `echo "rode turbo-redirect-differential.sh"` cita e não executa. Sem o
    // limite por token, o check daria o crédito a uma menção — que é a forma
    // mais barata de um controle continuar desligado com a proibição em mãos.
    expect(
      findOwners(HARNESS, {
        poseSources: comoFonte(PREFLIGHT_SEM_DONO),
        packageJsonScripts: { docs: `echo "veja ${HARNESS} no backlog"` },
      }),
    ).toEqual([]);
  });

  it('a MENÇÃO em comentário do preflight não é dono', () => {
    // Os docstrings do preflight citam paths de gate o tempo todo. Reconhecer
    // citação como registro é o que faria o check passar calado sobre o
    // differential — que é o estado em que o repo está hoje.
    expect(
      findOwners(HARNESS, {
        poseSources: comoFonte(`// ver \`${HARNESS}\`\nconst checks = [];`),
        packageJsonScripts: {},
      }),
    ).toEqual([]);
  });

  it('sem dono, lista vazia', () => {
    expect(
      findOwners(HARNESS, { poseSources: comoFonte(PREFLIGHT_SEM_DONO), packageJsonScripts: {} }),
    ).toEqual([]);
  });

  it('dois donos são nomeados, não um', () => {
    expect(
      findOwners(HARNESS, {
        poseSources: comoFonte(PREFLIGHT_COM_DONO),
        packageJsonScripts: { 'ci:local': HARNESS },
      }),
    ).toEqual(['preflight.ts#checks', 'package.json#scripts.ci:local']);
  });
});

// ── (a) o veredito ───────────────────────────────────────────────────────────

describe('orphanHarnesses', () => {
  it('o repo real tem um harness ÓRFÃO, e o check o NOMEIA', () => {
    const r = orphanHarnesses({
      harnesses: [HARNESS],
      poseSources: comoFonte('const checks = [];'),
      packageJsonScripts: {},
    });
    expect(r.ok).toBe(false);
    expect(r.orphans).toEqual([HARNESS]);
  });

  it('um SEGUNDO harness sem dono: o check nomeia os DOIS', () => {
    // A prova que o plano pede. Um detector que só conhece o caso pelo qual
    // foi escrito não é um detector: é uma descrição.
    const segundo = '.tooling/scripts/ci/segundo-differential.sh';
    const r = orphanHarnesses({
      harnesses: [HARNESS, segundo],
      poseSources: comoFonte('const checks = [];'),
      packageJsonScripts: {},
    });
    expect(r.orphans).toEqual([HARNESS, segundo]);
  });

  it('com dono, não há órfão', () => {
    const r = orphanHarnesses({
      harnesses: [HARNESS],
      poseSources: comoFonte(`const checks = [{ file: '${HARNESS}' }];`),
      packageJsonScripts: {},
    });
    expect(r.orphans).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

// ── (b) todo destino declarado tem guard ligado ──────────────────────────────

describe('orphanDestinationRules', () => {
  it('um destino cujo guard NÃO está ligado é vermelho e nomeado', () => {
    const r = orphanDestinationRules({
      destinations: [
        {
          destino: 'result file da retrospectiva',
          fonteCanonica: 'a.md',
          guard: 'check-memory-dir-concordance',
        },
        { destino: 'destino do X11', fonteCanonica: 'b.md', guard: 'check-x11-owner' },
      ],
      wiredGuards: ['.tooling/scripts/ci/check-memory-dir-concordance.ts'],
    });
    expect(r.ok).toBe(false);
    expect(r.orphans).toEqual(['check-x11-owner']);
  });

  it('o destino real tem guard ligado — a instância (b) está verde desde 1.3', () => {
    const r = orphanDestinationRules({
      destinations: DESTINATIONS,
      wiredGuards: ['.tooling/scripts/ci/check-memory-dir-concordance.ts'],
    });
    expect(r.orphans).toEqual([]);
  });

  it('a tabela de destinos vem do GUARD, não de uma lista re-declarada aqui', () => {
    // Se `DESTINATIONS` fosse uma cópia local, ela envelheceria no cenário em
    // que é usada: alguém declara o segundo destino no guard e esquece de
    // acrescentá-lo aqui — e o check, que existe para pegar essa omissão,
    // fica calado sobre ela.
    expect(DESTINATIONS).toContain(PROTECTED_DESTINATION);
  });
});

// ── o repo de verdade ───────────────────────────────────────────────────────

describe('checkHarnessOwner contra o repo real', () => {
  it('a dívida fechou na 4.1: o differential tem dono e o check está verde', () => {
    const r = checkHarnessOwner();
    expect(r.orphans).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    // O vermelho é o que FAZ este check valer, e é o que ele perde se a
    // alguém religar sem dono: o próximo teste prova que voltar a ser órfão
    // o deixa vermelho de novo. Assertar `ok: true` sozinho — sem a lista de
    // órfãos — é o "só afirma verde" que a coluna Nível proíbe.
    expect(r.errors.join('\n')).not.toContain('turbo-redirect-differential.sh');
  });

  it('perder o dono do differential o torna órfão DE NOVO, nomeado', () => {
    // Este é o dente do teste acima, e ele é a CONTRADIÇÃO do estado atual:
    // se o `file:` do differential sair do array `checks` do preflight, o
    // check volta a accusing-lo. Sem esta assimetria, "verde" e "não faz
    // nada" são indistinguíveis — a classe 1 com o nome de detecção de dívida.
    //
    // A pergunta vai ao PARSER DE PRODUÇÃO (`findOwners`), e não a uma
    // releitura do `preflight.ts` escrita aqui: um spec que reimplementa a
    // regra cobre só a forma que ele mesmo escreveu — a classe 2 — e o verde
    // do check e o verde deste teste deixam de ser a mesma coisa sem ninguém
    // perceber.
    // A posse do differential vive na lista compartilhada, não no `preflight.ts`.
    // Ler a fonte errada aqui daria um spec verde sobre um guard cego — e foi
    // exatamente o que aconteceu quando o array saiu de `main()`: o guard ficou
    // verde nos specs sintéticos e vermelho no repo real, ao mesmo tempo.
    const src = readFileSync(join(process.cwd(), '.tooling/scripts/ci/preflight-gates.ts'), 'utf8');
    expect(
      findOwners(HARNESS, {
        poseSources: comoFonte(src, 'preflight-gates.ts', 'PREFLIGHT_CHECKS'),
        packageJsonScripts: {},
      }),
    ).toEqual(['preflight-gates.ts#PREFLIGHT_CHECKS']);
    // E o veredito derivado: com dono, nada órfão.
    expect(checkHarnessOwner().orphans).toEqual([]);
  });

  it('introduzir um SEGUNDO harness sem dono faz o check nomear os dois', () => {
    // MUTAÇÃO no disco, restaurada byte-exata. Sem isto, o teste acima prova
    // que o check conhece um nome — não que ele reage a um arquivo novo.
    //
    // `toEqual`, e não `toContain`: a lista tem que ser EXATAMENTE o probe.
    // Um `toContain` passaria com o differential de volta na lista — que é
    // justamente o estado que a 4.1 acabou de remover.
    const probe = join(process.cwd(), '.tooling/scripts/ci/segundo-differential-probe.sh');
    writeFileSync(probe, '#!/usr/bin/env bash\necho sonda\n');
    try {
      const r = checkHarnessOwner();
      expect(r.orphans).toEqual(['.tooling/scripts/ci/segundo-differential-probe.sh']);
      expect(r.ok).toBe(false);
    } finally {
      rmSync(probe, { force: true });
    }
  });

  it('a CLI e a função devolvem o MESMO erro', () => {
    // Um gate que só funciona quando importado e falha como CLI é metade de um
    // gate: o preflight chama por import, o humano chama por shell, e as duas
    // metades divergem sem ninguém ver — porque nada as compara. Aqui as duas
    // saídas são comparadas, texto a texto.
    //
    // A comparação roda num estado VERMELHO de propósito: com o check verde
    // os dois lados são vazios, e vazio contra vazio passa sem provar nada —
    // é a mesma armadilha do `3+`. O vermelho vem de um probe descartável,
    // não de uma dívida real.
    //
    // O binário é `node_modules/.bin/tsx`, e não `npx`: o `npx` escreve
    // `npm warn Unknown env config "reporter"` no **stderr**, e aí o teste
    // passava a comparar o aviso do launcher com o erro do gate — passando
    // por motivo errado na suíte isolada e falhando na completa. Um teste de
    // paridade que mede o launcher não mede o gate.
    const probe = join(process.cwd(), '.tooling/scripts/ci/cli-parity-probe.sh');
    writeFileSync(probe, '#!/usr/bin/env bash\necho sonda\n');
    try {
      const viaFuncao = checkHarnessOwner();
      expect(viaFuncao.ok).toBe(false);
      let stderr = '';
      let status = 0;
      try {
        execFileSync('node_modules/.bin/tsx', ['.tooling/scripts/ci/check-harness-owner.ts'], {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        stderr = (err as { stderr?: string }).stderr ?? '';
        status = (err as { status?: number }).status ?? 0;
      }
      expect(status).toBe(1);
      expect(stderr).toBe(viaFuncao.errors.join('\n') + '\n');
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
