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
  TETO_DE_PAGINAS_HISTORICO,
  listarHistoricoDoUsuario,
  listarInventario,
  rotuloDaOperacao,
  vinculo,
} from '../../../lib/tenancy';
import { exigirSessao } from '../../../lib/sessao';
import type { UserHistoryEntryDto } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
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
 * O histórico INTEIRO da pessoa — as páginas, até o fim.
 *
 * ⚠️ A API pagina por CURSOR (`nextCursor`), e a tela segue o cursor até ele
 * vir `null`. Uma tela que lê só a primeira página mostra um histórico
 * PARCIAL sem dizer — e parece completo.
 *
 * ⚠️ O TETO existe (10 páginas de 100), e o corte é VISÍVEL: quem tem mais
 * que isso vê a tela dizer que não coube tudo.
 */
async function lerHistorico(
  accessToken: string,
  id: string,
): Promise<{ entradas: UserHistoryEntryDto[]; truncado: boolean }> {
  const entradas: UserHistoryEntryDto[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < TETO_DE_PAGINAS_HISTORICO; pagina++) {
    const resposta = await listarHistoricoDoUsuario(accessToken, id, cursor);
    entradas.push(...resposta.entries);
    if (resposta.nextCursor === null) return { entradas, truncado: false };
    cursor = resposta.nextCursor;
  }
  // ⚠️ Chegou aqui com cursor ainda pendente: a API tem MAIS, e a tela diz
  // que tem. Sem esta linha, o histórico parcial pareceria completo.
  return { entradas, truncado: true };
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
 * ⚠️ O MAP e não o `find` por linha: com o teto da própria feature (1000
 * entradas) e uma base de 10 mil usuários, a varredura linear daria ~10
 * milhões de comparações de string por requisição. O mapa é construído UMA
 * vez, por tela.
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

export default async function DetalheUsuarioPage({
  params,
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
    ler(() => lerHistorico(accessToken, id)),
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
  const usuario = inventario.valor.usuarios.find((u) => u.id === id);
  if (usuario === undefined) notFound();

  // ⚠️ O NOME de cada ator, indexado UMA vez: a coluna "Quem mudou" resolve
  // um id por linha do histórico, e o `find` linear por linha custaria
  // ~10 milhões de comparações de string numa base de 10 mil usuários.
  const nomeDoAtor = new Map(inventario.valor.usuarios.map((u) => [u.id, u.nome]));

  return (
    <Container>
      <CabecalhoPagina titulo={usuario.nome} descricao={usuario.email} />

      <section className="mt-8">
        <CabecalhoSecao>Empresas</CabecalhoSecao>
        {usuario.empresas.length === 0 ? (
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
                  da API (`version` crescente — a mais antiga primeiro).

                  ⚠️ A coluna "MOTIVO" NÃO entra, e o motivo é MEDIDO:
                  `users_history.reason` é SEMPRE `null` — o `DELETE /users/{id}`
                  fixa `reason: null` (`users.controller.ts`), e o
                  `extractReason` só devolve reason no evento `.deleted.v1`,
                  que o soft-delete emite com o valor que o controller mandou.
                  Uma coluna que só mostra "—" em toda linha é ruído — e
                  esconde o dado que a coluna devia mostrar. Se a API passar a
                  gravar o motivo, a coluna volta com o dado. */}
              <p className="mt-1 text-sm text-muted-foreground">
                As versões da pessoa, da mais antiga para a mais recente.
              </p>
              {/* ⚠️ A legenda NOMEIA a pessoa: duas pessoas abertas na mesma
                  tela dariam a mesma legenda ao leitor de tela, e a legenda é
                  o nome acessível da tabela. */}
              <Tabela legenda={`Histórico de ${usuario.nome}, da mais antiga para a mais recente`}>
                <thead>
                  <tr>
                    <CabecalhoTabela>Versão</CabecalhoTabela>
                    <CabecalhoTabela>O que houve</CabecalhoTabela>
                    <CabecalhoTabela>Nome e e-mail naquele registro</CabecalhoTabela>
                    <CabecalhoTabela>Quando</CabecalhoTabela>
                    <CabecalhoTabela>Quem mudou</CabecalhoTabela>
                  </tr>
                </thead>
                <tbody>
                  {historico.valor.entradas.map((entrada) => (
                    <tr key={`${entrada.entityId}-${entrada.version}`}>
                      <CelulaTabela>{entrada.version}</CelulaTabela>
                      <CelulaTabela>{rotuloDaOperacao(entrada.operation)}</CelulaTabela>
                      {/* pt-BR: o NOME e o E-MAIL são os DA VERSÃO — o
                          `snapshot` gravado. O nome de hoje é o do título da
                          tela, e é o que muda a cada alteração. */}
                      <CelulaTabela>
                        <div className="break-words">{entrada.snapshot.nome}</div>
                        <div className="break-words text-sm text-muted-foreground">
                          {entrada.snapshot.email}
                        </div>
                      </CelulaTabela>
                      {/* pt-BR: a data em pt-BR, e a CRU não entra na tela.
                          A página é Server Component, então não há hydration
                          para brigar com o fuso do browser. */}
                      <CelulaTabela>
                        {new Date(entrada.changedAt).toLocaleString('pt-BR')}
                      </CelulaTabela>
                      <CelulaTabela>{quemMudou(entrada.changedBy, nomeDoAtor)}</CelulaTabela>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
              {historico.valor.truncado ? (
                // ⚠️ A tela DIZ que o histórico não coube — e diz o que ela
                // mostra. A API devolve da mais ANTIGA para a mais recente, e
                // o teto corta o FIM da sequência: o que fica na tela são as
                // versões MAIS ANTIGAS, e as mais RECENTES são as que não
                // couberam. Dizer "as mais recentes" seria mentira.
                <p className="mt-3 text-sm text-muted-foreground">
                  Mostrando as {historico.valor.entradas.length} versões mais antigas — há mais
                  histórico do que esta tela mostra.
                </p>
              ) : null}
            </>
          )
        ) : (
          <div className="mt-3 space-y-3">
            <Alerta variante="erro">
              Não foi possível carregar o histórico desta pessoa. Tente de novo em instantes.
            </Alerta>
            {/* ⚠️ É um `<a href="">` e não o `Botao`: esta página é Server
                Component, e um `onClick` exigiria um wrapper `'use client'`.
                O `href` vazio resolve para o documento atual e o browser
                recarrega a página, reexecutando a leitura que falhou (o
                mesmo caminho do `guard-admin`). */}
            <a href="" className={CLASSES_BOTAO_SECUNDARIO}>
              Tentar de novo
            </a>
          </div>
        )}
      </section>

      <div className="mt-8">
        <LinkTexto href="/users">Voltar para usuários</LinkTexto>
      </div>
    </Container>
  );
}
