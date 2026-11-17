# INFINITUM / Killa AI — Windows Desktop

## Arquitetura

| Tecnologia | Uso |
| --- | --- |
| JavaScript ESM / CommonJS | Processo principal Electron, políticas e preload |
| HTML / CSS / JavaScript | Launcher Windows local |
| JSX / React | Interface INFINITUM no Next.js standalone |
| SQL / PostgreSQL | Supabase, migrações e políticas de acesso |
| YAML / JSON | GitHub Actions e configuração pública |
| PowerShell | Validação Authenticode |
| Node.js 24 | Build Windows |

Arquivos principais: `main.mjs`, `preload.cjs`, `runtime-policy.mjs`, `public-config.json`, `launcher.html`, `launcher-ui.js`, `free-update-client.mjs` e `release-trust.mjs`.

## O que o instalador faz

- Executa o Next.js standalone localmente em `127.0.0.1`, com porta persistente por perfil Windows. Não abre o site Vercel e não exige Node.js instalado no computador.
- Usa a configuração pública empacotada em `desktop/public-config.json`. Esse arquivo contém somente URL e publishable key do Supabase; nunca service-role, sb_secret, JWT privado ou senha.
- Cada operador autentica sua própria conta Supabase. RLS, MFA e permissões por empresa continuam ativos.
- O Supabase Realtime mantém sincronização por `owner_id`.
- O MCP da loja permanece na Edge Function `https://ulkuhiibeoibbzhqrfya.supabase.co/functions/v1/killa-mcp`.
- O WA.Auto continua no serviço HTTPS configurado. Sem internet/Supabase ou WA.Auto, login, sincronização e QR não funcionam; este é um cliente local, não um WhatsApp offline.

A Vercel pode continuar publicando a versão web e atender integrações remotas opcionais do OpenBot, mas **não fornece a configuração inicial do EXE nem os arquivos de atualização**. O canal de atualização do desktop é o GitHub Releases.

## Build local Windows

Com Node.js 24:

```powershell
npm install
$env:KILLA_DESKTOP_STANDALONE="1"
$env:NEXT_PUBLIC_LEXIS_SHARED_DB="1"
$env:NEXT_PUBLIC_SUPABASE_URL="https://segjskjlbeydlljnefai.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_yEX6mVid3dpC7o7eOzuB1g_Vh"
npm run build
node desktop/stage-standalone.mjs
npm install --prefix desktop
npm --prefix desktop run pack:win
node desktop/verify-packaged-server.mjs
npm --prefix desktop run dist:win
```

O artefato `infinitum-killa-windows-test-UNSIGNED` é somente de teste. Releases públicas exigem Authenticode válido, assinatura Ed25519 da W1 e verificação SHA-512 antes da publicação. Não desative o Microsoft Defender.

## Atualizações automáticas pelo GitHub — sem Vercel

O workflow `.github/workflows/killa-desktop-auto-release.yml` é acionado em **todo push na branch main**. Ele:

1. Gera uma versão monotônica `0.2.<run_number>`.
2. Executa testes, typecheck, DOM e build standalone.
3. Compila o EXE e o instalador Windows x64.
4. Exige assinatura Authenticode do Windows e assina o manifesto com Ed25519.
5. Resume os commits desde a release anterior em `release-notes.md`.
6. Publica o EXE e `killa-update.json` em uma GitHub Release oficial.

O launcher consulta `https://github.com/ProjectW1SC/INFINITUM/releases/latest/download/killa-update.json` ao iniciar e a cada 30 minutos. Não baixa ZIP da branch main, não executa scripts remotos e não usa Vercel para encontrar ou instalar versões.

O manifesto Ed25519 contém a versão, o resumo das mudanças, a URL permitida, o tamanho e o SHA-512 do instalador. O aplicativo verifica a chave pública fixada no EXE, a assinatura, a versão superior, a origem HTTPS, o tamanho e o hash antes de aceitar o pacote.

### Experiência do operador

Quando uma versão nova é encontrada, o launcher e o CRM mostram um aviso discreto com a versão e o resumo das alterações. O operador escolhe:

- **Atualizar agora:** baixa a versão e, ao terminar, pede confirmação para fechar e reiniciar o INFINITUM.
- **Baixar em segundo plano:** baixa enquanto o operador continua trabalhando; não fecha nem reinicia o CRM.
- **Depois:** mantém a versão atual. A instalação só ocorre após confirmação explícita.

O download não interrompe o atendimento. Fechar o CRM não instala automaticamente uma versão baixada. A assinatura e o hash são conferidos novamente antes de executar o instalador.

### Primeira instalação do atualizador

O instalador piloto **0.1.2** foi gerado antes da ativação deste fluxo e não contém a nova interface de atualização. Ele precisa ser substituído uma vez pelo primeiro instalador oficial **0.2.x**. Depois dessa instalação inicial, as versões seguintes serão detectadas pelo GitHub e poderão ser baixadas sem reinstalar manualmente.

O ambiente GitHub `desktop-production` fornece os segredos `KILLA_ED25519_PRIVATE_KEY_B64`, `KILLA_WINDOWS_CERT_P12` e `KILLA_WINDOWS_CERT_PASSWORD`. Se esse ambiente estiver configurado para exigir revisores, a publicação automática aguardará essa aprovação no GitHub Actions; a instalação no computador sempre continua sob escolha do operador.

## Acesso da administração da loja

A autenticação do CRM e a Edge Function da loja pertencem a projetos Supabase diferentes. A função valida o token no projeto que o emitiu, consulta o perfil próprio em `usuarios`, verifica empresa e sessão ativa, e exige uma identidade externa explicitamente mapeada para o superadmin canônico da loja. Não transforma todos os administradores do CRM em superadmins. Operações sensíveis continuam exigindo AAL2/TOTP e auditoria.

## Segurança e limites

- O renderer não tem Node.js, shell ou acesso arbitrário ao sistema de arquivos. Electron usa sandbox, context isolation e preload restrito.
- A publishable key Supabase é pública por definição. A proteção real está na autenticação individual, RLS, MFA e backend privado.
- A chave privada Ed25519 e o certificado Authenticode existem somente nos segredos do GitHub Actions; nunca entram no EXE.
- Atualizações com assinatura inválida, hash alterado, URL fora do GitHub Releases ou versão inferior são recusadas.
- Não são executados ZIPs da main, scripts enviados por clientes/LLMs ou JavaScript remoto para substituir o aplicativo.
- A assinatura Ed25519 autentica a atualização para o launcher; Authenticode identifica o editor para o Windows. O SmartScreen ainda pode exibir avisos até o editor/hash ganhar reputação.

**Licença:** consulte [LICENSE](../LICENSE) e [NOTICE](../NOTICE.md).

## Operação

O QR do WhatsApp só aparece após login do usuário e resposta válida da sessão WA.Auto. Nenhum QR, token ou código de pareamento deve ser armazenado neste manual. Dados de clientes e mensagens permanecem no Supabase sob RLS; o GitHub Releases distribui somente os binários e os metadados públicos de atualização.
