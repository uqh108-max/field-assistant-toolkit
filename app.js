/* ============================================================================
 * Field Assistant — Treatment Toolkit
 * Standalone, dependency-free port of the Claude Design prototype.
 * Same state model, same calculations, same localStorage keys.
 * ==========================================================================*/
(function () {
  'use strict';

  // ---- tiny helpers ---------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function css(obj) {
    if (typeof obj === 'string') return obj;
    var out = '';
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var prop = k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
      out += prop + ':' + obj[k] + ';';
    }
    return out;
  }

  var DATA = window.APP_DATA || { products: [], pumps: [] };

  var App = {
    state: {
      screen: 'home',
      productId: null,
      calcProductId: '',
      calcMode: 'conc',
      form: 'liquid',
      flow: '50', dose: '',
      flowUnit: 'm3h', sludgeFlowUnit: 'm3h',
      sludgeFlow: '12', ds: '2.5', doseKg: '6', sludgeDensity: '1.0',
      makedown: '0.5', density: '1.0', pumpMax: '20',
      pumpSource: 'manual', selectedCalcPumpId: '',
      jarVol: '1000', stockPct: '0.1', jarProductId: '',
      productQuery: '', productFilter: 'all',
      jars: [
        { dose: '1', ph: '', turb: '', floc: '' },
        { dose: '2', ph: '', turb: '', floc: '' },
        { dose: '3', ph: '', turb: '', floc: '' },
        { dose: '4', ph: '', turb: '', floc: '' },
        { dose: '5', ph: '', turb: '', floc: '' }
      ],
      winner: null,
      clients: [],
      showClientForm: false,
      clientName: '', clientSite: '',
      pumpQuery: '',
      foundPumps: [], pumpLoading: false, pumpError: '',
      customProducts: [], jarTests: [],
      calMl: '', calSec: '',
      showProductForm: false,
      np: { name: '', brand: '', type: 'Flocculant', charge: '', form: 'Powder', doseRange: '', doseUnit: 'mg/L on flow', density: '', makedown: '', ageing: '', application: '', makeup: '' },
      showPumpForm: false,
      npu: { model: '', brand: '', type: 'Solenoid diaphragm', maxFlow: '', maxPress: '', control: 'Digital', note: '' },
      showJarSave: false, jarSaveClient: '', jarSaveNote: '', jarSaved: false
    },

    PRODUCTS: DATA.products,
    PUMPS: DATA.pumps,

    FLOW_UNITS: [
      { v: 'm3h', label: 'm³/h', k: 1 },
      { v: 'm3d', label: 'm³/d', k: 1 / 24 },
      { v: 'Ls', label: 'L/s', k: 3.6 },
      { v: 'Lmin', label: 'L/min', k: 0.06 },
      { v: 'Lh', label: 'L/h', k: 0.001 },
      { v: 'MLd', label: 'ML/d', k: 1000 / 24 }
    ],

    // ---- persistence --------------------------------------------------------
    load: function () {
      try {
        var raw = localStorage.getItem('ctf_clients_v1');
        if (raw) this.state.clients = JSON.parse(raw);
        var rawP = localStorage.getItem('ctf_pumps_v1');
        if (rawP) this.state.foundPumps = JSON.parse(rawP);
        var rawCP = localStorage.getItem('ctf_products_v1');
        if (rawCP) this.state.customProducts = JSON.parse(rawCP);
        var rawJT = localStorage.getItem('ctf_jartests_v1');
        if (rawJT) this.state.jarTests = JSON.parse(rawJT);
      } catch (e) {}
    },
    persist: function (c) { try { localStorage.setItem('ctf_clients_v1', JSON.stringify(c)); } catch (e) {} },
    persistPumps: function (p) { try { localStorage.setItem('ctf_pumps_v1', JSON.stringify(p)); } catch (e) {} },
    persistProducts: function (p) { try { localStorage.setItem('ctf_products_v1', JSON.stringify(p)); } catch (e) {} },
    persistTests: function (t) { try { localStorage.setItem('ctf_jartests_v1', JSON.stringify(t)); } catch (e) {} },

    // ---- maths (verbatim port) ---------------------------------------------
    flowFactor: function (u) { var f = this.FLOW_UNITS.find(function (x) { return x.v === u; }); return f ? f.k : 1; },
    parsePumpFlow: function (str) {
      if (!str) return NaN;
      var m = String(str).match(/([\d.,]+)\s*(ml\/min|l\/min|l\/s|l\/h|gpd|gph)?/i);
      if (!m) return NaN;
      var n = parseFloat(m[1].replace(/,/g, ''));
      if (!isFinite(n)) return NaN;
      var u = (m[2] || 'l/h').toLowerCase();
      var k = { 'ml/min': 0.06, 'l/min': 60, 'l/s': 3600, 'l/h': 1, 'gpd': 3.785 / 24, 'gph': 3.785 }[u] || 1;
      return n * k;
    },
    fmt: function (n, dp) {
      if (n === null || n === undefined || !isFinite(n)) return '—';
      var v = Number(n);
      if (dp === 0) return Math.round(v).toLocaleString();
      return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dp });
    },
    jarPpm: function (dose) {
      var d = parseFloat(dose), sp = parseFloat(this.state.stockPct), v = parseFloat(this.state.jarVol);
      if (!isFinite(d) || !isFinite(sp) || !isFinite(v) || v <= 0) return NaN;
      return d * 10000 * sp / v;
    },
    computeCalc: function () {
      var s = this.state;
      var S = parseFloat(s.makedown);
      var rho = parseFloat(s.density);
      var pumpMax = parseFloat(s.pumpMax);
      var liquid = s.form === 'liquid';

      var massGh = NaN;
      if (s.calcMode === 'conc') {
        var Q = parseFloat(s.flow) * this.flowFactor(s.flowUnit), D = parseFloat(s.dose);
        if (isFinite(Q) && isFinite(D)) massGh = Q * D;
      } else {
        var Qs = parseFloat(s.sludgeFlow) * this.flowFactor(s.sludgeFlowUnit), DS = parseFloat(s.ds), dk = parseFloat(s.doseKg);
        var rhoS = parseFloat(s.sludgeDensity); if (!isFinite(rhoS) || rhoS <= 0) rhoS = 1;
        // dry-solids rate DS[t/h] = Qs[m3/h] x rho_sludge[t/m3] x (ds/100); product g/h = doseKg x DS x 1000
        if (isFinite(Qs) && isFinite(DS) && isFinite(dk)) massGh = dk * (Qs * rhoS * (DS / 100)) * 1000;
      }
      var ok = isFinite(massGh);
      var massKgH = ok ? massGh / 1000 : NaN;
      var massKgDay = ok ? massKgH * 24 : NaN;
      var neatLh = (ok && liquid && rho > 0) ? massKgH / rho : NaN;
      var solLh = (ok && S > 0) ? massGh / (10 * S) : NaN;
      var batchKg = (S > 0) ? 10 * S : NaN;
      var batchHours = (isFinite(solLh) && solLh > 0) ? 1000 / solLh : NaN;
      var strokePct = (isFinite(solLh) && pumpMax > 0) ? solLh / pumpMax * 100 : NaN;

      var dilution = '—';
      if (liquid && S > 0 && rho > 0) {
        var frac = (10 * S) / (1000 * rho);
        if (frac > 0 && frac < 1) dilution = '1 : ' + this.fmt((1 - frac) / frac, 0) + ' (product : water)';
      } else if (!liquid && S > 0) {
        dilution = this.fmt(10 * S, 1) + ' g powder per L water';
      }

      var warnings = [];
      if (!ok) warnings.push({ text: 'Enter the flow and dose values above to calculate feed rates.', bg: '#FBF9F4', border: '#E2DDD0', color: '#6B776F' });
      if (isFinite(strokePct) && strokePct > 100) warnings.push({ text: 'Pump stroke exceeds 100% — this pump is too small for the required feed, or dilute the solution less (higher %). Consider a larger pump.', bg: '#FBEBE7', border: '#E9C4B9', color: '#8A3A24' });
      else if (isFinite(strokePct) && strokePct < 10 && strokePct > 0) warnings.push({ text: 'Pump running below ~10% stroke — accuracy suffers at very low output. Consider a smaller pump or a more dilute solution.', bg: '#FBF6EC', border: '#EBD9BC', color: '#8A5E17' });
      if (!liquid && S > 0.7) warnings.push({ text: 'Powder solutions above ~0.5–0.7% get very viscous and hard to mix cleanly. Lower the make-down strength if you see gels or lumps.', bg: '#FBF6EC', border: '#EBD9BC', color: '#8A5E17' });

      var statusDot = !ok ? '#4A5A54' : (isFinite(strokePct) && strokePct > 100 ? '#E86A4A' : '#4FE0B5');
      var strokeColor = (isFinite(strokePct) && strokePct > 100) ? '#FF8A6B' : '#4FE0B5';

      var strokeLen = '—', strokeRate = '—';
      if (isFinite(solLh) && pumpMax > 0) {
        var f = solLh / pumpMax;
        if (f > 0 && f <= 1) {
          var spl = 0.8, spm = f / spl;
          if (spm > 1) { spl = 1.0; spm = f; }
          strokeLen = Math.round(spl * 100) + '%';
          strokeRate = this.fmt(spm * 100, 0) + '%';
        } else if (f > 1) {
          strokeLen = '100%';
          strokeRate = 'over capacity';
        }
      }

      return {
        massKgH: this.fmt(massKgH, 2),
        massKgDay: this.fmt(massKgDay, 1),
        solLh: this.fmt(solLh, 2),
        solLhNum: solLh,
        neatLh: liquid ? this.fmt(neatLh, 3) : 'n/a',
        strokePct: isFinite(strokePct) ? this.fmt(strokePct, 1) + '%' : '—',
        strokeColor: strokeColor, strokeLen: strokeLen, strokeRate: strokeRate,
        dilution: dilution,
        batchKg: this.fmt(batchKg, 2),
        batchHours: this.fmt(batchHours, 1),
        statusDot: statusDot,
        warnings: warnings,
        hasWarn: warnings.length > 0
      };
    },

    // ---- state plumbing -----------------------------------------------------
    setState: function (patch) { Object.assign(this.state, patch); this.render(); },

    allProducts: function () { return this.PRODUCTS.concat(this.state.customProducts); },
    allPumps: function () { return this.PUMPS.concat(this.state.foundPumps); },

    // ---- style factories (from design) -------------------------------------
    navStyle: function (active) {
      return { flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px 2px', borderRadius: '10px', color: active ? '#4FE0B5' : '#7C8A84' };
    },
    segStyle: function (active) {
      return { flex: 1, border: 'none', cursor: 'pointer', borderRadius: '9px', padding: '9px 6px', fontSize: '13px', fontWeight: 700, lineHeight: 1.15, background: active ? '#16211F' : 'transparent', color: active ? '#EFECE3' : '#6B776F' };
    },
    segSmall: function (active) {
      return { flex: 1, border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '9px 6px', fontSize: '12.5px', fontWeight: 700, background: active ? '#0C8577' : 'transparent', color: active ? '#FFF' : '#6B776F' };
    }
  };

  // ============================ HANDLERS =====================================
  var H = {
    goHome: function () { App.setState({ screen: 'home', productId: null }); },
    goProducts: function () { App.setState({ screen: 'products', productId: null }); },
    goCalc: function () { App.setState({ screen: 'calc' }); },
    goJars: function () { App.setState({ screen: 'jars' }); },
    goPumps: function () { App.setState({ screen: 'pumps' }); },
    goClients: function () { App.setState({ screen: 'clients' }); },

    // products
    setProductFilter: function (el) { App.setState({ productFilter: el.dataset.v }); },
    openProduct: function (el) { App.setState({ productId: el.dataset.id }); },
    backToProducts: function () { App.setState({ productId: null }); },
    useProductInCalc: function () {
      var p = App.allProducts().find(function (x) { return x.id === App.state.productId; }) || {};
      App.setState({
        screen: 'calc', calcProductId: p.id,
        form: (p.form === 'Powder') ? 'powder' : 'liquid',
        density: p.density ? String(p.density) : App.state.density,
        productId: null
      });
    },
    startAddProduct: function () { App.setState({ showProductForm: true }); },
    cancelAddProduct: function () { App.setState({ showProductForm: false }); },
    onNpField: function (el) { var f = el.dataset.f; var np = Object.assign({}, App.state.np); np[f] = el.value; App.setState({ np: np }); },
    confirmAddProduct: function () {
      var np = App.state.np; if (!np.name.trim()) return;
      var type = np.type;
      var tint = type === 'Coagulant' ? '#FBEFE7' : (type === 'Flocculant' ? '#EAF5EC' : '#E7F1FB');
      var tintText = type === 'Coagulant' ? '#B05A28' : (type === 'Flocculant' ? '#2C7A45' : '#1D5F99');
      var tag = (np.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || 'NEW').toUpperCase();
      var prod = {
        id: 'up' + Date.now(), custom: true, tag: tag, tint: tint, tintText: tintText,
        name: np.name.trim(), subtitle: (np.charge.trim() || type) + ' · ' + np.form,
        brand: np.brand.trim() || 'Custom entry', type: type, charge: np.charge.trim() || '—', form: np.form,
        densityText: np.density ? ('~' + np.density + ' kg/L') : '—',
        doseRange: np.doseRange.trim() || '—', doseUnit: np.doseUnit,
        doseNote: 'Your custom entry — verify against the supplier data sheet.',
        application: np.application.trim() || '—', makeup: np.makeup.trim() || '—',
        makedownText: np.makedown.trim() || '—', ageing: np.ageing.trim() || '—',
        density: parseFloat(np.density) || null, verified: 'custom'
      };
      var customProducts = [prod].concat(App.state.customProducts);
      App.persistProducts(customProducts);
      App.setState({ customProducts: customProducts, showProductForm: false, np: { name: '', brand: '', type: 'Flocculant', charge: '', form: 'Powder', doseRange: '', doseUnit: 'mg/L on flow', density: '', makedown: '', ageing: '', application: '', makeup: '' } });
    },
    deleteProduct: function (el) {
      var id = el.dataset.id;
      var customProducts = App.state.customProducts.filter(function (p) { return p.id !== id; });
      App.persistProducts(customProducts);
      App.setState({ customProducts: customProducts, productId: (App.state.productId === id ? null : App.state.productId) });
    },

    // calc
    onModeConc: function () { App.setState({ calcMode: 'conc' }); },
    onModeSludge: function () { App.setState({ calcMode: 'sludge' }); },
    onFormLiquid: function () { App.setState({ form: 'liquid' }); },
    onFormPowder: function () { App.setState({ form: 'powder' }); },
    onSelectProduct: function (el) {
      var p = App.allProducts().find(function (x) { return x.id === el.value; });
      App.setState({
        calcProductId: el.value,
        form: p ? (p.form === 'Powder' ? 'powder' : 'liquid') : App.state.form,
        density: (p && p.density) ? String(p.density) : App.state.density
        // note: product selection no longer changes the calc mode — the user's
        // Concentration/Sludge tab choice is left untouched.
      });
    },
    onPumpSelect: function () { App.setState({ pumpSource: 'select' }); },
    onPumpManual: function () { App.setState({ pumpSource: 'manual' }); },
    onSelectCalcPump: function (el) {
      var p = App.allPumps().find(function (x) { return x.id === el.value; });
      var v = p ? App.parsePumpFlow(p.maxFlow) : NaN;
      App.setState({ selectedCalcPumpId: el.value, pumpMax: (p && isFinite(v)) ? String(Math.round(v * 100) / 100) : App.state.pumpMax });
    },
    startSaveClient: function () { App.setState({ screen: 'clients', showClientForm: true }); },

    // jars
    onSelectJarProduct: function (el) {
      var p = App.allProducts().find(function (x) { return x.id === el.value; });
      App.setState({ jarProductId: el.value, stockPct: p ? '0.1' : App.state.stockPct });
    },
    setStockStrength: function (el) { App.setState({ stockPct: el.dataset.v }); },
    onJarField: function (el) {
      var i = +el.dataset.i, f = el.dataset.f, v = el.value;
      var jars = App.state.jars.map(function (j, k) { if (k === i) { var nj = Object.assign({}, j); nj[f] = v; return nj; } return j; });
      App.setState({ jars: jars });
    },
    addJar: function () { App.setState({ jars: App.state.jars.concat([{ dose: '', ph: '', turb: '', floc: '' }]) }); },
    removeJar: function () {
      App.setState({ jars: App.state.jars.length > 1 ? App.state.jars.slice(0, -1) : App.state.jars, winner: App.state.winner === App.state.jars.length - 1 ? null : App.state.winner });
    },
    setWinner: function (el) { App.setState({ winner: +el.dataset.i }); },
    useWinner: function () {
      var wj = (App.state.winner !== null && App.state.jars[App.state.winner]) ? App.state.jars[App.state.winner] : null;
      var ppm = wj ? App.jarPpm(wj.dose) : NaN;
      App.setState({ screen: 'calc', calcMode: 'conc', dose: App.fmt(ppm, 2) });
    },
    startJarSave: function () { App.setState({ showJarSave: true, jarSaved: false }); },
    cancelJarSave: function () { App.setState({ showJarSave: false }); },
    confirmJarSave: function () {
      var s = App.state;
      var jp = App.allProducts().find(function (x) { return x.id === s.jarProductId; });
      var client = s.clients.find(function (c) { return c.id === s.jarSaveClient; });
      var wj = (s.winner !== null && s.jars[s.winner]) ? s.jars[s.winner] : null;
      var wPpm = wj ? App.jarPpm(wj.dose) : NaN;
      var t = {
        id: 'jt' + Date.now(),
        date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        clientId: s.jarSaveClient || '', clientName: client ? client.name : '',
        productId: s.jarProductId || '', productName: jp ? jp.name : 'Generic',
        jarVol: s.jarVol, stockPct: s.stockPct,
        jars: s.jars.map(function (j) { return Object.assign({}, j); }),
        winnerN: s.winner !== null ? s.winner + 1 : null,
        winnerPpm: isFinite(wPpm) ? App.fmt(wPpm, 2) : '—',
        note: s.jarSaveNote.trim()
      };
      var jarTests = [t].concat(s.jarTests);
      App.persistTests(jarTests);
      App.setState({ jarTests: jarTests, showJarSave: false, jarSaved: true, jarSaveNote: '' });
    },
    deleteJarTest: function (el) {
      var id = el.dataset.id;
      var jarTests = App.state.jarTests.filter(function (t) { return t.id !== id; });
      App.persistTests(jarTests);
      App.setState({ jarTests: jarTests });
    },

    // pumps
    startAddPump: function () { App.setState({ showPumpForm: true }); },
    cancelAddPump: function () { App.setState({ showPumpForm: false }); },
    onNpuField: function (el) { var f = el.dataset.f; var npu = Object.assign({}, App.state.npu); npu[f] = el.value; App.setState({ npu: npu }); },
    confirmAddPump: function () {
      var n = App.state.npu; if (!n.model.trim()) return;
      var pump = {
        id: 'up' + Date.now(), mine: true, tag: 'MINE', tint: '#ECF7F3', tintText: '#0C8577',
        model: n.model.trim(), brand: n.brand.trim() || '—', type: n.type,
        maxFlow: n.maxFlow.trim() || '—', maxPress: n.maxPress.trim() || '—',
        control: n.control, note: n.note.trim() || 'Added manually from datasheet.', verified: 'datasheet'
      };
      var foundPumps = [pump].concat(App.state.foundPumps);
      App.persistPumps(foundPumps);
      App.setState({ foundPumps: foundPumps, showPumpForm: false, npu: { model: '', brand: '', type: 'Solenoid diaphragm', maxFlow: '', maxPress: '', control: 'Digital', note: '' } });
    },
    removePump: function (el) {
      var id = el.dataset.id;
      var foundPumps = App.state.foundPumps.filter(function (p) { return p.id !== id; });
      App.persistPumps(foundPumps);
      App.setState({ foundPumps: foundPumps });
    },
    lookupPump: function () {
      var query = (App.state.pumpQuery || '').trim();
      if (!query) return;
      if (window.claude && typeof window.claude.complete === 'function') {
        App.setState({ pumpLoading: true, pumpError: '' });
        var prompt = 'You are a chemical metering / dosing pump specification assistant. For the pump model "' + query + '", return ONLY minified JSON, no markdown, no prose, with this exact shape: {"model":"","brand":"","type":"","maxFlow":"","maxPress":"","control":"","note":""}. Rules: maxFlow like "30 L/h" or "500 mL/min"; maxPress like "16 bar"; type one of "Solenoid diaphragm","Motor diaphragm","Digital diaphragm","Peristaltic","Progressive cavity"; control like "Digital","Analog / pulse","Stroke + VFD"; note = one short sentence on typical use. If you are unsure of the exact model, give best-estimate figures for that product family and still fill every field.';
        window.claude.complete({ messages: [{ role: 'user', content: prompt }], max_tokens: 400 }).then(function (raw) {
          try {
            var cleaned = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
            var m = cleaned.match(/\{[\s\S]*\}/);
            var j = JSON.parse(m ? m[0] : cleaned);
            var pump = {
              id: 'f' + Date.now(), ai: true, tag: 'AI', tint: '#EDE7F7', tintText: '#6A4CA0',
              model: j.model || query, brand: j.brand || '—', type: j.type || '—',
              maxFlow: j.maxFlow || '—', maxPress: j.maxPress || '—', control: j.control || '—',
              note: j.note || '', verified: 'ai'
            };
            var foundPumps = [pump].concat(App.state.foundPumps);
            App.persistPumps(foundPumps);
            App.setState({ foundPumps: foundPumps, pumpLoading: false, pumpQuery: pump.model });
          } catch (e2) {
            App.setState({ pumpLoading: false, pumpError: 'Could not retrieve specs for “' + query + '”. Check the spelling of the model, or add it manually from the datasheet.' });
          }
        }).catch(function () {
          App.setState({ pumpLoading: false, pumpError: 'Could not retrieve specs for “' + query + '”. Check the spelling of the model, or add it manually from the datasheet.' });
        });
      } else {
        // Offline / standalone: pre-fill the manual add form with the query.
        var npu = Object.assign({}, App.state.npu, { model: query });
        App.setState({ showPumpForm: true, npu: npu, pumpError: 'Offline — automatic lookup needs a connection. Enter the specs from the datasheet below (the model name is pre-filled), or check your saved pumps.' });
      }
    },

    // clients
    cancelClient: function () { App.setState({ showClientForm: false, clientName: '', clientSite: '' }); },
    confirmClient: function () {
      var s = App.state;
      if (!s.clientName.trim()) return;
      var p = App.allProducts().find(function (x) { return x.id === s.calcProductId; });
      var c = {
        id: 'c' + Date.now(), name: s.clientName.trim(), site: s.clientSite.trim(),
        mode: s.calcMode, flow: s.flow, dose: s.dose, sludgeFlow: s.sludgeFlow, ds: s.ds, doseKg: s.doseKg, sludgeDensity: s.sludgeDensity,
        flowUnit: s.flowUnit, sludgeFlowUnit: s.sludgeFlowUnit,
        makedown: s.makedown, density: s.density, pumpMax: s.pumpMax, form: s.form,
        productId: s.calcProductId, productName: p ? p.name : ''
      };
      var clients = [c].concat(s.clients);
      App.persist(clients);
      App.setState({ clients: clients, showClientForm: false, clientName: '', clientSite: '' });
    },
    deleteClient: function (el) {
      var id = el.dataset.id;
      var clients = App.state.clients.filter(function (c) { return c.id !== id; });
      App.persist(clients);
      App.setState({ clients: clients });
    },
    loadClient: function (el) {
      var id = el.dataset.id;
      var c = App.state.clients.find(function (x) { return x.id === id; });
      if (!c) return;
      App.setState({
        screen: 'calc', productId: null,
        calcProductId: c.productId || '', calcMode: c.mode || 'conc', form: c.form || 'liquid',
        flow: c.flow, dose: c.dose, sludgeFlow: c.sludgeFlow, ds: c.ds, doseKg: c.doseKg, sludgeDensity: c.sludgeDensity || '1.0',
        flowUnit: c.flowUnit || 'm3h', sludgeFlowUnit: c.sludgeFlowUnit || 'm3h',
        makedown: c.makedown, density: c.density, pumpMax: c.pumpMax
      });
    }
  };

  App.H = H;
  window.FieldAssistant = App;

  // The render/template layer is defined in render.js (loaded after this file).
  document.addEventListener('DOMContentLoaded', function () {
    App.load();
    App.mount();
  });
})();
