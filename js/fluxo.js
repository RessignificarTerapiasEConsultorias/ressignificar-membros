/* Fluxo 30 dias: cartões, recebimentos e dívidas parceladas.
   Chamado pela DRE após a aba "fluxo" ser selecionada.
   Recebe: supa() já configurado, eid (empresa ou null), pid (perfil do dono), brl(), dataBR(), lerValor(), hojeISO(), aviso() */

window.iniciarFluxo = async function(eid, pid) {
  var hoje = new Date(), hojeStr = hojeISO();
  var mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  // ── dados em memória ──
  var cartoes = [], gastos = [], faturas = [], recebimentos = [], dividas = [];
  var metasReceita = [], acoesMeta = [], realizadoMeta = {};
  var abaFluxo = "cartoes";
  var editCartaoId = null, editRecId = null, editDividaId = null, editFuturoId = null, editAcaoMetaId = null;

  // ── filtros de query ──
  function filtro(q) {
    var r = q.eq("perfil_id", pid);
    if (eid) r = q.eq("empresa_id", eid);
    else r = q.is("empresa_id", null);
    return r;
  }

  // ── helpers de data ──
  function mesISO(d) { return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-01"; }
  function mesLabel(d) { return ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][d.getMonth()] + " " + d.getFullYear(); }
  function addMeses(d, n) { return new Date(d.getFullYear(), d.getMonth()+n, 1); }
  function diasNoMes(d) { return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
  function dateStr(ano, mes0, dia) { return ano + "-" + String(mes0+1).padStart(2,"0") + "-" + String(dia).padStart(2,"0"); }

  // ── navegação de mês ──
  function atualizarTituloMes() {
    document.getElementById("fluxoMesTitulo").textContent = mesLabel(mesAtual);
    document.getElementById("mesGastos").textContent = mesLabel(mesAtual);
  }
  document.getElementById("fluxoMesAnterior").addEventListener("click", function() { mesAtual = addMeses(mesAtual,-1); atualizarTituloMes(); desenharFluxo(); });
  document.getElementById("fluxoMesProximo").addEventListener("click", function() { mesAtual = addMeses(mesAtual,1); atualizarTituloMes(); desenharFluxo(); });
  atualizarTituloMes();

  // ── abas internas ──
  document.getElementById("abasFluxo").addEventListener("click", function(e) {
    var b = e.target.closest("[data-aba]"); if (!b) return;
    abaFluxo = b.dataset.aba;
    document.querySelectorAll("#abasFluxo [data-aba]").forEach(function(x) { x.setAttribute("aria-selected", x.dataset.aba === abaFluxo ? "true" : "false"); });
    document.querySelectorAll("[data-painel-fluxo]").forEach(function(x) { x.hidden = x.dataset.painelFluxo !== abaFluxo; });
    if (abaFluxo === "servicos" && !servicos.length && !itensCusto.length) {
      carregarServicos().then(desenharServicos);
    } else if (abaFluxo === "servicos") { desenharServicos(); }
    if (abaFluxo === "projecao") desenharProjecao();
    if (abaFluxo === "meta") desenharMeta();
  });

  // ── carregar tudo ──
  async function carregar() {
    realizadoMeta = {};
    var ini = mesISO(mesAtual);
    var fim = mesISO(addMeses(mesAtual, 36)); // 36 meses para projeção longa
    var [rc, rg, rf, rr, rd, rmr, ram] = await Promise.all([
      filtro(supa().from("cartoes").select("*").eq("ativo", true).order("nome")),
      filtro(supa().from("gastos_cartao").select("*").gte("mes_primeira_fatura", mesISO(addMeses(mesAtual,-6))).order("data_compra", {ascending:false})),
      filtro(supa().from("faturas_cartao").select("*").gte("mes_referencia", ini).lte("mes_referencia", fim)),
      filtro(supa().from("recebimentos").select("*").order("data_prevista")),
      filtro(supa().from("dividas").select("*").eq("ativa", true).order("data_primeira_parcela")),
      filtro(supa().from("metas_receita").select("*").order("mes_referencia")),
      filtro(supa().from("acoes_meta").select("*").order("criado_em"))
    ]);
    cartoes = rc.data || []; gastos = rg.data || []; faturas = rf.data || [];
    recebimentos = rr.data || []; dividas = rd.data || [];
    metasReceita = rmr.data || []; acoesMeta = ram.data || [];
  }

  // ── calcular valor de parcela do cartão que cai num mês ──
  function parcelasMesCartao(mesRef) {
    // mesRef: Date com o 1º dia do mês
    var mesStr = mesISO(mesRef);
    var result = [];
    gastos.forEach(function(g) {
      for (var p = 0; p < g.parcelas; p++) {
        var mesParcela = addMeses(new Date(g.mes_primeira_fatura + "T12:00:00"), p);
        if (mesISO(mesParcela) === mesStr) {
          result.push({ gasto: g, parcela: p+1, valor: g.valor_total / g.parcelas, cartao: cartoes.find(function(c){return c.id===g.cartao_id;})||{nome:"?"} });
        }
      }
    });
    return result;
  }

  // ── fatura de um cartão num mês ──
  function faturaDoMes(cartaoId, mesRef) {
    var mesStr = mesISO(mesRef);
    return faturas.find(function(f) { return f.cartao_id === cartaoId && f.mes_referencia === mesStr; });
  }

  // ── calcular total da fatura do mês ──
  function totalFaturaCartao(cartaoId, mesRef) {
    return parcelasMesCartao(mesRef).filter(function(p){return p.cartao.id===cartaoId;}).reduce(function(s,p){return s+p.valor;}, 0);
  }

  // ── parcela de dívida que cai num dia ──
  function dividasNoDia(diaStr) {
    return dividas.filter(function(d) {
      var dp = new Date(d.data_primeira_parcela + "T12:00:00");
      var mesesPassados = (mesAtual.getFullYear()-dp.getFullYear())*12 + (mesAtual.getMonth()-dp.getMonth());
      if (mesesPassados < 0 || mesesPassados >= d.parcelas) return false;
      var numParcela = mesesPassados + 1;
      var jaFoi = numParcela <= d.parcelas_pagas;
      var diaVenc = dp.getDate();
      var diaRef = parseInt(diaStr.slice(8));
      return diaVenc === diaRef;
    });
  }

  // ── dias com vencimento de fatura ──
  function faturasDoDia(diaStr) {
    var items = [];
    cartoes.forEach(function(c) {
      var diaVenc = c.dia_vencimento;
      var diaRef = parseInt(diaStr.slice(8));
      if (diaVenc !== diaRef) return;
      var total = totalFaturaCartao(c.id, mesAtual);
      if (total <= 0) return;
      var fat = faturaDoMes(c.id, mesAtual);
      items.push({ cartao: c, total: total, pago: fat ? fat.pago : false, faturaId: fat ? fat.id : null });
    });
    return items;
  }

  // ── recebimentos de um dia ──
  function recsDoDia(diaStr) {
    return recebimentos.filter(function(r){return r.data_prevista===diaStr;});
  }

  // ── gastos de cartão feitos num dia (compra) ──
  function comprasDoDia(diaStr) {
    return gastos.filter(function(g){ return g.data_compra === diaStr; }).map(function(g){
      var c = cartoes.find(function(x){return x.id===g.cartao_id;})||{nome:"?",dia_vencimento:"?"};
      var mesFat = new Date(g.mes_primeira_fatura+"T12:00:00");
      return { gasto:g, cartao:c, mesFatura:mesFat };
    });
  }

  // ── desenhar calendário ──
  function desenharCalendario() {
    var cal = document.getElementById("calendarioFluxo");
    var n = diasNoMes(mesAtual);
    var ano = mesAtual.getFullYear(), mes0 = mesAtual.getMonth();
    var html = "";
    for (var d = 1; d <= n; d++) {
      var dStr = dateStr(ano, mes0, d);
      var eHoje = dStr === hojeStr;
      var passado = dStr < hojeStr;
      var fats = faturasDoDia(dStr);
      var recs = recsDoDia(dStr);
      var divs = dividasNoDia(dStr);
      var compras = comprasDoDia(dStr);
      html += '<div class="cal-dia' + (eHoje?" hoje":"") + (passado?" passado":"") + '">';
      html += '<div class="cal-num">' + d + '</div>';
      compras.forEach(function(cp) {
        var label = "💳 " + cp.gasto.descricao + " " + brl(cp.gasto.valor_total);
        var tip = "Compra no " + cp.cartao.nome + " · paga na fatura de " + mesLabel(cp.mesFatura) + " (dia " + cp.cartao.dia_vencimento + ")";
        html += '<div class="cal-item roxo" title="' + esc(tip) + '">' + esc(label) + '</div>';
      });
      fats.forEach(function(f) {
        var cls = f.pago ? "verde" : (passado ? "vermelho" : "vermelho");
        var label = f.cartao.nome + " " + brl(f.total);
        html += '<div class="cal-item ' + cls + '" data-pagar-fatura="' + f.cartao.id + '" title="Fatura ' + esc(f.cartao.nome) + '">' + esc(label) + '</div>';
      });
      recs.forEach(function(r) {
        var cls = r.recebido ? "verde" : (passado ? "vermelho" : "amarelo");
        html += '<div class="cal-item ' + cls + '" data-rec-id="' + r.id + '" title="' + esc(r.descricao) + '">' + esc(r.descricao) + ' ' + brl(r.valor) + '</div>';
      });
      divs.forEach(function(d2) {
        var mesesPassados = (mesAtual.getFullYear()-new Date(d2.data_primeira_parcela+"T12:00:00").getFullYear())*12+(mesAtual.getMonth()-new Date(d2.data_primeira_parcela+"T12:00:00").getMonth());
        var numP = mesesPassados+1, jaFoi = numP <= d2.parcelas_pagas;
        var cls = jaFoi ? "verde" : (passado ? "laranja" : "laranja");
        html += '<div class="cal-item ' + cls + '" title="' + esc(d2.descricao) + '">' + esc(d2.descricao) + ' ' + brl(d2.valor_parcela) + '</div>';
      });
      html += '</div>';
    }
    cal.innerHTML = html;
  }

  // ── click no calendário: marcar fatura como paga / recebimento ──
  document.getElementById("calendarioFluxo").addEventListener("click", async function(e) {
    var bf = e.target.closest("[data-pagar-fatura]");
    var br = e.target.closest("[data-rec-id]");
    if (bf) {
      var cartaoId = bf.dataset.pagarFatura;
      var cartao = cartoes.find(function(c){return c.id===cartaoId;});
      var fat = faturaDoMes(cartaoId, mesAtual);
      var totalFat = totalFaturaCartao(cartaoId, mesAtual);
      if (!cartao || totalFat <= 0) return;
      var novoPago = !(fat && fat.pago);
      var msg = novoPago ? "Marcar fatura de " + cartao.nome + " (" + brl(totalFat) + ") como PAGA?" : "Desmarcar pagamento da fatura de " + cartao.nome + "?";
      if (!confirm(msg)) return;
      var mesStr = mesISO(mesAtual);
      var diaVenc = cartao.dia_vencimento;
      var dataVenc = dateStr(mesAtual.getFullYear(), mesAtual.getMonth(), Math.min(diaVenc, diasNoMes(mesAtual)));
      if (fat) {
        await supa().from("faturas_cartao").update({ pago: novoPago, pago_em: novoPago ? new Date().toISOString() : null }).eq("id", fat.id);
      } else {
        await supa().from("faturas_cartao").insert({ cartao_id: cartaoId, perfil_id: pid, empresa_id: eid||null, mes_referencia: mesStr, data_vencimento: dataVenc, valor_total: totalFat, pago: true, pago_em: new Date().toISOString() });
      }
      aviso(novoPago ? "Fatura marcada como paga ✓" : "Pagamento desmarcado.");
      await carregar(); desenharFluxo();
    }
    if (br) {
      var rec = recebimentos.find(function(r){return r.id===br.dataset.recId;});
      if (!rec) return;
      var novoRec = !rec.recebido;
      if (!confirm((novoRec?"Confirmar recebimento de ":"Desmarcar recebimento de ") + brl(rec.valor) + " — " + rec.descricao + "?")) return;
      await supa().from("recebimentos").update({ recebido: novoRec, recebido_em: novoRec ? new Date().toISOString() : null }).eq("id", rec.id);
      aviso(novoRec ? "Recebimento confirmado ✓" : "Desmarcado.");
      await carregar(); desenharFluxo();
    }
  });

  // ── desenhar cartões ──
  function desenharCartoes() {
    var sel = document.getElementById("gaCartao");
    sel.innerHTML = cartoes.length ? cartoes.map(function(c){return '<option value="'+c.id+'">'+esc(c.nome)+(c.bandeira?" ("+c.bandeira+")":"")+'</option>';}).join("") : '<option value="">Cadastre um cartão primeiro</option>';
    document.getElementById("listaCartoes").innerHTML = cartoes.length ? cartoes.map(function(c){
      var totalMes = totalFaturaCartao(c.id, mesAtual);
      var fat = faturaDoMes(c.id, mesAtual);
      var statusCls = fat && fat.pago ? "verde" : (totalMes > 0 ? "vermelho" : "");
      var statusTxt = fat && fat.pago ? "Paga" : (totalMes > 0 ? "A pagar" : "Sem gastos");
      return '<div class="sessao"><div class="sessao-topo"><b>'+esc(c.nome)+'</b>' +
        (c.bandeira?'<span class="selo">'+esc(c.bandeira)+'</span>':"") +
        (statusCls?'<span class="badge-status '+statusCls+'">'+statusTxt+'</span>':"") +
        '</div>' +
        '<span class="acao-info">Vencimento dia '+c.dia_vencimento+(c.dia_fechamento?" · fecha dia "+c.dia_fechamento:"")+(c.limite?" · limite "+brl(c.limite):"")+'</span>' +
        (totalMes>0?'<div style="margin-top:6px"><b>Fatura '+mesLabel(mesAtual)+':</b> <span class="'+(fat&&fat.pago?"v-receita":"v-despesa")+'">'+brl(totalMes)+'</span></div>':"") +
        '<div class="acoes" style="margin-top:6px">' +
        '<button class="btn peq contorno" type="button" data-ed-cartao="'+c.id+'">Editar</button>' +
        '<button class="btn peq perigo" type="button" data-del-cartao="'+c.id+'">Apagar</button></div></div>';
    }).join("") : '<div class="cartao"><p class="vazio">Nenhum cartão cadastrado.</p></div>';
  }

  // ── desenhar gastos do mês ──
  function desenharGastos() {
    var mesStr = mesISO(mesAtual);
    var gastosDoMes = [];
    gastos.forEach(function(g) {
      for (var p = 0; p < g.parcelas; p++) {
        var mesParcela = mesISO(addMeses(new Date(g.mes_primeira_fatura + "T12:00:00"), p));
        if (mesParcela === mesStr) {
          gastosDoMes.push({ g: g, parcela: p+1, valor: g.valor_total/g.parcelas });
        }
      }
    });
    gastosDoMes.sort(function(a,b){return a.g.data_compra < b.g.data_compra ? 1 : -1;});
    document.getElementById("listaGastos").innerHTML = gastosDoMes.length ? gastosDoMes.map(function(item){
      var c = cartoes.find(function(x){return x.id===item.g.cartao_id;})||{nome:"?"};
      return "<tr><td>"+dataBR(item.g.data_compra)+"</td><td><b>"+esc(item.g.descricao)+"</b></td><td>"+(item.g.categoria||"—")+"</td><td>"+esc(c.nome)+"</td>" +
        '<td class="n">'+item.parcela+"/"+item.g.parcelas+"</td>" +
        '<td class="n"><b>'+brl(item.valor)+'</b>'+(item.g.parcelas>1?'<br><span class="vazio" style="padding:0">total '+brl(item.g.valor_total)+'</span>':"")+"</td>" +
        '<td><button class="btn peq perigo" type="button" data-del-gasto="'+item.g.id+'">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="7" class="vazio">Nenhum gasto neste mês.</td></tr>';
  }

  // ── preview da fatura ao preencher gasto ──
  function atualizarPreviewFatura() {
    var cartaoId = document.getElementById("gaCartao").value;
    var dataCompra = document.getElementById("gaData").value;
    var parcelas = parseInt(document.getElementById("gaParcelas").value)||1;
    var valor = lerValor(document.getElementById("gaValor").value)||0;
    if (!cartaoId || !dataCompra) { document.getElementById("previewFatura").textContent = ""; return; }
    var c = cartoes.find(function(x){return x.id===cartaoId;});
    if (!c) return;
    // Calcular mês da 1ª fatura
    var dc = new Date(dataCompra + "T12:00:00");
    var diaFech = c.dia_fechamento || c.dia_vencimento - 7;
    var mesFat = dc.getDate() > diaFech ? addMeses(dc, 1) : dc;
    mesFat = new Date(mesFat.getFullYear(), mesFat.getMonth(), 1);
    var txt = "1ª parcela na fatura de " + mesLabel(mesFat) + " (dia " + c.dia_vencimento + ")";
    if (parcelas > 1) txt += " · " + parcelas + "x de " + brl(valor/parcelas);
    document.getElementById("previewFatura").textContent = txt;
    return mesFat;
  }
  ["gaCartao","gaData","gaParcelas","gaValor"].forEach(function(id){document.getElementById(id).addEventListener("change", atualizarPreviewFatura);});
  ["gaValor","gaParcelas"].forEach(function(id){document.getElementById(id).addEventListener("input", atualizarPreviewFatura);});

  // ── preview de dívida ──
  function atualizarPreviewDivida() {
    var total = lerValor(document.getElementById("diTotal").value)||0;
    var parc = parseInt(document.getElementById("diParc").value)||0;
    var data1 = document.getElementById("diData").value;
    if (!total||!parc||!data1) { document.getElementById("previewDivida").textContent=""; return; }
    var d1 = new Date(data1+"T12:00:00");
    var ultMes = addMeses(d1, parc-1);
    document.getElementById("previewDivida").textContent = parc + "x de " + brl(total/parc) + " · termina em " + mesLabel(ultMes);
  }
  ["diTotal","diParc","diData"].forEach(function(id){document.getElementById(id).addEventListener("input", atualizarPreviewDivida);});

  // ── form cartão ──
  function limparFormCartao() { editCartaoId=null; document.getElementById("formCartao").reset(); document.getElementById("tituloCartao").textContent="Novo cartão"; document.getElementById("caSalvar").textContent="Salvar cartão"; document.getElementById("caCancelar").hidden=true; }
  document.getElementById("caCancelar").addEventListener("click", limparFormCartao);
  document.getElementById("formCartao").addEventListener("submit", async function(e) {
    e.preventDefault();
    var nome = document.getElementById("caNome").value.trim();
    var venc = parseInt(document.getElementById("caVenc").value);
    if (!nome || !(venc>=1&&venc<=31)) { aviso("Preencha o nome e o dia de vencimento.", true); return; }
    var reg = { perfil_id:pid, empresa_id:eid||null, nome:nome, bandeira:document.getElementById("caBand").value||null, dia_vencimento:venc, dia_fechamento:parseInt(document.getElementById("caFech").value)||null, limite:lerValor(document.getElementById("caLimite").value)||null };
    var b=document.getElementById("caSalvar"); b.disabled=true;
    var r = editCartaoId ? await supa().from("cartoes").update(reg).eq("id",editCartaoId) : await supa().from("cartoes").insert(reg);
    b.disabled=false;
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso(editCartaoId?"Cartão atualizado.":"Cartão cadastrado!"); limparFormCartao(); await carregar(); desenharFluxo();
  });
  document.getElementById("listaCartoes").addEventListener("click", async function(e) {
    var be=e.target.closest("[data-ed-cartao]"), bd=e.target.closest("[data-del-cartao]");
    if (be) {
      var c=cartoes.find(function(x){return x.id===be.dataset.edCartao;}); if(!c) return;
      editCartaoId=c.id; document.getElementById("caNome").value=c.nome; document.getElementById("caBand").value=c.bandeira||""; document.getElementById("caVenc").value=c.dia_vencimento; document.getElementById("caFech").value=c.dia_fechamento||""; document.getElementById("caLimite").value=c.limite||"";
      document.getElementById("tituloCartao").textContent="Editando: "+c.nome; document.getElementById("caSalvar").textContent="Salvar alteração"; document.getElementById("caCancelar").hidden=false;
      document.getElementById("formCartao").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if (bd) {
      var c=cartoes.find(function(x){return x.id===bd.dataset.delCartao;});
      if (!c||!confirm("Apagar cartão "+c.nome+"? Os gastos lançados nele também serão apagados.")) return;
      await supa().from("cartoes").delete().eq("id",c.id); aviso("Cartão apagado."); await carregar(); desenharFluxo();
    }
  });

  // ── form gasto ──
  document.getElementById("gaData").value = hojeStr;
  document.getElementById("formGasto").addEventListener("submit", async function(e) {
    e.preventDefault();
    var cartaoId=document.getElementById("gaCartao").value, desc=document.getElementById("gaDesc").value.trim();
    var valor=lerValor(document.getElementById("gaValor").value), parcelas=parseInt(document.getElementById("gaParcelas").value)||1;
    var dataCompra=document.getElementById("gaData").value;
    if (!cartaoId||!desc||!(valor>0)||!dataCompra) { aviso("Preencha todos os campos obrigatórios.", true); return; }
    var c=cartoes.find(function(x){return x.id===cartaoId;});
    var dc=new Date(dataCompra+"T12:00:00"), diaFech=c.dia_fechamento||(c.dia_vencimento-7);
    var mesFat = dc.getDate()>diaFech ? addMeses(dc,1) : dc;
    mesFat = new Date(mesFat.getFullYear(), mesFat.getMonth(), 1);
    var reg = { cartao_id:cartaoId, perfil_id:pid, empresa_id:eid||null, descricao:desc, categoria:document.getElementById("gaCat").value.trim()||null, valor_total:valor, parcelas:parcelas, data_compra:dataCompra, mes_primeira_fatura:mesISO(mesFat) };
    var b=this.querySelector("[type=submit]"); b.disabled=true;
    var r=await supa().from("gastos_cartao").insert(reg); b.disabled=false;
    if (r.error) { aviso("Não foi possível lançar o gasto.", true); return; }
    aviso("Gasto lançado! Fatura de "+mesLabel(mesFat)+"."); document.getElementById("formGasto").reset(); document.getElementById("gaData").value=hojeStr; await carregar(); desenharFluxo();
  });
  document.getElementById("listaGastos").addEventListener("click", async function(e) {
    var bd=e.target.closest("[data-del-gasto]"); if(!bd) return;
    var g=gastos.find(function(x){return x.id===bd.dataset.delGasto;});
    if (!g||!confirm("Apagar o gasto \""+g.descricao+"\" ("+g.parcelas+"x de "+brl(g.valor_total/g.parcelas)+")?\nTodas as parcelas serão removidas das faturas.")) return;
    await supa().from("gastos_cartao").delete().eq("id",g.id); aviso("Gasto apagado."); await carregar(); desenharFluxo();
  });

  // ── form recebimentos ──
  function limparFormRec() { editRecId=null; document.getElementById("formRec").reset(); document.getElementById("tituloRec").textContent="Novo recebimento"; document.getElementById("reSalvar").textContent="Salvar recebimento"; document.getElementById("reCancelar").hidden=true; }
  document.getElementById("reCancelar").addEventListener("click", limparFormRec);
  document.getElementById("formRec").addEventListener("submit", async function(e) {
    e.preventDefault();
    var desc=document.getElementById("reDesc").value.trim(), valor=lerValor(document.getElementById("reValor").value), data=document.getElementById("reData").value;
    if (!desc||!(valor>0)||!data) { aviso("Preencha descrição, valor e data.", true); return; }
    var reg={perfil_id:pid, empresa_id:eid||null, descricao:desc, categoria:document.getElementById("reCat").value.trim()||null, valor:valor, data_prevista:data};
    var b=document.getElementById("reSalvar"); b.disabled=true;
    var r=editRecId?await supa().from("recebimentos").update(reg).eq("id",editRecId):await supa().from("recebimentos").insert(reg);
    b.disabled=false;
    if (r.error){aviso("Não foi possível salvar.",true);return;}
    aviso(editRecId?"Recebimento atualizado.":"Recebimento salvo!"); limparFormRec(); await carregar(); desenharFluxo();
  });
  document.getElementById("listaRecs").addEventListener("click", async function(e) {
    var be=e.target.closest("[data-ed-rec]"), bd=e.target.closest("[data-del-rec]"), bm=e.target.closest("[data-marcar-rec]");
    if (bm) {
      var r=recebimentos.find(function(x){return x.id===bm.dataset.marcarRec;}); if(!r) return;
      var novo=!r.recebido;
      await supa().from("recebimentos").update({recebido:novo,recebido_em:novo?new Date().toISOString():null}).eq("id",r.id);
      aviso(novo?"Recebido ✓":"Desmarcado."); await carregar(); desenharFluxo(); return;
    }
    if (be) {
      var r=recebimentos.find(function(x){return x.id===be.dataset.edRec;}); if(!r) return;
      editRecId=r.id; document.getElementById("reDesc").value=r.descricao; document.getElementById("reCat").value=r.categoria||""; document.getElementById("reValor").value=String(r.valor).replace(".",","); document.getElementById("reData").value=r.data_prevista;
      document.getElementById("tituloRec").textContent="Editando recebimento"; document.getElementById("reSalvar").textContent="Salvar alteração"; document.getElementById("reCancelar").hidden=false;
      document.getElementById("formRec").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if (bd) {
      var r=recebimentos.find(function(x){return x.id===bd.dataset.delRec;}); if(!r||!confirm("Apagar recebimento de "+brl(r.valor)+"?")) return;
      await supa().from("recebimentos").delete().eq("id",r.id); aviso("Apagado."); await carregar(); desenharFluxo();
    }
  });

  function desenharRecebimentos() {
    var todos = recebimentos.slice().sort(function(a,b){return a.data_prevista<b.data_prevista?-1:1;});
    document.getElementById("listaRecs").innerHTML = todos.length ? todos.map(function(r){
      var atrasado = !r.recebido && r.data_prevista < hojeStr;
      var cls = r.recebido?"verde":(atrasado?"vermelho":"amarelo");
      var txt = r.recebido?"Recebido":(atrasado?"Atrasado":"Pendente");
      return '<div class="sessao"><div class="sessao-topo"><b>'+esc(r.descricao)+'</b><span class="badge-status '+cls+'">'+txt+'</span></div>' +
        '<div style="font-size:15px;font-weight:700;color:var(--navy)">'+brl(r.valor)+'</div>' +
        '<span class="acao-info">'+dataBR(r.data_prevista)+(r.categoria?" · "+esc(r.categoria):"")+'</span>' +
        '<div class="acoes" style="margin-top:6px">' +
        '<button class="btn peq" type="button" data-marcar-rec="'+r.id+'">'+(r.recebido?"Desmarcar":"Marcar recebido")+'</button>' +
        '<button class="btn peq contorno" type="button" data-ed-rec="'+r.id+'">Editar</button>' +
        '<button class="btn peq perigo" type="button" data-del-rec="'+r.id+'">Apagar</button></div></div>';
    }).join("") : '<div class="cartao"><p class="vazio">Nenhum recebimento neste mês.</p></div>';
  }

  // ── form dívidas ──
  function limparFormDivida() { editDividaId=null; document.getElementById("formDivida").reset(); document.getElementById("tituloDivida").textContent="Nova dívida"; document.getElementById("diSalvar").textContent="Salvar dívida"; document.getElementById("diCancelar").hidden=true; document.getElementById("previewDivida").textContent=""; }
  document.getElementById("diCancelar").addEventListener("click", limparFormDivida);
  document.getElementById("formDivida").addEventListener("submit", async function(e) {
    e.preventDefault();
    var desc=document.getElementById("diDesc").value.trim(), total=lerValor(document.getElementById("diTotal").value), parc=parseInt(document.getElementById("diParc").value), data1=document.getElementById("diData").value;
    if (!desc||!(total>0)||!(parc>=1)||!data1){aviso("Preencha todos os campos.",true);return;}
    var pagas=parseInt(document.getElementById("diPagas").value)||0;
    var reg={perfil_id:pid,empresa_id:eid||null,descricao:desc,categoria:document.getElementById("diCat").value.trim()||null,valor_total:total,parcelas:parc,data_primeira_parcela:data1,parcelas_pagas:pagas};
    var b=document.getElementById("diSalvar"); b.disabled=true;
    var r=editDividaId?await supa().from("dividas").update(reg).eq("id",editDividaId):await supa().from("dividas").insert(reg);
    b.disabled=false;
    if(r.error){aviso("Não foi possível salvar.",true);return;}
    aviso(editDividaId?"Dívida atualizada.":"Dívida cadastrada!"); limparFormDivida(); await carregar(); desenharFluxo();
  });
  document.getElementById("listaDividas").addEventListener("click", async function(e) {
    var be=e.target.closest("[data-ed-div]"), bd=e.target.closest("[data-del-div]"), bp=e.target.closest("[data-pagar-div]");
    if (bp) {
      var d=dividas.find(function(x){return x.id===bp.dataset.pagarDiv;}); if(!d) return;
      var novas=Math.min(d.parcelas_pagas+1,d.parcelas);
      await supa().from("dividas").update({parcelas_pagas:novas}).eq("id",d.id);
      if(novas>=d.parcelas) await supa().from("dividas").update({ativa:false}).eq("id",d.id);
      aviso("Parcela "+novas+"/"+d.parcelas+" marcada como paga."); await carregar(); desenharFluxo(); return;
    }
    if (be) {
      var d=dividas.find(function(x){return x.id===be.dataset.edDiv;}); if(!d) return;
      editDividaId=d.id; document.getElementById("diDesc").value=d.descricao; document.getElementById("diCat").value=d.categoria||""; document.getElementById("diTotal").value=String(d.valor_total).replace(".",","); document.getElementById("diParc").value=d.parcelas; document.getElementById("diData").value=d.data_primeira_parcela; document.getElementById("diPagas").value=d.parcelas_pagas;
      document.getElementById("tituloDivida").textContent="Editando: "+d.descricao; document.getElementById("diSalvar").textContent="Salvar alteração"; document.getElementById("diCancelar").hidden=false;
      atualizarPreviewDivida(); document.getElementById("formDivida").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if (bd) {
      var d=dividas.find(function(x){return x.id===bd.dataset.delDiv;}); if(!d||!confirm("Apagar a dívida \""+d.descricao+"\"?")) return;
      await supa().from("dividas").delete().eq("id",d.id); aviso("Dívida apagada."); await carregar(); desenharFluxo();
    }
  });

  function desenharDividas() {
    document.getElementById("listaDividas").innerHTML = dividas.length ? dividas.map(function(d){
      var restantes=d.parcelas-d.parcelas_pagas;
      var dp=new Date(d.data_primeira_parcela+"T12:00:00");
      var ultimaMes=addMeses(dp,d.parcelas-1);
      var pct=d.parcelas>0?Math.round(d.parcelas_pagas/d.parcelas*100):0;
      return '<div class="sessao"><div class="sessao-topo"><b>'+esc(d.descricao)+'</b>' +
        (d.categoria?'<span class="selo">'+esc(d.categoria)+'</span>':"") +
        '</div>' +
        '<div style="font-size:15px;font-weight:700;color:var(--navy)">'+brl(d.valor_parcela)+'/mês</div>' +
        '<div style="margin:6px 0 4px"><div style="background:#EEE8DC;border-radius:20px;height:8px;overflow:hidden"><div style="background:var(--gold);height:100%;width:'+pct+'%;border-radius:20px"></div></div></div>' +
        '<span class="acao-info">'+d.parcelas_pagas+"/"+d.parcelas+" pagas · "+restantes+" restantes · término "+mesLabel(ultimaMes)+'</span>' +
        '<div class="acoes" style="margin-top:6px">' +
        (restantes>0?'<button class="btn peq" type="button" data-pagar-div="'+d.id+'">Marcar parcela paga</button>':"")+
        '<button class="btn peq contorno" type="button" data-ed-div="'+d.id+'">Editar</button>' +
        '<button class="btn peq perigo" type="button" data-del-div="'+d.id+'">Apagar</button></div></div>';
    }).join("") : '<div class="cartao"><p class="vazio">Nenhuma dívida cadastrada.</p></div>';
  }

  // ── filtrar recebimentos do mês atual para o calendário ──
  function recsMes() {
    var ini = dateStr(mesAtual.getFullYear(), mesAtual.getMonth(), 1);
    var fim = dateStr(mesAtual.getFullYear(), mesAtual.getMonth(), diasNoMes(mesAtual));
    return recebimentos.filter(function(r){ return r.data_prevista >= ini && r.data_prevista <= fim; });
  }

  // ── PROJEÇÃO MULTI-MESES ──
  var TIPO_LABEL = { receita_a_receber:"💰 A receber", receita_antecipada:"💰 Antecipada", custo_atendimento:"🔴 Custo atendimento", custo_fixo_futuro:"🔴 Custo fixo", outro:"📌 Outro" };
  var TIPO_SINAL = { receita_a_receber:1, receita_antecipada:1, custo_atendimento:-1, custo_fixo_futuro:-1, outro:0 };

  function calcularProjecao(nMeses) {
    var resultado = [];
    for (var i = 0; i < nMeses; i++) {
      var m = addMeses(new Date(hoje.getFullYear(), hoje.getMonth(), 1), i);
      var mesStr = mesISO(m);
      var n = diasNoMes(m);
      // entradas: recebimentos do tipo receita
      var entradas = recebimentos.filter(function(r){
        return r.data_prevista >= mesISO(m) && r.data_prevista < mesISO(addMeses(m,1)) && (r.tipo==="receita_a_receber"||r.tipo==="receita_antecipada");
      }).reduce(function(s,r){return s+(+r.valor);},0);
      // saídas: parcelas de cartão no mês
      var saidaCartao = 0;
      cartoes.forEach(function(c){saidaCartao += totalFaturaCartao(c.id, m);});
      // saídas: dívidas que vencem neste mês
      var saidaDivida = dividas.reduce(function(s,d){
        var dp = new Date(d.data_primeira_parcela+"T12:00:00");
        var mesesPassados = (m.getFullYear()-dp.getFullYear())*12+(m.getMonth()-dp.getMonth());
        if (mesesPassados < 0 || mesesPassados >= d.parcelas) return s;
        return s + (+d.valor_parcela);
      }, 0);
      // saídas: custos futuros cadastrados no mês
      var saidaCusto = recebimentos.filter(function(r){
        var dataRef = r.data_custo || r.data_prevista;
        return dataRef >= mesISO(m) && dataRef < mesISO(addMeses(m,1)) && (r.tipo==="custo_atendimento"||r.tipo==="custo_fixo_futuro");
      }).reduce(function(s,r){return s+(+(r.valor_custo||r.valor));},0);
      // custo de execução de receitas antecipadas
      var custosAntecipados = recebimentos.filter(function(r){
        return r.tipo==="receita_antecipada" && r.data_custo && r.data_custo >= mesISO(m) && r.data_custo < mesISO(addMeses(m,1));
      }).reduce(function(s,r){return s+(+(r.valor_custo||0));},0);
      var totalSaidas = saidaCartao + saidaDivida + saidaCusto + custosAntecipados;
      var saldo = entradas - totalSaidas;
      resultado.push({ mes:m, mesStr:mesStr, entradas:entradas, saidas:totalSaidas, saldo:saldo, detalhe:{cartao:saidaCartao, divida:saidaDivida, custo:saidaCusto+custosAntecipados} });
    }
    return resultado;
  }

  function desenharProjecao() {
    var n = parseInt(document.getElementById("projMeses").value)||6;
    var rows = calcularProjecao(n);
    var acumulado = 0;
    var mesAtualStr = mesISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    document.getElementById("bodyProjecao").innerHTML = rows.map(function(r){
      acumulado += r.saldo;
      var isAtual = r.mesStr === mesAtualStr;
      var cls = isAtual ? "mes-atual" : "";
      return "<tr class='"+cls+"'>" +
        "<td><b>"+mesLabel(r.mes)+"</b></td>" +
        "<td class='n proj-positivo'>"+brl(r.entradas)+"</td>" +
        "<td class='n proj-negativo'>" + brl(r.saidas) +
          "<br><span class='vazio' style='padding:0;font-size:11.5px'>cartão "+brl(r.detalhe.cartao)+" · dívidas "+brl(r.detalhe.divida)+(r.detalhe.custo?" · outros "+brl(r.detalhe.custo):"")+"</span></td>" +
        "<td class='n'><b class='"+(r.saldo>=0?"proj-positivo":"proj-negativo")+"'>"+brl(r.saldo)+"</b></td>" +
        "<td class='n'><b class='"+(acumulado>=0?"proj-positivo":"proj-negativo")+"'>"+brl(acumulado)+"</b></td>" +
        "</tr>";
    }).join("");
    desenharListaFuturos();
  }
  document.getElementById("projMeses").addEventListener("change", desenharProjecao);

  // ── formulário de eventos futuros ──
  document.getElementById("fuTipo").addEventListener("change", function(){
    document.getElementById("blocoCusto").hidden = this.value !== "receita_antecipada";
  });
  document.getElementById("fuData").value = hojeStr;

  function limparFormFuturo() {
    editFuturoId = null;
    document.getElementById("formFuturo").reset();
    document.getElementById("fuData").value = hojeStr;
    document.getElementById("blocoCusto").hidden = true;
    document.getElementById("fuSalvar").textContent = "Salvar evento";
    document.getElementById("fuCancelar").hidden = true;
  }
  document.getElementById("fuCancelar").addEventListener("click", limparFormFuturo);
  document.getElementById("formFuturo").addEventListener("submit", async function(e){
    e.preventDefault();
    var tipo = document.getElementById("fuTipo").value;
    var desc = document.getElementById("fuDesc").value.trim();
    var valor = lerValor(document.getElementById("fuValor").value);
    var data = document.getElementById("fuData").value;
    if (!desc||!(valor>0)||!data){aviso("Preencha tipo, descrição, valor e data.",true);return;}
    var reg = { perfil_id:pid, empresa_id:eid||null, descricao:desc, categoria:document.getElementById("fuCat").value.trim()||null, valor:valor, data_prevista:data, tipo:tipo,
      data_custo: tipo==="receita_antecipada" ? (document.getElementById("fuDataCusto").value||null) : null,
      valor_custo: tipo==="receita_antecipada" ? (lerValor(document.getElementById("fuValorCusto").value)||null) : null };
    var b = document.getElementById("fuSalvar"); b.disabled=true;
    var r = editFuturoId ? await supa().from("recebimentos").update(reg).eq("id",editFuturoId) : await supa().from("recebimentos").insert(reg);
    b.disabled=false;
    if(r.error){aviso("Não foi possível salvar.",true);return;}
    aviso(editFuturoId?"Evento atualizado.":"Evento salvo!"); limparFormFuturo(); await carregar(); desenharFluxo();
  });

  function desenharListaFuturos() {
    var futuros = recebimentos.filter(function(r){return r.tipo !== "receita_a_receber" || r.data_prevista > hojeStr;}).sort(function(a,b){return a.data_prevista<b.data_prevista?-1:1;});
    document.getElementById("listaFuturos").innerHTML = futuros.length ? futuros.map(function(r){
      var sinal = TIPO_SINAL[r.tipo]||0;
      var cls = sinal>0?"tipo-receita":sinal<0?"tipo-custo":"tipo-antecipada";
      return '<div class="sessao"><div class="sessao-topo"><b>'+esc(r.descricao)+'</b><span class="'+cls+'">'+esc(TIPO_LABEL[r.tipo]||r.tipo)+'</span></div>' +
        '<div style="font-size:15px;font-weight:700">'+brl(r.valor)+'</div>' +
        '<span class="acao-info">'+dataBR(r.data_prevista)+(r.categoria?" · "+esc(r.categoria):"")+'</span>' +
        (r.tipo==="receita_antecipada"&&r.data_custo?'<br><span class="acao-info tipo-custo">Custo de execução: '+brl(r.valor_custo||0)+' em '+dataBR(r.data_custo)+'</span>':"") +
        '<div class="acoes" style="margin-top:6px">' +
        '<button class="btn peq contorno" type="button" data-ed-futuro="'+r.id+'">Editar</button>' +
        '<button class="btn peq perigo" type="button" data-del-futuro="'+r.id+'">Apagar</button></div></div>';
    }).join("") : '<div class="cartao"><p class="vazio">Nenhum evento futuro cadastrado.</p></div>';
  }

  document.getElementById("listaFuturos").addEventListener("click", async function(e){
    var be=e.target.closest("[data-ed-futuro]"), bd=e.target.closest("[data-del-futuro]");
    if(be){
      var r=recebimentos.find(function(x){return x.id===be.dataset.edFuturo;}); if(!r) return;
      editFuturoId=r.id;
      document.getElementById("fuTipo").value=r.tipo||"receita_a_receber";
      document.getElementById("fuDesc").value=r.descricao;
      document.getElementById("fuCat").value=r.categoria||"";
      document.getElementById("fuValor").value=String(r.valor).replace(".",",");
      document.getElementById("fuData").value=r.data_prevista;
      document.getElementById("blocoCusto").hidden = r.tipo!=="receita_antecipada";
      if(r.tipo==="receita_antecipada"){document.getElementById("fuDataCusto").value=r.data_custo||"";document.getElementById("fuValorCusto").value=r.valor_custo||"";}
      document.getElementById("fuSalvar").textContent="Salvar alteração"; document.getElementById("fuCancelar").hidden=false;
      document.getElementById("formFuturo").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if(bd){
      var r=recebimentos.find(function(x){return x.id===bd.dataset.delFuturo;}); if(!r||!confirm("Apagar evento \""+r.descricao+"\"?")) return;
      await supa().from("recebimentos").delete().eq("id",r.id); aviso("Apagado."); await carregar(); desenharFluxo();
    }
  });

  // ── META E AÇÕES ──
  var STATUS_META = { a_fazer:"A fazer", em_andamento:"Em andamento", concluida:"Concluída", atrasada:"Atrasada" };
  var STATUS_CLS = { a_fazer:"", em_andamento:"amarelo", concluida:"verde", atrasada:"vermelho" };

  function metaDoMes(m) {
    var s = mesISO(m); return metasReceita.find(function(x){return x.mes_referencia===s;});
  }

  function desenharMeta() {
    var m = metaDoMes(mesAtual);
    // receita do mês: empresa = entradas totais da DRE; meta geral = pagamentos de clientes recebidos
    var chaveMes = mesISO(mesAtual), realizado = realizadoMeta[chaveMes];
    if (realizado === undefined) {
      realizado = 0;
      receitaDoMes(eid, mesAtual.getFullYear(), mesAtual.getMonth() + 1).then(function (v) { realizadoMeta[chaveMes] = v; desenharMeta(); }).catch(function () { realizadoMeta[chaveMes] = 0; });
    }
    document.getElementById("metaRealizado").textContent = brl(realizado);
    var meta = m ? +m.valor_meta : null;
    document.getElementById("metaValor").textContent = meta ? brl(meta) : "Não definida";
    var pct = meta && meta>0 ? realizado/meta : 0;
    var barra = document.getElementById("metaBarra");
    barra.style.width = Math.min(100,pct*100)+"%";
    var barraEl = document.querySelector(".barra-meta");
    if (barraEl) barraEl.classList.toggle("batida", meta && realizado>=meta);
    // ritmo
    var hoje2 = new Date(), diasTotais = diasNoMes(mesAtual);
    var diaHoje = mesAtual.getMonth()===hoje2.getMonth()&&mesAtual.getFullYear()===hoje2.getFullYear() ? hoje2.getDate() : diasTotais;
    var diasRestantes = diasTotais - diaHoje + 1;
    var ritmoEl = document.getElementById("metaRitmo");
    if (!meta) {
      ritmoEl.textContent = "Defina a meta do mês abaixo para ver o ritmo necessário.";
    } else if (realizado >= meta) {
      ritmoEl.textContent = "🎉 Meta batida! Você superou em "+brl(realizado-meta)+" ("+Math.round(pct*100)+"%).";
    } else {
      var falta = meta - realizado;
      var porDia = diasRestantes>0 ? falta/diasRestantes : falta;
      var porSem = porDia*7, porMes = meta;
      ritmoEl.textContent = Math.round(pct*100)+"% atingido · Faltam "+brl(falta)+" · Precisa de "+brl(porDia)+"/dia nos "+diasRestantes+" dias restantes · "+brl(porSem)+"/semana.";
    }
    // alerta: 5+ dias passados e abaixo de 15% do esperado proporcional
    var alertaEl = document.getElementById("alertaMeta");
    if (meta && diaHoje>=5) {
      var esperado = meta * diaHoje/diasTotais;
      var distancia = esperado>0 ? realizado/esperado : 0;
      if (distancia < 0.5) {
        alertaEl.hidden=false;
        alertaEl.innerHTML = "⚠️ Você está com "+Math.round(distancia*100)+"% do esperado para este momento. "+
          "Considere cadastrar ações corretivas abaixo ou redefinir prazos das ações existentes.";
      } else { alertaEl.hidden=true; }
    } else { alertaEl.hidden=true; }
    // tabela de metas cadastradas
    document.getElementById("tabelaMetas").innerHTML = metasReceita.length ?
      "<div class='tabela-wrap'><table class='t'><thead><tr><th>Mês</th><th class='n'>Meta</th><th></th></tr></thead><tbody>" +
      metasReceita.map(function(x){
        return "<tr><td>"+mesLabel(new Date(x.mes_referencia+"T12:00:00"))+"</td><td class='n'><b>"+brl(x.valor_meta)+"</b></td>" +
          "<td><button class='btn peq perigo' type='button' data-del-meta='"+x.id+"'>Apagar</button></td></tr>";
      }).join("")+"</tbody></table></div>" : "";
    // ações do mês
    var mesStr = mesISO(mesAtual);
    var acoesDomes = acoesMeta.filter(function(a){return a.mes_referencia===mesStr;});
    var atrasadas = acoesDomes.filter(function(a){return a.status==="atrasada"||(a.prazo&&a.prazo<hojeStr&&a.status!=="concluida");}).length;
    document.getElementById("listaAcoesMeta").innerHTML = acoesDomes.length ? acoesDomes.map(function(a,i){
      var cls = STATUS_CLS[a.status]||"";
      var prazoAtras = a.prazo && a.prazo < hojeStr && a.status!=="concluida";
      return "<tr>" +
        "<td>"+(i+1)+"</td>" +
        "<td>"+esc(a.problema)+"</td>" +
        "<td>"+(a.causa_raiz?esc(a.causa_raiz):"—")+"</td>" +
        "<td><b>"+esc(a.acao)+"</b></td>" +
        "<td>"+(a.como_executar?esc(a.como_executar):"—")+"</td>" +
        "<td>"+(a.recursos_necessarios?esc(a.recursos_necessarios):"—")+"</td>" +
        "<td>"+(a.dono?esc(a.dono):"—")+"</td>" +
        "<td class='"+(prazoAtras?"v-despesa":"")+"'>"+(a.prazo?dataBR(a.prazo):"—")+"</td>" +
        "<td><span class='badge-status "+(cls||"")+"'>"+STATUS_META[a.status]+"</span></td>" +
        "<td>"+(a.trouxe_resultado?esc(a.trouxe_resultado):"—")+"</td>" +
        "<td><button class='btn peq contorno' data-ed-acao='"+a.id+"'>Editar</button> <button class='btn peq perigo' data-del-acao='"+a.id+"'>Apagar</button></td>" +
        "</tr>";
    }).join("") : "<tr><td colspan='11' class='vazio'>Nenhuma ação cadastrada para este mês.</td></tr>";
    if (atrasadas>0) {
      var avEl = document.createElement("p"); avEl.className="ajuda"; avEl.style.color="#8C2016"; avEl.style.margin="8px 0 0";
      avEl.textContent = "⚠️ "+atrasadas+" ação(ões) com prazo vencido. Adicione novas ações ou atualize os prazos.";
      document.getElementById("tabelaAcoesMeta").parentElement.appendChild(avEl);
    }
  }

  // form meta
  document.getElementById("metaMes").value = hojeStr.slice(0,7);
  document.getElementById("formMeta").addEventListener("submit", async function(e){
    e.preventDefault();
    var mes = document.getElementById("metaMes").value;
    var valor = lerValor(document.getElementById("metaValorInput").value);
    if (!mes||!(valor>0)){aviso("Preencha o mês e o valor da meta.",true);return;}
    var mesRef = mes+"-01";
    var b=this.querySelector("[type=submit]"); b.disabled=true;
    var r=await supa().from("metas_receita").upsert({perfil_id:pid,empresa_id:eid||null,mes_referencia:mesRef,valor_meta:valor},{onConflict:"perfil_id,empresa_id,mes_referencia"});
    b.disabled=false;
    if(r.error){aviso("Não foi possível salvar.",true);return;}
    aviso("Meta salva!"); await carregar(); desenharFluxo();
  });
  document.getElementById("tabelaMetas").addEventListener("click", async function(e){
    var bd=e.target.closest("[data-del-meta]"); if(!bd) return;
    if(!confirm("Apagar esta meta?")) return;
    await supa().from("metas_receita").delete().eq("id",bd.dataset.delMeta); aviso("Meta apagada."); await carregar(); desenharFluxo();
  });

  // form ações da meta
  document.getElementById("btNovaAcaoMeta").addEventListener("click", function(){
    editAcaoMetaId=null; document.getElementById("formAcaoMeta").reset();
    document.getElementById("amStatus").value="a_fazer";
    document.getElementById("formAcaoMetaWrap").hidden=false;
    document.getElementById("amSalvar").textContent="Salvar ação";
    document.getElementById("formAcaoMeta").scrollIntoView({behavior:"smooth",block:"start"});
  });
  document.getElementById("amCancelar").addEventListener("click", function(){
    document.getElementById("formAcaoMetaWrap").hidden=true; editAcaoMetaId=null;
  });
  document.getElementById("formAcaoMeta").addEventListener("submit", async function(e){
    e.preventDefault();
    var prob=document.getElementById("amProb").value.trim(), acao=document.getElementById("amAcao").value.trim();
    if(!prob||!acao){aviso("Preencha pelo menos o problema e a ação.",true);return;}
    var reg={perfil_id:pid,empresa_id:eid||null,mes_referencia:mesISO(mesAtual),problema:prob,causa_raiz:document.getElementById("amCausa").value.trim()||null,acao:acao,como_executar:document.getElementById("amComo").value.trim()||null,recursos_necessarios:document.getElementById("amRecursos").value.trim()||null,dono:document.getElementById("amDono").value.trim()||null,prazo:document.getElementById("amPrazo").value||null,status:document.getElementById("amStatus").value,trouxe_resultado:document.getElementById("amResultado").value.trim()||null};
    var b=document.getElementById("amSalvar"); b.disabled=true;
    var r=editAcaoMetaId?await supa().from("acoes_meta").update(reg).eq("id",editAcaoMetaId):await supa().from("acoes_meta").insert(reg);
    b.disabled=false;
    if(r.error){aviso("Não foi possível salvar.",true);return;}
    aviso(editAcaoMetaId?"Ação atualizada.":"Ação registrada!"); document.getElementById("formAcaoMetaWrap").hidden=true; editAcaoMetaId=null; await carregar(); desenharFluxo();
  });
  document.getElementById("secaoAcoesMeta").addEventListener("click", async function(e){
    var be=e.target.closest("[data-ed-acao]"), bd=e.target.closest("[data-del-acao]");
    if(be){
      var a=acoesMeta.find(function(x){return x.id===be.dataset.edAcao;}); if(!a) return;
      editAcaoMetaId=a.id;
      ["amProb","amCausa","amAcao","amComo","amRecursos","amDono","amResultado"].forEach(function(id){
        var campo=id.replace("am","").toLowerCase(); document.getElementById(id).value=a[{amProb:"problema",amCausa:"causa_raiz",amAcao:"acao",amComo:"como_executar",amRecursos:"recursos_necessarios",amDono:"dono",amResultado:"trouxe_resultado"}[id]]||"";
      });
      document.getElementById("amPrazo").value=a.prazo||""; document.getElementById("amStatus").value=a.status;
      document.getElementById("amSalvar").textContent="Salvar alteração"; document.getElementById("formAcaoMetaWrap").hidden=false;
      document.getElementById("formAcaoMeta").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if(bd){
      if(!confirm("Apagar esta ação?")) return;
      await supa().from("acoes_meta").delete().eq("id",bd.dataset.delAcao); aviso("Ação apagada."); await carregar(); desenharFluxo();
    }
  });

  // ── SERVIÇOS FUTUROS COM CUSTOS PROJETADOS ──
  var itensCusto = [], servicos = [], servicoItens = [], editItemId = null, editServicoId = null, servicoAberto = null;

  async function carregarServicos() {
    var [ri, rs] = await Promise.all([
      filtro(supa().from("itens_custo").select("*").eq("ativo", true).order("nome")),
      filtro(supa().from("servicos_agendados").select("*").order("data_execucao"))
    ]);
    itensCusto = ri.data || []; servicos = rs.data || [];
    if (servicos.length) {
      var rsi = await supa().from("servico_itens").select("*").in("servico_id", servicos.map(function(s){return s.id;}));
      servicoItens = rsi.data || [];
    } else servicoItens = [];
  }

  // custo corrigido pela inflação até a data de execução
  function custoNaData(custoHoje, inflacaoAnual, dataExec) {
    var anos = (new Date(dataExec+"T12:00:00") - hoje) / (365.25*24*3600*1000);
    if (anos <= 0) return custoHoje;
    return custoHoje * Math.pow(1 + (inflacaoAnual||0)/100, anos);
  }

  function custoTotalServico(s) {
    return servicoItens.filter(function(i){return i.servico_id===s.id;})
      .reduce(function(t,i){ return t + custoNaData(+i.custo_unitario_hoje, +i.inflacao_anual, s.data_execucao) * (+i.quantidade); }, 0);
  }

  function desenharServicos() {
    // KPIs
    var futuros = servicos.filter(function(s){return s.status!=="cancelado";});
    var totalReceber = futuros.reduce(function(t,s){return t + (+s.valor_total - +s.valor_pago);},0);
    var totalPago = futuros.reduce(function(t,s){return t + (+s.valor_pago);},0);
    var totalCusto = futuros.reduce(function(t,s){return t + custoTotalServico(s);},0);
    var margem = totalPago + totalReceber - totalCusto;
    document.getElementById("kpisServicos").innerHTML = [
      ["Serviços agendados", futuros.length, "a executar"],
      ["Já recebido", brl(totalPago), "pagamentos antecipados"],
      ["A receber", brl(totalReceber), "saldo dos contratos"],
      ["Custo projetado", brl(totalCusto), "corrigido pela inflação"],
      ["Margem prevista", '<span class="'+(margem>=0?"sobe":"")+'">'+brl(margem)+"</span>", "receita menos custo"]
    ].map(function(k){return '<div class="kpi"><small>'+k[0]+'</small><b>'+k[1]+'</b><span>'+k[2]+'</span></div>';}).join("");

    // itens de custo
    document.getElementById("listaItens").innerHTML = itensCusto.length ? itensCusto.map(function(i){
      return "<tr><td><b>"+esc(i.nome)+"</b>"+(i.unidade&&i.unidade!=="unidade"?' <span class="vazio" style="padding:0">/'+esc(i.unidade)+"</span>":"")+"</td>" +
        "<td>"+(i.categoria?esc(i.categoria):"—")+"</td>" +
        '<td class="n">'+brl(i.custo_atual)+"</td>" +
        '<td class="n">'+(i.inflacao_anual?(+i.inflacao_anual).toFixed(1)+"%":"—")+"</td>" +
        '<td><button class="btn peq contorno" type="button" data-ed-item="'+i.id+'">Editar</button> <button class="btn peq perigo" type="button" data-del-item="'+i.id+'">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="vazio">Nenhum item cadastrado.</td></tr>';

    // serviços
    document.getElementById("listaServicos").innerHTML = servicos.length ? servicos.map(function(s){
      var custo = custoTotalServico(s);
      var receita = +s.valor_total;
      var margem = receita - custo;
      var nItens = servicoItens.filter(function(i){return i.servico_id===s.id;}).length;
      var saldo = receita - (+s.valor_pago);
      var diasAte = Math.round((new Date(s.data_execucao+"T12:00:00") - hoje)/86400000);
      return '<div class="sessao"><div class="sessao-topo"><b>'+esc(s.cliente_nome)+' — '+esc(s.descricao)+'</b>' +
        '<span class="selo'+(s.status==="executado"?" ok":"")+'">'+({agendado:"Agendado",em_preparacao:"Em preparação",executado:"Executado",cancelado:"Cancelado"}[s.status])+'</span></div>' +
        '<div class="grade g3" style="gap:10px;margin:8px 0">' +
          '<div><small class="acao-info">Valor</small><br><b>'+brl(receita)+'</b>'+(saldo>0?'<br><span class="acao-info">falta '+brl(saldo)+'</span>':'<br><span class="acao-info v-receita">quitado</span>')+'</div>' +
          '<div><small class="acao-info">Custo projetado</small><br><b class="v-despesa">'+brl(custo)+'</b><br><span class="acao-info">'+nItens+(nItens===1?" item":" itens")+'</span></div>' +
          '<div><small class="acao-info">Margem prevista</small><br><b class="'+(margem>=0?"v-receita":"v-despesa")+'">'+brl(margem)+'</b><br><span class="acao-info">'+(receita>0?pct(margem/receita):"—")+'</span></div>' +
        '</div>' +
        '<span class="acao-info">Execução em '+dataBR(s.data_execucao)+(diasAte>0?" · faltam "+diasAte+" dias":(diasAte===0?" · é hoje!":" · já passou"))+(s.data_pagamento?" · pago em "+dataBR(s.data_pagamento):"")+'</span>' +
        '<div class="acoes" style="margin-top:8px">' +
        '<button class="btn peq" type="button" data-itens-serv="'+s.id+'">Montar custos</button>' +
        '<button class="btn peq contorno" type="button" data-ed-serv="'+s.id+'">Editar</button>' +
        '<button class="btn peq perigo" type="button" data-del-serv="'+s.id+'">Apagar</button></div></div>';
    }).join("") : '<p class="vazio">Nenhum serviço agendado. Cadastre acima.</p>';
  }

  // form item de custo
  function limparFormItem(){ editItemId=null; document.getElementById("formItem").reset(); document.getElementById("itUnid").value="unidade"; document.getElementById("itInfl").value="0"; document.getElementById("itSalvar").textContent="Salvar item"; document.getElementById("itCancelar").hidden=true; }
  document.getElementById("itCancelar").addEventListener("click", limparFormItem);
  document.getElementById("formItem").addEventListener("submit", async function(e){
    e.preventDefault();
    var nome=document.getElementById("itNome").value.trim(), custo=lerValor(document.getElementById("itCusto").value);
    if(!nome||!(custo>=0)){aviso("Preencha o nome e o custo.",true);return;}
    var reg={perfil_id:pid,empresa_id:eid||null,nome:nome,categoria:document.getElementById("itCat").value.trim()||null,
      custo_atual:custo,inflacao_anual:lerValor(document.getElementById("itInfl").value)||0,unidade:document.getElementById("itUnid").value.trim()||"unidade"};
    var b=document.getElementById("itSalvar"); b.disabled=true;
    var r=editItemId?await supa().from("itens_custo").update(reg).eq("id",editItemId):await supa().from("itens_custo").insert(reg);
    b.disabled=false;
    if(r.error){aviso("Não foi possível salvar.",true);return;}
    aviso(editItemId?"Item atualizado.":"Item salvo!"); limparFormItem(); await carregarServicos(); desenharServicos();
  });
  document.getElementById("listaItens").addEventListener("click", async function(e){
    var be=e.target.closest("[data-ed-item]"), bd=e.target.closest("[data-del-item]");
    if(be){
      var i=itensCusto.find(function(x){return x.id===be.dataset.edItem;}); if(!i) return;
      editItemId=i.id; document.getElementById("itNome").value=i.nome; document.getElementById("itCat").value=i.categoria||"";
      document.getElementById("itCusto").value=String(i.custo_atual).replace(".",","); document.getElementById("itInfl").value=i.inflacao_anual||0;
      document.getElementById("itUnid").value=i.unidade||"unidade";
      document.getElementById("itSalvar").textContent="Salvar alteração"; document.getElementById("itCancelar").hidden=false;
      document.getElementById("formItem").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if(bd){
      var i=itensCusto.find(function(x){return x.id===bd.dataset.delItem;}); if(!i||!confirm("Apagar o item \""+i.nome+"\"?")) return;
      await supa().from("itens_custo").delete().eq("id",i.id); aviso("Item apagado."); await carregarServicos(); desenharServicos();
    }
  });

  // form serviço
  function limparFormServico(){ editServicoId=null; document.getElementById("formServico").reset(); document.getElementById("svSalvar").textContent="Salvar serviço"; document.getElementById("svCancelar").hidden=true; }
  document.getElementById("svCancelar").addEventListener("click", limparFormServico);
  document.getElementById("formServico").addEventListener("submit", async function(e){
    e.preventDefault();
    var cli=document.getElementById("svCliente").value.trim(), desc=document.getElementById("svDesc").value.trim();
    var total=lerValor(document.getElementById("svTotal").value), exec=document.getElementById("svDataExec").value;
    if(!cli||!desc||!(total>0)||!exec){aviso("Preencha cliente, serviço, valor e data de execução.",true);return;}
    var reg={perfil_id:pid,empresa_id:eid||null,cliente_nome:cli,descricao:desc,valor_total:total,
      valor_pago:lerValor(document.getElementById("svPago").value)||0,
      data_pagamento:document.getElementById("svDataPag").value||null,data_execucao:exec};
    var b=document.getElementById("svSalvar"); b.disabled=true;
    var r=editServicoId?await supa().from("servicos_agendados").update(reg).eq("id",editServicoId):await supa().from("servicos_agendados").insert(reg);
    b.disabled=false;
    if(r.error){aviso("Não foi possível salvar.",true);return;}
    aviso(editServicoId?"Serviço atualizado.":"Serviço agendado!"); limparFormServico(); await carregarServicos(); desenharServicos();
  });
  document.getElementById("listaServicos").addEventListener("click", async function(e){
    var bi=e.target.closest("[data-itens-serv]"), be=e.target.closest("[data-ed-serv]"), bd=e.target.closest("[data-del-serv]");
    if(bi){ abrirItensServico(bi.dataset.itensServ); }
    if(be){
      var s=servicos.find(function(x){return x.id===be.dataset.edServ;}); if(!s) return;
      editServicoId=s.id;
      document.getElementById("svCliente").value=s.cliente_nome; document.getElementById("svDesc").value=s.descricao;
      document.getElementById("svTotal").value=String(s.valor_total).replace(".",","); document.getElementById("svPago").value=s.valor_pago?String(s.valor_pago).replace(".",","):"";
      document.getElementById("svDataPag").value=s.data_pagamento||""; document.getElementById("svDataExec").value=s.data_execucao;
      document.getElementById("svSalvar").textContent="Salvar alteração"; document.getElementById("svCancelar").hidden=false;
      document.getElementById("formServico").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if(bd){
      var s=servicos.find(function(x){return x.id===bd.dataset.delServ;}); if(!s||!confirm("Apagar o serviço de "+s.cliente_nome+"?")) return;
      await supa().from("servicos_agendados").delete().eq("id",s.id); aviso("Serviço apagado."); await carregarServicos(); desenharServicos();
    }
  });

  // janela de composição de custos
  var jis = document.getElementById("janelaItensServico");
  function abrirItensServico(sid){
    servicoAberto = servicos.find(function(x){return x.id===sid;}); if(!servicoAberto) return;
    document.getElementById("jisTitulo").textContent = servicoAberto.cliente_nome + " — " + servicoAberto.descricao;
    document.getElementById("jisSub").textContent = "Execução em " + dataBR(servicoAberto.data_execucao) + ". Os custos abaixo já vêm corrigidos pela inflação até essa data.";
    document.getElementById("jisItem").innerHTML = itensCusto.length ? itensCusto.map(function(i){return '<option value="'+i.id+'">'+esc(i.nome)+" ("+brl(i.custo_atual)+")</option>";}).join("") : '<option value="">Cadastre itens primeiro</option>';
    desenharItensServico();
    jis.showModal();
  }
  function desenharItensServico(){
    if(!servicoAberto) return;
    var itens = servicoItens.filter(function(i){return i.servico_id===servicoAberto.id;});
    var totalHoje=0, totalFuturo=0;
    document.getElementById("jisLista").innerHTML = itens.length ? itens.map(function(i){
      var cHoje = (+i.custo_unitario_hoje)*(+i.quantidade);
      var cFut = custoNaData(+i.custo_unitario_hoje,+i.inflacao_anual,servicoAberto.data_execucao)*(+i.quantidade);
      totalHoje+=cHoje; totalFuturo+=cFut;
      return "<tr><td><b>"+esc(i.nome_item)+"</b></td><td class='n'>"+(+i.quantidade)+"</td>" +
        "<td class='n'>"+brl(i.custo_unitario_hoje)+"</td>" +
        "<td class='n'>"+(i.inflacao_anual?(+i.inflacao_anual).toFixed(1)+"%":"—")+"</td>" +
        "<td class='n'><b>"+brl(cFut)+"</b></td>" +
        "<td><button class='btn peq perigo' type='button' data-del-si='"+i.id+"'>Remover</button></td></tr>";
    }).join("") : "<tr><td colspan='6' class='vazio'>Nenhum item adicionado.</td></tr>";
    document.getElementById("jisTotais").innerHTML = itens.length ?
      "<tr style='font-weight:700;background:#F4EFE5'><td colspan='2'>TOTAL</td><td class='n'>"+brl(totalHoje)+"</td><td></td><td class='n'><b>"+brl(totalFuturo)+"</b></td><td></td></tr>" +
      "<tr><td colspan='6' class='acao-info'>Diferença pela inflação: "+brl(totalFuturo-totalHoje)+"</td></tr>" : "";
  }
  document.getElementById("jisFechar").addEventListener("click", function(){ jis.close(); desenharServicos(); });
  document.getElementById("formAddItemServico").addEventListener("submit", async function(e){
    e.preventDefault();
    var itemId=document.getElementById("jisItem").value, qtd=lerValor(document.getElementById("jisQtd").value)||1;
    if(!itemId||!servicoAberto){aviso("Escolha um item.",true);return;}
    var it=itensCusto.find(function(x){return x.id===itemId;});
    var r=await supa().from("servico_itens").insert({servico_id:servicoAberto.id,item_custo_id:it.id,nome_item:it.nome,
      quantidade:qtd,custo_unitario_hoje:it.custo_atual,inflacao_anual:it.inflacao_anual||0});
    if(r.error){aviso("Não foi possível adicionar.",true);return;}
    document.getElementById("jisQtd").value="1";
    await carregarServicos(); desenharItensServico();
  });
  document.getElementById("jisLista").addEventListener("click", async function(e){
    var bd=e.target.closest("[data-del-si]"); if(!bd) return;
    await supa().from("servico_itens").delete().eq("id",bd.dataset.delSi);
    await carregarServicos(); desenharItensServico();
  });

  // ── desenhar tudo ──
  function desenharFluxo() {
    desenharCalendario();
    desenharCartoes();
    desenharGastos();
    desenharRecebimentos();
    desenharDividas();
    if (abaFluxo==="projecao") desenharProjecao();
    if (abaFluxo==="meta") desenharMeta();
    if (abaFluxo==="servicos") desenharServicos();
  }

  // no calendário mostrar só receitas e custos futuros (não todos os recebimentos)
  recsDoDia = function(diaStr) {
    return recebimentos.filter(function(r){
      if (r.data_prevista !== diaStr) return false;
      // custo de atendimento: mostra na data do custo
      if ((r.tipo==="custo_atendimento"||r.tipo==="custo_fixo_futuro") && r.data_custo) return r.data_custo === diaStr;
      return true;
    });
  };

  // ── iniciar ──
  await carregar();
  desenharFluxo();
};

function esc(s) { return String(s||"").replace(/[&<>"']/g, function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
