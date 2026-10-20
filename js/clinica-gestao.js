/* Gestão de profissionais e pacientes de uma clínica. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  const gestor = eu.papel !== "cliente";
  const eid = new URLSearchParams(location.search).get("e");
  function falha(msg) { document.getElementById("falhaMsg").textContent = msg; document.getElementById("falha").hidden = false; }
  if (!eid) return falha("Nenhuma empresa escolhida.");

  const re = await supa().from("empresas").select("id,nome,tipo,empresa_membros(perfil_id,funcao)").eq("id", eid).maybeSingle();
  if (!re.data) return falha("Esta empresa não existe ou você não tem acesso a ela.");
  if (!gestor) {
    const souDono = (re.data.empresa_membros || []).some(function (m) { return m.perfil_id === eu.id && m.funcao === "dono"; });
    if (!souDono) return falha("Só o dono da empresa acompanha profissionais e pacientes.");
  }
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  document.getElementById("tituloClinica").textContent = "Profissionais e pacientes: " + re.data.nome;
  document.getElementById("area").hidden = false;

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  let profissionaisLigados = [], pacientesLigados = [], perfisProfissional = [], perfisCliente = [];

  async function carregar() {
    const [rp, rpac, rperfP, rperfC] = await Promise.all([
      supa().from("clinica_profissionais").select("id,perfil_id,especialidade,ativo").eq("empresa_id", eid),
      supa().from("clinica_pacientes").select("id,perfil_id,profissional_perfil_id,data_nascimento,ativo").eq("empresa_id", eid),
      supa().from("perfis").select("id,nome").eq("papel", "profissional").eq("ativo", true).order("nome"),
      supa().from("perfis").select("id,nome").eq("papel", "cliente").eq("ativo", true).order("nome")
    ]);
    profissionaisLigados = rp.data || []; pacientesLigados = rpac.data || [];
    perfisProfissional = rperfP.data || []; perfisCliente = rperfC.data || [];
  }
  function nomeDe(lista, id) { const p = lista.find(function (x) { return x.id === id; }); return p ? p.nome : "?"; }

  function desenharProfissionais() {
    const ligadosIds = profissionaisLigados.map(function (p) { return p.perfil_id; });
    document.getElementById("selProfissional").innerHTML = perfisProfissional.filter(function (p) { return ligadosIds.indexOf(p.id) === -1; })
      .map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("") || '<option value="">Nenhum profissional disponível</option>';
    document.getElementById("listaProfissionais").innerHTML = profissionaisLigados.length ? profissionaisLigados.map(function (p) {
      return '<div class="sessao"><div class="sessao-topo"><b>' + esc(nomeDe(perfisProfissional, p.perfil_id)) + '</b>' +
        '<span class="selo ' + (p.ativo ? "ok" : "off") + '">' + (p.ativo ? "Ativo" : "Inativo") + '</span></div>' +
        (p.especialidade ? '<span class="acao-info">' + esc(p.especialidade) + '</span>' : "") +
        '<div class="acoes" style="margin-top:6px"><button class="btn peq contorno" type="button" data-toggle-prof="' + p.id + '" data-ativo="' + (p.ativo ? "1" : "") + '">' + (p.ativo ? "Desligar" : "Religar") + '</button></div></div>';
    }).join("") : '<p class="vazio">Nenhum profissional ligado ainda.</p>';
  }
  document.getElementById("btLigarProfissional").addEventListener("click", async function () {
    const pid = document.getElementById("selProfissional").value;
    if (!pid) { aviso("Crie primeiro o acesso do profissional em Pessoas e acessos.", true); return; }
    const esp = document.getElementById("novaEspecialidade").value.trim() || null;
    const r = await supa().from("clinica_profissionais").insert({ empresa_id: eid, perfil_id: pid, especialidade: esp });
    if (r.error) { aviso("Não foi possível ligar.", true); return; }
    aviso("Profissional ligado à clínica!"); document.getElementById("novaEspecialidade").value = "";
    await carregar(); desenharTudo();
  });
  document.getElementById("listaProfissionais").addEventListener("click", async function (e) {
    const b = e.target.closest("[data-toggle-prof]"); if (!b) return;
    await supa().from("clinica_profissionais").update({ ativo: !b.dataset.ativo }).eq("id", b.dataset.toggleProf);
    await carregar(); desenharProfissionais();
  });

  function desenharPacientes() {
    document.getElementById("selProfissionalPaciente").innerHTML = profissionaisLigados.filter(function (p) { return p.ativo; })
      .map(function (p) { return '<option value="' + p.perfil_id + '">' + esc(nomeDe(perfisProfissional, p.perfil_id)) + "</option>"; }).join("") || '<option value="">Ligue um profissional primeiro</option>';
    const jaLigados = {};
    pacientesLigados.forEach(function (v) { jaLigados[v.perfil_id] = jaLigados[v.perfil_id] || []; jaLigados[v.perfil_id].push(v.profissional_perfil_id); });
    document.getElementById("selPaciente").innerHTML = perfisCliente.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("") || '<option value="">Nenhum cliente disponível</option>';
    document.getElementById("listaPacientes").innerHTML = pacientesLigados.length ? pacientesLigados.map(function (v) {
      return '<div class="sessao"><div class="sessao-topo"><b>' + esc(nomeDe(perfisCliente, v.perfil_id)) + '</b>' +
        '<span class="selo ' + (v.ativo ? "ok" : "off") + '">' + (v.ativo ? "Ativo" : "Inativo") + '</span></div>' +
        '<span class="acao-info">Profissional: ' + esc(nomeDe(perfisProfissional, v.profissional_perfil_id)) + (v.data_nascimento ? " · nascimento " + dataBR(v.data_nascimento) : "") + '</span>' +
        '<div class="acoes" style="margin-top:6px"><a class="btn peq" href="ficha-paciente.html?v=' + v.id + '">Abrir ficha</a>' +
        '<button class="btn peq contorno" type="button" data-toggle-pac="' + v.id + '" data-ativo="' + (v.ativo ? "1" : "") + '">' + (v.ativo ? "Desligar" : "Religar") + '</button></div></div>';
    }).join("") : '<p class="vazio">Nenhum paciente ligado ainda.</p>';
  }
  document.getElementById("btLigarPaciente").addEventListener("click", async function () {
    const pid = document.getElementById("selPaciente").value, prof = document.getElementById("selProfissionalPaciente").value;
    if (!pid) { aviso("Crie primeiro o acesso do paciente em Pessoas e acessos.", true); return; }
    if (!prof) { aviso("Ligue um profissional a esta clínica primeiro.", true); return; }
    const r = await supa().from("clinica_pacientes").insert({ empresa_id: eid, perfil_id: pid, profissional_perfil_id: prof, data_nascimento: document.getElementById("novoNascimento").value || null });
    if (r.error) { aviso(r.error.message.indexOf("duplicate") !== -1 ? "Este paciente já está ligado a este profissional." : "Não foi possível ligar.", true); return; }
    aviso("Paciente ligado!"); document.getElementById("novoNascimento").value = "";
    await carregar(); desenharTudo();
  });
  document.getElementById("listaPacientes").addEventListener("click", async function (e) {
    const b = e.target.closest("[data-toggle-pac]"); if (!b) return;
    await supa().from("clinica_pacientes").update({ ativo: !b.dataset.ativo }).eq("id", b.dataset.togglePac);
    await carregar(); desenharPacientes();
  });

  function desenharTudo() { desenharProfissionais(); desenharPacientes(); }
  ligarAbas(document.getElementById("abas"));
  await carregar();
  desenharTudo();
})();
