// One connection flow per provider. Each catalog entry is an actual capability,
// not a claim that the corresponding account has been authorized.
export const OPENBOT_CONNECTORS=Object.freeze([
 {id:'crm',provider:'crm',name:'INFINITUM CRM',category:'Trabalho',description:'Clientes e processos autorizados, pesquisa somente leitura',icon:'building-2',features:['Pesquisar cliente','Consultar processo'],mode:'native'},
 {id:'drive',provider:'google',name:'Google Drive',category:'Google Workspace',description:'Listar arquivos e metadados',icon:'hard-drive',features:['Arquivos','Pastas'],mode:'oauth'},
 {id:'sheets',provider:'google',name:'Google Sheets',category:'Google Workspace',description:'Encontrar planilhas no Drive',icon:'table-2',features:['Planilhas'],mode:'oauth'},
 {id:'gmail',provider:'google',name:'Gmail',category:'Google Workspace',description:'Consultar marcadores e mensagens autorizadas',icon:'mail',features:['Marcadores','Mensagens'],mode:'oauth'},
 {id:'instagram',provider:'meta',name:'Instagram',category:'Redes sociais',description:'Contas profissionais autorizadas pela Meta; leitura de páginas',icon:'instagram',features:['Contas profissionais','Páginas'],mode:'oauth'},
 {id:'whatsapp',provider:'zapfast',name:'WhatsApp · ZapFast',category:'Mensagens',description:'Abre a sessão privada do ZapFast. Não compartilha o número com o CRM',icon:'message-circle',features:['Abrir ZapFast','Trocar número'],mode:'separate'},
 {id:'github',provider:'github',name:'GitHub',category:'Desenvolvimento',description:'Integração OAuth própria ainda não configurada',icon:'github',features:['Repositórios'],mode:'planned'},
 {id:'outlook',provider:'microsoft',name:'Microsoft Outlook',category:'Trabalho',description:'Requer registro OAuth Microsoft',icon:'at-sign',features:['Email'],mode:'planned'},
 {id:'calendar',provider:'google',name:'Google Calendar',category:'Google Workspace',description:'Calendário exigirá ampliação de permissões',icon:'calendar-days',features:['Agenda'],mode:'planned'},
 {id:'slack',provider:'slack',name:'Slack',category:'Equipe',description:'Requer aplicativo Slack aprovado',icon:'messages-square',features:['Canais'],mode:'planned'}
]);
export const CONNECTOR_IDS=Object.freeze(OPENBOT_CONNECTORS.map(c=>c.id));
export const GOOGLE_OAUTH_SCOPES=Object.freeze([
 'openid','email','profile',
 'https://www.googleapis.com/auth/drive.metadata.readonly',
 'https://www.googleapis.com/auth/spreadsheets.readonly',
 'https://www.googleapis.com/auth/gmail.readonly'
]);
export const META_OAUTH_SCOPES=Object.freeze(['pages_show_list','pages_read_engagement','instagram_basic']);
export function getConnector(id){return OPENBOT_CONNECTORS.find(x=>x.id===id)||null}
export function providerConfigured(provider,env=process.env){
 if(provider==='crm'||provider==='zapfast')return true;
 const storageReady=Boolean((env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY)
  &&env.NEXT_PUBLIC_SUPABASE_URL&&env.OPENBOT_TOKEN_CIPHER_KEY);
 if(provider==='google')return storageReady&&Boolean(env.OPENBOT_GOOGLE_CLIENT_ID&&env.OPENBOT_GOOGLE_CLIENT_SECRET);
 if(provider==='meta')return storageReady&&Boolean(env.OPENBOT_META_APP_ID&&env.OPENBOT_META_APP_SECRET);
 return false;
}
export function connectorCatalog(env=process.env){
 return OPENBOT_CONNECTORS.map(c=>({
  ...c,configured:c.mode==='oauth'?providerConfigured(c.provider,env):c.mode==='native'||c.mode==='separate',
  state:c.mode==='native'?'native':c.mode==='separate'?'separate':c.mode==='planned'?'not_supported':
   providerConfigured(c.provider,env)?'ready_to_connect':'requires_app_configuration'
 }));
}
export function authorizationUrl(provider,{clientId,redirectUri,state,challenge}){
 if(provider==='google'){
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:GOOGLE_OAUTH_SCOPES.join(' '),
   state,access_type:'offline',prompt:'consent select_account',include_granted_scopes:'true',
   code_challenge:challenge,code_challenge_method:'S256'}).forEach(([k,v])=>u.searchParams.set(k,v));
  return u.toString();
 }
 if(provider==='meta'){
  const u=new URL('https://www.facebook.com/v24.0/dialog/oauth');
  Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',
   scope:META_OAUTH_SCOPES.join(','),state}).forEach(([k,v])=>u.searchParams.set(k,v));
  return u.toString();
 }
 throw Error('Provedor OAuth não suportado.');
}
