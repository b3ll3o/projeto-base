// apps/web/app/empresa/nova/page.tsx
//
// Tela de criação de empresa.
//
// pt-BR: Server Component deliberado — a página não busca nada, ela só
// entrega o formulário. A Action entra por prop (é o que o Next suporta em
// Client Component) em vez de o componente importar a própria Action, o que
// mantém a árvore de dependências explícita: a página é a dona do fluxo.
//
// Um único `h1` por tela, como no resto do app.
//
// ⚠️ Esta tela EXIGE SESSÃO, ao contrário de `/users/novo` (o cadastro de
// usuário, que é `@Public()` na API e por isso não exige nada). A diferença
// é o objeto: cadastro cria uma CONTA, e a conta existe para que a pessoa
// chegue a algum lugar; esta tela cria a EMPRESA, e a empresa só existe
// para quem já tem conta. Sem sessão, `POST /tenants` responderia 401 — e a
// pessoa veria um formulário que aceita, valida e recusa no fim, sem dizer
// por quê.
//
// ⚠️ `force-dynamic` não é preciso aqui: a página lê cookies (`exigirSessao`
// → `cookies()`), e um cookie já marca a rota como dinâmica no Next 15.

import { EmpresaForm } from '@/components/empresa-form';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';
import { exigirSessao } from '@/lib/sessao';
import { criarEmpresaDoAtor } from './actions';

export default async function NovaEmpresaPage() {
  await exigirSessao();

  return (
    <Container>
      <CabecalhoPagina
        titulo="Criar empresa"
        descricao="A empresa é o espaço onde ficam as pessoas e os perfis. Quem cria a empresa entra como gerente."
      />
      <div className="mt-8">
        <EmpresaForm action={criarEmpresaDoAtor} />
      </div>
    </Container>
  );
}
