// apps/web/e2e/support/dados.ts
//
// Preparação e verificação de dados para os specs — tudo pela API HTTP
// PÚBLICA, nunca pelo banco direto.
//
// pt-BR (a decisão, e por quê): a suíte poderia importar o `PrismaClient` de
// `apps/api` e ler `prisma.user.count()` direto. Não pode. `apps/web` não
// tem `@prisma/client` no grafo de dependências, e adicioná-lo significaria
// gerar um segundo client Prisma no web — duplicar o schema compilado para
// ler um número que a API expõe em um GET.
//
// Ler pela mesma API que a aplicação lê tem uma propriedade a mais: se o
// `GET /users` returning nada (ou o filtro escondesse o que acabou de ser
// criado), o spec acusa. Um `count()` direto no banco passaria, e a tela
// mostraria uma lista vazia. O caminho de teste e o caminho do usuário são o
// MESMO caminho — é essa a propriedade que um e2e deve ter.
//
// ⚠️ A EXCEÇÃO, e ela nasceu de uma mudança no produto (2026-10-14).
//
// A regra acima ("tudo pela API, nunca pelo banco direto") vale para
// VERIFICAÇÃO — é ela que faz `contarUsuarios()` passar pelo mesmo `GET /users`
// que a tela percorre, e uma contagem direta no banco passaria mesmo com a
// listagem quebrada. `contarUsuarios` continua na API, sem exceção.
//
// `limparBase()` saiu da regra, porque o caminho que ela usava deixou de
// EXISTIR no produto. Ela apagava todo mundo chamando `DELETE /users/:id` com o
// ÚNICO token do harness — e o guard de dono (T-A) responde `403
// USER_OWNERSHIP_VIOLATION` para qualquer registro que não seja o do caller.
// MEDIDO: 28 de 29 specs caíam no `beforeEach`, todos com o mesmo 403.
//
// A alternativa "cada um apaga o próprio registro" também não serve, e por um
// motivo que não é de conveniência: os specs do F2 criam a conta pelo FORMULÁRIO
// (`page.fill('#senha', …)`), então a senha pertence ao teste, não ao harness —
// não há token a obter para quem a pessoa criou na tela. Sem rota de
// administrative no produto (não existe modelo de papel), não sobrou caminho
// público.
//
// A limpeza passou a truncar, que é o que `apps/api` já faz entre os testes
// dele (`cleanDatabase`). A propriedade que o cabeçalho defendia continua de pé
// onde ela vale: nada aqui AFIRMA nada — as asserções do F1 contam pela API.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// Três `../`, e não dois como no `global-setup.ts`: este arquivo está um nível
// mais fundo (`e2e/support/`) — com dois, o caminho resolve para `apps/web/api`,
// que não existe, e o erro aparece como TS2307 sem sugerir a profundidade.
import { cleanDatabase, PrismaClient } from '../../../api/test/testcontainers-helper.js';
import { exigirEstado, WEB_ROOT } from './estado';

/**
 * O que a API devolve ao criar um usuário — a MESMA forma que o fixture
 * `semear` entrega ao spec. Exportado porque o F4 precisa do `id` e do
 * `version` para montar o soft-delete que o seu terceiro teste mede.
 */
export interface UsuarioWire {
  id: string;
  nome: string;
  email: string;
  version: number;
}

interface InitChamada {
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
  /**
   * A rota é pública e o harness deve chamá-la SEM token.
   *
   * pt-BR: existe porque `POST /auth/login` é o bootstrap da própria
   * autenticação — pedir um token para conseguir o token é recursão. Vale
   * para `POST /users`, que também é pública (D-2). As rotas que a
   * listagem, a limpeza e o soft-delete usam (`GET /users`,
   * `DELETE /users/:id`) NÃO marcam isto: precisam de sessão.
   */
  publica?: boolean;
  /**
   * Token de QUEM age, em vez do token único do harness.
   *
   * pt-BR (2026-10-14): existe porque o guard de dono (T-A) faz
   * `DELETE /users/:id` recusar quem não é o dono — `USER_OWNERSHIP_VIOLATION`.
   * O token do harness é de outra pessoa, então ele só apaga a própria conta.
   * `apagarUsuario` é a única chamada que precisa agir como o usuário-alvo, e
   * ela consegue: quem foi semeado conhece a própria senha.
   *
   * Passar o token aqui também pula o retry de 401, que semeia de novo — e
   * semear de novo durante um spec que prepara o estado dele é o que faz a
   * contagem de usuários subir por um motivo que não é o do teste.
   */
  token?: string;
}

async function chamar(
  metodo: string,
  caminho: string,
  init?: InitChamada,
): Promise<{ status: number; corpo: unknown }> {
  const { apiBaseUrl } = exigirEstado();
  // MEDIDO em 2026-10-08: `content-type: application/json` só vai junto com um
  // corpo. O `DELETE /users/:id` não tem corpo, e o Fastify recusa a combinação
  // com 400 `Body cannot be empty when content-type is set to
  // 'application/json'` — que derrubou os 17 specs de uma vez, no
  // `baseLimpa`, antes de qualquer asserção.
  //
  // O sintoma apontava para a API (um 400 numa rota que "só" apaga recurso) e
  // a causa estava no cabeçalho do próprio harness. Daí a regra: cabeçalho que
  // descreve um corpo, sem corpo, é erro de quem fez a chamada.
  const temCorpo = init?.corpo !== undefined;
  const ehPublica = init?.publica === true;
  const executar = async (token: string | null) => {
    const resposta = await fetch(`${apiBaseUrl}${caminho}`, {
      method: metodo,
      headers: {
        ...(temCorpo ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.cabecalhos,
      },
      ...(temCorpo ? { body: JSON.stringify(init.corpo) } : {}),
    });
    const texto = await resposta.text();
    let corpo: unknown = null;
    try {
      corpo = texto === '' ? null : JSON.parse(texto);
    } catch {
      corpo = texto;
    }
    return { status: resposta.status, corpo };
  };

  if (ehPublica) return executar(null);
  if (init?.token !== undefined) return executar(init.token);

  // pt-BR: o token do harness tem TTL (`JWT_ACCESS_TTL`, 15 min por padrão) e
  // uma suíte longa pode ultrapassá-lo. Um 401 aqui é quase sempre isso — mas
  // "quase sempre" não é "sempre", e um retry cego esconderia um 401 legítimo
  // (token inválido por um motivo real) atrás de uma segunda tentativa que
  // devolve o mesmo 401. Por isso o retry invalida a sessão, ressemeia e
  // tenta UMA vez: se o segundo também for 401, ele sobe.
  let token = (await sessaoDoHarness()).accessToken;
  let resposta = await executar(token);
  if (resposta.status === 401) {
    invalidarSessaoDoHarness();
    token = (await sessaoDoHarness()).accessToken;
    resposta = await executar(token);
  }
  return resposta;
}

// ── Sessão do harness ───────────────────────────────────────────────────────
//
// pt-BR (2026-10-13, demanda `login-usuario-senha` / decisão D-2): `POST /users`
// ficou público, mas TODO o resto de `/users` passou a exigir sessão. Quatro
// helpers deste arquivo — `listarUsuarios`, `contarUsuarios`, `limparBase` e
// `apagarUsuario` — chamam exatamente essas rotas protegidas, então sem um JWT
// o harness inteiro responde 401 no `beforeEach`: a suíte cai no pré-requisito
// antes de qualquer asserção, e o sintoma parece "a listagem voltou vazia".
//
// O token é SEMEADO uma vez por worker, e não durante cada teste, porque
// semear por teste custa um `argon2.hash` (~48 ms) por spec e não compra nada:
// a sessão é do harness, não do dado sob teste.
//
// ⚠️ O token em cache é a FONTE da sessão do browser, e não um atalho. O
// primeiro desenho da `comSessao` fazia um login NOVO a partir das
// credenciais em cache, e isso falhava em 29 de 29 specs — o sintoma era
// `401 INVALID_CREDENTIALS` numa conta cujo cadastro tinha acabado de dar
// 201.
//
// A CONTA DE SESSÃO é apagada — em soft-delete, por ela mesma, no fim de
// `semearELogar` (o comentário de lá registra a medição). O JWT já emitido
// continua válido (é stateless), mas um login NOVO com aquele e-mail não
// encontra a linha: `findByEmail` filtra soft-deleted. Reusar o token em
// cache é o que sobrevive — e é o que mantém a conta do harness FORA da
// listagem que os specs contam.

let sessao: (ParDeTokens & { email: string }) | null = null;

function invalidarSessaoDoHarness(): void {
  sessao = null;
}

/** Par de tokens como o contrato `POST /auth/login` os devolve. */
export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Troca e-mail+senha pelo par de tokens.
 *
 * ⚠️ `fetch` direto, não `chamar`: isto é o bootstrap da autenticação, e
 * `chamar` exige justamente o token que este comando vai produzir.
 *
 * Exported porque o browser do Playwright precisa do MESMO par — o cookie de
 * sessão que o F7 autentica na tela e o `Authorization` que `chamar` manda
 * saem daqui, e não de um segundo login: dois logins dariam dois tokens
 * para a mesma conta, e o TTL do segundo acabaria estourando a sessão do
 * primeiro sem que nada indicasse isso.
 */
export async function parDeTokens(email: string, senha: string): Promise<ParDeTokens> {
  const { apiBaseUrl } = exigirEstado();
  const login = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (login.status !== 201) {
    throw new Error(
      `POST /auth/login respondeu ${login.status} (esperado 201): ${await login.text()}.`,
    );
  }
  const wire = (await login.json()) as { accessToken?: unknown; refreshToken?: unknown };
  if (
    typeof wire.accessToken !== 'string' ||
    wire.accessToken === '' ||
    typeof wire.refreshToken !== 'string' ||
    wire.refreshToken === ''
  ) {
    throw new Error(
      `POST /auth/login respondeu 201 sem o par de tokens utilizável: ${JSON.stringify(wire)}. ` +
        'A forma do contrato mudou — todo spec que depende de sessão está medindo nada.',
    );
  }
  return { accessToken: wire.accessToken, refreshToken: wire.refreshToken };
}

/**
 * Cria a conta do harness e troca a senha pelo par de tokens.
 */
async function semearELogar(): Promise<ParDeTokens & { email: string }> {
  const { apiBaseUrl } = exigirEstado();
  const email = emailUnico('sessao');

  const criacao = await fetch(`${apiBaseUrl}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nome: 'Conta de Sessão E2E',
      email,
      senha: SENHA_DE_TESTE,
    }),
  });
  if (criacao.status !== 201) {
    throw new Error(
      `semente da conta de sessão respondeu ${criacao.status} (esperado 201): ` +
        `${await criacao.text()}. Sem esta conta o harness inteiro cai em 401.`,
    );
  }

  const conta = (await criacao.json()) as { id?: unknown; version?: unknown };
  if (typeof conta.id !== 'string' || typeof conta.version !== 'number') {
    throw new Error(
      `POST /users respondeu 201 sem o par { id, version } utilizável: ` +
        `${JSON.stringify(conta)}. A forma do contrato mudou.`,
    );
  }

  const tokens = await parDeTokens(email, SENHA_DE_TESTE);

  // ⚠️ A conta de sessão apaga a SI MESMA, e é assim que ela fica fora da
  // listagem. MEDIDO 2026-10-14: sem esta linha, o F1 (que derruba e levanta a
  // API) fazia o `GET /users` seguinte responder 401 `UNAUTHORIZED`, o retry de
  // `chamar` ressemeava a sessão — e o `expect(await contarUsuarios(), 'a
  // listagem deve começar vazia').toBe(0)` do F2 lia 1, que era a própria
  // conta do harness. O sintoma apontava para o F2 e a causa era do F1.
  //
  // O token continua valendo porque é stateless e o `JwtAuthGuard` valida
  // assinatura/expiração sem consultar o banco (ADR 0002) — nenhuma spec
  // precisa da CONTA de volta (`grep -rn "auth/me" apps/api/test/e2e/` → nada).
  // E o estado resultante é o que a suíte já rodava antes do guard de dono: o
  // `limparBase` antigo apagava em soft-delete a conta de sessão junto com as
  // outras, e nenhuma contagem por ele quebrava.
  await apagarUsuario(email, conta.id, conta.version);

  return { email, ...tokens };
}

/**
 * Par de tokens do harness, semeado no primeiro uso.
 *
 * É isto — e NÃO um login novo — que o browser recebe. Ver a nota do bloco
 * acima para por que reautenticar a conta de sessão é 401 garantido depois
 * que `limparBase()` passou por ela.
 */
export async function tokensDoHarness(): Promise<ParDeTokens> {
  return sessaoDoHarness();
}

/**
 * Sessão corrente do harness, semeada no primeiro uso.
 *
 * ⚠️ A subtlety que só aparece depois de instrumentar: a conta de sessão é
 * SOFT-DELETED assim que nasce, por `semearELogar`. O token já emitido continua
 * válido (é JWT stateless, sem revogação; ver o ADR 0002), então a sessão
 * sobrevive durante toda a execução. O que NÃO sobrevive é um NOVO login com
 * aquele email: `findByEmail` filtra soft-deleted e a linha apagada ainda ocupa
 * o `email` `@unique`. É por isso que o retry de 401 em
 * `chamar` ressemeia com `emailUnico()` em vez de reautenticar o mesmo email
 * — e é por isso que a `comSessao` planta o token em cache em vez de logar.
 */
async function sessaoDoHarness(): Promise<ParDeTokens & { email: string }> {
  if (sessao === null) {
    sessao = await semearELogar();
  }
  return sessao;
}

/**
 * Usuários visíveis pela listagem — o mesmo conjunto que a tela mostra.
 *
 * ⚠️ `?? []` era o resto de um `casa vazio`: uma resposta 200 cujo envelope
 * deixasse de ter a chave `users` (regressão de formato, do tipo da que a
 * própria tela registra em `app/users/page.tsx`) virava "a listagem está vazia".
 * Aí `contarUsuarios()` devolvia 0 para SEMPRE, e toda afirmação "não gravou"
 * dos specs — F3, F5 — ficava verde por construção: o número que deveria
 * distinguir 0 de 1 era cego. Validar a forma é o que transforma a quebra de
 * formato em vermelho, que é o que ela é.
 */
export async function listarUsuarios(): Promise<UsuarioWire[]> {
  const { status, corpo } = await chamar('GET', '/users?limit=100');
  if (status !== 200) {
    throw new Error(`GET /users respondeu ${status}: ${JSON.stringify(corpo)}`);
  }
  const pagina = corpo as { users?: unknown };
  if (!Array.isArray(pagina.users)) {
    throw new Error(
      `GET /users respondeu 200 sem a chave "users" (ou com valor que não é lista): ` +
        `${JSON.stringify(corpo)}. O envelope mudou — se o formato mudou, os specs que ` +
        'afirmam contagem estão medindo nada.',
    );
  }
  return pagina.users as UsuarioWire[];
}

/**
 * Quantos usuários a listagem devolve.
 *
 * pt-BR: este é o número que F3 e F2 opõem entre si. O formulário diz que
 * bloqueou um envio → a contagem tem que continuar igual. O formulário diz
 * que criou → a contagem tem que ter subido. Ver `f2-cadastro-sucesso.spec.ts`
 * para por que o par é o que tem dentes.
 */
export async function contarUsuarios(): Promise<number> {
  return (await listarUsuarios()).length;
}

export interface ResultadoCriacao {
  status: number;
  corpo: unknown;
}

/**
 * Senha que os specs digitam/semeiam.
 *
 * pt-BR (2026-10-13): `POST /users` passou a exigir `senha` no body
 * (`CreateUserSchema` importa `PasswordHash.MIN_LENGTH..MAX_LENGTH`, 8..72, e
 * ela é OBRIGATÓRIA). Sem este campo o boundary responde 400 e `semearUsuario`
 * estoura — o pré-requisito do F1 e do F4 quebra antes de qualquer asserção.
 * A senha não é argumento de `criarUsuario` de propósito: nenhum spec tem
 * interesse em QUAL senha semeia, e expor o parâmetro só criaria uma
 * segunda fonte de verdade para o mesmo dado.
 *
 * 13 caracteres: acima do mínimo de 8, abaixo do `maxlength` de 72, e não é um
 * valor que um gerenciador de senhas sinalize como fraco.
 */
export const SENHA_DE_TESTE = 'SenhaDeTeste123';

export async function criarUsuario(nome: string, email: string): Promise<ResultadoCriacao> {
  const { status, corpo } = await chamar('POST', '/users', {
    corpo: { nome, email, senha: SENHA_DE_TESTE },
    // `publica`: o cadastro é a porta aberta do sistema (D-2). Marcar é
    // afirmação de contrato — se alguém proteger `POST /users` por engano,
    // este spec continua verde porque carrega um token, e a regressão só
    // apareceria para quem não tem sessão. É o F7 que mede essa porta.
    publica: true,
  });
  return { status, corpo };
}

/**
 * Arquivo do contador de sementes — DELIBERADAMENTE outro arquivo que
 * `estado.json`.
 *
 * A primeira versão guardava o contador no estado, e isso era um erro meu: o
 * ciclo de vida da API (`derrubarApiDoTeste`/`subirApiDoTeste`) também reescreve
 * `estado.json` inteiro, e dois autores fazendo leitura-modificação-escrita do
 * MESMO objeto dão uma janela em que um devolve o `apiPid` que o outro acabou
 * de mudar. Pior symptom: o PID resurrecta morto, e a próxima tentativa de
 * derrubar a API não encontra ninguém para matar.
 *
 * Um arquivo por dado que tem um só autor é a regra que evita isso, e o custo é
 * uma linha de I/O.
 */
const ARQUIVO_SEMENTE = join(WEB_ROOT, 'node_modules', '.cache', 'e2e-playwright', 'semente.json');

/**
 * Email que nenhum outro spec vai ter usado neste container.
 *
 * MEDIDO em 2026-10-08, e a suíte DEPENDE disto para o F4 passar. Com um email
 * fixo, o segundo spec do arquivo recebia 412 em vez de 201 na hora de semear,
 * e o motivo está a três arquivos dali: `limparBase()` faz SOFT-DELETE, a
 * linha deletada continua com o `email` `@unique` (schema.prisma:21), e o
 * `findByEmail` do repositório filtra soft-deleted (linha 122). Ou seja: a
 * checagem de unicidade da aplicação respondia "livre", o Postgres respondia
 * "ocupado", e quem levava o `P2002` era o `catch` do `save()`, que o converte
 * em `ConcurrencyException` — 412, um código de conflitoo de VERSÃO.
 *
 * O sintoma chegava longe da causa: `semear` devolvia `{status: 412}` e o
 * fixture não olhava, o pré-requisito falhava calado, e a asserção seguinte
 * (`aria-invalid="true"`) reprovava parecendo que o formulário não marcava o
 * campo. Duas falhas, uma causa.
 *
 * O contador vive no ARQUIVO, e não numa variável de módulo, para sobreviver à
 * troca de processo do worker: com ele em memória, um worker que morresse
 * voltaria a zero e o próximo email repetiria o de um soft-delete anterior.
 */
export function emailUnico(prefixo: string): string {
  let seq = 0;
  try {
    seq = Number.parseInt(readFileSync(ARQUIVO_SEMENTE, 'utf8'), 10) || 0;
  } catch {
    // Primeira semente da execução — `globalSetup` não cria este arquivo de
    // propósito: ele nasce no primeiro uso e morre com o container.
  }
  seq += 1;
  mkdirSync(dirname(ARQUIVO_SEMENTE), { recursive: true });
  writeFileSync(ARQUIVO_SEMENTE, String(seq), 'utf8');
  return `${prefixo}.e2e.${seq}@example.com`;
}

/**
 * Semeia um usuário e EXIGE que ele tenha nascido.
 *
 * pt-BR: `criarUsuario` devolve o status porque o F5 precisa dos 500/409 de
 * propósito. Aqui não: um seed que não cria é sempre defeito do seed, e um
 * fixture que engole o status transforma um pré-requisito quebrado numa
 * asserção que falha pelo motivo errado — mais caro de ler e mais fácil de
 * atribuir ao lugar errado.
 */
export async function semearUsuario(nome: string, email: string): Promise<UsuarioWire> {
  const { status, corpo } = await criarUsuario(nome, email);
  if (status !== 201) {
    throw new Error(
      `semear "${email}" respondeu ${status} (esperado 201): ${JSON.stringify(corpo)}. ` +
        'Um seed que não cria deixa o spec seguinte medir o estado que ele não preparou.',
    );
  }
  return corpo as UsuarioWire;
}

/**
 * Soft-delete de UM usuário — o estado que `limparBase` produz para todos, mas
 * que o F4 precisa montar para um usuário só.
 *
 * pt-BR (2026-10-08): existe para o caso do email APAGADO. A linha deletada
 * continua com o `email` `@unique` (schema.prisma:21), e o `findByEmail` do
 * repositório filtra soft-deleted — a aplicação respondia "livre" enquanto o
 * Postgres respondia "ocupado". Antes do conserto do `PrismaUserRepository`,
 * esse desfecho chegava à tela como **412 CONCURRENCY_CONFLICT**, e a Server
 * Action o traduzia em erro genérico no topo, não no campo `email`.
 *
 * `If-Match` é obrigatório (RFC 7232 + optimistic locking): a versão vem do
 * corpo que `semearUsuario` devolveu. Sem ele a API responde 428.
 *
 * ⚠️ O `email` entrou na assinatura em 2026-10-14, e é o guard de dono (T-A)
 * que o exigiu: `DELETE` passou a recusar quem não é o dono do registro, e o
 * token do harness é de outra pessoa. MEDIDO — a chamada com o token do
 * harness respondia `403 USER_OWNERSHIP_VIOLATION`. A correção é no HARNESS,
 * não no guard: quem foi semeado conhece a própria senha, então ele entra
 * como ele. Afrouxar o guard para o teste passar seria trocar o controle de
 * segurança pelo conforto da suíte.
 */
export async function apagarUsuario(email: string, id: string, version: number): Promise<void> {
  const { accessToken } = await parDeTokens(email, SENHA_DE_TESTE);
  const { status, corpo } = await chamar('DELETE', `/users/${id}`, {
    token: accessToken,
    cabecalhos: { 'if-match': `W/"v${version}"` },
  });
  if (status !== 204) {
    throw new Error(
      `DELETE /users/${id} respondeu ${status} (esperado 204): ${JSON.stringify(corpo)}. ` +
        'Sem isto o soft-delete não existe e o F4 mediria o caminho do email ocupado, não o do apagado.',
    );
  }
}

/**
 * Deixa a listagem vazia, truncando as tabelas do schema de users.
 *
 * pt-BR (2026-10-14): antes isto era soft-delete de tudo que a listagem
 * devolvesse, com o token único do harness. O guard de dono (T-A) encerrou esse
 * caminho — `DELETE /users/:id` só aceita o próprio registro — e a versão por
 * usuário não tem como nascer: as contas do F2 são criadas pelo formulário, com
 * senha que o harness não conhece. O cabeçalho deste arquivo registra a exceção
 * e o motivo; aqui fica só o como.
 *
 * `PrismaClient` é importado do `apps/api` de propósito: `apps/web` não tem
 * `@prisma/client` no grafo, e é a mesma razão que faz o `global-setup.ts`
 * importar daqui. Singleton por processo de worker — o Playwright cria um
 * processo por arquivo, e abrir um pool por `beforeEach` seria o custo mais
 * caro da suíte por uma conexão que o worker inteiro vai reusar.
 *
 * ⚠️ A linha do `sessaoDoHarness()` vem ANTES da truncagem, e a ordem é a
 * invariante, não o estilo. MEDIDO 2026-10-14: sem ela, F2 e F3 liam 1 e 2
 * em `expect(await contarUsuarios(), …).toBe(0)`, em execução isolada.
 *
 * O motivo é que `contarUsuarios()` é quem CHAMA `sessaoDoHarness()` (via
 * `listarUsuarios` → `chamar`). Com a sessão fria, ele semeia a conta para
 * poder listar — e a conta recém-criada é justamente a que a listagem
 * devolve. O soft-delete antigo escondia isso sem querer: o `limparBase`
 * chamava `listarUsuarios()` primeiro, o que semeava a conta, e em seguida
 * apagava ela no laço. Sessão em cache e conta FORA da listagem é o que
 * aquele código entregava por acidente, e é o que a truncagem precisa
 * reproduzir à mão: semear ANTES (o token é stateless e sobrevive à
 * truncagem — ADR 0002), truncar DEPOIS (a linha vai junto).
 */
export async function limparBase(): Promise<void> {
  await sessaoDoHarness();
  const prisma = prismaE2E();
  try {
    await cleanDatabase(prisma);
  } catch {
    // MEDIDO 2026-10-14: o F5 PARA o Postgres de propósito (é o caminho "rede
    // caída"), e o `afterEach` do `describe` o levanta antes do `beforeEach`
    // seguinte — o banco está de pé quando esta linha roda. O que não volta é
    // a conexão que o pool do Prisma tinha aberta para o container parado: o
    // `docker stop` fecha o lado do servidor, e a query seguinte morre com
    // `Server has closed the connection` mesmo com o Postgres no ar.
    //
    // Reconectar e repetir é o conserto; repetir sem reconectar não é — e se a
    // segunda também falhar, ela sobe com a mensagem do servidor em vez da
    // primeira, que é a que mentia sobre a causa.
    await prisma.$disconnect();
    await cleanDatabase(prisma);
  }
}

let prismaDoE2E: PrismaClient | undefined;

/**
 * O ÚNICO `PrismaClient` do worker de e2e — e o motivo de ser único é o
 * `catch` de {@link limparBase}.
 *
 * MEDIDO 2026-10-16 (CI run 38978299713, `quality` vermelho): o F5 derruba o
 * Postgres de propósito, e o `docker stop` fecha o lado do servidor de TODAS as
 * conexões abertas. O `/health` voltando a 200 prova que o Postgres restarted —
 * não que as conexões que o pool do Prisma já tinha voltaram, porque elas
 * morreram com o container. Por isso o `catch` reconecta e repete.
 *
 * Havia um segundo cliente, em `rbac.ts`, que ninguém curava: `semearPerfil()`
 * recebia `Server has closed the connection` e derrubava o F9 inteiro. Passava
 * isolado e falhava na suíte completa, porque o Playwright REUSA o processo do
 * worker entre arquivos — então a conexão morta do container do F5 sobrevivia
 * dentro do processo em que o F9 roda.
 *
 * Consequência a levar junto: um `PrismaClient` novo neste diretório não é uma
 * escolha de estilo, é um pool sem a recuperação, e volta a ser um flake que
 * só aparece em suíte completa — a forma de falha mais cara de diagnosticar.
 */
export function prismaE2E(): PrismaClient {
  prismaDoE2E ??= new PrismaClient({ datasourceUrl: exigirEstado().databaseUrl });
  return prismaDoE2E;
}
