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
  limite?: number,
): Promise<{ entradas: UserHistoryEntryDto[]; proximoCursor: string | null }> {
  // ⚠️ O `limite` só vai quando EXISTE: a chamada da página completa é a de
  // três argumentos, e um `undefined` no quarto mudaria a assinatura
  // observada por quem mede a tela.
  const pagina =
    limite === undefined
      ? await listarHistoricoDoUsuario(accessToken, id, cursor)
      : await listarHistoricoDoUsuario(accessToken, id, cursor, limite);
  return { entradas: pagina.entries, proximoCursor: pagina.nextCursor };
}

/**
 * QUEM MUDOU — o nome de quem está no inventário.
 *
 * ⚠️ A criação por rota PÚBLICA não tem ator (`changedBy` é `null`), e
 * "sem ator" é a resposta honesta. Um rótulo ("usuário desconhecido") seria
 * mentira: o dado que existe aqui é a AUSÊNCIA de ator. E não é o TRAÇO: o
 * travessão é o "o dado não veio" de outra coluna, e o mesmo símbolo querendo
 * dizer duas coisas na mesma tabela esconde o dado.
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
  // ⚠️ "SEM ATOR" e não o travessão: o travessão aparece em OUTRA coluna
  // ("o dado não veio"), e o mesmo símbolo querendo dizer duas coisas na
  // mesma tabela é ruído que esconde o dado.
  if (changedBy === null) return 'sem ator';
  const nome = nomeDoAtor.get(changedBy);
  if (nome === undefined) {
    // ⚠️ O id CRU, e com o que ele é: um id solto na tela não diz se é conta
    // removida ou defeito. O dado continua sendo o id — o rótulo é o que
    // explica.
    return (
      <span className="text-muted-foreground">
        <span className="block text-xs">conta fora do inventário</span>
        {changedBy}
      </span>
    );
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
 *
 * ⚠️ `wrap-anywhere` (e não `break-words`): `break-word` NÃO reduz a
 * contribuição min-content — só `anywhere` reduz. MEDIDO 2026-11-18 (pelo
 * e2e do F21, com o e-mail de 254 chars): com o `break-words` aqui, a célula
 * do e-mail media **2.017px** dentro de um wrapper de 288px — e "Quando" e
 * "Quem mudou" ficavam a ~7 telas de rolagem.
 *
 * ⚠️ E A CLASSA VAI NO CONTEÚDO, e não na célula — e o motivo é a HERANÇA:
 * `overflow-wrap` é propriedade herdada, o `<td>` traz `break-words` na base
 * (a primitiva) e o `<div>` interno traz `wrap-anywhere`, que especifica o
 * valor DELE e vence o herdado. A ordem do CSS compilado só decide quando as
 * DUAS classes estão no MESMO elemento — e aqui elas não estão (MEDIDO
 * 2026-11-18 na 5ª revisão do PR #171: o comentário antigo explicava o
 * mecanismo pela ORDEM, que não é o mecanismo).
 */
function dadoDaVersao(snapshot: UserOutputDto | null): React.ReactNode {
  if (snapshot === null || snapshot === undefined) return '—';
  const nome = snapshot.nome;
  const email = snapshot.email;
  return (
    <>
      <div className="wrap-anywhere">{nomeVazio(nome)}</div>
      <div className="wrap-anywhere text-sm text-muted-foreground">{nomeVazio(email)}</div>
    </>
  );
}

/**
 * O campo que NÃO VEIO — e o VAZIO conta como "não veio".
 *
 * ⚠️ A API PROJETA o snapshot (a lista de campos do `UserOutputDto`), e um
 * campo ausente sai como string VAZIA — e `'' ?? '—'` é `''`: a célula
 * ficaria vazia, que é indistinguível de "a pessoa não tinha nome".
 * ⚠️ E o vazio não é um nome possível: o `UserName` exige de 2 a 100
 * caracteres. Um nome vazio no snapshot é um dado que NÃO CHEGOU.
 */
function nomeVazio(valor: string | undefined | null): string {
  return valor === undefined || valor === null || valor.length === 0 ? '—' : valor;
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

  // ⚠️ A IDENTIDADE vem da PESSOA, e não da primeira linha da página
  // CORRENTE do histórico. A versão MAIS RECENTE é a primeira da PRIMEIRA
  // página: na página 2 (o cursor na URL), a primeira linha é a versão mais
  // ANTIGA — e o `h1` passava a afirmar um nome falso, e o aviso de "foi
  // apagada" sumia. MEDIDO 2026-11-17 na revisão do PR #171.
  //
  // Por isso, com cursor na URL e a pessoa fora do inventário, a tela lê a
  // página 1 (limit=1) para saber QUEM é a pessoa. A leitura é pequena (uma
  // versão) e só acontece no caso que a precisa.
  let versaoMaisRecente = historico.ok ? historico.valor.entradas[0] : undefined;
  if (usuario === undefined && cursor !== undefined) {
    const maisRecente = await ler(() => lerHistorico(accessToken, id, undefined, 1));
    // ⚠️ Se a leitura da versão MAIS RECENTE falhar, o valor é `undefined` —
    // e não a primeira linha da página corrente: na página do cursor, essa
    // linha é a versão mais ANTIGA, e o `h1` voltaria a afirmar o nome de
    // uma versão antiga (o defeito que esta leitura existe para fechar).
    versaoMaisRecente = maisRecente.ok ? maisRecente.valor.entradas[0] : undefined;
  }

  // ⚠️ O 404 SÓ COM EVIDÊNCIA. Uma falha TRANSITÓRIA do histórico com a
  // pessoa fora do inventário (a pessoa apagada) NÃO é "não existe" — e
  // afirmar que ela não existe é a tela mentindo sobre a causa (MEDIDO 2026-11-17
  // na revisão do PR #171: um 500 transitório transformava o detalhe de uma
  // pessoa apagada em "não existe").
  //
  // ⚠️ E POR QUE ESTA ROTA NÃO TEM `loading.tsx` — MEDIDO 2026-11-17: com um
  // `loading.tsx` no segmento, o Next envia o SHELL (o esqueleto) antes de a
  // página resolver, e o STATUS HTTP fica comprometido em 200. O `notFound()`
  // desta linha chegaria tarde: o corpo seria o de "não encontrado" e o
  // status, 200 — e o F20 afirma o STATUS (o corpo sozinho não diz que o
  // recurso não existe). Sem o `loading.tsx`, a resposta é 404 ✓.
  //
  // O estado "carregando" é a LACUNA DECLARADA do app de referência
  // (`estilizacao.md` §4.1: "o carregando NÃO existe — 0 arquivos
  // `loading.tsx`"), e o app derivado que precisar dos 4 estados declara —
  // sabendo que ele precisa do `loading.tsx` no LAYOUT (que resolve antes do
  // primeiro flush), e não na página.
  if (usuario === undefined) {
    if (!historico.ok) {
      const status = historico.erro instanceof ApiError ? historico.erro.status : null;
      // O 404 da API É a evidência: a pessoa não existe.
      if (status === 404) notFound();
      // ⚠️ E O 400 NÃO É "SERVIÇO FORA": é a query inválida (o cursor da
      // URL), e a saída está no `Alerta` da seção (o link para o início da
      // trilha). A tela de serviço fora diria que a API caiu — e a API está
      // de pé: quem está quebrado é o LINK.
      if (status !== 400) {
        // E sem o inventário E sem a trilha, a tela não sabe QUEM é a pessoa:
        // a resposta honesta é a tela de leitura falhada (401 → login, 403 →
        // restrito, o resto → serviço fora).
        return telaDaFalhaDeLeitura(historico.erro);
      }
    } else if (historico.valor.entradas.length === 0) {
      // A trilha vazia é a outra evidência: não há rastro da pessoa em lugar
      // nenhum.
      notFound();
    }
  }

  const snapshotDaPessoa = usuario === undefined ? (versaoMaisRecente?.snapshot ?? null) : null;
  // ⚠️ O título NUNCA fica vazio: sem nome (a pessoa apagada cujo snapshot
  // não tem o campo), ele mostra o ID — que é o dado que existe. Um nome
  // inventado seria pior que o id.
  const pessoa =
    usuario ??
    (snapshotDaPessoa !== null
      ? {
          nome: nomeVazio(snapshotDaPessoa.nome) === '—' ? id : snapshotDaPessoa.nome,
          email: snapshotDaPessoa.email,
        }
      : { nome: id, email: '' });
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
              // ⚠️ A pessoa APAGADA ESTAVA: o inventário filtra
              // `deletedAt: null`, e a ausência é de AGORA. O texto antigo
              // ("não está inserida em nenhuma empresa") contradizia o aviso
              // de "esta pessoa foi apagada" — duas frases que se negam na
              // mesma tela.
              descricao={
                pessoaApagada
                  ? 'Esta pessoa foi apagada — as empresas em que ela estava não aparecem mais no inventário.'
                  : 'Esta pessoa não está inserida em nenhuma empresa.'
              }
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

                  ⚠️ A coluna "MOTIVO" NÃO entra, e o motivo é MEDIDO: o
                  `reason` é `null` em quase toda linha — o `DELETE /users/{id}`
                  fixa `reason: null` (`users.controller.ts`), a CRIAÇÃO e a
                  renomeação não têm motivo, e só a RESTAURAÇÃO o grava (e
                  só quando o cliente manda um — MEDIDO 2026-11-17 na revisão
                  do PR #171: o motivo era aceito pelo contrato e
                  descartado). Uma coluna que mostra "—" em quase toda linha
                  é ruído — e esconde o dado que a coluna devia mostrar. O
                  motivo, quando EXISTE, aparece NA LINHA do evento (a
                  coluna "O que houve"). */}
              {/* ⚠️ O TEXTO DIZ O QUE A PÁGINA MOSTRA: na página do cursor
                  (a segunda, a terceira…), as versões são as MAIS ANTIGAS —
                  e o texto fixo ("da mais recente para a mais antiga")
                  prometia o oposto do que a pessoa lê. E a legenda é o NOME
                  acessível da tabela: ela repetia a mesma promessa falsa. */}
              <p className="mt-1 text-sm text-muted-foreground">
                {cursor === undefined
                  ? 'As versões da pessoa, da mais recente para a mais antiga.'
                  : 'Esta página mostra as versões mais antigas da pessoa — da mais recente para a mais antiga, dentro da página.'}
              </p>
              {/* ⚠️ A legenda NOMEIA a pessoa: duas pessoas abertas na mesma
                  tela dariam a mesma legenda ao leitor de tela, e a legenda é
                  o nome acessível da tabela. */}
              <Tabela
                id={`historico-${id}`}
                legenda={
                  cursor === undefined
                    ? `Histórico de ${pessoa.nome}, da mais recente para a mais antiga`
                    : `Página do histórico de ${pessoa.nome} com as versões mais antigas`
                }
              >
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
                      {/* ⚠️ `tabular-nums`: a coluna é NUMÉRICA, e o padrão
                          (`ui-craft` §6) exige algarismos de largura fixa —
                          senão as versões não alinham na leitura de uma
                          coluna. */}
                      <CelulaTabela className="tabular-nums">{entrada.version}</CelulaTabela>
                      {/* ⚠️ O MOTIVO, quando existe — e ele fica NA LINHA do
                          evento, e não numa coluna. A restauração é o único
                          evento que o grava (o `DELETE` fixa `reason: null`),
                          e o porquê de uma restauração é o dado que a trilha
                          guarda. Uma coluna de motivo mostraria "—" em quase
                          toda linha — e ruído que esconde o dado. */}
                      <CelulaTabela>
                        {rotuloDaOperacao(entrada.operation)}
                        {entrada.reason !== null &&
                        entrada.reason !== undefined &&
                        entrada.reason !== '' ? (
                          <div className="wrap-anywhere text-sm text-muted-foreground">
                            {entrada.reason}
                          </div>
                        ) : null}
                      </CelulaTabela>
                      {/* pt-BR: o NOME e o E-MAIL são os DA VERSÃO — o
                          `snapshot` gravado. O nome de hoje é o do título da
                          tela, e é o que muda a cada alteração.

                          ⚠️ `w-48` — e o que ele VALE, que não são 192px:
                          MEDIDO 2026-11-18 pelo e2e do F21 a 320px, esta
                          célula (a 3ª: Versão · O que houve · Nome e e-mail ·
                          Quando · Quem mudou) mede **69,17px**, e a tabela
                          409,92px dentro de um wrapper de 288px. A largura
                          da tabela é DISTRIBUÍDA entre as colunas (a "Quando",
                          que é `whitespace-nowrap`, fica com 153px), e o
                          `w-48` é o TETO da coluna, não o que ela ocupa.

                          ⚠️ E O QUE O CONSERTO COMPROU: SEM o `wrap-anywhere`
                          no conteúdo, a MESMA célula media **2.017px** (o
                          e-mail inteiro) — e a página continuaria sem rolar,
                          porque o `overflow-x-auto` do wrapper segura o
                          transbordo. É por isso que o `dadoDaVersao` usa
                          `wrap-anywhere` — e é o que o e2e mede. */}
                      <CelulaTabela className="w-48">{dadoDaVersao(entrada.snapshot)}</CelulaTabela>
                      {/* ⚠️ `whitespace-nowrap`: a DATA não quebra no meio —
                          "17/11/2026," e "21:00:31" em duas linhas é
                          ilegível, e a data é curta o bastante para caber. */}
                      <CelulaTabela className="whitespace-nowrap">
                        {quandoDe(entrada.changedAt)}
                      </CelulaTabela>
                      {/* ⚠️ `w-40` + `wrap-anywhere`: o nome do ator vai a
                          100 chars (o VO permite) e o id cru tem 36 — sem
                          largura fixa, a coluna esticava a tabela. */}
                      <CelulaTabela className="w-40">
                        <div className="wrap-anywhere">
                          {quemMudou(entrada.changedBy, nomeDoAtor)}
                        </div>
                      </CelulaTabela>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
              {historico.valor.proximoCursor !== null || cursor !== undefined ? (
                // ⚠️ A PAGINAÇÃO TROCA A PÁGINA, e não acrescenta: o cursor
                // viaja na URL e a visita nova mostra a página pedida. O link
                // é HONESTO ("ver as versões mais antigas") e existe o VOLTA
                // para as mais recentes — MEDIDO 2026-11-17 na revisão do PR
                // #171: com "carregar mais", a página 2 substituía as 100
                // versões mais recentes, e não havia volta.
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {cursor !== undefined && historico.valor.entradas.length > 0 ? (
                    // ⚠️ ONDE A PESSOA ESTÁ: a faixa de versões desta página.
                    // Sem ela, quem cai na página 2 pelo link não tem como
                    // saber o que ficou para trás.
                    <span className="text-xs text-muted-foreground">
                      Da versão {historico.valor.entradas[0]!.version} à{' '}
                      {historico.valor.entradas[historico.valor.entradas.length - 1]!.version} desta
                      página.
                    </span>
                  ) : null}
                  {historico.valor.proximoCursor !== null ? (
                    <LinkTexto
                      href={`/users/${id}?cursor=${encodeURIComponent(historico.valor.proximoCursor)}`}
                    >
                      Ver as versões mais antigas
                    </LinkTexto>
                  ) : null}
                  {cursor !== undefined ? (
                    <LinkTexto href={`/users/${id}`}>Ver as versões mais recentes</LinkTexto>
                  ) : null}
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
            {/* ⚠️ E O 400 TEM A SUA SAÍDA: o cursor da URL é inválido (ou é de
                outra trilha), e recarregar a MESMA URL repetiria a falha
                para sempre. O caminho de volta é o início da trilha. */}
            {erroDeQuery(historico.erro) ? (
              <LinkTexto href={`/users/${id}`}>Ver o histórico do início</LinkTexto>
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
 *
 * ⚠️ E o 400 TAMBÉM NÃO: ele é a query inválida (cursor malformado ou de
 * outra trilha) — e o botão de retry recarregaria a MESMA URL quebrada,
 * para sempre. MEDIDO 2026-11-17 na revisão do PR #171: o alerta dizia
 * "Tente de novo em instantes" para um 400 que nunca passava.
 */
function erroTransitorio(erro: unknown): boolean {
  if (erro instanceof ApiError) {
    return erro.status !== 403 && erro.status !== 404 && erro.status !== 400;
  }
  return true;
}

/**
 * A QUERY INVÁLIDA — o 400 do cursor (malformado ou de outra trilha).
 *
 * ⚠️ Ela é PERMANENTE e tem SAÍDA: o caminho de volta é a trilha do início,
 * sem o `cursor` da URL.
 */
function erroDeQuery(erro: unknown): boolean {
  return erro instanceof ApiError && erro.status === 400;
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
  if (erro instanceof ApiError && erro.status === 400) {
    // ⚠️ A mensagem DIZ O QUE FAZER: o link está incorreto, e recarregar a
    // mesma URL não muda nada.
    return 'O link do histórico está incorreto: o cursor informado é inválido.';
  }
  return 'Não foi possível carregar o histórico desta pessoa. Tente de novo em instantes.';
}
