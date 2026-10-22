// apps/api/src/modules/tenancy/domain/perfis-da-empresa.spec.ts
//
// pt-BR (onboarding de empresa, 2026-10-21): o CATÁLOGO decide quem pode
// fazer o quê em TODA empresa — é dado de SEGURANÇA, e não derivação: as DUAS
// entradas de empresa (o cadastro com `destino` e a página de criação) gravam
// exatamente este conjunto.
//
// Este spec existe porque uma mutação de UMA LINHA aqui é a escalada mais
// barata que existe, e ela precisa cair na suíte UNITÁRIA — que roda em
// segundos e sem banco.
//
// MEDIDO 2026-10-21 (antes deste spec): as três mutações abaixo passavam a
// suíte unitária INTEIRA (944 testes) e só morriam na de integração (1, 5 e
// 1 caem). O comportamento estava coberto; a camada rápida é que faltava.
// A mutação do `gestor` é a mais grave das três: com
// `admin.manage-authorizations` o gestor pode se dar
// `admin.manage-profiles` e editar o perfil do próprio dono — o raciocínio
// está no `perfis-da-empresa.ts`.

import { describe, expect, it } from 'vitest';
import { listAllPermissions } from '../../../shared/auth/permissions-catalog.js';
import {
  PERMISSOES_DO_COORDENADOR,
  PERMISSOES_DO_FUNCIONARIO,
  perfisDaEmpresa,
  type PerfilDaEmpresa,
} from './perfis-da-empresa.js';

/**
 * O perfil pelo SLUG, e não pela posição.
 *
 * A posição é o que a implementação entrega hoje — e é o que este spec
 * questiona. Buscar pelo slug faz o teste continuar valendo quando a ordem
 * mudar, e a ORDEM tem regra própria (o dono é o primeiro).
 */
function perfil(slug: string) {
  const achado = perfisDaEmpresa().find((p) => p.slug === slug);
  if (achado === undefined) {
    throw new Error(`perfil "${slug}" ausente do catálogo de perfis da empresa`);
  }
  return achado;
}

describe('perfisDaEmpresa — o catálogo de perfis de toda empresa', () => {
  it('são EXATAMENTE três, e o dono é o PRIMEIRO', () => {
    // ⚠️ O esperado é uma LISTA LITERAL, não `perfisDaEmpresa().length`: a
    // comparação contra o próprio catálogo seria o array contra ele mesmo, e
    // um catálogo que perdesse um perfil passaria. O mesmo cuidado do
    // `feature-flag-catalog.spec.ts`.
    expect(perfisDaEmpresa().map((p) => p.slug)).toEqual(['gerente', 'coordenador', 'funcionario']);
  });

  it('o dono tem o BYPASS e TODAS as permissões do catálogo', () => {
    const dono = perfil('gerente');

    // O bypass vem do `isAdmin` e não de "todas as permissões" — é o que
    // acompanha o catálogo quando ele cresce, sem reescrita.
    expect(dono.isAdmin).toBe(true);
    // O lado esperado é o CATÁLOGO, e o lado real é a lista do dono: os dois
    // crescem juntos, e um dono que perde uma permissão cai aqui.
    expect(dono.permissoes).toEqual(listAllPermissions());
  });

  it('o gestor administra PESSOAS, e NADA de `admin.*`', () => {
    const gestor = perfil('coordenador');

    expect(gestor.isAdmin).toBe(false);
    // A escalada que este spec existe para prender: com
    // `admin.manage-authorizations` o gestor se promove e edita o perfil do
    // próprio dono. O filtro é o PREFIXO, e não a lista — a lista muda com o
    // produto, o namespace não.
    expect(gestor.permissoes.filter((chave) => chave.startsWith('admin.'))).toEqual([]);
    // E o que ele FAZ: administrar as pessoas da empresa.
    expect(gestor.permissoes).toContain('users.write');
  });

  it('o funcionário só lê o diretório', () => {
    const funcionario = perfil('funcionario');

    expect(funcionario.isAdmin).toBe(false);
    // Lista EXATA: um `users.write` a mais aqui é a escalada, e um
    // `toContain('users.read')` deixaria passar.
    expect(funcionario.permissoes).toEqual(['users.read']);
  });

  it('devolve uma cópia a cada chamada — a mutação do consumidor não vaza', () => {
    const esperado = 3;

    // ⚠️ O cast é o ponto: `readonly` PROTEGE em tempo de compilação, e o
    // defeito que este teste persegue é justamente o que sobra quando alguém
    // contorna essa proteção. Sem o cast, o teste nem compila.
    const a = perfisDaEmpresa() as PerfilDaEmpresa[];
    a.pop();

    expect(perfisDaEmpresa()).toHaveLength(esperado);
  });

  it('as listas de permissões também são cópias — o catálogo é CONGELADO', () => {
    // O `dono` já recebia cópia (`listAllPermissions()` devolve uma); o
    // `gestor` e o `funcionario` recebiam a CONSTANTE de módulo, e uma
    // alteração nelas contaminava o processo inteiro — inclusive a chamada
    // seguinte, que é a que a empresa nova lê.
    //
    // ⚠️ O cast é o ponto: `readonly string[]` PROTEGE em tempo de
    // compilação, e o defeito que este teste persegue é justamente o que
    // sobra quando alguém contorna essa proteção.
    const permissoes = perfil('coordenador').permissoes as string[];
    permissoes.push('admin.manage-users');

    expect(perfil('coordenador').permissoes).not.toContain('admin.manage-users');
  });

  it('a ORIGEM das permissões é congelada — a constante exportada não é mutável', () => {
    // O teste acima mede a CÓPIA devolvida. Este mede a FONTE, que é onde o
    // defeito estava: as duas listas são EXPORTADAS, e a cópia de
    // `perfisDaEmpresa()` é feita A PARTIR delas — então uma constante
    // mutável contamina o catálogo de toda empresa criada dali em diante.
    //
    // MEDIDO 2026-10-22 (antes do congelamento): sem `Object.freeze`,
    // `PERMISSOES_DO_COORDENADOR.push('admin.manage-profiles')` deixava o
    // `coordenador` com a permissão de editar perfil — a escalada que o
    // catálogo existe para impedir — e o `readonly` do TIPO não via nada
    // disso, porque protege em tempo de compilação.
    expect(Object.isFrozen(PERMISSOES_DO_COORDENADOR)).toBe(true);
    expect(Object.isFrozen(PERMISSOES_DO_FUNCIONARIO)).toBe(true);

    // E o EFEITO, que é o que importa: a tentativa de alterar a origem
    // LANÇA (o módulo ESM é strict mode), e o catálogo segue intacto.
    expect(() => (PERMISSOES_DO_COORDENADOR as string[]).push('admin.manage-profiles')).toThrow(
      TypeError,
    );
    expect(perfil('coordenador').permissoes).not.toContain('admin.manage-profiles');
  });
});
