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
      productPickerOpen: false, productPickerQuery: '',
      calcPumpPickerOpen: false, calcPumpPickerQuery: '',
      jarProductPickerOpen: false, jarProductPickerQuery: '',
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
      showJarSave: false, jarSaveClient: '', jarSaveNote: '', jarSaved: false, jarSaveError: '', clientSaveError: '',
      guideId: null, guideChecks: {},
      guideReadings: {}, guideSaveClient: '', guideSaveName: '', guideSaved: false, guideSaveError: '',
      guideProgProductId: '', guideProgPickerOpen: false, guideProgPickerQuery: '',
      guideProgDose: '', guideProgDoseUnit: 'mgL', guideProgFlow: '', guideProgFlowUnit: 'm3h',
      guideProgFor: '', guideProgByPb: {},
      jarCurrentDose: '', bracketNote: '',
      mgSample: '500', mgSolids: '30', mgStock: '0.1', mgMl: ''
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

    DOSE_UNITS: [
      { v: 'mgL', label: 'mg/L' },
      { v: 'kgt', label: 'kg/t DS' },
      { v: 'gt', label: 'g/t DS' }
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
    persist: function (c) { try { localStorage.setItem('ctf_clients_v1', JSON.stringify(c)); return true; } catch (e) { return false; } },
    persistPumps: function (p) { try { localStorage.setItem('ctf_pumps_v1', JSON.stringify(p)); return true; } catch (e) { return false; } },
    persistProducts: function (p) { try { localStorage.setItem('ctf_products_v1', JSON.stringify(p)); return true; } catch (e) { return false; } },
    persistTests: function (t) { try { localStorage.setItem('ctf_jartests_v1', JSON.stringify(t)); return true; } catch (e) { return false; } },

    // ---- maths (verbatim port) ---------------------------------------------
    flowFactor: function (u) { var f = this.FLOW_UNITS.find(function (x) { return x.v === u; }); return f ? f.k : 1; },
    flowLabel: function (u) { var f = this.FLOW_UNITS.find(function (x) { return x.v === u; }); return f ? f.label : 'm³/h'; },
    // Unknown codes label as themselves — a silent fallback label would relabel
    // a saved dose under the wrong unit.
    doseUnitLabel: function (v) { var u = this.DOSE_UNITS.find(function (x) { return x.v === v; }); return u ? u.label : String(v); },
    // Strict decimal parse: the whole string must be one plain positive number.
    // parseFloat's prefix parsing turns '1,000' into 1 and '5-10' into 5 — a
    // three-orders-of-magnitude dosing error that looks valid on screen.
    parseNum: function (str) {
      var t = String(str == null ? '' : str).trim();
      return /^\d*\.?\d+$/.test(t) ? parseFloat(t) : NaN;
    },
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
    // Inverse of jarPpm: mL of stock that delivers `ppm` in the current jar setup.
    jarMl: function (ppm) {
      var sp = parseFloat(this.state.stockPct), v = parseFloat(this.state.jarVol);
      if (!isFinite(ppm) || !isFinite(sp) || sp <= 0 || !isFinite(v) || v <= 0) return NaN;
      return ppm * v / (10000 * sp);
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

    // ---- Guide tab maths ------------------------------------------------------
    // Potable demand snapshot. The band thresholds are ILLUSTRATIVE demo values
    // (rendered with an EXAMPLE badge) — calibrate against site jar-test history.
    computeTdi: function (pbId) {
      var pre = (pbId || 'potable') + ':';
      var r = this.state.guideReadings;
      var t = this.parseNum(r[pre + 'turb']), u = this.parseNum(r[pre + 'uv']), a = this.parseNum(r[pre + 'alk']), p = this.parseNum(r[pre + 'ph']);
      var LEV = ['Low', 'Moderate', 'High'];
      var COL = [
        { fg: '#2C7A45', bg: '#EAF5EC' },
        { fg: '#8A5E17', bg: '#FBF6EC' },
        { fg: '#8A3A24', bg: '#FBEBE7' }
      ];
      function band(v, lo, hi) { return !isFinite(v) ? null : (v < lo ? 0 : (v <= hi ? 1 : 2)); }
      var rows = [];
      var nom = band(u, 0.05, 0.15);
      if (nom != null) rows.push({ label: 'Organics / NOM (UV254)', lvl: LEV[nom], fg: COL[nom].fg, bg: COL[nom].bg, note: [
        'Little dissolved-organic demand indicated.',
        'NOM present — expect meaningful coagulant demand for organics.',
        'Organics likely drive the dose — check colour/DOC; a higher-basicity coagulant may suit.'
      ][nom] });
      var part = band(t, 10, 50);
      if (part != null) rows.push({ label: 'Particle load (turbidity)', lvl: LEV[part], fg: COL[part].fg, bg: COL[part].bg, note: [
        'Low particle loading.',
        'Moderate particle loading.',
        'High solids — sweep flocculation likely; judge settled AND filtered turbidity.'
      ][part] });
      if (isFinite(a)) {
        // 'Adequate' and 'Well buffered' intentionally share the calm colour —
        // only low alkalinity is a warning state.
        var ab = a < 40 ? 2 : 0;
        rows.push({ label: 'Buffering (alkalinity)', lvl: a < 40 ? 'Poor' : (a <= 120 ? 'Adequate' : 'Well buffered'), fg: COL[ab].fg, bg: COL[ab].bg, note: a < 40
          ? 'Poorly buffered — hydrolysing coagulants will depress pH; alkalinity supplementation may be needed.'
          : (a <= 120 ? 'Buffering adequate for typical doses.' : 'Well buffered — post-dose pH easier to hold.') });
      }
      if (isFinite(p)) {
        var pb = (p >= 6.5 && p <= 8) ? 0 : 1;
        rows.push({ label: 'Raw pH', lvl: this.fmt(p, 1), fg: COL[pb].fg, bg: COL[pb].bg, note: p < 6.5
          ? 'Already low — watch total acid demand from the coagulant.'
          : (p > 8 ? 'High — check the post-dose pH target; coagulant choice and dose both move it.' : 'In the usual coagulation window.') });
      }
      var demand = Math.max(nom == null ? -1 : nom, part == null ? -1 : part);
      var summary = demand < 0 ? '' : 'Overall chemical demand: ' + LEV[demand].toLowerCase() + ' (example banding). Confirm with a compact multi-point jar test before recommending.';
      return { rows: rows, summary: summary, hasAny: rows.length > 0 };
    },
    // Mining bench dose: sample mass + %solids + stock added → g/t dry solids.
    computeBench: function () {
      var s = this.state;
      var m = this.parseNum(s.mgSample), so = this.parseNum(s.mgSolids), st = this.parseNum(s.mgStock), ml = this.parseNum(s.mgMl);
      var dryG = (m > 0 && so > 0 && so <= 100) ? m * so / 100 : NaN; // g dry solids; >100 %w/w is physically impossible — abstain
      var activeMg = (st > 0 && ml > 0) ? ml * st * 10 : NaN; // % w/v → mg/mL is ×10
      var doseGt = (isFinite(dryG) && dryG > 0 && isFinite(activeMg)) ? activeMg * 1000 / dryG : NaN;
      return {
        dryG: this.fmt(dryG, 1),
        activeMg: this.fmt(activeMg, 1),
        doseGt: this.fmt(doseGt, 0),
        ok: isFinite(doseGt)
      };
    },

    // Which basis a product's datasheet dose is quoted in.
    // 'mgL' = mg/L on flow · 'kgt' = kg/t dry solids · 'gt' = g/t dry solids/substrate.
    // Returns null when the phrasing is unrecognisable — the callers then abstain
    // from any window comparison rather than guessing a basis (a wrong guess here
    // is a confident 1000× dosing error; an abstention is just a missing chip).
    doseBasisOf: function (p) {
      var c = String((p && p.doseUnit) || '').replace(/\s+/g, '').toLowerCase();
      if (!c) return 'mgL'; // no unit recorded — generic products dose mg/L on flow
      if (c.indexOf('mg/l') >= 0 || c.indexOf('mgl') >= 0 || c.indexOf('ppm') >= 0) return 'mgL';
      if (c.indexOf('kg/t') >= 0 || c.indexOf('kgpert') >= 0) return 'kgt';
      if (c.indexOf('g/t') >= 0 || c.indexOf('gpert') >= 0) return 'gt';
      return null;
    },
    // Window comparison against a specific product's datasheet range. `val` must
    // already be in the product's own dose basis. Abstains rather than guesses:
    // no comparison for comma-grouped numbers, capped/multi-context ranges
    // ("0.25-0.5; NSF max 1.0"), or anything that isn't exactly "lo – hi".
    doseWindowFor: function (p, val) {
      if (!p || !p.doseRange || !isFinite(val) || val <= 0) return null;
      var basis = this.doseBasisOf(p);
      if (!basis) return null; // unrecognisable basis — no comparison
      var str = String(p.doseRange);
      if (str.indexOf(',') >= 0) return null;
      var nums = str.match(/[\d.]+/g) || [];
      var all = str.match(/[\d.]+\s*[–—-]\s*[\d.]+/g);
      if (!all || all.length !== 1 || nums.length !== 2) return null;
      // Each bound must be a plain decimal with ≤2 dp: '1.000' is indistinguishable
      // from European thousands grouping, and '0.5.2' is a typo — abstain on both.
      if (!nums.every(function (n) { return /^\d+(\.\d{1,2})?$/.test(n); })) return null;
      var m = all[0].match(/([\d.]+)\s*[–—-]\s*([\d.]+)/);
      var lo = parseFloat(m[1]), hi = parseFloat(m[2]);
      if (!isFinite(lo) || !isFinite(hi) || hi <= 0 || lo > hi) return null;
      var status = val < lo ? 'below' : (val > hi ? 'above' : 'within');
      return { lo: lo, hi: hi, val: val, status: status, unit: this.doseUnitLabel(basis), raw: p.doseRange, name: p.name, verified: p.verified, note: p.doseNote || '' };
    },
    // Calc screen: compare the entered dose when the product's dose basis is
    // reachable from the calc mode (mg/L ↔ conc; kg/t or g/t ↔ sludge). A basis
    // the mode can't reach returns a mismatch object — the calc must SAY the
    // datasheet doses on a different basis, not silently drop the check.
    doseWindow: function () {
      var s = this.state;
      var p = this.allProducts().find(function (x) { return x.id === s.calcProductId; });
      if (!p) return null;
      var basis = this.doseBasisOf(p);
      if (!basis) return null; // unrecognisable basis — abstain
      var mismatch = { mismatch: true, name: p.name, rawUnit: p.doseUnit || '', note: p.doseNote || '' };
      if (s.calcMode === 'conc') {
        if (basis !== 'mgL') return mismatch;
        return this.doseWindowFor(p, this.parseNum(s.dose));
      }
      var v = this.parseNum(s.doseKg); // sludge mode doses in kg/t DS
      if (basis === 'kgt') return this.doseWindowFor(p, v);
      if (basis === 'gt') {
        var w = this.doseWindowFor(p, v * 1000);
        if (w) w.converted = true;
        return w;
      }
      return mismatch; // mg/L-basis product in sludge mode
    },
    // Current dosing programme entered in a playbook: window check + consumption.
    computeProg: function () {
      var s = this.state;
      var p = this.allProducts().find(function (x) { return x.id === s.guideProgProductId; }) || null;
      var d = this.parseNum(s.guideProgDose); // strict: '1,000' and '5-10' abstain, negatives rejected
      if (!(d > 0)) d = NaN;
      var basis = s.guideProgDoseUnit; // mgL | kgt | gt
      var win = null, unitMismatch = false;
      if (p && isFinite(d)) {
        var pBasis = this.doseBasisOf(p);
        var val = NaN;
        if (pBasis && basis === pBasis) val = d;
        else if (basis === 'kgt' && pBasis === 'gt') val = d * 1000;
        else if (basis === 'gt' && pBasis === 'kgt') val = d / 1000;
        if (isFinite(val)) {
          win = this.doseWindowFor(p, val);
          if (win) win.converted = basis !== pBasis;
        } else unitMismatch = true;
      }
      var Q = this.parseNum(s.guideProgFlow) * this.flowFactor(s.guideProgFlowUnit);
      if (!(Q > 0)) Q = NaN;
      var kgH = (basis === 'mgL' && isFinite(Q) && isFinite(d)) ? Q * d / 1000 : NaN;
      return {
        product: p, win: win, unitMismatch: unitMismatch,
        kgH: this.fmt(kgH, 2), kgDay: this.fmt(kgH * 24, 1), hasCons: isFinite(kgH),
        canRetest: basis === 'mgL' && isFinite(d),
        canSend: !!p || isFinite(d) || isFinite(Q)
      };
    },

    // ---- state plumbing -----------------------------------------------------
    setState: function (patch) { Object.assign(this.state, patch); this.render(); },

    allProducts: function () { return this.PRODUCTS.concat(this.state.customProducts); },
    allPumps: function () { return this.PUMPS.concat(this.state.foundPumps); },

    // Fresh client record. Both save paths (calc + playbook readings) build on
    // this so the shape and id scheme can never diverge.
    newClient: function (name, site) {
      return { id: 'c' + Date.now(), name: name, site: site || '', readings: [] };
    },
    findClientByName: function (clients, name) {
      var n = String(name || '').trim().toLowerCase();
      if (!n) return null;
      return clients.find(function (c) { return String(c.name || '').trim().toLowerCase() === n; }) || null;
    },
    // The patch a product selection applies to the calculator (form + density).
    productCalcPatch: function (p) {
      var patch = {};
      if (!p) return patch;
      patch.form = p.form === 'Powder' ? 'powder' : 'liquid';
      if (p.density) patch.density = String(p.density);
      return patch;
    },
    // ---- unsaved-field tracking (guards the update auto-reload) -------------
    // _snap records what each save actually persisted this session. Flags like
    // guideSaved can't do this job: one playbook's save must not vouch for
    // another playbook's readings, and a saved jar test must stop vouching the
    // moment its jars are edited again. Not persisted — a reload loses the live
    // state too, which is exactly what the guard exists to prevent.
    _snap: { readings: {}, prog: {}, jars: '' },
    progSig: function (slate) {
      var hasData = String(slate.dose || '').trim() || String(slate.flow || '').trim() || slate.productId;
      return hasData ? JSON.stringify([slate.productId || '', slate.dose || '', slate.doseUnit || '', slate.flow || '', slate.flowUnit || '']) : '';
    },
    liveProgSig: function () {
      var s = this.state;
      return this.progSig({ productId: s.guideProgProductId, dose: s.guideProgDose, doseUnit: s.guideProgDoseUnit, flow: s.guideProgFlow, flowUnit: s.guideProgFlowUnit });
    },
    jarsSig: function () {
      var s = this.state;
      return JSON.stringify([s.jars, s.winner, s.jarCurrentDose]);
    },
    // index.html's controllerchange handler asks this before auto-reloading an
    // update: a mid-visit reload would destroy these memory-only entries.
    hasUnsavedFieldData: function () {
      var s = this.state, snap = this._snap;
      for (var k in s.guideReadings) {
        if (String(s.guideReadings[k] || '').trim() && snap.readings[k] !== s.guideReadings[k]) return true;
      }
      if (s.guideProgFor) {
        var liveSig = this.liveProgSig();
        if (liveSig && snap.prog[s.guideProgFor] !== liveSig) return true;
      }
      for (var pid in s.guideProgByPb) {
        var sig = this.progSig(s.guideProgByPb[pid] || {});
        if (sig && snap.prog[pid] !== sig) return true;
      }
      var jarsHaveData = s.winner !== null || String(s.jarCurrentDose || '').trim() !== '' ||
        s.jars.some(function (j) { return j.ph || j.turb || j.floc; });
      if (jarsHaveData && snap.jars !== this.jarsSig()) return true;
      if (String(s.mgMl || '').trim()) return true; // bench entry has no save path
      return false;
    },
    // Record what a successful playbook save covered: this playbook's readings
    // and the live programme slate. Other playbooks' entries stay unsaved.
    _stampGuideSnap: function (pb) {
      var s = this.state;
      pb.fields.forEach(function (f) {
        App._snap.readings[pb.id + ':' + f.k] = s.guideReadings[pb.id + ':' + f.k];
      });
      this._snap.prog[pb.id] = this.liveProgSig();
    },

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

    // guide (field playbooks)
    goGuide: function () { App.setState({ screen: 'guide', guideId: null, productId: null }); },
    openGuide: function (el) {
      var id = el.dataset.id;
      var s = App.state;
      // guideSaved survives re-opening the SAME playbook (nothing changed, so the
      // banner is still true and Save stays disabled — re-enabling it here was a
      // duplicate-entry path); switching playbooks clears it.
      var patch = { screen: 'guide', guideId: id, guideSaved: id === s.guideProgFor ? s.guideSaved : false, guideSaveError: '' };
      // The programme entry belongs to one playbook (guideProgFor). Switching
      // playbooks parks the outgoing entry in guideProgByPb and restores this
      // playbook's own — navigation never wipes an entered dose, and value and
      // unit always travel together (never relabel a dose under a new unit).
      if (id !== s.guideProgFor) {
        var store = Object.assign({}, s.guideProgByPb);
        if (s.guideProgFor) {
          store[s.guideProgFor] = {
            productId: s.guideProgProductId, dose: s.guideProgDose, doseUnit: s.guideProgDoseUnit,
            flow: s.guideProgFlow, flowUnit: s.guideProgFlowUnit
          };
        }
        var pb = (window.PLAYBOOKS && window.PLAYBOOKS.list.find(function (x) { return x.id === id; })) || null;
        var saved = store[id] || null;
        if (saved) delete store[id]; // the live slate owns it again — a stale copy would double-count as unsaved data
        patch.guideProgByPb = store;
        patch.guideProgFor = id;
        patch.guideProgProductId = saved ? saved.productId : '';
        patch.guideProgDose = saved ? saved.dose : '';
        patch.guideProgFlow = saved ? saved.flow : '';
        patch.guideProgDoseUnit = saved ? saved.doseUnit : ((pb && pb.progUnit) || 'mgL');
        patch.guideProgFlowUnit = saved ? saved.flowUnit : 'm3h';
        patch.guideProgPickerOpen = false; patch.guideProgPickerQuery = '';
      }
      App.setState(patch);
    },
    backToGuide: function () { App.setState({ guideId: null }); },
    toggleGuideCheck: function (el) {
      var k = el.dataset.ck;
      var g = Object.assign({}, App.state.guideChecks);
      g[k] = !g[k];
      App.setState({ guideChecks: g });
    },
    guideToProducts: function (el) { App.setState({ screen: 'products', productFilter: el.dataset.v || 'all', productId: null, productQuery: '' }); },
    guideToSludgeCalc: function () { App.setState({ screen: 'calc', calcMode: 'sludge' }); },
    // A playbook whose dose basis is mg/L on flow must land in Concentration
    // mode, whatever mode the calc was last left in.
    guideToConcCalc: function () { App.setState({ screen: 'calc', calcMode: 'conc' }); },
    onGuideReading: function (el) {
      var g = Object.assign({}, App.state.guideReadings);
      g[el.dataset.f] = el.value;
      App.setState({ guideReadings: g, guideSaved: false, guideSaveError: '' });
    },
    // Programme inputs / selects: any edit invalidates the '✓ Saved' banner —
    // it must never claim a value the client record doesn't hold.
    onGuideProgField: function (el) {
      var patch = { guideSaved: false, guideSaveError: '' };
      patch[el.dataset.f] = el.value;
      App.setState(patch);
    },
    onGuideProgSelect: function (el) {
      var patch = { guideSaved: false, guideSaveError: '' };
      patch[el.dataset.f] = el.value;
      App.setState(patch);
    },
    toggleGuideProgPicker: function () {
      var open = !App.state.guideProgPickerOpen;
      App._focusKey = open ? 'guideProgPickerQuery' : null;
      App.setState({ guideProgPickerOpen: open, guideProgPickerQuery: '' });
    },
    pickGuideProgProduct: function (el) {
      App.setState({ guideProgProductId: el.dataset.id, guideProgPickerOpen: false, guideProgPickerQuery: '', guideSaved: false, guideSaveError: '' });
    },
    // Carry the plant's current programme into the calculator. An explicit
    // "send" action is allowed to set the matching calc mode.
    guideProgToCalc: function () {
      var s = App.state;
      var p = App.allProducts().find(function (x) { return x.id === s.guideProgProductId; }) || null;
      // '— not in library / unknown —' must clear the calc's product too: leaving
      // a stale selection would grade this plant's dose against the wrong datasheet.
      var patch = Object.assign({ screen: 'calc', calcProductId: p ? p.id : '' }, App.productCalcPatch(p));
      var d = App.parseNum(s.guideProgDose);   // strict parse: only clean positive
      var f = App.parseNum(s.guideProgFlow);   // numbers may reach the calculator
      if (s.guideProgDoseUnit === 'mgL') {
        patch.calcMode = 'conc';
        if (d > 0) patch.dose = String(d);
        if (f > 0) { patch.flow = String(f); patch.flowUnit = s.guideProgFlowUnit; }
      } else {
        patch.calcMode = 'sludge';
        if (d > 0) patch.doseKg = String(s.guideProgDoseUnit === 'gt' ? d / 1000 : d);
        if (f > 0) { patch.sludgeFlow = String(f); patch.sludgeFlowUnit = s.guideProgFlowUnit; }
        // carry the solids reading collected on this playbook screen — the calc's
        // stale % DS default would silently mis-state consumption otherwise
        var sv = App.parseNum(s.guideReadings[s.guideId + ':solids']);
        if (sv > 0 && sv <= 100) patch.ds = String(sv);
      }
      App.setState(patch);
    },
    // Optimisation retest of the current programme: jump to jars pre-bracketed,
    // carrying the programme's product so the test is attributed correctly.
    guideProgRetest: function () {
      var s = App.state;
      var d = App.parseNum(s.guideProgDose);
      if (!(d > 0)) return;
      var p = App.allProducts().find(function (x) { return x.id === s.guideProgProductId; }) || null;
      App.setState({ screen: 'jars', jarCurrentDose: String(d), jarProductId: p ? p.id : '' });
      App.H.bracketJars();
    },
    saveGuideReadings: function () {
      var s = App.state;
      var pb = window.PLAYBOOKS && window.PLAYBOOKS.list.find(function (x) { return x.id === s.guideId; });
      if (!pb || !pb.fields) return;
      var vals = [];
      pb.fields.forEach(function (f) {
        var v = (s.guideReadings[pb.id + ':' + f.k] || '').trim();
        if (v) vals.push({ label: f.label, v: v, u: f.u });
      });
      // current dosing programme (product / rate / flow) saves alongside the readings
      var progP = App.allProducts().find(function (x) { return x.id === s.guideProgProductId; });
      var pd = (s.guideProgDose || '').trim(), pf = (s.guideProgFlow || '').trim();
      var prog = null;
      if (progP || pd || pf) {
        prog = {
          product: progP ? progP.name : '',
          dose: pd, unit: App.doseUnitLabel(s.guideProgDoseUnit),
          flow: pf, flowUnit: App.flowLabel(s.guideProgFlowUnit)
        };
      }
      if (!vals.length && !prog) {
        App.setState({ guideSaveError: 'Nothing to save yet — enter at least one reading or the dosing programme.' });
        return;
      }
      var clients = s.clients.slice();
      var cid = s.guideSaveClient;
      // a stale selection (client deleted since) must not swallow the save
      if (cid && !clients.some(function (c) { return c.id === cid; })) cid = '';
      var newName = s.guideSaveName.trim();
      if (!cid && newName) {
        // a site already on file under this name gets the readings appended —
        // never a second record splitting the site's history
        var existing = App.findClientByName(clients, newName);
        if (existing) cid = existing.id;
        else { var nc = App.newClient(newName); clients = [nc].concat(clients); cid = nc.id; }
      }
      if (!cid) {
        App.setState({ guideSaveError: 'Choose a client or type a new client name first — nothing was saved.' });
        return;
      }
      var entry = { date: new Date().toLocaleDateString('en-AU'), app: pb.name, values: vals, prog: prog };
      // The record already holding exactly this entry (Save re-enabled by
      // navigation with nothing changed) is a success, not a duplicate — a
      // second identical append would only pollute the site history. Backstop
      // to the disabled-while-guideSaved button.
      var target = clients.find(function (c) { return c.id === cid; });
      var latest = target && target.readings && target.readings[0];
      if (latest && JSON.stringify(latest) === JSON.stringify(entry)) {
        App._stampGuideSnap(pb);
        App.setState({ guideSaved: true, guideSaveClient: cid, guideSaveError: '' });
        return;
      }
      clients = clients.map(function (c) {
        if (c.id !== cid) return c;
        var copy = Object.assign({}, c);
        copy.readings = [entry].concat(copy.readings || []);
        return copy;
      });
      if (!App.persist(clients)) {
        App.setState({ guideSaveError: 'Could not write to this device’s storage — the readings are NOT saved. Free up space (or leave private browsing) and save again.' });
        return;
      }
      // guideSaved also disables the Save button until something is edited —
      // that is the double-tap guard (any input clears it via onGuideProgField/onGuideReading)
      App._stampGuideSnap(pb);
      App.setState({ clients: clients, guideSaved: true, guideSaveClient: cid, guideSaveName: '', guideSaveError: '' });
    },
    // Optimisation retest: set the jars to 50–150% of the current full-scale dose.
    // Abstains loudly (bracketNote) instead of leaving stale jars that would
    // masquerade as the requested bracket.
    bracketJars: function () {
      var s = App.state;
      var cur = App.parseNum(s.jarCurrentDose), vol = App.parseNum(s.jarVol), sp = App.parseNum(s.stockPct);
      if (!(cur > 0) || !(vol > 0) || !(sp > 0)) {
        App.setState({ bracketNote: 'Jars unchanged — enter the current dose, jar volume and stock strength first.' });
        return;
      }
      var doses = [0.5, 0.75, 1, 1.25, 1.5].map(function (f) {
        return Math.round(App.jarMl(cur * f) * 100) / 100; // 0.01 mL is the finest step the jar cards resolve
      });
      var seen = {};
      var degenerate = doses.some(function (ml) { if (ml <= 0 || seen[ml]) return true; seen[ml] = 1; return false; });
      if (degenerate) {
        App.setState({ bracketNote: 'Jars unchanged — at this dose and stock strength the 50–150% volumes collapse below 0.01 mL steps. Use a weaker stock or larger jars, then bracket again.' });
        return;
      }
      var hasResults = s.winner !== null || s.jars.some(function (j) { return j.ph || j.turb || j.floc; });
      if (hasResults && !window.confirm('Replace the current jars? Recorded pH / turbidity / floc results will be cleared.')) {
        // declining is not a failure — a stale abstention note must not linger
        if (s.bracketNote) App.setState({ bracketNote: '' });
        return;
      }
      var jars = doses.map(function (ml) { return { dose: String(ml), ph: '', turb: '', floc: '' }; });
      App.setState({ jars: jars, winner: null, bracketNote: '' });
    },

    // products
    setProductFilter: function (el) { App.setState({ productFilter: el.dataset.v }); },
    openProduct: function (el) { App.setState({ productId: el.dataset.id }); },
    backToProducts: function () { App.setState({ productId: null }); },
    useProductInCalc: function () {
      var p = App.allProducts().find(function (x) { return x.id === App.state.productId; }) || null;
      App.setState(Object.assign({ screen: 'calc', calcProductId: p ? p.id : '', productId: null }, App.productCalcPatch(p)));
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

    // searchable product / pump pickers (Dose page)
    toggleProductPicker: function () {
      var open = !App.state.productPickerOpen;
      App._focusKey = open ? 'productPickerQuery' : null;
      App.setState({ productPickerOpen: open, calcPumpPickerOpen: false, productPickerQuery: '' });
    },
    pickProduct: function (el) {
      var id = el.dataset.id;
      var p = App.allProducts().find(function (x) { return x.id === id; }) || null;
      App.setState(Object.assign({ calcProductId: id, productPickerOpen: false, productPickerQuery: '' }, App.productCalcPatch(p)));
    },
    toggleCalcPumpPicker: function () {
      var open = !App.state.calcPumpPickerOpen;
      App._focusKey = open ? 'calcPumpPickerQuery' : null;
      App.setState({ calcPumpPickerOpen: open, productPickerOpen: false, calcPumpPickerQuery: '' });
    },
    pickCalcPump: function (el) {
      var id = el.dataset.id;
      var p = App.allPumps().find(function (x) { return x.id === id; });
      var vf = p ? App.parsePumpFlow(p.maxFlow) : NaN;
      App.setState({
        selectedCalcPumpId: id,
        pumpMax: (p && isFinite(vf)) ? String(Math.round(vf * 100) / 100) : App.state.pumpMax,
        calcPumpPickerOpen: false, calcPumpPickerQuery: ''
      });
    },
    closePickers: function () { App.setState({ productPickerOpen: false, calcPumpPickerOpen: false, jarProductPickerOpen: false, guideProgPickerOpen: false }); },
    toggleJarProductPicker: function () {
      var open = !App.state.jarProductPickerOpen;
      App._focusKey = open ? 'jarProductPickerQuery' : null;
      App.setState({ jarProductPickerOpen: open, jarProductPickerQuery: '' });
    },
    pickJarProduct: function (el) {
      var id = el.dataset.id;
      var p = App.allProducts().find(function (x) { return x.id === id; });
      App.setState({ jarProductId: id, stockPct: p ? '0.1' : App.state.stockPct, jarProductPickerOpen: false, jarProductPickerQuery: '' });
    },
    onFormLiquid: function () { App.setState({ form: 'liquid' }); },
    onFormPowder: function () { App.setState({ form: 'powder' }); },
    onSelectProduct: function (el) {
      var p = App.allProducts().find(function (x) { return x.id === el.value; }) || null;
      // note: product selection no longer changes the calc mode — the user's
      // Concentration/Sludge tab choice is left untouched.
      App.setState(Object.assign({ calcProductId: el.value }, App.productCalcPatch(p)));
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
      var s = App.state;
      // A jar mg/L is only a full-scale dose for mg/L-on-flow products. For a
      // dry-tonne-basis product there is no conversion without the solids
      // balance — the winner card explains this instead of offering the button.
      var jp = App.allProducts().find(function (x) { return x.id === s.jarProductId; });
      if (jp && App.doseBasisOf(jp) !== 'mgL') return;
      var wj = (s.winner !== null && s.jars[s.winner]) ? s.jars[s.winner] : null;
      var ppm = wj ? App.jarPpm(wj.dose) : NaN;
      if (!isFinite(ppm)) return;
      // plain string, not fmt(): locale grouping ('1,234.5') would misparse as 1
      App.setState({ screen: 'calc', calcMode: 'conc', dose: String(Math.round(ppm * 100) / 100) });
    },
    startJarSave: function () { App.setState({ showJarSave: true, jarSaved: false, jarSaveError: '' }); },
    cancelJarSave: function () { App.setState({ showJarSave: false, jarSaveError: '' }); },
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
      if (!App.persistTests(jarTests)) {
        App.setState({ jarSaveError: 'Could not write to this device’s storage — the test is NOT saved. Free up space (or leave private browsing) and save again.' });
        return;
      }
      App._snap.jars = App.jarsSig(); // this exact jar setup is now on record — safe for an update reload
      App.setState({ jarTests: jarTests, showJarSave: false, jarSaved: true, jarSaveNote: '', jarSaveError: '' });
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
    cancelClient: function () { App.setState({ showClientForm: false, clientName: '', clientSite: '', clientSaveError: '' }); },
    confirmClient: function () {
      var s = App.state;
      var name = s.clientName.trim();
      if (!name) return;
      var p = App.allProducts().find(function (x) { return x.id === s.calcProductId; });
      var calcFields = {
        mode: s.calcMode, flow: s.flow, dose: s.dose, sludgeFlow: s.sludgeFlow, ds: s.ds, doseKg: s.doseKg, sludgeDensity: s.sludgeDensity,
        flowUnit: s.flowUnit, sludgeFlowUnit: s.sludgeFlowUnit,
        makedown: s.makedown, density: s.density, pumpMax: s.pumpMax, form: s.form,
        productId: s.calcProductId, productName: p ? p.name : ''
      };
      if (s.clientSite.trim()) calcFields.site = s.clientSite.trim();
      var clients;
      var existing = App.findClientByName(s.clients, name);
      // Merge only when it's unambiguously the same site: never across two
      // different site labels, and never silently over an existing saved calc —
      // that snapshot may be the only record of the site's programme.
      if (existing && existing.site && s.clientSite.trim() && existing.site.trim().toLowerCase() !== s.clientSite.trim().toLowerCase()) existing = null;
      if (existing && existing.mode && !window.confirm('“' + existing.name + '” already has a saved calculation. Replace it with this one? Cancel keeps this save as a separate client.')) existing = null;
      if (existing) {
        clients = s.clients.map(function (c) { return c.id === existing.id ? Object.assign({}, c, calcFields) : c; });
      } else {
        clients = [Object.assign(App.newClient(name, s.clientSite.trim()), calcFields)].concat(s.clients);
      }
      if (!App.persist(clients)) {
        App.setState({ clientSaveError: 'Could not write to this device’s storage — the client is NOT saved. Free up space (or leave private browsing) and save again.' });
        return;
      }
      App.setState({ clients: clients, showClientForm: false, clientName: '', clientSite: '', clientSaveError: '' });
    },
    deleteClient: function (el) {
      var id = el.dataset.id;
      var clients = App.state.clients.filter(function (c) { return c.id !== id; });
      App.persist(clients);
      var patch = { clients: clients };
      // clear any picker still pointing at the deleted client
      if (App.state.guideSaveClient === id) patch.guideSaveClient = '';
      if (App.state.jarSaveClient === id) patch.jarSaveClient = '';
      App.setState(patch);
    },
    loadClient: function (el) {
      var id = el.dataset.id;
      var c = App.state.clients.find(function (x) { return x.id === id; });
      if (!c) return;
      // readings-only client (saved from a playbook) — no calc setup to load
      if (!c.mode) { App.setState({ screen: 'clients' }); return; }
      var s = App.state;
      App.setState({
        screen: 'calc', productId: null,
        calcProductId: c.productId || '', calcMode: c.mode || 'conc', form: c.form || 'liquid',
        flow: c.flow != null ? c.flow : s.flow, dose: c.dose != null ? c.dose : s.dose,
        sludgeFlow: c.sludgeFlow != null ? c.sludgeFlow : s.sludgeFlow, ds: c.ds != null ? c.ds : s.ds,
        doseKg: c.doseKg != null ? c.doseKg : s.doseKg, sludgeDensity: c.sludgeDensity || '1.0',
        flowUnit: c.flowUnit || 'm3h', sludgeFlowUnit: c.sludgeFlowUnit || 'm3h',
        makedown: c.makedown != null ? c.makedown : s.makedown,
        density: c.density != null ? c.density : s.density,
        pumpMax: c.pumpMax != null ? c.pumpMax : s.pumpMax
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
