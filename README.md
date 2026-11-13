# MOVIMENTOS 2026 · Revvo — app da dinâmica de desafios

App web (celular) da festa de final de ano: a pessoa pega um cartão, faz o desafio, envia a foto, **marca quem aparece nela** e todos pontuam. Ranking ao vivo por cidade, fotos em carrossel, telão e área do RH.

| Arquivo | Para que serve |
|---|---|
| `index.html` + `app.js` + `styles.css` | App do participante e área do RH |
| `telao.html` | Telão: fotos em destaque, ranking top 10, Desafio Relâmpago e QR code |
| `api.js` | Conexão com o Supabase (ou modo demonstração local) |
| `config.js` | **Único arquivo a editar no GitHub**: URL e chave pública do Supabase |
| `supabase/schema.sql` | Banco de dados completo: rode uma vez no Supabase |
| `colaboradores_template.csv` | Modelo da lista de colaboradores para importar |
| `vendor/` | Biblioteca do Supabase e gerador de QR code (sem depender de CDN) |
| `assets/` | Logo REVVO original e logo MOVIMENTOS (provisório) |

Sem `config.js` preenchido, o app abre em **modo demonstração** (dados fictícios só no navegador; entra com qualquer e-mail @revvo.com.br e, na demonstração, todo mundo vê a área do RH).

## Regras implementadas
- **15 desafios**: 01–05 Aquecendo **+1** · 06–10 Em movimento **+2** · 11–15 Indo além **+3** · Relâmpago **+5** (ligado pelo RH durante a festa).
- **Coletivo**: quem envia marca os colegas da foto (máx. 15). Todos que ainda não tinham feito aquele desafio pontuam.
- Cada pessoa pontua **1 vez por desafio** em cada evento. Repetir manda a foto para o carrossel sem somar.
- **Evento automático pela data e hora** (sem a pessoa escolher a cidade): Rio 08/12 18h–22h30 · SP 10/12 18h30–22h30. Envios abrem 30 min antes e fecham 15 min depois. Fora disso, o envio é bloqueado no servidor.
- **Ranking separado por evento**, top 10 destacado. Desempate: quem chegou primeiro à pontuação.
- **Entrada só com o e-mail corporativo**: qualquer e-mail **@revvo.com.br** entra, mesmo que ainda não esteja na lista (o cadastro é criado na hora, com o nome tirado do e-mail, ex.: `maria.oliveira@` → "Maria Oliveira"). Sem senha e sem código. Para exigir a lista, deixe `settings.dominio_livre` vazio.
- Fotos em **bucket privado**: só pessoas logadas veem (link temporário). O ranking **não mostra e-mails**.

---

## Passo a passo para publicar

### 1. Criar o Supabase
1. Crie uma conta em supabase.com e um **New project** (região *South America (São Paulo)*). Guarde a senha do banco.
2. Abra **SQL Editor → New query**, cole todo o `supabase/schema.sql` e clique **Run**. Isso cria tabelas, regras de segurança, funções, os 15 desafios, os 3 relâmpagos, os eventos RJ/SP e o bucket de fotos.

### 2. Importar os colaboradores
1. Monte a planilha no formato de `colaboradores_template.csv` (colunas `full_name,email,area,is_admin`). `is_admin = true` só para quem cuida da área do RH.
2. **Table Editor → participants → Insert → Import data from CSV**.
3. O nome aparece no ranking e na lista para marcar colegas: use o nome pelo qual as pessoas se reconhecem.
4. A importação é recomendada (nomes certos e todos aparecem para serem marcados), mas não obrigatória: quem não estiver na lista entra com o e-mail @revvo.com.br e é cadastrado na hora.

### 3. Configurar a entrada só com e-mail
1. **Authentication → Sign In / Providers**: ligue **Allow anonymous sign-ins**. O app cria uma sessão anônima no celular e a vincula ao e-mail da lista — sem senha e sem código.
2. **⚠️ Authentication → Rate Limits**: aumente *anonymous users per hour* (ex.: **1000**). O padrão é baixo e conta por endereço de IP: na festa, todo mundo no Wi-Fi do local sai pelo mesmo IP e o limite estoura em minutos.
3. Não é preciso configurar e-mail/SMTP.

**Risco aceito:** sem código, quem souber o e-mail de um colega consegue entrar como ele. Cada entrada fica registrada na tabela `device_sessions` (qual celular entrou com qual e-mail e quando) e o RH pode invalidar fotos suspeitas na área do RH.

### 4. Preencher o `config.js`
Em **Project Settings → API** (ou *Data API*), copie a **Project URL** e a chave **anon / publishable** para `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
**Nunca** use a chave `service_role` / `secret` no `config.js`.

### 5. Publicar no GitHub Pages
1. Crie um repositório (ex.: `movimentos-2026`) e envie todos os arquivos desta pasta para a raiz.
2. **Settings → Pages → Deploy from a branch** → `main` / `/ (root)` → Save.
3. O app fica em `https://SEU-USUARIO.github.io/movimentos-2026/`. Coloque esse endereço em `APP_URL` no `config.js` (é o que vai no QR code do telão).

### 6. Testar e liberar
- O banco vem com **modo teste ligado** (`settings.modo_teste = true`): os envios entram no evento "teste" a qualquer hora. Teste login, envio, marcação de colegas, telão e área do RH.
- **Antes de 08/12**: **Table Editor → settings → `modo_teste` = false**. As fotos de teste ficam fora dos rankings oficiais.
- Horários, endereços ou janelas mudaram? Edite as tabelas `events` e `settings` (colunas `abre_antes_min`, `fecha_depois_min`, `top_premiados`, `max_marcados`).
- ⚠️ No plano gratuito, o Supabase **pausa o projeto após 7 dias sem uso**. Abra o app nos dias anteriores a cada evento (ou use o plano pago no mês da festa).

## No dia do evento
- **Telão**: abra `.../telao.html` no computador do telão, depois de entrar no app **nesse mesmo navegador** (com o e-mail do RH). Clique em "Tela cheia". Para ver um evento específico: `telao.html?evento=rj` ou `?evento=sp`.
- **Desafio Relâmpago**: no app, **Área do RH → Desafio Relâmpago**: edite o texto e toque em **LIGAR**. Aparece na hora no telão e no app. Toque em **DESLIGAR** para encerrar. Cada rodada (1, 2, 3) pontua uma vez por pessoa.
- **Moderação**: Área do RH → **INVALIDAR** tira a foto do telão e retira os pontos de todos marcados nela.
- **Resultado**: Área do RH → **EXPORTAR CSV** (uma linha por pessoa marcada, com e-mail, área e link da foto).

## Privacidade e limites
- Fotos ficam no bucket privado `movimentos-fotos`. Definam o **prazo de exclusão** (ex.: 90 dias após a festa) e apaguem em **Storage → movimentos-fotos**.
- As fotos são reduzidas no celular (≈300 KB). O plano gratuito tem 1 GB de armazenamento (~3.000 fotos).

## Marca
- **Ícone Revvo** no centro da órbita da tela inicial: arquivo enviado pelo G&G (`assets/icone-revvo.png`), sem alteração. É pequeno (144×185 px); se houver uma versão maior, substitua com o mesmo nome.
- **REVVO**: arquivo original do Manual de Marca (`assets/logo-revvo-branco.png`), sem alteração. O MVP v2 tinha o nome digitado em texto (“RΞVVO”); foi substituído pelo arquivo oficial.
- **MOVIMENTOS 26/27**: `assets/logo-movimentos.png` é um **recorte provisório da arte oficial do save the date**, sem alteração. Substitua pelo arquivo original (PNG transparente ou SVG) com o mesmo nome.
- Visual, fontes (Barlow Condensed + Inter, via Google Fonts) e textos mantidos exatamente como no MVP v2. A fonte oficial da marca (Grandis Extended) não é usada nesta versão, por escolha de manter o v2.
