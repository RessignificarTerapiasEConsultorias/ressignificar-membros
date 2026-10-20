/* Dashboard de melhoria: visão consolidada de todos os projetos. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];

  const ETAPA_LABEL = { P: "Planejar", D: "Fazer", C: "Checar", A: "Agir" };
  let graficoEtapas = null, graficoGanhos = null;

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  const [rp, rperf, racoes] = await Promise.all([
    supa().from("projetos_melhoria").select("*").order("criado_em", { ascending: false }),
    supa().from("perfis").select("id,nome"),
    supa().from("projetos_acoes").select("id,projeto_id,acao,responsavel_perfil_id,prazo,status,percentual_conclusao")
  ]);
  const projetos = rp.data || [], perfis = rperf.data || [], acoes = racoes.data || [];
  const nomeDe = function (id) { const p = perfis.find(function (x) { return x.id === id; }); return p ? p.nome : "—"; };

  function pctProjeto(pid) {
    const das = acoes.filter(function (a) { return a.projeto_id === pid; });
    return das.length ? Math.round(das.reduce(function (s, a) { return s + a.percentual_conclusao; }, 0) / das.length) : 0;
  }

  const ativos = projetos.filter(function (p) { return p.status === "ativo"; });
  const hoje = hojeISO();
  const atrasadas = acoes.filter(function (a) { return a.prazo && a.prazo < hoje && a.status !== "concluida"; });
  const ganhoEstimadoTotal = projetos.reduce(function (s, p) { return s + (+p.ganho_estimado || 0); }, 0);
  const ganhoRealizadoTotal = projetos.reduce(function (s, p) { return s + (+p.ganho_realizado || 0); }, 0);
  const pctMedio = ativos.length ? Math.round(ativos.reduce(function (s, p) { return s + pctProjeto(p.id); }, 0) / ativos.length) : 0;

  document.getElementById("kpisDashboard").innerHTML = [
    ["Projetos ativos", ativos.length, "em andamento"],
    ["Ações com prazo vencido", atrasadas.length, "precisam de atenção"],
    ["% de conclusão médio", pctMedio + "%", "dos projetos ativos"],
    ["Ganho estimado total", brl(ganhoEstimadoTotal), "somado de todos os projetos"],
    ["Ganho realizado total", brl(ganhoRealizadoTotal), "confirmado até agora"]
  ].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b><span>" + k[2] + "</span></div>"; }).join("");

  if (typeof Chart !== "undefined") {
    const porEtapa = { P: 0, D: 0, C: 0, A: 0 };
    ativos.forEach(function (p) { porEtapa[p.etapa_atual]++; });
    graficoEtapas = new Chart(document.getElementById("gEtapas"), {
      type: "doughnut", data: { labels: Object.keys(porEtapa).map(function (k) { return ETAPA_LABEL[k]; }), datasets: [{ data: Object.values(porEtapa), backgroundColor: ["#E8F4EA", "#0B1F3A", "#F4D9A0", "#1FA855"] }] },
      options: { maintainAspectRatio: false }
    });
    graficoGanhos = new Chart(document.getElementById("gGanhos"), {
      type: "bar",
      data: { labels: projetos.slice(0, 8).map(function (p) { return p.titulo.length > 20 ? p.titulo.slice(0, 20) + "…" : p.titulo; }), datasets: [
        { label: "Estimado", data: projetos.slice(0, 8).map(function (p) { return +p.ganho_estimado || 0; }), backgroundColor: "#E3DCCD" },
        { label: "Realizado", data: projetos.slice(0, 8).map(function (p) { return +p.ganho_realizado || 0; }), backgroundColor: "#C9A24A" }
      ] },
      options: { maintainAspectRatio: false }
    });
  }

  document.getElementById("listaAtrasadas").innerHTML = atrasadas.length ? atrasadas.map(function (a) {
    const p = projetos.find(function (x) { return x.id === a.projeto_id; });
    return "<tr><td>" + (p ? '<a href="projeto.html?id=' + p.id + '">' + esc(p.titulo) + "</a>" : "—") + "</td><td>" + esc(a.acao) + "</td><td>" + nomeDe(a.responsavel_perfil_id) + '</td><td class="v-despesa">' + dataBR(a.prazo) + "</td><td>" + a.status + "</td></tr>";
  }).join("") : '<tr><td colspan="5" class="vazio">Nenhuma ação atrasada. 🎉</td></tr>';

  document.getElementById("listaTodosProjetos").innerHTML = projetos.length ? projetos.map(function (p) {
    return "<tr><td><a href=\"projeto.html?id=" + p.id + "\">" + esc(p.titulo) + "</a></td><td>" + esc(nomeDe(p.perfil_id)) + "</td><td>" + ETAPA_LABEL[p.etapa_atual] + " · Ciclo " + p.ciclo_atual + '</td><td class="n">' + pctProjeto(p.id) + "%</td><td>" + (p.ganho_estimado ? brl(p.ganho_estimado) : "—") + "</td><td>" + (p.ganho_realizado ? brl(p.ganho_realizado) : "—") + '</td><td><span class="selo ' + (p.status === "concluido" ? "ok" : "") + '">' + p.status + "</span></td></tr>";
  }).join("") : '<tr><td colspan="7" class="vazio">Nenhum projeto cadastrado.</td></tr>';
})();
