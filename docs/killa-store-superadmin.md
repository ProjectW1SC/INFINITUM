# W1 Capital App Store — administração superadmin

## Acesso e identidade

Abra Killa Launcher → Administração ou acesse `/app-store/admin` dentro do INFINITUM local.

O login principal do CRM usa o projeto Supabase do LexisPredict; a administração da loja mantém seu próprio banco e suas tabelas privadas. Por isso, a Edge Function valida a sessão no projeto que emitiu o token, lê o perfil próprio em `public.usuarios` sob RLS, confirma o vínculo com a empresa W1 Capital e verifica a sessão ativa. Em seguida consulta uma lista privada de identidades externas explicitamente autorizadas.

A tabela `killa_private.killa_store_external_superadmins` mapeia somente identidades aprovadas para um superadmin canônico já ativo na loja. **Não concede acesso a todos os usuários com cargo de administrador**, não confia em `user_metadata` e não aceita um token de outro projeto sem validação. O vínculo pode ser desativado sem alterar o perfil do CRM.

A tabela local `killa_private.killa_store_superadmins` e a associação `crm_memberships.role='admin'` continuam sendo obrigatórias para o superadmin canônico. O mapeamento externo não contorna esses controles.

## MFA gratuito

Supabase Auth TOTP em AAL2. Compatível com Google Authenticator, Duo Mobile e Oracle Mobile Authenticator configurados para TOTP. A página permite cadastrar um fator e verificar seis dígitos. O QR TOTP é particular e não é o QR do WhatsApp.

A Edge Function valida a sessão ativa no projeto de origem. Operações sensíveis exigem AAL2 e publicação exige TOTP confirmado nos últimos cinco minutos. O acesso de leitura inicial pode identificar que a conta está autorizada e então solicitar o cadastro/validação do MFA, sem o bloqueio circular de esconder a tela de configuração.

## Seções

- **Build Logs:** histórico de execuções, commit, conclusão e link GitHub.
- **Typecheck:** etapas de validação, compilação e testes, inclusive falhas.
- **Logs:** etapas estruturadas sem log bruto; conteúdo integral somente pelo GitHub autenticado.
- **Env:** exclusivamente presença/ausência de configurações. Nenhum valor, senha ou segredo é retornado.
- **Publicações:** solicitar versão, confirmar texto exato e novo TOTP, com GitHub protegido.
- **Auditoria:** decisões e mudanças de permissão gravadas no schema privado.

## MCP (fora do modo Work)

URL: `https://ulkuhiibeoibbzhqrfya.supabase.co/functions/v1/killa-store-admin/mcp`

Ferramentas: `killa_store_status`, `killa_store_build_logs`, `killa_store_request_release`, `killa_store_request_status`. Todas exigem superadmin, AAL2, cliente OAuth identificado, ID explicitamente permitido e ativação individual na aba Env. O MCP **não tem ferramenta de aprovação**.

Para conectar ChatGPT, Grok ou Claude, o cliente precisa aceitar MCP remoto com OAuth e o OAuth Server do projeto Supabase deve estar ativado. O conector GitHub também permite consultar execuções, abrir PRs e revisar erros sem conceder acesso aos valores de Env.

## Publicação de atualizações

O workflow `.github/workflows/killa-desktop-auto-release.yml` é iniciado a cada push em `main`. Executa testes e build standalone, gera uma versão monotônica, exige assinatura Authenticode, assina o manifesto Ed25519, inclui o resumo dos commits e publica o instalador e `killa-update.json` em GitHub Releases.

O EXE consulta apenas GitHub Releases. A configuração pública inicial também está empacotada em `desktop/public-config.json`; não é necessário chamar Vercel para iniciar o aplicativo ou localizar atualizações. A versão web pode continuar sendo publicada na Vercel, mas ela não é a fonte do atualizador desktop.

O launcher e o CRM mostram versão e alterações encontradas. O operador pode atualizar agora ou baixar em segundo plano. A instalação e o reinício exigem confirmação; fechar o CRM não instala automaticamente.

O ambiente GitHub `desktop-production` guarda `KILLA_ED25519_PRIVATE_KEY_B64`, `KILLA_WINDOWS_CERT_P12` e `KILLA_WINDOWS_CERT_PASSWORD`. Se houver revisores obrigatórios nesse ambiente, o workflow automático aguarda a aprovação antes de publicar. O certificado nunca entra nos executáveis nem no repositório.

## Publicação manual via administração

1. IA ou operador solicita uma versão (pedido expira em uma hora). Nada é publicado nessa etapa.
2. Superadmin com login e AAL2 abre a solicitação, digita `PUBLICAR x.y.z` e valida novo TOTP.
3. Se o Supabase Edge tiver `KILLA_GITHUB_DISPATCH_TOKEN` como segredo privado, pode disparar o workflow manual de release na branch `main`. Falha incerta não gera nova tentativa automática.
4. O workflow exige ambiente GitHub `desktop-production`, assinatura Ed25519, certificado Authenticode e conferência final do executável e instalador. Sem isso, não sai release assinada.

Configure o token com a menor permissão possível (Actions: write no repositório exato), proteja main e exija aprovadores no ambiente. Tokens nunca pertencem ao EXE, frontend, banco nem resultados de ferramentas MCP.

## Limites de segurança

Se a chave privada Ed25519 for compartilhada em conversa ou arquivo, trate-a como potencialmente exposta e faça rotação antes da próxima publicação. Não a cole no ChatGPT. Ed25519 autentica o pacote para o launcher; Authenticode identifica o editor para o Windows.

Nenhuma configuração torna um sistema impossível de comprometer: quem controla as credenciais administrativas, a assinatura ou a infraestrutura ainda pode alterar o ambiente. Os controles reduzem risco, restringem a identidade autorizada e registram operações.
