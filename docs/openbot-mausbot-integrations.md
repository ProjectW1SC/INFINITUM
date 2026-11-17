# OpenBot · Conexões do INFINITUM (web, EXE e MausBot)

## O que funciona sem chaves privadas
- OpenBot abre a central de conexões em **Aplicativos conectados**.
- Pesquisa direta do INFINITUM CRM usa a sessão Supabase do usuário, políticas RLS e somente leitura.
- ZapFast abre em uma sessão separada, inclusive no EXE, com troca de número controlada no próprio ZapFast.
- O endpoint **https://agentinfinitum.vercel.app/api/openbot/mcp** anuncia OAuth e oferece ferramentas MCP de pesquisa no CRM e status de conexões. O cliente precisa receber token OAuth e uma autorização MCP temporária.
- O EXE usa **https://agentinfinitum.vercel.app/api/openbot/desktop-config** para obter somente URL e chave pública do mesmo Supabase do CRM. As consultas que precisam das credenciais online da Vercel passam pelo relay local com allowlist e sessão verificada.

## Ativação única de OAuth Google no servidor
Um administrador do aplicativo (Google Cloud) deve criar um cliente OAuth de aplicação web com redirect exato:
\`https://agentinfinitum.vercel.app/api/openbot/integrations/oauth/callback\`
Habilitar as APIs Google Drive, Sheets e Gmail e configurar no Vercel:
- \`OPENBOT_GOOGLE_CLIENT_ID\`
- \`OPENBOT_GOOGLE_CLIENT_SECRET\`
- \`OPENBOT_TOKEN_CIPHER_KEY\`: 32 bytes de chave aleatória em base64url para AES-GCM
- \`SUPABASE_SERVICE_ROLE_KEY\` **somente no ambiente de servidor da Vercel**.

Não expor essas variáveis como \`NEXT_PUBLIC_*\`, não colocá-las no EXE e não publicá-las no GitHub. O mesmo registro OAuth Google dá suporte às múltiplas contas e exige autorização individual. Escopos: \`drive.metadata.readonly\`, \`spreadsheets.readonly\`, \`gmail.readonly\`, \`openid\`, \`email\`, \`profile\`. O Google poderá exigir verificação do aplicativo para escopos restritos.

## Ativação única de Instagram/Meta
Crie e aprove um aplicativo no **Meta for Developers**, configure o mesmo redirect e ative os produtos/permissões de contas profissionais. Configure no servidor:
- \`OPENBOT_META_APP_ID\`
- \`OPENBOT_META_APP_SECRET\`
- Chave AES e Supabase Admin (acima).
O teste de acesso lê páginas e contas Instagram profissionais vinculadas; não posta nem lê mensagens privadas sem escopos e implementação específicos.

## Conectar pelo OpenBot (mesmo fluxo em navegador e Windows)
1. Abra **OpenBot → Aplicativos conectados**.
2. Selecione Drive, Sheets, Gmail ou Instagram.
3. Se o serviço estiver **Pronto para autorizar**, clique em **Conectar conta**.
4. Autorize a conta na página do provedor, depois retorne ao OpenBot e clique em **Atualizar**.
5. Use **Testar acesso**. A interface mostra o resultado real da API e permite desconexão por conta.
6. Se o serviço estiver **Configuração necessária**, o OAuth do aplicativo ainda não foi configurado no servidor; não existe conexão ativa.

## Conectar um OpenMausBot externo por MCP HTTP
1. No Supabase do CRM (\`segjskjlbeydlljnefai\`), habilite **Authentication → OAuth Server → OAuth 2.1**, consentimento em \`/oauth/consent\` e registro de clientes compatível com seu ambiente.
2. No OpenMausBot, adicione um servidor MCP remoto HTTP:
   \`https://agentinfinitum.vercel.app/api/openbot/mcp\`
3. No fluxo OAuth, faça login com a mesma conta do INFINITUM, confirme MFA e aprove explicitamente o cliente na tela de consentimento. Isso cria uma autorização de leitura por até 30 dias.
4. O OpenMausBot poderá chamar \`crm_search_clients\`, \`crm_search_processes\` e \`openbot_connections_status\` após receber token OAuth válido. Não há ferramentas de envio de WhatsApp, Gmail ou Instagram.
5. Acesse **Aplicativos conectados → MCP** para conferir clientes e revogar acessos.
6. Se o Supabase OAuth Server não estiver habilitado, a descoberta/pareamento MCP não será concluída; não apresentar esta etapa como conexão pronta.

## Segurança e limites
- As tabelas \`openbot_connections\`, \`openbot_oauth_states\` e \`openbot_mcp_grants\` têm RLS e nenhuma leitura anônima; as credenciais dos provedores ficam criptografadas em repouso com AES-256-GCM.
- Tokens OAuth não são armazenados em navegador nem no executável Windows.
- O Windows usa navegador padrão para consentimento do Google/Meta. O próprio OpenBot pode atualizar o estado ao receber foco.
- Para trocar o WhatsApp, o ZapFast exige confirmação e limpeza da sessão anterior antes de vincular outro número. Não compartilhar uma sessão entre empresas.
- As opções GitHub, Outlook, Slack e Calendar aparecem como **Ainda indisponível** até terem seus próprios conectores oficiais.
- O Exe de CI pode ser não assinado; não contorne o Defender. Para distribuição pública, requer assinatura de código e validação no Windows.
