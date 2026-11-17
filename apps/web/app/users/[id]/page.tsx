// apps/web/app/users/[id]/page.tsx
//
// pt-BR: o detalhe de UMA pessoa — quem ela é e as empresas em que ela está
// inserida. Tela do ADMINISTRADOR DO SISTEMA.
//
// ⚠️ O GUARD é `exigirAdminDoSistema()`, o do bucket GLOBAL: o inventário da
// tenancy é do administrador do sistema (D8). O `isAdmin` da empresa é o do
// DONO, e autorizar por ele mostraria as empresas de uma pessoa para um
// gerente que a API recusa com 403.
//
// ⚠️ A LEITURA QUE FALHOU É SERVIÇO FORA, e não "não existe": o guard já
// provou que o ator É o administrador do sistema, então falhar aqui é a API
// fora do ar — e a tela com retry é a honesta (o mesmo caminho de
// `app/admin/tenancy/page.tsx`).

import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { CabecalhoSecao } from '@/components/ui/cabecalho-secao';
import { Botao } from '@/components/ui/botao';
import { Container } from '@/components/ui/container';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { LinkTexto } from '@/components/ui/link-texto';
import { exigirAdminDoSistema, ServicoIndisponivel } from '../../admin/guard-admin';
import { listarInventario, vinculo } from '../../../lib/tenancy';
import { exigirSessao } from '../../../lib/sessao';
import type { InventarioAdminTenancyDto } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
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

  let inventario: InventarioAdminTenancyDto;
  try {
    // shortcut: a tela baixa o INVENTÁRIO INTEIRO (toda pessoa e toda empresa
    // com os seus membros) para desenhar UMA pessoa — o endpoint que existe
    // é o inventário, e a leitura por id não existe. Quando a API ganhar
    // `GET /admin/tenancy/usuarios/:id`, esta é a linha que muda.
    inventario = await listarInventario(accessToken);
  } catch {
    return <ServicoIndisponivel />;
  }

  // pt-BR: id desconhecido é `notFound()` — a pessoa não existe, e a tela de
  // "serviço fora" mentiria sobre a causa.
  const usuario = inventario.usuarios.find((u) => u.id === id);
  if (usuario === undefined) notFound();

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
                  Ver o inventário
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
                      a tinta secundária nos DOIS lugares onde ele aparece. */}
                  <div className="break-words text-xs text-muted-foreground">
                    <code>{empresa.slug}</code>
                  </div>
                  {/* pt-BR: o VÍNCULO é o dado que dá sentido ao card (o que
                      a pessoa é NAQUELA empresa), então ele é tinta primária —
                      e o rótulo "Vínculo" diz o que o par é, como a coluna
                      do inventário diz. */}
                  <div className="mt-1 text-sm text-foreground">
                    <span className="text-muted-foreground">Vínculo:</span>{' '}
                    {vinculo(empresa.role, empresa.perfil)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <LinkTexto href="/users">Voltar para usuários</LinkTexto>
      </div>
    </Container>
  );
}
