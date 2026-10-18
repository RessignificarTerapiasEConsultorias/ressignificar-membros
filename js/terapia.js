/* Processo terapêutico: visão geral, áreas da vida e ações, sessões, testes e anamnese. */
(async function () {
  const eu = await protegerPagina(["master", "cliente"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  const master = eu.papel === "master";
  if (!master) document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });

  function falha(msg) { document.getElementById("falhaMsg").textContent = msg; document.getElementById("falha").hidden = false; }

  /* ---------- de quem é este processo ---------- */
  let pessoa = eu;
  if (master) {
    const pid = new URLSearchParams(location.search).get("p");
    if (!pid) return falha("Escolha a pessoa no painel, na lista de pessoas, botão \"Terapia\".");
    const r = await supa().from("perfis").select("id,nome,email,papel").eq("id", pid).maybeSingle();
    if (!r.data) return falha("Pessoa não encontrada.");
    pessoa = r.data;
  }
  const pid = pessoa.id;
  const primeiroNome = pessoa.nome.split(" ")[0];
  document.getElementById("titulo").textContent = master ? "Terapia: " + pessoa.nome : "Seu processo terapêutico";
  document.getElementById("subtitulo").textContent = master ? pessoa.email : "Acompanhe as suas áreas, ações, sessões e testes.";
  document.getElementById("textoSigilo").textContent = master
    ? "Sigiloso: só você e " + primeiroNome + " acessam. A equipe de suporte não vê nada desta página. As notas privadas das sessões só você vê."
    : "Tudo o que está aqui é sigiloso: só você e o Mauricio têm acesso.";
  document.getElementById("areaTerapia").hidden = false;

  const STATUS = { a_fazer: "A fazer", em_andamento: "Em andamento", feito: "Feito", cancelado: "Cancelado" };
  const SUGESTOES = ["Financeira", "Amorosa", "Família", "Amizades", "Estudos", "Carreira", "Saúde física", "Saúde emocional", "Autoestima", "Espiritualidade", "Lazer", "Propósito"];
  const CAMPOS = [
    ["queixa", "O que te trouxe até aqui? O que mais incomoda hoje?"],
    ["objetivos", "O que você espera alcançar com o processo?"],
    ["historico", "Momentos marcantes da sua história (perdas, mudanças, fases difíceis)"],
    ["familia", "Família e relacionamentos"],
    ["trabalho", "Trabalho e finanças"],
    ["saude", "Saúde: doenças, acompanhamento médico, psicológico ou psiquiátrico"],
    ["medicacao", "Medicações em uso"],
    ["sono", "Como está o seu sono?"],
    ["rotina", "Alimentação, atividade física e rotina"],
    ["tentativas", "O que você já tentou antes para resolver?"],
    ["observacoes", "Algo mais que você queira contar"]
  ];
  let areas = [], avaliacoes = [], acoes = [], sessoes = [], notas = {}, testes = [], graficos = {}, abaAtual = "geral";
  const hoje = hojeISO();

  /* ---------- carregar ---------- */
  async function carregar() {
    const [ra, rv, rc, rs, rt] = await Promise.all([
      supa().from("areas_vida").select("id,nome,meta,ordem,ativo").eq("perfil_id", pid).order("ordem").order("criado_em"),
      supa().from("areas_avaliacoes").select("id,area_id,data,nota,comentario").eq("perfil_id", pid).order("data"),
      supa().from("acoes").select("id,area_id,titulo,plano,responsavel,prazo,status,comentario_cliente,concluida_em").eq("perfil_id", pid).eq("contexto", "terapia").order("prazo", { ascending: true, nullsFirst: false }),
      supa().from("terapia_sessoes").select("id,data,duracao_min,tema,resumo_cliente,tarefa,humor_antes,humor_depois").eq("perfil_id", pid).order("data", { ascending: false }),
      supa().from("testes_resultados").select("id,teste,data,pontuacao,menor_melhor,dimensoes,observacao").eq("perfil_id", pid).order("data")
    ]);
    areas = (ra.data || []).filter(function (a) { return a.ativo; });
    avaliacoes = rv.data || []; acoes = rc.data || []; sessoes = rs.data || []; testes = rt.data || [];
    notas = {};
    if (master && sessoes.length) {
      const rn = await supa().from("terapia_notas_privadas").select("sessao_id,texto").in("sessao_id", sessoes.map(function (s) { return s.id; }));
      (rn.data || []).forEach(function (n) { notas[n.sessao_id] = n.texto; });
    }
  }

  /* ---------- utilidades ---------- */
  const atrasada = function (a) { return a.prazo && a.prazo < hoje && (a.status === "a_fazer" || a.status === "em_andamento"); };
  const avalDe = function (areaId) { return avaliacoes.filter(function (v) { return v.area_id === areaId; }); };
  const ultimaNota = function (areaId) { const l = avalDe(areaId); return l.length ? l[l.length - 1].nota : null; };
  const primeiraNota = function (areaId) { const l = avalDe(areaId); return l.length ? l[0].nota : null; };
  function grafico(id, cfg) {
    if (typeof Chart === "undefined") return;
    if (graficos[id]) graficos[id].destroy();
    const el = document.getElementById(id);
    if (el) graficos[id] = new Chart(el, cfg);
  }
  if (typeof Chart !== "undefined") { Chart.defaults.font.family = "Figtree, system-ui, sans-serif"; Chart.defaults.color = "#4C5670"; }

  function htmlAcao(a, comArea) {
    const area = areas.find(function (x) { return x.id === a.area_id; });
    const cls = a.status === "feito" ? " feita" : (atrasada(a) ? " atrasada" : "");
    const info = [];
    if (comArea && area) info.push(esc(area.nome));
    if (a.responsavel) info.push("Responsável: " + esc(a.responsavel));
    if (a.prazo) info.push((atrasada(a) ? "⚠ Atrasada desde " : "Prazo: ") + dataBR(a.prazo));
    if (a.status === "feito" && a.concluida_em) info.push("Concluída em " + dataBR(a.concluida_em));
    return '<li class="acao' + cls + '">' +
      '<div class="acao-linha"><b>' + esc(a.titulo) + "</b>" +
      '<select data-status="' + a.id + '" aria-label="Situação da ação">' +
      Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (a.status === k ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("") +
      "</select></div>" +
      (a.plano ? '<div style="font-size:14.5px">' + esc(a.plano) + "</div>" : "") +
      '<div class="acao-info">' + info.join(" · ") + "</div>" +
      (master && !comArea ? '<div><button class="btn peq perigo" type="button" data-apagar-acao="' + a.id + '">Apagar ação</button></div>' : "") +
      "</li>";
  }

  /* ================= VISÃO GERAL ================= */
  function desenharGeral() {
    const ativas = acoes.filter(function (a) { return a.status !== "cancelado"; });
    const feitas = ativas.filter(function (a) { return a.status === "feito"; }).length;
    const atrasadas = ativas.filter(atrasada).length;
    const comNota = areas.filter(function (a) { return ultimaNota(a.id) !== null; });
    const media = function (f) { return comNota.length ? comNota.reduce(function (s, a) { return s + f(a.id); }, 0) / comNota.length : null; };
    const mAgora = media(ultimaNota), mInicio = media(primeiraNota);
    const cards = [
      ["Sessões realizadas", String(sessoes.length), sessoes.length ? "última em " + dataBR(sessoes[0].data) : "nenhuma ainda"],
      ["Ações concluídas", feitas + " de " + ativas.length, ativas.length ? pct(feitas / ativas.length) + " concluídas" : "nenhuma ação definida"],
      ["Ações atrasadas", '<span class="' + (atrasadas ? "desce" : "sobe") + '">' + atrasadas + "</span>", atrasadas ? "vale retomar na próxima sessão" : "tudo em dia"],
      ["Média das áreas", mAgora === null ? "–" : mAgora.toFixed(1).replace(".", ","), mAgora === null ? "registre as notas das áreas" :
        (mAgora - mInicio === 0 ? "igual ao início" : '<span class="' + (mAgora > mInicio ? "sobe" : "desce") + '">' + (mAgora > mInicio ? "▲ " : "▼ ") + Math.abs(mAgora - mInicio).toFixed(1).replace(".", ",") + "</span> desde o início")]
    ];
    document.getElementById("kpis").innerHTML = cards.map(function (c) { return '<div class="kpi"><small>' + c[0] + "</small><b>" + c[1] + "</b><span>" + c[2] + "</span></div>"; }).join("");

    const pend = acoes.filter(function (a) { return a.status === "a_fazer" || a.status === "em_andamento"; })
      .sort(function (a, b) { return (a.prazo || "9999") < (b.prazo || "9999") ? -1 : 1; }).slice(0, 6);
    document.getElementById("proximas").innerHTML = pend.length ? pend.map(function (a) { return htmlAcao(a, true); }).join("") : '<li class="vazio">Nenhuma ação pendente.</li>';

    const u = sessoes[0];
    document.getElementById("cartaoUltima").innerHTML = u
      ? "<h2>Última sessão: " + dataBR(u.data) + "</h2>" + (u.tema ? '<span class="rotulo">Tema</span><p>' + esc(u.tema) + "</p>" : "") +
        (u.tarefa ? '<span class="rotulo">Tarefa até a próxima sessão</span><p style="white-space:pre-wrap">' + esc(u.tarefa) + "</p>" : "")
      : "<h2>Sessões</h2><p class=\"vazio\">Nenhuma sessão registrada ainda.</p>";

    if (abaAtual === "geral") desenharRoda();
  }
  function desenharRoda() {
    const comNota = areas.filter(function (a) { return ultimaNota(a.id) !== null; });
    if (comNota.length < 3) {
      if (graficos.gRoda) { graficos.gRoda.destroy(); delete graficos.gRoda; }
      const c = document.getElementById("gRoda");
      const ctx = c && c.getContext && c.getContext("2d");
      if (ctx) { ctx.clearRect(0, 0, c.width, c.height); ctx.font = "15px Figtree, sans-serif"; ctx.fillStyle = "#4C5670"; ctx.fillText("Registre a nota de pelo menos 3 áreas para ver a roda.", 10, 30); }
      return;
    }
    grafico("gRoda", { type: "radar", data: { labels: comNota.map(function (a) { return a.nome; }), datasets: [
      { label: "Início", data: comNota.map(function (a) { return primeiraNota(a.id); }), borderColor: "#C9742F", backgroundColor: "rgba(201,116,47,.12)", pointRadius: 3 },
      { label: "Agora", data: comNota.map(function (a) { return ultimaNota(a.id); }), borderColor: "#0B1F3A", backgroundColor: "rgba(201,162,74,.28)", pointRadius: 3 }] },
      options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 10, ticks: { stepSize: 2, backdropColor: "transparent" } } } } });
  }

  /* ================= ÁREAS E AÇÕES ================= */
  function desenharChipsAreas() {
    const box = document.getElementById("chipsAreas");
    if (!box) return;
    const existentes = areas.map(function (a) { return a.nome.toLowerCase(); });
    const livres = SUGESTOES.filter(function (s) { return existentes.indexOf(s.toLowerCase()) === -1; });
    box.innerHTML = livres.length ? '<span class="vazio" style="padding:4px 0">Sugestões:</span>' + livres.map(function (s) { return '<button type="button" data-sug="' + esc(s) + '">+ ' + esc(s) + "</button>"; }).join("") : "";
    document.getElementById("sugestoesAreas").innerHTML = livres.map(function (s) { return '<option value="' + esc(s) + '">'; }).join("");
  }
  function desenharAreas() {
    desenharChipsAreas();
    const box = document.getElementById("listaAreas");
    if (!areas.length) {
      box.innerHTML = '<div class="cartao"><p class="vazio">' + (master ? "Nenhuma área definida ainda. Adicione acima as áreas que " + esc(primeiroNome) + " escolheu trabalhar." : "As áreas de trabalho serão definidas com o Mauricio nas sessões.") + "</p></div>";
      return;
    }
    box.innerHTML = areas.map(function (a) {
      const n = ultimaNota(a.id), n0 = primeiraNota(a.id);
      const lista = acoes.filter(function (x) { return x.area_id === a.id; });
      return '<div class="area-card">' +
        '<div class="area-topo"><div><h3>' + esc(a.nome) + "</h3>" + (a.meta ? '<div class="area-meta">Meta: ' + esc(a.meta) + "</div>" : "") + "</div>" +
        '<div class="nota-grande">' + (n === null ? "–" : n) + "<small>" + (n === null ? "sem nota" : (n0 !== null && n !== n0 ? (n > n0 ? "▲ " : "▼ ") + Math.abs(n - n0) + " desde o início" : "nota atual")) + "</small></div></div>" +
        '<div class="graf baixo"><canvas id="ga-' + a.id + '"></canvas></div>' +
        '<form class="f mini-form" data-nota="' + a.id + '" novalidate>' +
        '<div><label>Data</label><input type="date" name="data" value="' + hoje + '" required></div>' +
        '<div><label>Nota</label><select name="nota">' + [0,1,2,3,4,5,6,7,8,9,10].map(function (v) { return '<option value="' + v + '"' + (v === (n === null ? 5 : n) ? " selected" : "") + ">" + v + "</option>"; }).join("") + "</select></div>" +
        '<div><label>Comentário (opcional)</label><input name="comentario" maxlength="140"></div>' +
        '<div><button class="btn peq" type="submit">Registrar nota</button></div></form>' +
        '<span class="rotulo">Ações</span>' +
        '<ul class="acoes-lista">' + (lista.length ? lista.map(function (x) { return htmlAcao(x, false); }).join("") : '<li class="vazio">Nenhuma ação nesta área ainda.</li>') + "</ul>" +
        (master ? '<details><summary class="btn peq contorno" style="list-style:none">+ Nova ação</summary>' +
          '<form class="f" data-nova-acao="' + a.id + '" style="margin-top:10px" novalidate>' +
          '<div style="margin-bottom:8px"><label>O que fazer</label><input name="titulo" maxlength="140" required></div>' +
          '<div style="margin-bottom:8px"><label>Plano (como fazer)</label><textarea name="plano" rows="2"></textarea></div>' +
          '<div class="grade g2"><div><label>Quem faz</label><input name="responsavel" maxlength="60" value="' + esc(primeiroNome) + '"></div>' +
          '<div><label>Prazo</label><input type="date" name="prazo"></div></div>' +
          '<div class="acoes"><button class="btn peq" type="submit">Salvar ação</button></div></form></details>' +
          '<div><button class="btn peq perigo" type="button" data-apagar-area="' + a.id + '">Remover área</button></div>' : "") +
        "</div>";
    }).join("");
    if (abaAtual === "areas") desenharGraficosAreas();
  }
  function desenharGraficosAreas() {
    areas.forEach(function (a) {
      const l = avalDe(a.id);
      grafico("ga-" + a.id, { type: "line", data: { labels: l.map(function (v) { return dataBR(v.data).slice(0, 5); }),
        datasets: [{ data: l.map(function (v) { return v.nota; }), borderColor: "#0B1F3A", backgroundColor: "rgba(201,162,74,.2)", fill: true, tension: .3, pointBackgroundColor: "#C9A24A", pointRadius: 4 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function (c) { return l[c.dataIndex].comentario || ""; } } } },
          scales: { y: { min: 0, max: 10, ticks: { stepSize: 2 } } } } });
    });
  }

  const formArea = document.getElementById("formArea");
  if (formArea) {
    async function criarArea(nome, meta) {
      if (nome.length < 2) { aviso("Escreva o nome da área.", true); return; }
      const { error } = await supa().from("areas_vida").insert({ perfil_id: pid, nome: nome, meta: meta || null, ordem: areas.length + 1 });
      if (error) { aviso("Não foi possível adicionar a área.", true); return; }
      aviso("Área adicionada.");
      await carregar(); desenharTudo();
    }
    formArea.addEventListener("submit", async function (e) {
      e.preventDefault();
      await criarArea(document.getElementById("aNome").value.trim(), document.getElementById("aMeta").value.trim());
      formArea.reset();
    });
    document.getElementById("chipsAreas").addEventListener("click", function (e) {
      const b = e.target.closest("[data-sug]");
      if (b) criarArea(b.dataset.sug, "");
    });
  }

  document.getElementById("areaTerapia").addEventListener("submit", async function (e) {
    const fn = e.target.closest("[data-nota]");
    const fa = e.target.closest("[data-nova-acao]");
    if (fn) {
      e.preventDefault();
      const { error } = await supa().from("areas_avaliacoes").insert({ area_id: fn.dataset.nota, perfil_id: pid, data: fn.data.value, nota: +fn.nota.value, comentario: fn.comentario.value.trim() || null });
      if (error) { aviso("Não foi possível registrar a nota.", true); return; }
      aviso("Nota registrada.");
      await carregar(); desenharTudo();
    }
    if (fa) {
      e.preventDefault();
      const titulo = fa.titulo.value.trim();
      if (titulo.length < 2) { aviso("Escreva o que deve ser feito.", true); return; }
      const { error } = await supa().from("acoes").insert({ perfil_id: pid, contexto: "terapia", area_id: fa.dataset.novaAcao, titulo: titulo, plano: fa.plano.value.trim() || null,
        responsavel: fa.responsavel.value.trim() || null, prazo: fa.prazo.value || null });
      if (error) { aviso("Não foi possível salvar a ação.", true); return; }
      aviso("Ação criada.");
      await carregar(); desenharTudo();
    }
  });
  document.getElementById("areaTerapia").addEventListener("change", async function (e) {
    const s = e.target.closest("[data-status]");
    if (!s) return;
    const { error } = await supa().from("acoes").update({ status: s.value }).eq("id", s.dataset.status);
    if (error) { aviso("Não foi possível atualizar a ação.", true); return; }
    aviso(s.value === "feito" ? "Ação concluída. Parabéns!" : "Situação atualizada.");
    await carregar(); desenharTudo();
  });
  document.getElementById("areaTerapia").addEventListener("click", async function (e) {
    const ba = e.target.closest("[data-apagar-acao]"), bar = e.target.closest("[data-apagar-area]");
    if (ba && confirm("Apagar esta ação?")) {
      const { error } = await supa().from("acoes").delete().eq("id", ba.dataset.apagarAcao);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      await carregar(); desenharTudo();
    }
    if (bar) {
      const a = areas.find(function (x) { return x.id === bar.dataset.apagarArea; });
      if (!a || !confirm("Remover a área \"" + a.nome + "\"? As notas e o histórico continuam guardados.")) return;
      const { error } = await supa().from("areas_vida").update({ ativo: false }).eq("id", a.id);
      if (error) { aviso("Não foi possível remover.", true); return; }
      await carregar(); desenharTudo();
    }
  });

  /* ================= SESSÕES ================= */
  let editSessao = null;
  const fS = document.getElementById("formSessao");
  if (fS) document.getElementById("sData").value = hoje;
  function limparSessao() {
    editSessao = null;
    fS.reset(); document.getElementById("sData").value = hoje; document.getElementById("sDur").value = 60;
    document.getElementById("tituloSessao").textContent = "Registrar sessão";
    document.getElementById("sSalvar").textContent = "Salvar sessão";
    document.getElementById("sCancelar").hidden = true;
  }
  if (fS) {
    document.getElementById("sCancelar").addEventListener("click", limparSessao);
    fS.addEventListener("submit", async function (e) {
      e.preventDefault();
      const n = function (id) { const v = document.getElementById(id).value; return v === "" ? null : Math.max(0, Math.min(10, +v)); };
      const reg = {
        perfil_id: pid, data: document.getElementById("sData").value,
        duracao_min: +document.getElementById("sDur").value || null,
        tema: document.getElementById("sTema").value.trim() || null,
        resumo_cliente: document.getElementById("sResumo").value.trim() || null,
        tarefa: document.getElementById("sTarefa").value.trim() || null,
        humor_antes: n("sAntes"), humor_depois: n("sDepois")
      };
      if (!reg.data) { aviso("Escolha a data da sessão.", true); return; }
      let id = editSessao;
      if (id) {
        const r = await supa().from("terapia_sessoes").update(reg).eq("id", id);
        if (r.error) { aviso("Não foi possível salvar a sessão.", true); return; }
      } else {
        const r = await supa().from("terapia_sessoes").insert(reg).select("id").single();
        if (r.error) { aviso("Não foi possível salvar a sessão.", true); return; }
        id = r.data.id;
      }
      const texto = document.getElementById("sNotas").value;
      const rn = await supa().from("terapia_notas_privadas").upsert({ sessao_id: id, texto: texto, atualizado_em: new Date().toISOString() }, { onConflict: "sessao_id" });
      if (rn.error) aviso("Sessão salva, mas as notas privadas não foram salvas.", true);
      else aviso("Sessão salva.");
      limparSessao();
      await carregar(); desenharTudo();
    });
  }
  function desenharSessoes() {
    const box = document.getElementById("listaSessoes");
    if (!sessoes.length) { box.innerHTML = '<div class="cartao"><p class="vazio">Nenhuma sessão registrada ainda.</p></div>'; }
    else {
      box.innerHTML = sessoes.map(function (s, i) {
        const num = sessoes.length - i;
        return '<div class="sessao"><div class="sessao-topo"><b>Sessão ' + num + " · " + dataBR(s.data) + "</b>" +
          '<span class="acao-info">' + (s.duracao_min ? s.duracao_min + " min" : "") +
          (s.humor_antes !== null && s.humor_depois !== null ? " · chegou " + s.humor_antes + ", saiu " + s.humor_depois : "") + "</span></div>" +
          (s.tema ? '<span class="rotulo">Tema</span><p>' + esc(s.tema) + "</p>" : "") +
          (s.resumo_cliente ? '<span class="rotulo">Resumo</span><p>' + esc(s.resumo_cliente) + "</p>" : "") +
          (s.tarefa ? '<span class="rotulo">Tarefa</span><p>' + esc(s.tarefa) + "</p>" : "") +
          (master && notas[s.id] ? '<div class="privado"><span class="rotulo">Notas privadas (só você vê)</span><p>' + esc(notas[s.id]) + "</p></div>" : "") +
          (master ? '<div class="acoes" style="margin-top:4px"><button class="btn peq contorno" type="button" data-ed-sessao="' + s.id + '">Editar</button>' +
            '<button class="btn peq perigo" type="button" data-del-sessao="' + s.id + '">Apagar</button></div>' : "") +
          "</div>";
      }).join("");
    }
    if (abaAtual === "sessoes") desenharHumor();
  }
  function desenharHumor() {
    const l = sessoes.slice().reverse().filter(function (s) { return s.humor_antes !== null || s.humor_depois !== null; });
    grafico("gHumor", { type: "line", data: { labels: l.map(function (s) { return dataBR(s.data).slice(0, 5); }), datasets: [
      { label: "Como chegou", data: l.map(function (s) { return s.humor_antes; }), borderColor: "#C9742F", backgroundColor: "#C9742F", tension: .3 },
      { label: "Como saiu", data: l.map(function (s) { return s.humor_depois; }), borderColor: "#0B1F3A", backgroundColor: "#0B1F3A", tension: .3 }] },
      options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 10, ticks: { stepSize: 2 } } } } });
  }
  document.getElementById("listaSessoes").addEventListener("click", async function (e) {
    const be = e.target.closest("[data-ed-sessao]"), bd = e.target.closest("[data-del-sessao]");
    if (be) {
      const s = sessoes.find(function (x) { return x.id === be.dataset.edSessao; });
      if (!s) return;
      editSessao = s.id;
      document.getElementById("sData").value = s.data;
      document.getElementById("sDur").value = s.duracao_min || "";
      document.getElementById("sAntes").value = s.humor_antes === null ? "" : s.humor_antes;
      document.getElementById("sDepois").value = s.humor_depois === null ? "" : s.humor_depois;
      document.getElementById("sTema").value = s.tema || "";
      document.getElementById("sResumo").value = s.resumo_cliente || "";
      document.getElementById("sTarefa").value = s.tarefa || "";
      document.getElementById("sNotas").value = notas[s.id] || "";
      document.getElementById("tituloSessao").textContent = "Editando sessão de " + dataBR(s.data);
      document.getElementById("sSalvar").textContent = "Salvar alteração";
      document.getElementById("sCancelar").hidden = false;
      fS.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (bd) {
      const s = sessoes.find(function (x) { return x.id === bd.dataset.delSessao; });
      if (!s || !confirm("Apagar a sessão de " + dataBR(s.data) + "? As notas privadas dela também serão apagadas.")) return;
      const { error } = await supa().from("terapia_sessoes").delete().eq("id", s.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      if (editSessao === s.id) limparSessao();
      await carregar(); desenharTudo();
    }
  });

  /* ================= TESTES ================= */
  const fT = document.getElementById("formTeste");
  function linhaDim(nome, nota) {
    const d = document.createElement("div");
    d.className = "dim-linha";
    d.innerHTML = '<input placeholder="Ex.: Trava do dinheiro" maxlength="60" value="' + esc(nome || "") + '"><input placeholder="Nota" inputmode="decimal" value="' + esc(nota === undefined || nota === null ? "" : String(nota).replace(".", ",")) + '"><button class="btn peq perigo" type="button" aria-label="Remover dimensão">×</button>';
    d.querySelector("button").addEventListener("click", function () { d.remove(); });
    document.getElementById("dims").appendChild(d);
  }
  function preencherDimsDoTeste() {
    const nome = document.getElementById("tNome").value.trim().toLowerCase();
    const anteriores = testes.filter(function (t) { return t.teste.toLowerCase() === nome; });
    const ult = anteriores[anteriores.length - 1];
    document.getElementById("dims").innerHTML = "";
    if (ult) {
      document.getElementById("tMenor").checked = ult.menor_melhor;
      (ult.dimensoes || []).forEach(function (dm) { linhaDim(dm.nome, ""); });
    }
    if (!document.getElementById("dims").children.length) linhaDim();
  }
  if (fT) {
    document.getElementById("tData").value = hoje;
    document.getElementById("addDim").addEventListener("click", function () { linhaDim(); });
    document.getElementById("tNome").addEventListener("change", preencherDimsDoTeste);
    fT.addEventListener("submit", async function (e) {
      e.preventDefault();
      const nome = document.getElementById("tNome").value.trim();
      if (nome.length < 2) { aviso("Escreva o nome do teste.", true); return; }
      const dims = [];
      let erroDim = false;
      document.querySelectorAll("#dims .dim-linha").forEach(function (l) {
        const i = l.querySelectorAll("input");
        const n = i[0].value.trim(), v = i[1].value.trim();
        if (!n && !v) return;
        const num = lerValor(v);
        if (!n || isNaN(num)) { erroDim = true; return; }
        dims.push({ nome: n, nota: num });
      });
      if (erroDim) { aviso("Cada dimensão precisa de nome e nota.", true); return; }
      const pont = document.getElementById("tPont").value.trim();
      const reg = { perfil_id: pid, teste: nome, data: document.getElementById("tData").value, pontuacao: pont ? lerValor(pont) : null,
        menor_melhor: document.getElementById("tMenor").checked, dimensoes: dims, observacao: document.getElementById("tObs").value.trim() || null };
      if (reg.pontuacao !== null && isNaN(reg.pontuacao)) { aviso("A pontuação geral precisa ser um número.", true); return; }
      if (reg.pontuacao === null && !dims.length) { aviso("Preencha a pontuação geral ou pelo menos uma dimensão.", true); return; }
      const { error } = await supa().from("testes_resultados").insert(reg);
      if (error) { aviso("Não foi possível salvar o resultado.", true); return; }
      aviso("Resultado salvo.");
      document.getElementById("tPont").value = ""; document.getElementById("tObs").value = "";
      await carregar(); desenharTudo(); preencherDimsDoTeste();
    });
  }
  function desenharTestes() {
    const nomes = [];
    testes.forEach(function (t) { if (nomes.indexOf(t.teste) === -1) nomes.push(t.teste); });
    const dl = document.getElementById("listaTestes");
    if (dl) dl.innerHTML = nomes.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
    const box = document.getElementById("listaTestesRes");
    if (!nomes.length) { box.innerHTML = '<div class="cartao"><p class="vazio">Nenhum resultado de teste registrado ainda.</p></div>'; return; }
    box.innerHTML = nomes.map(function (nome, k) {
      const l = testes.filter(function (t) { return t.teste === nome; });
      const comPont = l.filter(function (t) { return t.pontuacao !== null; });
      let leitura = "";
      if (comPont.length >= 2) {
        const a = +comPont[0].pontuacao, b = +comPont[comPont.length - 1].pontuacao;
        const melhorou = l[l.length - 1].menor_melhor ? b < a : b > a;
        const v = a ? Math.abs(b - a) / Math.abs(a) : 0;
        leitura = '<li class="' + (b === a ? "" : (melhorou ? "bom" : "alerta")) + '">Do primeiro teste (' + dataBR(comPont[0].data) + ") para o último (" + dataBR(comPont[comPont.length - 1].data) +
          "), a pontuação foi de " + String(a).replace(".", ",") + " para " + String(b).replace(".", ",") +
          (b === a ? ": sem mudança." : (melhorou ? ": melhora de " : ": piora de ") + pct(v) + ".") + "</li>";
      } else leitura = '<li>Ao repetir este teste, aparece aqui a comparação com o primeiro resultado.</li>';
      return '<div class="cartao"><h2>' + esc(nome) + "</h2>" + '<ul class="insights" style="margin-bottom:14px">' + leitura + "</ul>" +
        '<div class="graficos"><div><span class="rotulo">Pontuação geral ao longo do tempo</span><div class="graf baixo"><canvas id="gt-' + k + '"></canvas></div></div>' +
        '<div><span class="rotulo">Dimensões: primeiro x último teste</span><div class="graf baixo"><canvas id="gd-' + k + '"></canvas></div></div></div>' +
        '<div class="tabela-wrap" style="margin-top:14px"><table class="t"><thead><tr><th>Data</th><th class="n">Pontuação</th><th>Dimensões</th><th>Observação</th>' + (master ? "<th></th>" : "") + "</tr></thead><tbody>" +
        l.slice().reverse().map(function (t) {
          return "<tr><td>" + dataBR(t.data) + '</td><td class="n">' + (t.pontuacao === null ? "–" : String(t.pontuacao).replace(".", ",")) + '</td><td class="quebra">' +
            (t.dimensoes || []).map(function (d) { return esc(d.nome) + ": <b>" + String(d.nota).replace(".", ",") + "</b>"; }).join(" · ") + '</td><td class="quebra">' + esc(t.observacao || "") + "</td>" +
            (master ? '<td><button class="btn peq perigo" type="button" data-del-teste="' + t.id + '">Apagar</button></td>' : "") + "</tr>";
        }).join("") + "</tbody></table></div></div>";
    }).join("");
    if (abaAtual === "testes") desenharGraficosTestes(nomes);
  }
  function desenharGraficosTestes(nomes) {
    nomes = nomes || testes.map(function (t) { return t.teste; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    nomes.forEach(function (nome, k) {
      const l = testes.filter(function (t) { return t.teste === nome; });
      const cp = l.filter(function (t) { return t.pontuacao !== null; });
      grafico("gt-" + k, { type: "line", data: { labels: cp.map(function (t) { return dataBR(t.data); }), datasets: [{ data: cp.map(function (t) { return +t.pontuacao; }), borderColor: "#0B1F3A", backgroundColor: "#C9A24A", pointRadius: 5, tension: .3 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } } });
      const prim = l.find(function (t) { return (t.dimensoes || []).length; });
      const ult = l.slice().reverse().find(function (t) { return (t.dimensoes || []).length; });
      if (!prim) return;
      const nomesDim = [];
      [prim, ult].forEach(function (t) { (t.dimensoes || []).forEach(function (d) { if (nomesDim.indexOf(d.nome) === -1) nomesDim.push(d.nome); }); });
      const valor = function (t, n) { const d = (t.dimensoes || []).find(function (x) { return x.nome === n; }); return d ? d.nota : null; };
      const ds = [{ label: "Primeiro (" + dataBR(prim.data) + ")", data: nomesDim.map(function (n) { return valor(prim, n); }), backgroundColor: "#C9742F", borderRadius: 4 }];
      if (ult && ult.id !== prim.id) ds.push({ label: "Último (" + dataBR(ult.data) + ")", data: nomesDim.map(function (n) { return valor(ult, n); }), backgroundColor: "#0B1F3A", borderRadius: 4 });
      grafico("gd-" + k, { type: "bar", data: { labels: nomesDim, datasets: ds }, options: { maintainAspectRatio: false } });
    });
  }
  document.getElementById("listaTestesRes").addEventListener("click", async function (e) {
    const b = e.target.closest("[data-del-teste]");
    if (!b || !confirm("Apagar este resultado de teste?")) return;
    const { error } = await supa().from("testes_resultados").delete().eq("id", b.dataset.delTeste);
    if (error) { aviso("Não foi possível apagar.", true); return; }
    await carregar(); desenharTudo();
  });

  /* ================= ANAMNESE ================= */
  async function carregarAnamnese() {
    const r = await supa().from("terapia_anamnese").select("dados,atualizado_em,atualizado_por").eq("perfil_id", pid).maybeSingle();
    const dados = (r.data && r.data.dados) || {};
    document.getElementById("camposAnamnese").innerHTML = CAMPOS.map(function (c) {
      return '<div class="campo-anamnese"><label for="an-' + c[0] + '">' + c[1] + '</label><textarea id="an-' + c[0] + '" data-campo="' + c[0] + '" rows="3">' + esc(dados[c[0]] || "") + "</textarea></div>";
    }).join("");
    if (r.data && r.data.atualizado_em) {
      document.getElementById("anamneseInfo").textContent = "Última atualização em " + dataBR(r.data.atualizado_em) + ". " +
        (master ? "" : "Responda com calma e com as suas palavras. Dá para voltar e completar depois.");
    }
  }
  document.getElementById("formAnamnese").addEventListener("submit", async function (e) {
    e.preventDefault();
    const dados = {};
    document.querySelectorAll("#camposAnamnese textarea").forEach(function (t) { const v = t.value.trim(); if (v) dados[t.dataset.campo] = v; });
    const { error } = await supa().from("terapia_anamnese").upsert({ perfil_id: pid, dados: dados, atualizado_em: new Date().toISOString(), atualizado_por: eu.id }, { onConflict: "perfil_id" });
    if (error) { aviso("Não foi possível salvar a anamnese.", true); return; }
    aviso("Anamnese salva.");
    carregarAnamnese();
  });

  /* ================= desenhar ================= */
  function desenharTudo() { desenharGeral(); desenharAreas(); desenharSessoes(); desenharTestes(); }
  ligarAbas(document.getElementById("abas"), function (nome) {
    abaAtual = nome;
    if (nome === "geral") desenharRoda();
    if (nome === "areas") desenharGraficosAreas();
    if (nome === "sessoes") desenharHumor();
    if (nome === "testes") desenharGraficosTestes();
  });

  await carregar();
  desenharTudo();
  carregarAnamnese();
  if (fT) preencherDimsDoTeste();
})();
