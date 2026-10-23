/* Aulas da mentoria: módulos, aulas com vídeo do Google Drive (player embutido, sem mostrar o link) e PDF de apoio.
   Quem vê: só quem o Mauricio marcou. Quem cadastra e edita: só o master. */
(async function () {
  const eu = await protegerPagina(["cliente", "master", "suporte"]);
  if (!eu) return;
  const master = eu.papel === "master", equipe = eu.papel !== "cliente";
  if (!master) document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel] || "index.html";
  const $ = function (id) { return document.getElementById(id); };

  let temAcesso = equipe;
  if (!equipe) {
    const r = await supa().from("aulas_acesso").select("perfil_id").eq("perfil_id", eu.id).maybeSingle();
    temAcesso = !!(r && r.data);
  }
  if (!temAcesso) { $("semAcesso").hidden = false; return; }
  $("areaAulas").hidden = false;

  let modulos = [], aulas = [], atual = null;
  const aulasDe = function (m) { return aulas.filter(function (a) { return a.modulo_id === m; }).sort(function (a, b) { return a.ordem - b.ordem || (a.criado_em < b.criado_em ? -1 : 1); }); };

  async function carregar() {
    const [rm, ra] = await Promise.all([
      supa().from("aulas_modulos").select("id,titulo,descricao,ordem,ativo,criado_em").order("ordem", { ascending: true }),
      supa().from("aulas").select("id,modulo_id,titulo,descricao,drive_id,pdf_caminho,pdf_nome,ordem,ativo,criado_em").order("ordem", { ascending: true })
    ]);
    if (rm.error || ra.error) { aviso("Não foi possível carregar as aulas.", true); return; }
    modulos = (rm.data || []).slice().sort(function (a, b) { return a.ordem - b.ordem || (a.criado_em < b.criado_em ? -1 : 1); });
    aulas = ra.data || [];
  }

  /* ================= assistir ================= */
  function desenharNav() {
    const nav = $("aulasNav");
    nav.innerHTML = "";
    if (!modulos.length) { const p = document.createElement("p"); p.className = "vazio"; p.textContent = "Nenhuma aula publicada ainda."; nav.appendChild(p); return; }
    modulos.forEach(function (m) {
      const bloco = document.createElement("div"); bloco.className = "aulas-modulo";
      const h = document.createElement("h3"); h.textContent = m.titulo; if (!m.ativo) { const s = document.createElement("span"); s.className = "selo"; s.textContent = "rascunho"; h.appendChild(document.createTextNode(" ")); h.appendChild(s); }
      bloco.appendChild(h);
      if (m.descricao) { const d = document.createElement("p"); d.className = "ajuda"; d.textContent = m.descricao; bloco.appendChild(d); }
      aulasDe(m.id).forEach(function (a) {
        const b = document.createElement("button"); b.type = "button"; b.className = "aula-item" + (atual === a.id ? " ativa" : ""); b.dataset.aula = a.id;
        b.textContent = a.titulo; if (!a.ativo) { const s = document.createElement("span"); s.className = "selo"; s.textContent = "rascunho"; b.appendChild(document.createTextNode(" ")); b.appendChild(s); }
        b.addEventListener("click", function () { abrirAula(a.id); });
        bloco.appendChild(b);
      });
      nav.appendChild(bloco);
    });
  }
  function abrirAula(id) {
    const a = aulas.find(function (x) { return x.id === id; });
    if (!a) return;
    atual = id; desenharNav();
    const box = $("aulaConteudo"); box.innerHTML = "";
    if (a.drive_id && /^[A-Za-z0-9_-]{10,100}$/.test(a.drive_id)) {
      const caixa = document.createElement("div"); caixa.className = "player-caixa";
      const f = document.createElement("iframe");
      f.src = "https://drive.google.com/file/d/" + a.drive_id + "/preview";
      f.title = a.titulo; f.allow = "autoplay; fullscreen"; f.allowFullscreen = true;
      f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");   // sem pop-up: o botão de abrir em nova aba do Drive não funciona
      f.referrerPolicy = "no-referrer"; f.loading = "lazy";
      const bloqueio = document.createElement("div"); bloqueio.className = "player-bloqueio"; bloqueio.setAttribute("aria-hidden", "true");   // cobre o botão "abrir em nova janela" do Drive
      caixa.appendChild(f); caixa.appendChild(bloqueio);
      caixa.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      box.appendChild(caixa);
    } else { const p = document.createElement("p"); p.className = "vazio"; p.textContent = "Esta aula não tem vídeo."; box.appendChild(p); }
    const t = document.createElement("h2"); t.textContent = a.titulo; box.appendChild(t);
    if (a.descricao) { const d = document.createElement("div"); d.className = "aula-desc"; d.textContent = a.descricao; box.appendChild(d); }
    if (a.pdf_caminho) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn auto contorno"; b.id = "btnPdf"; b.textContent = "Baixar o material (PDF)";
      b.addEventListener("click", async function () {
        b.disabled = true;
        try {
          const { data, error } = await supa().storage.from("aulas").createSignedUrl(a.pdf_caminho, 120, { download: a.pdf_nome || "material.pdf" });
          if (error || !data) throw new Error("Não foi possível abrir o material agora.");
          window.open(data.signedUrl, "_blank", "noopener");
        } catch (e) { aviso(e.message, true); }
        finally { b.disabled = false; }
      });
      const w = document.createElement("div"); w.className = "acoes"; w.appendChild(b); box.appendChild(w);
    }
  }

  /* ================= gerenciar (master) ================= */
  const janelaM = $("janelaModulo"), janelaA = $("janelaAula");
  let editMod = null, editAula = null, moduloDaAula = null;

  function desenharGerMods() {
    const box = $("gerMods"); if (!box) return;
    box.innerHTML = "";
    if (!modulos.length) { const p = document.createElement("p"); p.className = "vazio"; p.textContent = "Nenhum módulo ainda. Clique em \"Novo módulo\"."; box.appendChild(p); return; }
    modulos.forEach(function (m, i) {
      const c = document.createElement("div"); c.className = "ger-modulo";
      const topo = document.createElement("div"); topo.className = "ger-topo";
      const h = document.createElement("h3"); h.textContent = m.titulo; if (!m.ativo) { const s = document.createElement("span"); s.className = "selo"; s.textContent = "rascunho"; h.appendChild(document.createTextNode(" ")); h.appendChild(s); }
      topo.appendChild(h);
      const acs = document.createElement("div"); acs.className = "ger-acoes";
      function bt(txt, cls, fn, label) { const b = document.createElement("button"); b.type = "button"; b.className = "btn peq " + cls; b.textContent = txt; if (label) b.setAttribute("aria-label", label); b.addEventListener("click", fn); acs.appendChild(b); return b; }
      bt("↑", "contorno", function () { mover("aulas_modulos", modulos, i, -1); }, "Subir módulo").disabled = i === 0;
      bt("↓", "contorno", function () { mover("aulas_modulos", modulos, i, 1); }, "Descer módulo").disabled = i === modulos.length - 1;
      bt("Editar módulo", "contorno", function () { abrirModulo(m); });
      bt("Nova aula", "", function () { abrirAulaForm(null, m.id); });
      bt("Excluir módulo", "perigo", function () { excluirModulo(m); });
      topo.appendChild(acs); c.appendChild(topo);
      const lista = aulasDe(m.id);
      if (!lista.length) { const p = document.createElement("p"); p.className = "vazio"; p.style.padding = "4px 0"; p.textContent = "Sem aulas neste módulo."; c.appendChild(p); }
      lista.forEach(function (a, j) {
        const l = document.createElement("div"); l.className = "ger-aula";
        const n = document.createElement("div"); n.className = "ger-aula-nome";
        const t = document.createElement("b"); t.textContent = a.titulo; n.appendChild(t);
        if (!a.ativo) { const s = document.createElement("span"); s.className = "selo"; s.textContent = "rascunho"; n.appendChild(document.createTextNode(" ")); n.appendChild(s); }
        const info = document.createElement("small"); info.textContent = (a.drive_id ? "com vídeo" : "sem vídeo") + " · " + (a.pdf_caminho ? "com PDF" : "sem PDF"); n.appendChild(document.createElement("br")); n.appendChild(info);
        l.appendChild(n);
        const as = document.createElement("div"); as.className = "ger-acoes";
        function b2(txt, cls, fn, label) { const b = document.createElement("button"); b.type = "button"; b.className = "btn peq " + cls; b.textContent = txt; if (label) b.setAttribute("aria-label", label); b.addEventListener("click", fn); as.appendChild(b); return b; }
        b2("↑", "contorno", function () { mover("aulas", lista, j, -1); }, "Subir aula").disabled = j === 0;
        b2("↓", "contorno", function () { mover("aulas", lista, j, 1); }, "Descer aula").disabled = j === lista.length - 1;
        b2("Editar", "contorno", function () { abrirAulaForm(a, m.id); });
        b2("Excluir", "perigo", function () { excluirAula(a); });
        l.appendChild(as); c.appendChild(l);
      });
      box.appendChild(c);
    });
  }
  async function mover(tabela, lista, i, d) {
    const a = lista[i], b = lista[i + d]; if (!a || !b) return;
    // reescreve a ordem de toda a lista, para nunca haver dois com o mesmo número
    const nova = lista.slice(); nova[i] = b; nova[i + d] = a;
    try {
      for (let k = 0; k < nova.length; k++) {
        if (nova[k].ordem !== k + 1) { const r = await supa().from(tabela).update({ ordem: k + 1 }).eq("id", nova[k].id); if (r.error) throw r.error; }
      }
      await recarregarTudo();
    } catch (e) { aviso("Não foi possível reordenar.", true); }
  }
  async function recarregarTudo() { await carregar(); desenharNav(); desenharGerMods(); }

  function abrirModulo(m) {
    editMod = m || null;
    $("modTitulo").textContent = m ? "Editar módulo" : "Novo módulo";
    $("mTitulo").value = m ? m.titulo : ""; $("mDesc").value = m ? (m.descricao || "") : ""; $("mAtivo").checked = m ? m.ativo : true;
    janelaM.showModal();
  }
  async function salvarModulo() {
    const titulo = $("mTitulo").value.trim();
    if (!titulo) { aviso("Escreva o título do módulo.", true); return; }
    const dados = { titulo: titulo, descricao: $("mDesc").value.trim() || null, ativo: $("mAtivo").checked };
    $("mSalvar").disabled = true;
    try {
      const r = editMod ? await supa().from("aulas_modulos").update(dados).eq("id", editMod.id)
                        : await supa().from("aulas_modulos").insert(Object.assign({ ordem: modulos.length + 1 }, dados));
      if (r.error) { aviso("Não foi possível salvar o módulo.", true); return; }
      janelaM.close(); aviso("Módulo salvo."); await recarregarTudo();
    } finally { $("mSalvar").disabled = false; }
  }
  async function excluirModulo(m) {
    const qtd = aulasDe(m.id).length;
    if (!confirm("Excluir o módulo \"" + m.titulo + "\" e as " + qtd + " aula(s) dele? Isso não tem volta.")) return;
    const caminhos = aulasDe(m.id).map(function (a) { return a.pdf_caminho; }).filter(Boolean);
    const r = await supa().from("aulas_modulos").delete().eq("id", m.id);
    if (r.error) { aviso("Não foi possível excluir.", true); return; }
    if (caminhos.length) { try { await supa().storage.from("aulas").remove(caminhos); } catch (e) {} }
    aviso("Módulo excluído."); await recarregarTudo();
  }

  function extrairDriveId(t) {
    t = (t || "").trim();
    if (!t) return null;
    const m = t.match(/\/d\/([A-Za-z0-9_-]{10,100})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,100})/) || (/^[A-Za-z0-9_-]{10,100}$/.test(t) ? [null, t] : null);
    return m ? m[1] : undefined;   // undefined = link inválido
  }
  function abrirAulaForm(a, moduloId) {
    editAula = a || null; moduloDaAula = moduloId;
    $("auTitulo").textContent = a ? "Editar aula" : "Nova aula";
    $("aTit").value = a ? a.titulo : ""; $("aDesc").value = a ? (a.descricao || "") : "";
    $("aLink").value = a && a.drive_id ? "https://drive.google.com/file/d/" + a.drive_id + "/view" : "";
    $("aPdf").value = ""; $("aPdfRemover").checked = false;
    $("aPdfAtual").textContent = a && a.pdf_caminho ? "PDF atual: " + (a.pdf_nome || "material.pdf") + ". Escolha outro arquivo para trocar." : "";
    $("aPdfRemoverBox").hidden = !(a && a.pdf_caminho);
    $("aAtivo").checked = a ? a.ativo : true;
    janelaA.showModal();
  }
  async function salvarAula() {
    const titulo = $("aTit").value.trim();
    if (!titulo) { aviso("Escreva o título da aula.", true); return; }
    const drive = extrairDriveId($("aLink").value);
    if (drive === undefined) { aviso("Esse link do Drive não parece válido. Cole o link de compartilhamento do arquivo (drive.google.com/file/d/...).", true); return; }
    const arq = $("aPdf").files[0];
    if (arq && (arq.type !== "application/pdf" || arq.size > 20 * 1024 * 1024)) { aviso("O PDF precisa ser um arquivo .pdf de até 20 MB.", true); return; }
    $("aSalvar").disabled = true;
    try {
      const dados = { titulo: titulo, descricao: $("aDesc").value.trim() || null, drive_id: drive, ativo: $("aAtivo").checked };
      let id = editAula ? editAula.id : null;
      if (editAula) { const r = await supa().from("aulas").update(dados).eq("id", id); if (r.error) throw r.error; }
      else {
        const ordem = aulasDe(moduloDaAula).length + 1;
        const r = await supa().from("aulas").insert(Object.assign({ modulo_id: moduloDaAula, ordem: ordem }, dados)).select("id").single();
        if (r.error) throw r.error; id = r.data.id;
      }
      const antigo = editAula && editAula.pdf_caminho ? editAula.pdf_caminho : null;
      if (arq) {
        const nomeSeguro = arq.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
        const caminho = id + "/" + Date.now() + "-" + nomeSeguro;
        const up = await supa().storage.from("aulas").upload(caminho, arq, { contentType: "application/pdf", upsert: false });
        if (up.error) throw up.error;
        const r2 = await supa().from("aulas").update({ pdf_caminho: caminho, pdf_nome: arq.name.slice(0, 200) }).eq("id", id);
        if (r2.error) throw r2.error;
        if (antigo) { try { await supa().storage.from("aulas").remove([antigo]); } catch (e) {} }
      } else if (antigo && $("aPdfRemover").checked) {
        const r3 = await supa().from("aulas").update({ pdf_caminho: null, pdf_nome: null }).eq("id", id);
        if (r3.error) throw r3.error;
        try { await supa().storage.from("aulas").remove([antigo]); } catch (e) {}
      }
      janelaA.close(); aviso("Aula salva."); await recarregarTudo();
    } catch (e) { aviso("Não foi possível salvar a aula. Tente de novo.", true); }
    finally { $("aSalvar").disabled = false; }
  }
  async function excluirAula(a) {
    if (!confirm("Excluir a aula \"" + a.titulo + "\"? Isso não tem volta.")) return;
    const r = await supa().from("aulas").delete().eq("id", a.id);
    if (r.error) { aviso("Não foi possível excluir.", true); return; }
    if (a.pdf_caminho) { try { await supa().storage.from("aulas").remove([a.pdf_caminho]); } catch (e) {} }
    if (atual === a.id) { atual = null; $("aulaConteudo").innerHTML = '<p class="vazio">Escolha uma aula ao lado.</p>'; }
    aviso("Aula excluída."); await recarregarTudo();
  }

  /* ---------- quem recebe as aulas ---------- */
  let clientes = [];
  async function carregarAcessos() {
    try { const r = await supa().rpc("aulas_acesso_lista"); clientes = r.data || []; } catch (e) { clientes = []; }
    desenharAcessos();
  }
  function desenharAcessos() {
    const tb = $("acLista"); if (!tb) return;
    const f = ($("acBusca").value || "").toLowerCase().trim();
    const lista = clientes.filter(function (c) { return !f || c.nome.toLowerCase().indexOf(f) > -1; });
    tb.innerHTML = "";
    if (!lista.length) { tb.innerHTML = '<tr><td colspan="2" class="vazio">Nenhuma pessoa encontrada.</td></tr>'; return; }
    lista.forEach(function (c) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td"); const b = document.createElement("b"); b.textContent = c.nome; td1.appendChild(b);
      if (c.tem_mentoria) { const s = document.createElement("span"); s.className = "selo ouro"; s.textContent = "Mentoria"; td1.appendChild(document.createTextNode(" ")); td1.appendChild(s); }
      const td2 = document.createElement("td"); const lab = document.createElement("label"); lab.className = "chk-linha";
      const ck = document.createElement("input"); ck.type = "checkbox"; ck.checked = !!c.tem_aulas; ck.setAttribute("aria-label", "Vê as aulas: " + c.nome);
      ck.addEventListener("change", async function () {
        try {
          const r = await supa().rpc("aulas_acesso_definir", { p_perfil: c.id, p_incluir: ck.checked });
          if (r.error || !r.data || !r.data.ok) throw new Error("Não foi possível salvar.");
          c.tem_aulas = ck.checked; aviso(ck.checked ? c.nome.split(" ")[0] + " recebeu as aulas." : c.nome.split(" ")[0] + " deixou de ver as aulas.");
        } catch (e) { ck.checked = !ck.checked; aviso(e.message, true); }
      });
      lab.appendChild(ck); td2.appendChild(lab); tr.appendChild(td1); tr.appendChild(td2); tb.appendChild(tr);
    });
  }

  /* ================= partida ================= */
  await carregar();
  desenharNav();
  const primeira = modulos.map(function (m) { return aulasDe(m.id).find(function (a) { return a.ativo || master; }); }).find(Boolean);
  if (primeira) abrirAula(primeira.id);
  ligarAbas($("abas"), function (aba) { if (aba === "gerenciar") { desenharGerMods(); carregarAcessos(); } });
  if (master) {
    $("novoModulo").addEventListener("click", function () { abrirModulo(null); });
    $("mSalvar").addEventListener("click", salvarModulo); $("mCancelar").addEventListener("click", function () { janelaM.close(); });
    $("aSalvar").addEventListener("click", salvarAula); $("aCancelar").addEventListener("click", function () { janelaA.close(); });
    $("acBusca").addEventListener("input", desenharAcessos);
  }
})();
