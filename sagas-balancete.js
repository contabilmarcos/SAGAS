// sagas-balancete.js — Módulo Completo de Balancete Analítico e Razão para o SAGAS
(function () {
  'use strict';

  const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const RAZAO_PAGE = 300;
  const CONTAS_CENTRO_EXCECAO = ['1.01.01.02.0004'];

  let TODOS = [];
  let PLANO_CONTAS = [];
  let GRUPO1 = [
    ['1', 'Ativo'],
    ['2', 'Passivo'],
    ['3', 'Custos e Despesas'],
    ['4', 'Resultado do Exercício']
  ];
  let GRUPO2 = [];
  let GRUPO3 = [];
  let GRUPO4 = [];
  let REDUZIDO_MAP = {};
  let ANOS_HIST = [];
  let selectedAnos = new Set();
  let activeYear = new Date().getFullYear();
  let selectedMeses = new Set();
  let selectedCentro = '';
  let YEAR_DATA = [];
  let filtered = [];
  let CENTRO_OPTIONS_CACHE = [];

  let modoConsolidado = false;
  let modoSemMovimento = false;

  // Estado do Razão e Conciliação
  let razaoContaId = null;
  let razaoContaNome = null;
  let razaoRows = [];
  let razaoFiltered = [];
  let razaoPage = 1;
  let _saldoRazaoCache = null;
  let concilModo = false;
  let concilSelecionados = new Set();

  const fmtBRL = v => {
    const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? `-R$ ${s}` : `R$ ${s}`;
  };
  const fmtAbs = v => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function isDisp(c) {
    return String(c || '').startsWith('1.01.01') && !CONTAS_CENTRO_EXCECAO.includes(c);
  }

  function classify(c, t) {
    for (const [p, l] of t) {
      if (c === p || String(c).startsWith(p + '.')) return l;
    }
    return null;
  }

  function cmpConta(a, b) {
    const cod = s => String(s || '').includes('|||') ? String(s).split('|||')[0] : String(s || '');
    const segsA = cod(a).split('.').map(Number);
    const segsB = cod(b).split('.').map(Number);
    for (let i = 0; i < Math.max(segsA.length, segsB.length); i++) {
      const na = segsA[i] ?? 0, nb = segsB[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  function injectStyles() {
    if (document.getElementById('sagas-balancete-styles')) return;
    const style = document.createElement('style');
    style.id = 'sagas-balancete-styles';
    style.textContent = `
      #app .content:has(.sbal-root) {
        padding: 0 !important;
        overflow: hidden !important;
      }
      .sbal-root {
        --bg:#1a1b1e; --bg2:#141517; --bg3:#22242a;
        --border:#2c2e33; --border2:#22242a;
        --text:#f4f4f6; --text2:#c4c6cc; --text3:#8c8f99;
        --accent:#16a34a; --accent-lt:#4ade80;
        --green:#63c174; --green-bg:rgba(99,193,116,.08);
        --red:#f07070; --red-bg:rgba(240,112,112,.08);
        --mono:"IBM Plex Mono",Consolas,monospace;
        --sans:"Nunito Sans","Segoe UI",sans-serif;
        --radius:6px;
        font-family:var(--sans); background:var(--bg); color:var(--text);
        font-size:14px; line-height:1.5; display:flex; flex-direction:column;
        height:calc(100vh - 76px); width:100%; overflow:hidden;
      }
      .sbal-header {
        height:52px; background:var(--bg2); border-bottom:1px solid var(--border);
        display:flex; align-items:center; justify-content:space-between; padding:0 16px; gap:12px; flex-shrink:0;
      }
      .sbal-brand { display:flex; align-items:center; gap:10px; font-weight:600; flex-shrink:0; }
      .sbal-abbr {
        font-family:var(--mono); font-size:14px; letter-spacing:.06em; color:var(--accent-lt);
        background:rgba(74,222,128,.12); border:1px solid rgba(74,222,128,.3); padding:2px 8px; border-radius:var(--radius);
      }
      .sbal-title { font-size:14px; color:var(--text2); font-weight:400; }
      .sbal-years { display:flex; align-items:center; gap:4px; flex:1; justify-content:center; flex-wrap:wrap; }
      .sbal-year-tab {
        background:var(--bg3); border:1px solid var(--border); color:var(--text2);
        border-radius:var(--radius); padding:3px 10px; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s;
      }
      .sbal-year-tab:hover { border-color:var(--accent); color:var(--accent-lt); }
      .sbal-year-tab.active { background:var(--accent); border-color:var(--accent); color:#fff; }
      .sbal-filter-bar {
        height:52px; background:var(--bg2); border-bottom:1px solid var(--border2);
        display:flex; align-items:center; gap:12px; padding:0 16px; flex-shrink:0;
      }
      .sbal-filter-group { display:flex; align-items:center; gap:6px; position:relative; }
      .sbal-filter-group label { font-size:11px; color:var(--text3); white-space:nowrap; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
      .sbal-mes-btn {
        background:var(--bg3); border:1px solid var(--border); color:var(--text);
        border-radius:var(--radius); padding:4px 10px; font-size:13px; cursor:pointer; white-space:nowrap;
      }
      .sbal-mes-btn:hover, .sbal-mes-btn.open { border-color:var(--accent); color:var(--accent-lt); }
      .sbal-picker {
        position:absolute; top:calc(100% + 6px); left:0; z-index:200; background:var(--bg2);
        border:1px solid var(--border); border-radius:var(--radius); padding:10px; min-width:190px;
        box-shadow:0 8px 24px rgba(0,0,0,.45);
      }
      .sbal-centro-picker { min-width:340px; max-width:min(500px,70vw); max-height:380px; display:flex; flex-direction:column; padding:0; overflow:hidden; }
      .sbal-centro-search {
        width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text);
        border-radius:var(--radius); padding:6px 9px; font-size:12px; outline:none;
      }
      .sbal-centro-option {
        display:block; width:100%; background:none; border:0; color:var(--text2); text-align:left;
        padding:7px 10px; font-size:12px; cursor:pointer; line-height:1.35;
      }
      .sbal-centro-option:hover { background:var(--bg3); color:var(--text); }
      .sbal-centro-option.active { background:rgba(74,222,128,.12); color:var(--accent-lt); font-weight:600; }
      .sbal-btn-clear {
        background:none; border:1px solid var(--border); color:var(--text2);
        border-radius:var(--radius); padding:4px 12px; font-size:12px; cursor:pointer;
      }
      .sbal-btn-clear:hover { border-color:var(--red); color:var(--red); }
      .sbal-main {
        display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); flex:1; min-height:0; overflow:hidden;
      }
      .sbal-panel-left { display:flex; flex-direction:column; border-right:1px solid var(--border); overflow:hidden; }
      .sbal-panel-right { display:flex; flex-direction:column; overflow:hidden; }
      .sbal-panel-hdr {
        display:flex; align-items:center; justify-content:space-between; padding:10px 14px;
        background:var(--bg2); border-bottom:1px solid var(--border); flex-shrink:0; gap:8px;
      }
      .sbal-panel-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text2); }
      .sbal-scroll { flex:1; overflow:auto; }
      .sbal-root table { width:100%; border-collapse:collapse; }
      .sbal-root thead { position:sticky; top:0; z-index:10; }
      .sbal-root th {
        padding:8px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase;
        letter-spacing:.05em; color:var(--text3); white-space:nowrap; background:var(--bg3); border-bottom:1px solid var(--border);
      }
      .sbal-root td { padding:7px 12px; border-bottom:1px solid var(--border2); font-size:13px; color:var(--text); }
      .sbal-root .col-num { text-align:right; font-family:var(--mono); white-space:nowrap; }
      .sbal-row { cursor:pointer; transition:background .1s; }
      .sbal-row:hover td { background:rgba(56,139,253,.08)!important; }
      .sbal-row.selected td { background:rgba(74,222,128,.08)!important; border-left:2px solid var(--accent-lt); }
      .sbal-lvl-g1 td { background:rgba(31,111,235,.07); font-weight:700; }
      .sbal-lvl-g1 .conta-cell { font-weight:700; font-size:13px; padding-left:6px; }
      .sbal-lvl-g2 td { background:rgba(255,255,255,.015); }
      .sbal-lvl-g2 .conta-cell { font-weight:600; color:var(--text2); padding-left:18px; }
      .sbal-lvl-g3 .conta-cell { color:var(--text2); padding-left:32px; }
      .sbal-lvl-g4 .conta-cell { color:var(--text3); padding-left:46px; font-size:12px; }
      .sbal-lvl-leaf .conta-cell { color:var(--text3); padding-left:60px; font-size:12px; }
      .sbal-toggle-icon {
        display:inline-block; width:13px; margin-right:4px; cursor:pointer; color:var(--text3);
        user-select:none; transition:transform .15s; font-size:9px; vertical-align:middle;
      }
      .collapsed .sbal-toggle-icon { transform:rotate(-90deg); }
      .num-pos { color:#4ade80!important; } .num-neg { color:var(--red)!important; }
      .sr-pos { color:#4ade80; font-family:var(--mono); font-size:12px; }
      .sr-neg { color:var(--red); font-family:var(--mono); font-size:12px; }
      .sr-zero { color:var(--text3); font-family:var(--mono); font-size:12px; }
      .sbal-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:10px; color:var(--text3); font-size:13px; }
      .sbal-concil-bar {
        display:none; align-items:center; gap:16px; padding:10px 16px; background:var(--bg2);
        border-top:1px solid rgba(74,222,128,.25); flex-shrink:0; flex-wrap:wrap;
      }
      .sbal-concil-bar.show { display:flex; }
      tr.sbal-concil-selected td { background:rgba(210,153,34,.12)!important; }
      .sbal-pagination {
        display:flex; align-items:center; gap:4px; padding:8px 12px; justify-content:center;
        border-top:1px solid var(--border2); background:var(--bg2); flex-shrink:0;
      }
      .sbal-pagination button {
        background:var(--bg3); border:1px solid var(--border); color:var(--text2);
        border-radius:var(--radius); padding:3px 9px; font-size:11px; cursor:pointer;
      }
      .sbal-pagination button.active { background:var(--accent); border-color:var(--accent); color:#fff; }
      .sbal-modal-ov {
        display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.6);
        backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px;
      }
      .sbal-modal-ov.show { display:flex; }
      .sbal-modal-box {
        background:#141517; border:1px solid #2c2e33; border-radius:14px; width:620px; max-width:95vw;
        overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,.65); color:#f4f4f6; font-family:var(--sans);
      }
      .sbal-entries-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .sbal-entry-box { border-radius:10px; border:1px solid #22242a; overflow:hidden; background:#1a1b1e; }
      .sbal-entry-box.deb { border-color:rgba(74,222,128,.3); }
      .sbal-entry-box.cre { border-color:rgba(240,112,112,.3); }
    `;
    document.head.appendChild(style);
  }

  function buildHierarchyFromAccounts(accList) {
    PLANO_CONTAS = (accList || []).map(a => ({
      codigo: String(a.code || '').trim(),
      nome: String(a.name || '').trim(),
      reduzido: String(a.reduced_code || '').trim(),
      nivel: String(a.code || '').split('.').filter(Boolean).length
    })).sort((a, b) => cmpConta(a.codigo, b.codigo));

    const mk = n => PLANO_CONTAS.filter(x => x.nivel === n).map(x => [x.codigo, x.nome]);
    const g1 = mk(1), g2 = mk(2), g3 = mk(3), g4 = mk(4);
    if (g1.length) GRUPO1 = g1;
    GRUPO2 = g2;
    GRUPO3 = g3;
    GRUPO4 = g4;
    REDUZIDO_MAP = {};
    for (const c of PLANO_CONTAS) {
      if (c.reduzido) REDUZIDO_MAP[c.codigo] = c.reduzido;
    }
  }

  async function loadDataFromSagas(apiFn, accountsFn) {
    const accList = await accountsFn(true);
    buildHierarchyFromAccounts(accList || []);

    let rawLines = [];
    try {
      const resp = await apiFn('/api/accounting/balancete-lines');
      rawLines = resp.lines || [];
    } catch (_) {
      const d = await apiFn('/api/journal-entries?limit=1000');
      const entries = (d.entries || []).filter(e => e.status === 'POSTED');
      const details = await Promise.all(
        entries.map(e => apiFn(`/api/journal-entries/${e.id}`).then(r => r.entry).catch(() => null))
      );
      for (const ent of details) {
        if (!ent || !Array.isArray(ent.lines)) continue;
        for (const l of ent.lines) {
          rawLines.push({
            line_id: l.id,
            entry_id: ent.id,
            entry_date: ent.entry_date,
            entry_doc: ent.document_number,
            entry_desc: ent.description,
            batch_code: ent.batch_code,
            side: l.side,
            amount_cents: l.amount_cents ?? Math.round(Number(l.amount || 0) * 100),
            line_doc: l.document_number,
            history_complement: l.history_complement,
            history_template_desc: l.history_description,
            account_code: l.account_code,
            reduced_code: l.account_reduced_code,
            account_name: l.account_name,
            cc_code: l.cost_center_code,
            cc_name: l.cost_center_name
          });
        }
      }
    }

    TODOS = [];
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      const valAbs = Math.abs(Number(l.amount_cents || 0) / 100);
      if (!valAbs) continue;
      const valor = l.side === 'D' ? valAbs : -valAbs;
      const data = String(l.entry_date || '').slice(0, 10);
      const ano = Number(data.slice(0, 4)) || new Date().getFullYear();
      const mes = Number(data.slice(5, 7)) || 1;
      const conta = String(l.account_code || '').trim();
      const nome = String(l.account_name || conta).trim();
      const centro = l.cc_name ? (l.cc_code ? `${l.cc_code} - ${l.cc_name}` : l.cc_name) : (l.cc_code || '');
      const comp = [l.history_template_desc, l.history_complement, l.entry_desc].filter(Boolean).join(' - ') || '';
      const doc = l.line_doc || l.entry_doc || '';

      TODOS.push({
        idx: i + 1,
        lancamentoId: l.entry_id,
        conta,
        nome,
        valor: Math.round(valor * 100) / 100,
        tipo: valor > 0 ? 'Débito' : 'Crédito',
        data,
        mes,
        ano,
        centro,
        complemento: comp,
        documento: doc,
        lote: l.batch_code || '',
        grupo1: classify(conta, GRUPO1) || '(Sem grupo)',
        grupo2: classify(conta, GRUPO2) || '(Sem sub-grupo)',
        grupo3: classify(conta, GRUPO3) || '(Sem seção)',
        grupo4: classify(conta, GRUPO4) || '(Sem sub-seção)'
      });
    }

    TODOS.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.lancamentoId).localeCompare(String(b.lancamentoId)));
    TODOS.forEach((r, idx) => { r.idx = idx + 1; });

    ANOS_HIST = [...new Set(TODOS.map(r => r.ano).filter(Boolean))].sort((a, b) => a - b);
    if (!ANOS_HIST.length) ANOS_HIST = [new Date().getFullYear()];
    activeYear = Math.max(...ANOS_HIST);
    selectedAnos = new Set([activeYear]);
  }

  function calcSaldoAcumulado(conta, dataMaxima, centro) {
    const ig = isDisp(conta);
    let s = 0;
    for (const r of TODOS) {
      if (r.conta !== conta || !r.data || r.data > dataMaxima) continue;
      if (!ig && centro && r.centro !== centro) continue;
      s += r.valor;
    }
    return s;
  }

  function buildSaldoRazaoCache(conta, centro) {
    const ig = isDisp(conta);
    const base = TODOS.filter(r => r.conta === conta && (ig || !centro || r.centro === centro));
    base.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : a.idx - b.idx);
    let acc = 0;
    const map = new Map();
    for (const r of base) {
      acc += r.valor;
      map.set(r.idx, acc);
    }
    _saldoRazaoCache = map;
  }

  function renderHTML(container) {
    container.innerHTML = `
      <div class="sbal-root">
        <header class="sbal-header">
          <div class="sbal-brand">
            <span class="sbal-abbr">SAGAS</span>
            <span style="color:var(--border)">|</span>
            <span class="sbal-title">Balancete Analítico</span>
          </div>
          <div class="sbal-years" id="sbalYearTabs"></div>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="sbalHeaderMeta" style="font-family:var(--mono);font-size:11px;color:var(--text3)"></span>
            <button type="button" class="sbal-mes-btn" id="sbalBtnReload">↻ Atualizar lotes</button>
          </div>
        </header>

        <div class="sbal-filter-bar">
          <div class="sbal-filter-group" id="sbalCentroGroup">
            <label>Centro de Custo</label>
            <button type="button" class="sbal-mes-btn" id="sbalCentroBtn">Todos ▾</button>
            <div class="sbal-picker sbal-centro-picker" id="sbalCentroPicker" style="display:none">
              <div style="padding:8px;border-bottom:1px solid var(--border2);background:var(--bg2)">
                <input id="sbalCentroSearch" class="sbal-centro-search" type="text" placeholder="Buscar centro de custo..." autocomplete="off">
              </div>
              <div id="sbalCentroOptions" style="overflow-y:auto;max-height:300px;padding:4px 0"></div>
            </div>
          </div>

          <div class="sbal-filter-group" id="sbalMesGroup">
            <label>Mês</label>
            <button type="button" class="sbal-mes-btn" id="sbalMesBtn">Todos ▾</button>
            <div class="sbal-picker" id="sbalMesPicker" style="display:none">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border2)">
                <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3)">Selecionar Meses</span>
                <button type="button" id="sbalClearMeses" style="background:none;border:none;color:var(--text3);font-size:11px;cursor:pointer">Limpar</button>
              </div>
              <div id="sbalMesCheckboxes"></div>
            </div>
          </div>

          <button type="button" class="sbal-btn-clear" id="sbalBtnClear">✕ Limpar</button>
        </div>

        <div class="sbal-main">
          <!-- Esquerda: Balancete -->
          <div class="sbal-panel-left">
            <div class="sbal-panel-hdr">
              <span class="sbal-panel-title">Balancete</span>
              <div style="display:flex;align-items:center;gap:6px">
                <span id="sbalMeta" style="font-family:var(--mono);font-size:11px;color:var(--text3)"></span>
                <button type="button" id="sbalBtnSemMov" class="sbal-btn-clear" style="padding:3px 10px;font-size:11px;font-weight:600" title="Incluir contas sem movimento no período mas com saldo diferente de zero">∅ Sem Movimento</button>
                <button type="button" id="sbalBtnConsol" class="sbal-btn-clear" style="padding:3px 10px;font-size:11px;font-weight:600" title="Incluir contas sem movimentação no período mas com saldo acumulado">⊕ Consolidado</button>
                <button type="button" id="sbalBtnPdf" style="background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.3);color:#4ade80;border-radius:var(--radius);padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer">PDF</button>
              </div>
            </div>
            <div class="sbal-scroll">
              <table>
                <thead>
                  <tr>
                    <th style="min-width:240px">Conta / Descrição</th>
                    <th class="col-num">Saldo Anterior</th>
                    <th class="col-num">Débito</th>
                    <th class="col-num">Crédito</th>
                    <th class="col-num">Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody id="sbalBody"></tbody>
              </table>
            </div>
          </div>

          <!-- Direita: Razão -->
          <div class="sbal-panel-right">
            <div class="sbal-panel-hdr">
              <span class="sbal-panel-title">Razão</span>
              <span id="sbalRazaoConta" style="font-size:12px;color:var(--accent-lt);font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">— clique em uma conta no balancete —</span>
              <div style="display:flex;align-items:center;gap:6px">
                <span id="sbalRazaoCount" style="font-family:var(--mono);font-size:11px;color:var(--text3)"></span>
                <button type="button" id="sbalBtnConciliar" style="display:none;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.3);color:#4ade80;border-radius:var(--radius);padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer">⊡ Conciliar</button>
                <button type="button" id="sbalBtnExport" style="display:none;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.3);color:#4ade80;border-radius:var(--radius);padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer">Exportar Excel</button>
              </div>
            </div>
            <div class="sbal-scroll" id="sbalRazaoScroll">
              <div class="sbal-empty" id="sbalRazaoEmpty">
                <div style="font-size:36px;opacity:.3">📋</div>
                <div>Selecione uma conta no balancete</div>
                <div style="font-size:11px;color:var(--text3)">O razão da conta aparecerá aqui</div>
              </div>
              <table id="sbalRazaoTable" style="display:none">
                <thead>
                  <tr id="sbalRazaoThead">
                    <th>Data</th>
                    <th>Documento</th>
                    <th>Complemento</th>
                    <th class="col-num">Valor</th>
                    <th class="col-num">Saldo Razão</th>
                  </tr>
                  <tr style="background:var(--bg3)">
                    <th style="padding:4px 6px;font-weight:normal">
                      <div style="display:flex;flex-direction:column;gap:3px">
                        <input id="sbalRfData" type="date" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:3px 6px;font-size:11px;font-family:var(--mono)">
                        <div style="display:flex;gap:3px;align-items:center">
                          <input id="sbalRfDataDe" type="date" style="flex:1;background:var(--bg2);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:3px 4px;font-size:10px;font-family:var(--mono)">
                          <span style="font-size:10px;color:var(--text3)">até</span>
                          <input id="sbalRfDataAte" type="date" style="flex:1;background:var(--bg2);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:3px 4px;font-size:10px;font-family:var(--mono)">
                        </div>
                      </div>
                    </th>
                    <th style="padding:4px 6px;font-weight:normal">
                      <input id="sbalRfDoc" type="search" placeholder="Doc…" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:3px 6px;font-size:11px;font-family:var(--mono)">
                    </th>
                    <th style="padding:4px 6px;font-weight:normal">
                      <input id="sbalRfComp" type="search" placeholder="Buscar complemento…" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:3px 6px;font-size:11px">
                    </th>
                    <th style="padding:4px 6px;font-weight:normal">
                      <input id="sbalRfValor" type="search" placeholder="Valor…" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:3px 6px;font-size:11px;font-family:var(--mono);text-align:right">
                    </th>
                    <th style="padding:4px 6px;text-align:right">
                      <button type="button" id="sbalRfClear" title="Limpar filtros" style="background:none;border:1px solid var(--border);color:var(--text3);border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>
                    </th>
                  </tr>
                </thead>
                <tbody id="sbalRazaoBody"></tbody>
              </table>
            </div>
            <div class="sbal-concil-bar" id="sbalConcilBar">
              <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3)">Selecionados</div><div id="sbalConcilCount" style="font-family:var(--mono);font-size:14px;font-weight:600">0</div></div>
              <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3)">Total Débito</div><div id="sbalConcilDeb" style="font-family:var(--mono);font-size:14px;font-weight:600;color:#4ade80">R$ 0,00</div></div>
              <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3)">Total Crédito</div><div id="sbalConcilCre" style="font-family:var(--mono);font-size:14px;font-weight:600;color:var(--red)">R$ 0,00</div></div>
              <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3)">Diferença</div><div id="sbalConcilDif" style="font-family:var(--mono);font-size:14px;font-weight:600">R$ 0,00</div></div>
              <div style="margin-left:auto;display:flex;gap:8px">
                <button type="button" class="sbal-btn-clear" id="sbalConcilLimpar">✕ Limpar seleção</button>
              </div>
            </div>
            <div class="sbal-pagination" id="sbalRazaoPag" style="display:none"></div>
          </div>
        </div>
      </div>

      <!-- Modal Detalhes do Lançamento -->
      <div class="sbal-modal-ov" id="sbalLancModal">
        <div class="sbal-modal-box">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2c2e33;background:#22242a">
            <div>
              <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">Detalhes do Lançamento</div>
              <div id="sbalModalSubtitle" style="font-size:11px;color:#8c8f99;margin-top:2px">—</div>
            </div>
            <button type="button" id="sbalModalClose" class="sbal-btn-clear" style="padding:4px 9px">✕</button>
          </div>
          <div style="padding:20px">
            <div id="sbalModalMeta" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"></div>
            <div id="sbalModalComp" style="background:rgba(255,255,255,.02);border:1px solid #22242a;border-radius:8px;padding:11px 14px;margin-bottom:16px;font-size:13px;color:#c4c6cc"></div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8c8f99;margin-bottom:8px">Partidas</div>
            <div class="sbal-entries-grid" id="sbalModalEntries"></div>
          </div>
        </div>
      </div>
    `;
  }

  function buildYearTabs() {
    const c = document.getElementById('sbalYearTabs');
    if (!c) return;
    c.innerHTML = '';
    for (const y of ANOS_HIST) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sbal-year-tab' + (selectedAnos.has(y) ? ' active' : '');
      btn.textContent = y;
      btn.onclick = () => {
        if (selectedAnos.has(y)) {
          if (selectedAnos.size === 1) return;
          selectedAnos.delete(y);
          if (activeYear === y) activeYear = [...selectedAnos].sort((a, b) => b - a)[0];
        } else {
          selectedAnos.add(y);
          activeYear = y;
        }
        buildYearTabs();
        refreshYearScope();
      };
      c.appendChild(btn);
    }
  }

  function renderCentroOptions(query = '') {
    const box = document.getElementById('sbalCentroOptions');
    if (!box) return;
    const q = String(query || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const lista = CENTRO_OPTIONS_CACHE.filter(v => !q || norm(v).includes(q));
    box.innerHTML = '';
    const todos = document.createElement('button');
    todos.type = 'button';
    todos.className = 'sbal-centro-option' + (!selectedCentro ? ' active' : '');
    todos.textContent = 'Todos';
    todos.onclick = () => selectCentro('');
    box.appendChild(todos);
    lista.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sbal-centro-option' + (v === selectedCentro ? ' active' : '');
      b.textContent = v;
      b.onclick = () => selectCentro(v);
      box.appendChild(b);
    });
  }

  function selectCentro(val) {
    selectedCentro = val || '';
    const btn = document.getElementById('sbalCentroBtn');
    if (btn) btn.textContent = (selectedCentro || 'Todos') + ' ▾';
    const p = document.getElementById('sbalCentroPicker');
    if (p) p.style.display = 'none';
    renderCentroOptions('');
    applyFilters();
  }

  function refreshYearScope() {
    YEAR_DATA = TODOS.filter(r => selectedAnos.has(r.ano));
    CENTRO_OPTIONS_CACHE = [...new Set(YEAR_DATA.map(r => r.centro).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    if (selectedCentro && !CENTRO_OPTIONS_CACHE.includes(selectedCentro)) selectedCentro = '';
    const cBtn = document.getElementById('sbalCentroBtn');
    if (cBtn) cBtn.textContent = (selectedCentro || 'Todos') + ' ▾';
    renderCentroOptions('');

    const ms = [...new Set(YEAR_DATA.map(r => r.mes).filter(Boolean))].sort((a, b) => a - b);
    const cont = document.getElementById('sbalMesCheckboxes');
    if (cont) {
      cont.innerHTML = ms.map(m => `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px;color:var(--text2)">
          <input type="checkbox" value="${m}" ${selectedMeses.has(m) ? 'checked' : ''} style="accent-color:var(--accent)">
          ${MESES[m]}
        </label>
      `).join('');
      cont.querySelectorAll('input').forEach(cb => {
        cb.onchange = () => {
          const m = +cb.value;
          if (cb.checked) selectedMeses.add(m); else selectedMeses.delete(m);
          updateMesBtn();
          applyFilters();
        };
      });
    }
    updateMesBtn();
    applyFilters();
  }

  function updateMesBtn() {
    const btn = document.getElementById('sbalMesBtn');
    if (!btn) return;
    if (!selectedMeses.size) { btn.textContent = 'Todos ▾'; return; }
    btn.textContent = [...selectedMeses].sort((a, b) => a - b).map(m => MESES[m].slice(0, 3)).join(', ') + ' ▾';
  }

  function applyFilters() {
    filtered = YEAR_DATA.filter(r =>
      (!selectedCentro || r.centro === selectedCentro) &&
      (!selectedMeses.size || selectedMeses.has(r.mes))
    );
    const ms = [...new Set(filtered.map(r => r.mes).filter(Boolean))].sort((a, b) => a - b);
    const metaEl = document.getElementById('sbalHeaderMeta');
    if (metaEl) {
      metaEl.textContent = `${filtered.length.toLocaleString('pt-BR')} lançamentos · ${[...selectedAnos].sort().join(', ')} · ${ms.map(m => MESES[m]).join(', ') || '—'}`;
    }
    buildBalancete();
    if (razaoContaId) openRazao(razaoContaId, razaoContaNome);
  }

  function buildBalancete() {
    let dataMax = filtered.reduce((m, r) => r.data > m ? r.data : m, '');
    if (!dataMax) {
      if (selectedMeses.size > 0) {
        const maxMes = Math.max(...selectedMeses);
        const lastDay = new Date(activeYear, maxMes, 0).getDate();
        dataMax = `${activeYear}-${String(maxMes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else {
        dataMax = `${activeYear}-12-31`;
      }
    }

    const tree = {};
    for (const r of filtered) {
      const g1 = r.grupo1 || '(Sem grupo)', g2 = r.grupo2 || '(Sem sub-grupo)', g3 = r.grupo3 || '(Sem seção)', g4 = r.grupo4 || '(Sem sub-seção)';
      const lf = `${r.conta}|||${r.nome || r.conta}`;
      if (!tree[g1]) tree[g1] = {};
      if (!tree[g1][g2]) tree[g1][g2] = {};
      if (!tree[g1][g2][g3]) tree[g1][g2][g3] = {};
      if (!tree[g1][g2][g3][g4]) tree[g1][g2][g3][g4] = {};
      if (!tree[g1][g2][g3][g4][lf]) tree[g1][g2][g3][g4][lf] = { conta: r.conta, deb: 0, cre: 0 };
      if (r.valor > 0) tree[g1][g2][g3][g4][lf].deb += r.valor;
      else tree[g1][g2][g3][g4][lf].cre += r.valor;
    }

    if (modoConsolidado || modoSemMovimento) {
      const contasNoFiltro = new Set(filtered.map(r => r.conta));
      const contasExtras = {};
      for (const r of TODOS) {
        if (contasNoFiltro.has(r.conta)) continue;
        if (!r.grupo1) continue;
        if (selectedCentro && r.centro !== selectedCentro) continue;
        if (r.ano > activeYear) continue;
        if (!contasExtras[r.conta]) {
          contasExtras[r.conta] = { conta: r.conta, nome: r.nome, grupo1: r.grupo1, grupo2: r.grupo2, grupo3: r.grupo3, grupo4: r.grupo4 };
        }
      }
      for (const [contaId, meta] of Object.entries(contasExtras)) {
        const saldo = calcSaldoAcumulado(contaId, dataMax, selectedCentro);
        if (Math.abs(saldo) < 0.01) continue;
        const g1 = meta.grupo1, g2 = meta.grupo2 || '(Sem sub-grupo)', g3 = meta.grupo3 || '(Sem seção)', g4 = meta.grupo4 || '(Sem sub-seção)';
        const lf = `${contaId}|||${meta.nome || contaId}`;
        if (!tree[g1]) tree[g1] = {};
        if (!tree[g1][g2]) tree[g1][g2] = {};
        if (!tree[g1][g2][g3]) tree[g1][g2][g3] = {};
        if (!tree[g1][g2][g3][g4]) tree[g1][g2][g3][g4] = {};
        if (!tree[g1][g2][g3][g4][lf]) tree[g1][g2][g3][g4][lf] = { conta: contaId, deb: 0, cre: 0 };
      }
    }

    const uid = () => Math.random().toString(36).slice(2);
    const minConta = obj => {
      const keys = Object.keys(obj);
      if (!keys.length) return '';
      if (keys[0].includes('|||')) return keys.map(k => k.split('|||')[0]).sort(cmpConta)[0];
      return keys.map(k => minConta(obj[k])).filter(Boolean).sort(cmpConta)[0] || '';
    };
    const sortByMinConta = obj => Object.keys(obj).sort((a, b) => cmpConta(minConta(obj[a]), minConta(obj[b])));

    const nodes = [];
    for (const g1 of sortByMinConta(tree)) {
      const g2m = tree[g1], id1 = uid(); let d1 = 0, c1 = 0, s1 = 0; const ch2 = [];
      for (const g2 of sortByMinConta(g2m)) {
        const g3m = g2m[g2], id2 = uid(); let d2 = 0, c2 = 0, s2 = 0; const ch3 = [];
        for (const g3 of sortByMinConta(g3m)) {
          const g4m = g3m[g3], id3 = uid(); let d3 = 0, c3 = 0, s3 = 0; const ch4 = [];
          for (const g4 of sortByMinConta(g4m)) {
            const lm = g4m[g4], id4 = uid(); let d4 = 0, c4 = 0, s4 = 0; const chl = [];
            for (const lfk of Object.keys(lm).sort(cmpConta)) {
              const { deb, cre } = lm[lfk];
              const [cid, nome] = lfk.split('|||');
              const saldo = dataMax ? calcSaldoAcumulado(cid, dataMax, selectedCentro) : deb + cre;
              d4 += deb; c4 += cre; s4 += saldo;
              chl.push({ lvl: 'leaf', label: nome, contaId: cid, deb, cre, saldo, pid: id4 });
            }
            d3 += d4; c3 += c4; s3 += s4; ch4.push({ lvl: 'g4', id: id4, label: g4, deb: d4, cre: c4, saldo: s4, pid: id3, ch: chl });
          }
          d2 += d3; c2 += c3; s2 += s3; ch3.push({ lvl: 'g3', id: id3, label: g3, deb: d3, cre: c3, saldo: s3, pid: id2, ch: ch4 });
        }
        d1 += d2; c1 += c2; s1 += s2; ch2.push({ lvl: 'g2', id: id2, label: g2, deb: d2, cre: c2, saldo: s2, pid: id1, ch: ch3 });
      }
      nodes.push({ lvl: 'g1', id: id1, label: g1, deb: d1, cre: c1, saldo: s1, ch: ch2 });
    }

    const tbody = document.getElementById('sbalBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const collapsed = new Set();
    let total_sal = 0;
    nodes.forEach(n => { total_sal += n.saldo; });
    document.getElementById('sbalMeta').textContent = `Total: ${fmtBRL(total_sal)}`;

    function render(list) {
      for (const n of list) {
        const tr = document.createElement('tr');
        tr.dataset.id = n.id || '';
        tr.dataset.pid = n.pid || '';
        tr.className = 'sbal-row sbal-lvl-' + n.lvl + (n.lvl === 'leaf' && n.contaId === razaoContaId ? ' selected' : '');
        const icon = n.ch?.length ? `<span class="sbal-toggle-icon" data-id="${n.id}">▾</span>` : `<span style="display:inline-block;width:13px"></span>`;
        const sc = n.saldo >= 0 ? 'num-pos' : 'num-neg';
        const saldoAnt = n.saldo - (n.deb + n.cre);
        const sac = saldoAnt >= 0 ? 'num-pos' : 'num-neg';
        tr.innerHTML = `
          <td class="conta-cell">${icon}${esc(n.label)}</td>
          <td class="col-num ${sac}">${Math.abs(saldoAnt) >= 0.005 ? fmtBRL(saldoAnt) : '—'}</td>
          <td class="col-num num-pos">${n.deb ? fmtAbs(n.deb) : '—'}</td>
          <td class="col-num num-neg">${n.cre ? fmtAbs(n.cre) : '—'}</td>
          <td class="col-num ${sc}">${fmtBRL(n.saldo)}</td>
        `;
        if (n.lvl === 'leaf') {
          tr.addEventListener('click', () => {
            tbody.querySelectorAll('.selected').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            openRazao(n.contaId, n.label);
          });
        }
        tbody.appendChild(tr);
        if (n.ch?.length) render(n.ch);
      }
    }
    render(nodes);

    tbody.onclick = e => {
      const icon = e.target.closest('.sbal-toggle-icon');
      if (!icon) return;
      e.stopPropagation();
      const pid = icon.dataset.id;
      const parentRow = tbody.querySelector(`[data-id="${pid}"]`);
      const isCol = collapsed.has(pid);
      function setVis(id, show) {
        for (const r of tbody.querySelectorAll(`[data-pid="${id}"]`)) {
          r.style.display = show ? '' : 'none';
          const cid = r.dataset.id;
          if (cid && !collapsed.has(cid)) setVis(cid, show);
        }
      }
      if (isCol) { collapsed.delete(pid); setVis(pid, true); parentRow?.classList.remove('collapsed'); }
      else { collapsed.add(pid); setVis(pid, false); parentRow?.classList.add('collapsed'); }
    };
  }

  function openRazao(contaId, contaNome) {
    razaoContaId = contaId;
    razaoContaNome = contaNome;
    const ig = isDisp(contaId);
    razaoRows = TODOS.filter(r =>
      r.conta === contaId &&
      selectedAnos.has(r.ano) &&
      (!selectedMeses.size || selectedMeses.has(r.mes)) &&
      (ig || !selectedCentro || r.centro === selectedCentro)
    );
    razaoRows.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : a.idx - b.idx);
    buildSaldoRazaoCache(contaId, selectedCentro);

    const red = REDUZIDO_MAP[contaId];
    document.getElementById('sbalRazaoConta').textContent = (red ? `${red} — ` : `${contaId} — `) + contaNome;
    document.getElementById('sbalBtnExport').style.display = 'inline-flex';
    document.getElementById('sbalBtnConciliar').style.display = 'inline-flex';
    document.getElementById('sbalRazaoEmpty').style.display = 'none';
    document.getElementById('sbalRazaoTable').style.display = 'table';

    applyRazaoFilters();
  }

  function applyRazaoFilters() {
    const data = (document.getElementById('sbalRfData')?.value || '').trim();
    const dataDe = (document.getElementById('sbalRfDataDe')?.value || '').trim();
    const dataAte = (document.getElementById('sbalRfDataAte')?.value || '').trim();
    const doc = (document.getElementById('sbalRfDoc')?.value || '').trim().toLowerCase();
    const comp = (document.getElementById('sbalRfComp')?.value || '').trim().toLowerCase();
    const valor = (document.getElementById('sbalRfValor')?.value || '').trim().replace(',', '.');

    razaoFiltered = razaoRows.filter(r => {
      if (data && r.data !== data) return false;
      if (!data) {
        if (dataDe && r.data < dataDe) return false;
        if (dataAte && r.data > dataAte) return false;
      }
      if (doc && !(r.documento || '').toLowerCase().includes(doc)) return false;
      if (comp && !(r.complemento || '').toLowerCase().includes(comp)) return false;
      if (valor) {
        const v = parseFloat(valor);
        if (!isNaN(v) && Math.abs(Math.abs(r.valor) - Math.abs(v)) > 0.005) return false;
      }
      return true;
    });

    razaoPage = 1;
    document.getElementById('sbalRazaoCount').textContent = `${razaoFiltered.length.toLocaleString('pt-BR')} lançamentos`;
    renderRazaoPg();
  }

  function renderRazaoPg() {
    const pg = razaoFiltered.slice((razaoPage - 1) * RAZAO_PAGE, razaoPage * RAZAO_PAGE);
    const tbody = document.getElementById('sbalRazaoBody');
    if (!tbody) return;
    tbody.innerHTML = pg.map(r => {
      const sr = _saldoRazaoCache?.get(r.idx) ?? 0;
      const sc = sr > 0 ? 'sr-pos' : sr < 0 ? 'sr-neg' : 'sr-zero';
      const dataBR = r.data ? `${r.data.slice(8)}/${r.data.slice(5, 7)}/${r.data.slice(0, 4)}` : '—';
      const sel = concilSelecionados.has(r.idx);
      const cbCol = concilModo ? `<td style="padding:7px 8px"><input type="checkbox" class="sbal-cb" data-idx="${r.idx}" ${sel ? 'checked' : ''}></td>` : '';
      return `
        <tr class="sbal-row ${sel ? 'sbal-concil-selected' : ''}" data-idx="${r.idx}">
          ${cbCol}
          <td style="white-space:nowrap;font-family:var(--mono);font-size:12px">${dataBR}</td>
          <td style="font-family:var(--mono);font-size:11px">${esc(r.documento || '—')}</td>
          <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${esc(r.complemento)}">${esc(r.complemento || '—')}</td>
          <td class="col-num" style="font-family:var(--mono);font-size:12px;color:${r.valor > 0 ? 'var(--green)' : 'var(--red)'}">${fmtBRL(r.valor)}</td>
          <td class="col-num ${sc}">${fmtBRL(sr)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.onclick = e => {
        if (e.target.closest('input')) return;
        const r = razaoFiltered.find(x => x.idx === +tr.dataset.idx);
        if (r) openLancModal(r);
      };
    });

    tbody.querySelectorAll('.sbal-cb').forEach(cb => {
      cb.onchange = e => {
        const idx = +e.target.dataset.idx;
        if (e.target.checked) concilSelecionados.add(idx);
        else concilSelecionados.delete(idx);
        e.target.closest('tr').classList.toggle('sbal-concil-selected', e.target.checked);
        atualizaConcilBar();
      };
    });

    const pag = document.getElementById('sbalRazaoPag');
    const total = Math.ceil(razaoFiltered.length / RAZAO_PAGE);
    if (total <= 1) { pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    let h = '';
    for (let p = 1; p <= total; p++) {
      h += `<button type="button" class="${p === razaoPage ? 'active' : ''}" data-p="${p}">${p}</button>`;
    }
    pag.innerHTML = h;
    pag.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        razaoPage = +b.dataset.p;
        renderRazaoPg();
        document.getElementById('sbalRazaoScroll').scrollTop = 0;
      };
    });
  }

  function atualizaConcilBar() {
    const sel = razaoFiltered.filter(r => concilSelecionados.has(r.idx));
    const deb = sel.filter(r => r.valor > 0).reduce((s, r) => s + r.valor, 0);
    const cre = sel.filter(r => r.valor < 0).reduce((s, r) => s + r.valor, 0);
    const dif = deb + cre;
    document.getElementById('sbalConcilCount').textContent = sel.length;
    document.getElementById('sbalConcilDeb').textContent = fmtBRL(deb);
    document.getElementById('sbalConcilCre').textContent = fmtBRL(cre);
    const difEl = document.getElementById('sbalConcilDif');
    difEl.textContent = fmtBRL(dif);
    difEl.style.color = Math.abs(dif) < 0.01 ? 'var(--green)' : 'var(--red)';
  }

  function openLancModal(row) {
    const partidas = TODOS.filter(x => x.lancamentoId === row.lancamentoId);
    const dataBR = row.data ? `${row.data.slice(8)}/${row.data.slice(5, 7)}/${row.data.slice(0, 4)}` : '—';
    document.getElementById('sbalModalSubtitle').textContent = `Lote ${row.lote || '—'} · Documento ${row.documento || '—'}`;
    document.getElementById('sbalModalMeta').innerHTML = `
      <span class="sbal-mes-btn">Data: <b>${dataBR}</b></span>
      <span class="sbal-mes-btn">Doc: <b>${esc(row.documento || '—')}</b></span>
      <span class="sbal-mes-btn">Centro: <b>${esc(row.centro || '—')}</b></span>
    `;
    document.getElementById('sbalModalComp').textContent = row.complemento || '—';
    document.getElementById('sbalModalEntries').innerHTML = partidas.map(p => {
      const isDeb = p.valor > 0;
      return `
        <div class="sbal-entry-box ${isDeb ? 'deb' : 'cre'}">
          <div style="display:flex;justify-content:space-between;padding:8px 12px;background:${isDeb ? 'rgba(74,222,128,.07)' : 'rgba(240,112,112,.07)'}">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${isDeb ? '#4ade80' : '#f07070'}">${isDeb ? '● Débito' : '● Crédito'}</span>
            <span style="font-size:13px;font-weight:700;font-family:var(--mono);color:${isDeb ? '#4ade80' : '#f07070'}">${fmtBRL(Math.abs(p.valor))}</span>
          </div>
          <div style="padding:10px 12px">
            <div style="font-size:10px;color:#8c8f99;font-family:var(--mono)">#${esc(p.conta)}</div>
            <div style="font-size:13px;font-weight:600;margin-top:3px">${esc(p.nome)}</div>
            ${p.centro ? `<div style="font-size:10px;color:#8c8f99;margin-top:5px">${esc(p.centro)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    document.getElementById('sbalLancModal').classList.add('show');
  }

  function exportExcelRazao() {
    if (!razaoContaId || !razaoFiltered.length) return;
    const rows = razaoFiltered.map(r => {
      const sr = _saldoRazaoCache?.get(r.idx) ?? 0;
      const dataBR = r.data ? `${r.data.slice(8)}/${r.data.slice(5, 7)}/${r.data.slice(0, 4)}` : '';
      return {
        'Data': dataBR,
        'Conta': r.conta,
        'Descrição': r.nome,
        'Centro de Custo': r.centro,
        'Documento': r.documento,
        'Complemento': r.complemento,
        'Valor': r.valor,
        'Tipo': r.tipo,
        'Saldo Razão': sr
      };
    });
    if (window.XLSX) {
      const ws = window.XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 13 }, { wch: 18 }, { wch: 30 }, { wch: 28 }, { wch: 20 }, { wch: 50 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Razão');
      window.XLSX.writeFile(wb, `Razao_${razaoContaId}_${activeYear}.xlsx`);
    } else {
      const header = Object.keys(rows[0]);
      const csv = [header.join(';'), ...rows.map(r => header.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `Razao_${razaoContaId}_${activeYear}.csv`;
      a.click();
    }
  }

  function bindEvents(apiFn, accountsFn) {
    document.getElementById('sbalCentroBtn').onclick = e => {
      e.stopPropagation();
      const p = document.getElementById('sbalCentroPicker');
      p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    };
    document.getElementById('sbalCentroSearch').oninput = e => renderCentroOptions(e.target.value);
    document.getElementById('sbalMesBtn').onclick = e => {
      e.stopPropagation();
      const p = document.getElementById('sbalMesPicker');
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('sbalClearMeses').onclick = () => {
      selectedMeses.clear();
      refreshYearScope();
    };
    document.getElementById('sbalBtnClear').onclick = () => {
      selectedCentro = '';
      selectedMeses.clear();
      refreshYearScope();
    };
    document.getElementById('sbalBtnSemMov').onclick = function () {
      modoSemMovimento = !modoSemMovimento;
      this.style.color = modoSemMovimento ? '#fbbf24' : '';
      this.textContent = modoSemMovimento ? '✓ Sem Movimento' : '∅ Sem Movimento';
      buildBalancete();
    };
    document.getElementById('sbalBtnConsol').onclick = function () {
      modoConsolidado = !modoConsolidado;
      this.style.color = modoConsolidado ? '#4ade80' : '';
      this.textContent = modoConsolidado ? '✓ Consolidado' : '⊕ Consolidado';
      buildBalancete();
    };
    document.getElementById('sbalBtnReload').onclick = async () => {
      await loadDataFromSagas(apiFn, accountsFn);
      buildYearTabs();
      refreshYearScope();
    };
    ['sbalRfData', 'sbalRfDataDe', 'sbalRfDataAte', 'sbalRfDoc', 'sbalRfComp', 'sbalRfValor'].forEach(id => {
      document.getElementById(id).oninput = applyRazaoFilters;
    });
    document.getElementById('sbalRfClear').onclick = () => {
      ['sbalRfData', 'sbalRfDataDe', 'sbalRfDataAte', 'sbalRfDoc', 'sbalRfComp', 'sbalRfValor'].forEach(id => {
        document.getElementById(id).value = '';
      });
      applyRazaoFilters();
    };
    document.getElementById('sbalBtnConciliar').onclick = function () {
      concilModo = !concilModo;
      concilSelecionados.clear();
      this.textContent = concilModo ? '✓ Conciliando…' : '⊡ Conciliar';
      document.getElementById('sbalConcilBar').classList.toggle('show', concilModo);
      const thead = document.getElementById('sbalRazaoThead');
      if (concilModo) {
        const th = document.createElement('th'); th.id = 'sbalThCb'; th.style.width = '30px';
        thead.insertBefore(th, thead.firstChild);
      } else {
        document.getElementById('sbalThCb')?.remove();
      }
      atualizaConcilBar();
      renderRazaoPg();
    };
    document.getElementById('sbalConcilLimpar').onclick = () => {
      concilSelecionados.clear();
      atualizaConcilBar();
      renderRazaoPg();
    };
    document.getElementById('sbalBtnExport').onclick = exportExcelRazao;
    document.getElementById('sbalBtnPdf').onclick = () => window.print();
    document.getElementById('sbalModalClose').onclick = () => document.getElementById('sbalLancModal').classList.remove('show');
    document.getElementById('sbalLancModal').onclick = e => {
      if (e.target.id === 'sbalLancModal') e.target.classList.remove('show');
    };
  }

  window.SAGAS_BALANCETE = {
    async render(container, apiFn, accountsFn) {
      injectStyles();
      renderHTML(container);
      await loadDataFromSagas(apiFn, accountsFn);
      buildYearTabs();
      refreshYearScope();
      bindEvents(apiFn, accountsFn);
    }
  };
})();
