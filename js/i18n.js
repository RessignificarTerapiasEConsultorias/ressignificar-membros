/* Tradução automática por frase: só se aplica ao cliente que escolher outro idioma, e só na visão dele.
   Mauricio, suporte, vendedores e profissionais sempre veem a plataforma em português. */
(function () {
  var IDIOMAS = { pt: "Português", en: "English", es: "Español", sv: "Svenska" };

  var DIC = {
    en: {
      "A vencer": "Due soon", "Abrir e lançar": "Open and record", "Abrir meu processo": "Open my process",
      "Abrir minha mentoria": "Open my mentoring", "Carregando...": "Loading...", "Contratos": "Contracts",
      "Dashboard": "Dashboard", "Data": "Date", "Em atraso": "Overdue", "Hora": "Time", "Meu atendimento": "My care",
      "Minha conta": "My account", "Módulos": "Modules", "Nenhum serviço ativo no momento.": "No active service at the moment.",
      "Nenhuma sessão registrada ainda.": "No session recorded yet.", "Pago em ": "Paid on ", "Produtos": "Products",
      "Projetos de melhoria": "Improvement projects", "Próximo pagamento: ": "Next payment: ", "Sair": "Log out",
      "Serviço": "Service", "Seu processo terapêutico": "Your therapy process", "Seus pagamentos": "Your payments",
      "Seus serviços": "Your services", "Status": "Status", "Sua mentoria": "Your mentoring", "Sua área": "Your area",
      "Suas empresas e finanças": "Your companies and finances",
      "Suas áreas de trabalho, ações combinadas, sessões e testes. Tudo sigiloso.": "Your work areas, agreed actions, sessions and tests. All confidential.",
      "Tipo": "Type", "Tudo em dia. Obrigado!": "Everything is up to date. Thank you!", "Valor": "Amount",
      "Veja o que você já tem e os próximos passos recomendados para você.": "See what you already have and the next steps recommended for you.",
      "Veja seus contratos e assine diretamente pela plataforma.": "View your contracts and sign directly through the platform.",
      "Vencimento": "Due date", "Vendas da equipe": "Team sales", "Ver POPs e manuais": "View SOPs and manuals",
      "Ver contratos": "View contracts", "Ver histórico completo": "View full history", "Ver produtos": "View products",
      "Ver projetos": "View projects", "Você tem ": "You have ", "Agendado": "Scheduled", "Avulsa": "One-off",
      "Cancelado": "Cancelled", "Empresa": "Company", "Faltou": "Missed", "Orçamento pessoal": "Personal budget",
      "Profissional responsável: ": "Responsible professional: ", "Realizado": "Completed",
      "Aqui você acompanha o seu processo e mantém os seus números em dia.": "Here you can track your process and keep your numbers up to date.",
      "Voltar ao painel": "Back to dashboard", "Voltar": "Back", "Salvar": "Save", "Cancelar": "Cancel",
      "Apagar": "Delete", "Editar": "Edit", "Adicionar": "Add", "Buscar": "Search", "Confirmar": "Confirm",
      "Fechar": "Close", "Todos": "All", "Sim": "Yes", "Não": "No", "Novo": "New", "Criar": "Create",
      "Enviar": "Send", "Atualizar": "Update"
    },
    es: {
      "A vencer": "Por vencer", "Abrir e lançar": "Abrir y registrar", "Abrir meu processo": "Abrir mi proceso",
      "Abrir minha mentoria": "Abrir mi mentoría", "Carregando...": "Cargando...", "Contratos": "Contratos",
      "Dashboard": "Panel", "Data": "Fecha", "Em atraso": "Atrasado", "Hora": "Hora", "Meu atendimento": "Mi atención",
      "Minha conta": "Mi cuenta", "Módulos": "Módulos", "Nenhum serviço ativo no momento.": "Ningún servicio activo en este momento.",
      "Nenhuma sessão registrada ainda.": "Ninguna sesión registrada todavía.", "Pago em ": "Pagado el ", "Produtos": "Productos",
      "Projetos de melhoria": "Proyectos de mejora", "Próximo pagamento: ": "Próximo pago: ", "Sair": "Cerrar sesión",
      "Serviço": "Servicio", "Seu processo terapêutico": "Tu proceso terapéutico", "Seus pagamentos": "Tus pagos",
      "Seus serviços": "Tus servicios", "Status": "Estado", "Sua mentoria": "Tu mentoría", "Sua área": "Tu área",
      "Suas empresas e finanças": "Tus empresas y finanzas",
      "Suas áreas de trabalho, ações combinadas, sessões e testes. Tudo sigiloso.": "Tus áreas de trabajo, acciones acordadas, sesiones y pruebas. Todo confidencial.",
      "Tipo": "Tipo", "Tudo em dia. Obrigado!": "Todo al día. ¡Gracias!", "Valor": "Valor",
      "Veja o que você já tem e os próximos passos recomendados para você.": "Mira lo que ya tienes y los próximos pasos recomendados para ti.",
      "Veja seus contratos e assine diretamente pela plataforma.": "Mira tus contratos y fírmalos directamente en la plataforma.",
      "Vencimento": "Vencimiento", "Vendas da equipe": "Ventas del equipo", "Ver POPs e manuais": "Ver POPs y manuales",
      "Ver contratos": "Ver contratos", "Ver histórico completo": "Ver historial completo", "Ver produtos": "Ver productos",
      "Ver projetos": "Ver proyectos", "Você tem ": "Tienes ", "Agendado": "Programado", "Avulsa": "Puntual",
      "Cancelado": "Cancelado", "Empresa": "Empresa", "Faltou": "Falta", "Orçamento pessoal": "Presupuesto personal",
      "Profissional responsável: ": "Profesional responsable: ", "Realizado": "Realizado",
      "Aqui você acompanha o seu processo e mantém os seus números em dia.": "Aquí puedes seguir tu proceso y mantener tus números al día.",
      "Voltar ao painel": "Volver al panel", "Voltar": "Volver", "Salvar": "Guardar", "Cancelar": "Cancelar",
      "Apagar": "Eliminar", "Editar": "Editar", "Adicionar": "Añadir", "Buscar": "Buscar", "Confirmar": "Confirmar",
      "Fechar": "Cerrar", "Todos": "Todos", "Sim": "Sí", "Não": "No", "Novo": "Nuevo", "Criar": "Crear",
      "Enviar": "Enviar", "Atualizar": "Actualizar"
    },
    sv: {
      "A vencer": "Förfaller snart", "Abrir e lançar": "Öppna och registrera", "Abrir meu processo": "Öppna min process",
      "Abrir minha mentoria": "Öppna mitt mentorskap", "Carregando...": "Laddar...", "Contratos": "Avtal",
      "Dashboard": "Översikt", "Data": "Datum", "Em atraso": "Försenad", "Hora": "Tid", "Meu atendimento": "Min vård",
      "Minha conta": "Mitt konto", "Módulos": "Moduler", "Nenhum serviço ativo no momento.": "Ingen aktiv tjänst just nu.",
      "Nenhuma sessão registrada ainda.": "Ingen session registrerad ännu.", "Pago em ": "Betald den ", "Produtos": "Produkter",
      "Projetos de melhoria": "Förbättringsprojekt", "Próximo pagamento: ": "Nästa betalning: ", "Sair": "Logga ut",
      "Serviço": "Tjänst", "Seu processo terapêutico": "Din terapiprocess", "Seus pagamentos": "Dina betalningar",
      "Seus serviços": "Dina tjänster", "Status": "Status", "Sua mentoria": "Ditt mentorskap", "Sua área": "Ditt område",
      "Suas empresas e finanças": "Dina företag och ekonomi",
      "Suas áreas de trabalho, ações combinadas, sessões e testes. Tudo sigiloso.": "Dina arbetsområden, överenskomna åtgärder, sessioner och tester. Allt är konfidentiellt.",
      "Tipo": "Typ", "Tudo em dia. Obrigado!": "Allt är uppdaterat. Tack!", "Valor": "Belopp",
      "Veja o que você já tem e os próximos passos recomendados para você.": "Se vad du redan har och nästa rekommenderade steg för dig.",
      "Veja seus contratos e assine diretamente pela plataforma.": "Se dina avtal och signera direkt via plattformen.",
      "Vencimento": "Förfallodatum", "Vendas da equipe": "Teamets försäljning", "Ver POPs e manuais": "Visa rutiner och manualer",
      "Ver contratos": "Visa avtal", "Ver histórico completo": "Visa fullständig historik", "Ver produtos": "Visa produkter",
      "Ver projetos": "Visa projekt", "Você tem ": "Du har ", "Agendado": "Bokad", "Avulsa": "Engångs",
      "Cancelado": "Avbokad", "Empresa": "Företag", "Faltou": "Uteblev", "Orçamento pessoal": "Personlig budget",
      "Profissional responsável: ": "Ansvarig yrkesperson: ", "Realizado": "Genomförd",
      "Aqui você acompanha o seu processo e mantém os seus números em dia.": "Här följer du din process och håller dina siffror uppdaterade.",
      "Voltar ao painel": "Tillbaka till panelen", "Voltar": "Tillbaka", "Salvar": "Spara", "Cancelar": "Avbryt",
      "Apagar": "Ta bort", "Editar": "Redigera", "Adicionar": "Lägg till", "Buscar": "Sök", "Confirmar": "Bekräfta",
      "Fechar": "Stäng", "Todos": "Alla", "Sim": "Ja", "Não": "Nej", "Novo": "Ny", "Criar": "Skapa",
      "Enviar": "Skicka", "Atualizar": "Uppdatera"
    }
  };

  function vale(dic, chave) { return chave && dic[chave] && dic[chave] !== chave ? dic[chave] : null; }

  // para frases dinâmicas (ex.: "Próximo pagamento: R$ 50,00"), troca só o trecho fixo que bate com o dicionário
  function traduzirTrecho(tx, dic) {
    var v = vale(dic, tx.trim());
    if (v) return tx.replace(tx.trim(), v);
    var chaves = Object.keys(dic).filter(function (k) { return k.length >= 5; }).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < chaves.length; i++) {
      var k = chaves[i];
      if (tx.indexOf(k) !== -1 && dic[k] !== k) return tx.split(k).join(dic[k]);
    }
    return tx;
  }

  var IGNORAR_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
  function dentroDeTagIgnorada(no) {
    var el = no.nodeType === 1 ? no : no.parentElement;
    while (el) { if (IGNORAR_TAGS[el.tagName]) return true; el = el.parentElement; }
    return false;
  }
  var filtroTexto = { acceptNode: function (no) { return dentroDeTagIgnorada(no) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } };

  function traduzirNo(raiz, dic) {
    if (!raiz) return;
    if (raiz.nodeType === 3) {
      if (dentroDeTagIgnorada(raiz)) return;
      var novoTxt = traduzirTrecho(raiz.nodeValue, dic);
      if (novoTxt !== raiz.nodeValue) raiz.nodeValue = novoTxt;
      return;
    }
    if (raiz.nodeType !== 1 || IGNORAR_TAGS[raiz.tagName]) return;
    var walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, filtroTexto);
    var no;
    while ((no = walker.nextNode())) {
      var novo = traduzirTrecho(no.nodeValue, dic);
      if (novo !== no.nodeValue) no.nodeValue = novo;
    }
    if (raiz.hasAttribute && raiz.hasAttribute("placeholder")) {
      var ph = vale(dic, raiz.getAttribute("placeholder")); if (ph) raiz.setAttribute("placeholder", ph);
    }
    if (raiz.querySelectorAll) {
      raiz.querySelectorAll("[placeholder]").forEach(function (el) {
        var p = vale(dic, el.getAttribute("placeholder")); if (p) el.setAttribute("placeholder", p);
      });
    }
  }

  function ligarTraducaoContinua(dic) {
    traduzirNo(document.body, dic);
    var pausado = false;
    var obs = new MutationObserver(function (muts) {
      if (pausado) return; pausado = true;
      muts.forEach(function (m) {
        if (m.type === "characterData") traduzirNo(m.target, dic);
        m.addedNodes && m.addedNodes.forEach(function (n) { traduzirNo(n, dic); });
      });
      pausado = false;
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function inserirSeletor(uid, atual, dadosAtuais) {
    var alvo = document.querySelector(".usuario");
    if (!alvo || document.getElementById("seletorIdioma")) return;
    var sel = document.createElement("select");
    sel.id = "seletorIdioma";
    sel.setAttribute("aria-label", "Idioma / Language");
    sel.style.cssText = "border-radius:8px;border:1px solid rgba(255,255,255,.4);padding:4px 8px;font-size:13px;background:transparent;color:inherit";
    Object.keys(IDIOMAS).forEach(function (k) {
      var o = document.createElement("option"); o.value = k; o.textContent = IDIOMAS[k];
      if (k === atual) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", async function () {
      var novo = Object.assign({}, dadosAtuais || {}, { idioma: sel.value });
      await supa().from("preferencias").upsert({ perfil_id: uid, dados: novo }, { onConflict: "perfil_id" });
      location.reload();
    });
    alvo.insertBefore(sel, alvo.firstChild);
  }

  async function iniciar() {
    if (typeof supa !== "function") { setTimeout(iniciar, 80); return; }
    try {
      var sess = await supa().auth.getUser();
      var uid = sess && sess.data && sess.data.user ? sess.data.user.id : null;
      if (!uid) { setTimeout(iniciar, 150); return; }
      var rp = await supa().from("perfis").select("papel").eq("id", uid).maybeSingle();
      if (!rp.data || rp.data.papel !== "cliente") return; // só o cliente escolhe idioma; equipe sempre vê em português
      var rpref = await supa().from("preferencias").select("dados").eq("perfil_id", uid).maybeSingle();
      var dadosAtuais = (rpref.data && rpref.data.dados) || {};
      var idioma = dadosAtuais.idioma || "pt";
      var tentativas = 0;
      (function esperarHeader() {
        if (document.querySelector(".usuario")) { inserirSeletor(uid, idioma, dadosAtuais); }
        else if (tentativas++ < 40) setTimeout(esperarHeader, 100);
      })();
      if (idioma !== "pt" && DIC[idioma]) ligarTraducaoContinua(DIC[idioma]);
    } catch (e) { /* silencioso: nunca travar a página por causa do idioma */ }
  }

  iniciar();
})();
