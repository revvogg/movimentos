(() => {
  const $ = s => document.querySelector(s);
  const API = window.MovApi;
  const CFG = window.MOVIMENTOS_CONFIG || {};
  const EV_PARAM = new URLSearchParams(location.search).get("evento") || null;
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  let ev = null, challenges = [], profile = null, roster = [], board = [], done = new Set(), doneEsq = new Set(), feedData = [], feedEsq = [], current = null, busy = false, lastNext = null, modo = null, mural = "festa";

  const pad = n => String(n).padStart(2, "0");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tz = { timeZone: "America/Sao_Paulo" };
  const hora = d => new Date(d).toLocaleTimeString("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" });
  const dataBR = d => new Date(d).toLocaleDateString("pt-BR", { ...tz, day: "2-digit", month: "2-digit" });
  const shortName = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[0] + " " + p[p.length - 1] : p[0]; };
  const fold = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const cards = () => challenges.filter(c => c.kind === "cartao").sort((a, b) => a.id - b.id);
  const nextCard = () => cards().find(c => !done.has(c.id)) || null;
  const aberto = () => !ev || ev.status === "aberto";
  function toast(msg, stop) { const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (stop ? " stop" : ""); clearTimeout(t._t); t._t = setTimeout(() => t.className = "toast", 3600); }
  function show(id) { document.body.classList.toggle("sem-topo", id === "welcome"); ["welcome", "register", "app"].forEach(x => $("#" + x).classList.toggle("hidden", x !== id)); $("#tabs").classList.toggle("hidden", id !== "app"); $("#meChip").classList.toggle("hidden", id !== "app"); }
  function go(v) {
    ["desafios", "ranking", "fotos"].forEach(x => $("#v-" + x).classList.toggle("hidden", x !== v));
    document.querySelectorAll("#tabs button").forEach(b => { if (b.dataset.v === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => go(b.dataset.v));

  if (API.demo) { const b = document.createElement("div"); b.className = "demo-badge"; b.textContent = "DEMONSTRAÇÃO"; document.body.appendChild(b); }

  /* ---------- entrada ---------- */
  $("#startBtn").onclick = () => { if (profile) { show("app"); return; } show("register"); $("#email").focus(); };
  $("#rankingTopBtn").onclick = () => { if (profile) { show("app"); go("ranking"); return; } show("register"); $("#emailMessage").textContent = "Entre com seu e-mail para ver o ranking."; };
  $("#emailForm").onsubmit = async e => {
    e.preventDefault();
    const email = $("#email").value.trim().toLowerCase(), msg = $("#emailMessage");
    const dom = CFG.DOMINIO_EMAIL;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg.textContent = "Digite um e-mail válido.";
    if (dom && !email.endsWith("@" + dom)) return msg.textContent = `Use seu e-mail @${dom}.`;
    if (!$("#consent").checked) return msg.textContent = "Marque a autorização de uso das fotos para continuar.";
    msg.textContent = ""; $("#sendCodeBtn").disabled = true;
    try { await API.login(email); await afterLogin(); }
    catch (er) { msg.textContent = er.message; }
    finally { $("#sendCodeBtn").disabled = false; }
  };
  $("#changeUser").onclick = async () => { await API.signOut(); profile = null; done = new Set(); doneEsq = new Set(); carSig = ""; posicionado = false; modo = null; $("#admin").classList.add("hidden"); show("welcome"); window.scrollTo({ top: 0 }); };
  $("#rulesBtn").onclick = () => $("#rulesDialog").showModal();
  $("#adminBtn").onclick = () => { $("#admin").classList.toggle("hidden"); if (!$("#admin").classList.contains("hidden")) { loadAdmin(); $("#admin").scrollIntoView({ behavior: "smooth" }); } };

  async function afterLogin() {
    profile = await API.profile();
    if (!profile) { await API.signOut(); show("register"); $("#emailMessage").textContent = "Não foi possível entrar com esse e-mail. Fale com o RH."; return; }
    $("#adminBtn").hidden = !profile.is_admin;
    show("app"); go("desafios");
    roster = await API.roster().catch(() => []);
    await refresh();
  }

  /* ---------- carrossel de desafios ---------- */
  let carSig = "", posicionado = false, pendente = null;
  const esqs = () => challenges.filter(c => c.kind === "esquenta").sort((a, b) => a.id - b.id);
  const principais = () => modo === "esquenta" ? esqs() : cards();
  const feitosSet = () => modo === "esquenta" ? doneEsq : done;
  const podeEnviar = c => c.kind === "esquenta" || aberto();
  const ordem = () => { if (modo === "esquenta") return esqs(); const rel = challenges.filter(c => c.kind === "relampago" && aberto()); return rel.concat(cards()); };
  function setModo(m, manual) {
    if (m === "esquenta" && !esqs().length) m = "festa";
    modo = m; carSig = ""; posicionado = false;
    $("#segEsq").setAttribute("aria-selected", String(m === "esquenta")); $("#segFesta").setAttribute("aria-selected", String(m === "festa"));
    $("#segEsq").hidden = !esqs().length;
    renderDesafios();
  }
  document.querySelectorAll("[data-modo]").forEach(b => b.onclick = () => setModo(b.dataset.modo, true));
  function setMural(m) { mural = m; feedSig = ""; $("#muralFesta").setAttribute("aria-selected", String(m === "festa")); $("#muralEsq").setAttribute("aria-selected", String(m === "esquenta")); renderFeed(); }
  document.querySelectorAll("[data-mural]").forEach(b => b.onclick = () => setMural(b.dataset.mural));
  function renderDesafios() {
    if (!modo) { setModo(ev && ev.status === "antes" && esqs().length ? "esquenta" : "festa"); return; }
    const lista = principais(), fs = feitosSet(), feitos = lista.filter(c => fs.has(c.id)).length;
    const pts = (board.find(b => profile && b.participant_id === profile.id) || {}).points || 0;
    if (modo === "esquenta") {
      $("#progressText").innerHTML = `<span class="esq-nota"><b>${feitos} de ${lista.length}</b> no mural · não vale pontos, vale movimento</span>`;
      $("#myPoints").parentElement.style.visibility = "hidden";
    } else {
      $("#progressText").textContent = `${feitos} de ${lista.length} desafios feitos`;
      $("#myPoints").parentElement.style.visibility = "";
    }
    $("#myPoints").textContent = pts;
    $("#progressBar").style.width = (lista.length ? feitos / lista.length * 100 : 0) + "%";
    $("#lightning").innerHTML = "";
    const itens = ordem();
    const sig = modo + itens.map(c => c.id + ":" + (fs.has(c.id) ? 1 : 0) + ":" + c.description).join("|") + aberto();
    if (sig !== carSig) {
      carSig = sig;
      const car = $("#carousel"), scroll = car.scrollLeft;
      car.innerHTML = itens.map(c => {
        const rel = c.kind === "relampago", esq = c.kind === "esquenta", feito = fs.has(c.id);
        return `<article class="card ${feito ? "feito" : ""} ${rel ? "rel-card" : ""} ${esq ? "esq" : ""}" data-id="${c.id}">
          <div class="top"><span>${rel ? "ATENÇÃO · RELÂMPAGO" : esq ? "ESQUENTA · ANTES DA FESTA" : esc(c.category)}</span><span class="pts">${esq ? "SEM PONTOS" : `+${c.points} PT${c.points > 1 ? "S" : ""}`}</span></div>
          <div class="num">${rel ? "R" : esq ? "ESQUENTA" : pad(c.id)}</div>
          <h3>${rel ? "Desafio Relâmpago" : esc(c.title)}</h3>
          <p class="tarefa">${esc(c.description)}</p>
          <span class="selo">✓ ${esq ? "NO MURAL" : "FEITO"} · pode enviar outra foto</span>
          <div class="acoes">${podeEnviar(c)
            ? `<button class="btn btn-go" data-cam="${c.id}">TIRAR FOTO</button><button class="btn btn-line gal" data-gal="${c.id}" aria-label="Escolher foto ou print da galeria">${esq ? "PRINT/GALERIA" : "GALERIA"}</button>`
            : `<button class="btn btn-go" disabled style="grid-column:1/-1">ENVIOS FECHADOS AGORA</button>`}</div>
        </article>`;
      }).join("");
      car.scrollLeft = scroll;
      car.querySelectorAll("[data-cam]").forEach(b => b.onclick = () => escolher(+b.dataset.cam, "#camInput"));
      car.querySelectorAll("[data-gal]").forEach(b => b.onclick = () => escolher(+b.dataset.gal, "#galInput"));
      $("#dots").innerHTML = itens.map(c => `<i class="${c.kind === "relampago" ? "rel" : fs.has(c.id) ? "feito" : ""}"></i>`).join("");
      if (!posicionado && itens.length) { posicionado = true; irPara(proximoAFazer(), false); }
      marcaAtual();
    }
  }
  const proximoAFazer = (depoisDe) => {
    const it = ordem(), cs = principais().filter(c => !feitosSet().has(c.id));
    const alvo = cs.find(c => depoisDe != null && c.id > depoisDe) || cs[0];
    const k = alvo ? it.findIndex(c => c.id === alvo.id) : 0; return k < 0 ? 0 : k;
  };
  function irPara(k, suave = true) { const card = $("#carousel").children[k]; if (card) $("#carousel").scrollTo({ left: card.offsetLeft - $("#carousel").firstElementChild.offsetLeft, behavior: suave ? "smooth" : "auto" }); setTimeout(marcaAtual, suave ? 400 : 0); }
  function idxAtual() { const car = $("#carousel"), kids = [...car.children]; if (!kids.length) return 0; const x = car.scrollLeft + kids[0].offsetLeft; let best = 0, d = 1e9; kids.forEach((k, i) => { const dd = Math.abs(k.offsetLeft - x); if (dd < d) { d = dd; best = i; } }); return best; }
  function marcaAtual() {
    const k = idxAtual(), it = ordem(), c = it[k];
    if (c) $("#carCount").textContent = c.kind === "relampago" ? "DESAFIO RELÂMPAGO" : c.kind === "esquenta" ? `ESQUENTA ${k + 1} DE ${esqs().length}` : `DESAFIO ${c.id} DE ${cards().length}`;
    [...$("#dots").children].forEach((d, i) => d.classList.toggle("on", i === k));
  }
  let tScroll; $("#carousel").addEventListener("scroll", () => { clearTimeout(tScroll); tScroll = setTimeout(marcaAtual, 60); }, { passive: true });
  $("#prevCard").onclick = () => irPara(Math.max(0, idxAtual() - 1));
  $("#nextCard").onclick = () => irPara(Math.min(ordem().length - 1, idxAtual() + 1));

  function renderStatus() {
    const b = $("#statusBanner");
    if (!ev || ev.status === "aberto") { b.classList.add("hidden"); return; }
    b.classList.remove("hidden");
    b.innerHTML = ev.status === "antes"
      ? `<b>A PONTUAÇÃO COMEÇA NA FESTA</b>Os desafios com pontos abrem às ${hora(ev.abre)} do dia ${dataBR(ev.starts_at)}, em ${esc(ev.cidade)}.${esqs().length ? " Até lá, participe do Esquenta!" : ""}`
      : `<b>ENVIOS ENCERRADOS</b>A festa de ${esc(ev.cidade)} terminou. Confira o ranking final.`;
  }

  /* ---------- foto e envio ---------- */
  let photoFile = null, tagged = new Set();
  function escolher(id, input) {
    const ch = challenges.find(c => c.id === id); if (ch && !podeEnviar(ch)) { toast("Os envios estão fechados agora.", true); return; }
    pendente = id; const el = $(input); el.value = ""; el.click();
  }
  ["#camInput", "#galInput"].forEach(sel => $(sel).addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f && pendente != null) abrirEnvio(pendente, f); }));
  function abrirEnvio(id, file) {
    current = challenges.find(c => c.id === id); if (!current) return;
    const c = current, rel = c.kind === "relampago";
    photoFile = file; tagged = new Set();
    $("#dialogContent").innerHTML = `
      <p class="kicker" style="color:${rel ? "var(--stop)" : "var(--muted)"}">${rel ? "DESAFIO RELÂMPAGO · +" + c.points + " PTS" : c.kind === "esquenta" ? "ESQUENTA · VAI PARA O MURAL" : "DESAFIO " + pad(c.id) + " · +" + c.points + " PT" + (c.points > 1 ? "S" : "")}</p>
      <h3>${rel ? "Relâmpago" : esc(c.title)}</h3>
      <img class="prev-photo" id="preview" alt="Sua foto">
      <button type="button" class="troca" id="trocaFoto">Trocar foto</button>
      <form id="submissionForm" novalidate>
        <details class="tag"><summary>Marcar quem mais está na foto <span class="count" id="tagCount">${c.kind === "esquenta" ? "(opcional)" : "(opcional: eles também pontuam)"}</span></summary>
          <input id="tagSearch" class="search" type="search" placeholder="Buscar pelo nome" autocomplete="off" aria-label="Buscar colega pelo nome"><div id="people" class="people"></div></details>
        <button class="btn btn-go" type="submit" id="submitBtn" style="width:100%">ENVIAR FOTO</button>
        <p id="submitMessage" class="msg-stop" role="alert" style="margin-top:12px"></p>
      </form>`;
    $("#preview").src = URL.createObjectURL(file);
    if (!$("#challengeDialog").open) $("#challengeDialog").showModal();
    $("#trocaFoto").onclick = () => escolher(id, "#galInput");
    $("#tagSearch").oninput = renderPeople;
    renderPeople();
    $("#submissionForm").onsubmit = submitChallenge;
  }
  function renderPeople() {
    const q = fold($("#tagSearch").value || ""), max = (ev && ev.max_marcados) || 15;
    const outros = roster.filter(r => r.id !== profile.id && (!q || fold(r.full_name).includes(q)));
    const lista = q ? outros : outros.filter(r => tagged.has(r.id)).concat(outros.filter(r => !tagged.has(r.id)));
    $("#people").innerHTML = lista.slice(0, 80).map(r => `<label><input type="checkbox" value="${esc(r.id)}" ${tagged.has(r.id) ? "checked" : ""}>${esc(r.full_name)}</label>`).join("") || `<label class="me">Ninguém encontrado.</label>`;
    $("#people").querySelectorAll("input[value]").forEach(i => i.onchange = () => {
      if (i.checked && tagged.size >= max) { i.checked = false; $("#submitMessage").textContent = `Máximo de ${max} colegas por foto.`; return; }
      i.checked ? tagged.add(i.value) : tagged.delete(i.value);
      $("#tagCount").textContent = tagged.size ? `· ${tagged.size} marcado${tagged.size > 1 ? "s" : ""}` : "(opcional: eles também pontuam)";
    });
  }
  async function submitChallenge(e) {
    e.preventDefault(); if (busy) return;
    const msg = $("#submitMessage");
    if (!photoFile || !/^image\//.test(photoFile.type)) return msg.textContent = "O arquivo precisa ser uma foto.";
    busy = true; $("#submitBtn").disabled = true; $("#submitBtn").textContent = "ENVIANDO…"; msg.textContent = "";
    try {
      const r = await API.submit(current.id, [...tagged], photoFile);
      $("#challengeDialog").close();
      await refresh();
      celebrate(r);
    } catch (er) { msg.textContent = er.message; $("#submitBtn").disabled = false; $("#submitBtn").textContent = "ENVIAR FOTO"; }
    finally { busy = false; }
  }
  function celebrate(r) {
    const o = $("#done"), esq = current && current.kind === "esquenta";
    const faltam = principais().filter(c => !feitosSet().has(c.id)).length;
    const col = !esq && r.colegas_pontuaram > 0 ? `${r.colegas_pontuaram} colega${r.colegas_pontuaram > 1 ? "s" : ""} também pontu${r.colegas_pontuaram > 1 ? "aram" : "ou"}.` : "";
    const topo = esq ? `<div class="plus">✓</div><h2>Você está no movimento!</h2><p>Sua foto já está no mural do Esquenta. Não vale pontos, mas já está movimentando a galera.</p>`
      : `<div class="plus">+${r.ganhou}</div><h2>${r.pontuou ? "Desafio concluído!" : "Foto enviada!"}</h2><p>Você tem ${r.pontos} ponto${r.pontos === 1 ? "" : "s"}${r.posicao ? ` e está em ${r.posicao}º lugar` : ""}. ${col}</p>`;
    o.innerHTML = `<div class="rush">${Array.from({ length: 7 }, (_, i) => `<i style="top:${12 + i * 12}%;animation-delay:${i * .05}s"></i>`).join("")}</div>
      <div class="box">${topo}
      ${faltam ? `<div class="next"><small>AINDA FALTAM</small><b>${faltam} ${esq ? "esquenta" + (faltam > 1 ? "s" : "") : "desafio" + (faltam > 1 ? "s" : "")}</b></div>` : `<div class="next"><small>${esq ? "ESQUENTA COMPLETO" : "TRILHA COMPLETA"}</small><b>${esq ? "Agora é esperar a festa!" : "Você fez todos os desafios!"}</b></div>`}
      <button class="btn btn-go" id="doneBtn">${faltam ? (esq ? "PRÓXIMO ESQUENTA" : "PRÓXIMO DESAFIO") : esq ? "VER MURAL" : "VER RANKING"}</button></div>`;
    o.classList.remove("hidden");
    $("#doneBtn").focus();
    $("#doneBtn").onclick = () => { o.classList.add("hidden"); if (faltam) { go("desafios"); irPara(proximoAFazer(current ? current.id : null)); } else if (esq) { go("fotos"); setMural("esquenta"); } else go("ranking"); };
  }

  /* ---------- ranking e fotos ---------- */
  function renderRanking() {
    const top = (ev && ev.top) || 10;
    const i = profile ? board.findIndex(b => b.participant_id === profile.id) : -1;
    const me = i >= 0 ? board[i] : null, corte = board[top - 1];
    $("#chipPts").textContent = me ? me.points : 0;
    $("#chipPos").textContent = me ? `${i + 1}º` : "—";
    const hint = !me ? `<span class="hint">Conclua o primeiro desafio para entrar no ranking.</span>` : i < top ? `<span class="hint go">Você está no top ${top}. Continue assim.</span>` : `<span class="hint">Faltam ${corte.points - me.points + 1} pontos para o top ${top}.</span>`;
    $("#rankMe").innerHTML = `<div><small>SUA POSIÇÃO${ev && ev.id !== "teste" ? " · " + esc(ev.cidade.toUpperCase()) : ""}</small><div class="big">${me ? i + 1 + "º" : "—"}</div></div><div style="text-align:right"><small>PONTOS</small><div class="big">${me ? me.points : 0}</div></div>${hint}`;
    const row = (p, k) => `<li class="${k < top ? "top" : ""} ${profile && p.participant_id === profile.id ? "eu" : ""}"><span class="pos">${k + 1}º</span><span>${esc(shortName(p.name))}</span><span class="pts">${p.points}</span></li>`;
    let html = board.slice(0, top).map(row).join("");
    if (i >= top) html += `<li class="cut">SUA POSIÇÃO</li>` + row(me, i);
    $("#rankingRows").innerHTML = html || `<li class="empty">Ninguém pontuou ainda.</li>`;
    $("#rankingNote").textContent = `Os ${top} primeiros ganham brinde. Empate: vence quem chegou primeiro à pontuação.`;
  }
  let feedSig = "";
  function renderFeed() {
    const dados = mural === "esquenta" ? feedEsq : feedData;
    const sig = mural + dados.map(f => f.submission_id).join("|"); if (sig === feedSig) return; feedSig = sig;
    $("#feed").innerHTML = dados.length ? dados.map(f => `<figure><div class="ph" style="background-image:url('${esc(f.url || API.url(f.photo_path) || "")}')"></div><figcaption><b>${f.category === "RELÂMPAGO" ? "Relâmpago" : f.category === "ESQUENTA" ? esc(f.title) : pad(f.challenge_id) + " · " + esc(f.title)}</b>${esc((f.names || []).slice(0, 3).join(", "))}${f.names && f.names.length > 3 ? ` +${f.names.length - 3}` : ""}</figcaption></figure>`).join("") : `<div class="empty">${mural === "esquenta" ? "As fotos do Esquenta aparecem aqui. Que tal ser a primeira?" : "As fotos da noite aparecem aqui."}</div>`;
  }

  /* ---------- área do RH ---------- */
  $("#adminReload").onclick = loadAdmin;
  $("#adminEvent").onchange = loadAdmin;
  async function loadAdmin() {
    const msg = $("#adminMessage"); msg.textContent = "Carregando…";
    try {
      const rel = await API.admin.lightningAll();
      $("#adminLightning").innerHTML = (rel || []).map(r => `<div class="al-row ${r.active ? "on" : ""}"><span>Relâmpago ${r.id - 100}${r.active ? " · NO AR" : ""}</span><button class="btn btn-small ${r.active ? "btn-stop" : "btn-line"}" data-light="${r.id}" data-on="${r.active ? 0 : 1}">${r.active ? "DESLIGAR" : "LIGAR"}</button><textarea data-id="${r.id}" rows="2" aria-label="Texto do relâmpago ${r.id - 100}">${esc(r.description)}</textarea></div>`).join("");
      $("#adminLightning").querySelectorAll("[data-light]").forEach(b => b.onclick = async () => { const id = +b.dataset.light; await API.admin.setLightning(id, b.dataset.on === "1", $(`#adminLightning textarea[data-id="${id}"]`).value); toast(b.dataset.on === "1" ? "Relâmpago no ar: já aparece no app e no telão." : "Relâmpago desligado."); await refresh(); loadAdmin(); });
      const list = await API.admin.list($("#adminEvent").value || (ev && ev.id));
      msg.textContent = `${list.length} envio(s)${list.length > 60 ? " · mostrando os 60 mais recentes (o CSV traz todos)" : ""}. "Invalidar" tira a foto do telão e retira os pontos.`;
      $("#adminList").innerHTML = list.slice(0, 60).map(s => `<div class="adm ${s.valid ? "" : "off"}"><div class="th" style="background-image:url('${esc(s.url || "")}')"></div><div><b>${s.challenge_id > 100 ? "Relâmpago" : pad(s.challenge_id)} · ${esc(s.title)}</b><span>${esc(s.pessoas)}</span><span>${hora(s.created_at)} · por ${esc(s.enviado_por)}</span></div><button class="btn btn-small ${s.valid ? "btn-line" : "btn-go"}" data-valid="${esc(s.id)}" data-v="${s.valid ? 0 : 1}">${s.valid ? "INVALIDAR" : "VALIDAR"}</button></div>`).join("");
      $("#adminList").querySelectorAll("[data-valid]").forEach(b => b.onclick = async () => { await API.admin.setValid(b.dataset.valid, b.dataset.v === "1"); await refresh(); loadAdmin(); });
    } catch (er) { msg.textContent = er.message; }
  }
  $("#exportBtn").onclick = async () => {
    try {
      const rows = await API.admin.export($("#adminEvent").value || (ev && ev.id));
      const cols = ["evento", "data_hora", "desafio", "titulo", "pontos", "participante", "email", "area", "enviado_por", "valida", "foto"];
      const csv = [cols.join(";")].concat(rows.map(r => cols.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(";"))).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = `movimentos-${$("#adminEvent").value || (ev && ev.id) || "evento"}.csv`; a.click(); URL.revokeObjectURL(a.href);
    } catch (er) { $("#adminMessage").textContent = er.message; }
  };

  /* ---------- atualização ---------- */
  async function refresh(silencioso) {
    try {
      [ev, challenges] = await Promise.all([API.event(EV_PARAM), API.challenges()]);
      $("#topN").textContent = (ev && ev.top) || 10;
      renderStatus();
      if (profile) {
        const evId = EV_PARAM || ev.id;
        const temEsq = challenges.some(c => c.kind === "esquenta");
        const [b, d, f, de, fe] = await Promise.all([API.leaderboard(evId), API.myChallenges(evId), API.feed(evId),
          temEsq ? API.myChallenges("esquenta") : [], API.feed("esquenta")]);
        board = b; done = new Set(d); feedData = f; doneEsq = new Set(de); feedEsq = fe;
        if (modo === "esquenta" && !temEsq) modo = null;
        renderDesafios();
        renderRanking(); renderFeed();
      }
    } catch (er) { console.error(er); }
  }

  async function init() {
    try { ev = await API.event(EV_PARAM); $("#topN").textContent = (ev && ev.top) || 10; } catch (e) { console.error(e); }
    API.onAuth(s => { if (!s && profile) { profile = null; show("welcome"); } });
    if (await API.session()) { await afterLogin().catch(() => show("welcome")); } else { show("welcome"); }
    setInterval(() => { if (!document.hidden && !busy && $("#done").classList.contains("hidden")) refresh(); }, (CFG.ATUALIZAR_A_CADA_SEG || 15) * 1000);
  }
  init();
})();
