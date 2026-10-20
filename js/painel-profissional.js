/* Painel do profissional: próprios pacientes e agenda. */
(async function () {
  const eu = await protegerPagina("profissional");
  if (!eu) return;
  document.getElementById("ola").textContent = "Olá, " + eu.nome.split(" ")[0] + "!";

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  const rv = await supa().from("clinica_pacientes").select("id,perfil_id,empresa_id,ativo").eq("profissional_perfil_id", eu.id);
  const vinculos = (rv.data || []).filter(function (v) { return v.ativo; });
  if (!vinculos.length) { document.getElementById("semClinica").hidden = false; return; }
  document.getElementById("area").hidden = false;

  const perfisIds = vinculos.map(function (v) { return v.perfil_id; });
  const [rPerfis, rSessoesTodas] = await Promise.all([
    supa().from("perfis").select("id,nome").in("id", perfisIds),
    supa().from("clinica_sessoes").select("id,paciente_vinculo_id,data,hora_inicio,status,tipo_atendimento").in("paciente_vinculo_id", vinculos.map(function (v) { return v.id; })).order("data").order("hora_inicio")
  ]);
  const perfis = rPerfis.data || [], todasSessoes = rSessoesTodas.data || [];
  const sessoesFuturas = todasSessoes.filter(function (s) { return s.data >= hojeISO(); });
  const nomeDe = function (vid) { const v = vinculos.find(function (x) { return x.id === vid; }); const p = v ? perfis.find(function (x) { return x.id === v.perfil_id; }) : null; return p ? p.nome : "?"; };

  const STATUS_LABEL = { agendado: "Agendado", realizado: "Realizado", cancelado: "Cancelado", faltou: "Faltou" };
  document.getElementById("listaProximas").innerHTML = sessoesFuturas.filter(function (s) { return s.status === "agendado"; }).slice(0, 10).map(function (s) {
    return '<div class="sessao"><div class="sessao-topo"><b>' + esc(nomeDe(s.paciente_vinculo_id)) + '</b><span class="acao-info">' + dataBR(s.data) + (s.hora_inicio ? " às " + s.hora_inicio.slice(0, 5) : "") + '</span></div>' +
      (s.tipo_atendimento ? '<span class="acao-info">' + esc(s.tipo_atendimento) + '</span>' : "") +
      '<div class="acoes" style="margin-top:6px"><a class="btn peq" href="ficha-paciente.html?v=' + s.paciente_vinculo_id + '">Abrir ficha</a></div></div>';
  }).join("") || '<p class="vazio">Nenhuma sessão agendada.</p>';

  document.getElementById("listaPacientes").innerHTML = vinculos.map(function (v) {
    const p = perfis.find(function (x) { return x.id === v.perfil_id; });
    return '<div class="sessao"><div class="sessao-topo"><b>' + esc(p ? p.nome : "?") + '</b></div>' +
      '<div class="acoes" style="margin-top:6px"><a class="btn peq" href="ficha-paciente.html?v=' + v.id + '">Abrir ficha</a></div></div>';
  }).join("");

  /* ===== calendário consolidado ===== */
  let mesAgenda = new Date();
  function diasNoMes(ano, mes0) { return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate(); }
  function desenharCalendario() {
    const ano = mesAgenda.getFullYear(), mes0 = mesAgenda.getMonth();
    const nomeMes = MESES_LONGOS[mes0];
    document.getElementById("tituloMesAgenda").textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1) + " " + ano;
    const n = diasNoMes(ano, mes0), hoje = hojeISO();
    let html = "";
    for (let d = 1; d <= n; d++) {
      const dStr = ano + "-" + String(mes0 + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const doDia = todasSessoes.filter(function (s) { return s.data === dStr; });
      html += '<div class="cal-dia' + (dStr === hoje ? " hoje" : "") + (dStr < hoje ? " passado" : "") + '"><div class="cal-num">' + d + "</div>" +
        doDia.map(function (s) {
          const cls = s.status === "realizado" ? "verde" : (s.status === "cancelado" || s.status === "faltou" ? "vermelho" : "amarelo");
          return '<a class="cal-item ' + cls + '" href="ficha-paciente.html?v=' + s.paciente_vinculo_id + '">' + (s.hora_inicio ? s.hora_inicio.slice(0, 5) + " " : "") + esc(nomeDe(s.paciente_vinculo_id)) + "</a>";
        }).join("") + "</div>";
    }
    document.getElementById("calendarioAgenda").innerHTML = html;
  }
  document.getElementById("mesAnteriorAgenda").addEventListener("click", function () { mesAgenda = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() - 1, 1); desenharCalendario(); });
  document.getElementById("mesProximoAgenda").addEventListener("click", function () { mesAgenda = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() + 1, 1); desenharCalendario(); });
  desenharCalendario();
})();
