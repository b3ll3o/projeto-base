# As migrations que deram dono às regras de `users`

> Documento IRMÃO de [`users.md`](./users.md) — ele foi dividido porque o
> arquivo principal passou do teto de 300 linhas (convenção
> [`tamanho-e-revisao.md`](../../.agents/specs/conventions/tamanho-e-revisao.md)).
> O índice do BC, os endpoints e as invariantes continuam em
> [`users.md`](./users.md).

| Migration | O que faz |
|---|---|
| `20261116000000_password_hash_funcao` | cria `password_hash_is_valid_argon2id(text)` — o dono da regra do hash no banco |
| `20261116000001_password_hash_reparo` | **neutraliza** as linhas cujo hash não é argon2id: grava um envelope argon2id com digest aleatório (a conta sobrevive e continua incapaz de autenticar) |
| `20261116000002_password_hash_constraint` | a CHECK constraint `users_password_hash_argon2id` |
| `20261116000003_user_id_funcao` | cria `user_id_is_uuid_v7(text)` — o dono da regra do id no banco |
| `20261116000004_user_id_reparo` | **troca o id** das contas cujo id não é v7 (o id é a identidade: as memberships e os refresh tokens o referenciam por FK com `ON UPDATE CASCADE`, e as referências soltas — histórico, arquivo, colunas de auditoria e a chave de idempotência — viajam com o rekey) |
| `20261116000005_user_id_constraint` | a CHECK constraint `users_id_uuid_v7` |

A **ordem** é a que a convenção dos 3 passos exige: o reparo antes da
restrição. O `ADD CONSTRAINT` valida as linhas existentes, e uma linha que
violasse a regra faria o `migrate deploy` falhar — barulhento e nomeando a
linha, que é o que se quer de uma falha de migração.

**O reparo não deixa rastro em `users_history`.** Ele é um `UPDATE` cru, e a
trilha de auditoria é da aplicação. O registro do que aconteceu é o `NOTICE`
da migration (quantas linhas foram reparadas) e a conta continua existindo —
com a credencial neutralizada, e portanto inapto a entrar. Encher a trilha
ajustando a sequência de `version` deixaria um **buraco** nela (a entrada
`N+1` nunca existiu), que é pior que a ausência.

**O reparo do id invalida a sessão em voo.** O `sub` do JWT emitido antes do
rekey é o id VELHO, e ele não acha mais ninguém: o cliente precisa
reautenticar. As memberships e os refresh tokens viajam por
`ON UPDATE CASCADE` (o `refresh token` continua válido — o que não basta, sem
o access token novo).

**Restaurar um dump anterior às duas constraints**: o `INSERT` é recusado
(`violates check constraint`). O caminho é restaurar **sem** as duas
constraints (o SQL delas está nas migrations `20261116000002` e
`20261116000005`), rodar o **reparo** — o SQL das migrations
`20261116000001` e `20261116000004`, que é idempotente — e só então
reaplicar as constraints. Nenhuma das duas etapas é opcional: o reparo sem a
constraint deixa a linha ilegível (a listagem volta a cair), e a constraint
sem o reparo falha no `ADD CONSTRAINT`, com um "violated by some row" que não
aponta para a causa.

**Desbloquear uma conta neutralizada**: o reparo do hash deixa a conta
incapaz de autenticar — ela continua existindo, mas a credencial dela não
existe mais (o login responde 401). Para devolver o acesso, grave um hash
argon2id **real**, o que o `Argon2PasswordHasher` emite: a constraint recusa
qualquer outro valor, e um `'x'` seria recusado com `violates check
constraint "users_password_hash_argon2id"`.

```sql
UPDATE users
   SET password_hash = '<hash argon2id gerado pela lib>', updated_at = now()
 WHERE email = 'conta@exemplo';
```

> ⚠️ **Exceção declarada** à regra "migration de modelo e migration de dados no
> mesmo PR" (convenção [`migracao-de-dados.md`](../../.agents/specs/conventions/migracao-de-dados.md)
> §4): a restrição **depende** do reparo, e um PR só com a restrição falharia
> ao subir em qualquer banco que ainda tivesse a linha quebrada — que é
> exatamente o banco que o reparo existe para consertar. As migrations ficam
> separadas por arquivo, e a ordem entre elas é o que segura o contrato.
