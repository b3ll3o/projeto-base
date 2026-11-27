import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARQUIVO_DE_EXCECOES,
  checkEventDriven,
  coletarEventos,
  corpoDaClasse,
  importsDe,
  moduloDoCaminho,
  prefixoEsperadoDoEvento,
  semComentarios,
  semStrings,
  type ExcecaoDeclarada,
} from './check-event-driven.js';

/**
 * Os dentes do gate `check-event-driven`.
 *
 * A regra é [`.agents/specs/conventions/event-driven.md`](../../specs/conventions/event-driven.md).
 * Cada teste abaixo planta a forma COMUM do defeito e exige o erro — o
 * contra-varia é o que prova que o erro vem da regra e não do formato da
 * fixture.
 */

const EVENTO_OK = `import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'users.user.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;

  constructor(aggregateId: string, version: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.occurredAt = occurredAt;
  }
}
`;

const CAMINHO_DO_EVENTO = 'apps/api/src/modules/users/domain/events/user-created.event.ts';
const CAMINHO_DO_HANDLER = 'apps/api/src/modules/users/application/handlers/usuario.handler.ts';

/** A árvore mínima: um evento, um handler, uma aplicação. */
function arvoreCom(arquivos: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(arquivos));
}

/** A árvore sadia: evento no formato, handler na camada `application`. */
function arvoreSadia(extra: Record<string, string> = {}): Map<string, string> {
  return arvoreCom({
    [CAMINHO_DO_EVENTO]: EVENTO_OK,
    [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

export function trata(evento: UserCreatedEvent): void {
  void evento.aggregateId;
}
`,
    ...extra,
  });
}

/** A exceção que declara "este evento ainda não tem consumidor". */
function excecaoDoEvento(chave = 'users.user.created.v1'): ExcecaoDeclarada {
  return {
    regra: 'ED5',
    chave,
    motivo: 'fixture: o evento não tem handler',
    ocorrencias: 1,
    verificacao: {
      tipo: 'evento-sem-handler',
      classe: 'UserCreatedEvent',
      arquivo: CAMINHO_DO_EVENTO,
    },
  };
}

describe('check-event-driven — as regras', () => {
  it('🔴 ED1: o nome do evento fora do formato `<bc>.<agregado>.<acao>.vN` é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace("'users.user.created.v1'", "'user-created'"),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('eventName') && e.includes('users.user.created.'))).toBe(
      true,
    );
  });

  it('🔴 ED1: o nome com o prefixo certo e SEM `vN` é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace("'users.user.created.v1'", "'users.user.created.v'"),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('vN'))).toBe(true);
  });

  it('🔴 ED1: o evento sem `version` é erro (o contrato precisa ser versionado)', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace('  readonly version: number;\n', ''),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('🔴 ED1: o evento que NÃO implementa `DomainEvent` é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace('implements DomainEvent', 'implements OutroContrato'),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('DomainEvent'))).toBe(true);
  });

  it('🔴 ED1: o evento que carrega segredo é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace(
        '  readonly version: number;',
        '  readonly version: number;\n  readonly senhaHash: string;',
      ),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('senhaHash'))).toBe(true);
  });

  it('🔴 ED1: o segredo com SUFIXO (`accessTokenExpiresAt`) também é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace(
        '  readonly version: number;',
        '  readonly version: number;\n  readonly accessTokenExpiresAt: Date;',
      ),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('accessTokenExpiresAt'))).toBe(true);
  });

  it('✅ ED1: o segredo em OUTRA classe do mesmo arquivo não é erro do evento', () => {
    // A checagem é do CORPO da classe do evento, não do arquivo (MEDIDO: o
    // helper no mesmo arquivo acusava o evento).
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: `${EVENTO_OK}\nexport class Auxiliar {\n  readonly token: string;\n}\n`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED1: o evento que mora fora de `domain/events/` é erro', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user-created.event.ts': EVENTO_OK,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    // A mensagem do CANONICO — e não o caminho, que também aparece na
    // mensagem de nome duplicado (MEDIDO: a asserção pelo path passava mesmo
    // com o conserto neutralizado).
    expect(r.errors.some((e) => e.includes('não mora em'))).toBe(true);
  });

  it('🔴 ED1: o arquivo de evento que o gate NÃO lê é erro (evento fora da medição)', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/events/user.updated.event.ts': `export class UserUpdatedEvent {
  readonly eventName = 'users.user.updated.v1';
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('NÃO leu'))).toBe(true);
  });

  it('🔴 ED2: dois eventos com o mesmo `eventName` é erro', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/events/user-created-outro.event.ts': EVENTO_OK.replace(
        'UserCreatedEvent',
        'OutroUserCreatedEvent',
      ),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('é declarado em 2 eventos'))).toBe(true);
  });

  it('🔴 ED3: evento construído fora do domínio é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

export function trata(): void {
  const evento = new UserCreatedEvent('id', 1, new Date());
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(true);
  });

  it('🔴 ED3: `new UserCreatedEvent` SEM parênteses (ou com genérico) também é emissão', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

export function trata(): void {
  const evento = new UserCreatedEvent<string>;
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(true);
  });

  it('✅ ED3: uma classe LOCAL com o mesmo nome não é o evento (não é falso positivo)', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `class UserCreatedEvent {
  constructor() {}
}

export function trata(): void {
  const evento = new UserCreatedEvent();
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(false);
  });

  it('🔴 ED4: o domínio importando a infraestrutura é erro', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user.repository.js';

export class User {}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(true);
  });

  it('🔴 ED4: o domínio importando a infraestrutura de OUTRO módulo é erro', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `import { PrismaProfileRepository } from '../../../profiles/infrastructure/persistence/prisma-profile.repository.js';

export class User {}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(true);
  });

  it('✅ ED4: a camada `application` importando um guard de outro módulo NÃO é erro', () => {
    // O guard é artefato de FRAMEWORK (NestJS), não o acoplamento de DADOS que
    // a regra desata. MEDIDO em 2026-11-26: a versão anterior do gate proibia
    // esse import e acusou 12 linhas legítimas do repo.
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';

export function trata(evento: UserCreatedEvent): void {
  void evento.aggregateId;
  void JwtAuthGuard;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('✅ ED4: um `import` escrito DENTRO de uma string não é import', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `import { DomainEvent } from '../../shared/domain/domain-event.js';

export class User {
  readonly exemplo = "import { X } from '../infrastructure/persistence/y.js'";
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(false);
  });

  it('🔴 ED5: evento sem consumidor na camada application é erro quando não está no registro', () => {
    const arvore = arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não tem consumidor na camada application'))).toBe(true);
  });

  it('🔴 ED5: o `import` do evento SEM uso não é consumidor', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

export function trata(): void {
  void 1;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não tem consumidor na camada application'))).toBe(true);
  });

  it('🔴 ED5: o nome da classe DENTRO de uma string não é consumidor', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

export const rotulo = 'UserCreatedEvent';
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não tem consumidor na camada application'))).toBe(true);
  });

  it('✅ ED5: o mesmo evento COM a exceção declarada é dívida aceita, não erro', () => {
    const arvore = arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK });
    const r = checkEventDriven({ arvore, excecoes: [excecaoDoEvento()] });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.advisories?.some((a) => a.includes('exceção declarada'))).toBe(true);
  });

  it('🔴 ED5: exceção declarada que parou de valer é erro (a entrada tem de sair)', () => {
    const r = checkEventDriven({ arvore: arvoreSadia(), excecoes: [excecaoDoEvento()] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('parou de valer'))).toBe(true);
  });

  it('🔴 a verificação do registro tem que BATER com o medido', () => {
    const r = checkEventDriven({
      arvore: arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK }),
      excecoes: [
        {
          ...excecaoDoEvento(),
          verificacao: {
            tipo: 'evento-sem-handler',
            classe: 'ClasseQueNaoE',
            arquivo: CAMINHO_DO_EVENTO,
          },
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não bate com o medido'))).toBe(true);
  });

  it('🔴 a exceção que aponta para arquivo inexistente é erro', () => {
    const r = checkEventDriven({
      arvore: arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK }),
      excecoes: [
        {
          ...excecaoDoEvento(),
          verificacao: {
            tipo: 'evento-sem-handler',
            classe: 'UserCreatedEvent',
            arquivo: 'apps/api/src/modules/users/domain/events/nao-existe.event.ts',
          },
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não existe no disco'))).toBe(true);
  });

  it('🔴 ED6: a camada `application` escrevendo efeito colateral direto é erro', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/application/user-use-cases.ts': `export class UserUseCases {
  async criar(): Promise<void> {
    await this.auditService.record({});
  }
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('efeito colateral direta'))).toBe(true);
  });

  it('🔴 ED6: `auditService.archive` também é escrita de efeito colateral', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/application/user-use-cases.ts': `export class UserUseCases {
  async arquivar(): Promise<void> {
    await this.auditService.archive({});
  }
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('auditService.archive'))).toBe(true);
  });

  it('✅ ED6: a MESMA escrita com a exceção declarada é dívida aceita', () => {
    const caminho = 'apps/api/src/modules/users/application/user-use-cases.ts';
    const arvore = arvoreSadia({
      [caminho]: `export class UserUseCases {
  async criar(): Promise<void> {
    await this.auditService.record({});
  }
}
`,
    });
    const r = checkEventDriven({
      arvore,
      excecoes: [
        {
          regra: 'ED6',
          chave: `${caminho}|auditService.record`,
          motivo: 'fixture: dívida conhecida',
          ocorrencias: 1,
          verificacao: {
            tipo: 'efeito-colateral-direto',
            arquivo: caminho,
            padrao: 'auditService.record',
          },
        },
      ],
    });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED6: a exceção que declara 1 ocorrência e o medido são 2 é erro', () => {
    const caminho = 'apps/api/src/modules/users/application/user-use-cases.ts';
    const arvore = arvoreSadia({
      [caminho]: `export class UserUseCases {
  async criar(): Promise<void> {
    await this.auditService.record({});
    await this.auditService.record({});
  }
}
`,
    });
    const r = checkEventDriven({
      arvore,
      excecoes: [
        {
          regra: 'ED6',
          chave: `${caminho}|auditService.record`,
          motivo: 'fixture: dívida conhecida',
          ocorrencias: 1,
          verificacao: {
            tipo: 'efeito-colateral-direto',
            arquivo: caminho,
            padrao: 'auditService.record',
          },
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('ocorrência'))).toBe(true);
  });

  it('✅ ED6: a exceção que declara a contagem que o gate mede é dívida aceita', () => {
    const caminho = 'apps/api/src/modules/users/application/user-use-cases.ts';
    const arvore = arvoreSadia({
      [caminho]: `export class UserUseCases {
  async criar(): Promise<void> {
    await this.auditService.record({});
    await this.auditService.record({});
  }
}
`,
    });
    const r = checkEventDriven({
      arvore,
      excecoes: [
        {
          regra: 'ED6',
          chave: `${caminho}|auditService.record`,
          motivo: 'fixture: dívida conhecida',
          ocorrencias: 2,
          verificacao: {
            tipo: 'efeito-colateral-direto',
            arquivo: caminho,
            padrao: 'auditService.record',
          },
        },
      ],
    });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED3: a REGEX LITERAL com aspas não desmonta a medição (o emissor depois dela é visto)', () => {
    // MEDIDO em 2026-11-27: o scanner tratava o apóstrofo de `/['"]/` como
    // abertura de string, e o arquivo ficava desmontado dali — o `new` que
    // viesse depois sumia da medição.
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

const RE = /['"]/;

export function trata(): void {
  const evento = new UserCreatedEvent('id', 1, new Date());
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(true);
  });

  it('🔴 ED4: o import com ASPAS DUPLAS é import (o domínio não importa a infraestrutura)', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `import { PrismaUserRepository } from "../infrastructure/persistence/prisma-user.repository.js";

export class User {}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(true);
  });

  it('🔴 ED4: `export * from` da infraestrutura também é import', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `export * from '../infrastructure/persistence/prisma-user.repository.js';
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(true);
  });

  it('🔴 ED4: `export * from` com ASPAS DUPLAS também é import', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `export * from "../infrastructure/persistence/prisma-user.repository.js";
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(true);
  });

  it('🔴 ED4: o import DINÂMICO da infraestrutura também é import', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `export async function carrega(): Promise<void> {
  await import('../infrastructure/persistence/prisma-user.repository.js');
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(true);
  });

  it('🔴 ED5: um tipo que CONTÉM o nome da classe não é uso (o evento continua morto)', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

export type UserCreatedEventPayload = { id: string };
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não tem consumidor na camada application'))).toBe(true);
  });

  it('🔴 ED5: o import por BARREL (`events/index.js`) é consumidor', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/index.js';

export function trata(evento: UserCreatedEvent): void {
  void evento.aggregateId;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED3: o import por BARREL não esconde a emissão fora do domínio', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/index.js';

export function trata(): void {
  const evento = new UserCreatedEvent('id', 1, new Date());
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(true);
  });

  it('🔴 ED5: o evento de OUTRO módulo com o mesmo nome de arquivo não é o evento', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../../profiles/domain/events/user-created.event.js';

export function trata(evento: UserCreatedEvent): void {
  void evento.aggregateId;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não tem consumidor na camada application'))).toBe(true);
  });

  it('✅ ED6: a escrita de efeito colateral dentro de uma STRING não é escrita', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/application/user-use-cases.ts': `export const doc = 'await this.auditService.record({})';
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED6: o import sem ponto-e-vírgula não engole a escrita que vem depois', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/application/user-use-cases.ts': `import { UserCreatedEvent } from '../domain/events/user-created.event.js'

export class UserUseCases {
  async criar(): Promise<void> {
    await this.auditService.record({});
  }
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('efeito colateral direta'))).toBe(true);
  });

  it('🔴 ED1: o arquivo de evento FORA do caminho canônico é erro (não escapa da medição)', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/application/events/rogue.event.ts': `export class RogueEvent {
  readonly eventName = 'users.rogue.created.v1';
  readonly token: string;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(
      r.errors.some((e) => e.includes('rogue.event.ts')) &&
        r.errors.some((e) => e.includes('não mora em') || e.includes('NÃO leu')),
    ).toBe(true);
  });

  it('✅ ED1: o arquivo de evento SEM o sufixo `.event.` é medido por inteiro', () => {
    const arvore = arvoreCom({
      'apps/api/src/modules/users/domain/events/user-created.ts': `import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'users.user.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;

  constructor(aggregateId: string, version: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.occurredAt = occurredAt;
  }
}
`,
      'apps/api/src/modules/users/application/handlers/usuario.handler.ts': `import { UserCreatedEvent } from '../../domain/events/user-created.js';

export function trata(evento: UserCreatedEvent): void {
  void evento.aggregateId;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED1: o arquivo de evento SEM o sufixo `.event.` também entra na medição', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/events/user-created.ts': `export class UserCreatedEvent {
  readonly eventName = 'users.user.created.v1';
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('user-created.ts'))).toBe(true);
  });

  it('🔴 ED7: o segredo em campo MUTÁVEL é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace(
        '  readonly version: number;',
        '  readonly version: number;\n  passwordHash!: string;',
      ),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('passwordHash'))).toBe(true);
  });

  it('🔴 ED7: o segredo em PARAMETER PROPERTY do construtor é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace(
        '  constructor(aggregateId: string, version: number, occurredAt: Date) {',
        '  constructor(aggregateId: string, version: number, occurredAt: Date, public senhaHash: string) {',
      ),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('senhaHash'))).toBe(true);
  });

  it('✅ ED1: o campo declarado SEM anotação de tipo é campo declarado', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: EVENTO_OK.replace(
        '  readonly occurredAt: Date;',
        '  readonly occurredAt = new Date();',
      ),
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors.some((e) => e.includes('não declara `occurredAt`'))).toBe(false);
  });

  it('🔴 ED1: `implements DomainEvent` DENTRO de uma string não implementa o contrato', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: `import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserCreatedEvent {
  readonly eventName = 'users.user.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly contrato = 'implements DomainEvent';
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não implementa `DomainEvent`'))).toBe(true);
  });

  it('🔴 ED1: outra classe do MESMO arquivo não implementa o contrato do evento', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: `import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class Auxiliar implements DomainEvent {
  readonly eventName = 'users.aux.v1';
}

export class UserCreatedEvent {
  readonly eventName = 'users.user.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('não implementa `DomainEvent`'))).toBe(true);
  });

  it('🔴 registro: a entrada DUPLICADA é erro (a segunda não pode esconder a primeira)', () => {
    const arvore = arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK });
    const r = checkEventDriven({
      arvore,
      excecoes: [excecaoDoEvento(), excecaoDoEvento()],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('duplicada'))).toBe(true);
  });

  it('🔴 registro: a verificação com o TIPO da outra regra é erro', () => {
    const arvore = arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK });
    const r = checkEventDriven({
      arvore,
      excecoes: [
        {
          ...excecaoDoEvento(),
          verificacao: {
            tipo: 'efeito-colateral-direto',
            classe: 'UserCreatedEvent',
            arquivo: CAMINHO_DO_EVENTO,
          },
        } as unknown as ExcecaoDeclarada,
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('verificacao.tipo'))).toBe(true);
  });

  it('🔴 registro: a entrada sem `verificacao` é erro (a verificação é a prova)', () => {
    const arvore = arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK });
    const r = checkEventDriven({
      arvore,
      excecoes: [
        {
          regra: 'ED5',
          chave: 'users.user.created.v1',
          motivo: 'fixture: sem verificação',
          ocorrencias: 1,
        } as unknown as ExcecaoDeclarada,
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('verificacao'))).toBe(true);
  });

  it('🔴 registro: o JSON CORROMPIDO é erro do gate, não stack trace', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'event-driven-'));
    mkdirSync(join(raiz, '.tooling/scripts/ci'), { recursive: true });
    writeFileSync(
      join(raiz, '.tooling/scripts/ci/excecoes-event-driven.json'),
      '{ isto não é json',
    );
    const r = checkEventDriven({ raiz, arvore: arvoreCom({ [CAMINHO_DO_EVENTO]: EVENTO_OK }) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('excecoes-event-driven.json'))).toBe(true);
    expect(r.errors.some((e) => e.includes('JSON inválido'))).toBe(true);
  });

  it('✅ ED5: o import de VÁRIAS linhas é import (o consumidor legítimo conta)', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import {
  UserCreatedEvent,
} from '../../domain/events/user-created.event.js';

export function trata(evento: UserCreatedEvent): void {
  void evento.aggregateId;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED4: o import de VÁRIAS linhas da infraestrutura é import', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `import {
  PrismaUserRepository,
} from '../infrastructure/persistence/prisma-user.repository.js';

export class User {}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('o domínio importa a infraestrutura'))).toBe(true);
  });

  it('✅ ED5: o import com ALIAS é o consumidor (o alias liga a classe do evento)', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent as UCE } from '../../domain/events/user-created.event.js';

export function trata(evento: UCE): void {
  void evento.aggregateId;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED3: a emissão com ALIAS fora do domínio é erro', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent as UCE } from '../../domain/events/user-created.event.js';

export function trata(): void {
  const evento = new UCE('id', 1, new Date());
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(true);
  });

  it('✅ ED1: o BARREL do diretório de eventos não é erro (a convenção o endossa)', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/events/index.ts': `export { UserCreatedEvent } from './user-created.event.js';
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('✅ ED1: o campo declarado DEPOIS do construtor é campo declarado', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: `import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'users.user.created.v1';

  constructor(aggregateId: string, version: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.occurredAt = occurredAt;
  }

  readonly aggregateId: string;
  readonly version: number;
  readonly occurredAt: Date;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED7: o segredo declarado DEPOIS do construtor é segredo', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: `import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'users.user.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;

  constructor(aggregateId: string, version: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.occurredAt = occurredAt;
  }

  readonly senhaHash: string;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('senhaHash'))).toBe(true);
  });

  it('🔴 ED3: a REGEX depois de `=>` não desmonta a medição', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

const limpo = (s: string) => /['"]/.test(s);

export function trata(): void {
  const evento = new UserCreatedEvent('id', 1, new Date());
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(true);
  });

  it('✅ ED4: o import DINÂMICO dentro de uma string não é import', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/domain/user.aggregate.ts': `export const doc = "await import('../infrastructure/persistence/x.js')";
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.errors).toEqual([]);
  });

  it('🔴 ED6: o import de várias linhas SEM `;` não engole a escrita seguinte', () => {
    const arvore = arvoreSadia({
      'apps/api/src/modules/users/application/user-use-cases.ts': `import {
  UserCreatedEvent,
} from '../domain/events/user-created.event.js'

export class UserUseCases {
  async criar(): Promise<void> {
    await this.auditService.record({});
  }
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('efeito colateral direta'))).toBe(true);
  });

  it('🔴 anti-vacuuidade: árvore sem nenhum evento é ERRO, não verde vago', () => {
    const r = checkEventDriven({ arvore: arvoreCom({}), excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('nenhum evento de domínio encontrado'))).toBe(true);
  });

  it('🔴 o comentário não conta: o nome do evento em COMENTÁRIO não satisfaz a regra', () => {
    const arvore = arvoreSadia({
      [CAMINHO_DO_EVENTO]: `// readonly eventName = 'users.user.created.v1';
export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'qualquer.coisa.v9';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('eventName'))).toBe(true);
  });

  it('🔴 o `//` DENTRO de uma string não corta a linha (o emissor continua visível)', () => {
    // MEDIDO: o regex de comentário de linha cortava a linha inteira, e o
    // `new UserCreatedEvent(` que viesse depois sumia da medição.
    const arvore = arvoreSadia({
      [CAMINHO_DO_HANDLER]: `import { UserCreatedEvent } from '../../domain/events/user-created.event.js';

export function trata(): void {
  const nota = 'a // b';
  const evento = new UserCreatedEvent('id', 1, new Date());
  void nota;
  void evento;
}
`,
    });
    const r = checkEventDriven({ arvore, excecoes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fora do domínio'))).toBe(true);
  });
});

describe('check-event-driven — as funções puras', () => {
  it('o prefixo esperado vem do caminho, não do que o código declara', () => {
    expect(prefixoEsperadoDoEvento(CAMINHO_DO_EVENTO)).toBe('users.user.created.');
    expect(
      prefixoEsperadoDoEvento(
        'apps/api/src/modules/profiles/domain/events/profile-deleted.event.ts',
      ),
    ).toBe('profiles.profile.deleted.');
    expect(prefixoEsperadoDoEvento('apps/api/src/shared/domain/domain-event.ts')).toBeNull();
  });

  it('o módulo é o segmento depois de `modules/`', () => {
    expect(moduloDoCaminho(CAMINHO_DO_EVENTO)).toBe('users');
    expect(moduloDoCaminho('apps/api/src/shared/domain/domain-event.ts')).toBeNull();
  });

  it('o comentário sai antes da medição', () => {
    expect(semComentarios('const a = 1; // const b = 2;')).not.toContain('const b');
    expect(semComentarios('/* const c = 3; */ const a = 1;')).not.toContain('const c');
  });

  it('o conteúdo da string sai, mas a linha NÃO é cortada', () => {
    const codigo = "const a = 'x // y'; const b = 1;";
    expect(semStrings(codigo)).toContain('const b = 1;');
    expect(semStrings(codigo)).not.toContain('x // y');
  });

  it('os imports são os declarados em linha inteira', () => {
    expect(
      importsDe("import { A } from './a.js';\nconst s = \"import { B } from './b.js'\";"),
    ).toEqual(['./a.js']);
  });

  it('o corpo da classe é isolado (o helper do mesmo arquivo não conta)', () => {
    const codigo = semStrings(
      'export class UserCreatedEvent { readonly version: number; }\nexport class Outro { readonly token: string; }',
    );
    expect(corpoDaClasse(codigo, 'UserCreatedEvent')).toContain('version');
    expect(corpoDaClasse(codigo, 'UserCreatedEvent')).not.toContain('token');
  });

  it('a coleta acha os eventos da árvore e ignora o que não é evento', () => {
    const eventos = coletarEventos(
      arvoreCom({
        [CAMINHO_DO_EVENTO]: EVENTO_OK,
        'apps/api/src/shared/domain/domain-event.ts': 'export interface DomainEvent {}',
      }),
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.classe).toBe('UserCreatedEvent');
    expect(eventos[0]?.modulo).toBe('users');
  });
});

describe('check-event-driven — o repo real', () => {
  it('✅ o repo real está verde: as violações que existem estão no registro', () => {
    const r = checkEventDriven();
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('✅ toda violação medida tem entrada no registro, e toda entrada cobre uma violação', () => {
    // ⚠️ A CONSISTÊNCIA, e não o número: a política do registro é remover a
    // entrada no PR que corrige a violação — um literal ("8 exceções") quebraria
    // o spec na Fase 1 do plano, sem que nada de errado tivesse acontecido.
    const r = checkEventDriven();
    const declaradas = r.advisories?.filter((a) => a.includes('exceção declarada')) ?? [];
    const medida = r.advisories?.find((a) => a.startsWith('medido:')) ?? '';
    expect(declaradas.length).toBeGreaterThan(0);
    expect(medida).toMatch(/\d+ evento\(s\) de domínio/);
    expect(ARQUIVO_DE_EXCECOES).toBe('.tooling/scripts/ci/excecoes-event-driven.json');
  });

  it('✅ o repo real tem eventos em 2 módulos', () => {
    const r = checkEventDriven();
    const medido = r.advisories?.find((a) => a.startsWith('medido:')) ?? '';
    expect(medido).toMatch(/em 2 módulo\(s\)/);
  });
});
