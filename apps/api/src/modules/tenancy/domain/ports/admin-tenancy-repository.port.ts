// apps/api/src/modules/tenancy/domain/ports/admin-tenancy-repository.port.ts
//
// pt-BR (visão de admin, 2026-10-22): a porta da VISÃO BIDIRECIONAL da
// tenancy — "quem está em cada empresa" e "de quais empresas cada pessoa é".
//
// POR QUE UMA PORTA NOVA, e não dois métodos no `TenantMembershipRepositoryPort`
// A porta existente é a da IDENTIDADE do usuário NA empresa: ela lê a
// membership, e o que ela devolve é o VÍNCULO (`findRole`, `findProfileId`,
// `listarEmpresasDoUsuario`). As duas leituras deste arquivo são outra coisa:
// são o INVENTÁRIO do bucket de SISTEMA, e cada uma costura DUAS tabelas
// (`tenants` + `tenant_memberships` + `users`) numa visão só. Um método
// "listar o sistema inteiro" dentro da porta do vínculo seria uma leitura de
// outro read model vestida de vínculo — e a porta é a propriedade que o
// domínio verifica.
//
// ⚠️ A ESCALA É DE SISTEMA, e a porta não a esconde: quem implementa tem de
// abrir o bucket de SISTEMA, e a RLS deixa passar. Quem NÃO deve abrir essa
// leitura não chega aqui — o portão é D2 (`ehAdministradorDeSistema`), na
// camada de aplicação.
//
// ⚠️ #118 — O BUCKET DE SISTEMA É A CREDENCIAL, E NÃO O GUC. Quem implementa
// tem de abrir a transação na CREDENCIAL de sistema (`comEscopoDeSistema`):
// desde o #118 o bucket é concedido pelo `current_user`, e o GUC `'*'` na
// sessão de RUNTIME devolve ZERO linhas — a lista viria VAZIA, sem erro
// nenhum. MEDIDO na `main` (2026-10-28), no Postgres 16 real:
//
//   sessão de RUNTIME, escopo '*'  ->  empresas=0  usuarios=0
//   sessão de SISTEMA, escopo '*'  ->  empresas=2  usuarios=1
//
// A porta não diz COMO abrir (isso é da infraestrutura), mas ela diz que a
// leitura é do bucket de SISTEMA — e quem implementa precisa saber que isso
// hoje significa a credencial.

/** Token de injeção — a interface é apagada em runtime, sem token o Nest LANÇA. */
export const ADMIN_TENANCY_REPOSITORY_PORT = Symbol('AdminTenancyRepositoryPort');

/**
 * Um membro de uma empresa, visto pelo administrador do sistema.
 *
 * `perfil` é o SLUG do perfil efetivo **naquela empresa** (o
 * `tenant_memberships.profile_id`), e `null` quando a membership não tem
 * perfil — ou quando o perfil é de OUTRA empresa (a mesma exclusão de
 * `findProfileId`).
 */
export interface MembroDaEmpresa {
  id: string;
  nome: string;
  email: string;
  /** Rótulo do vínculo: `'gerente'` ou `'member'`. NÃO é o RBAC. */
  role: string;
  perfil: string | null;
}

/** Uma empresa e os usuários que a vestem. */
export interface EmpresaComMembros {
  id: string;
  nome: string;
  slug: string;
  membros: MembroDaEmpresa[];
}

/** Uma empresa a que um usuário pertence, com o papel e o perfil que ele veste nela. */
export interface EmpresaComPerfil {
  id: string;
  nome: string;
  slug: string;
  role: string;
  perfil: string | null;
}

/**
 * Um usuário e as empresas a que ele pertence.
 *
 * `empresas` vazia é uma RESPOSTA legítima — e não um defeito: a conta do
 * administrador do sistema (do seed) vive no bucket GLOBAL e não pertence a
 * empresa nenhuma. Uma lista montada a partir das memberships a ESQUECERIA, e
 * "todos os usuários" seria uma lista de quase-todos.
 */
export interface UsuarioComEmpresas {
  id: string;
  nome: string;
  email: string;
  empresas: EmpresaComPerfil[];
}

export interface AdminTenancyRepositoryPort {
  /**
   * Todas as empresas do sistema, com os membros de cada uma.
   *
   * Empresa SEM membro aparece com `membros: []` — é um estado real (a empresa
   * acabada de abrir), e escondê-la diria que ela não existe.
   */
  listarEmpresasComMembros(): Promise<EmpresaComMembros[]>;

  /** Todos os usuários do sistema, com as empresas de cada um. */
  listarUsuariosComEmpresas(): Promise<UsuarioComEmpresas[]>;
}
