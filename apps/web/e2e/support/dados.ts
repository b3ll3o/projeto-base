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
// Consequência aceita e documentada: `limparBase()` faz SOFT-DELETE, então as
// tabelas `users_history`/`user_archive` acumulam ao longo da execução. Isso
// é irrelevante aqui porque o container é efêmero e nasce do zero a cada
// `test:e2e` — e, mais importante, a listagem da tela esconde soft-deleted por
// padrão (`includeDeleted=false`), que é exatamente o que "banco limpo" precisa
// significar para um usuário.
//
// A consequência que NÃO é irrelevante: soft-deleted não devolve o `email`.
// Ele continua `@unique` na linha apagada. Daí `emailUnico()` — nenhum spec
// reusa um email, nem entre si nem no `--repeat-each`. O motivo inteiro está
// em `semearUsuario`.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

async function chamar(
  metodo: string,
  caminho: string,
  init?: { corpo?: unknown; cabecalhos?: Record<string, string> },
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
  const resposta = await fetch(`${apiBaseUrl}${caminho}`, {
    method: metodo,
    headers: {
      ...(temCorpo ? { 'content-type': 'application/json' } : {}),
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

export async function criarUsuario(nome: string, email: string): Promise<ResultadoCriacao> {
  const { status, corpo } = await chamar('POST', '/users', { corpo: { nome, email } });
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
 */
export async function apagarUsuario(id: string, version: number): Promise<void> {
  const { status, corpo } = await chamar('DELETE', `/users/${id}`, {
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
 * Deixa a listagem vazia: soft-delete de tudo que ela devolve.
 *
 * pt-BR: `DELETE /users/:id` exige `If-Match: W/"v<n>"` (optimistic locking,
 * RFC 7232). A versão vem do próprio GET — que é o mesmo número que a tela
 * mostra como `v1`, `v2`… na listagem.
 */
export async function limparBase(): Promise<void> {
  const usuarios = await listarUsuarios();
  for (const usuario of usuarios) {
    const { status, corpo } = await chamar('DELETE', `/users/${usuario.id}`, {
      cabecalhos: { 'if-match': `W/"v${usuario.version}"` },
    });
    if (status !== 204) {
      throw new Error(
        `DELETE /users/${usuario.id} respondeu ${status} (esperado 204): ${JSON.stringify(corpo)}`,
      );
    }
  }
}
