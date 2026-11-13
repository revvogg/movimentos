// Configure as credenciais públicas do Supabase aqui antes de publicar.
// Use SOMENTE a "anon / publishable key". Nunca coloque a chave service_role neste arquivo.
// Com os campos vazios, o app abre em MODO DEMONSTRAÇÃO (dados fictícios, só neste navegador).
window.MOVIMENTOS_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  DOMINIO_EMAIL: "revvo.com.br",   // "" para aceitar qualquer domínio
  ATUALIZAR_A_CADA_SEG: 15,        // atualização automática do ranking e das fotos
  APP_URL: ""                      // endereço público do app (QR code do telão). Vazio = detecta sozinho.
};
