-- =====================================================================
-- MOVIMENTOS 2026 | Revvo — schema Supabase (versão para produção)
-- Execute TUDO de uma vez no SQL Editor do projeto Supabase.
--
-- Segurança:
--  * Entrada só com o e-mail corporativo (sem senha e sem código). O app cria
--    uma sessão anônima do Supabase no celular e a vincula ao e-mail da lista
--    (tabela device_sessions). Só quem está em participants consegue usar.
--  * Risco aceito: quem souber o e-mail de um colega consegue entrar como ele.
--    Toda entrada fica registrada (device_sessions) para auditoria do RH.
--  * O navegador nunca acessa as tabelas diretamente: tudo passa por funções
--    (RPC) que validam a pessoa logada.
--  * Fotos em bucket PRIVADO; só pessoas logadas veem, via link temporário.
--  * E-mails NÃO aparecem no ranking.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- TABELAS
-- ---------------------------------------------------------------------
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  area text,
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  modo_teste boolean not null default true,      -- true: envios liberados a qualquer hora no evento "teste"
  abre_antes_min integer not null default 30,    -- envios abrem X min antes do início
  fecha_depois_min integer not null default 15,  -- e fecham X min depois do fim
  top_premiados integer not null default 10,
  max_marcados integer not null default 15       -- máximo de colegas marcados por foto
);
alter table public.settings add column if not exists esquenta_aberto boolean not null default true; -- Esquenta (antes da festa, sem pontos)
-- Domínio liberado: qualquer e-mail deste domínio entra, mesmo fora da lista
-- (o cadastro é criado na hora, com o nome tirado do e-mail). Use '' para exigir a lista.
alter table public.settings add column if not exists dominio_livre text not null default 'revvo.com.br';
insert into public.settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.events (
  id text primary key,
  cidade text not null,
  local text,
  endereco text,
  starts_at timestamptz,
  ends_at timestamptz
);
insert into public.events(id,cidade,local,endereco,starts_at,ends_at) values
('rj','Rio de Janeiro','Frontera Lounge Península','Av. João Cabral de Mello Neto, 850 · Barra da Tijuca','2026-12-08 18:00-03','2026-12-08 22:30-03'),
('sp','São Paulo','Pasquim Bar e Prosa','R. Aspicuelta, 524 · Vila Madalena','2026-12-10 18:30-03','2026-12-10 22:30-03'),
('teste','Teste','Modo teste','Envios liberados para teste',null,null),
('esquenta','Esquenta','Antes da festa','Mural de fotos, não vale pontos',null,null)
on conflict (id) do nothing;

create table if not exists public.challenges (
  id integer primary key,
  title text not null,
  category text not null,          -- AQUECENDO | EM MOVIMENTO | INDO ALÉM | RELÂMPAGO
  points integer not null check (points >= 0),
  description text not null,
  kind text not null default 'cartao' check (kind in ('cartao','relampago','esquenta')),
  active boolean not null default true
);

-- (atualiza bancos criados antes do Esquenta)
alter table public.challenges drop constraint if exists challenges_points_check;
alter table public.challenges add constraint challenges_points_check check (points >= 0);
alter table public.challenges drop constraint if exists challenges_kind_check;
alter table public.challenges add constraint challenges_kind_check check (kind in ('cartao','relampago','esquenta'));

insert into public.challenges(id,title,category,points,description,kind,active) values
(1,'Conexões que movimentam','AQUECENDO',1,'Tire uma foto com alguém com quem você ainda não teve a oportunidade de conversar hoje.','cartao',true),
(2,'Riso espontâneo','AQUECENDO',1,'Tire uma foto de um momento de risada genuína com alguém.','cartao',true),
(3,'Brinde coletivo','AQUECENDO',1,'Registre um brinde com pessoas de áreas diferentes da sua.','cartao',true),
(4,'Cheguei no movimento','AQUECENDO',1,'Faça uma selfie com o painel ou a marca MOVIMENTOS do evento.','cartao',true),
(5,'Memórias em construção','AQUECENDO',1,'Tire uma selfie com alguém que fez parte de um momento importante do seu ano.','cartao',true),
(6,'Movimento congelado','EM MOVIMENTO',2,'Convide três pessoas para fazer uma pose que represente a palavra MOVIMENTOS.','cartao',true),
(7,'Fora da área','EM MOVIMENTO',2,'Faça uma foto criativa com alguém de uma área diferente da sua.','cartao',true),
(8,'Da câmera para a vida real','EM MOVIMENTO',2,'Foto com alguém que você só conhecia pela tela das reuniões on-line.','cartao',true),
(9,'Eterno aprendiz','EM MOVIMENTO',2,'Foto com alguém que te ensinou algo importante em 2026 — vale fazer o gesto de "obrigado(a)".','cartao',true),
(10,'Energia que contagia','EM MOVIMENTO',2,'Monte uma foto com 6 ou mais pessoas que transmita a energia do happy hour.','cartao',true),
(11,'Nosso jeito de ser','INDO ALÉM',3,'Reúna pessoas para representar, em uma foto, um dos valores da Revvo.','cartao',true),
(12,'Torcida do Prêmio Valores','INDO ALÉM',3,'Faça uma foto comemorando com uma pessoa indicada ou premiada no Prêmio Valores.','cartao',true),
(13,'REVVO em movimento','INDO ALÉM',3,'Forme a palavra REVVO usando pessoas, mãos ou braços — uma letra por pessoa.','cartao',true),
(14,'Liderança de perto','INDO ALÉM',3,'Foto com alguém da liderança fazendo exatamente a mesma pose que você.','cartao',true),
(15,'Time maior que o indivíduo','INDO ALÉM',3,'Uma única foto com 8 ou mais pessoas de pelo menos 3 áreas diferentes.','cartao',true),
-- Desafios Relâmpago: ficam DESLIGADOS. O RH liga um por vez durante a festa (active = true).
(101,'Relâmpago 1','RELÂMPAGO',5,'Foto com o maior número de pessoas fazendo o gesto do MOVIMENTO!','relampago',false),
(102,'Relâmpago 2','RELÂMPAGO',5,'Escreva aqui o desafio da 2ª rodada.','relampago',false),
(103,'Relâmpago 3','RELÂMPAGO',5,'Escreva aqui o desafio da 3ª rodada.','relampago',false),
-- ESQUENTA: antes da festa, sem pontos. Vale foto ou print de tela.
(201,'Ação da CIPA','ESQUENTA',0,'Foto ou print seu participando de uma ação da CIPA.','esquenta',true),
(202,'Cafezinho Virtual','ESQUENTA',0,'Print do Cafezinho Virtual com a galera reunida.','esquenta',true),
(203,'Clube do Livro','ESQUENTA',0,'Foto com o livro do momento ou print do encontro do Clube do Livro.','esquenta',true),
(204,'Autocuidado do dia','ESQUENTA',0,'Registre uma pausa de autocuidado: alongamento, água, caminhada, respiro.','esquenta',true),
(205,'Daily em movimento','ESQUENTA',0,'Print da sua daily com o time (com todo mundo de acordo).','esquenta',true),
(206,'Revvo Saúde em ação','ESQUENTA',0,'Foto da sua atividade física da semana.','esquenta',true),
(207,'Meu cantinho Revvo','ESQUENTA',0,'Mostre o cantinho de onde você trabalha.','esquenta',true),
(208,'Contagem regressiva','ESQUENTA',0,'Uma foto mostrando como você está se preparando para a festa.','esquenta',true),
(209,'Eu faço parte do movimento','ESQUENTA',0,'Peça para a sua IA favorita criar uma frase ou imagem que mostre que você faz parte do MOVIMENTO e poste a foto ou o print.','esquenta',true)
on conflict (id) do nothing;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id),
  challenge_id integer not null references public.challenges(id),
  submitted_by uuid not null references public.participants(id),
  photo_path text not null,
  valid boolean not null default true,           -- RH pode invalidar (moderação)
  created_at timestamptz not null default now()
);
create index if not exists submissions_event_idx on public.submissions(event_id, created_at desc);

create table if not exists public.submission_participants (
  submission_id uuid not null references public.submissions(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  primary key (submission_id, participant_id)
);
create index if not exists sp_participant_idx on public.submission_participants(participant_id);

-- Vínculo celular (sessão anônima) -> colaborador
create table if not exists public.device_sessions (
  auth_uid uuid primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.device_sessions enable row level security;
alter table public.participants enable row level security;
alter table public.settings enable row level security;
alter table public.events enable row level security;
alter table public.challenges enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_participants enable row level security;

-- O navegador não acessa as tabelas diretamente. Apenas as funções abaixo.
revoke all on public.device_sessions from anon, authenticated;
revoke all on public.participants, public.settings, public.events, public.challenges,
  public.submissions, public.submission_participants from anon, authenticated;

-- ---------------------------------------------------------------------
-- FUNÇÕES INTERNAS
-- ---------------------------------------------------------------------
create or replace function public._me()
returns public.participants
language sql stable security definer set search_path = public as $$
  select p.* from device_sessions d join participants p on p.id = d.participant_id
  where d.auth_uid = auth.uid() and p.active
  limit 1;
$$;

create or replace function public._is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public._me()), false);
$$;

-- Evento "da vez": pedido > teste (se modo_teste) > o de hoje > o próximo > o último
create or replace function public.current_event(p_event text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s settings; e events; v_status text; v_abre timestamptz; v_fecha timestamptz;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into s from settings where id = 1;
  if p_event is not null then
    select * into e from events where id = p_event;
  end if;
  if e.id is null and s.modo_teste then
    select * into e from events where id = 'teste';
  end if;
  if e.id is null then
    select * into e from events where starts_at is not null
      and (starts_at at time zone 'America/Sao_Paulo')::date = v_hoje order by starts_at limit 1;
  end if;
  if e.id is null then
    select * into e from events where starts_at is not null
      and ends_at + make_interval(mins => s.fecha_depois_min) > now() order by starts_at limit 1;
  end if;
  if e.id is null then
    select * into e from events where starts_at is not null order by starts_at desc limit 1;
  end if;

  if e.id = 'teste' then
    v_status := case when s.modo_teste then 'aberto' else 'encerrado' end;
  else
    v_abre := e.starts_at - make_interval(mins => s.abre_antes_min);
    v_fecha := e.ends_at + make_interval(mins => s.fecha_depois_min);
    v_status := case when now() < v_abre then 'antes' when now() <= v_fecha then 'aberto' else 'encerrado' end;
  end if;

  return jsonb_build_object(
    'id', e.id, 'cidade', e.cidade, 'local', e.local, 'endereco', e.endereco,
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'abre', v_abre, 'fecha', v_fecha,
    'status', v_status, 'top', s.top_premiados, 'max_marcados', s.max_marcados);
end;
$$;

-- ---------------------------------------------------------------------
-- FUNÇÕES PÚBLICAS (antes do login)
-- ---------------------------------------------------------------------
-- Confere se o e-mail está na lista antes de enviar o código.
create or replace function public.check_participant(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participants where lower(trim(email)) = lower(trim(p_email)) and active)
      or exists (select 1 from settings where coalesce(dominio_livre,'') <> ''
                 and lower(trim(p_email)) ~ ('^[^@\s]+@' || replace(lower(dominio_livre), '.', '\.') || '$'));
$$;

-- Lista de desafios (cartões + relâmpago ativo)
create or replace function public.challenges_list()
returns table(id integer, title text, category text, points integer, description text, kind text, active boolean)
language sql stable security definer set search_path = public as $$
  select id, title, category, points, description, kind, active from challenges
  where kind = 'cartao' or (kind = 'relampago' and active)
     or (kind = 'esquenta' and active and (select esquenta_aberto from settings where id = 1))
  order by kind, id;
$$;

-- Entrar com o e-mail corporativo (chamado logo após a sessão anônima)
create or replace function public.login_with_email(p_email text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_p participants;
begin
  if auth.uid() is null then raise exception 'Sessão não iniciada. Recarregue a página.'; end if;
  select * into v_p from participants where lower(trim(email)) = lower(trim(p_email));
  if v_p.id is not null and not v_p.active then raise exception 'Este e-mail está desativado. Fale com o RH.'; end if;
  if v_p.id is null then
    if not public.check_participant(p_email) then raise exception 'Use seu e-mail @revvo.com.br.'; end if;
    insert into participants(full_name, email)
      values (initcap(regexp_replace(split_part(lower(trim(p_email)), '@', 1), '[._-]+', ' ', 'g')), lower(trim(p_email)))
      returning * into v_p;
  end if;
  insert into device_sessions(auth_uid, participant_id) values (auth.uid(), v_p.id)
    on conflict (auth_uid) do update set participant_id = excluded.participant_id, created_at = now();
  return jsonb_build_object('id', v_p.id, 'full_name', v_p.full_name, 'area', v_p.area, 'is_admin', v_p.is_admin);
end;
$$;

create or replace function public.logout()
returns void
language sql volatile security definer set search_path = public as $$
  delete from device_sessions where auth_uid = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- FUNÇÕES DE QUEM ESTÁ LOGADO
-- ---------------------------------------------------------------------
create or replace function public.my_profile()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'full_name', full_name, 'area', area, 'is_admin', is_admin)
  from public._me();
$$;

-- Colegas para marcar na foto (sem e-mail)
create or replace function public.roster()
returns table(id uuid, full_name text, area text)
language plpgsql stable security definer set search_path = public as $$
begin
  if (public._me()).id is null then raise exception 'Faça login para continuar.'; end if;
  return query select p.id, p.full_name, p.area from participants p where p.active order by p.full_name;
end;
$$;

create or replace function public.leaderboard(p_event text default null)
returns table(participant_id uuid, name text, area text, points bigint, challenges bigint, reached_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_event text;
begin
  if (public._me()).id is null then raise exception 'Faça login para continuar.'; end if;
  v_event := coalesce(p_event, public.current_event()->>'id');
  return query
    with feitos as (
      select sp.participant_id pid, s.challenge_id cid, min(s.created_at) first_at
      from submissions s join submission_participants sp on sp.submission_id = s.id
      where s.event_id = v_event and s.valid
      group by 1, 2)
    select p.id, p.full_name, p.area, sum(c.points)::bigint, count(*)::bigint, max(f.first_at)
    from feitos f join challenges c on c.id = f.cid join participants p on p.id = f.pid
    group by p.id, p.full_name, p.area
    order by 4 desc, 6 asc;
end;
$$;

-- Desafios que eu já pontuei no evento
create or replace function public.my_challenges(p_event text default null)
returns table(challenge_id integer)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := (public._me()).id; v_event text;
begin
  if v_me is null then raise exception 'Faça login para continuar.'; end if;
  v_event := coalesce(p_event, public.current_event()->>'id');
  return query select distinct s.challenge_id from submissions s join submission_participants sp on sp.submission_id = s.id
    where s.event_id = v_event and s.valid and sp.participant_id = v_me;
end;
$$;

-- Fotos recentes para o carrossel / telão
create or replace function public.feed(p_event text default null, p_limit integer default 60)
returns table(submission_id uuid, photo_path text, challenge_id integer, title text, category text, points integer, names text[], created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_event text;
begin
  if (public._me()).id is null then raise exception 'Faça login para continuar.'; end if;
  v_event := coalesce(p_event, public.current_event()->>'id');
  return query
    select s.id, s.photo_path, s.challenge_id, c.title, c.category, c.points,
      array(select split_part(p.full_name,' ',1) from submission_participants sp join participants p on p.id = sp.participant_id
            where sp.submission_id = s.id order by (p.id = s.submitted_by) desc, p.full_name),
      s.created_at
    from submissions s join challenges c on c.id = s.challenge_id
    where s.event_id = v_event and s.valid
    order by s.created_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;

-- Envio de um desafio (com colegas marcados: todos pontuam 1x por desafio)
create or replace function public.submit_challenge(
  p_challenge_id integer,
  p_participant_ids uuid[],
  p_photo_path text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me participants; v_ev jsonb; v_ch challenges; v_ids uuid[]; v_sub uuid;
  v_ja boolean; v_novos integer; v_pts bigint; v_pos bigint;
begin
  select * into v_me from public._me();
  if v_me.id is null then raise exception 'Faça login com seu e-mail da Revvo para enviar.'; end if;

  select * into v_ch from challenges where id = p_challenge_id;
  if v_ch.id is null or not v_ch.active then raise exception 'Este desafio não está disponível agora.'; end if;

  if v_ch.kind = 'esquenta' then
    -- Esquenta: vale antes da festa, não depende do horário do evento e não soma pontos
    if not (select esquenta_aberto from settings where id = 1) then raise exception 'O Esquenta foi encerrado. Agora é na festa!'; end if;
    v_ev := jsonb_build_object('id', 'esquenta', 'status', 'aberto', 'max_marcados', (select max_marcados from settings where id = 1));
  else
    v_ev := public.current_event();
    if v_ev->>'status' = 'antes' then raise exception 'Os envios ainda não abriram. Eles começam no horário do evento. Enquanto isso, participe do Esquenta!'; end if;
    if v_ev->>'status' <> 'aberto' then raise exception 'Os envios deste evento foram encerrados. Obrigado por participar!'; end if;
  end if;

  if p_photo_path is null or split_part(p_photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Foto inválida.';
  end if;

  -- você + colegas marcados, sem repetição
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_participant_ids, '{}') || v_me.id) x;
  if cardinality(v_ids) > (v_ev->>'max_marcados')::int + 1 then
    raise exception 'Marque no máximo % colegas por foto.', (v_ev->>'max_marcados');
  end if;
  if (select count(*) from participants where id = any(v_ids) and active) <> cardinality(v_ids) then
    raise exception 'Um ou mais colegas marcados não foram encontrados.';
  end if;

  -- quantos ainda não tinham feito este desafio neste evento
  select count(*) into v_novos from unnest(v_ids) pid
  where not exists (select 1 from submissions s join submission_participants sp on sp.submission_id = s.id
                    where s.event_id = v_ev->>'id' and s.challenge_id = p_challenge_id and s.valid and sp.participant_id = pid);
  select exists (select 1 from submissions s join submission_participants sp on sp.submission_id = s.id
                 where s.event_id = v_ev->>'id' and s.challenge_id = p_challenge_id and s.valid and sp.participant_id = v_me.id) into v_ja;

  insert into submissions(event_id, challenge_id, submitted_by, photo_path)
    values (v_ev->>'id', p_challenge_id, v_me.id, p_photo_path) returning id into v_sub;
  insert into submission_participants(submission_id, participant_id) select v_sub, unnest(v_ids);

  select l.points, l.pos into v_pts, v_pos from (
    select lb.participant_id, lb.points, row_number() over (order by lb.points desc, lb.reached_at asc) pos
    from public.leaderboard(v_ev->>'id') lb) l where l.participant_id = v_me.id;

  return jsonb_build_object('submission_id', v_sub, 'pontuou', not v_ja, 'ganhou', case when v_ja then 0 else v_ch.points end,
    'colegas_pontuaram', v_novos - case when v_ja then 0 else 1 end, 'pontos', coalesce(v_pts,0), 'posicao', coalesce(v_pos,0));
end;
$$;

-- ---------------------------------------------------------------------
-- ÁREA DO RH (participants.is_admin = true)
-- ---------------------------------------------------------------------
create or replace function public.admin_submissions(p_event text default null)
returns table(id uuid, created_at timestamptz, event_id text, challenge_id integer, title text, points integer,
              enviado_por text, pessoas text, photo_path text, valid boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Acesso restrito ao RH.'; end if;
  return query
    select s.id, s.created_at, s.event_id, s.challenge_id, c.title, c.points, sb.full_name,
      (select string_agg(p.full_name, ', ' order by p.full_name) from submission_participants sp join participants p on p.id = sp.participant_id where sp.submission_id = s.id),
      s.photo_path, s.valid
    from submissions s join challenges c on c.id = s.challenge_id join participants sb on sb.id = s.submitted_by
    where p_event is null or s.event_id = p_event
    order by s.created_at desc;
end;
$$;

create or replace function public.admin_set_valid(p_submission uuid, p_valid boolean)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Acesso restrito ao RH.'; end if;
  update submissions set valid = p_valid where id = p_submission;
end;
$$;

create or replace function public.admin_set_relampago(p_challenge integer, p_active boolean, p_description text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Acesso restrito ao RH.'; end if;
  if p_active then update challenges set active = false where kind = 'relampago' and id <> p_challenge; end if;
  update challenges set active = p_active, description = coalesce(nullif(trim(p_description),''), description)
    where id = p_challenge and kind = 'relampago';
end;
$$;

create or replace function public.admin_relampagos()
returns table(id integer, description text, points integer, active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Acesso restrito ao RH.'; end if;
  return query select c.id, c.description, c.points, c.active from challenges c where c.kind = 'relampago' order by c.id;
end;
$$;

create or replace function public.admin_export(p_event text default null)
returns table(evento text, data_hora timestamptz, desafio integer, titulo text, pontos integer, participante text, email text, area text, enviado_por text, valida boolean, foto text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Acesso restrito ao RH.'; end if;
  return query
    select s.event_id, s.created_at, s.challenge_id, c.title, c.points, p.full_name, p.email, p.area, sb.full_name, s.valid, s.photo_path
    from submissions s join challenges c on c.id = s.challenge_id
      join submission_participants sp on sp.submission_id = s.id join participants p on p.id = sp.participant_id
      join participants sb on sb.id = s.submitted_by
    where p_event is null or s.event_id = p_event
    order by s.created_at, p.full_name;
end;
$$;

-- ---------------------------------------------------------------------
-- PERMISSÕES DAS FUNÇÕES
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.check_participant(text) to anon, authenticated;
grant execute on function public.challenges_list() to anon, authenticated;
grant execute on function public.current_event(text) to anon, authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.login_with_email(text) to authenticated;
grant execute on function public.logout() to authenticated;
grant execute on function public.roster() to authenticated;
grant execute on function public.leaderboard(text) to authenticated;
grant execute on function public.feed(text, integer) to authenticated;
grant execute on function public.my_challenges(text) to authenticated;
grant execute on function public.submit_challenge(integer, uuid[], text) to authenticated;
grant execute on function public.admin_submissions(text) to authenticated;
grant execute on function public.admin_set_valid(uuid, boolean) to authenticated;
grant execute on function public.admin_set_relampago(integer, boolean, text) to authenticated;
grant execute on function public.admin_export(text) to authenticated;
grant execute on function public.admin_relampagos() to authenticated;

-- ---------------------------------------------------------------------
-- STORAGE: bucket privado das fotos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('movimentos-fotos', 'movimentos-fotos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "movimentos: envio na propria pasta" on storage.objects;
create policy "movimentos: envio na propria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'movimentos-fotos'
              and (storage.foldername(name))[1] = auth.uid()::text
              and (public._me()).id is not null);

drop policy if exists "movimentos: leitura por participantes" on storage.objects;
create policy "movimentos: leitura por participantes" on storage.objects
  for select to authenticated
  using (bucket_id = 'movimentos-fotos' and (public._me()).id is not null);

grant execute on function public._me() to authenticated;  -- usada pelas políticas do Storage
