# INFINITUM / Killa AI — Windows Desktop

## O que este instalador faz

- Executa a aplicação INFINITUM **integralmente de um servidor Next.js standalone local** dentro de um processo Node embutido no Electron, em \`127.0.0.1\` com porta temporária. **Não abre o site Vercel** nem exige Node.js instalado no PC.
- Cada funcionário entra na própria conta Supabase, com sessão no perfil do Windows; RLS e permissões da empresa continuam no servidor.
- Supabase Realtime assina mudanças de mensagens e sessões por \`owner_id\`; dados privados nunca são transmitidos em eventos globais.
- OpenBot, motores PredictLM, Qwen local e QR do WA.Auto usam a interface existente do INFINITUM.
- O MCP permanece na Edge Function \`https://ulkuhiibeoibbzhqrfya.supabase.co/functions/v1/killa-mcp\` e não depende do executável nem da Vercel.
- A configuração pública vem por HTTPS de \`/functions/v1/killa-mcp/desktop-config\`. **O EXE não contém chave service_role, sb_secret, JWT privado ou senha do usuário.**
- O WA.Auto continua hospedado no serviço HTTPS existente. **Sem internet/Supabase ou WA.Auto, sincronização, login e QR não funcionam**; este é um cliente local, não um WhatsApp offline.

## Gerar instalador Windows

No GitHub, execute o workflow \`INFINITUM Killa AI — instalador Windows\`. Ele prepara o Next.js standalone e gera \`INFINITUM-KillaAI-Setup-0.1.0-x64.exe\` como artefato GitHub Actions. O usuário que instalar **não precisa do Vercel nem do Node**.

Localmente, com Node.js 24 e Windows:

\`\`\`powershell
npm install
$env:KILLA_DESKTOP_STANDALONE="1"
npm run build
node desktop/stage-standalone.mjs
npm install --prefix desktop
npm --prefix desktop run dist:win
\`\`\`

Este protótipo pode ser distribuído como **instalador não assinado** nos testes. O Windows SmartScreen pode avisar. Para liberar atualizações automáticas confiáveis a todos os usuários, é obrigatório assinar o EXE com certificado confiável, configurar o publicador no Electron Builder, publicar versões no GitHub Releases e habilitar \`desktop/signed-updates.json\` **somente no pipeline de assinatura verificada**. Sem isso, a atualização de código deve ser distribuída manualmente; alterações de dados e regras no Supabase chegam sem reinstalação.

## Segurança e limites

O navegador embarcado permite somente a origem local e abre links HTTPS permitidos no navegador padrão. Node.js está desativado na interface, com sandbox e isolamento de contexto. O processo Next local recebe apenas \`NEXT_PUBLIC_SUPABASE_URL\`, chave pública Supabase e URL pública WA.Auto; não herda chaves de serviço da máquina.

Uma chave Supabase publishable/anon é pública por definição e ainda pode ser vista por quem inspeciona o cliente, inclusive EXE. **Não pode ser escondida como segredo.** Segurança real: autenticação individual, RLS, OAuth, segundo fator e backend privado. Rotas Next que antes dependiam de credenciais privadas da Vercel continuam exigindo migração para Supabase Edge ou outro backend protegido; não funcionam automaticamente só por empacotar o código.

**Licença:** consulte [licença proprietária](../LICENSE) para código novo e [NOTICE](../NOTICE.md) para concessões MIT anteriores. Bibliotecas Electron/Next possuem licenças próprias.

## Sincronização de mensagens (configurada no Supabase)

A publicação `supabase_realtime` contém apenas `office_wa_chat_archive`, `office_wa_message_archive` e `killa_mcp_send_intents`, com eventos de inclusão e atualização. Os filtros exigem `owner_id` igual ao usuário autenticado e o cliente não replica mensagens de outros escritórios.

O KPI separa aceites `OpenBot` e `MCP` pelo recibo único do WA.Auto. Nenhum atendimento é registrado apenas porque um rascunho foi gerado. As telas atualizam os dados com atraso curto para evitar travamentos em PCs fracos.

**Nota de implantação:** o QR verdadeiro só pode ser mostrado após login do usuário e resposta válida da sua sessão WA.Auto. Este manual não contém QR, token ou código de pareamento. O modelo MCP pode entregar a imagem temporária somente quando o administrador habilita a opção sensível. O servidor MCP permanece hospedado no Supabase, independente dos instaladores.
