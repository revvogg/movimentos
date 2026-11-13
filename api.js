/* Camada de dados: Supabase (produção) ou demonstração local (sem config). */
(() => {
  const CFG = window.MOVIMENTOS_CONFIG || {};
  const BUCKET = "movimentos-fotos";
  const READY = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  const db = READY ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "movimentos2026-auth" } }) : null;

  const norm = s => String(s || "").trim().toLowerCase();
  const nomeDoEmail = e => String(e).split("@")[0].split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(" ");
  const err = e => { const m = (e && (e.message || e.error_description)) || "Algo deu errado. Tente de novo."; return new Error(m); };

  /** Reduz a foto no celular (máx. 1600px, JPEG ~80%) antes de enviar. */
  function compress(file, max = 1600, q = 0.8) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error("Não consegui processar a foto.")), "image/jpeg", q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui ler essa imagem. Tente outra foto.")); };
      img.src = url;
    });
  }

  /* ================= SUPABASE ================= */
  const urlCache = new Map();
  const supa = {
    demo: false,
    async event(p) { const { data, error } = await db.rpc("current_event", { p_event: p || null }); if (error) throw err(error); return data; },
    async challenges() { const { data, error } = await db.rpc("challenges_list"); if (error) throw err(error); return data; },
    async session() { const { data } = await db.auth.getSession(); return data.session; },
    onAuth(cb) { db.auth.onAuthStateChange((_e, s) => cb(s)); },
    async login(email) {
      const { data: ok, error } = await db.rpc("check_participant", { p_email: email });
      if (error) throw err(error);
      if (!ok) throw new Error("Use seu e-mail @revvo.com.br.");
      let { data: s } = await db.auth.getSession();
      if (!s.session) {
        const r = await db.auth.signInAnonymously();
        if (r.error) throw new Error(/rate|limit/i.test(r.error.message) ? "Muita gente entrando ao mesmo tempo. Tente de novo em alguns segundos." : r.error.message);
      }
      const { error: e2 } = await db.rpc("login_with_email", { p_email: norm(email) });
      if (e2) throw err(e2);
    },
    async signOut() { try { await db.rpc("logout"); } catch (e) { } await db.auth.signOut(); },
    async profile() { const { data, error } = await db.rpc("my_profile"); if (error) throw err(error); return data; },
    async roster() { const { data, error } = await db.rpc("roster"); if (error) throw err(error); return data; },
    async myChallenges(ev) { const { data, error } = await db.rpc("my_challenges", { p_event: ev || null }); if (error) throw err(error); return data.map(d => d.challenge_id); },
    async leaderboard(ev) { const { data, error } = await db.rpc("leaderboard", { p_event: ev || null }); if (error) throw err(error); return data; },
    async feed(ev, limit = 60) {
      const { data, error } = await db.rpc("feed", { p_event: ev || null, p_limit: limit }); if (error) throw err(error);
      await supa.sign(data.map(d => d.photo_path));
      return data.map(d => ({ ...d, url: urlCache.get(d.photo_path)?.url }));
    },
    async sign(paths) {
      const now = Date.now();
      const need = [...new Set(paths)].filter(p => { const c = urlCache.get(p); return !c || c.exp < now + 60e3; });
      if (!need.length) return;
      const { data, error } = await db.storage.from(BUCKET).createSignedUrls(need, 3600);
      if (error) throw err(error);
      data.forEach(d => { if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + 3600e3 }); });
    },
    url(path) { return urlCache.get(path)?.url; },
    async submit(challengeId, participantIds, file) {
      const { data: s } = await db.auth.getSession();
      const uid = s.session && s.session.user.id;
      if (!uid) throw new Error("Sua sessão expirou. Entre de novo.");
      const blob = await compress(file);
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw err(up.error);
      const { data, error } = await db.rpc("submit_challenge", { p_challenge_id: challengeId, p_participant_ids: participantIds, p_photo_path: path });
      if (error) throw err(error);
      return data;
    },
    admin: {
      async list(ev) { const { data, error } = await db.rpc("admin_submissions", { p_event: ev || null }); if (error) throw err(error); await supa.sign(data.map(d => d.photo_path)); return data.map(d => ({ ...d, url: supa.url(d.photo_path) })); },
      async setValid(id, v) { const { error } = await db.rpc("admin_set_valid", { p_submission: id, p_valid: v }); if (error) throw err(error); },
      async setLightning(id, active, desc) { const { error } = await db.rpc("admin_set_relampago", { p_challenge: id, p_active: active, p_description: desc || null }); if (error) throw err(error); },
      async lightningAll() { const { data, error } = await db.rpc("admin_relampagos"); if (error) throw err(error); return data; },
      async export(ev) { const { data, error } = await db.rpc("admin_export", { p_event: ev || null }); if (error) throw err(error); return data; }
    }
  };

  /* ================= DEMONSTRAÇÃO LOCAL ================= */
  const demo = (() => {
    const KEY = "movimentos2026_demo_v2";
    const CH = [
      [1, "Conexões que movimentam", "AQUECENDO", 1, "Tire uma foto com alguém com quem você ainda não teve a oportunidade de conversar hoje."],
      [2, "Riso espontâneo", "AQUECENDO", 1, "Tire uma foto de um momento de risada genuína com alguém."],
      [3, "Brinde coletivo", "AQUECENDO", 1, "Registre um brinde com pessoas de áreas diferentes da sua."],
      [4, "Cheguei no movimento", "AQUECENDO", 1, "Faça uma selfie com o painel ou a marca MOVIMENTOS do evento."],
      [5, "Memórias em construção", "AQUECENDO", 1, "Tire uma selfie com alguém que fez parte de um momento importante do seu ano."],
      [6, "Movimento congelado", "EM MOVIMENTO", 2, "Convide três pessoas para fazer uma pose que represente a palavra MOVIMENTOS."],
      [7, "Fora da área", "EM MOVIMENTO", 2, "Faça uma foto criativa com alguém de uma área diferente da sua."],
      [8, "Da câmera para a vida real", "EM MOVIMENTO", 2, "Foto com alguém que você só conhecia pela tela das reuniões on-line."],
      [9, "Eterno aprendiz", "EM MOVIMENTO", 2, "Foto com alguém que te ensinou algo importante em 2026 — vale fazer o gesto de \"obrigado(a)\"."],
      [10, "Energia que contagia", "EM MOVIMENTO", 2, "Monte uma foto com 6 ou mais pessoas que transmita a energia do happy hour."],
      [11, "Nosso jeito de ser", "INDO ALÉM", 3, "Reúna pessoas para representar, em uma foto, um dos valores da Revvo."],
      [12, "Torcida do Prêmio Valores", "INDO ALÉM", 3, "Faça uma foto comemorando com uma pessoa indicada ou premiada no Prêmio Valores."],
      [13, "REVVO em movimento", "INDO ALÉM", 3, "Forme a palavra REVVO usando pessoas, mãos ou braços — uma letra por pessoa."],
      [14, "Liderança de perto", "INDO ALÉM", 3, "Foto com alguém da liderança fazendo exatamente a mesma pose que você."],
      [15, "Time maior que o indivíduo", "INDO ALÉM", 3, "Uma única foto com 8 ou mais pessoas de pelo menos 3 áreas diferentes."]
    ].map(([id, title, category, points, description]) => ({ id, title, category, points, description, kind: "cartao", active: true }));
    const NOMES = ["Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Alves", "Elisa Rocha", "Felipe Costa", "Gabi Martins", "Hugo Pereira", "Isa Ramos", "João Nunes", "Karen Dias", "Lucas Freitas", "Marina Torres", "Nina Prado"];
    const ROSTER = NOMES.map((n, i) => ({ id: "p" + i, full_name: n, email: n.split(" ")[0].toLowerCase() + "@revvo.com.br", area: ["G&G", "Tecnologia", "Comercial", "Produção", "Design"][i % 5], is_admin: i === 0 }));
    const cores = [["#ff6500", "#ffd400"], ["#0068ff", "#00bdf2"], ["#ffd400", "#ff6500"], ["#00bdf2", "#0068ff"]];
    const ph = i => { const [a, b] = cores[i % 4]; return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><g fill="#05070d" opacity=".85"><circle cx="300" cy="420" r="80"/><circle cx="500" cy="420" r="80"/><path d="M150 760c0-130 70-200 150-200s150 70 150 200z"/><path d="M350 760c0-130 70-200 150-200s150 70 150 200z"/></g><text x="400" y="900" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#05070d">Foto de exemplo</text></svg>`); };
    let st; try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { }
    if (!st) {
      st = { subs: [], light: { 101: { active: true, description: "Foto com o maior número de pessoas fazendo o gesto do MOVIMENTO!" }, 102: { active: false, description: "Escreva aqui o desafio da 2ª rodada." }, 103: { active: false, description: "Escreva aqui o desafio da 3ª rodada." } } };
      const t0 = Date.now() - 3600e3;
      ROSTER.forEach((p, i) => { if (i === 0) return; const n = Math.max(1, 10 - i); for (let k = 0; k < n; k++) { const cid = ((k * 4 + i) % 15) + 1; const outros = k % 3 === 0 ? [ROSTER[(i + 3) % ROSTER.length].id] : []; st.subs.push({ id: "s" + i + "-" + k, event_id: "rj", challenge_id: cid, submitted_by: p.id, ids: [p.id, ...outros].filter(x => x !== "p0"), photo: ph(i + k), valid: true, created_at: new Date(t0 + (i * 7 + k) * 60e3).toISOString() }); } });
    }
    (st.extra || []).forEach(r => { if (!ROSTER.some(x => x.id === r.id)) ROSTER.push(r); });
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } };
    let me = null; try { me = JSON.parse(localStorage.getItem(KEY + "_me") || "null"); } catch (e) { }
    let authCb = () => { };
    const allCh = () => CH.concat([101, 102, 103].map(id => ({ id, title: "Relâmpago " + (id - 100), category: "RELÂMPAGO", points: 5, description: st.light[id].description, kind: "relampago", active: st.light[id].active })));
    const ev = () => ({ id: "rj", cidade: "Rio de Janeiro", local: "Frontera Lounge Península", endereco: "Av. João Cabral de Mello Neto, 850 · Barra da Tijuca", starts_at: "2026-12-08T21:00:00Z", ends_at: "2026-12-09T01:30:00Z", status: "aberto", top: 10, max_marcados: 15, abre: new Date(Date.now() - 3600e3).toISOString(), fecha: new Date(Date.now() + 3 * 3600e3).toISOString() });
    function lb() {
      const ch = new Map(allCh().map(c => [c.id, c])), feitos = new Map();
      st.subs.filter(s => s.valid).sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(s => s.ids.forEach(pid => { const k = pid + "|" + s.challenge_id; if (!feitos.has(k)) feitos.set(k, { pid, cid: s.challenge_id, at: s.created_at }); }));
      const agg = new Map();
      feitos.forEach(f => { const p = ROSTER.find(r => r.id === f.pid); const a = agg.get(f.pid) || { participant_id: f.pid, name: p.full_name, area: p.area, points: 0, challenges: 0, reached_at: "" }; a.points += ch.get(f.cid).points; a.challenges++; if (f.at > a.reached_at) a.reached_at = f.at; agg.set(f.pid, a); });
      return [...agg.values()].sort((a, b) => b.points - a.points || a.reached_at.localeCompare(b.reached_at));
    }
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const api = {
      demo: true,
      async event() { return ev(); },
      async challenges() { return allCh().filter(c => c.kind === "cartao" || c.active); },
      async session() { return me ? { user: { id: me.id, email: me.email } } : null; },
      onAuth(cb) { authCb = cb; },
      async login(email) {
        await wait(400); const e = norm(email);
        let r = ROSTER.find(x => x.email === e);
        if (!r) {
          if (!/@revvo\.com\.br$/.test(e)) throw new Error("Use seu e-mail @revvo.com.br.");
          r = { id: "u" + Date.now().toString(36), full_name: nomeDoEmail(e), email: e, area: "", is_admin: true };
          ROSTER.push(r); st.extra = (st.extra || []).concat(r); save();
        }
        me = r; try { localStorage.setItem(KEY + "_me", JSON.stringify(me)); } catch (e2) { } authCb(await api.session());
      },
      async signOut() { me = null; try { localStorage.removeItem(KEY + "_me"); } catch (e) { } authCb(null); },
      async profile() { return me && { id: me.id, full_name: me.full_name, area: me.area, is_admin: me.is_admin }; },
      async roster() { return ROSTER.map(({ id, full_name, area }) => ({ id, full_name, area })); },
      async leaderboard() { return lb(); },
      async myChallenges() { return me ? [...new Set(st.subs.filter(s => s.valid && s.ids.includes(me.id)).map(s => s.challenge_id))] : []; },
      async feed() { return st.subs.filter(s => s.valid).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 60).map(s => { const c = allCh().find(x => x.id === s.challenge_id); return { submission_id: s.id, photo_path: s.id, url: s.photo, challenge_id: s.challenge_id, title: c.title, category: c.category, points: c.points, names: s.ids.map(id => ROSTER.find(r => r.id === id).full_name.split(" ")[0]), created_at: s.created_at }; }); },
      url() { return null; },
      async submit(cid, ids, file) {
        await wait(700);
        const c = allCh().find(x => x.id === cid); if (!c || !c.active) throw new Error("Este desafio não está disponível agora.");
        const all = [...new Set([me.id, ...ids])];
        const tinha = pid => st.subs.some(s => s.valid && s.challenge_id === cid && s.ids.includes(pid));
        const ja = tinha(me.id); const novos = all.filter(p => !tinha(p)).length;
        const blob = await compress(file, 900, .75); const photo = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        st.subs.push({ id: "s" + Date.now(), event_id: "rj", challenge_id: cid, submitted_by: me.id, ids: all, photo, valid: true, created_at: new Date().toISOString() }); save();
        const l = lb(); const pos = l.findIndex(x => x.participant_id === me.id);
        return { pontuou: !ja, ganhou: ja ? 0 : c.points, colegas_pontuaram: novos - (ja ? 0 : 1), pontos: pos >= 0 ? l[pos].points : 0, posicao: pos + 1 };
      },
      admin: {
        async list() { return st.subs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map(s => { const c = allCh().find(x => x.id === s.challenge_id); return { id: s.id, created_at: s.created_at, event_id: s.event_id, challenge_id: s.challenge_id, title: c.title, points: c.points, enviado_por: ROSTER.find(r => r.id === s.submitted_by).full_name, pessoas: s.ids.map(i => ROSTER.find(r => r.id === i).full_name).join(", "), photo_path: s.id, url: s.photo, valid: s.valid }; }); },
        async setValid(id, v) { const s = st.subs.find(x => x.id === id); if (s) s.valid = v; save(); },
        async setLightning(id, active, desc) { if (active) Object.keys(st.light).forEach(k => st.light[k].active = false); st.light[id].active = active; if (desc) st.light[id].description = desc; save(); },
        async lightningAll() { return [101, 102, 103].map(id => ({ id, ...st.light[id] })); },
        async export() { return st.subs.flatMap(s => s.ids.map(pid => { const p = ROSTER.find(r => r.id === pid); const c = allCh().find(x => x.id === s.challenge_id); return { evento: s.event_id, data_hora: s.created_at, desafio: s.challenge_id, titulo: c.title, pontos: c.points, participante: p.full_name, email: p.email, area: p.area, enviado_por: ROSTER.find(r => r.id === s.submitted_by).full_name, valida: s.valid, foto: s.id }; })); }
      }
    };
    return api;
  })();

  window.MovApi = READY ? supa : demo;
  window.MovApi.compress = compress;
})();
