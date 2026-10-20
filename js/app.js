/* Funções compartilhadas pelas telas da Área de Membros. */

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ROTULO_SERVICO = { consultoria_empresarial: "Consultoria empresarial", terapia: "Terapia", mentoria: "Mentoria" };
const ROTULO_CANAL = { loja_fisica: "Loja física", digital: "Digital / online", servico: "Serviço", outro: "Outro" };
const ROTULO_PAPEL = { master: "Master", suporte: "Suporte", cliente: "Cliente", vendedor: "Vendedor(a)" };

function brl(v) { return MOEDA.format(Number(v) || 0); }
function pct(v) { return (isFinite(v) ? (v * 100).toFixed(1).replace(".", ",") : "0,0") + "%"; }

function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56". */
function lerValor(s) {
  s = String(s || "").trim().replace(/\s|R\$/g, "");
  if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function dataBR(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

let _toastTimer = null;
function aviso(msg, erro) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.className = "toast" + (erro ? " erro" : "");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { t.hidden = true; }, erro ? 6000 : 3200);
}

/* Chama a função segura do servidor (gestão de usuários). */
async function chamarServidor(corpo) {
  const { data, error } = await supa().functions.invoke("gerenciar-usuarios", { body: corpo });
  if (error) {
    let msg = "Não foi possível concluir. Tente de novo.";
    try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) {}
    return { ok: false, erro: msg };
  }
  if (data && data.erro) return { ok: false, erro: data.erro };
  return { ok: true, dados: data };
}

/* Busca todas as linhas, de 1000 em 1000 (limite do Supabase por pedido). */
async function buscarTudo(montarConsulta) {
  const lote = 1000;
  let de = 0, tudo = [];
  for (;;) {
    const { data, error } = await montarConsulta().range(de, de + lote - 1);
    if (error) throw error;
    tudo = tudo.concat(data || []);
    if (!data || data.length < lote) break;
    de += lote;
  }
  return tudo;
}

/* Abas simples: botões .aba[data-aba="x"] mostram seções [data-painel="x"]. */
function ligarAbas(raiz, aoTrocar) {
  const botoes = Array.prototype.slice.call(raiz.querySelectorAll(".aba"));
  function abrir(nome) {
    botoes.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.aba === nome ? "true" : "false"); });
    document.querySelectorAll("[data-painel]").forEach(function (p) { p.hidden = p.dataset.painel !== nome; });
    if (aoTrocar) aoTrocar(nome);
  }
  botoes.forEach(function (b) { b.addEventListener("click", function () { abrir(b.dataset.aba); }); });
  return abrir;
}

/* Telefone salvo como 5581999999999 -> "(81) 99999-9999" */
function foneBR(t) {
  const d = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return t || "";
}

/* ---------- semanas do mês (1–7, 8–14, 15–21, 22–28, 29 em diante) ---------- */
function diasNoMes(ano, mes0) { return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate(); }
function semanasDoMes(ano, mes0) {
  const n = diasNoMes(ano, mes0), l = [];
  for (let ini = 1; ini <= n; ini += 7) l.push({ ini: ini, fim: Math.min(ini + 6, n) });
  return l;
}
function semanaDoDia(dia) { return Math.floor((dia - 1) / 7); }
