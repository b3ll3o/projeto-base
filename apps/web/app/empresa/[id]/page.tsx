// apps/web/app/empresa/[id]/page.tsx
//
// pt-BR: a empresa e QUEM está dentro dela. Tela do ADMINISTRADOR DO SISTEMA,
// com o MESMO guard do inventário (`app/admin/tenancy/page.tsx`).
//
// ⚠️ A LEITURA QUE FALHOU É SERVIÇO FORA, e não "não existe": o guard já
// provou que o ator É o administrador do sistema, então falhar aqui é a API
// fora do ar — e a tela com retry é a honesta.

import type * as React from 'react';
import { notFound } from 'next/navigation';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { CabecalhoSecao } from '@/components/ui/cabecalho-secao';
import { Botao } from '@/components/ui/botao';
import { Container } from '@/components/ui/container';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { LinkTexto } from '@/components/ui/link-texto';
import { CabecalhoTabela, CelulaTabela, Tabela } from '@/components/ui/tabela';
import { exigirAdminDoSistema, ServicoIndisponivel } from '../../admin/guard-admin';
import { listarInventario, vinculo } from '../../../lib/tenancy';
import { exigirSessao } from '../../../lib/sessao';
import type { InventarioAdminTenancyDto } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DetalheEmpresaPage({
  params,
}: PageProps): Promise<React.JSX.Element> {
  const accessToken = await exigirSessao();

  const guarda = await exigirAdminDoSistema(accessToken);
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return, e é ele que impede os membros de vazar para quem não
  // é administrador do sistema.
  if (guarda.bloqueio) return guarda.tela;

  const { id } = await params;

  let inventario: InventarioAdminTenancyDto;
  try {
    // shortcut: a tela baixa o INVENTÁRIO INTEIRO (toda pessoa e toda empresa
    // com os seus membros) para desenhar UMA empresa — o endpoint que existe
    // é o inventário, e a leitura por id não existe. Quando a API ganhar
    // `GET /admin/tenancy/empresas/:id`, esta é a linha que muda.
    inventario = await listarInventario(accessToken);
  } catch {
    return <ServicoIndisponivel />;
  }

  // pt-BR: id desconhecido é `notFound()` — a empresa não existe, e a tela de
  // "serviço fora" mentiria sobre a causa.
  const empresa = inventario.empresas.find((e) => e.id === id);
  if (empresa === undefined) notFound();

  return (
    <Container>
      <CabecalhoPagina titulo={empresa.nome} descricao={<code>{empresa.slug}</code>} />

      <section className="mt-8">
        <CabecalhoSecao>Membros</CabecalhoSecao>
        {empresa.membros.length === 0 ? (
          // pt-BR: lista vazia é RESPOSTA, não erro — a empresa recém-aberta
          // não tem ninguém dentro. E o estado vazio diz o que a pessoa pode
          // FAZER: o inventário é onde as empresas estão.
          //
          // ⚠️ `mt-6` e não `mt-3`: a `Tabela` traz o próprio vão (`mt-6`), e
          // um vão diferente entre os dois ramos fazia o bloco saltar 12px
          // quando o dado chegava.
          <div className="mt-6">
            <EstadoVazio
              titulo="Nenhum membro"
              descricao="Esta empresa ainda não tem ninguém dentro dela."
              acao={
                <Botao href="/admin/tenancy" variante="secundario">
                  Ver o inventário
                </Botao>
              }
            />
          </div>
        ) : (
          // ⚠️ A legenda NOMEIA a empresa: duas empresas abertas na mesma
          // tela davam a mesma legenda ao leitor de tela, e a legenda é o
          // nome acessível da tabela.
          <Tabela legenda={`Membros de ${empresa.nome}`}>
            <thead>
              <tr>
                <CabecalhoTabela>Nome</CabecalhoTabela>
                <CabecalhoTabela>E-mail</CabecalhoTabela>
                <CabecalhoTabela>Vínculo</CabecalhoTabela>
              </tr>
            </thead>
            <tbody>
              {empresa.membros.map((membro) => (
                <tr key={membro.id}>
                  <CelulaTabela>{membro.nome}</CelulaTabela>
                  <CelulaTabela>{membro.email}</CelulaTabela>
                  <CelulaTabela>{vinculo(membro.role, membro.perfil)}</CelulaTabela>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>

      <div className="mt-8">
        <LinkTexto href="/users">Voltar para usuários</LinkTexto>
      </div>
    </Container>
  );
}
