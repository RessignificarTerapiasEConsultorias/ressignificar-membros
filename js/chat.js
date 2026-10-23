/* Chat da Área de Membros: sala geral, grupo ao vivo da mentoria e conversa individual com o Mauricio.
   Tudo passa por funções seguras do banco (chat_*): ninguém vê e-mail, telefone ou sobrenome de ninguém.
   Mensagens são desenhadas como TEXTO (textContent), nunca como HTML. */
(async function () {
  const eu = await protegerPagina(["cliente", "master", "suporte"]);
  if (!eu) return;
  const equipe = eu.papel !== "cliente", master = eu.papel === "master";
  if (!master) document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel] || "index.html";
  const $ = function (id) { return document.getElementById(id); };
  const hora = function (iso) { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
  const vistoDe = function (id) { try { return localStorage.getItem("chat_visto_" + eu.id + "_" + id) || ""; } catch (e) { return ""; } };
  const vistoSet = function (id, v) { try { localStorage.setItem("chat_visto_" + eu.id + "_" + id, v); } catch (e) {} };

  async function rpc(nome, args) {
    let r;
    try { r = await supa().rpc(nome, args || {}); } catch (e) { throw new Error("Sem conexão. Verifique a internet e tente de novo."); }
    if (r.error) throw new Error("Não foi possível concluir. Tente de novo em instantes.");
    return r.data;
  }

  /* ================= conversa (lista de mensagens + caixa de texto) ================= */
  function montarCaixa(raiz, placeholder) {
    raiz.innerHTML = '<div class="chat-caixa"><div class="chat-lista" aria-live="polite"></div>' +
      '<form class="chat-form"><textarea rows="1" maxlength="1000" aria-label="Mensagem"></textarea><button class="btn auto" type="submit">Enviar</button></form></div>' +
      '<p class="ajuda chat-aviso" hidden></p>';
    raiz.querySelector("textarea").placeholder = placeholder;
  }
  /* cfg: ler(desde) -> {ok, agora, mensagens, apagadas}; enviar(texto) -> {ok, erro}; apagar(id)|null; normalizar(m) -> {id,quando,nome,equipe,minha,texto}; textoVazio */
  function criarConversa(raiz, cfg) {
    const lista = raiz.querySelector(".chat-lista"), form = raiz.querySelector("form");
    const area = form.querySelector("textarea"), botao = form.querySelector("button"), aviso1 = raiz.querySelector(".chat-aviso");
    const elementos = new Map();
    let cursor = null, timer = null, ocupado = false;

    function vazio() {
      const v = lista.querySelector(".chat-vazio");
      if (!elementos.size && !v) { const p = document.createElement("p"); p.className = "chat-vazio"; p.textContent = cfg.textoVazio; lista.appendChild(p); }
      if (elementos.size && v) v.remove();
    }
    function desenhar(bruta) {
      const m = cfg.normalizar(bruta);
      const d = document.createElement("div");
      d.className = "chat-msg" + (m.minha ? " minha" : ""); d.dataset.id = m.id;
      const q = document.createElement("div"); q.className = "quem";
      const nome = document.createElement("span"); nome.textContent = m.minha ? "Você" : m.nome; q.appendChild(nome);
      if (m.equipe && !m.minha) { const t = document.createElement("span"); t.className = "equipe"; t.textContent = "equipe"; q.appendChild(t); }
      if (m.ajuda) { const t = document.createElement("span"); t.className = "ajuda-tag"; t.textContent = "Pedido de ajuda"; q.appendChild(t); }
      const h = document.createElement("span"); h.className = "hora"; h.textContent = hora(m.quando); q.appendChild(h);
      if (cfg.apagar) {
        const x = document.createElement("button"); x.type = "button"; x.className = "apagar"; x.title = "Apagar mensagem"; x.setAttribute("aria-label", "Apagar mensagem"); x.textContent = "×";
        x.addEventListener("click", async function () {
          if (!confirm(cfg.textoApagar || "Apagar esta mensagem para todos?")) return;
          try { const r = await cfg.apagar(m.id); if (r && r.ok) remover(m.id); else aviso("Não foi possível apagar.", true); } catch (e) { aviso(e.message, true); }
        });
        q.appendChild(x);
      }
      const t = document.createElement("div"); t.className = "texto"; t.textContent = m.texto;
      d.appendChild(q); d.appendChild(t);
      return d;
    }
    function remover(id) { const e = elementos.get(id); if (e) { e.remove(); elementos.delete(id); vazio(); } }
    function rolar() { lista.scrollTop = lista.scrollHeight; }

    async function sondar(forcarRolar) {
      if (ocupado) return;
      ocupado = true;
      try {
        const desde = cursor ? new Date(new Date(cursor).getTime() - 5000).toISOString() : null;   // pequena sobreposição, sem duplicar
        const j = await cfg.ler(desde);
        if (!j || !j.ok) return;
        cursor = j.agora;
        (j.apagadas || []).forEach(remover);
        const perto = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 140;
        let novas = 0;
        (j.mensagens || []).forEach(function (bruta) {
          if (elementos.has(bruta.id)) return;
          const el = desenhar(bruta); elementos.set(bruta.id, el); lista.appendChild(el); novas++;
        });
        vazio();
        if (novas && (perto || forcarRolar || novas === elementos.size)) rolar();
        if (novas && cfg.aoChegar) cfg.aoChegar(novas);
      } catch (e) { /* sem rede por um instante: tenta de novo no próximo ciclo */ }
      finally { ocupado = false; }
    }
    function iniciar() { parar(); vazio(); sondar(true); timer = setInterval(function () { if (!document.hidden) sondar(false); }, 3000); }
    function parar() { if (timer) clearInterval(timer); timer = null; }
    function limite(permitido, motivo) {
      area.disabled = !permitido; botao.disabled = !permitido;
      aviso1.hidden = permitido; aviso1.textContent = permitido ? "" : motivo;
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const txt = area.value.trim();
      if (!txt) return;
      botao.disabled = true;
      try {
        const r = await cfg.enviar(txt);
        if (r && r.ok) { area.value = ""; area.style.height = ""; await sondar(true); }
        else aviso((r && r.erro) || "Não foi possível enviar agora.", true);
      } catch (err) { aviso(err.message, true); }
      botao.disabled = area.disabled; area.focus();
    });
    area.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    area.addEventListener("input", function () { area.style.height = "auto"; area.style.height = Math.min(area.scrollHeight, 120) + "px"; });
    return { iniciar: iniciar, parar: parar, limite: limite, sondar: sondar };
  }

  const dadosSala = {
    ler: function (id) { return function (desde) { return rpc("chat_ler", { p_sala: id, p_desde: desde, p_limite: 80 }); }; },
    enviar: function (id) { return function (t) { return rpc("chat_enviar", { p_sala: id, p_texto: t }); }; },
    normalizar: function (m) { return { id: m.id, quando: m.quando, nome: m.nome, equipe: m.equipe, minha: m.minha, texto: m.texto }; }
  };

  /* ================= estado e abas ================= */
  let salas = [], abaAtiva = null, naoLidasPriv = 0, conversas = {}, convResumo = [];
  const salaDe = function (tipo) { return salas.find(function (s) { return s.tipo === tipo; }); };

  function listaAbas() {
    const a = [];
    if (salaDe("geral")) a.push({ id: "geral", rotulo: "Sala geral" });
    if (!equipe) a.push({ id: "privado", rotulo: "Conversa com o Mauricio" });
    if (master) a.push({ id: "conversas", rotulo: "Conversas individuais" });
    if (salaDe("mentoria")) a.push({ id: "mentoria", rotulo: "Grupo ao vivo da mentoria" });
    if (equipe) a.push({ id: "gerenciar", rotulo: "Gerenciar" });
    return a;
  }
  function temNovo(id) {
    if (id === abaAtiva) return false;
    if (id === "privado" || id === "conversas") return naoLidasPriv > 0;
    const s = salaDe(id);
    return !!(s && s.ultima && s.ultima > vistoDe(s.id));
  }
  function desenharAbas() {
    const el = $("abas");
    el.innerHTML = "";
    listaAbas().forEach(function (a) {
      const b = document.createElement("button");
      b.className = "aba"; b.type = "button"; b.dataset.aba = a.id; b.setAttribute("aria-selected", a.id === abaAtiva ? "true" : "false");
      b.textContent = a.rotulo;
      if (temNovo(a.id)) { const p = document.createElement("span"); p.className = "ponto"; p.setAttribute("aria-label", "mensagens novas"); b.appendChild(p); }
      b.addEventListener("click", function () { abrirAba(a.id); });
      el.appendChild(b);
    });
  }
  function marcarVista(tipo) { const s = salaDe(tipo); if (s && s.ultima) vistoSet(s.id, s.ultima); }

  async function atualizarSalas() {
    try {
      salas = (await rpc("chat_salas_minhas")) || [];
      try { naoLidasPriv = Number(await rpc("chat_privado_nao_lidas")) || 0; } catch (e) {}
      if (master) { try { convResumo = (await rpc("chat_privado_resumo")) || []; desenharConversas(); } catch (e) {} }
      atualizarBanner(); aplicarLimites();
      if (abaAtiva === "geral" || abaAtiva === "mentoria") marcarVista(abaAtiva);
      desenharAbas();
    } catch (e) { /* mantém o que já está na tela */ }
  }
  function atualizarBanner() {
    const s = salaDe("mentoria"), box = $("aoVivo");
    if (!s || !s.link_chamada || !/^https:\/\//.test(s.link_chamada)) { box.hidden = true; return; }
    box.hidden = false;
    $("aoVivoTitulo").textContent = s.titulo_ao_vivo ? " · " + s.titulo_ao_vivo : "";
    $("aoVivoLink").href = s.link_chamada;
  }
  function aplicarLimites() {
    ["geral", "mentoria"].forEach(function (tipo) {
      const c = conversas[tipo], s = salaDe(tipo);
      if (!c || !s) return;
      if (!equipe && s.silenciado) c.limite(false, "Você não pode enviar mensagens agora.");
      else if (!s.aberta && !equipe) c.limite(false, "A sala está fechada no momento. Você ainda pode ler as mensagens.");
      else c.limite(true, "");
    });
  }

  function garantirSala(tipo, boxId, placeholder, texto) {
    if (conversas[tipo]) return;
    const s = salaDe(tipo); if (!s) return;
    montarCaixa($(boxId), placeholder);
    conversas[tipo] = criarConversa($(boxId), {
      ler: dadosSala.ler(s.id), enviar: dadosSala.enviar(s.id), normalizar: dadosSala.normalizar, textoVazio: texto,
      apagar: master ? function (id) { return rpc("chat_apagar", { p_msg: id }); } : null,
      textoApagar: "Apagar esta mensagem para todos? Ela some da sala, mas continua guardada até você excluir de vez em Gerenciar.",
      aoChegar: function () { if (abaAtiva === tipo) { marcarVista(tipo); desenharAbas(); } }
    });
    aplicarLimites();
  }
  function garantirPrivado() {
    if (conversas.privado) return;
    montarCaixa($("boxPrivado"), "Escreva para o Mauricio...");
    conversas.privado = criarConversa($("boxPrivado"), {
      ler: function (desde) { return rpc("chat_privado_ler", { p_cliente: null, p_desde: desde }); },
      enviar: function (t) { return rpc("chat_privado_enviar", { p_texto: t, p_cliente: null }); },
      normalizar: function (m) { return { id: m.id, quando: m.quando, nome: m.de_equipe ? "Mauricio" : "Você", equipe: false, minha: m.minha, texto: m.texto, ajuda: m.tipo === "ajuda" }; },
      textoVazio: "Nenhuma mensagem ainda. Escreva abaixo e o Mauricio responde por aqui.",
      aoChegar: function () { rpc("chat_privado_nao_lidas").then(function (n) { naoLidasPriv = Number(n) || 0; desenharAbas(); }).catch(function () {}); }
    });
  }

  function abrirAba(id) {
    Object.keys(conversas).forEach(function (k) { conversas[k].parar(); });
    abaAtiva = id;
    ["geral", "privado", "conversas", "mentoria", "gerenciar"].forEach(function (k) { const p = $("p-" + k); if (p) p.hidden = k !== id; });
    if (id === "geral") { garantirSala("geral", "boxGeral", "Escreva para todos...", "Ninguém escreveu ainda. Seja a primeira pessoa a dizer oi!"); conversas.geral && conversas.geral.iniciar(); marcarVista("geral"); }
    if (id === "mentoria") { garantirSala("mentoria", "boxMentoria", "Escreva sua dúvida para o grupo...", "Nenhuma mensagem ainda. Aqui você tira dúvidas com o grupo da mentoria."); conversas.mentoria && conversas.mentoria.iniciar(); marcarVista("mentoria"); }
    if (id === "privado") { garantirPrivado(); conversas.privado.iniciar(); }
    if (id === "conversas") { atualizarSalas(); if (conversas.thread) conversas.thread.iniciar(); }
    if (id === "gerenciar") carregarGerenciar();
    aplicarLimites(); desenharAbas();
  }

  /* ================= master: conversas individuais ================= */
  let threadAberta = null;
  function desenharConversas() {
    const el = $("convLista");
    if (!el) return;
    el.innerHTML = "";
    if (!convResumo.length) { const p = document.createElement("p"); p.className = "vazio"; p.textContent = "Nenhuma conversa ainda."; el.appendChild(p); return; }
    convResumo.forEach(function (c) {
      const b = document.createElement("button"); b.type = "button"; b.className = "chat-conv" + (threadAberta === c.cliente_id ? " ativa" : "");
      const n = document.createElement("b"); n.textContent = c.nome; b.appendChild(n);
      if (c.nao_lidas > 0) { const s = document.createElement("span"); s.className = "selo ouro"; s.textContent = c.nao_lidas; b.appendChild(s); }
      if (c.ajudas_nao_lidas > 0) { const a = document.createElement("span"); a.className = "ajuda-tag"; a.textContent = "Pedido de ajuda"; n.appendChild(document.createTextNode(" ")); n.appendChild(a); }
      const p = document.createElement("small"); p.textContent = c.previa || ""; b.appendChild(p);
      b.addEventListener("click", function () { abrirThread(c.cliente_id, c.nome); });
      el.appendChild(b);
    });
  }
  function abrirThread(clienteId, nome) {
    if (conversas.thread) conversas.thread.parar();
    threadAberta = clienteId;
    const box = $("convThread");
    box.innerHTML = '<div class="thread-topo"><h3></h3><button class="btn peq perigo" type="button" id="excluirConversa">Excluir conversa</button></div><div id="boxThread"></div>';
    box.querySelector("h3").textContent = nome;
    $("excluirConversa").addEventListener("click", async function () {
      if (!confirm("Excluir TODA a conversa com " + nome + "? Isso não tem volta.")) return;
      try {
        const r = await rpc("chat_privado_excluir_conversa", { p_cliente: clienteId });
        if (!r || !r.ok) throw new Error("Não foi possível excluir.");
        if (conversas.thread) conversas.thread.parar();
        threadAberta = null; box.innerHTML = '<p class="vazio">Conversa excluída. Escolha outra ao lado.</p>';
        aviso("Conversa excluída."); atualizarSalas();
      } catch (e) { aviso(e.message, true); }
    });
    montarCaixa($("boxThread"), "Responder " + nome.split(" ")[0] + "...");
    conversas.thread = criarConversa($("boxThread"), {
      ler: function (desde) { return rpc("chat_privado_ler", { p_cliente: clienteId, p_desde: desde }); },
      enviar: function (t) { return rpc("chat_privado_enviar", { p_texto: t, p_cliente: clienteId }); },
      normalizar: function (m) { return { id: m.id, quando: m.quando, nome: m.de_equipe ? "Você" : nome.split(" ")[0], equipe: false, minha: m.minha, texto: m.texto, ajuda: m.tipo === "ajuda" }; },
      apagar: function (id) { return rpc("chat_privado_apagar", { p_msg: id }); },
      textoApagar: "Excluir esta mensagem da conversa? Isso não tem volta.",
      textoVazio: "Nenhuma mensagem ainda. Escreva abaixo para começar.",
      aoChegar: function () { atualizarSalas(); }
    });
    conversas.thread.iniciar();
    setTimeout(atualizarSalas, 800);
    desenharConversas();
  }
  async function prepararNovaConversa() {
    if (!master) return;
    try {
      const lista = (await rpc("chat_grupo_lista")) || [];
      const sel = $("novaConv");
      lista.forEach(function (c) { const o = document.createElement("option"); o.value = c.id; o.textContent = c.nome; sel.appendChild(o); });
      sel.addEventListener("change", function () { if (sel.value) { abrirThread(sel.value, sel.options[sel.selectedIndex].textContent); sel.value = ""; } });
    } catch (e) {}
  }

  /* ================= gerenciar ================= */
  let clientes = [];
  async function carregarGerenciar() {
    const m = salaDe("mentoria"), g = salaDe("geral");
    if (master) {
      $("gTitulo").value = (m && m.titulo_ao_vivo) || ""; $("gLink").value = (m && m.link_chamada) || "";
      $("gAbertaM").checked = !m || m.aberta; $("gAbertaG").checked = !g || g.aberta;
    }
    try { clientes = (await rpc("chat_grupo_lista")) || []; } catch (e) { aviso(e.message, true); }
    desenharClientes();
    if (master) atualizarApagadas();
  }
  function desenharClientes() {
    const tb = $("gLista"), f = ($("gBusca").value || "").toLowerCase().trim();
    const lista = clientes.filter(function (c) { return !f || c.nome.toLowerCase().indexOf(f) > -1; });
    tb.innerHTML = "";
    if (!lista.length) { tb.innerHTML = '<tr><td colspan="3" class="vazio">Nenhuma pessoa encontrada.</td></tr>'; return; }
    lista.forEach(function (c) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td"); const b = document.createElement("b"); b.textContent = c.nome; td1.appendChild(b);
      if (c.tem_mentoria) { const s = document.createElement("span"); s.className = "selo ouro"; s.textContent = "Mentoria"; td1.appendChild(document.createTextNode(" ")); td1.appendChild(s); }
      const td2 = document.createElement("td"); const lab = document.createElement("label"); lab.className = "chk-linha";
      const ck = document.createElement("input"); ck.type = "checkbox"; ck.checked = !!c.em_grupo; ck.setAttribute("aria-label", "No grupo: " + c.nome);
      ck.addEventListener("change", async function () {
        try { const r = await rpc("chat_grupo_definir", { p_perfil: c.id, p_incluir: ck.checked }); if (!r || !r.ok) throw new Error("Não foi possível salvar."); c.em_grupo = ck.checked; aviso(ck.checked ? c.nome.split(" ")[0] + " entrou no grupo." : c.nome.split(" ")[0] + " saiu do grupo."); }
        catch (e) { ck.checked = !ck.checked; aviso(e.message, true); }
      });
      lab.appendChild(ck); td2.appendChild(lab);
      tr.appendChild(td1); tr.appendChild(td2);
      if (master) {
        const td3 = document.createElement("td"); td3.className = "so-master";
        const bt = document.createElement("button"); bt.type = "button"; bt.className = "btn peq contorno"; bt.textContent = c.silenciado ? "Liberar" : "Silenciar";
        bt.addEventListener("click", async function () {
          try { const r = await rpc("chat_silenciar", { p_perfil: c.id, p_silenciar: !c.silenciado }); if (!r || !r.ok) throw new Error("Não foi possível salvar."); c.silenciado = !c.silenciado; bt.textContent = c.silenciado ? "Liberar" : "Silenciar"; aviso(c.silenciado ? "Silenciada(o) na sala." : "Liberada(o) na sala."); }
          catch (e) { aviso(e.message, true); }
        });
        td3.appendChild(bt); tr.appendChild(td3);
      }
      tb.appendChild(tr);
    });
  }
  async function atualizarApagadas() {
    try {
      const n = Number(await rpc("chat_apagadas_contar")) || 0;
      $("apagadasInfo").textContent = n ? n + (n === 1 ? " mensagem apagada continua guardada." : " mensagens apagadas continuam guardadas.") : "Nenhuma mensagem apagada guardada.";
      $("apagadasExcluir").disabled = !n;
    } catch (e) {}
  }
  if (master) $("apagadasExcluir").addEventListener("click", async function () {
    if (!confirm("Excluir de vez todas as mensagens apagadas das salas? Isso não tem volta.")) return;
    try { const r = await rpc("chat_apagadas_excluir_de_vez"); if (!r || !r.ok) throw new Error("Não foi possível excluir."); aviso(r.excluidas + (r.excluidas === 1 ? " mensagem excluída." : " mensagens excluídas.")); atualizarApagadas(); }
    catch (e) { aviso(e.message, true); }
  });
  $("gBusca").addEventListener("input", desenharClientes);
  if (master) {
    async function salvarSalas(limparLink) {
      const m = salaDe("mentoria"), g = salaDe("geral");
      const link = limparLink ? "" : $("gLink").value.trim();
      if (link && !/^https:\/\//.test(link)) { aviso("O link precisa começar com https://", true); return; }
      try {
        const r1 = await rpc("chat_sala_configurar", { p_sala: m.id, p_link: link, p_titulo: limparLink ? "" : $("gTitulo").value, p_aberta: $("gAbertaM").checked });
        if (!r1 || !r1.ok) throw new Error((r1 && r1.erro) || "Não foi possível salvar.");
        const r2 = await rpc("chat_sala_configurar", { p_sala: g.id, p_link: null, p_titulo: null, p_aberta: $("gAbertaG").checked });
        if (!r2 || !r2.ok) throw new Error((r2 && r2.erro) || "Não foi possível salvar.");
        if (limparLink) { $("gLink").value = ""; $("gTitulo").value = ""; }
        aviso(limparLink ? "Link removido." : "Salvo."); await atualizarSalas();
      } catch (e) { aviso(e.message, true); }
    }
    $("gSalvar").addEventListener("click", function () { salvarSalas(false); });
    $("gLimpar").addEventListener("click", function () { salvarSalas(true); });
  }

  /* ================= partida ================= */
  await atualizarSalas();
  prepararNovaConversa();
  const abas = listaAbas();
  if (!abas.length) { $("abas").innerHTML = ""; const p = document.createElement("p"); p.className = "vazio"; p.textContent = "O chat não está disponível para o seu acesso."; $("p-geral").hidden = false; $("p-geral").appendChild(p); return; }
  const pedida = new URLSearchParams(location.search).get("aba");
  abrirAba(abas.some(function (a) { return a.id === pedida; }) ? pedida : abas[0].id);
  setInterval(function () { if (!document.hidden) atualizarSalas(); }, 15000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) atualizarSalas(); });
})();
