// apps/api/src/modules/tenancy/domain/perfis-da-empresa.ts
//
// pt-BR (onboarding de empresa, 2026-10-21): o CONJUNTO de perfis que toda
// empresa nasce com — DONO, GESTOR e FUNCIONÁRIO.
//
// A pergunta que este arquivo responde é "quais perfis uma empresa tem?", e a
// resposta é um DADO, não uma derivação: o conjunto é fixo, vale para toda
// empresa, e nasce CONGELADO (`isSystem: true`) — o trio não muda depois.
//
// ⚠️ MEDIDO 2026-10-21: este arquivo PROMETIA que "o dono da empresa pode
// ajustar as permissões depois pela tela de perfis", e a promessa era FALSA —
// `isSystem: true` faz `atribuir`, `revogar`, `atualizar` e `deletar`
// recusarem com 403 `PROFILE_SYSTEM_PROTECTED`. A ESCOLHA é o congelamento, e
// não a edição: o trio é o CATÁLOGO, e uma empresa que apaga o seu `gestor`
// deixa de ter os três perfis que toda empresa tem. Quem precisa de um papel
// sob medida CRIA um perfil (`POST /admin/profiles`) e ajusta ESSE — que é o
// que `admin.manage-authorizations` faz, e é a promessa que este arquivo
// agora cumpre.
//
// ⚠️ Por que um CATÁLOGO no domínio e não uma lista no repositório: as DUAS
// entradas de empresa (o cadastro com `destino: 'empresa'` e a página de
// criação de empresa) precisam produzir EXATAMENTE o mesmo conjunto. Se cada
// uma tivesse a sua lista, elas divergiriam na primeira alteração — e a
// divergência seria silenciosa: uma empresa criada pelo cadastro teria um
// perfil a menos que uma criada pela página.
//
// ── A ESCOLTA DE CADA PERFIL ─────────────────────────────────────────────────
//
// ⚠️ `admin` NÃO é um destes três, e a distinção é load-bearing:
//
//   - **`admin` = administrador do SISTEMA.** Perfil GLOBAL (`tenant_id IS
//     NULL`), com acesso TOTAL, apontado por `users.profile_id` da conta.
//     Quem o tem administra a plataforma inteira — inclusive as feature flags.
//     Ele é criado pelo SEED (`prisma/seed.ts`), não pela empresa, e o
//     `ehAdministradorDeSistema` (`tenantId === null && isAdmin`) é o que o
//     distingue.
//   - **`dono` = dono da EMPRESA.** Perfil DA empresa (`tenant_id` = o
//     tenant), e vale só sobre as FUNCIONALIDADES DA EMPRESA: os usuários
//     dela, os perfis dela, as autorizações dela.
//
// A empresa nasce com `dono`, `gestor` e `funcionario` — e NÃO com um perfil
// chamado `admin`. Um perfil de empresa chamado `admin` seria um nome que
// significa "sistema" e apontaria para a empresa.
//
// - **dono**: TODAS as permissões do catálogo E `isAdmin` (bypass total do
//   `PermissionsGuard`). É o dono: quem cria a empresa a administra. O bypass
//   vem do `isAdmin` e não de "todas as permissões" porque o catálogo cresce —
//   uma permissão nova entra no catálogo e o bypass acompanha sem precisar de
//   reescrita.
// - **gestor**: administra PESSOAS, não o sistema de permissões. Tem
//   `users.read`, `users.write` e `audits.read`, e NÃO tem nada de `admin.*`.
//   O motivo é a escalada: com `admin.manage-authorizations` o gestor poderia
//   se dar `admin.manage-profiles` e editar o perfil do próprio dono.
// - **funcionario**: lê o diretório da empresa e nada mais. `users.read`.
//
// ⚠️ `isAdmin` no `dono` é o bypass do GUARD DENTRO DA EMPRESA, e é por isso
// que ele NÃO faz do dono um administrador de sistema: as rotas de sistema
// (feature flags, por exemplo) exigem `tenantId === null && isAdmin`, e o dono
// tem `users.profile_id` NULL — o bucket global dele é "sem perfil", que
// resolve para zero permissões. O dono só é `isAdmin` no escopo em que o
// perfil EFFECTIVO é o dele.
import { listAllPermissions } from '../../../shared/auth/permissions-catalog.js';

export interface PerfilDaEmpresa {
  /** Identificador canônico, kebab-case, único DENTRO da empresa. */
  readonly slug: string;
  /** Rótulo do catálogo, em pt-BR. */
  readonly nome: string;
  /** Bypass total do `PermissionsGuard` dentro da empresa. */
  readonly isAdmin: boolean;
  /** Permissões explícitas do catálogo. */
  readonly permissoes: readonly string[];
}

/**
 * As permissões do `gestor`: o que é preciso para administrar as PESSOAS da
 * empresa, e nada do namespace `admin.*`.
 *
 * `audits.read` entra porque quem administra pessoas precisa saber o que
 * aconteceu com elas — e o log de auditoria é esse o quê.
 */
export const PERMISSOES_DO_GESTOR: readonly string[] = ['users.read', 'users.write', 'audits.read'];

/** As permissões do `funcionario`: ler o diretório, e só. */
export const PERMISSOES_DO_FUNCIONARIO: readonly string[] = ['users.read'];

/**
 * Os TRÊS perfis de toda empresa, na ordem em que são criados.
 *
 * O `dono` é o PRIMEIRO porque a membership de quem cria a empresa aponta
 * para ele — a ordem aqui é a ordem da criação, e o dono é quem está lá.
 *
 * Função e não constante: `listAllPermissions()` devolve uma cópia a cada
 * chamada, e uma constante de módulo chamaria o catálogo uma única vez — o
 * que faria o `dono` carregar uma lista capturada no import, congelada
 * enquanto o catálogo cresce.
 *
 * ⚠️ As DUAS listas fixas (`gestor` e `funcionario`) também saem como CÓPIA.
 * O `readonly` do tipo protege em tempo de compilação, e o que sobra é o
 * runtime: uma constante de módulo devolvida por referência é uma lista que
 * qualquer consumidor altera e contamina o processo inteiro — inclusive a
 * chamada seguinte, que é a que a empresa nova lê. O catálogo é CONGELADO, e
 * cópia é o que congela.
 */
export function perfisDaEmpresa(): readonly PerfilDaEmpresa[] {
  return [
    {
      slug: 'dono',
      nome: 'Dono',
      isAdmin: true,
      permissoes: listAllPermissions(),
    },
    { slug: 'gestor', nome: 'Gestor', isAdmin: false, permissoes: [...PERMISSOES_DO_GESTOR] },
    {
      slug: 'funcionario',
      nome: 'Funcionário',
      isAdmin: false,
      permissoes: [...PERMISSOES_DO_FUNCIONARIO],
    },
  ];
}
