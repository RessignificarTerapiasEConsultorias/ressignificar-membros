/* Ficha do paciente: anamnese (nunca visível ao paciente) + agenda de sessões com notas. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente", "profissional"]);
  if (!eu) return;
  const vid = new URLSearchParams(location.search).get("v");
  function falha(msg) { document.getElementById("falhaMsg").textContent = msg; document.getElementById("falha").hidden = false; }
  if (!vid) return falha("Nenhum paciente escolhido.");

  const rv = await supa().from("clinica_pacientes").select("id,perfil_id,profissional_perfil_id,empresa_id,data_nascimento").eq("id", vid).maybeSingle();
  if (!rv.data) return falha("Este paciente não existe ou você não tem acesso a esta ficha.");
  const vinculo = rv.data;
  if (eu.papel === "cliente" && vinculo.perfil_id === eu.id) return falha("Esta ficha não está disponível para o paciente.");

  const [rPac, rProf] = await Promise.all([
    supa().from("perfis").select("nome,email").eq("id", vinculo.perfil_id).maybeSingle(),
    supa().from("perfis").select("nome").eq("id", vinculo.profissional_perfil_id).maybeSingle()
  ]);
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  document.getElementById("tituloPaciente").textContent = rPac.data ? rPac.data.nome : "Paciente";
  document.getElementById("subPaciente").textContent = "Profissional responsável: " + (rProf.data ? rProf.data.nome : "—") + (vinculo.data_nascimento ? " · nascimento " + dataBR(vinculo.data_nascimento) : "");
  document.getElementById("area").hidden = false;

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  const STATUS_LABEL = { agendado: "Agendado", realizado: "Realizado", cancelado: "Cancelado", faltou: "Faltou" };
  const STATUS_CLS = { agendado: "", realizado: "ok", cancelado: "off", faltou: "off" };

  /* ===== ANAMNESE ===== */
  async function carregarAnamnese() {
    const r = await supa().from("clinica_anamnese").select("*").eq("paciente_vinculo_id", vid).maybeSingle();
    if (r.data) {
      document.getElementById("anQueixa").value = r.data.queixa_principal || "";
      document.getElementById("anHistorico").value = r.data.historico_saude || "";
      document.getElementById("anMedicamentos").value = r.data.medicamentos_em_uso || "";
      document.getElementById("anAlergias").value = r.data.alergias || "";
      document.getElementById("anFamiliar").value = r.data.historico_familiar || "";
      document.getElementById("anObs").value = r.data.observacoes || "";
      document.getElementById("anamneseInfo").textContent = "Última atualização em " + dataBR(r.data.atualizado_em.slice(0, 10));
    }
  }
  document.getElementById("formAnamnese").addEventListener("submit", async function (e) {
    e.preventDefault();
    const reg = {
      paciente_vinculo_id: vid, queixa_principal: document.getElementById("anQueixa").value.trim() || null,
      historico_saude: document.getElementById("anHistorico").value.trim() || null, medicamentos_em_uso: document.getElementById("anMedicamentos").value.trim() || null,
      alergias: document.getElementById("anAlergias").value.trim() || null, historico_familiar: document.getElementById("anFamiliar").value.trim() || null,
      observacoes: document.getElementById("anObs").value.trim() || null, atualizado_por: eu.id, atualizado_em: new Date().toISOString()
    };
    const r = await supa().from("clinica_anamnese").upsert(reg, { onConflict: "paciente_vinculo_id" });
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso("Anamnese salva!"); carregarAnamnese();
  });

  /* ===== SESSÕES ===== */
  let sessoes = [], notasAbertas = null;
  document.getElementById("sData").value = hojeISO();
  async function carregarSessoes() {
    const r = await supa().from("clinica_sessoes").select("*").eq("paciente_vinculo_id", vid).order("data", { ascending: false });
    sessoes = r.data || [];
  }
  function desenharSessoes() {
    document.getElementById("listaSessoes").innerHTML = sessoes.length ? sessoes.map(function (s) {
      return '<div class="sessao"><div class="sessao-topo"><b>' + dataBR(s.data) + (s.hora_inicio ? " às " + s.hora_inicio.slice(0, 5) : "") + '</b>' +
        '<span class="selo ' + STATUS_CLS[s.status] + '">' + STATUS_LABEL[s.status] + '</span></div>' +
        (s.tipo_atendimento ? '<span class="acao-info">' + esc(s.tipo_atendimento) + '</span>' : "") +
        '<div class="acoes" style="margin-top:6px">' +
        '<select data-status-sessao="' + s.id + '">' + Object.keys(STATUS_LABEL).map(function (k) { return '<option value="' + k + '"' + (s.status === k ? " selected" : "") + ">" + STATUS_LABEL[k] + "</option>"; }).join("") + '</select>' +
        '<button class="btn peq contorno" type="button" data-nota="' + s.id + '">Notas clínicas</button>' +
        '<button class="btn peq perigo" type="button" data-del-sessao="' + s.id + '">Apagar</button></div></div>';
    }).join("") : '<p class="vazio">Nenhuma sessão registrada ainda.</p>';
  }
  document.getElementById("formSessao").addEventListener("submit", async function (e) {
    e.preventDefault();
    const reg = {
      paciente_vinculo_id: vid, data: document.getElementById("sData").value, hora_inicio: document.getElementById("sInicio").value || null,
      hora_fim: document.getElementById("sFim").value || null, tipo_atendimento: document.getElementById("sTipo").value.trim() || null,
      status: document.getElementById("sStatus").value, criado_por: eu.id
    };
    const r = await supa().from("clinica_sessoes").insert(reg);
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso("Sessão salva!"); this.reset(); document.getElementById("sData").value = hojeISO(); document.getElementById("sStatus").value = "agendado";
    await carregarSessoes(); desenharSessoes();
  });
  document.getElementById("listaSessoes").addEventListener("change", async function (e) {
    const sel = e.target.closest("[data-status-sessao]"); if (!sel) return;
    await supa().from("clinica_sessoes").update({ status: sel.value }).eq("id", sel.dataset.statusSessao);
    await carregarSessoes(); desenharSessoes();
  });
  document.getElementById("listaSessoes").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del-sessao]"), bn = e.target.closest("[data-nota]");
    if (bd) { if (!confirm("Apagar esta sessão e a nota ligada a ela?")) return; await supa().from("clinica_sessoes").delete().eq("id", bd.dataset.delSessao); await carregarSessoes(); desenharSessoes(); }
    if (bn) {
      notasAbertas = bn.dataset.nota;
      const r = await supa().from("clinica_sessoes_notas").select("notas").eq("sessao_id", notasAbertas).maybeSingle();
      document.getElementById("textoNota").value = r.data ? (r.data.notas || "") : "";
      document.getElementById("janelaNota").showModal();
    }
  });
  document.getElementById("btFecharNota").addEventListener("click", function () { document.getElementById("janelaNota").close(); });
  document.getElementById("btSalvarNota").addEventListener("click", async function () {
    const r = await supa().from("clinica_sessoes_notas").upsert({ sessao_id: notasAbertas, notas: document.getElementById("textoNota").value.trim() || null, atualizado_por: eu.id, atualizado_em: new Date().toISOString() }, { onConflict: "sessao_id" });
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso("Nota salva!"); document.getElementById("janelaNota").close();
  });

  ligarAbas(document.getElementById("abas"));
  await carregarAnamnese();
  await carregarSessoes(); desenharSessoes();
})();
