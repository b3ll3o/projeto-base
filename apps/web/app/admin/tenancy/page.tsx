// apps/web/app/admin/tenancy/page.tsx
//
// pt-BR (visão de admin, 2026-10-22): o INVENTÁRIO da tenancy, visto pelo
// ADMINISTRADOR DO SISTEMA. Server Component — e de LEITURA: nenhuma escrita,
// nenhum botão, nenhuma Server Action.
//
// São DUAS tabelas porque são DUAS perguntas: "quem está na ACME" e "de quais
// empresas o Bruno é". A API as entrega JUNTAS (`GET /admin/tenancy`), e é por
// isso que elas são as duas tabelas de UM render.
//
// ⚠️ O GUARD é `exigirAdminDoSistema()`, e NÃO `exigirAdmin()`: D8 — a API
// exige o `isAdmin` do bucket GLOBAL (`tenantId === null && isAdmin`), e o
// `isAdmin` da empresa é o do DONO (`true` em toda empresa nova). Autorizar
// pelo sinal errado mostraria a base inteira para um gerente que a API recusa.
//
// ⚠️ A SESSÃO É LIDA UMA VEZ. O token vem do cookie para o guard E para a
// leitura do inventário — duas leituras do cookie store por navegação numa
// página `force-dynamic` era desperdício que ninguém via.
//
// ⚠️ A FALHA DA LEITURA VAI PARA A TELA CERTA. O `guard-admin.tsx` existe
// para distinguir "a API está fora" de "você não tem perfil": 5xx, timeout e
// rede caída têm a tela de "Serviço indisponível", com o botão de recarregar.
// Uma leitura do inventário que falha é o MESMO caso — e antes ela subia como
// erro genérico do `app/error.tsx`, que não oferece retry.
//
// ⚠️ LISTAS VAZIAS SÃO RESPOSTAS, e a tela as mostra. A empresa recém-aberta
// não tem ninguém dentro (`membros: []`) e a conta do administrador do sistema
// não pertence a empresa nenhuma (`empresas: []`): esconder essas linhas
// diria que elas não existem — e a empresa recém-aberta existe.
//
// `<caption>` e `scope="col"` não são enfeite: sem eles a tabela só é legível
// por quem enxerga. Em modo de navegação por tabela, o leitor de tela associa
// célula a coluna pelo `scope`, e sem `caption` não há título que diga o que a
// tabela é. WCAG 1.3.1 — o mesmo padrão de `app/admin/flags/page.tsx`.

import type * as React from 'react';
import { CabecalhoSecao } from '@/components/ui/cabecalho-secao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';
import { CabecalhoTabela, CelulaTabela, Tabela } from '@/components/ui/tabela';
import { exigirAdminDoSistema, telaDaFalhaDeLeitura } from '../guard-admin';
import { listarInventario, vinculo } from '../../../lib/tenancy';
import { exigirSessao } from '../../../lib/sessao';
import type { InventarioAdminTenancyDto } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

export default async function AdminTenancyPage(): Promise<React.JSX.Element> {
  // ⚠️ A SESSÃO PRIMEIRO, e o token segue para o guard: uma leitura do
  // cookie store, e o mesmo token na checagem de perfil e na leitura do
  // inventário. `exigirSessao()` manda para o login quem não tem sessão — e
  // é o mesmo destino do 401 do guard.
  const accessToken = await exigirSessao();

  const guarda = await exigirAdminDoSistema(accessToken);
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return. A tela devolvida é a DO GUARD — "Acesso restrito" e
  // "Serviço indisponível" são dele, e reescrever aqui viraria uma terceira
  // cópia do mesmo texto.
  if (guarda.bloqueio) return guarda.tela;

  let inventario: InventarioAdminTenancyDto;
  try {
    inventario = await listarInventario(accessToken);
  } catch (erro) {
    // ⚠️ A LEITURA FALHOU — e a tela honesta depende da CAUSA: 401 é sessão
    // expirada (login), 403 é a API recusando o ator (acesso restrito), e o
    // resto é serviço fora (retry). O `catch` nu tratava as três como
    // "serviço indisponível" — a mesma mentira que o `guard-admin.tsx` existe
    // para matar, e `telaDaFalhaDeLeitura` é o DONO da tabela.
    return telaDaFalhaDeLeitura(erro);
  }

  const { empresas, usuarios } = inventario;

  return (
    <Container>
      <CabecalhoPagina titulo="Empresas e usuários" />

      <CabecalhoSecao className="mt-8">Empresas e seus membros</CabecalhoSecao>
      <Tabela legenda="Empresas do sistema e os membros de cada uma">
        <thead>
          <tr>
            <CabecalhoTabela>Empresa</CabecalhoTabela>
            <CabecalhoTabela>Slug</CabecalhoTabela>
            <CabecalhoTabela>Membros</CabecalhoTabela>
          </tr>
        </thead>
        <tbody>
          {empresas.map((empresa) => (
            <tr key={empresa.id}>
              <CelulaTabela>{empresa.nome}</CelulaTabela>
              <CelulaTabela>
                {/* pt-BR: o slug é METADADO (o identificador legível), e é a
                    tinta secundária nos DOIS lugares onde ele aparece — aqui
                    e no card de `/users/[id]`. Mesmo dado, mesma tinta. */}
                <code className="text-muted-foreground">{empresa.slug}</code>
              </CelulaTabela>
              <CelulaTabela>
                {empresa.membros.length === 0 ? (
                  <em>sem membros</em>
                ) : (
                  <ul className="list-inside list-disc">
                    {empresa.membros.map((membro) => (
                      <li key={membro.id}>
                        {membro.nome} — {membro.email} ({vinculo(membro.role, membro.perfil)})
                      </li>
                    ))}
                  </ul>
                )}
              </CelulaTabela>
            </tr>
          ))}
        </tbody>
      </Tabela>

      <CabecalhoSecao className="mt-8">Usuários e suas empresas</CabecalhoSecao>
      <Tabela legenda="Usuários do sistema e as empresas de cada um">
        <thead>
          <tr>
            <CabecalhoTabela>Usuário</CabecalhoTabela>
            <CabecalhoTabela>E-mail</CabecalhoTabela>
            <CabecalhoTabela>Empresas</CabecalhoTabela>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((usuario) => (
            <tr key={usuario.id}>
              <CelulaTabela>{usuario.nome}</CelulaTabela>
              <CelulaTabela>{usuario.email}</CelulaTabela>
              <CelulaTabela>
                {usuario.empresas.length === 0 ? (
                  <em>sem empresa</em>
                ) : (
                  <ul className="list-inside list-disc">
                    {usuario.empresas.map((empresa) => (
                      <li key={empresa.id}>
                        {empresa.nome} ({vinculo(empresa.role, empresa.perfil)})
                      </li>
                    ))}
                  </ul>
                )}
              </CelulaTabela>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </Container>
  );
}
