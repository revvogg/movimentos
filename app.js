(() => {
  const $ = s => document.querySelector(s);
  const API = window.MovApi;
  const CFG = window.MOVIMENTOS_CONFIG || {};
  const EV_PARAM = new URLSearchParams(location.search).get("evento") || null;
  const COR = { "AQUECENDO": "#ffd400", "EM MOVIMENTO": "#ff6500", "INDO ALÉM": "#00bdf2", "RELÂMPAGO": "#ffffff" };
  const DIAS = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
  let ev = null, challenges = [], profile = null, roster = [], board = [], done = new Set(), feedData = [], current = null, carouselTimer = null, emailPend = "", busy = false;

  const pad = n => String(n).padStart(2, "0");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tz = { timeZone: "America/Sao_Paulo" };
  const hora = d => new Date(d).toLocaleTimeString("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" });
  const dataBR = d => new Date(d).toLocaleDateString("pt-BR", { ...tz, day: "2-digit", month: "2-digit" }).replace("/", ".");
  const first = n => String(n || "").split(" ")[0];
  const shortName = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[0] + " " + p[p.length - 1] : p[0]; };
  const cor = c => COR[c.category] || "#ffd400";
  function toast(msg, ms = 3200) { const t = $("#toast"); t.innerHTML = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), ms); }
  function show(id) { ["welcome", "register", "app"].forEach(x => $("#" + x).classList.toggle("hidden", x !== id)); }

  if (API.demo) { const b = document.createElement("div"); b.className = "demo-badge"; b.textContent = "MODO DEMONSTRAÇÃO"; document.body.appendChild(b); }

  /* ---------- evento ---------- */
  function renderEvent() {
    if (!ev) return;
    const teste = ev.id === "teste";
    const b = $("#statusBanner");
    if (ev.status === "aberto") { b.classList.add("hidden"); }
    else {
      b.classList.remove("hidden");
      b.innerHTML = ev.status === "antes"
        ? `<b>OS ENVIOS AINDA NÃO ABRIRAM</b>Eles abrem às ${hora(ev.abre)} de ${DIAS[new Date(ev.starts_at).getDay()].toLowerCase()}, ${dataBR(ev.starts_at)}, no evento de ${esc(ev.cidade)} (${esc(ev.local || "")}).`
        : `<b>ENVIOS ENCERRADOS</b>O evento de ${esc(ev.cidade)} terminou. Confira o ranking final abaixo!`;
    }
    $("#rankingNote").textContent = `Os ${ev.top || 10} primeiros da noite ganham um brinde surpresa. Desempate: quem chegou primeiro à pontuação.`;
  }

  /* ---------- login por código ---------- */
  $("#startBtn").onclick = async () => { if (await API.session() && profile) { show("app"); return; } show("register"); $("#register").scrollIntoView({ behavior: "smooth" }); };
  $("#rankingTopBtn").onclick = () => $("#ranking").scrollIntoView({ behavior: "smooth" });
  $("#emailForm").onsubmit = async e => {
    e.preventDefault();
    const email = $("#email").value.trim().toLowerCase(), msg = $("#emailMessage");
    const dom = CFG.DOMINIO_EMAIL;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg.textContent = "Digite um e-mail válido.";
    if (dom && !email.endsWith("@" + dom)) return msg.textContent = `Use seu e-mail @${dom}.`;
    if (!$("#consent").checked) return msg.textContent = "Para participar, confirme a autorização de uso das fotos.";
    msg.textContent = "Verificando cadastro…"; $("#sendCodeBtn").disabled = true;
    try { await API.login(email); msg.textContent = ""; await afterLogin(); }
    catch (er) { msg.textContent = er.message; }
    finally { $("#sendCodeBtn").disabled = false; }
  };
  $("#changeUser").onclick = async () => { await API.signOut(); profile = null; board = []; $("#rankingRows").innerHTML = '<div class="empty-state">Entre na experiência para começar a movimentar o ranking.</div>'; $("#admin").classList.add("hidden"); show("register"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function afterLogin() {
    profile = await API.profile();
    if (!profile) { await API.signOut(); show("register"); $("#emailMessage").textContent = "Seu e-mail não está na lista de colaboradores. Fale com o RH."; return; }
    $("#userFirstName").textContent = first(profile.full_name);
    $("#admin").classList.toggle("hidden", !profile.is_admin);
    show("app");
    $("#app").scrollIntoView({ behavior: "smooth" });
    roster = await API.roster().catch(() => []);
    await refresh();
  }

  /* ---------- desafios ---------- */
  function renderChallenges() {
    const cards = challenges.slice().sort((a, b) => (a.kind === "relampago" ? -1 : 0) - (b.kind === "relampago" ? -1 : 0) || a.id - b.id);
    $("#challengeGrid").innerHTML = cards.map(c => {
      const d = done.has(c.id), rel = c.kind === "relampago";
      return `<article class="challenge-card ${d ? "done" : ""}" style="--accent:${cor(c)}"><div class="challenge-meta"><span>● ${esc(c.category)}</span><span class="points">+${c.points} PT${c.points > 1 ? "S" : ""}</span></div><div class="challenge-number">${rel ? "⚡" : pad(c.id)}</div><h3>${rel ? "Desafio Relâmpago" : esc(c.title)}</h3><p>${esc(c.description)}</p><button data-challenge="${c.id}" ${d ? "disabled" : ""}>${d ? "✓ DESAFIO CONCLUÍDO" : "FAZER DESAFIO ↗"}</button></article>`;
    }).join("");
    $("#challengeGrid").querySelectorAll("[data-challenge]").forEach(b => b.addEventListener("click", () => openChallenge(+b.dataset.challenge)));
    const rel = challenges.find(c => c.kind === "relampago");
    $("#lightning").innerHTML = rel && ev && ev.status === "aberto" ? `<button class="lightning-banner" id="lightBtn"><span class="lb-kicker">⚡ DESAFIO RELÂMPAGO · VALE AGORA</span><span class="lb-text">${esc(rel.description)}</span><span class="points">+${rel.points} PTS</span></button>` : "";
    const lb = $("#lightBtn"); if (lb) lb.onclick = () => openChallenge(rel.id);
  }
  function startCarousel() {
    const track = $("#challengeGrid"); clearInterval(carouselTimer);
    carouselTimer = setInterval(() => {
      if (document.hidden || $("#challengeDialog").open || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const max = track.scrollWidth - track.clientWidth; if (max <= 8) return;
      if (track.scrollLeft >= max - 12) track.scrollTo({ left: 0, behavior: "smooth" }); else track.scrollBy({ left: 262, behavior: "smooth" });
    }, 5200);
  }
  $("#challengePrev").onclick = () => $("#challengeGrid").scrollBy({ left: -262, behavior: "smooth" });
  $("#challengeNext").onclick = () => $("#challengeGrid").scrollBy({ left: 262, behavior: "smooth" });
  ["pointerdown", "mouseenter", "focusin"].forEach(t => $("#challengeGrid").addEventListener(t, () => clearInterval(carouselTimer)));
  ["mouseleave"].forEach(t => $("#challengeGrid").addEventListener(t, startCarousel));

  /* ---------- envio ---------- */
  let photoFile = null, tagged = new Set();
  function openChallenge(id) {
    current = challenges.find(c => c.id === id); if (!current) return;
    const c = current, rel = c.kind === "relampago", aberto = ev && ev.status === "aberto";
    photoFile = null; tagged = new Set();
    $("#dialogContent").innerHTML = `<div class="dialog-category" style="color:${cor(c)}">${esc(c.category)} / +${c.points} PONTO${c.points > 1 ? "S" : ""}</div><div class="dialog-number" style="color:${cor(c)}">${rel ? "⚡" : pad(c.id)}</div><h2>${rel ? "Desafio Relâmpago" : esc(c.title)}</h2><p class="dialog-desc">${esc(c.description)}</p>` +
      (aberto ? `<form id="submissionForm" class="dialog-form" novalidate><label>Envie a foto que comprova o desafio<input type="file" id="photo" accept="image/*" capture="environment" required></label><label>Quem aparece na foto? <span class="muted">(selecione todos os colaboradores)</span></label><input id="tagSearch" class="tag-search" type="search" placeholder="Buscar pelo nome…" autocomplete="off"><div id="participants" class="participant-list"></div><button class="btn btn-primary" type="submit" id="submitBtn">ENVIAR E CONQUISTAR PONTOS ↗</button><p id="submitMessage" class="form-message"></p></form>`
        : `<p class="dialog-desc"><b>${ev && ev.status === "antes" ? `Os envios abrem às ${hora(ev.abre)} do dia ${dataBR(ev.starts_at)}.` : "Os envios deste evento foram encerrados."}</b></p>`);
    $("#challengeDialog").showModal();
    if (!aberto) return;
    $("#photo").onchange = e => { photoFile = e.target.files[0] || null; };
    $("#tagSearch").oninput = renderTags;
    renderTags();
    $("#submissionForm").onsubmit = submitChallenge;
  }
  function renderTags() {
    const fold = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = fold($("#tagSearch").value || "");
    const max = (ev && ev.max_marcados) || 15;
    const outros = roster.filter(r => r.id !== profile.id && (!q || fold(r.full_name).includes(q)));
    const lista = q ? outros : outros.filter(r => tagged.has(r.id)).concat(outros.filter(r => !tagged.has(r.id)));
    $("#participants").innerHTML = `<label><input type="checkbox" checked disabled>${esc(profile.full_name)} (você)</label>` + lista.map(r => `<label><input type="checkbox" value="${esc(r.id)}" ${tagged.has(r.id) ? "checked" : ""}>${esc(r.full_name)}</label>`).join("");
    $("#participants").querySelectorAll("input[value]").forEach(i => i.onchange = () => { if (i.checked && tagged.size >= max) { i.checked = false; $("#submitMessage").textContent = `Selecione no máximo ${max} colegas por foto.`; return; } i.checked ? tagged.add(i.value) : tagged.delete(i.value); });
  }
  async function submitChallenge(e) {
    e.preventDefault(); if (busy) return;
    const msg = $("#submitMessage");
    if (!photoFile) return msg.textContent = "Selecione uma foto.";
    if (!/^image\//.test(photoFile.type)) return msg.textContent = "O arquivo precisa ser uma imagem.";
    busy = true; $("#submitBtn").disabled = true; msg.textContent = "Registrando participação…";
    try {
      const r = await API.submit(current.id, [...tagged], photoFile);
      $("#challengeDialog").close();
      const col = r.colegas_pontuaram > 0 ? `<br>${r.colegas_pontuaram} colega${r.colegas_pontuaram > 1 ? "s" : ""} também pontu${r.colegas_pontuaram > 1 ? "aram" : "ou"}.` : "";
      toast(r.pontuou ? `MOVIMENTO REGISTRADO! +${r.ganhou} PONTO${r.ganhou > 1 ? "S" : ""}${col}` : `FOTO ENVIADA!${col}`, 4200);
      await refresh();
    } catch (er) { msg.textContent = er.message; }
    finally { busy = false; const b = $("#submitBtn"); if (b) b.disabled = false; }
  }

  /* ---------- feed, ranking, placar ---------- */
  let feedSig = "";
  function renderFeed() {
    const sig = feedData.map(f => f.submission_id).join("|"); if (sig === feedSig) return; feedSig = sig;
    if (!feedData.length) { $("#feed").innerHTML = `<div class="empty-state">As fotos aparecem aqui assim que alguém enviar. Que tal ser o primeiro movimento?</div>`; return; }
    $("#feed").innerHTML = `<div class="feed-track">${feedData.map(f => `
      <figure class="feed-item" style="--accent:${COR[f.category] || "#ffd400"}"><div class="feed-photo" style="background-image:url('${esc(f.url || API.url(f.photo_path) || "")}')"></div>
      <figcaption><span class="feed-num">${f.category === "RELÂMPAGO" ? "⚡" : pad(f.challenge_id)}</span><div><b>${esc(f.title)}</b><span>${esc((f.names || []).slice(0, 4).join(", "))}${f.names && f.names.length > 4 ? ` +${f.names.length - 4}` : ""}</span></div></figcaption></figure>`).join("")}</div>`;
  }
  function renderBoard() {
    const top = (ev && ev.top) || 10;
    const meIdx = profile ? board.findIndex(b => b.participant_id === profile.id) : -1;
    const me = meIdx >= 0 ? board[meIdx] : null;
    $("#myPoints").textContent = me ? me.points : 0;
    $("#myChallenges").textContent = done.size;
    $("#myPosition").textContent = me ? `#${meIdx + 1}` : "—";
    const row = (p, i) => `<div class="ranking-row"><div class="rank-name"><span class="rank-num">${pad(i + 1)}</span><span>${esc(p.name)}</span></div><strong class="rank-row-points">${p.points} PTS</strong></div>`;
    let html = board.slice(0, top).map(row).join("");
    if (meIdx >= top) html += row(me, meIdx);
    $("#rankingRows").innerHTML = html || '<div class="empty-state">Ainda não há participações registradas. Seja o primeiro movimento!</div>';
  }

  /* ---------- área do RH ---------- */
  $("#adminToggle").onclick = () => { $("#adminPanel").classList.toggle("hidden"); if (!$("#adminPanel").classList.contains("hidden")) loadAdmin(); };
  $("#adminReload").onclick = loadAdmin;
  $("#adminEvent").onchange = loadAdmin;
  async function loadAdmin() {
    const msg = $("#adminMessage"); msg.textContent = "Carregando…";
    try {
      const rel = await API.admin.lightningAll();
      $("#adminLightning").innerHTML = (rel || []).map(r => `<div class="al-row ${r.active ? "on" : ""}"><span class="al-n">⚡ ${r.id - 100}</span><textarea data-id="${r.id}" rows="2">${esc(r.description)}</textarea><button class="btn btn-small ${r.active ? "btn-ghost" : "btn-primary"}" data-light="${r.id}" data-on="${r.active ? 0 : 1}">${r.active ? "DESLIGAR" : "LIGAR"}</button></div>`).join("");
      $("#adminLightning").querySelectorAll("[data-light]").forEach(b => b.onclick = async () => { const id = +b.dataset.light; const desc = $(`#adminLightning textarea[data-id="${id}"]`).value; await API.admin.setLightning(id, b.dataset.on === "1", desc); toast(b.dataset.on === "1" ? "RELÂMPAGO LIGADO! Já aparece no app e no telão." : "Relâmpago desligado."); await refresh(); loadAdmin(); });
      const list = await API.admin.list($("#adminEvent").value || (ev && ev.id));
      msg.textContent = `${list.length} envio(s)${list.length > 60 ? " (mostrando os 60 mais recentes; o CSV traz todos)" : ""}. Toque em "invalidar" para tirar a foto do telão e retirar os pontos.`;
      $("#adminList").innerHTML = list.slice(0, 60).map(s => `<div class="adm-item ${s.valid ? "" : "invalid"}"><div class="adm-thumb" style="background-image:url('${esc(s.url || "")}')"></div><div class="adm-info"><b>${s.challenge_id > 100 ? "⚡" : pad(s.challenge_id)} · ${esc(s.title)}</b><span>${esc(s.pessoas)}</span><small>${hora(s.created_at)} · enviado por ${esc(s.enviado_por)}</small></div><button class="btn btn-ghost btn-small" data-valid="${esc(s.id)}" data-v="${s.valid ? 0 : 1}">${s.valid ? "INVALIDAR" : "VALIDAR"}</button></div>`).join("");
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
  async function refresh() {
    try {
      [ev, challenges] = await Promise.all([API.event(EV_PARAM), API.challenges()]);
      renderEvent();
      if (profile) {
        const [b, d, f] = await Promise.all([API.leaderboard(EV_PARAM || ev.id), API.myChallenges(EV_PARAM || ev.id), API.feed(EV_PARAM || ev.id)]);
        board = b; done = new Set(d); feedData = f;
        renderBoard(); renderFeed();
      }
      renderChallenges();
    } catch (er) { console.error(er); }
  }

  async function init() {
    try { ev = await API.event(EV_PARAM); renderEvent(); } catch (e) { console.error(e); }
    API.onAuth(s => { if (!s && profile) { profile = null; show("welcome"); } });
    if (await API.session()) { await afterLogin().catch(() => show("welcome")); } else { show("welcome"); await refresh(); }
    startCarousel();
    setInterval(() => { if (!document.hidden && !busy) refresh(); }, (CFG.ATUALIZAR_A_CADA_SEG || 15) * 1000);
  }
  init();
})();
