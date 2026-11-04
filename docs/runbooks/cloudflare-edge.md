# Runbook: a borda Cloudflare do projeto

> **Escopo:** o que o operador precisa **verificar e corrigir** na conta e na
> zona da Cloudflare onde este projeto é publicado.
>
> **Este repo não tem pegada na Cloudflare** — nenhum `wrangler.toml`, nenhum
> domínio versionado, nenhum DNS, nenhuma configuração de edge. A borda é
> **configuração de conta**, não de código: o que se audita e o que se corrige
> está no dashboard (e na API) da Cloudflare, não neste repositório.

## §1. O que este runbook é — e o que não é

**Não** é um relatório de auditoria da conta. O estado real da conta **não é
legível** a partir deste repositório: o conector `cloudflare_mcp` desta
instalação expõe **duas** ferramentas — busca na documentação e busca na spec
OpenAPI — e **nenhuma** que execute a API da conta. Não há token de API no
ambiente. Logo: **quem roda a verificação é uma pessoa**, no dashboard.

O que este runbook entrega é o **contrato de verificação**: a lista de itens,
onde cada um se confere (dashboard ou endpoint) e o que a Cloudflare exige
como mínimo — cada afirmação com a fonte oficial.

## §2. A baseline do próprio Cloudflare

A Cloudflare roda um scan periódico da conta e publica a lista de insights.
Essa lista **é** a baseline — é a mesma que o Security Center usa para
arquivar insight resolvido.

| Insight | O que detecta |
|---|---|
| **Users without MFA** | usuário administrativo sem autenticação multifator |
| **Zones without WAF Managed Rules** | zona sem as regras gerenciadas do WAF (exposição a zero-day) |
| **Domains without HSTS** | sem o header que força HTTPS |
| **Domains without 'Always Use HTTPS'** | requisição HTTP pode não ser redirecionada para HTTPS |
| **Domains missing TLS Encryption** | domínio sem TLS |
| **Domains supporting older TLS version** | aceita versão antiga do TLS |
| **DMARC Record Errors** | registro DMARC ausente ou incorreto |
| **No Turnstile enabled** | nenhum widget Turnstile na conta |

Fonte: <https://developers.cloudflare.com/security/security-insights/> —
consultado em 2026-11-03.

**Duas limitações da própria Cloudflare** (leia antes de agir sobre um insight):

- **Managed Rules not deployed** em zonas com regras gerenciadas **no nível da
  conta**: o Security Center pode reportar que não há regra onde há. Arquive o
  insight.
- **Vulnerability insights for rules in log mode**: uma regra em modo *Log*
  não bloqueia, e o insight aparece mesmo assim. É o comportamento esperado —
  arquive o insight.

## §3. O checklist, item a item

### 3.1 TLS e HTTPS

| Item | Mínimo | Onde |
|---|---|---|
| Modo de criptografia | **Full (strict)** — "para a melhor segurança, escolha Full (strict) sempre que possível" | Dashboard → SSL/TLS → Overview |
| Certificado da origem | válido, emitido por CA confiável ou Cloudflare Origin CA, com CN/SAN do host | Dashboard → SSL/TLS → Origin Server |
| Always Use HTTPS | ligado (redireciona todo HTTP de visitante) | Dashboard → SSL/TLS → Edge Certificates |
| HSTS | ligado — **só depois** de HTTPS funcionar e testado | Dashboard → SSL/TLS → Edge Certificates |
| Versão mínima de TLS | 1.2 | Dashboard → SSL/TLS → Edge Certificates → Cipher suites |

Três advertências da doc oficial que valem como regra:

- **Nunca redirecione HTTP→HTTPS na origem** quando o modo é Flexible — a
  Cloudflare conecta na origem por HTTP e isso vira loop de redirecionamento.
  Use Full ou Full (strict).
- **HSTS só depois** de HTTPS testado: remover o HTTPS antes de desligar o
  HSTS deixa o site inacessível pelo `max-age`.
- **Origin CA** vale 15 anos e é confiável **pela Cloudflare** — se a origem
  não tem certificado de CA pública, instale um Origin CA antes de subir para
  Full (strict), ou os visitantes veem **526**.

Fontes: [Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/),
[Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/),
[Encrypt all keep site secure](https://developers.cloudflare.com/use-cases/solutions/encrypt-all-keep-site-secure/).

### 3.2 WAF e rate limiting

| Item | Mínimo | Onde |
|---|---|---|
| Regras gerenciadas do WAF | ligadas na zona (as do item *Zones without WAF Managed Rules*) | Dashboard → WAF → Managed rulesets |
| Regras de rate limiting | por zona, no phase `http_ratelimit` | Dashboard → Security rules → Rate limiting rules |

A ordem de phases que a doc oficial lista: `http_request_firewall_custom` →
`http_request_firewall_managed` → `http_ratelimit`. A regra de rate limiting
é a última a ser executada, e é onde a proteção contra abuso (login, signup)
costuma morar.

Fonte: [WAF phases](https://developers.cloudflare.com/waf/reference/phases/).

### 3.3 Identidade: MFA, tokens, membros, auditoria

| Item | Mínimo | Onde |
|---|---|---|
| MFA dos administradores | ligado em **todos** os membros com acesso | Dashboard → Members |
| API tokens | menor privilégio possível, nome descritivo, rotação periódica, revogação documentada | Dashboard → API Tokens |
| Audit log | habilitado e retido | Dashboard → Audit Log |

As práticas que a doc oficial nomeia para tokens, verbatim em espírito:
princípio do **menor privilégio** (só as permissões necessárias), **nome
descritivo** que diz para que o token serve, **documentar o uso** (inclusive
como revogar), **rotação regular** com revisão de permissões.

**Por que isso importa para este projeto:** o repo expõe uma API com login,
convite e perfis (multi-tenant). Um token de API com `Zone WAF Write` +
`Account WAF Write` em produção é um caminho de alteração de borda sem
auditoria.

Endpoints para a verificação automatizada (quando houver token):

```bash
# o estado de segurança da conta (Security Center)
GET /accounts/{account_id}/security-center/state

# os insights e o contexto de cada um
GET /accounts/{account_id}/security-center/insights/{issue_id}/context

# os membros e a autenticação de cada um
GET /accounts/{account_id}/members
GET /memberships

# o audit log (v2; a v1 é /accounts/{account_id}/audit_logs)
GET /accounts/{account_id}/logs/audit
GET /accounts/{account_id}/logs/audit/{id}/history
```

### 3.4 DNS: DNSSEC e DMARC

- **DNSSEC** ligado na zona, com as chaves corretamente publicadas no registrador
  (o registro DS). Sem isso, a resposta DNS pode ser forjada.
- **DMARC** com registro válido — o item *DMARC Record Errors* da baseline.

## §4. O que este repo já faz — e o que a Cloudflare não faz por você

O que o repo controla (e já foi auditado no PR #143):

| Camada | O que o repo faz |
|---|---|
| Transporte | `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` no middleware do web |
| CSP | nonce por requisição, `strict-dynamic`, sem `unsafe-inline`; `unsafe-eval` só em desenvolvimento |
| Dependências | `check-dependency-audit` reprova advisory crítica/alta fora da lista de exceções versionadas |
| Supply chain | `check-ci-action-pinning` — toda action do CI pinada por SHA |
| Frontend | `X-Powered-By` removido |

O que a borda faz — e o repo **não**:

- **TLS entre a Cloudflare e a origem**: modo Full/Full (strict) e o
  certificado da origem. O repo fala HTTP no compose de produção; quem decide
  o modo é a conta.
- **Rate limiting na borda**: o repo tem throttling na aplicação, mas o
  limite que aguenta abuso **antes** de chegar na aplicação é da borda.
- **WAF na borda**: regras gerenciadas protegem contra zero-day **antes** do
  código da aplicação.
- **DNSSEC e DMARC**: nada no repo os controla.

## §5. Como rodar a verificação

### No dashboard

1. Dashboard → **Security** → **Security Insights**: a lista de insights da
   conta. Cada item da §2 que aparecer aqui é um item a corrigir.
2. Dashboard → **SSL/TLS** → Overview e Edge Certificates: §3.1.
3. Dashboard → **Security rules**: §3.2.
4. Dashboard → **Members** e **API Tokens**: §3.3.
5. Dashboard → **DNS**: §3.4.

### Pela API (quando houver token)

O token vive **no ambiente de quem roda**, nunca no repositório nem no chat:

```bash
export CLOUDFLARE_API_TOKEN=...   # nunca commitar, nunca colar em conversa
export CF_ACCOUNT_ID=...           # o id da conta
export CF_ZONE_ID=...              # o id da zona

# o estado de segurança da conta
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/security-center/state"

# o modo de criptografia e o always_use_https da zona
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings/ssl"
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings/always_use_https"

# os membros e o audit log
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/members"
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/logs/audit"
```

O token que faz essa leitura precisa de **somente leitura** (`Zone Settings
Read`, `Account Settings Read`, `Account Audit Logs Read`) — e é exatamente
esse o token que a §3.3 exige que seja de menor privilégio.

## §6. O que fazer quando um item falha

1. **Não desligue HSTS para "resolver" o aviso.** O item que falhou quase
   sempre é HTTPS na origem — corrija o certificado e o modo primeiro.
2. **Managed Rules em log mode**: o insight aparece mesmo com a regra
   correta. É o comportamento esperado — arquive o insight, não a regra.
3. **Modo Flexible**: nunca corrija um 525/526 trocando para Flexible. O
   problema é o certificado da origem.
4. **Audit log vazio**: verifique se o log está habilitado na conta, não
   apenas se o token tem permissão de leitura.
5. **MFA de um membro**: a Cloudflare exige que o membro **ative** o MFA — não
   há toggle de administrador que o dispense por ele ✗.

## §7. Por que este runbook existe

A auditoria de segurança do projeto (`.agents/runs/2026-11-03-auditoria-de-seguranca.md`)
deixou a dimensão Cloudflare explicitamente **não medida** — o conector exigia
uma autorização que não existia. A autorização existe hoje; o que **não**
existe é um caminho para **ler** a conta a partir daqui. Este runbook é a
resposta honesta a isso: o **método** fica no repo, a **medição** fica com
quem tem acesso à conta.

---

**Versão do documento:** 1.18.0
