// apps/web/app/users/[id]/page.tsx
//
// pt-BR: o detalhe de UMA pessoa — quem ela é, as empresas em que ela está
// inserida e o HISTÓRICO de auditoria dela. Tela do ADMINISTRADOR DO SISTEMA.
//
// ⚠️ O GUARD é `exigirAdminDoSistema()`, o do bucket GLOBAL: o inventário da
// tenancy é do administrador do sistema (D8). O `isAdmin` da empresa é o do
// DONO, e autorizar por ele mostraria as empresas de uma pessoa para um
// gerente que a API recusa com 403.
//
// ⚠️ A LEITURA QUE FALHOU tem TRÊS respostas, e o DONO delas é
// `telaDaFalhaDeLeitura` (`app/admin/guard-admin.tsx`): 401 é sessão
// expirada (login), 403 é a API recusando o ator ("Acesso restrito") e o
// resto é serviço fora (retry). O `catch` nu tratava as três como serviço
// fora — e "não existe" NÃO é uma delas: id fora do inventário é
// `notFound()`, que é outra resposta.
//
// ⚠️ O HISTÓRICO é a SEGUNDA LEITURA, e ela é de outra categoria: a pessoa e
// as empresas são o CONTEÚDO PRINCIPAL, e o histórico é secundário. A falha
// dele NÃO pode derrubar a tela — ela vira um `Alerta` DENTRO da seção. Mas
// o `401` continua sendo sessão expirada, e vai para o login como em
// qualquer outra leitura (`redirecionarParaLoginSeSessaoExpirada`).

import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerta } from '@/components/ui/alerta';
import { Botao, CLASSES_BOTAO_SECUNDARIO } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { CabecalhoSecao } from '@/components/ui/cabecalho-secao';
import { Container } from '@/components/ui/container';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { LinkTexto } from '@/components/ui/link-texto';
import { CabecalhoTabela, CelulaTabela, Tabela } from '@/components/ui/tabela';
import {
  exigirAdminDoSistema,
  redirecionarParaLoginSeSessaoExpirada,
  telaDaFalhaDeLeitura,
} from '../../admin/guard-admin';
import {
  listarHistoricoDoUsuario,
  listarInventario,
  rotuloDaOperacao,
  vinculo,
} from '../../../lib/tenancy';
import { exigirSessao } from '../../../lib/sessao';
import { ApiError } from '../../../lib/api-client';
import type { UserHistoryEntryDto, UserOutputDto } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  /**
   * A query da tela — e o **cursor** da paginação do histórico.
   *
   * ⚠️ O cursor viaja na URL, e não num estado do browser: a página é um
   * Server Component, e o "carregar mais" é um LINK. O histórico de uma
   * pessoa é paginado, e uma página que só mostra a primeira página mostra um
   * histórico PARCIAL — que parece completo.
   */
  searchParams: Promise<{ cursor?: string }>;
}

/**
 * O resultado de uma LEITURA — e a razão de ela ser um valor, e não uma
 * exceção.
 *
 * ⚠️ O histórico é lido EM PARALELO com o inventário, e um `Promise.all` que
 * rejeita derruba a tela INTEIRA por causa de uma leitura secundária. Por
 * isso a leitura do histórico NUNCA rejeita: ela devolve o erro como valor, e
 * a tela decide o que fazer com ele (um `Alerta`, ou o login).
 */
type Leitura<T> = { ok: true; valor: T } | { ok: false; erro: unknown };

async function ler<T>(leitura: () => Promise<T>): Promise<Leitura<T>> {
  try {
    return { ok: true, valor: await leitura() };
  } catch (erro) {
    return { ok: false, erro };
  }
}

/**
 * UMA PÁGINA do histórico — a que a URL pede.
 *
 * ⚠️ A API devolve a trilha do **mais novo para o mais antigo**, e o
 * `nextCursor` aponta para as versões mais **antigas**. A tela pede UMA página
 * por visita: a versão mais recente é a primeira da primeira página, e as
 * mais antigas chegam pelo "carregar mais".
 *
 * ⚠️ A versão antiga da tela buscava até 10 páginas e mostrava as 100 mais
 * ANTIGAS — e o teto cortava justamente as mais recentes, que são as que dizem
 * quando a pessoa mudou pela última vez.
 */
async function lerHistorico(
  accessToken: string,
  id: string,
  cursor: string | undefined,
): Promise<{ entradas: UserHistoryEntryDto[]; proximoCursor: string | null }> {
  const pagina = await listarHistoricoDoUsuario(accessToken, id, cursor);
  return { entradas: pagina.entries, proximoCursor: pagina.nextCursor };
}

/**
 * QUEM MUDOU — o nome de quem está no inventário.
 *
 * ⚠️ A criação por rota PÚBLICA não tem ator (`changedBy` é `null`), e o
 * TRAÇO é a resposta honesta. Um rótulo ("usuário desconhecido") seria
 * mentira: o dado que existe aqui é a AUSÊNCIA de ator.
 *
 * ⚠️ E quem não está no inventário (conta apagada, ou histórico de fora da
 * base) entra pelo ID CRU, em tinta secundária — o id é o dado que existe, e
 * o nome não.
 *
 * ⚠️ O MAP e não o `find` por linha: com a base de 10 mil usuários, a
 * varredura linear daria ~10 milhões de comparações de string por
 * requisição. O mapa é construído UMA vez, por tela.
 */
function quemMudou(
  changedBy: string | null,
  nomeDoAtor: ReadonlyMap<string, string>,
): React.ReactNode {
  if (changedBy === null) return '—';
  const nome = nomeDoAtor.get(changedBy);
  if (nome === undefined) {
    return <span className="text-muted-foreground">{changedBy}</span>;
  }
  return nome;
}

/**
 * O DADO de uma versão — o nome e o e-mail **daquele** registro.
 *
 * ⚠️ O campo ausente vira "—", e não uma célula vazia: uma célula vazia é
 * indistinguível de "a pessoa não tinha nome". E o `snapshot` NULO (o banco
 * aceita `null` em JSONB) não pode derrubar a tela — o raio do erro é a
 * seção, e não a página inteira, que é o que a seção existe para proteger.
 */
function dadoDaVersao(snapshot: UserOutputDto | null): React.ReactNode {
  if (snapshot === null || snapshot === undefined) return '—';
  const nome = snapshot.nome;
  const email = snapshot.email;
  return (
    <>
      <div className="break-words">{nome ?? '—'}</div>
      <div className="break-words text-sm text-muted-foreground">{email ?? '—'}</div>
    </>
  );
}

/**
 * A data da versão — em pt-BR, e com o fuso **declarado**.
 *
 * ⚠️ O fuso é explícito (`America/Sao_Paulo`) porque a página é um Server
 * Component: sem ele, a data sai no fuso do SERVIDOR (o container roda em
 * UTC), e a pessoa de Brasília lê 12:30 onde eram 09:30.
 */
function quandoDe(changedAt: string): string {
  const data = new Date(changedAt);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default async function DetalheUsuarioPage({
  params,
  searchParams,
}: PageProps): Promise<React.JSX.Element> {
  // pt-BR: a sessão primeiro, e o token segue para o guard — uma leitura do
  // cookie store, e o mesmo token na checagem de perfil e na leitura do
  // inventário.
  const accessToken = await exigirSessao();

  const guarda = await exigirAdminDoSistema(accessToken);
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return, e é ele que impede o detalhe de vazar para quem não
  // é administrador do sistema.
  if (guarda.bloqueio) return guarda.tela;

  const { id } = await params;
  const { cursor } = await searchParams;

  // ⚠️ As DUAS leituras correm EM PARALELO: o inventário e o histórico não
  // dependem um do outro (o nome de "quem mudou" é resolvido na RENDERIZAÇÃO,
  // não na leitura). E serializadas, elas somariam dois prazos de timeout na
  // tela.
  //
  // ⚠️ E NENHUMA das duas rejeita: o `Promise.all` de um `reject` derruba a
  // tela inteira, e a falha do histórico é uma das respostas que a tela
  // PRECISA ter (o `Alerta` da seção, ou o login no 401).
  const [inventario, historico] = await Promise.all([
    ler(() => listarInventario(accessToken)),
    ler(() => lerHistorico(accessToken, id, cursor)),
  ]);

  // ⚠️ A falha do INVENTÁRIO é a de hoje: a tela inteira
  // (`telaDaFalhaDeLeitura`). O inventário é o que a tela é.
  if (!inventario.ok) return telaDaFalhaDeLeitura(inventario.erro);

  // ⚠️ E a falha do HISTÓRICO é MENOR: o 401 é sessão expirada e vai para o
  // login (o dono da decisão é `guard-admin.tsx`); o resto vira `Alerta`
  // DENTRO da seção, e a pessoa continua na tela.
  if (!historico.ok) {
    redirecionarParaLoginSeSessaoExpirada(historico.erro);
  }

  // pt-BR: id desconhecido é `notFound()` — a pessoa não existe, e a tela de
  // "serviço fora" mentiria sobre a causa.
  //
  // ⚠️ E A PESSOA APAGADA NÃO ESTÁ NO INVENTÁRIO (o inventário filtra
  // `deletedAt: null`) — mas a API entrega a trilha dela, e o `snapshot` da
  // ÚLTIMA versão é a pessoa COMO ELA FOI APAGADA. Sem isto, o histórico de
  // quem saiu da empresa era inalcançável pela única rota que o lê.
  const usuario = inventario.valor.usuarios.find((u) => u.id === id);
  const primeiraEntrada = historico.ok ? historico.valor.entradas[0] : undefined;
  const snapshotDaPessoa = usuario === undefined ? primeiraEntrada?.snapshot : undefined;
  if (usuario === undefined && snapshotDaPessoa === undefined) notFound();
  const pessoa = usuario ?? { nome: snapshotDaPessoa!.nome, email: snapshotDaPessoa!.email };
  const pessoaApagada = snapshotDaPessoa?.isDeleted === true;

  // ⚠️ O NOME de cada ator, indexado UMA vez: a coluna "Quem mudou" resolve
  // um id por linha do histórico, e o `find` linear por linha custaria
  // ~10 milhões de comparações de string numa base de 10 mil usuários.
  const nomeDoAtor = new Map(inventario.valor.usuarios.map((u) => [u.id, u.nome]));

  return (
    <Container>
      <CabecalhoPagina titulo={pessoa.nome} descricao={pessoa.email} />

      {pessoaApagada ? (
        // ⚠️ A pessoa APAGADA é a informação principal que o inventário não
        // tem — e a tela precisa dizer, ou o administrador lê uma pessoa sem
        // empresa e sem explicação.
        <p className="mt-2 text-sm text-muted-foreground">
          Esta pessoa foi apagada — o histórico abaixo é a trilha que ela deixou.
        </p>
      ) : null}

      <section className="mt-8">
        <CabecalhoSecao>Empresas</CabecalhoSecao>
        {usuario === undefined || usuario.empresas.length === 0 ? (
          // pt-BR: lista vazia é RESPOSTA, não erro — a conta do administrador
          // do sistema não pertence a empresa nenhuma. E o estado vazio diz o
          // que a pessoa pode FAZER: o inventário é onde as empresas estão.
          <div className="mt-3">
            <EstadoVazio
              titulo="Nenhuma empresa"
              descricao="Esta pessoa não está inserida em nenhuma empresa."
              acao={
                <Botao href="/admin/tenancy" variante="secundario">
                  Ver empresas e usuários
                </Botao>
              }
            />
          </div>
        ) : (
          // ⚠️ `min-w-0` no item do grid: o nome da empresa vai a 100
          // caracteres e pode ser uma palavra única — e `overflow-wrap` não
          // reduz a contribuição min-content, então o item cresceria e a tela
          // rolaria na horizontal a 320px (WCAG 1.4.10).
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {usuario.empresas.map((empresa) => (
              <li key={empresa.id} className="min-w-0">
                <Link
                  href={`/empresa/${empresa.id}`}
                  className="foco block rounded-md bg-surface p-4 hover:bg-muted"
                >
                  <div className="break-words font-medium text-foreground">{empresa.nome}</div>
                  {/* pt-BR: o slug é METADADO (o identificador legível) — e é
                      a tinta secundária nos DOIS lugares onde ele aparece.
                      ⚠️ `aria-hidden`: dentro do link ele entrava no nome
                      acessível do card ("Acme acme papel: gerente · perfil:
                      gerente"), e o leitor de tela anunciava o identificador
                      como parte do destino. O dado continua VISÍVEL; ele só
                      para de ser lido — o mesmo tratamento que a versão
                      recebe na listagem (`app/users/page.tsx`). */}
                  <div aria-hidden="true" className="break-words text-xs text-muted-foreground">
                    <code>{empresa.slug}</code>
                  </div>
                  {/* pt-BR: o VÍNCULO é o dado que dá sentido ao card (o que
                      a pessoa é NAQUELA empresa), então ele é tinta primária.
                      E o rótulo NÃO é mais preciso aqui: o `vinculo` já NOMEIA
                      as duas partes ("papel: … · perfil: …"), e um "Vínculo:"
                      na frente só repetiria o que o par já diz. */}
                  <div className="mt-1 text-sm text-foreground">
                    {vinculo(empresa.role, empresa.perfil)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <CabecalhoSecao>Histórico</CabecalhoSecao>
        {historico.ok ? (
          historico.valor.entradas.length === 0 ? (
            // pt-BR: histórico sem entrada é RESPOSTA, não erro. (Na prática
            // toda pessoa tem ao menos a criação.)
            <div className="mt-6">
              <EstadoVazio
                titulo="Sem histórico"
                descricao="Esta pessoa ainda não tem versões registradas."
              />
            </div>
          ) : (
            <>
              {/* pt-BR: a ORDEM é DECLARADA, e não só implícita: quem lê
                  precisa saber se a linha mais nova vem primeiro. A ordem é a
                  da API (`version` DECRESCENTE — a mais nova primeiro), e é a
                  ordem de quem lê uma trilha de auditoria.

                  ⚠️ A coluna "MOTIVO" NÃO entra, e o motivo é MEDIDO:
                  `users_history.reason` é SEMPRE `null` — o `DELETE /users/{id}`
                  fixa `reason: null` (`users.controller.ts`), e o
                  `extractReason` só devolve reason no evento `.deleted.v1`,
                  que o soft-delete emite com o valor que o controller mandou.
                  Uma coluna que só mostra "—" em toda linha é ruído — e
                  esconde o dado que a coluna devia mostrar. Se a API passar a
                  gravar o motivo, a coluna volta com o dado. */}
              <p className="mt-1 text-sm text-muted-foreground">
                As versões da pessoa, da mais recente para a mais antiga.
              </p>
              {/* ⚠️ A legenda NOMEIA a pessoa: duas pessoas abertas na mesma
                  tela dariam a mesma legenda ao leitor de tela, e a legenda é
                  o nome acessível da tabela. */}
              <Tabela legenda={`Histórico de ${pessoa.nome}, da mais recente para a mais antiga`}>
                <thead>
                  <tr>
                    <CabecalhoTabela>Versão</CabecalhoTabela>
                    <CabecalhoTabela>O que houve</CabecalhoTabela>
                    <CabecalhoTabela>Nome e e-mail naquele registro</CabecalhoTabela>
                    <CabecalhoTabela>Quando</CabecalhoTabela>
                    <CabecalhoTabela>Quem mudou (nome atual)</CabecalhoTabela>
                  </tr>
                </thead>
                <tbody>
                  {historico.valor.entradas.map((entrada) => (
                    <tr key={`${entrada.entityId}-${entrada.version}`}>
                      <CelulaTabela>{entrada.version}</CelulaTabela>
                      <CelulaTabela>{rotuloDaOperacao(entrada.operation)}</CelulaTabela>
                      {/* pt-BR: o NOME e o E-MAIL são os DA VERSÃO — o
                          `snapshot` gravado. O nome de hoje é o do título da
                          tela, e é o que muda a cada alteração.

                          ⚠️ `w-48`: MEDIDO, com o e-mail de 249 chars (o VO
                          permite 254) a tabela media 2.097px dentro de um
                          wrapper de 288px a 320px — e "Quando" e "Quem
                          mudou" ficavam a 7 telas de rolagem. */}
                      <CelulaTabela className="w-48">{dadoDaVersao(entrada.snapshot)}</CelulaTabela>
                      <CelulaTabela>{quandoDe(entrada.changedAt)}</CelulaTabela>
                      <CelulaTabela>{quemMudou(entrada.changedBy, nomeDoAtor)}</CelulaTabela>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
              {historico.valor.proximoCursor !== null ? (
                // ⚠️ O "CARREGAR MAIS" é um LINK, e não um botão: a página é um
                // Server Component, e o cursor viaja na URL. E o cursor aponta
                // para as versões MAIS ANTIGAS — a ordem da trilha.
                <div className="mt-3">
                  <LinkTexto
                    href={`/users/${id}?cursor=${encodeURIComponent(historico.valor.proximoCursor)}`}
                  >
                    Carregar mais histórico
                  </LinkTexto>
                </div>
              ) : null}
            </>
          )
        ) : (
          <div className="mt-3 space-y-3">
            <Alerta variante="erro">{mensagemDoErroDoHistorico(historico.erro)}</Alerta>
            {/* ⚠️ O "TENTAR DE NOVO" só aparece na falha TRANSITÓRIA. Uma
                recusa (403) e um "não existe" (404) não melhoram com retry —
                e o botão "tente de novo" numa recusa é a tela mentindo sobre a
                causa. */}
            {erroTransitorio(historico.erro) ? (
              // ⚠️ É um `<a href="">` e não o `Botao`: esta página é Server
              // Component, e um `onClick` exigiria um wrapper `'use client'`.
              // O `href` vazio resolve para o documento atual e o browser
              // recarrega a página, reexecutando a leitura que falhou (o
              // mesmo caminho do `guard-admin`).
              <a href="" className={CLASSES_BOTAO_SECUNDARIO}>
                Tentar de novo
              </a>
            ) : null}
          </div>
        )}
      </section>

      <div className="mt-8">
        <LinkTexto href="/users">Voltar para usuários</LinkTexto>
      </div>
    </Container>
  );
}

/**
 * A falha TRANSITÓRIA — a única em que "tentar de novo" faz sentido.
 *
 * ⚠️ Uma recusa (403) e um "não existe" (404) não melhoram com retry: o
 * primeiro não vai virar 200, e o segundo aponta para um id que não existe.
 */
function erroTransitorio(erro: unknown): boolean {
  if (erro instanceof ApiError) return erro.status !== 403 && erro.status !== 404;
  return true;
}

/**
 * A mensagem do erro do histórico — e ela DIZ a causa.
 *
 * ⚠️ O texto antigo era o mesmo para todo erro não-401 ("Tente de novo em
 * instantes"), e a recusa da API é PERMANENTE: "tente de novo" é mentira.
 */
function mensagemDoErroDoHistorico(erro: unknown): string {
  if (erro instanceof ApiError && erro.status === 403) {
    return 'Você não tem permissão de ler o histórico desta pessoa.';
  }
  if (erro instanceof ApiError && erro.status === 404) {
    return 'Não há histórico disponível para esta pessoa.';
  }
  return 'Não foi possível carregar o histórico desta pessoa. Tente de novo em instantes.';
}
