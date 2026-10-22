// apps/api/src/modules/profiles/infrastructure/persistence/prisma-profile.repository.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do PrismaProfileRepository.
//
// pt-BR (#97): o fake desta arquivo foi REESCRITO. Ele espelhava uma API
// que o repositório não chamava — tinha `profile.update` (o repo chama
// `updateMany`) e não tinha `authorization` nem `$transaction` — então o
// path de UPDATE tinha ZERO cobertura e o `deleteMany` inválido no path de
// CREATE não tinha onde aparecer. Um fake que não é a API real produz
// verde sobre código que quebraria em produção.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaProfileRepository } from './prisma-profile.repository.js';
import { Profile } from '../../domain/profile.aggregate.js';
import { ConcurrencyException } from '../../domain/exceptions/profile.exceptions.js';
import { ESCOPO_DE_SISTEMA } from '../../../../shared/infrastructure/prisma/papel-de-runtime.js';

type ProfileRow = {
  id: string;
  slug: string;
  name: string;
  // pt-BR (Fase 2 — tenancy): `null`/ausente = perfil GLOBAL. O fake precisa
  // deste campo para que `findFirst({ tenantId: null })` signifique alguma
  // coisa — sem ele o duplo aceitaria qualquer linha, e o teste de
  // `findBySlug` ficaria verde sobre uma consulta que não filtra nada.
  tenantId?: string | null;
  isAdmin: boolean;
  isSystem: boolean;
  description: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  authorizations: Array<{ id: string; permissionKey: string }>;
};

class FakePrisma {
  #profiles: ProfileRow[] = [];
  #authIds = 0;
  /** nº de transações abertas — a asserção de atomicidade olha aqui. */
  transacoesAbertas = 0;
  /** última chamada de `profile.create`, para as asserções de shape. */
  ultimaCreate: { data: Record<string, unknown> } | null = null;
  /** força o próximo `authorization.createMany` a falhar (teste de rollback) */
  falharCreateMany = false;

  /**
   * Insere uma linha crua, sem passar pelo agregado.
   *
   * pt-BR (Fase 2 — tenancy): o agregado `Profile` não conhece `tenantId` (a
   * D3 é do repositório de perfis de tenant, que é a Fase 4). Sem este seeding
   * não há como escrever um teste que fala do escopo de empresa.
   */
  semear(row: Partial<ProfileRow> & { id: string; slug: string }): void {
    this.#profiles.push({
      name: '',
      tenantId: null,
      isAdmin: false,
      isSystem: false,
      description: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      authorizations: [],
      ...row,
    });
  }

  profile = {
    findUnique: async (args: { where: { id?: string; slug?: string } }) => {
      const found = this.#profiles.find(
        (p) =>
          (args.where.id !== undefined && p.id === args.where.id) ||
          (args.where.slug !== undefined && p.slug === args.where.slug),
      );
      return found === undefined ? null : { ...found };
    },
    // pt-BR (Fase 2 — tenancy): `slug` não é mais `@unique`, então `findBySlug`
    // virou `findFirst` filtrando `tenantId: null` (só o escopo GLOBAL). O
    // fake filtra de verdade — se devolvesse a primeira linha com o slug, um
    // profile de tenant com o mesmo `slug` seria aceito e o teste passaria
    // sobre a consulta errada.
    findFirst: async (args: {
      where: { id?: string; slug?: string; tenantId?: string | null };
    }) => {
      const found = this.#profiles.find((p) => {
        if (args.where.id !== undefined && p.id !== args.where.id) return false;
        if (args.where.slug !== undefined && p.slug !== args.where.slug) return false;
        if (args.where.tenantId !== undefined && (p.tenantId ?? null) !== args.where.tenantId) {
          return false;
        }
        return true;
      });
      return found === undefined ? null : { ...found };
    },
    // pt-BR (Fase 8): `findMany` passou a receber `where` (o filtro de
    // empresa do `list`), e antes ele IGNORAVA o argumento — um teste de
    // escopo escrito sobre este duplo seria verde com e sem o filtro, que é
    // verde que não prova nada. Reusa o mesmo predicado do `findFirst`.
    findMany: async (args?: { where?: { tenantId?: string | null } }) => {
      const alvo = args?.where;
      return this.#profiles
        .filter((p) => {
          if (alvo?.tenantId !== undefined && (p.tenantId ?? null) !== alvo.tenantId) return false;
          return true;
        })
        .map((p) => ({ ...p }));
    },
    create: async (args: { data: Record<string, unknown> }) => {
      this.ultimaCreate = args;
      const nested = args.data['authorizations'] as
        { create?: Array<{ permissionKey: string }>; deleteMany?: unknown } | undefined;
      // Reproduz o `PrismaClientValidationError` do Prisma 6: no tipo
      // `AuthorizationCreateNestedManyWithoutProfileInput` NÃO existe
      // `deleteMany` (ele só existe no tipo de UPDATE).
      if (nested !== undefined && nested.deleteMany !== undefined) {
        throw Object.assign(
          new Error(
            'Unknown argument `deleteMany`. Did you mean to use `create`? (create.authorizations.deleteMany)',
          ),
          { name: 'PrismaClientValidationError' },
        );
      }
      const row: ProfileRow = {
        id: args.data['id'] as string,
        slug: args.data['slug'] as string,
        name: args.data['name'] as string,
        // pt-BR (Fase 8): a dona passa a ser gravada no `create`. Sem esta
        // linha o fake descartaria o campo e todo perfil criado por teste
        // nasceria global — o teste de `list` por empresa passaria a medir o
        // fake, não o repositório.
        tenantId: (args.data['tenantId'] as string | null) ?? null,
        isAdmin: args.data['isAdmin'] as boolean,
        isSystem: args.data['isSystem'] as boolean,
        description: args.data['description'] as string | null,
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        authorizations: (nested?.create ?? []).map((a) => ({
          id: `auth-${++this.#authIds}`,
          permissionKey: a.permissionKey,
        })),
      };
      this.#profiles.push(row);
      return { ...row };
    },
    updateMany: async (args: {
      where: { id: string; version: number; tenantId?: string | null };
      data: {
        slug: string;
        name: string;
        description: string | null;
        isAdmin: boolean;
        isSystem: boolean;
        version: number;
      };
    }) => {
      const row = this.#profiles.find((p) => p.id === args.where.id);
      if (row === undefined || row.version !== args.where.version) {
        return { count: 0 };
      }
      // pt-BR (Fase 9): o `where` carrega a dona e este filtro a compara —
      // como o `findFirst` faz com o `tenantId`. `?? null` porque
      // `undefined` = "o duplo ignoraria o filtro", que é o verde que não
      // prova nada. A coluna NÃO é reatribuída aqui: o repositório parou de
      // escrevê-la, e um duplo que ainda a move esconderia a mudança.
      if (args.where.tenantId === undefined || row.tenantId !== args.where.tenantId) {
        return { count: 0 };
      }
      row.slug = args.data.slug;
      row.name = args.data.name;
      row.description = args.data.description;
      row.isAdmin = args.data.isAdmin;
      row.isSystem = args.data.isSystem;
      row.version = args.data.version;
      row.updatedAt = new Date('2026-02-02T00:00:00Z');
      return { count: 1 };
    },
    delete: async (args: { where: { id: string } }) => {
      const idx = this.#profiles.findIndex((p) => p.id === args.where.id);
      if (idx === -1) throw new Error('not found');
      this.#profiles.splice(idx, 1);
      return {};
    },
  };

  authorization = {
    deleteMany: async (args: { where: { profileId: string } }) => {
      const before = this.#profiles.length;
      for (const row of this.#profiles) {
        if (row.id === args.where.profileId) {
          row.authorizations = [];
        }
      }
      return { count: before };
    },
    createMany: async (args: { data: Array<{ profileId: string; permissionKey: string }> }) => {
      if (this.falharCreateMany) {
        throw new Error('createMany falhou');
      }
      for (const d of args.data) {
        const row = this.#profiles.find((p) => p.id === d.profileId);
        row?.authorizations.push({ id: `auth-${++this.#authIds}`, permissionKey: d.permissionKey });
      }
      return { count: args.data.length };
    },
  };

  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    this.transacoesAbertas += 1;
    return fn(this);
  }

  /**
   * pt-BR (Fase 9 — RLS): o escopo abre por `set_config`, que é tagged
   * template. O `chunks[0]` é o SQL e `chunks[1..]` são os valores
   * interpolados — o escopo é o ÚLTIMO.
   */
  readonly $queryRaw = vi.fn().mockResolvedValue([]);

  /** Os escopos pedidos ao banco, em ordem. */
  escopos(): string[] {
    return this.$queryRaw.mock.calls.map((chamada) => chamada.at(-1) as string);
  }
}

describe('PrismaProfileRepository', () => {
  let repo: PrismaProfileRepository;
  let fake: FakePrisma;

  beforeEach(() => {
    fake = new FakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new PrismaProfileRepository(fake as any);
  });

  /**
   * Recarrega do "banco" — é o que todo use case faz antes de mutar.
   *
   * pt-BR (Fase 9 — RLS): `tenantId` é o escopo da SESSÃO (bucket de sistema
   * quando `null`). O duplo não filtra por dona, então o valor não muda o
   * resultado aqui — ele muda o escopo pedido, e é isso que os testes do bloco
   * `todo acesso abre o escopo` medem.
   */
  async function reler(
    id: ReturnType<Profile['id']>,
    tenantId: string | null = null,
  ): Promise<Profile> {
    const p = await repo.findById(id, tenantId);
    if (p === null) {
      throw new Error('profile não encontrado no fake');
    }
    return p;
  }

  it('save persiste profile novo + suas authorizations', async () => {
    const p = Profile.criar({ slug: 'admin', name: 'Administrador', agora: new Date() });
    await repo.save(p);
    const found = await repo.findById(p.id(), null);
    expect(found).not.toBeNull();
    expect(found?.slug().value).toBe('admin');
  });

  // ─── B2: `deleteMany` no path de CREATE era PrismaClientValidationError ───

  it('save (CREATE) não manda `deleteMany` no nested-write de authorizations', async () => {
    const p = Profile.criar({
      slug: 'viewer',
      name: 'Visualizador',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });

    // Se `deleteMany` voltar para o CREATE, o fake lança — que é o que o
    // Prisma 6.19.3 fazia com `PrismaClientValidationError`.
    await expect(repo.save(p)).resolves.not.toThrow();

    const nested = fake.ultimaCreate?.data['authorizations'] as Record<string, unknown>;
    expect(Object.keys(nested)).toEqual(['create']);
    expect(nested['deleteMany']).toBeUndefined();
  });

  // ─── B2: path de UPDATE (antes com ZERO cobertura) ────────────────────────
  //
  // `save()` NÃO recarrega o agregado: ele devolve a mesma instância, cujo
  // `loadedVersion` continua 0 depois do CREATE. Todo update em produção
  // passa por `findById` antes (`atualizar`, `atribuir`, `revogar`), então
  // os testes daqui recarregam também — é o formato real, e é o que dá ao
  // optimistic lock a versão certa para comparar.

  it('save (UPDATE) re-sincroniza as authorizations do perfil', async () => {
    const p = Profile.criar({
      slug: 'editor',
      name: 'Editor',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    await repo.save(p);

    const carregado = await reler(p.id());
    carregado.renomear('Editor Chefe', new Date());
    carregado.adicionarAutorizacao('users.write', new Date());
    await repo.save(carregado);

    const found = await repo.findById(p.id(), null);
    expect(found?.nome().value).toBe('Editor Chefe');
    expect(found?.authorizations().toLista()).toEqual(['users.read', 'users.write']);
    expect(found?.version()).toBe(3);
  });

  // Regressão: `atualizar()` faz DOIS mutators antes do save. Com
  // `expectedVersion = version() - 1` o `where` exigia versão 3 numa linha
  // que estava na 1 → `count: 0` → ConcurrencyException em TODO update.
  it('save (UPDATE) aceita mais de um mutator antes do save (o caso do `atualizar`)', async () => {
    const p = Profile.criar({ slug: 'custom', name: 'Nome Velho', agora: new Date() });
    await repo.save(p);

    const carregado = await reler(p.id());
    carregado.renomear('Nome Novo', new Date());
    carregado.alterarDescricao('descrição nova', new Date());
    await repo.save(carregado);

    const found = await repo.findById(p.id(), null);
    expect(found?.nome().value).toBe('Nome Novo');
    expect(found?.descricao()).toBe('descrição nova');
    expect(found?.version()).toBe(3);
  });

  it('save (UPDATE) roda as três escritas dentro de $transaction', async () => {
    const p = Profile.criar({ slug: 'editor', name: 'Editor', agora: new Date() });
    await repo.save(p);

    const carregado = await reler(p.id());
    carregado.renomear('Outro Nome', new Date());
    // pt-BR (Fase 9): a recarga também abre transação (o `findById` abre
    // escopo), então o marcador sai DEPOIS dela — o que este teste mede é a
    // transação do UPDATE, não a da leitura.
    const antesDoUpdate = fake.transacoesAbertas;
    await repo.save(carregado);

    // Fora da `$transaction` o `createMany` que falha deixa o profile com
    // a version incrementada e ZERO permissões — o agregado em memória e o
    // banco divergem para sempre. A transação é o que fecha isso.
    //
    // pt-BR (Fase 9): o CREATE TAMBÉM abre transação agora — `set_config(…,
    // true)` é LOCAL e morre no fim dela, então o escopo PRECISA dela. O que
    // este teste segura é o DELTA do UPDATE (exatamente uma transação, com as
    // três escritas dentro), não a contagem absoluta desde o começo da suíte.
    expect(fake.transacoesAbertas).toBe(antesDoUpdate + 1);
  });

  it('save (UPDATE) propaga a falha do createMany (não engole a permissão perdida)', async () => {
    const p = Profile.criar({
      slug: 'editor',
      name: 'Editor',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    await repo.save(p);

    const carregado = await reler(p.id());
    carregado.renomear('Editado', new Date());
    carregado.adicionarAutorizacao('users.write', new Date());
    fake.falharCreateMany = true;

    await expect(repo.save(carregado)).rejects.toThrow('createMany falhou');
  });

  it('save (UPDATE) com version divergente lança ConcurrencyException sem tocar em authorizations', async () => {
    const p = Profile.criar({
      slug: 'editor',
      name: 'Editor',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    await repo.save(p);

    // Simula outro escritor: um agregado re-hidratado de uma leitura antiga
    // (versão 4), enquanto o banco está na 1 que este teste gravou.
    const p2 = Profile.restaurarDePersistencia({
      id: p.id().value,
      slug: p.slug().value,
      name: p.nome().value,
      description: null,
      isAdmin: false,
      isSystem: false,
      tenantId: p.tenantId(),
      authorizations: p.authorizations().toLista(),
      createdAt: p.createdAt(),
      updatedAt: p.updatedAt(),
      version: 4,
    });

    await expect(repo.save(p2)).rejects.toThrow(ConcurrencyException);
    const found = await repo.findById(p.id(), null);
    expect(found?.authorizations().toLista()).toEqual(['users.read']);
  });

  it('toDomain usa `row.updatedAt` (não createdAt) — o model tem updatedAt', async () => {
    const p = Profile.criar({ slug: 'editor', name: 'Editor', agora: new Date() });
    await repo.save(p);
    const carregado = await reler(p.id());
    carregado.renomear('Renomeado', new Date());
    await repo.save(carregado);

    const found = await repo.findById(p.id(), null);
    expect(found?.createdAt().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(found?.updatedAt().toISOString()).toBe('2026-02-02T00:00:00.000Z');
  });

  it('findById retorna null para id inexistente', async () => {
    const result = await repo.findById(
      { value: '00000000-0000-0000-0000-000000000000' } as never,
      null,
    );
    expect(result).toBeNull();
  });

  it('list retorna todos os profiles', async () => {
    const p1 = Profile.criar({ slug: 'aaa', name: 'Aaa Name', agora: new Date() });
    const p2 = Profile.criar({ slug: 'bbb', name: 'Bbb Name', agora: new Date() });
    await repo.save(p1);
    await repo.save(p2);
    const list = await repo.list(null);
    expect(list).toHaveLength(2);
  });

  // pt-BR (Fase 8): `list(tenantId)` com empresa devolve SÓ os dela. Sem este
  // teste o filtro de `where` do `findMany` podia sumir e o único sinal seria
  // o e2e — que é lento e não diz qual camada quebrou.
  it('list com empresa devolve só os perfis DAQUELA empresa', async () => {
    await repo.save(
      Profile.criar({ slug: 'acme-g', name: 'Acme', tenantId: 't-acme', agora: new Date() }),
    );
    await repo.save(
      Profile.criar({ slug: 'globex-g', name: 'Globex', tenantId: 't-globex', agora: new Date() }),
    );
    await repo.save(Profile.criar({ slug: 'global-g', name: 'Global', agora: new Date() }));

    const daAcme = await repo.list('t-acme');
    expect(daAcme.map((p) => p.slug().value)).toEqual(['acme-g']);
  });

  it('findBySlug encontra por slug', async () => {
    const p = Profile.criar({ slug: 'meu-slug', name: 'Meu Nome', agora: new Date() });
    await repo.save(p);
    const found = await repo.findBySlug({ value: 'meu-slug' } as never, null);
    expect(found).not.toBeNull();
  });

  // pt-BR (Fase 2 — tenancy, D3): o teste acima passa tanto com `findFirst`
  // filtrando `tenantId: null` quanto sem filtro nenhum — a linha que ele
  // cria é global. Este é o que dá dente: um perfil customizado de UMA
  // empresa, com o mesmo slug, não pode vazar. Se `findBySlug` devolvesse
  // "a primeira linha com esse slug", o PermissionsGuard autorizaria pelo
  // perfil da empresa errada — silenciosamente.
  it('findBySlug NÃO devolve o perfil de uma empresa com o mesmo slug', async () => {
    fake.semear({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      slug: 'meu-slug',
      name: 'Acme',
      tenantId: 't-acme',
    });
    const found = await repo.findBySlug({ value: 'meu-slug' } as never, null);
    expect(found).toBeNull();
  });

  it('findBySlug prefere o global quando o de tenant tem o mesmo slug', async () => {
    fake.semear({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      slug: 'meu-slug',
      name: 'Acme',
      tenantId: 't-acme',
    });
    fake.semear({
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      slug: 'meu-slug',
      name: 'Global',
      tenantId: null,
    });
    const found = await repo.findBySlug({ value: 'meu-slug' } as never, null);
    expect(found).not.toBeNull();
    expect(found?.nome().value).toBe('Global');
  });

  // pt-BR (Fase 8): o espelho do teste acima para o escopo de EMPRESA. Sem
  // ele, um `findBySlug` que ignorasse o `tenantId` recebido devolveria o
  // perfil GLOBAL de mesmo slug para o gerente da empresa — que é o inverso do
  // vazamento que os dois testes de cima fecham.
  it('findBySlug com empresa devolve o perfil DA EMPRESA, não o global de mesmo slug', async () => {
    fake.semear({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      slug: 'meu-slug',
      name: 'Acme',
      tenantId: 't-acme',
    });
    fake.semear({
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      slug: 'meu-slug',
      name: 'Global',
      tenantId: null,
    });
    const found = await repo.findBySlug({ value: 'meu-slug' } as never, 't-acme');
    expect(found?.nome().value).toBe('Acme');
  });

  it('delete remove o profile', async () => {
    const p = Profile.criar({ slug: 'tmp', name: 'Temp Name', agora: new Date() });
    await repo.save(p);
    await repo.delete(p.id(), null);
    const found = await repo.findById(p.id(), null);
    expect(found).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Fase 9 — `save()` não MOVE a dona do perfil.
  //
  // MEDIDO 2026-10-17 no repositório: `updateMany` filtrava por `id` + `version`
  // e escrevia `tenant_id` vindo do agregado, então um agregado reidratado com
  // outra dona transferia o perfil de empresa — ACME → GLOBEX e ACME → global,
  // ambos medidos. O agregado declara `#tenantId` como `readonly` e nenhum
  // mutador HTTP o muda, então não há rota que alcance isto hoje: é uma
  // lacuna de CONTRATO da porta, e a porta é o que a fase herdou. O comentário
  // da linha 113 do repositório ("`readonly` no agregado garante que o UPDATE
  // nunca move um perfil de empresa") afirmava uma garantia que o repositório
  // não verificava — e um comentário que afirma o que o código não garante é
  // pior do que nenhum.
  // ───────────────────────────────────────────────────────────────────────────
  describe('a dona do perfil é imutável no repositório', () => {
    /**
     * Perfil NOVO de empresa. `Profile.criar` aceita `tenantId` desde a Fase 8
     * e é o que fixa `loadedVersion: 0` — que é o que faz `save()` escolher o
     * `create`. A primeira versão desta fixture usava `restaurarDePersistencia`
     * (que deixa `loadedVersion === version`), e aí `save` pegava o caminho de
     * UPDATE contra uma linha inexistente: os 3 testes caíam em
     * `ConcurrencyException` pelo motivo errado, e 2 deles ficariam verdes
     * mesmo sem a correção — spec verde medindo o lock no lugar do dono.
     */
    function deEmpresa(slug: string, nome: string): Profile {
      return Profile.criar({
        slug,
        name: nome,
        tenantId: 't-acme',
        initialAuthorizations: ['users.read'],
        agora: new Date('2026-01-01T00:00:00Z'),
      });
    }

    /**
     * Reidrata o MESMO perfil (carregado do repo) com outra dona — a forma que
     * a porta permite. `version: carregado.version()` mantém
     * `loadedVersion === 1`, que é o que casa com a linha gravada.
     */
    function comOutraDona(carregado: Profile, tenantId: string | null, nome: string): Profile {
      return Profile.restaurarDePersistencia({
        id: carregado.id().value,
        slug: carregado.slug().value,
        name: nome,
        description: carregado.descricao(),
        isAdmin: carregado.isAdmin(),
        isSystem: carregado.isSystem(),
        tenantId,
        authorizations: carregado.authorizations().toLista(),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        version: carregado.version(),
      });
    }

    it('recusa mover um perfil DE EMPRESA para outra empresa', async () => {
      const daAcme = deEmpresa('gerente', 'Gerente');
      await repo.save(daAcme);
      const movido = comOutraDona(
        (await repo.findById(daAcme.id(), 't-acme')) as Profile,
        't-globex',
        'Gerente da GLOBEX',
      );

      await expect(repo.save(movido)).rejects.toThrow(ConcurrencyException);

      const ficou = await repo.findById(daAcme.id(), 't-acme');
      expect(ficou?.tenantId()).toBe('t-acme');
      expect(ficou?.nome().value).toBe('Gerente');
    });

    it('recusa mover um perfil DE EMPRESA para o bucket de SISTEMA', async () => {
      const daAcme = deEmpresa('viewer', 'Viewer');
      await repo.save(daAcme);
      const movido = comOutraDona(
        (await repo.findById(daAcme.id(), 't-acme')) as Profile,
        null,
        'Virou global',
      );

      await expect(repo.save(movido)).rejects.toThrow(ConcurrencyException);

      const ficou = await repo.findById(daAcme.id(), 't-acme');
      expect(ficou?.tenantId()).toBe('t-acme');
    });

    it('e a escrita do nome continua funcionando na dona certa', async () => {
      // O counterpart: o filtro novo não pode transformar `save` em no-op. E o
      // caminho é o REAL — carregar, mutar, salvar — porque a âncora do
      // optimistic lock é `loadedVersion`, e `restaurarDePersistencia` deixa
      // `loadedVersion === version`: um agregado reidratado com `version: 2`
      // casaria `where version = 2` contra a linha que está em 1, e o teste
      // mediria o LOCK em vez do filtro de DONA.
      const daAcme = deEmpresa('gerente', 'Gerente');
      await repo.save(daAcme);

      const carregado = (await repo.findById(daAcme.id(), 't-acme')) as Profile;
      carregado.renomear('Gerente renamed', new Date('2026-01-02T00:00:00Z'));
      await repo.save(carregado);

      const ficou = await repo.findById(daAcme.id(), 't-acme');
      expect(ficou?.nome().value).toBe('Gerente renamed');
      expect(ficou?.tenantId()).toBe('t-acme');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Fase 9 — todo acesso a `profiles` abre o escopo.
  //
  // POR QUE ISTO É UM TESTE E NÃO UM COMENTÁRIO
  // A policy `profiles_leitura` só existe para quem tem `app.tenant_id` posto:
  // sem escopo, `no_escopo_atual` devolve false e a consulta volta ZERO linhas.
  // Um `findById` sem escopo não vaza nada — ele *apaga* a empresa, e o
  // sintoma é um 404 que ninguém sabe explicar. Por isso "abrir o escopo" é
  // comportamento observável, e a omissão é um teste vermelho.
  //
  // O limite honesto: este duplo NÃO avalia policy nenhuma, então o que se
  // prova aqui é que o escopo PEDIDO é o certo — o efeito está medido contra
  // Postgres em `prisma-rls.integration.spec.ts`, com `app_runtime` de verdade.
  // ───────────────────────────────────────────────────────────────────────────
  describe('todo acesso abre o escopo antes de tocar a tabela', () => {
    it('findById abre o escopo DA EMPRESA que o chamador está falando', async () => {
      const daAcme = Profile.criar({
        slug: 'gerente',
        name: 'Gerente',
        tenantId: 't-acme',
        agora: new Date(),
      });
      await repo.save(daAcme);

      fake.$queryRaw.mockClear();
      await repo.findById(daAcme.id(), 't-acme');
      expect(fake.escopos()).toEqual(['t-acme']);
    });

    it('findById do bucket de SISTEMA abre o escopo DE SISTEMA, não o da empresa', async () => {
      // `escopoDoTenant(null)` = `'*'`. Passar `'t-acme'` aqui seria o bucket
      // de SISTEMA lido com a empresa do vizinho — e o `PermissionsGuard`
      // resolve perfil por `users.profile_id`, que no bucket global é o perfil
      // global: sem este teste, trocar os dois e continuar verde é fácil.
      const global = Profile.criar({ slug: 'admin', name: 'Administrador', agora: new Date() });
      await repo.save(global);

      fake.$queryRaw.mockClear();
      await repo.findById(global.id(), null);
      expect(fake.escopos()).toEqual([ESCOPO_DE_SISTEMA]);
    });

    it('findBySlug e list abrem o escopo que receberam', async () => {
      const p = Profile.criar({
        slug: 'gerente',
        name: 'Gerente',
        tenantId: 't-acme',
        agora: new Date(),
      });
      await repo.save(p);

      fake.$queryRaw.mockClear();
      await repo.findBySlug(p.slug(), 't-acme');
      await repo.list('t-acme');
      expect(fake.escopos()).toEqual(['t-acme', 't-acme']);
    });

    it('save (UPDATE) abre o escopo da DONA do agregado, não um escopo qualquer', async () => {
      const daAcme = Profile.criar({
        slug: 'gerente',
        name: 'Gerente',
        tenantId: 't-acme',
        agora: new Date(),
      });
      await repo.save(daAcme);

      const carregado = await repo.findById(daAcme.id(), 't-acme');
      // O `findById` acima também abre escopo; o que este teste mede é o do
      // `save`, então o marcador sai DEPOIS da recarga.
      fake.$queryRaw.mockClear();
      carregado?.renomear('Outro nome', new Date());
      await repo.save(carregado as Profile);
      expect(fake.escopos()).toEqual(['t-acme']);
    });

    it('save (CREATE) de perfil GLOBAL abre o escopo de SISTEMA', async () => {
      // `profiles_insercao` é `no_escopo_atual(tenant_id, false)`: com escopo de
      // empresa, um perfil GLOBAL não passa no `WITH CHECK`. O seed e o
      // onboarding D5 criam global, então este caminho precisa do bucket certo.
      fake.$queryRaw.mockClear();
      await repo.save(Profile.criar({ slug: 'admin', name: 'Administrador', agora: new Date() }));
      expect(fake.escopos()).toEqual([ESCOPO_DE_SISTEMA]);
    });

    it('delete abre o escopo da empresa que está apagando', async () => {
      const daAcme = Profile.criar({
        slug: 'gerente',
        name: 'Gerente',
        tenantId: 't-acme',
        agora: new Date(),
      });
      await repo.save(daAcme);

      fake.$queryRaw.mockClear();
      await repo.delete(daAcme.id(), 't-acme');
      expect(fake.escopos()).toEqual(['t-acme']);
    });
  });
});
