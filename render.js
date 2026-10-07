/* ============================================================================
 * Field Assistant — render layer (view-model + templates + event delegation)
 * ==========================================================================*/
(function () {
  'use strict';
  var App = window.FieldAssistant;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function rawHistorical(value) {
    return value === null || value === undefined || value === '' ? 'Unknown / not recorded' : String(value);
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
  function optionTags(list, cur, vkey, lkey) {
    return list.map(function (o) {
      var val = o[vkey], lab = o[lkey];
      return '<option value="' + esc(val) + '"' + (String(val) === String(cur) ? ' selected' : '') + '>' + esc(lab) + '</option>';
    }).join('');
  }
  // verified badge
  function vbadge(verified) {
    if (verified && typeof verified === 'object') {
      var record = verified;
      if (record.custom || record.mine || App.state.customProducts.indexOf(record) >= 0 || App.state.foundPumps.indexOf(record) >= 0) verified = 'custom';
      else if (record.ai || record.verified === 'ai') verified = 'ai';
      else verified = { 'supplier-tds': 'datasheet', 'supplier-brochure': 'brochure', 'manufacturer-web-page': 'webpage', 'manufacturer-document': 'document', 'published-reference': 'reference', 'historical-tds': 'historical' }[record.sourceType] || 'unconfirmed';
    }
    var map = {
      datasheet: { t: 'TDS', bg: '#ECF7F3', fg: '#087568', title: 'Source document type only — not field verification or current operational approval' },
      brochure: { t: 'BROCHURE', bg: '#FBF6EC', fg: '#8A5E17', title: 'Supplier brochure, not a dedicated grade TDS' },
      webpage: { t: 'WEB PAGE', bg: '#FBF6EC', fg: '#8A5E17', title: 'Manufacturer web page, not a dedicated TDS' },
      document: { t: 'DOCUMENT', bg: '#FBF6EC', fg: '#8A5E17', title: 'Manufacturer document; confirm exact operating duty' },
      reference: { t: 'REFERENCE', bg: '#FBF6EC', fg: '#8A5E17', title: 'Published reference, not supplier formulation approval' },
      historical: { t: 'HISTORICAL', bg: '#FBF6EC', fg: '#8A5E17', title: 'Historical document; current grade confirmation required' },
      unconfirmed: { t: 'UNCONFIRMED', bg: '#FBF6EC', fg: '#8A5E17', title: 'Source type or current approval not confirmed' },
      typical: { t: 'TYPICAL', bg: '#FBF6EC', fg: '#8A5E17', title: 'Typical industry value — confirm on the TDS' },
      example: { t: 'EXAMPLE', bg: '#FBF9F4', fg: '#526159', title: 'Editable example — not a datasheet value' },
      custom: { t: 'YOURS', bg: '#F3EFFA', fg: '#6A4CA0', title: 'Your custom entry' },
      ai: { t: 'AI', bg: '#F3EFFA', fg: '#6A4CA0', title: 'AI-retrieved — verify against the datasheet' }
    };
    var m = map[verified]; if (!m) return '';
    return '<span title="' + esc(m.title) + '" style="display:inline-block;font-family:ui-monospace, SFMono-Regular, Consolas, monospace,monospace;font-size:12px;font-weight:600;letter-spacing:.04em;padding:2px 6px;border-radius:6px;background:' + m.bg + ';color:' + m.fg + ';vertical-align:middle;">' + m.t + '</span>';
  }


  // Collapsed-by-default disclosure for the plain notices below ("Why?", "Source details"). Same pattern as the
  // Clients restore / Calculator Advanced toggles: a real button with aria-expanded + aria-controls, the panel is in
  // the DOM and AX tree only while expanded, and the open state is view-only (App.state.noticeOpen, never saved).
  // Typography comes from classes (fa-btn button, role="note" text): no inline font sizes or colours.
  function noticeDomId(key) {
    return 'fa-notice-' + String(key).replace(/[^A-Za-z0-9-]/g, function (c) { return '_' + c.charCodeAt(0).toString(16) + '_'; });
  }
  function noticeDisclosure(key, label, bodyHtml) {
    var map = App.state.noticeOpen || {};
    var open = Object.prototype.hasOwnProperty.call(map, key) && map[key] === true;
    var id = noticeDomId(key);
    return '<button type="button" class="fa-btn" data-act="toggleNotice" data-notice="' + esc(key) + '" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="' + id + '" style="margin-top:6px;border-style:dashed;display:inline-flex;align-items:center;gap:6px;">' + esc(label) +
      '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" style="transform:rotate(' + (open ? '180' : '0') + 'deg);"><path d="M2 3l3 3 3-3"/></svg></button>' +
      (open ? '<div id="' + id + '" role="note" data-notice-panel style="margin-top:6px;">' + bodyHtml + '</div>' : '');
  }

  // Source scope: a one-statement summary that always keeps "not a dosing approval" visible, with every original
  // detail line (unchanged) one tap away in "Source details". opts.key names the disclosure; opts.sourceShown is set
  // where the caller already prints a "Source: ..." line just above (product detail, pump rows).
  function sourceInfo(p, opts) {
    if (!p || !p.id) return '';
    opts = opts || {};
    var userEntry = p.custom || p.mine || App.state.customProducts.indexOf(p) >= 0 || App.state.foundPumps.indexOf(p) >= 0;
    var summary, details;
    if (userEntry) {
      summary = 'Your own entry · not supplier-certified or a dosing approval';
      details = 'User-declared values and supplied document references are not supplier-certified. Current operational approval: unconfirmed. Confirm model/grade and duty independently.';
    } else {
      var pairs = (Array.isArray(p.capacityPairs) ? p.capacityPairs : []).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
        return x.model + ': ' + (x.injectionMaxLh != null ? 'injection max ' + x.injectionMaxLh + ' L/h, depends on motive flow / ratio' : x.flowLh + ' L/h at ' + x.pressureBar + ' bar, ' + x.frequencyHz + ' Hz' + (x.head ? ', ' + x.head + ' head' : ''));
      }).join('; ');
      summary = (opts.sourceShown ? 'Source scope only' : (p.source ? 'Source: ' + esc(p.source) : (p.sourceDocumentCode ? 'Source: ' + esc(p.sourceDocumentCode) : 'Source not recorded'))) + ' · not a dosing approval';
      details = '<b>Source scope, not dosing approval.</b> ' + esc(p.sourceCaution || (p.custom || p.mine ? 'User-declared values, not supplier-certified.' : 'Current source and field approval unconfirmed.')) +
        '<div>Extraction confidence: ' + esc(p.extractionConfidence || 'not recorded') + '; current operational approval: ' + esc(p.operationalApproval || 'unconfirmed') + '.</div>' +
        (p.sourceDocumentCode ? '<div>Document: ' + esc(p.sourceDocumentCode) + '</div>' : '<div>Dedicated document code: not recorded.</div>') +
        (p.retrievedDate ? '<div>Source retrieved: ' + esc(p.retrievedDate) + '</div>' : '') +
        (pairs ? '<div>Paired source ratings (not selected operating duty): ' + esc(pairs) + '</div>' : '') +
        (p.motiveWaterFlow ? '<div>Motive-water throughput only: ' + esc(p.motiveWaterFlow) + '</div>' : '') +
        (p.entryDoseUnit ? '<div>Workflow entry unit only: ' + esc(p.entryDoseUnit) + '. ' + esc(p.entryDoseNote) + '</div>' : '') +
        (Array.isArray(p.doseWindows) ? p.doseWindows.filter(function (w) { return w && typeof w === 'object'; }).map(function (w) { return '<div>Source-window context: ' + esc(w.application) + '; purpose: ' + esc(w.purpose) + '; species/formulation: ' + esc(w.chemicalSpecies) + '; mass basis: ' + esc(w.massBasis) + '; source kind: ' + esc(w.sourceKind) + '; units: ' + esc(w.unit) + '; approval: ' + esc(w.approval) + '.</div>'; }).join('') : '') +
        (p.doseSourceQuote ? '<div>Source dose quote (historical): ' + esc(p.doseSourceQuote) + '</div>' : '') +
        (p.fieldEvidence ? '<div>Field evidence: ' + Object.keys(p.fieldEvidence).map(function (key) { return esc(key) + ': ' + esc(p.fieldEvidence[key]); }).join('; ') + '</div>' : '');
    }
    return '<div data-source-info style="margin-top:10px;"><div role="note" class="fa-help" data-source-summary>' + summary + '</div>' +
      noticeDisclosure(opts.key || 'source', 'Source details', details) + '</div>';
  }

  // one predicate for every product picker — search behaviour can't diverge
  function filterProducts(list, query) {
    var qq = (query || '').trim().toLowerCase();
    return list.filter(function (p) { return !qq || (p.name + ' ' + p.brand + ' ' + p.type + ' ' + p.charge + ' ' + (p.subtitle || '')).toLowerCase().indexOf(qq) >= 0; });
  }

  // ============================ VIEW-MODEL ==================================
  App.derive = function () {
    var s = this.state;
    var screen = s.screen;
    var detail = screen === 'products' && s.productId;
    var allProducts = this.allProducts();
    var allPumps = this.allPumps();

    var product = allProducts.find(function (p) { return p.id === s.productId; }) || {};

    var pq = s.productQuery.trim().toLowerCase();
    var pf = s.productFilter;
    var typeFilters = ['Flocculant', 'Coagulant'];
    var productRows = allProducts.filter(function (p) {
      var matchQ = !pq || (p.name + ' ' + p.brand + ' ' + p.type + ' ' + p.charge + ' ' + (p.subtitle || '')).toLowerCase().indexOf(pq) >= 0;
      var matchF = true;
      if (pf !== 'all') matchF = typeFilters.indexOf(pf) >= 0 ? p.type === pf : String(p.charge).toLowerCase().indexOf(pf.toLowerCase()) === 0;
      return matchQ && matchF;
    });

    var jarProduct = allProducts.find(function (p) { return p.id === s.jarProductId; }) || {};
    var jarProductChosen = !!s.jarProductId;
    var self = this;
    var stockOptions = ['0.05', '0.1', '0.25', '0.5'].map(function (val) {
      return {
        v: val, label: val + '%',
        style: css({
          border: '1px solid ' + (s.stockPct === val ? '#087568' : '#D8D2C4'),
          background: s.stockPct === val ? '#087568' : '#FBF9F4',
          color: s.stockPct === val ? '#FFF' : '#4B564F',
          cursor: 'pointer', borderRadius: '10px', padding: '9px 15px',
          fontSize: '14px', fontWeight: 700, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
        })
      };
    });
    var jarStockSteps = [];
    if (jarProductChosen && isFinite(this.jarStockStrength())) {
      var sp = this.jarStockStrength();
      var gPerL = isFinite(sp) ? this.fmt(sp * 10, 2) : '—';
      var powder = /^powder\b/i.test(jarProduct.form || '');
      jarStockSteps.push('Example only: Weigh ' + gPerL + ' g of ' + jarProduct.name + ' then top up to 1 L final volume of stock (' + gPerL + ' g/L = ' + gPerL + ' mg/mL).');
      // Chemical-specific mixing, dilution compatibility and maturation are not
      // established by a w/v arithmetic recipe. Never generalise polymer advice.
      jarStockSteps.push('Follow the supplier instructions and SDS for this specific chemical, including dilution compatibility, mixing order, maturation (if applicable) and PPE. No universal polymer procedure is assumed.');
      jarStockSteps.push('1 mL of this stock added to a ' + (s.jarVol || '?') + ' mL jar ≈ ' + (this.jarPreparationConfirmed() ? this.fmt(this.jarPpm('1'), 2) : '— (actual preparation unconfirmed)') + ' mg/L dose.');
    }

    var preparationConfirmed = this.jarPreparationConfirmed();
    var jarRows = s.jars.map(function (j, i) {
      var ppm = preparationConfirmed ? self.jarPpm(j.dose) : NaN;
      var win = s.winner === i;
      return {
        i: i, n: i + 1, dose: j.dose, ph: j.ph, turb: j.turb, floc: j.floc,
        ppm: isFinite(ppm) ? self.fmt(ppm, 2) : '—', finalPpm: preparationConfirmed ? self.fmt(self.jarFinalPpm(j.dose), 2) : '—',
        cardBg: win ? '#ECF7F3' : '#FFF',
        cardBorder: win ? '#087568' : '#E2DDD0',
        markColor: win ? '#087568' : '#B4BBB4',
        markFill: win ? 5 : 0
      };
    });
    var winnerJar = (s.winner !== null && s.jars[s.winner]) ? s.jars[s.winner] : null;
    var winnerPpmNum = winnerJar && preparationConfirmed ? this.jarPpm(winnerJar.dose) : NaN;

    var q = s.pumpQuery.trim().toLowerCase();
    var pumpRows = allPumps.filter(function (p) { return !q || (p.model + ' ' + p.brand + ' ' + p.type).toLowerCase().indexOf(q) >= 0; })
      .map(function (p) { var o = Object.assign({}, p); o.mine = App.PUMPS.indexOf(p) < 0 && !p.ai; o.removable = !!(p.ai || o.mine); return o; });

    var clients = s.clients.map(function (c) {
      var fu = App.flowLabel(c.flowUnit);
      var su = App.flowLabel(c.sludgeFlowUnit);
      var nTests = s.jarTests.filter(function (x) { return x.clientId === c.id; }).length;
      var hasCalc = !!c.mode;
      // preview strings render only on the clients screen — skip the string
      // assembly on every other screen's re-render
      var rdAll = Array.isArray(c.readings) ? c.readings.filter(function (r) { return r && typeof r === 'object'; }) : [];
      var readings = screen !== 'clients' ? [] : rdAll.map(function (r) {
        // one malformed stored entry must not brick derive()
        var vals = Array.isArray(r.values) ? r.values.filter(function (x) { return x && typeof x === 'object'; }) : [];
        var progTxt = '';
        if (r.prog) {
          progTxt = 'Dosing: ' + (r.prog.product || 'current product') + (r.prog.dose ? (' ' + r.prog.dose + ' ' + r.prog.unit) : '') + (r.prog.flow ? (' @ ' + r.prog.flow + ' ' + r.prog.flowUnit) : '');
          if (vals.length) progTxt += ' · ';
        }
        var historyTime = App.historicalObservation(r);
        var legacyDate = typeof r.date === 'string' ? r.date : '';
        var observed = historyTime.observedAt ? historyTime.observedAt.replace('T', ' ') : ((historyTime.invalid ? 'Observation metadata unvalidated' : (historyTime.observedDate || (legacyDate ? 'Legacy recorded date: ' + legacyDate : 'Observation date unknown'))) + ' · observation time / timezone unknown');
        return observed + (typeof r.savedAt === 'string' && r.savedAt ? ' · saved ' + r.savedAt : '') + ' · ' + r.app + ' — ' + progTxt + vals.map(function (x) { return x.label + ' ' + x.v + (x.u ? ' ' + x.u : ''); }).join(', ');
      });
      return {
        id: c.id, name: c.name, site: c.site || 'No site noted',
        summary: hasCalc ? ((c.productName || 'Generic') + ' · ' + (c.mode === 'sludge' ? (c.doseKg + ' kg/tDS') : (c.dose + ' mg/L'))) : 'Site readings on file — no calc saved yet',
        hasCalc: hasCalc,
        chip1: (c.mode === 'sludge' ? (c.sludgeFlow + ' ' + su + ' sludge') : (c.flow + ' ' + fu)),
        chip2: (c.mode === 'sludge' ? (c.doseKg + ' kg/t DS') : (c.dose + ' mg/L')),
        chip3: (c.productName || 'Generic product'),
        readings: readings,
        readingRecords: rdAll,
        nReadings: rdAll.length,
        hasTests: nTests > 0,
        testLabel: nTests + ' saved jar test' + (nTests === 1 ? '' : 's')
      };
    });

    var stockPctN = this.jarStockStrength();
    var stockPrep = isFinite(stockPctN) && stockPctN > 0 && stockPctN <= 100
      ? 'Example w/v mass only (not supplier preparation instructions): ' + this.fmt(stockPctN * 10, 2) + ' g of as-supplied product, then top up to 1 L final volume (' + this.fmt(stockPctN * 10, 2) + ' g/L = ' + this.fmt(stockPctN * 10, 2) + ' mg/mL). Then 1 mL added to a ' + (s.jarVol || '?') + ' mL jar ≈ ' + (this.jarPreparationConfirmed() ? this.fmt(this.jarPpm('1'), 2) : '— (actual preparation unconfirmed)') + ' mg/L.'
      : 'Enter a stock strength to see the make-up quantity.';

    var cpFu = App.flowLabel(s.flowUnit);
    var cpSu = App.flowLabel(s.sludgeFlowUnit);
    var calc = this.computeCalc();
    var cpPu = this.pumpUnitOf(s.pumpMaxUnit) ? s.pumpMaxUnit : 'Lh', cpPuLabel = this.pumpFlowLabel(cpPu);
    var calMl = this.parseNum(s.calMl), calSec = this.parseNum(s.calSec);
    var calActual = (calMl > 0 && calSec > 0) ? this.finiteResult(calMl * 3.6 / calSec, true) : NaN;
    var calTarget = calc.solLhNum;
    var calDev = NaN, calFactor = NaN;
    if (isFinite(calActual) && calTarget > 0 && calActual > 0) {
      calDev = this.finiteResult((calActual - calTarget) / calTarget * 100);
      calFactor = this.finiteResult(calTarget / calActual, true);
      // Both the dimensionless correction and its percentage must be
      // representable; an unavailable deviation cannot authorize advice.
      if (!isFinite(calDev) || !isFinite(this.finiteResult(calFactor * 100, true))) calFactor = NaN;
    }
    var calInTol = isFinite(calDev) && Math.abs(calDev) <= 5;
    var cal = {
      // Shown in the selected pump unit; the arithmetic above is canonical L/h (catch L/h = 3.6 x mL/s).
      actual: isFinite(calActual) ? this.pumpFlowText(calActual, cpPu, 3) + ' ' + cpPuLabel : '—',
      target: isFinite(calTarget) ? this.pumpFlowText(calTarget, cpPu, 3) + ' ' + cpPuLabel : '—',
      equivalent: (cpPu !== 'Lh' && isFinite(calActual)) ? 'Measured ' + this.fmt(calActual, 3) + ' L/h' + (isFinite(calTarget) ? ' · target ' + this.fmt(calTarget, 3) + ' L/h' : '') + ' (L/h equivalent)' : '',
      dev: isFinite(calDev) ? (calDev >= 0 ? '+' : '') + this.fmt(calDev, 1) + '%' : '—',
      devColor: !isFinite(calDev) ? '#9FB0AA' : (calInTol ? '#4FE0B5' : (Math.abs(calDev) <= 15 ? '#E8C15A' : '#FF8A6B')),
      advice: !isFinite(calFactor) ? 'Enter the target dose above and a field measurement to check the pump.'
        : (calInTol ? 'Within ±5% — pump is delivering the target. No change needed.'
          : (calActual > calTarget ? 'Pump is over-delivering. Reduce stroke rate/length to about ' + this.fmt(calFactor * 100, 0) + '% of the current setting.'
            : 'Pump is under-delivering. Increase stroke rate/length to about ' + this.fmt(calFactor * 100, 0) + '% of the current setting.')),
      showAdvice: isFinite(calFactor)
    };

    var calcPumpObj = allPumps.find(function (x) { return x.id === s.selectedCalcPumpId; });
    var calcPumpInfo = '';
    if (calcPumpObj) {
      var pv = this.pumpCapacityOf(calcPumpObj);
      calcPumpInfo = (!isFinite(pv) ? 'Operating capacity not confirmed — no stroke advice. Verify the exact model, frequency and back-pressure, then enter a confirmed manual capacity. ' : '') + calcPumpObj.model + ' — rated ' + calcPumpObj.maxFlow + (calcPumpObj.maxPress ? ' · ' + calcPumpObj.maxPress : '') + '. Using ' + (isFinite(pv) ? this.pumpFlowText(pv, cpPu, 2) + ' ' + cpPuLabel + (cpPu !== 'Lh' ? ' (' + this.fmt(pv, 2) + ' L/h)' : '') : '? ' + cpPuLabel) + ' as max capacity.';
    }

    var clientPreview = 'Will store: ' + (s.calcMode === 'sludge'
      ? (s.sludgeFlow + ' ' + cpSu + ' sludge · ' + s.doseKg + ' kg/t DS')
      : (s.flow + ' ' + cpFu + ' · ' + (s.dose || '—') + ' mg/L'))
      + ' · ' + ((allProducts.find(function (p) { return p.id === s.calcProductId; }) || {}).name || 'generic product') + '.';

    var productFilters = [
      { v: 'all', label: 'All' },
      { v: 'Flocculant', label: 'Flocculants' },
      { v: 'Coagulant', label: 'Coagulants' },
      { v: 'Cationic', label: 'Cationic' },
      { v: 'Anionic', label: 'Anionic' }
    ].map(function (f) {
      f.style = css({
        flexShrink: 0, border: '1px solid ' + (s.productFilter === f.v ? '#087568' : '#D8D2C4'),
        background: s.productFilter === f.v ? '#087568' : '#FFF',
        color: s.productFilter === f.v ? '#FFF' : '#4B564F',
        cursor: 'pointer', borderRadius: '999px', padding: '7px 13px', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap'
      });
      return f;
    });

    return {
      screen: screen, detail: detail,
      isHome: screen === 'home', isProducts: screen === 'products' && !s.productId, isProductDetail: detail,
      isCalc: screen === 'calc', isCalculator: screen === 'calculator', isJars: screen === 'jars', isPumps: screen === 'pumps', isClients: screen === 'clients',
      isGuide: screen === 'guide' && !s.guideId, isGuideDetail: screen === 'guide' && !!s.guideId,
      guide: (window.PLAYBOOKS && window.PLAYBOOKS.list.find(function (g) { return g.id === s.guideId; })) || null,
      allProducts: allProducts, allPumps: allPumps,
      product: product, productRows: productRows, noProductMatch: productRows.length === 0,
      productFilters: productFilters,
      clients: clients, hasClients: clients.length > 0, noClients: clients.length === 0,
      jarProduct: jarProduct, jarProductChosen: jarProductChosen, stockOptions: stockOptions, jarStockSteps: jarStockSteps,
      jarRows: jarRows, stockPrep: stockPrep,
      hasWinner: winnerJar !== null && isFinite(winnerPpmNum),
      winnerN: winnerJar ? (s.winner + 1) : '', winnerPpm: this.fmt(winnerPpmNum, 2),
      pumpRows: pumpRows,
      noPumpMatch: pumpRows.length === 0 && s.pumpQuery.trim().length > 0 && !s.pumpLoading,
      pc: screen === 'calculator' && s.ccMode !== 'water' ? this.computePoly() : null,
      wt: screen === 'calculator' && s.ccMode === 'water' ? this.computeWater() : null,
      calc: calc, cal: cal, doseWin: screen === 'calc' ? this.doseWindow() : null,
      calcPumpChosen: !!s.selectedCalcPumpId, calcPumpInfo: calcPumpInfo,
      productPickerOpen: s.productPickerOpen, productPickerQuery: s.productPickerQuery,
      selectedProductLabel: (allProducts.find(function (p) { return p.id === s.calcProductId; }) || {}).name || '— none / generic —',
      filteredProducts: s.productPickerOpen ? filterProducts(allProducts, s.productPickerQuery) : [],
      calcPumpPickerOpen: s.calcPumpPickerOpen, calcPumpPickerQuery: s.calcPumpPickerQuery,
      selectedCalcPumpLabel: (function () { var pp = allPumps.find(function (x) { return x.id === s.selectedCalcPumpId; }); return pp ? (pp.model + ' — ' + pp.maxFlow) : '— select a pump —'; })(),
      filteredCalcPumps: (function () { if (!s.calcPumpPickerOpen) return []; var qq = (s.calcPumpPickerQuery || '').trim().toLowerCase(); return allPumps.filter(function (p) { return !qq || (p.model + ' ' + p.brand + ' ' + p.type).toLowerCase().indexOf(qq) >= 0; }); })(),
      guideProgPickerOpen: s.guideProgPickerOpen, guideProgPickerQuery: s.guideProgPickerQuery,
      selectedGuideProgLabel: (allProducts.find(function (p) { return p.id === s.guideProgProductId; }) || {}).name || '— select their product —',
      filteredGuideProgProducts: s.guideProgPickerOpen ? filterProducts(allProducts, s.guideProgPickerQuery) : [],
      jarProductPickerOpen: s.jarProductPickerOpen, jarProductPickerQuery: s.jarProductPickerQuery,
      selectedJarProductLabel: (allProducts.find(function (p) { return p.id === s.jarProductId; }) || {}).name || '— select a product —',
      filteredJarProducts: s.jarProductPickerOpen ? filterProducts(allProducts, s.jarProductPickerQuery) : [],
      showFlowConv: s.flowUnit !== 'm3h' && isFinite(this.parseNum(s.flow)),
      flowConverted: this.fmt(this.parseNum(s.flow) * this.flowFactor(s.flowUnit), 3),
      showSludgeConv: s.sludgeFlowUnit !== 'm3h' && isFinite(this.parseNum(s.sludgeFlow)),
      sludgeConverted: this.fmt(this.parseNum(s.sludgeFlow) * this.flowFactor(s.sludgeFlowUnit), 3),
      clientPreview: clientPreview,
      jarTestRows: s.jarTests.filter(function (t) { return !s.jarHistoryClientId || t.clientId === s.jarHistoryClientId; }).map(function (t) {
        return {
          id: typeof t.id === 'string' ? t.id : '', date: t.date, who: t.clientName ? t.clientName : 'No client', product: t.productName,
          winner: (t.winnerN !== null && t.winnerN !== undefined && t.winnerN !== '' ? ('Jar ' + t.winnerN + ' · ') : '') + rawHistorical(t.doseConvention === 'final-concentration-only-v1' ? t.winnerFinalMgL : t.winnerPpm) + ' mg/L' + (t.doseConvention === 'nominal-raw-sample-v1' ? ' nominal raw-sample dose' : (t.doseConvention === 'final-concentration-only-v1' ? ' final concentration (no raw-dose handoff)' : ' (historical convention; not reinterpreted)')),
          setup: rawHistorical(t.jarVol) + ' mL jar · ' + rawHistorical(t.stockPct) + '% stock', note: t.note || ''
        };
      }),
      hasJarTests: s.jarTests.length > 0,
      // seg / nav styles
      modeConcStyle: css(this.segStyle(s.calcMode === 'conc')),
      modeSludgeStyle: css(this.segStyle(s.calcMode === 'sludge')),
      formLiquidStyle: css(this.segSmall(s.form === 'liquid')),
      formPowderStyle: css(this.segSmall(s.form === 'powder')),
      pumpSelectStyle: css(this.segSmall(s.pumpSource === 'select')),
      pumpManualStyle: css(this.segSmall(s.pumpSource === 'manual')),
      navHomeStyle: css(this.navStyle(screen === 'home')),
      navProductsStyle: css(this.navStyle(screen === 'products')),
      navCalcStyle: css(this.navStyle(screen === 'calc')),
      navCalculatorStyle: css(this.navStyle(screen === 'calculator')),
      navJarsStyle: css(this.navStyle(screen === 'jars')),
      navPumpsStyle: css(this.navStyle(screen === 'pumps')),
      navGuideStyle: css(this.navStyle(screen === 'guide'))
    };
  };

  // One banner for every dose-vs-datasheet-window verdict (calc + guide) — the
  // wording, colours and the datasheet-basis footer can never drift apart.
  // `w` is a doseWindowFor result, or {mismatch:true, name, rawUnit, note}.
  // opts: key (disclosure name prefix), value (entered dose already formatted with
  // its unit, or ''), entry (the abstention comes from an incomplete programme
  // entry, not the product), entryReasonVisible (keep that reason on screen).
  // An abstention is a calm 1-2 line helper note — no range and no recommendation
  // are shown; the full original reason is one tap away behind "Why?".
  function doseWindowBanner(w, subject, opts) {
    if (!w) return '';
    opts = opts || {};
    if (w.abstain) {
      var name = esc(w.name || 'this product'), dose = opts.value ? esc(opts.value) : 'the dose', headline;
      if (opts.entry) headline = opts.entryReasonVisible ? esc(w.reason) + ' Not compared with a source range; not dosing advice.' : 'Not compared with a source range until the programme dose, unit and as-supplied basis are confirmed. Not dosing advice.';
      else if (!w.raw || /^[\s\u2014\u2013-]*$/.test(String(w.raw))) headline = 'No supplier dose range on file for ' + name + ', so ' + dose + ' isn\u2019t compared. Not dosing advice.';
      else headline = 'The recorded dose range for ' + name + ' can\u2019t be compared with ' + dose + '. Not dosing advice.';
      return '<div data-dose-notice style="margin-top:10px;"><div role="note" class="fa-help" data-dose-notice-text>' + headline + '</div>' +
        noticeDisclosure((opts.key || 'dose') + '-why', 'Why?', '<b>Window not checked — no dosing recommendation.</b> ' + esc(w.reason) + ' Recorded range: ' + esc(w.raw) + '; unit: ' + esc(w.rawUnit) + '. ' + esc(w.note)) + '</div>';
    }
    var label = { 'supplier-tds': 'supplier operational range', 'published-reference': 'published reference window', 'site-test': 'site-validated test range' }[w.sourceKind] || 'unknown source window';
    var noteLine = w.note ? '<div class="fa-help" style="margin-top:6px;">Source window basis: ' + esc(w.note) + '</div>' : '';
    if (w.mismatch) {
      return '<div role="note" data-dose-window style="margin-top:10px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:10px;padding:9px 12px;">' +
        subject + ' doesn’t match <b>' + esc(w.name) + '</b>’s source window basis (' + esc(w.rawUnit || '') + ') — no window comparison shown.' + noteLine + '</div>';
    }
    var ok = w.status === 'within';
    var msg = 'is <b>' + esc(w.status) + '</b> this ' + label + '. This is a reference comparison, not a proven optimum, safe dose or instruction to change dosing. Confirm by jar and plant testing.';
    var shown = App.fmt(w.val, 2) + ' ' + w.unit + (w.converted ? ' equivalent' : '');
    return '<div role="note" data-dose-window style="margin-top:10px;background:' + (ok ? '#ECF7F3' : '#FBF6EC') + ';border:1px solid ' + (ok ? '#B8E0D3' : '#EBD9BC') + ';border-radius:12px;padding:11px 13px;">' +
      '<b>' + esc(w.name) + '</b> — ' + label + ' <b style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;">' + w.lo + '–' + w.hi + ' ' + w.unit + '</b>. ' + subject + ' (' + esc(shown) + ') ' + msg + noteLine + '</div>';
  }

  // shared field/icon fragments
  var CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
  var DOWNARROW = "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 fill=%22none%22 stroke=%22%2394A099%22 stroke-width=%222%22><path d=%22M2 3l3 3 3-3%22/></svg>')";

  // ---- searchable combobox (tap → type to filter → pick) -------------------
  function comboHtml(o) {
    var chev = '<svg width="12" height="12" viewBox="0 0 10 10" style="flex-shrink:0;margin-left:8px;transition:transform .15s;transform:rotate(' + (o.open ? '180deg' : '0deg') + ');" fill="none" stroke="#526159" stroke-width="2"><path d="M2 3l3 3 3-3"/></svg>';
    var dialogLabel = 'Choose ' + (o.name === 'pump' ? 'pump' : 'product');
    var dialogAttrs = ' role="dialog" aria-modal="true" aria-label="' + dialogLabel + '"';
    var trigger = '<button data-act="' + o.toggleAct + '" class="fa-combo-trigger" aria-haspopup="dialog" aria-expanded="' + (o.open ? 'true' : 'false') + '" style="width:100%;background:#FFF;border:1px solid ' + (o.open ? '#087568' : '#D8D2C4') + ';border-radius:12px;padding:10px 12px;font-size:16px;font-weight:600;color:' + (o.hasSelection ? '#16211F' : '#56635B') + ';cursor:pointer;display:flex;align-items:center;justify-content:space-between;text-align:left;">' +
      '<span style="font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(o.selectedLabel) + '</span>' + chev + '</button>';
    if (!o.open) return '<div data-combo="' + o.name + '">' + trigger + '</div>';

    // 16px font on the input stops iOS zooming in on focus.
    var searchInner =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#526159" stroke-width="2" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<input data-set="' + o.setKey + '" data-key="' + o.setKey + '" value="' + esc(o.query) + '" placeholder="' + esc(o.searchPlaceholder) + '" style="width:100%;background:#FBF9F4;border:1px solid #E2DDD0;border-radius:9px;padding:10px 9px 10px 32px;font-size:16px;font-weight:400;">';
    var searchBox = '<div style="padding:8px;border-bottom:1px solid #EFEBE2;flex-shrink:0;"><div style="position:relative;">' + searchInner + '</div></div>';

    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      // Mobile: fixed top sheet + dimmed backdrop, so the search box and list stay
      // pinned to the top of the screen above the keyboard. sizeMobileSheet() trims
      // it to the visible viewport once the keyboard is up.
      // The dim backdrop is a real (hidden-from-AT) button: iOS Safari does not synthesise click events for
      // plain divs, which made an outside tap unable to close the sheet. touch-action:none stops it panning the page.
      var backdrop = '<button type="button" tabindex="-1" aria-hidden="true" data-act="closePickers" style="position:fixed;inset:0;z-index:999;width:100%;height:100%;margin:0;padding:0;border:0;border-radius:0;background:rgba(20,25,23,0.35);cursor:pointer;touch-action:none;-webkit-appearance:none;appearance:none;"></button>';
      var closeLabel = 'Close ' + (o.name === 'pump' ? 'pump' : 'product') + ' list';
      var closeBtn = '<button type="button" data-act="closePickers" data-combo-close="' + o.name + '" aria-label="' + closeLabel + '" style="flex:0 0 44px;width:44px;min-width:44px;height:44px;min-height:44px;margin:0;padding:0;border:1px solid #D8D2C4;border-radius:12px;background:#FBF9F4;color:#16211F;cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
      var header = '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #EFEBE2;flex-shrink:0;"><div style="flex:1;min-width:0;position:relative;">' + searchInner + '</div>' + closeBtn + '</div>';
      var sheet = '<div data-combo-sheet="' + o.name + '"' + dialogAttrs + ' style="position:fixed;top:calc(env(safe-area-inset-top, 0px) + 8px);left:8px;right:8px;z-index:1000;display:flex;flex-direction:column;max-height:min(72dvh, calc(100dvh - 96px));background:#FFF;border:1px solid #D8D2C4;border-radius:14px;overflow:hidden;overscroll-behavior:contain;box-shadow:0 18px 44px rgba(0,0,0,0.30);">' +
        header +
        '<div data-combo-list="' + o.name + '" style="flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;">' + comboRowsHtml(o) + '</div></div>';
      return '<div data-combo="' + o.name + '">' + trigger + backdrop + sheet + '</div>';
    }

    // Desktop: absolute overlay floating below the trigger (zero page shift).
    var panel = '<div data-combo-panel="' + o.name + '"' + dialogAttrs + ' style="position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:50;display:flex;flex-direction:column;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,0.18);">' +
      searchBox +
      '<div data-combo-list="' + o.name + '" style="height:240px;overflow-y:auto;-webkit-overflow-scrolling:touch;">' + comboRowsHtml(o) + '</div></div>';
    return '<div data-combo="' + o.name + '" style="position:relative;">' + trigger + panel + '</div>';
  }
  // Just the option rows — rebuilt on its own as the user types (no full re-render).
  function comboRowsHtml(o) {
    var rows = '';
    if (o.includeNone) rows += '<button data-act="' + o.pickAct + '" data-id="" class="fa-row" style="width:100%;text-align:left;background:#FFF;border:none;border-bottom:1px solid #F0EDE4;padding:11px 12px;cursor:pointer;font-size:16px;font-weight:600;color:#56635B;">' + esc(o.noneLabel) + '</button>';
    if (o.items.length) {
      rows += o.items.map(function (it) {
        var badge = it.tag ? '<span style="width:38px;height:26px;flex-shrink:0;border-radius:7px;background:' + esc(it.tint || '#EEE') + ';color:' + esc(it.tintText === '#B05A28' ? '#8A451D' : (it.tintText || '#333')) + ';font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">' + esc(it.tag) + '</span>' : '';
        return '<button data-act="' + o.pickAct + '" data-id="' + esc(it.id) + '" class="fa-row" style="width:100%;text-align:left;background:' + (it.selected ? '#ECF7F3' : '#FFF') + ';border:none;border-bottom:1px solid #F0EDE4;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;">' + badge +
          '<span style="min-width:0;flex:1;"><span style="display:block;font-size:16px;font-weight:600;color:#16211F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(it.label) + '</span>' +
          (it.sub ? '<span style="display:block;font-size:12px;font-weight:400;color:#56635B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(it.sub) + '</span>' : '') + '</span></button>';
      }).join('');
    } else {
      rows += '<div style="padding:16px 12px;font-size:14px;color:#526159;text-align:center;">No match for “' + esc(o.query) + '”.</div>';
    }
    return rows;
  }

  // ============================ SCREENS =====================================
  App.screens = {};

  App.screens.home = function (v) {
    var s = App.state;
    var clientsHtml = '';
    if (v.hasClients) {
      clientsHtml = '<div style="margin-top:10px;display:flex;flex-direction:column;gap:9px;">' +
        v.clients.map(function (c) {
          return '<button data-act="loadClient" data-id="' + esc(c.id) + '" style="text-align:left;cursor:pointer;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:13px 15px;display:flex;justify-content:space-between;align-items:center;">' +
            '<div><div style="font-size:16px;font-weight:700;">' + esc(c.name) + '</div>' +
            '<div style="font-size:12px;color:#56635B;margin-top:1px;">' + esc(c.summary) + '</div></div>' + CHEV + '</button>';
        }).join('') + '</div>';
    } else {
      clientsHtml = '<div style="margin-top:10px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:14px;padding:16px;font-size:14px;color:#56635B;">No clients saved yet. Set up a calculation, then tap <b style="color:#16211F">Save as client</b> in the Dosing Calc to recall its flow, product and dose next visit.</div>';
    }
    function card(act, bg, color, accentSvg, title, sub, subColor, extra) {
      return '<button data-act="' + act + '" style="text-align:left;border:' + (extra || 'none') + ';cursor:pointer;background:' + bg + ';color:' + color + ';border-radius:18px;padding:18px 16px;min-height:128px;display:flex;flex-direction:column;justify-content:space-between;">' +
        accentSvg + '<div><div style="font-size:16px;font-weight:700;">' + title + '</div><div style="font-size:12px;color:' + subColor + ';margin-top:2px;">' + sub + '</div></div></button>';
    }
    return '<div style="padding:22px 18px 30px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">' +
        '<div><div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">Field Assistant</div>' +
        '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin-top:2px;">Treatment Toolkit</div></div>' +
        '<button data-act="goClients" style="border:1px solid #D8D2C4;background:#FFF;border-radius:12px;padding:9px 12px;font-size:12px;font-weight:600;color:#16211F;cursor:pointer;display:flex;align-items:center;gap:6px;">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>Clients</button></div>' +
      '<div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        card('goProducts', '#16211F', '#EFECE3', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="1.8"><path d="M6 2v6l-4 8a3 3 0 0 0 3 4h10a3 3 0 0 0 3-4l-4-8V2"/><path d="M6 2h8M8 14h6"/></svg>', 'Product Library', 'Polymers, coagulants &amp; data', '#9FB0AA') +
        card('goCalc', '#087568', '#EAFBF5', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M8 18h3M15 14v4"/></svg>', 'Dosing Calc', 'Feed rate &amp; pump stroke', '#FFFFFF') +
        card('goJars', '#FFF', '#16211F', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="1.8"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/><path d="M6.5 13h11"/></svg>', 'Jar Testing', 'Find the optimum dose', '#56635B', '1px solid #E2DDD0') +
        card('goPumps', '#FFF', '#16211F', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>', 'Dosing Pumps', 'Specs &amp; feed capacity', '#56635B', '1px solid #E2DDD0') +
      '</div>' +
      '<button data-act="goGuide" style="margin-top:12px;width:100%;text-align:left;cursor:pointer;background:#FFF;border:1px solid #E2DDD0;border-radius:18px;padding:15px 16px;display:flex;align-items:center;gap:13px;">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="1.8" style="flex-shrink:0;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
        '<span style="flex:1;min-width:0;"><span style="display:flex;align-items:center;gap:7px;"><span style="font-size:16px;font-weight:700;color:#16211F;">Field Playbooks</span><span style="background:#ECF7F3;color:#087568;border-radius:6px;padding:2px 7px;font-size:12px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;letter-spacing:.04em;">NEW</span></span>' +
        '<span style="display:block;font-size:12px;color:#56635B;margin-top:1px;">Potable · sewage · sludge · industrial · mining</span></span>' + CHEV + '</button>' +
      '<div style="margin-top:24px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#56635B;">Saved clients</div>' +
        '<button data-act="goClients" style="border:none;background:none;color:#087568;font-size:12px;font-weight:600;cursor:pointer;">Manage</button></div>' +
      clientsHtml +
    '</div>';
  };

  App.screens.products = function (v) {
    var s = App.state;
    var filtersHtml = v.productFilters.map(function (f) {
      return '<button data-act="setProductFilter" data-v="' + esc(f.v) + '" style="' + f.style + '">' + esc(f.label) + '</button>';
    }).join('');
    var formHtml = s.showProductForm ? productFormHtml(s) : '';
    var rowsHtml = v.productRows.map(function (p) {
      return '<button data-act="openProduct" data-id="' + esc(p.id) + '" style="text-align:left;cursor:pointer;background:#FFF;border:1px solid #E2DDD0;border-radius:16px;padding:14px 15px;display:flex;gap:13px;align-items:center;">' +
        '<div style="width:44px;height:44px;flex-shrink:0;border-radius:12px;background:' + esc(p.tint) + ';display:flex;align-items:center;justify-content:center;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;font-size:12px;color:' + esc(p.tintText === '#B05A28' ? '#8A451D' : p.tintText) + ';">' + esc(p.tag) + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:16px;font-weight:700;">' + esc(p.name) + ' ' + vbadge(p) + '</div>' +
        '<div style="font-size:12px;color:#56635B;margin-top:1px;">' + esc(p.subtitle) + '</div></div>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B4BBB4" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>';
    }).join('');
    var noMatch = v.noProductMatch ? '<div style="margin-top:8px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:16px;font-size:14px;color:#56635B;text-align:center;">No product in your library matches “' + esc(s.productQuery) + '”. Adjust the search, or add it to your repository.</div>' : '';
    return '<div style="padding:22px 18px 30px;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">Library</div>' +
      '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 3px;">Products</div>' +
      '<div style="font-size:14px;color:#56635B;">Tap a product for its data sheet, typical dose window and make-up guidance. Badges show whether a value is from the supplier <b>TDS</b>, a <b>typical</b> range, or an editable <b>example</b>.</div>' +
      '<div style="position:relative;margin-top:14px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#526159" stroke-width="2" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
        '<input data-set="productQuery" data-key="productQuery" value="' + esc(s.productQuery) + '" placeholder="Search name, type or charge…" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 13px 13px 40px;font-size:14px;font-weight:400;"></div>' +
      '<div style="margin-top:10px;display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;">' + filtersHtml + '</div>' +
      '<button data-act="startAddProduct" style="margin-top:12px;width:100%;border:1px dashed #C6BFAF;background:#FBF9F4;cursor:pointer;border-radius:12px;padding:12px;font-size:14px;font-weight:700;color:#4B564F;display:flex;align-items:center;justify-content:center;gap:7px;">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Add your own product</button>' +
      formHtml +
      '<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">' + rowsHtml + '</div>' + noMatch +
    '</div>';
  };

  function fld(dataf, val, ph, extra) {
    return '<input data-actinput="onNpField" data-f="' + dataf + '" data-key="np-' + dataf + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '" style="' + (extra || 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;') + '">';
  }
  function productFormHtml(s) {
    var np = s.np;
    return '<div class="fa-dark-form" style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A6BEB3;font-weight:700;margin-bottom:12px;">New product</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;">' +
        (s.productSaveError ? '<div role="alert" class="fa-note fa-note-error">' + esc(s.productSaveError) + '</div>' : '') +
        fld('name', np.name, 'Product name (required)', 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;font-weight:600;color:#FFF;') +
        fld('brand', np.brand, 'Brand / supplier') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
          '<select data-actchange="onNpField" data-f="type" data-key="np-type" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#FFF;appearance:none;">' + optionTags([{ v: 'Flocculant' }, { v: 'Coagulant' }, { v: 'Other' }], np.type, 'v', 'v') + '</select>' +
          '<select data-actchange="onNpField" data-f="form" data-key="np-form" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#FFF;appearance:none;">' + optionTags([{ v: 'Powder' }, { v: 'Liquid' }, { v: 'Emulsion' }], np.form, 'v', 'v') + '</select>' +
        '</div>' +
        fld('charge', np.charge, 'Charge (e.g. Cationic high)') +
        '<label>Reference application <select data-actchange="onNpField" data-f="doseApplication" data-key="np-doseApplication">' + optionTags([{v:'unknown',label:'Unknown — no comparison'},{v:'potable',label:'Potable water'},{v:'sewage',label:'Sewage water treatment'},{v:'sludge',label:'Sludge treatment'},{v:'industrial',label:'Industrial water treatment'},{v:'mining',label:'Mining water treatment'}], np.doseApplication || 'unknown', 'v', 'label') + '</select></label>' +
        '<label>Reference source kind <select data-actchange="onNpField" data-f="doseWindowSourceKind" data-key="np-doseWindowSourceKind">' + optionTags([{v:'unknown',label:'Unknown — no comparison'},{v:'site-test',label:'Site test reference'},{v:'published-reference',label:'Published reference'},{v:'supplier-tds',label:'Supplier operational range'}], np.doseWindowSourceKind || 'unknown', 'v', 'label') + '</select></label>' +
        '<div class="fa-help">These are your explicit source-window declarations, not supplier, grade or site approval. Application notes are not used to infer chemical provenance.</div>' +
        '<label>Range chemical basis <select data-actchange="onNpField" data-f="doseMassBasis" data-key="np-doseMassBasis">' + optionTags([{v:'unknown',label:'Unknown / active / reference formulation — no comparison'},{v:'as-supplied',label:'I confirm this range is mass of as-supplied product'}], np.doseMassBasis || 'unknown', 'v', 'label') + '</select></label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
          fld('doseRange', np.doseRange, 'Dose range e.g. 1 – 10', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;') +
          '<select data-actchange="onNpField" data-f="doseUnit" data-key="np-doseUnit" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:12px;color:#FFF;appearance:none;">' + optionTags([{ v: 'mg/L on flow' }, { v: 'kg / t dry solids' }, { v: 'g / t dry solids' }], np.doseUnit, 'v', 'v') + '</select>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
          fld('density', np.density, 'Density kg/L', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;') +
          fld('makedown', np.makedown, 'Make-down %', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;') +
        '</div>' +
        fld('ageing', np.ageing, 'Ageing / maturation time') +
        '<textarea data-actinput="onNpField" data-f="application" data-key="np-application" placeholder="Application notes" rows="2" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;resize:vertical;">' + esc(np.application) + '</textarea>' +
        '<textarea data-actinput="onNpField" data-f="makeup" data-key="np-makeup" placeholder="Make-up / mixing guidance" rows="2" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;resize:vertical;">' + esc(np.makeup) + '</textarea>' +
      '</div>' +
      '<div style="display:flex;gap:9px;margin-top:12px;">' +
        '<button data-act="cancelAddProduct" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button>' +
        '<button data-act="confirmAddProduct" style="flex:2;border:none;cursor:pointer;background:#087568;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save product</button>' +
      '</div></div>';
  }

  App.screens.productDetail = function (v) {
    var p = v.product;
    function statCard(label, val, mono) {
      return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:12px;padding:11px 13px;">' +
        '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#526159;font-weight:700;">' + label + '</div>' +
        '<div style="font-size:14px;font-weight:700;margin-top:2px;' + (mono ? "font-family:ui-monospace, SFMono-Regular, Consolas, monospace;" : '') + '">' + esc(val) + '</div></div>';
    }
    var deleteBtn = p.custom ? '<button data-act="deleteProduct" data-id="' + esc(p.id) + '" style="margin-top:10px;width:100%;border:1px solid #E4C9C1;cursor:pointer;background:#FFF;color:#B8432B;border-radius:14px;padding:13px;font-size:14px;font-weight:700;">Delete this custom product</button>' : '';
    var srcLine = p.source ? '<div style="margin-top:14px;font-size:12px;color:#526159;overflow-wrap:break-word;word-wrap:break-word;">Source: ' + esc(p.source) + '</div>' : '';
    return '<div style="padding:18px 18px 30px;">' +
      '<button data-act="backToProducts" style="border:none;background:none;cursor:pointer;color:#087568;font-size:14px;font-weight:600;display:flex;align-items:center;gap:5px;margin-bottom:14px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg> Library</button>' +
      '<div style="display:flex;gap:14px;align-items:center;">' +
        '<div style="width:56px;height:56px;flex-shrink:0;border-radius:15px;background:' + esc(p.tint) + ';display:flex;align-items:center;justify-content:center;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;font-size:14px;color:' + esc(p.tintText === '#B05A28' ? '#8A451D' : p.tintText) + ';">' + esc(p.tag) + '</div>' +
        '<div><div style="font-size:20px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;">' + esc(p.name) + ' ' + vbadge(p) + '</div><div style="font-size:14px;color:#56635B;">' + esc(p.brand) + '</div></div></div>' +
      '<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
        statCard('Function', p.type) + statCard('Charge', p.charge) + statCard('Physical form', p.form) + statCard('Bulk density', p.densityText, true) +
      '</div>' +
      '<div style="margin-top:14px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
        '<div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Source-specific dose reference (not an optimum)</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;"><div style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:24px;line-height:1.25;font-weight:600;color:#4FE0B5;letter-spacing:-0.01em;">' + esc(p.doseRange) + '</div><div style="font-size:14px;color:#9FB0AA;">' + esc(p.doseUnit || 'Source dose basis not stated') + '</div></div>' +
        '<div style="font-size:12px;color:#9FB0AA;margin-top:6px;">' + esc(p.doseNote) + '</div></div>' +
      '<div style="margin-top:14px;"><div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#56635B;margin-bottom:7px;">Application</div>' +
        '<div style="font-size:14px;color:#333E39;">' + esc(p.application) + '</div></div>' +
      '<div style="margin-top:16px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:14px;padding:14px 15px;">' +
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B27A24" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' +
        '<div style="font-size:12px;font-weight:700;color:#8A5E17;letter-spacing:0.04em;text-transform:uppercase;">Make-up guidance</div></div>' +
        '<div style="font-size:14px;color:#5C4A24;">' + esc(p.makeup) + '</div></div>' +
      '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
        statCard('Make-down strength', p.makedownText, true) + statCard('Ageing / maturation', p.ageing) +
      '</div>' + srcLine + sourceInfo(p, { key: 'product-source', sourceShown: !!p.source }) +
      '<button data-act="useProductInCalc" style="margin-top:18px;width:100%;border:none;cursor:pointer;background:#087568;color:#FFF;border-radius:14px;padding:15px;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M15 14v4"/></svg>Use in dosing calculator</button>' +
      deleteBtn +
    '</div>';
  };

  App.screens.calc = function (v) {
    var s = App.state;
    var productOpts = '<option value="">— none / generic —</option>' + v.allProducts.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === s.calcProductId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var flowUnitSel = function (setKey, cur) {
      return '<select data-set="' + setKey + '" data-key="' + setKey + '" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 30px 0 13px;font-size:14px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 11px center;">' + (!isFinite(App.flowFactor(cur)) ? '<option value="" selected>Confirm unit</option>' : '') + optionTags(App.FLOW_UNITS, cur, 'v', 'label') + '</select>';
    };
    var concInputs = v.isConcMode !== undefined ? '' : '';
    var isConc = s.calcMode === 'conc';
    var isSludge = s.calcMode === 'sludge';
    // The entered dose echoed in the plain window notice (display only; the app's formatter, its own unit).
    var enteredDoseNum = App.parseNum(isConc ? s.dose : s.doseKg);
    var enteredDoseText = isFinite(enteredDoseNum) && enteredDoseNum > 0 ? App.fmt(enteredDoseNum) + ' ' + (isConc ? 'mg/L' : 'kg/t DS') : '';
    var concBlock = isConc ? (
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' +
        '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;">Flow rate</div>' +
          '<div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FFF;overflow:hidden;">' +
            '<input inputmode="decimal" data-set="flow" data-key="flow" value="' + esc(s.flow) + '" placeholder="0" style="flex:1;min-width:0;border:none;background:transparent;padding:13px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;">' + flowUnitSel('flowUnit', s.flowUnit) + '</div>' +
          (v.showFlowConv ? '<div style="font-size:12px;color:#526159;margin-top:5px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;">= ' + esc(v.flowConverted) + ' m³/h used in calc</div>' : '') + '</div>' +
        '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;">Target dose</div>' +
          '<div style="position:relative;"><input inputmode="decimal" data-set="dose" data-key="dose" value="' + esc(s.dose) + '" placeholder="0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 52px 13px 13px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;">' +
          '<span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">mg/L</span></div></div>' +
      '</div>') : '';
    var sludgeBlock = isSludge ? (
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' +
        '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;">Sludge flow</div>' +
          '<div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FFF;overflow:hidden;">' +
            '<input inputmode="decimal" data-set="sludgeFlow" data-key="sludgeFlow" value="' + esc(s.sludgeFlow) + '" placeholder="0" style="flex:1;min-width:0;border:none;background:transparent;padding:13px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;">' + flowUnitSel('sludgeFlowUnit', s.sludgeFlowUnit) + '</div>' +
            (v.showSludgeConv ? '<div style="font-size:12px;color:#526159;margin-top:5px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;">= ' + esc(v.sludgeConverted) + ' m³/h used in calc</div>' : '') + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;">Dry solids</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="ds" data-key="ds" value="' + esc(s.ds) + '" placeholder="0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 44px 13px 13px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">% DS</span></div></div>' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;">Polymer dose</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="doseKg" data-key="doseKg" value="' + esc(s.doseKg) + '" placeholder="0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 60px 13px 13px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">kg/tDS</span></div></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;">Sludge density</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="sludgeDensity" data-key="sludgeDensity" value="' + esc(s.sludgeDensity) + '" placeholder="1.0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 44px 13px 13px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">t/m³</span></div></div>' +
          '<div style="display:flex;align-items:flex-end;"><div style="font-size:12px;color:#526159;padding-bottom:6px;">Raise above 1.0 for thickened / mineral sludge. Dry solids is % w/w on wet mass.</div></div>' +
        '</div></div>') : '';
    var liquidDensity = s.form === 'liquid' ? (
      '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Neat density</div>' +
        '<div style="position:relative;"><input inputmode="decimal" data-set="density" data-key="density" value="' + esc(s.density) + '" placeholder="1.0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 44px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">kg/L</span></div></div>') : '';
    var pumpUnitSel = '<select data-set="pumpMaxUnit" data-key="pumpMaxUnit" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 30px 0 13px;font-size:14px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 11px center;">' + (!App.pumpUnitOf(s.pumpMaxUnit) ? '<option value="" selected>Confirm unit</option>' : '') + optionTags(App.PUMP_FLOW_UNITS, s.pumpMaxUnit, 'v', 'label') + '</select>';
    var pumpBlock = s.pumpSource === 'select' ? (
      comboHtml({
        name: 'pump', open: v.calcPumpPickerOpen, query: v.calcPumpPickerQuery, setKey: 'calcPumpPickerQuery',
        toggleAct: 'toggleCalcPumpPicker', pickAct: 'pickCalcPump',
        selectedLabel: v.selectedCalcPumpLabel, hasSelection: !!s.selectedCalcPumpId,
        includeNone: true, noneLabel: '— select a pump —', searchPlaceholder: 'Search model or brand…',
        items: v.filteredCalcPumps.map(function (p) { return { id: p.id, label: p.model + ' — ' + p.maxFlow, sub: p.brand + ' · ' + p.type, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.selectedCalcPumpId }; })
      }) +
        (v.calcPumpChosen ? '<div style="margin-top:9px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12px;color:#17564C;">' + esc(v.calcPumpInfo) + '</div>' : '') +
        '<div style="margin-top:9px;display:flex;align-items:center;gap:10px;"><div style="font-size:12px;font-weight:700;color:#4B564F;">Show pump flow in</div><div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FBF9F4;overflow:hidden;">' + pumpUnitSel + '</div></div>'
    ) : (
      '<div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FBF9F4;overflow:hidden;">' +
        '<input inputmode="decimal" data-set="pumpMax" data-key="pumpMax" value="' + esc(s.pumpMax) + '" placeholder="0" style="flex:1;min-width:0;border:none;background:transparent;padding:13px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;">' + pumpUnitSel + '</div>' +
      '<div style="font-size:12px;color:#56635B;margin-top:6px;">Maximum delivery at operating pressure, in the selected unit. Calculated and saved as L/h; changing the unit converts the entry to the same pump.</div>'
    );
    var c = v.calc;
    function resCell(label, val, color, sub) {
      return '<div><div style="font-size:12px;color:#A6BEB3;font-weight:600;">' + label + '</div>' +
        '<div style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:24px;line-height:1.25;font-weight:600;color:' + color + ';letter-spacing:-0.01em;">' + esc(val) + '</div>' +
        '<div style="font-size:12px;color:#9FB0AA;">' + sub + '</div></div>';
    }
    // Dose warning stack on the app's alert/note classes (same computed styles as the Calculator stacks): red only for
    // entered values that cannot be used, amber for genuine cautions, neutral helper text for fields not yet entered.
    var warnHtml = c.hasWarn ? '<div data-calc-warnings style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">' + c.warnings.map(function (w) {
      if (w.kind === 'prompt') return '<div role="note" class="fa-help">' + esc(w.text) + '</div>';
      if (w.kind === 'error') return '<div role="alert" class="fa-note fa-note-error">' + esc(w.text) + '</div>';
      return '<div role="status" class="fa-note">' + esc(w.text) + '</div>';
    }).join('') + '</div>' : '';
    // Pump feed caption: never "% w/v solution" around a blank or unusable strength.
    var feedSub = s.feedBasis === 'neat' ? c.pumpUnitLabel + ' neat as-supplied product' :
      (c.strengthStatus === 'empty' ? c.pumpUnitLabel + ' of solution (enter strength)' : (c.strengthStatus === 'invalid' ? c.pumpUnitLabel + ' of solution (check strength)' : c.pumpUnitLabel + ' of ' + esc(s.makedown) + '% w/v solution'));
    var cal = v.cal;
    var calAdvice = cal.showAdvice ? '<div style="margin-top:11px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12px;color:#17564C;">' + esc(cal.advice) + '</div>' : '';

    return '<div style="padding:22px 18px 30px;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">Calculator</div>' +
      '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 12px;">Dosing &amp; Feed Rate</div>' +
      '<div style="display:flex;background:#E4DFD3;border-radius:12px;padding:3px;gap:3px;">' +
        '<button data-act="onModeConc" style="' + v.modeConcStyle + '">Concentration<div style="font-size:12px;font-weight:400;opacity:1;">mg/L on flow</div></button>' +
        '<button data-act="onModeSludge" style="' + v.modeSludgeStyle + '">Sludge dewatering<div style="font-size:12px;font-weight:400;opacity:1;">kg / t dry solids</div></button></div>' +
      '<div style="margin-top:14px;"><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;">Product</div>' +
        comboHtml({
          name: 'product', open: v.productPickerOpen, query: v.productPickerQuery, setKey: 'productPickerQuery',
          toggleAct: 'toggleProductPicker', pickAct: 'pickProduct',
          selectedLabel: v.selectedProductLabel, hasSelection: !!s.calcProductId,
          includeNone: true, noneLabel: '— none / generic —', searchPlaceholder: 'Search product, brand or charge…',
          items: v.filteredProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.calcProductId }; })
        }) + '</div>' +
      concBlock + sludgeBlock +
      (s.calcHandoffNote ? '<div role="alert" class="fa-note" style="margin-top:12px;">' + esc(s.calcHandoffNote) + '</div>' : '') +
      doseWindowBanner(v.doseWin, v.doseWin && v.doseWin.mismatch ? 'The ' + (isConc ? 'mg/L' : 'kg/t DS') + ' entry' : 'The entered dose', { key: 'calc', value: enteredDoseText }) + sourceInfo(v.allProducts.find(function (p) { return p.id === s.calcProductId; }), { key: 'calc-source' }) +
      '<div style="margin-top:14px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:10px;">Feed preparation</div>' +
        '<label>Feed basis <select data-set="feedBasis" data-key="feedBasis"><option value="solution"' + (s.feedBasis !== 'neat' ? ' selected' : '') + '>Made-up solution (% w/v product)</option><option value="neat"' + (s.feedBasis === 'neat' ? ' selected' : '') + '>Neat liquid (use product density)</option></select></label>' +
        '<div style="display:flex;background:#EEEAE1;border-radius:10px;padding:3px;gap:3px;margin-bottom:11px;">' +
          '<button data-act="onFormLiquid" style="' + v.formLiquidStyle + '">Liquid / emulsion</button>' +
          '<button data-act="onFormPowder" style="' + v.formPowderStyle + '">Powder</button></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Solution strength</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="makedown" data-key="makedown" value="' + esc(s.makedown) + '" placeholder="0.5" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 34px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">%</span></div></div>' +
          liquidDensity +
        '</div>' +
        '<div style="margin-top:8px;font-size:12px;color:#526159;">Solution strength is % w/v (g product per 100 mL). All doses and stock strengths are mass of as-supplied product, NOT active ingredient. 100% w/v means 1000 g/L, not neat product.</div>' +
      '</div>' +
      '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:10px;">Dosing pump</div>' +
        '<div style="display:flex;background:#EEEAE1;border-radius:10px;padding:3px;gap:3px;margin-bottom:11px;">' +
          '<button data-act="onPumpSelect" style="' + v.pumpSelectStyle + '">From my pumps</button>' +
          '<button data-act="onPumpManual" style="' + v.pumpManualStyle + '">Enter capacity</button></div>' + pumpBlock + '</div>' +
      '<div style="margin-top:18px;background:#16211F;border-radius:18px;padding:18px 17px;color:#EFECE3;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Results</div><div style="width:8px;height:8px;border-radius:50%;background:' + c.statusDot + ';"></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 12px;">' +
          resCell('Neat product', c.massKgH, '#4FE0B5', 'kg/h &nbsp;·&nbsp; ' + esc(c.massKgDay) + ' kg/day') +
          resCell('Pump feed', c.solPumpText, '#4FE0B5', feedSub) +
          resCell('Pump stroke', c.strokePct, c.strokeColor, '% of max capacity') +
          resCell('Neat volume', c.neatPumpText, '#4FE0B5', c.pumpUnitLabel + ' before dilution') +
        '</div>' +
        '<div style="margin-top:15px;padding-top:14px;border-top:1px solid #2C3B37;display:flex;flex-direction:column;gap:7px;">' +
          rowKV('Suggested stroke length', c.strokeLen, '#4FE0B5') +
          rowKV('Suggested stroke rate / speed', c.strokeRate, '#4FE0B5') +
          rowKV('Dilution ratio', c.dilution, '#EFECE3') +
          rowKV('Batch (1000 L tank)', c.batchKg + ' kg product', '#EFECE3') +
          rowKV('1000 L batch lasts', c.batchHours + ' h', '#EFECE3') +
        '</div></div>' +
      warnHtml +
      calibrationHtml(s, cal, calAdvice) +
      '<button data-act="startSaveClient" style="margin-top:16px;width:100%;border:1px solid #087568;cursor:pointer;background:#FFF;color:#087568;border-radius:14px;padding:14px;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Save as client</button>' +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12px;color:#56635B;"><b style="color:#16211F;">How this works.</b> Dose (mg/L) × flow (m³/h) = grams of neat product per hour. Divide by your solution strength to get the litres of made-up solution the pump must feed, then compare against the pump\'s max capacity to get the % stroke it needs to run at.</div>' +
      '<div style="margin-top:10px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:12px;padding:13px 14px;font-size:12px;color:#6B5A38;"><b style="color:#8A5E17;">Basis &amp; assumptions.</b> Dose is on an <b>as-supplied</b> (neat product) basis — if it is quoted as active polymer, divide by the active fraction first. Solution strength is <b>% w/v</b> (g per 100 mL; batch by dissolving, then top up to the final volume). Sludge mode reads dry solids as <b>% w/w on wet mass</b> and uses the sludge density you enter (default 1.0 t/m³ — raise it for thick sludge). The pump % stroke assumes capacity at operating back-pressure and roughly linear delivery — always confirm with the calibration catch-test above.</div>' +
    '</div>';
  };
  function rowKV(k, val, color) {
    return '<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#9FB0AA;">' + k + '</span><span style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:' + color + ';font-weight:600;">' + esc(val) + '</span></div>';
  }
  function calibrationHtml(s, cal, calAdvice) {
    return '<div style="margin-top:16px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
      '<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>' +
      '<div style="font-size:12px;font-weight:700;color:#4B564F;">Field calibration check</div></div>' +
      '<div style="font-size:12px;color:#56635B;margin-bottom:11px;">Measure delivery under the actual operating back-pressure (e.g. a suitable suction-side calibration column), following site procedures. An open-discharge catch test does not confirm operating-pressure capacity.</div>' +
      ((s.calMl || s.calSec) && cal.actual === '—' ? '<div role="alert" class="fa-note fa-note-error" style="margin-bottom:10px;">Invalid catch measurement: enter positive mL and seconds using a decimal point, no commas or grouping. No adjustment advice shown.</div>' : '') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Volume collected</div><div style="position:relative;"><input inputmode="decimal" data-set="calMl" data-key="calMl" value="' + esc(s.calMl) + '" placeholder="0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 40px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">mL</span></div></div>' +
        '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Over</div><div style="position:relative;"><input inputmode="decimal" data-set="calSec" data-key="calSec" value="' + esc(s.calSec) + '" placeholder="0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 34px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">s</span></div></div>' +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:18px;">' +
        '<div><div style="font-size:12px;color:#526159;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Measured</div><div style="font-size:16px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:#16211F;">' + esc(cal.actual) + '</div></div>' +
        '<div><div style="font-size:12px;color:#526159;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Target</div><div style="font-size:16px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:#16211F;">' + esc(cal.target) + '</div></div>' +
        '<div><div style="font-size:12px;color:#526159;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Deviation</div><div style="font-size:16px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:' + cal.devColor + ';">' + esc(cal.dev) + '</div></div>' +
      '</div>' + (cal.equivalent ? '<div style="margin-top:6px;font-size:12px;color:#56635B;">' + esc(cal.equivalent) + '</div>' : '') + calAdvice + '</div>';
  }

  App.screens.jars = function (v) {
    var s = App.state;
    var prodOpts = '<option value="">— select a product —</option>' + v.allProducts.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === s.jarProductId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var stockBlock = '';
    if (v.jarProductChosen) {
      stockBlock = '<div style="margin-top:12px;"><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:6px;">Stock strength — ' + esc(v.jarProduct.name) + ' <span style="color:#526159;">(supplier make-down ' + esc(v.jarProduct.makedownText) + ')</span></div>' +
        '<div style="display:flex;gap:7px;flex-wrap:wrap;">' + v.stockOptions.map(function (o) { return '<button data-act="setStockStrength" data-v="' + esc(o.v) + '" style="' + o.style + '">' + esc(o.label) + '</button>'; }).join('') + '</div></div>' +
        '<div style="margin-top:12px;background:#16211F;border-radius:12px;padding:13px 14px;color:#EFECE3;">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/></svg><div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Example stock arithmetic — not preparation evidence</div></div>' +
          '<ol style="margin:0;padding-left:17px;display:flex;flex-direction:column;gap:6px;">' + v.jarStockSteps.map(function (t) { return '<li style="font-size:12px;color:#DCE6E1;">' + esc(t) + '</li>'; }).join('') + '</ol></div>';
    }
    var jarRowsHtml = v.jarRows.map(function (j) {
      function cell(label, dataf, val, ph) {
        return '<div><div style="font-size:12px;color:#526159;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">' + label + '</div>' +
          '<input ' + (dataf === 'floc' ? '' : 'inputmode="decimal" ') + 'data-actinput="onJarField" data-i="' + j.i + '" data-f="' + dataf + '" data-key="jar-' + j.i + '-' + dataf + '" value="' + esc(val) + '"' + (ph ? ' placeholder="' + ph + '"' : '') + ' style="width:100%;background:#FFF;border:1px solid #DBD5C8;border-radius:8px;padding:8px 6px;font-size:' + (dataf === 'floc' ? '13' : '14') + 'px;' + (dataf === 'floc' ? '' : "font-family:ui-monospace, SFMono-Regular, Consolas, monospace;") + 'font-weight:600;text-align:center;"></div>';
      }
      return '<div style="background:' + j.cardBg + ';border:1px solid ' + j.cardBorder + ';border-radius:14px;padding:12px 13px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
          '<button data-act="setWinner" data-i="' + j.i + '" style="border:none;background:none;cursor:pointer;padding:0;display:flex;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' + j.markColor + '" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="' + j.markFill + '" fill="' + j.markColor + '" stroke="none"/></svg></button>' +
          '<div style="font-size:14px;font-weight:700;">Jar ' + j.n + '</div>' +
          '<div style="margin-left:auto;text-align:right;"><span style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:16px;font-weight:600;color:#087568;">' + esc(j.ppm) + '</span><span style="font-size:12px;color:#526159;font-weight:600;"> mg/L nominal (raw sample)</span></div></div>' +
        '<div class="fa-help" style="margin-bottom:8px;">Final mixed concentration: ' + esc(j.finalPpm) + ' mg/L (additive volumes). In final-total mode the raw sample volume is unknown, so full-scale handoff is blocked.</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;">' + cell('Dose mL', 'dose', j.dose) + cell('pH', 'ph', j.ph) + cell('NTU', 'turb', j.turb) + cell('Floc', 'floc', j.floc, '—') + '</div></div>';
    }).join('');
    // A jar mg/L is only a full-scale dose when the product doses mg/L on flow.
    // Dry-tonne-basis products (g/t · kg/t DS) get an explanation, not a send
    // button — there is no conversion without the plant's solids balance.
    var jarBasisMgL = s.jarVolumeBasis === 'initial' && (!s.jarProductId || App.entryDoseBasisOf(v.jarProduct) === 'mgL');
    var winnerHtml = v.hasWinner ? '<div style="margin-top:15px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Selected optimum — Jar ' + esc(v.winnerN) + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:8px;margin-top:5px;"><div style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:24px;line-height:1.25;font-weight:600;color:#4FE0B5;">' + esc(v.winnerPpm) + '</div><div style="font-size:14px;color:#9FB0AA;">' + (jarBasisMgL ? 'mg/L nominal dose per initial raw sample' : 'mg/L in the jar') + '</div></div>' +
      (jarBasisMgL
        ? '<button data-act="useWinner" style="margin-top:12px;width:100%;border:none;cursor:pointer;background:#087568;color:#FFF;border-radius:12px;padding:13px;font-size:14px;font-weight:700;">Send this dose to the calculator →</button>'
        : '<div style="margin-top:12px;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:10px 12px;font-size:12px;color:#DCE6E1;"><b>' + esc(v.jarProduct.name) + '</b> has a dry-solids workflow entry basis (' + esc(v.jarProduct.entryDoseUnit || v.jarProduct.doseUnit || 'unknown') + '), not a confirmed supplier dose basis — a jar mg/L doesn’t convert to a plant dose without the solids balance. Use the sludge / mining playbook’s dry-solids tools instead.</div>') +
      '</div>' : '';
    var jarSaveForm = s.showJarSave ? ('<div class="fa-dark-form" style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A6BEB3;font-weight:700;margin-bottom:11px;">Save jar test</div>' +
      '<label for="fa-jar-save-client">Attach to client (optional)</label>' +
      '<select id="fa-jar-save-client" data-set="jarSaveClient" data-key="jarSaveClient" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#FFF;appearance:none;margin-bottom:9px;"><option value="">— no client —</option>' + v.clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.jarSaveClient ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' +
      '<input data-set="jarSaveNote" data-key="jarSaveNote" value="' + esc(s.jarSaveNote) + '" placeholder="Note (e.g. raw water 45 NTU)" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:12px;font-size:14px;color:#EFECE3;margin-bottom:11px;">' +
      '<div style="display:flex;gap:9px;"><button data-act="cancelJarSave" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmJarSave" style="flex:2;border:none;cursor:pointer;background:#087568;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save test</button></div></div>') : '';
    var jarSaved = s.jarSaved ? '<div style="margin-top:10px;background:#ECF7F3;border:1px solid #B8E0D3;border-radius:12px;padding:11px 13px;font-size:12px;color:#17564C;font-weight:600;">✓ Test saved to your history below.</div>' : '';
    var jarSaveErr = s.jarSaveError ? '<div style="margin-top:10px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:12px;padding:11px 13px;font-size:12px;color:#8A3A24;font-weight:600;">' + esc(s.jarSaveError) + '</div>' : '';
    var historical = App.jarHistoryRecord(s.jarHistoryId);
    function rawSaved(value) { return value === null || value === undefined || value === '' ? 'Unknown / not recorded' : String(value); }
    var historyDetail = historical ? '<section data-jar-history-detail="' + esc(historical.id) + '" aria-label="Saved jar results" style="margin-top:14px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px;word-wrap:break-word;">' +
      '<h3>Saved jar results — read only</h3><p>' + esc(rawSaved(historical.clientName)) + ' · ' + esc(rawSaved(historical.productName)) + ' · ' + esc(rawSaved(historical.date)) + '</p>' +
      '<p>Recorded volume: ' + esc(rawSaved(historical.jarVol)) + ' mL; stock: ' + esc(rawSaved(historical.stockPct)) + '% w/v. Preparation confirmation: ' + esc(rawSaved(historical.stockPreparation)) + '. Volume basis: ' + esc(rawSaved(historical.jarVolumeBasis)) + '. Dose convention: ' + esc(rawSaved(historical.doseConvention)) + '.</p>' +
      '<p>Historical values are not recalculated or certified. Missing preparation, units or conventions remain unknown; viewing does not authorize transfer.</p>' +
      '<p>Saved winner: Jar ' + esc(rawSaved(historical.winnerN)) + '; ' + (historical.doseConvention === 'nominal-raw-sample-v1' ? 'recorded nominal dose: ' : 'recorded winner value (historical convention unknown unless stated above): ') + esc(rawSaved(historical.winnerPpm)) + ' mg/L; recorded final concentration: ' + esc(rawSaved(historical.winnerFinalMgL)) + ' mg/L.</p>' +
      (Array.isArray(historical.jars) ? historical.jars : []).map(function (j, i) { j = j && typeof j === 'object' && !Array.isArray(j) ? j : {}; return '<div style="margin:10px 0;padding:10px;background:#F0F6F3;"><b class="fa-heading">Jar ' + (i + 1) + '</b><dl><dt>Recorded stock addition (mL)</dt><dd>' + esc(rawSaved(j.dose)) + '</dd><dt>pH</dt><dd>' + esc(rawSaved(j.ph)) + '</dd><dt>Turbidity (NTU)</dt><dd>' + esc(rawSaved(j.turb)) + '</dd><dt>Floc</dt><dd>' + esc(rawSaved(j.floc)) + '</dd></dl></div>'; }).join('') +
      '<p>Note: ' + esc(rawSaved(historical.note)) + '</p><button data-act="closeJarTest" class="fa-btn">Close saved jar results</button></section>' : (s.jarHistoryId !== null && s.jarHistoryId !== undefined ? '<p role="status" class="fa-note fa-note-error">Saved jar view unavailable: identity is missing or ambiguous; select a unique stable ID. Original history is unchanged. <button data-act="closeJarTest" class="fa-btn">Close saved jar results</button></p>' : '');
    var historyHtml = v.hasJarTests ? ('<div style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#56635B;">Test history</div><div style="font-size:12px;color:#526159;">newest first</div></div>' + (s.jarHistoryClientId ? '<button data-act="showAllJarTests" class="fa-btn">Show all saved jar tests</button>' : '') +
      '<div style="margin-top:9px;display:flex;flex-direction:column;gap:9px;">' + v.jarTestRows.map(function (t) {
        return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:13px 14px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:700;">' + esc(t.product) + '</div><div style="font-size:12px;color:#56635B;margin-top:1px;">' + esc(t.who) + ' · ' + esc(t.date) + '</div></div>' +
          '<button data-act="deleteJarTest" data-id="' + esc(t.id) + '" aria-label="Delete jar test for ' + esc(t.who) + '" style="border:none;background:none;cursor:pointer;min-width:44px;min-height:44px;flex-shrink:0;padding:10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0574A" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button></div>' +
          '<div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:6px;"><div style="background:#16211F;color:#4FE0B5;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;">' + esc(t.winner) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(t.setup) + '</div></div>' +
          '<button data-act="viewJarTest" data-id="' + esc(t.id) + '" aria-label="View saved jar results for ' + esc(t.who) + '" class="fa-btn" style="margin-top:8px;">View saved jar results</button>' +
          (t.note ? '<div style="margin-top:8px;font-size:12px;color:#56635B;">' + esc(t.note) + '</div>' : '') + '</div>';
      }).join('') + '</div>') : '';

    return '<div style="padding:22px 18px 30px;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">Field test</div>' +
      '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 4px;">Jar Test</div>' +
      '<div style="font-size:14px;color:#56635B;">Dose a set of jars with increasing amounts of stock solution, record how each performs, then carry the winning dose straight into the calculator.</div>' +
      '<div style="margin-top:15px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:8px;">Product for this test</div>' +
        comboHtml({
          name: 'jarProduct', open: v.jarProductPickerOpen, query: v.jarProductPickerQuery, setKey: 'jarProductPickerQuery',
          toggleAct: 'toggleJarProductPicker', pickAct: 'pickJarProduct',
          selectedLabel: v.selectedJarProductLabel, hasSelection: !!s.jarProductId,
          includeNone: true, noneLabel: '— select a product —', searchPlaceholder: 'Search product, brand or charge…',
          items: v.filteredJarProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.jarProductId }; })
        }) + stockBlock + '</div>' +
      '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:10px;">Test setup</div>' +
        '<label>Jar volume basis <select data-set="jarVolumeBasis" data-key="jarVolumeBasis">' + optionTags([{v:'final',label:'Final total incl. stock (raw sample unknown; handoff blocked)'},{v:'initial',label:'Initial RAW sample before adding stock (nominal dose)'}], s.jarVolumeBasis, 'v', 'label') + '</select></label>' +
        '<div class="fa-help" style="margin:10px 0 14px;">Stock is % w/v as-supplied product, not active ingredient. Use plain non-negative decimal numbers with a decimal point; commas, grouping and ranges are invalid. Invalid setups show — and cannot be sent. Follow supplier-specific mixing and safety instructions.</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;">' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Jar volume (see basis below)</div><div style="position:relative;"><input inputmode="decimal" data-set="jarVol" data-key="jarVol" value="' + esc(s.jarVol) + '" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 40px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">mL</span></div></div>' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Stock strength</div><div style="position:relative;"><input inputmode="decimal" data-set="stockPct" data-key="stockPct" value="' + esc(s.stockPct) + '" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 32px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">%</span></div></div>' +
        '</div>' +
        '<p>' + (App.jarPreparationConfirmed() ? 'Actual preparation confirmed for this session.' : 'Preparation unconfirmed — numerical defaults and presets are examples, not actual preparation evidence.') + '</p><button data-act="confirmJarPreparation" class="fa-btn">Confirm actual prepared stock and sample basis</button>' +
        '<div style="margin-top:10px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12px;color:#17564C;">' + esc(v.stockPrep) + '</div>' +
        '<div style="margin-top:12px;"><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Optimisation retest — current full-scale dose</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<div style="position:relative;flex:1;"><input inputmode="decimal" data-set="jarCurrentDose" data-key="jarCurrentDose" value="' + esc(s.jarCurrentDose) + '" placeholder="e.g. 5" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 44px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">mg/L</span></div>' +
            '<button data-act="bracketJars" style="flex-shrink:0;border:1px solid #087568;background:#FFF;color:#087568;border-radius:10px;padding:0 13px;font-size:12px;font-weight:700;cursor:pointer;">Bracket 50–150%</button></div>' +
          '<div style="margin-top:6px;font-size:12px;color:#526159;">Sets the jars to 50 / 75 / 100 / 125 / 150% of what the plant doses today — the troubleshooting bracket from the field-playbooks brief.</div>' +
          (s.bracketNote ? '<div style="margin-top:7px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:9px;padding:8px 11px;font-size:12px;color:#8A3A24;">' + esc(s.bracketNote) + '</div>' : '') + '</div></div>' +
      '<div style="margin-top:15px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#56635B;">Jars</div><div style="font-size:12px;color:#526159;">tap ◎ to mark the winner</div></div>' +
      '<div style="margin-top:9px;display:flex;flex-direction:column;gap:10px;">' + jarRowsHtml + '</div>' +
      '<div style="margin-top:11px;display:flex;gap:9px;"><button data-act="addJar" style="flex:1;border:1px solid #D8D2C4;background:#FFF;cursor:pointer;border-radius:11px;padding:11px;font-size:14px;font-weight:700;color:#16211F;">+ Add jar</button><button data-act="removeJar" style="flex:1;border:1px solid #D8D2C4;background:#FFF;cursor:pointer;border-radius:11px;padding:11px;font-size:14px;font-weight:700;color:#56635B;">– Remove last</button></div>' +
      winnerHtml + sourceInfo(v.jarProduct, { key: 'jars-source' }) +
      '<button data-act="startJarSave" style="margin-top:14px;width:100%;border:1px solid #087568;cursor:pointer;background:#FFF;color:#087568;border-radius:14px;padding:14px;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Save this test</button>' +
      jarSaveForm + jarSaveErr + jarSaved + historyHtml + historyDetail +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12px;color:#56635B;"><b style="color:#16211F;">Reading the test.</b> The best dose is usually the <i>lowest</i> one that gives clear water, fast-settling floc and stable pH — overdosing wastes product and can re-stabilise (re-suspend) the solids. Note floc as pinpoint / small / medium / large.</div>' +
    '</div>';
  };

  App.screens.pumps = function (v) {
    var s = App.state;
    var formHtml = s.showPumpForm ? pumpFormHtml(s) : '';
    var rowsHtml = v.pumpRows.map(function (p) {
      var rm = p.removable ? '<button data-act="removePump" data-id="' + esc(p.id) + '" aria-label="Delete pump ' + esc(p.model) + '" style="border:none;background:none;cursor:pointer;min-width:44px;min-height:44px;flex-shrink:0;padding:10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0574A" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>' : '';
      function box(label, val, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + ' style="background:#F6F3EC;border-radius:9px;padding:8px 10px;"><div style="font-size:12px;color:#526159;font-weight:700;text-transform:uppercase;">' + label + '</div><div style="font-size:14px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;margin-top:1px;">' + esc(val) + '</div></div>'; }
      var aiNote = p.ai ? '<div style="margin-top:9px;background:#F3EFFA;border:1px solid #DDD1F0;border-radius:9px;padding:8px 11px;font-size:12px;color:#6A4CA0;">AI-retrieved from model knowledge — <b>verify against the official datasheet</b> before sizing a pump on these figures.</div>' : '';
      var srcNote = (p.source && !p.ai) ? '<div style="margin-top:8px;font-size:12px;color:#526159;overflow-wrap:break-word;word-wrap:break-word;">Source: ' + esc(p.source) + '</div>' + sourceInfo(p, { key: 'pump-source:' + p.id, sourceShown: true }) : sourceInfo(p, { key: 'pump-source:' + p.id });
      return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:15px;padding:14px 15px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div style="font-size:16px;font-weight:700;">' + esc(p.model) + ' ' + vbadge(p) + '</div><div style="font-size:12px;color:#56635B;">' + esc(p.brand) + ' · ' + esc(p.type) + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px;"><div style="background:' + esc(p.tint) + ';color:' + esc(p.tintText === '#B05A28' ? '#8A451D' : p.tintText) + ';border-radius:8px;padding:4px 9px;font-size:12px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;">' + esc(p.tag) + '</div>' + rm + '</div></div>' +
        '<div class="fa-pump-specs">' + box('Max flow', p.maxFlow) + box('Max press', p.maxPress) +
          box('Control', p.control, 'fa-pump-control') + '</div>' +
        (p.note ? '<div style="margin-top:9px;font-size:12px;color:#56635B;">' + esc(p.note) + '</div>' : '') + srcNote + aiNote + '</div>';
    }).join('');
    var noMatch = v.noPumpMatch ? ('<div style="margin-top:8px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:16px;text-align:center;"><div style="font-size:14px;color:#56635B;">Not in your local repository yet.</div>' +
      '<button data-act="lookupPump" style="margin-top:12px;width:100%;border:none;cursor:pointer;background:#16211F;color:#EFECE3;border-radius:12px;padding:13px;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z"/><path d="M9 21h6"/></svg>Enter manually “' + esc(s.pumpQuery) + '”</button>' +
      '<div style="margin-top:8px;font-size:12px;color:#526159;">Automatic source lookup is unavailable. Opens a manual form; values remain user-declared, not supplier-certified.</div></div>') : '';
    var loadingHtml = s.pumpLoading ? '<div style="margin-top:8px;background:#16211F;border-radius:12px;padding:15px;text-align:center;color:#9FB0AA;font-size:14px;display:flex;align-items:center;justify-content:center;gap:10px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2" style="animation:spin 0.9s linear infinite;"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>Looking up “' + esc(s.pumpQuery) + '”…</div>' : '';
    var errHtml = s.pumpError ? '<div style="margin-top:8px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:12px;padding:13px 14px;font-size:12px;color:#8A3A24;">' + esc(s.pumpError) + '</div>' : '';
    return '<div style="padding:22px 18px 30px;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">Equipment</div>' +
      '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 12px;">Dosing Pumps</div>' +
      '<div style="position:relative;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#526159" stroke-width="2" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
        '<input data-set="pumpQuery" data-key="pumpQuery" value="' + esc(s.pumpQuery) + '" placeholder="Search model or brand…" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 13px 13px 40px;font-size:14px;font-weight:400;"></div>' +
      '<button data-act="startAddPump" style="margin-top:12px;width:100%;border:1px dashed #C6BFAF;background:#FBF9F4;cursor:pointer;border-radius:12px;padding:12px;font-size:14px;font-weight:700;color:#4B564F;display:flex;align-items:center;justify-content:center;gap:7px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Add a pump manually</button>' +
      formHtml +
      '<div style="margin-top:13px;display:flex;flex-direction:column;gap:10px;">' + rowsHtml + '</div>' + noMatch + loadingHtml + errHtml +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12px;color:#56635B;"><b style="color:#16211F;">Building your library.</b> Search any model — if it\'s not stored, add it manually from the datasheet. Confirm exact model, frequency, injection medium, back-pressure and current supplier instructions. Family maxima are not simultaneous; no generic stroke advice for proportional water-driven dosers.</div>' +
    '</div>';
  };
  function pumpFormHtml(s) {
    var n = s.npu;
    function pf(dataf, val, ph, extra) { return '<input data-actinput="onNpuField" data-f="' + dataf + '" data-key="npu-' + dataf + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '" style="' + (extra || 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;') + '">'; }
    return '<div class="fa-dark-form" style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A6BEB3;font-weight:700;margin-bottom:12px;">New pump</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;">' +
        pf('model', n.model, 'Model (required)', 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;font-weight:600;color:#FFF;') +
        pf('brand', n.brand, 'Brand / maker') +
        '<select data-actchange="onNpuField" data-f="type" data-key="npu-type" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#FFF;appearance:none;">' + optionTags([{ v: 'Solenoid diaphragm' }, { v: 'Motor diaphragm' }, { v: 'Digital diaphragm' }, { v: 'Peristaltic' }, { v: 'Progressive cavity' }], n.type, 'v', 'v') + '</select>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' + pf('maxFlow', n.maxFlow, 'Max flow e.g. 30 L/h', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;') + pf('maxPress', n.maxPress, 'Max press e.g. 16 bar', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;') + '</div>' +
        pf('control', n.control, 'Control (Digital / pulse / stroke)') +
        '<textarea data-actinput="onNpuField" data-f="note" data-key="npu-note" placeholder="Notes (optional)" rows="2" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;color:#EFECE3;resize:vertical;">' + esc(n.note) + '</textarea>' +
      '</div>' +
      '<div style="display:flex;gap:9px;margin-top:12px;"><button data-act="cancelAddPump" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmAddPump" style="flex:2;border:none;cursor:pointer;background:#087568;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save pump</button></div></div>';
  }

  // Backup & restore card (Clients screen). Saved data lives only in this
  // browser, so a backup file is the only copy that survives a lost phone,
  // a cleared Safari, or the app being removed.
  function backupCardHtml(s) {
    var counts = App.STORE_KEYS.map(function (k) {
      var n = (s[k.state] || []).length;
      return n + ' ' + (n === 1 ? k.one : k.many);
    }).join(' · ');
    var last = s.lastBackup ? ('Last backup ' + esc(new Date(s.lastBackup).toLocaleDateString('en-AU'))) : 'No backup made on this phone yet';
    var btn = 'flex:1;border:1px solid #087568;cursor:pointer;background:#FFF;color:#087568;border-radius:11px;padding:11px 8px;font-size:14px;font-weight:700;';
    var msg = s.backupMsg ? '<div style="margin-top:10px;font-size:12px;color:#17564C;font-weight:600;">' + esc(s.backupMsg) + '</div>' : '';
    var raw = s.backupText ? ('<textarea readonly data-key="backupText" style="margin-top:9px;width:100%;height:110px;border:1px solid #D8D2C4;border-radius:10px;padding:9px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:12px;background:#FBF9F4;color:#16211F;">' + esc(s.backupText) + '</textarea>' +
      '<button data-act="dismissBackupText" style="margin-top:6px;border:none;background:none;color:#56635B;font-size:12px;font-weight:600;cursor:pointer;">Hide text</button>') : '';
    // Immutable recovery is independent of ordinary export text and its Hide control.
    var recoveryRaw = App._restoreRecovery ? '<label style="display:block;margin-top:12px;font-size:12px;font-weight:700;">Original session-only recovery backup (save off-device now)' +
      '<textarea readonly data-recovery-text aria-label="Original session-only recovery backup" style="display:block;margin-top:6px;width:100%;height:110px;border:1px solid #E8C2B8;border-radius:10px;padding:9px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:12px;background:#FBF9F4;color:#16211F;">' + esc(App._restoreRecovery) + '</textarea></label>' : '';
    var restore = '';
    if (s.showRestore) {
      restore = '<div style="margin-top:12px;border-top:1px solid #EFEBE2;padding-top:12px;">' +
        '<div style="font-size:12px;color:#4B564F;margin-bottom:9px;">Pick a backup file, or paste backup text. Restoring adds what is missing and keeps everything already on this phone.</div>' +
        '<input type="file" accept=".json,application/json,text/plain" data-actchange="restoreFile" style="width:100%;font-size:14px;margin-bottom:9px;">' +
        '<textarea data-set="restoreText" data-key="restoreText" placeholder="\u2026or paste backup text here" style="width:100%;height:80px;border:1px solid #D8D2C4;border-radius:10px;padding:9px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:12px;background:#FFF;color:#16211F;">' + esc(s.restoreText) + '</textarea>' +
        '<div style="display:flex;gap:9px;margin-top:9px;"><button data-act="toggleRestore" style="' + btn + 'border-color:#D8D2C4;color:#56635B;">Cancel</button>' +
        '<button data-act="restoreFromText"' + (String(s.restoreText || '').trim() ? '' : ' disabled') + ' style="' + btn + 'background:#087568;color:#FFF;' + (String(s.restoreText || '').trim() ? '' : 'opacity:.45;') + '">Restore pasted text</button></div></div>';
    }
    var rmsg = s.restoreMsg ? '<div style="margin-top:10px;border-radius:10px;padding:10px 12px;font-size:12px;font-weight:600;' +
      (s.restoreOk ? 'background:#ECF7F3;border:1px solid #BFE3D6;color:#17564C;' : 'background:#FBEDEA;border:1px solid #E8C2B8;color:#8A3A2C;') + '">' + esc(s.restoreMsg) + '</div>' : '';
    return '<div style="margin-top:15px;background:#FFF;border:1px solid #E2DDD0;border-radius:15px;padding:14px 15px;">' +
      '<div style="font-size:16px;font-weight:700;">Backup &amp; restore</div>' +
      '<div style="font-size:12px;color:#56635B;margin-top:2px;">' + (App._restoreRecovery ? 'In this open session (saved storage unverified): ' : 'On this phone: ') + esc(counts) + '. ' + last + '.</div>' +
      '<div style="display:flex;gap:9px;margin-top:11px;">' +
        '<button data-act="saveBackupFile" style="' + btn + 'background:#087568;color:#FFF;">Save backup file</button>' +
        '<button data-act="copyBackup" style="' + btn + '">Copy backup</button>' +
      '</div>' +
      (s.showRestore ? '' : '<button data-act="toggleRestore" style="margin-top:9px;width:100%;border:1px dashed #D8D2C4;cursor:pointer;background:#FBF9F4;color:#16211F;border-radius:11px;padding:10px;font-size:14px;font-weight:600;">Restore from a backup\u2026</button>') +
      msg + raw + recoveryRaw + restore + rmsg + '</div>';
  }

  App.screens.clients = function (v) {
    var s = App.state;
    var addForm = s.showClientForm ? ('<div class="fa-dark-form" style="margin-top:15px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A6BEB3;font-weight:700;margin-bottom:11px;">New client from current calc</div>' +
      '<input data-set="clientName" data-key="clientName" value="' + esc(s.clientName) + '" placeholder="Client / company name" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:11px;padding:12px;font-size:16px;font-weight:600;color:#FFF;margin-bottom:9px;">' +
      '<input data-set="clientSite" data-key="clientSite" value="' + esc(s.clientSite) + '" placeholder="Site / plant (optional)" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:11px;padding:12px;font-size:14px;color:#EFECE3;margin-bottom:11px;">' +
      '<div style="font-size:12px;color:#9FB0AA;margin-bottom:12px;">' + esc(v.clientPreview) + '</div>' +
      '<div style="display:flex;gap:9px;"><button data-act="cancelClient" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmClient" style="flex:2;border:none;cursor:pointer;background:#087568;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save client</button></div>' +
      (s.clientSaveError ? '<div style="margin-top:10px;background:#3A2320;border:1px solid #6B3A2E;border-radius:10px;padding:10px 12px;font-size:12px;color:#F0B7A8;font-weight:600;">' + esc(s.clientSaveError) + '</div>' : '') + '</div>') : '';
    var listHtml = v.hasClients ? ('<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">' + v.clients.map(function (c) {
      var testLine = c.hasTests ? '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:12px;color:#087568;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/></svg>' + esc(c.testLabel) + '<button data-act="viewClientJarTests" data-id="' + esc(c.id) + '" aria-label="View saved jar tests for ' + esc(c.name) + '" class="fa-btn">View saved jar tests</button></div>' : '';
      var chipsLine = c.hasCalc ? '<div style="margin-top:11px;display:flex;flex-wrap:wrap;gap:6px;"><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip1) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip2) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip3) + '</div></div>' : '';
      var readingsLine = c.nReadings ? ('<details open style="margin-top:9px;"><summary style="padding:12px;cursor:pointer;">View all ' + c.nReadings + ' saved reading/programme sets</summary><div style="display:flex;flex-direction:column;gap:5px;">' + c.readings.map(function (r, i) {
        return '<div style="background:#FBF9F4;border:1px solid #EFEBE2;border-radius:9px;padding:7px 10px;font-size:12px;color:#4B564F;"><span style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;color:#087568;">☰</span> ' + esc(r) + (c.readingRecords[i].id && c.readingRecords[i].playbookId && c.readingRecords[i].readingInputs ? '<button data-act="recallGuideReading" data-client-id="' + esc(c.id) + '" data-reading-id="' + esc(c.readingRecords[i].id) + '" style="display:block;width:100%;min-height:44px;margin-top:8px;padding:10px;">Recall this saved reading / programme</button>' : '<div>Historical record retained; full recall unavailable (stable identity/context not recorded).</div>') + '</div>';
      }).join('') + '</div></details>') : '';
      var loadBtn = c.hasCalc ? '<button data-act="loadClient" data-id="' + esc(c.id) + '" style="margin-top:12px;width:100%;border:1px solid #087568;cursor:pointer;background:#FFF;color:#087568;border-radius:11px;padding:11px;font-size:14px;font-weight:700;">Load into calculator</button>' : '';
      return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:15px;padding:14px 15px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="flex:1;min-width:0;"><div style="font-size:16px;font-weight:700;">' + esc(c.name) + '</div><div style="font-size:12px;color:#56635B;margin-top:1px;">' + esc(c.site) + '</div></div>' +
        '<button data-act="deleteClient" data-id="' + esc(c.id) + '" aria-label="Delete client ' + esc(c.name) + '" style="border:none;background:none;cursor:pointer;min-width:44px;min-height:44px;flex-shrink:0;padding:10px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C0574A" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button></div>' +
        chipsLine + readingsLine + testLine + loadBtn + '</div>';
    }).join('') + '</div>') : '';
    var empty = v.noClients ? '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:14px;padding:18px;font-size:14px;color:#56635B;text-align:center;">No clients yet. Go to the Dosing Calc, enter a site\'s flow and product, and tap <b style="color:#16211F">Save as client</b>.</div>' : '';
    return '<div style="padding:22px 18px 30px;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">' + (App._restoreRecovery ? 'Recovery pending · saved storage unverified' : 'Saved locally') + '</div>' +
      '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 4px;">Clients &amp; Sites</div>' +
      '<div style="font-size:14px;color:#56635B;">Each saved client stores its flow, product, dose and solution setup so you can recall it in one tap next visit. Stored on this device only. Close all older installed copies or tabs and update them before editing; older versions do not participate in safe multi-tab coordination.</div>' +
      backupCardHtml(s) + addForm + listHtml + empty +
    '</div>';
  };

  // ============================ GUIDE (playbooks) ===========================
  function guideSrcNote(extra) {
    var src = (window.PLAYBOOKS && window.PLAYBOOKS.source) || '';
    return '<div style="margin-top:16px;font-size:12px;color:#526159;">' + esc(src) + (extra ? ' ' + extra : '') + '</div>';
  }

  App.screens.guide = function (v) {
    var PB = window.PLAYBOOKS;
    // playbooks.js can be missing after a partial offline update — degrade to a
    // message instead of throwing mid-render (which would freeze the screen)
    if (!PB) {
      return '<div style="padding:22px 18px 30px;">' +
        '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 8px;">Field Playbooks</div>' +
        '<div style="background:#FBF6EC;border:1px solid #EBD9BC;border-radius:14px;padding:14px 15px;font-size:14px;color:#6B5A38;">The playbooks module didn’t load on this device — likely a partly-applied update while offline. Go online once, then pull to refresh; the rest of the app keeps working meanwhile.</div></div>';
    }
    var chain = PB.chain.map(function (step, i) {
      return '<span style="flex-shrink:0;background:#16211F;color:#4FE0B5;border-radius:8px;padding:6px 10px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:12px;font-weight:600;">' + esc(step) + '</span>' +
        (i < PB.chain.length - 1 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#526159" stroke-width="2.4" style="flex-shrink:0;"><path d="M9 18l6-6-6-6"/></svg>' : '');
    }).join('');
    var cards = PB.list.map(function (g) {
      return '<button data-act="openGuide" data-id="' + esc(g.id) + '" style="text-align:left;cursor:pointer;background:#FFF;border:1px solid #E2DDD0;border-radius:16px;padding:14px 15px;display:flex;gap:13px;align-items:center;">' +
        '<div style="width:44px;height:44px;flex-shrink:0;border-radius:12px;background:' + esc(g.tint) + ';display:flex;align-items:center;justify-content:center;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;font-size:12px;color:' + esc(g.tintText === '#B05A28' ? '#8A451D' : g.tintText) + ';">' + esc(g.tag) + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:16px;font-weight:700;">' + esc(g.name) + '</div>' +
        '<div style="font-size:12px;color:#56635B;margin-top:1px;">' + esc(g.mech) + '</div></div>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B4BBB4" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>';
    }).join('');
    var l2rows = PB.kit.l2.map(function (r) {
      return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #F0EDE4;"><div style="width:118px;flex-shrink:0;font-size:12px;font-weight:700;color:#16211F;">' + esc(r.m) + '</div><div style="flex:1;font-size:12px;color:#56635B;">' + esc(r.t) + '</div></div>';
    }).join('');
    return '<div style="padding:22px 18px 30px;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">Field playbooks</div>' +
      '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 4px;">Application Guide</div>' +
      '<div style="font-size:14px;color:#56635B;">Drinking water, sewage, industrial effluent and mineral slurries fail differently. Pick the application, measure the right surrogates, and let them narrow the product family and dose range — then confirm with a quick field test.</div>' +
      '<div style="margin-top:13px;display:flex;align-items:center;gap:6px;overflow-x:auto;padding-bottom:4px;" class="scroll">' + chain + '</div>' +
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' + cards + '</div>' +
      '<div style="margin-top:15px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
        '<div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Operating rule</div>' +
        '<div style="font-size:16px;font-weight:700;margin-top:6px;color:#4FE0B5;">' + esc(PB.rule) + '</div></div>' +
      '<div style="margin-top:18px;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#56635B;">Field kit levels</div>' +
      '<div style="margin-top:9px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;">Level 1 — carry always</div>' +
        '<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:6px;">' + PB.kit.l1.map(function (t) { return '<span style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(t) + '</span>'; }).join('') + '</div></div>' +
      '<div style="margin-top:10px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Level 2 — add per application</div>' + l2rows + '</div>' +
      '<div style="margin-top:10px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;">Level 3 — occasional lab calibration</div>' +
        '<div style="font-size:12px;color:#56635B;margin:5px 0 7px;">Representative samples only — used to calibrate and validate the field system, not for every call.</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + PB.kit.l3.map(function (t) { return '<span style="background:#FBF9F4;border:1px solid #E2DDD0;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#4B564F;">' + esc(t) + '</span>'; }).join('') + '</div></div>' +
      guideSrcNote('') +
    '</div>';
  };

  App.screens.guideDetail = function (v) {
    var g = v.guide, s = App.state;
    if (!g) return App.screens.guide(v);

    var outputsHtml = g.outputs ? ('<div style="margin-top:14px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
      '<div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:8px;">Determine / confirm by jar and plant testing</div>' +
      '<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">' + g.outputs.map(function (t) { return '<li style="font-size:14px;color:#333E39;">' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div style="margin-top:9px;font-size:12px;color:#526159;">These are testing objectives, not computed predictions. No starting dose, alkalinity balance or post-dose pH is calculated by this panel.</div></div>') : '';

    var measureHtml = '';
    if (g.measure && g.measure.length) {
      var items = g.measure.map(function (m, i) {
        var k = g.id + ':' + i;
        var done = !!s.guideChecks[k];
        return '<button data-act="toggleGuideCheck" data-ck="' + esc(k) + '" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;padding:8px 0;display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid #F0EDE4;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + (done ? '#087568' : '#B4BBB4') + '" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="9"/>' + (done ? '<path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="#087568"/>' : '') + '</svg>' +
          '<span style="min-width:0;"><span style="display:block;font-size:14px;font-weight:600;color:' + (done ? '#526159' : '#16211F') + ';' + (done ? 'text-decoration:line-through;' : '') + '">' + esc(m.n) + '</span>' +
          (m.why ? '<span style="display:block;font-size:12px;color:#526159;">' + esc(m.why) + '</span>' : '') + '</span></button>';
      }).join('');
      measureHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div style="font-size:12px;font-weight:700;color:#4B564F;">Measure in the field</div><div style="font-size:12px;color:#526159;">tap to tick off</div></div>' + items + '</div>';
    }

    var subsHtml = '';
    if (g.subs) {
      subsHtml = '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' + g.subs.map(function (sub) {
        return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
          '<div style="font-size:14px;font-weight:700;">' + esc(sub.title) + '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#17564C;background:#F0F6F3;border-radius:9px;padding:8px 11px;"><b>Measure:</b> ' + esc(sub.m) + '</div>' +
          '<div style="margin-top:8px;font-size:12px;color:#56635B;">' + esc(sub.note) + '</div></div>';
      }).join('') + '</div>';
    }

    var endpointsHtml = '<div style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
      g.endpointGroups.map(function (grp, gi) {
        return (gi > 0 ? '<div style="margin-top:13px;padding-top:12px;border-top:1px solid #2C3B37;"></div>' : '') +
          '<div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Confirm in the field — ' + esc(grp.title) + '</div>' +
          '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">' + grp.items.map(function (t) { return '<span style="background:#202E2A;border:1px solid #35453F;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#DCE6E1;">' + esc(t) + '</span>'; }).join('') + '</div>';
      }).join('') + '</div>';

    var db = g.doseBasis;
    var doseHtml = '<div style="margin-top:12px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:14px;padding:14px 15px;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8A5E17;font-weight:700;">Dose basis</div>' +
      '<div style="font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:16px;font-weight:600;color:#5C4A24;margin-top:5px;">' + esc(db.label) + '</div>' +
      '<div style="font-size:12px;color:#6B5A38;margin-top:6px;">' + esc(db.body) + '</div>' +
      (db.formulas ? '<div style="margin-top:9px;display:flex;flex-direction:column;gap:5px;">' + db.formulas.map(function (f) { return '<div style="background:#FFF;border:1px solid #EBD9BC;border-radius:9px;padding:8px 11px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-size:12px;font-weight:600;color:#5C4A24;">' + esc(f) + '</div>'; }).join('') + '</div>' : '') + '</div>';

    var benchHtml = '';
    if (g.bench) {
      var b = App.computeBench();
      var bfld = function (label, key, val, unit) {
        return '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">' + label + '</div>' +
          '<div style="position:relative;"><input inputmode="decimal" data-set="' + key + '" data-key="' + key + '" value="' + esc(val) + '" placeholder="0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px ' + (unit.length > 2 ? '52' : '38') + 'px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">' + unit + '</span></div></div>';
      };
      benchHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;">Bench dose calculator</div>' +
        '<div style="font-size:12px;color:#56635B;margin:4px 0 11px;">Dose a measuring-cylinder settling test, then convert what you added into g/t dry solids.</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          bfld('Slurry sample', 'mgSample', s.mgSample, 'g') +
          bfld('Solids', 'mgSolids', s.mgSolids, '% w/w') +
          bfld('Stock strength', 'mgStock', s.mgStock, '% w/v') +
          bfld('Stock added', 'mgMl', s.mgMl, 'mL') +
        '</div>' +
        '<div style="margin-top:12px;background:#16211F;border-radius:12px;padding:13px 14px;color:#EFECE3;display:flex;gap:18px;">' +
          '<div><div style="font-size:12px;color:#A6BEB3;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Dry solids</div><div style="font-size:16px;font-weight:600;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:#EFECE3;">' + esc(b.dryG) + ' g</div></div>' +
          '<div><div style="font-size:12px;color:#A6BEB3;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">As-supplied product</div><div style="font-size:16px;font-weight:600;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:#EFECE3;">' + esc(b.activeMg) + ' mg</div></div>' +
          '<div><div style="font-size:12px;color:#A6BEB3;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Dose</div><div style="font-size:16px;font-weight:600;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:#4FE0B5;">' + esc(b.doseGt) + ' g/t</div></div>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:12px;color:#526159;">Stock at 0.1% w/v = 1 mg as-supplied product per mL. Dose basis is dry solids, so the answer is comparable across slurry concentrations.</div></div>';
    }

    // Site readings — every playbook. Values come from the plant visit and can
    // be saved against a client to build site history over time.
    var readingsHtml = '';
    if (g.fields && g.fields.length) {
      var fieldCells = g.fields.map(function (f) {
        var key = g.id + ':' + f.k;
        var val = s.guideReadings[key] || '';
        return '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">' + esc(f.label) + '</div>' +
          '<div style="position:relative;"><input inputmode="decimal" data-actinput="onGuideReading" data-f="' + esc(key) + '" data-key="' + esc(key) + '" value="' + esc(val) + '" placeholder="—" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px ' + (f.u ? '58' : '11') + 'px 11px 11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;">' + (f.u ? '<span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;">' + esc(f.u) + '</span>' : '') + '</div></div>';
      }).join('');
      var computedLine = '';
      // any playbook that records total + filtered COD gets the derived line
      // (sewage AND industrial today) — keyed off the declared fields, not the id
      var hasCod = g.fields.some(function (f) { return f.k === 'codt'; }) && g.fields.some(function (f) { return f.k === 'codf'; });
      if (hasCod) {
        var ct = App.parseNum(s.guideReadings[g.id + ':codt']), cf = App.parseNum(s.guideReadings[g.id + ':codf']);
        if (isFinite(ct) && isFinite(cf)) {
          var pc = ct - cf;
          computedLine = pc >= 0
            ? '<div style="margin-top:10px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12px;color:#17564C;"><b>Particulate COD ≈ ' + App.fmt(pc, 0) + ' mg/L</b> (total − filtered) — the fraction coagulation captures readily.</div>'
            : '<div style="margin-top:10px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:10px;padding:10px 12px;font-size:12px;color:#8A3A24;">Filtered COD exceeds total COD — recheck one of the two readings.</div>';
        }
      }
      var clientOpts = '<option value="">— save to existing client —</option>' + v.clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.guideSaveClient ? ' selected' : '') + '>' + esc(c.name + ' · ' + (c.site || c.id)) + '</option>'; }).join('');
      // target select + name go through handlers that clear guideSaved: the
      // '✓ Saved' banner must never survive an edit it doesn't cover. The button
      // disables while guideSaved — that (not value-comparison) is the
      // double-tap guard; any edit re-enables it.
      var saveRow = '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<select data-actchange="onGuideProgSelect" data-f="guideSaveClient" data-key="guideSaveClient" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:10px;padding:11px 9px;font-size:14px;font-weight:600;color:#16211F;appearance:none;">' + clientOpts + '</select>' +
        '<input data-actinput="onGuideProgField" data-f="guideSaveName" data-key="guideSaveName" value="' + esc(s.guideSaveName) + '" placeholder="…or new client name" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px;font-size:14px;font-weight:400;">' +
        '</div>' +
        '<div style="margin-top:10px;display:grid;gap:8px;"><label>Observation date (leave blank if unknown)<input type="date" data-actinput="onGuideProgField" data-f="guideObservedDate" data-key="guideObservedDate" value="' + esc(s.guideObservedDate) + '" style="display:block;width:100%;min-height:44px;font-size:16px;padding:8px;"></label><label>Observation time (24-hour; unknown if blank)<input type="time" data-actinput="onGuideProgField" data-f="guideObservedTime" data-key="guideObservedTime" value="' + esc(s.guideObservedTime) + '" style="display:block;width:100%;min-height:44px;font-size:16px;padding:8px;"></label><label>UTC offset at observation (explicit; e.g. +10:00)<input type="text" data-actinput="onGuideProgField" data-f="guideObservedOffset" data-key="guideObservedOffset" value="' + esc(s.guideObservedOffset) + '" placeholder="+10:00" style="display:block;width:100%;min-height:44px;font-size:16px;padding:8px;"></label><div style="font-size:12px;color:#56635B;">Enter the offset where/when sampled, including daylight saving. Saving records the save time separately; it never supplies an unknown observation time.</div></div>' +
        '<button data-act="saveGuideReadings" ' + (s.guideSaved ? 'disabled ' : '') + 'style="margin-top:9px;width:100%;border:1px solid ' + (s.guideSaved ? '#C9D2CD' : '#087568') + ';cursor:pointer;background:#FFF;color:' + (s.guideSaved ? '#B4BBB4' : '#087568') + ';border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save readings to client</button>' +
        (s.guideSaveError ? '<div style="margin-top:8px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:10px;padding:9px 12px;font-size:12px;color:#8A3A24;font-weight:600;">' + esc(s.guideSaveError) + '</div>' : '') +
        (s.guideSaved ? '<div style="margin-top:8px;background:#ECF7F3;border:1px solid #B8E0D3;border-radius:10px;padding:9px 12px;font-size:12px;color:#17564C;font-weight:600;">✓ Saved — observation details and separate save time are on the client card.</div>' : '');
      readingsHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;">Site readings</div>' +
        '<div style="font-size:12px;color:#56635B;margin:4px 0 11px;">From the plant visit. Save them against the client to build site history — repeat visits show what changed.</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + fieldCells + '</div>' + computedLine + saveRow + '</div>';
    }

    // Current dosing programme — what the plant runs today (product, rate, flow).
    // Grounded: window check against the library datasheet range, consumption is
    // flow × dose arithmetic; both save to the client with the readings.
    var progHtml = '';
    if (g.fields && g.fields.length) {
      var prog = App.computeProg();
      var unitSel = '<select data-actchange="onGuideProgSelect" data-f="guideProgDoseUnit" data-key="guideProgDoseUnit" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 26px 0 10px;font-size:12px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 9px center;">' +
        (['mgL','kgt','gt'].indexOf(s.guideProgDoseUnit) < 0 ? '<option value="" selected>Confirm unit</option>' : '') + optionTags(App.DOSE_UNITS, s.guideProgDoseUnit, 'v', 'label') + '</select>';
      var flowSel = '<select data-actchange="onGuideProgSelect" data-f="guideProgFlowUnit" data-key="guideProgFlowUnit" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 26px 0 10px;font-size:12px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 9px center;">' +
        (!isFinite(App.flowFactor(s.guideProgFlowUnit)) ? '<option value="" selected>Confirm unit</option>' : '') + optionTags(App.FLOW_UNITS, s.guideProgFlowUnit, 'v', 'label') + '</select>';
      var winHtml = sourceInfo(prog.product, { key: 'guide-source' });
      if (prog.win) {
        // Display only: an abstention that is not the product's own (doseAbstention) comes from the programme entry.
        var productAbstain = prog.product ? App.doseAbstention(prog.product, s.guideId) : null;
        var entryAbstain = !!prog.win.abstain && !(productAbstain && productAbstain.reason === prog.win.reason && productAbstain.raw === prog.win.raw);
        var progDose = App.programmeDose(s.guideProgDose);
        winHtml += doseWindowBanner(prog.win, 'Their rate', {
          key: 'guide', entry: entryAbstain, entryReasonVisible: entryAbstain && !!s.guideProgRestoreError,
          value: progDose ? (progDose.range ? 'their rate' : App.fmt(progDose.lo) + ' ' + App.doseUnitLabel(s.guideProgDoseUnit)) : ''
        });
      } else if (prog.unitMismatch) {
        winHtml += doseWindowBanner({
          mismatch: true, name: (prog.product || {}).name || '',
          rawUnit: (prog.product || {}).doseUnit || '', note: (prog.product || {}).doseNote || ''
        }, 'The entered dose unit');
      }
      var consHtml = prog.hasCons ? '<div style="margin-top:9px;background:#16211F;border-radius:10px;padding:11px 13px;color:#EFECE3;">' +
        '<div style="display:flex;gap:22px;">' +
        '<div><div style="font-size:12px;color:#A6BEB3;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Product use</div><div style="font-size:16px;font-weight:600;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:#4FE0B5;white-space:nowrap;">' + esc(prog.kgH) + ' kg/h</div></div>' +
        '<div><div style="font-size:12px;color:#A6BEB3;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Per day</div><div style="font-size:16px;font-weight:600;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:#4FE0B5;white-space:nowrap;">' + esc(prog.kgDay) + ' kg</div></div>' +
        '</div>' +
        '<div style="margin-top:6px;font-size:12px;color:#9FB0AA;">' + esc(prog.consumptionBasis) + '</div></div>' : '<div role="note" style="margin-top:9px;">Consumption unavailable: ' + esc(prog.consumptionReason) + '</div>';
      var scalarHtml = App.programmeDose(s.guideProgDose) && App.programmeDose(s.guideProgDose).range ? '<label style="display:block;margin-top:10px;">Explicit scalar for calculator / retest (within endpoints; no midpoint assumed)<input inputmode="decimal" data-actinput="onGuideProgField" data-f="guideProgScalar" data-key="guideProgScalar" value="' + esc(s.guideProgScalar) + '" style="display:block;width:100%;padding:11px;font-size:16px;"></label>' : '';
      var progBtns = scalarHtml + '<div style="margin-top:11px;display:flex;gap:8px;">' +
        '<button data-act="guideProgToCalc" ' + (prog.canSend ? '' : 'disabled ') + 'style="flex:1;border:none;cursor:pointer;background:' + (prog.canSend ? '#087568' : '#C9D2CD') + ';color:#FFF;border-radius:11px;padding:12px 8px;font-size:14px;font-weight:700;">Send to calculator</button>' +
        '<button data-act="guideProgRetest" ' + (prog.canRetest ? '' : 'disabled ') + 'style="flex:1;border:1px solid ' + (prog.canRetest ? '#087568' : '#C9D2CD') + ';cursor:pointer;background:#FFF;color:' + (prog.canRetest ? '#087568' : '#B4BBB4') + ';border-radius:11px;padding:12px 8px;font-size:14px;font-weight:700;">Retest 50–150% in jars</button></div>' +
        (prog.canRetest ? '' : '<div style="margin-top:6px;font-size:12px;color:#526159;">Retest bracketing works on mg/L doses (jar tests dose on flow).</div>');
      progHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12px;font-weight:700;color:#4B564F;">Current dosing programme</div>' +
        '<div style="font-size:12px;color:#56635B;margin:4px 0 11px;">What the plant runs today — their product, scalar or ordered endpoints (e.g. 2–4 or 2 to 4), and flow. Saves with the readings; only checks a dose window when its chemical basis, units and context are confirmed. Enter as-supplied product mass only; active-ingredient rates must be converted externally using a verified active fraction, otherwise do not send or retest.</div>' +
        '<button data-act="newGuideProgramme" class="fa-btn" style="margin-bottom:10px;">New programme / clear live setup (keep history)</button>' +
        comboHtml({
          name: 'guideProduct', open: v.guideProgPickerOpen, query: v.guideProgPickerQuery, setKey: 'guideProgPickerQuery',
          toggleAct: 'toggleGuideProgPicker', pickAct: 'pickGuideProgProduct',
          selectedLabel: v.selectedGuideProgLabel, hasSelection: !!s.guideProgProductId,
          includeNone: true, noneLabel: '— not in library / unknown —', searchPlaceholder: 'Search product, brand or charge…',
          items: v.filteredGuideProgProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.guideProgProductId }; })
        }) +
        '<div style="margin-top:6px;font-size:12px;color:#526159;">Product not listed? Add it under Products → “Add your own product”, then pick it here.</div>' +
        '<div style="margin-top:10px;display:flex;flex-direction:column;gap:10px;">' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Current dose rate (as-supplied product)</div>' +
            '<label>Chemical mass basis <select data-actchange="onGuideProgSelect" data-f="guideProgMassBasis" data-key="guideProgMassBasis">' + optionTags([{v:'unknown',label:'Unknown — no dose transfer'},{v:'active',label:'Active ingredient — conversion not available'},{v:'as-supplied',label:'Confirmed as-supplied product mass'}], s.guideProgMassBasis, 'v', 'label') + '</select></label>' +
            '<div style="display:flex;border:1px solid #D8D2C4;border-radius:10px;background:#FBF9F4;overflow:hidden;"><input inputmode="decimal" data-actinput="onGuideProgField" data-f="guideProgDose" data-key="guideProgDose" value="' + esc(s.guideProgDose) + '" placeholder="—" style="flex:1;min-width:0;border:none;background:transparent;padding:11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;">' + unitSel + '</div></div>' +
          '<div><div style="font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;">Plant / feed flow</div>' +
            '<div style="display:flex;border:1px solid #D8D2C4;border-radius:10px;background:#FBF9F4;overflow:hidden;"><input inputmode="decimal" data-actinput="onGuideProgField" data-f="guideProgFlow" data-key="guideProgFlow" value="' + esc(s.guideProgFlow) + '" placeholder="—" style="flex:1;min-width:0;border:none;background:transparent;padding:11px;font-size:16px;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;">' + flowSel + '</div></div>' +
        '</div>' + (s.guideProgDoseUnit === 'kgt' || s.guideProgDoseUnit === 'gt' ? '<div style="margin-top:10px;display:grid;gap:8px;"><label>Slurry density (kg/L; explicit measured value)<input inputmode="decimal" data-actinput="onGuideProgField" data-f="guideProgSludgeDensity" data-key="guideProgSludgeDensity" value="' + esc(s.guideProgSludgeDensity) + '" style="width:100%;padding:11px;font-size:16px;"></label><label>Dry solids (% w/w; explicit measured value)<input inputmode="decimal" data-actinput="onGuideProgField" data-f="guideProgDs" data-key="guideProgDs" value="' + esc(s.guideProgDs) + '" style="width:100%;padding:11px;font-size:16px;"></label></div>' : '') + winHtml + (prog.rangeWin ? doseWindowBanner(prog.rangeWin, 'Upper endpoint', { key: 'guide-range' }) : '') + consHtml + progBtns + '</div>';
    }

    var tdiHtml = '<div role="note" style="margin-top:12px;padding:12px;border:1px dashed #D8D2C4;">No validated TDI model is available for this market. Use descriptive measurements and site testing; potable bands are not reused.</div>';
    if (g.tdi) {
      var tdi = App.computeTdi(g.id);
      var flagRows = tdi.rows.map(function (r) {
        return '<div style="background:' + r.bg + ';border-radius:10px;padding:9px 12px;">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;"><span style="font-size:12px;font-weight:700;color:' + r.fg + ';">' + esc(r.label) + '</span><span style="font-size:12px;font-weight:700;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;color:' + r.fg + ';flex-shrink:0;">' + esc(r.lvl) + '</span></div>' +
          '<div style="font-size:12px;color:' + r.fg + ';opacity:.85;margin-top:2px;">' + esc(r.note) + '</div></div>';
      }).join('');
      tdiHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="display:flex;align-items:center;gap:7px;"><div style="font-size:12px;font-weight:700;color:#4B564F;">Descriptive measurement snapshot (TDI)</div>' + vbadge('example') + '</div>' +
        '<div style="font-size:12px;color:#56635B;margin-top:4px;">Illustrative measurement bands only — not chemical demand, required dose or product selection. No validated predictive model is available here.</div>' +
        (tdi.invalid ? '<div role="alert" class="fa-note fa-note-error" style="margin-top:8px;">Invalid reading: use a plain non-negative decimal with a decimal point, no commas or grouping. Invalid readings are not banded.</div>' : '') +
        (tdi.hasAny ? '<div style="margin-top:11px;display:flex;flex-direction:column;gap:7px;">' + flagRows + '</div>' : '<div style="margin-top:11px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:10px;padding:11px 12px;font-size:12px;color:#526159;text-align:center;">Enter turbidity, UV254, alkalinity or pH above to see the flags.</div>') +
        (tdi.summary ? '<div style="margin-top:9px;background:#16211F;border-radius:10px;padding:10px 12px;font-size:12px;color:#DCE6E1;">' + esc(tdi.summary) + '</div>' : '') + '</div>';
    }

    var cautionsHtml = (g.cautions && g.cautions.length) ? ('<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">' + g.cautions.map(function (t) {
      return '<div style="background:#FBF6EC;border:1px solid #EBD9BC;border-radius:12px;padding:11px 13px;font-size:12px;color:#6B5A38;"><b style="color:#8A5E17;">Caution.</b> ' + esc(t) + '</div>';
    }).join('') + '</div>') : '';

    var productBtns = (g.products || []).map(function (p) {
      return '<button data-act="guideToProducts" data-v="' + esc(p.filter) + '" style="width:100%;border:1px solid #087568;cursor:pointer;background:#FFF;color:#087568;border-radius:13px;padding:13px;font-size:14px;font-weight:700;">' + esc(p.label) + ' →</button>';
    }).join('');
    var actionBtns = (g.actions || []).map(function (a) {
      return '<button data-act="' + esc(a.act) + '" style="width:100%;border:none;cursor:pointer;background:#087568;color:#FFF;border-radius:13px;padding:13px;font-size:14px;font-weight:700;">' + esc(a.label) + '</button>';
    }).join('');
    var linksHtml = (productBtns || actionBtns) ? '<div style="margin-top:14px;display:flex;flex-direction:column;gap:9px;">' + actionBtns + productBtns + '</div>' : '';

    return '<div style="padding:18px 18px 30px;">' +
      '<button data-act="backToGuide" style="border:none;background:none;cursor:pointer;color:#087568;font-size:14px;font-weight:600;display:flex;align-items:center;gap:5px;margin-bottom:14px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#087568" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg> Playbooks</button>' +
      '<div style="display:flex;gap:14px;align-items:center;">' +
        '<div style="width:56px;height:56px;flex-shrink:0;border-radius:15px;background:' + esc(g.tint) + ';display:flex;align-items:center;justify-content:center;font-family:ui-monospace, SFMono-Regular, Consolas, monospace;font-weight:600;font-size:14px;color:' + esc(g.tintText === '#B05A28' ? '#8A451D' : g.tintText) + ';">' + esc(g.tag) + '</div>' +
        '<div style="min-width:0;"><div style="font-size:20px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;">' + esc(g.name) + '</div><div style="font-size:12px;color:#56635B;margin-top:2px;">' + esc(g.mech) + '</div></div></div>' +
      '<div style="margin-top:13px;font-size:14px;color:#333E39;">' + esc(g.intro) + '</div>' +
      outputsHtml + measureHtml + readingsHtml + progHtml + tdiHtml + subsHtml + endpointsHtml + doseHtml + benchHtml + cautionsHtml + linksHtml +
      guideSrcNote('Not a substitute for jar or bench testing.') +
    '</div>';
  };

  // ============================ CALCULATOR: polymer dose solver ==============
  // Built only from existing components (markup/style strings copied verbatim from their source screens):
  //   Dose page: top-level field block, caption, flow input + embedded unit select (+ "used in calc" line),
  //     white field with suffix, cards (Feed preparation / Dosing pump), in-card cream fields, label-wrapped
  //     select, "Show pump flow in" row, Results panel (header + resCell + rowKV rows), warning stack,
  //     "How this works" and "Basis & assumptions" notes.
  //   Jars: intro text, list heading, row cards, "+ Add jar" / "– Remove last" buttons, step-list panel.
  //   Clients: backup Save/Copy pair (share/copy action) and the "Restore from a backup…" disclosure toggle.
  // Every numeric input is inputmode=decimal (16px via the global token); every control has an exact name.
  var PC_MONO = 'font-family:ui-monospace, SFMono-Regular, Consolas, monospace;';
  var PC_CAP_TOP = 'font-size:12px;font-weight:700;color:#4B564F;margin-bottom:5px;';      // Dose sludge/conc block caption
  var PC_CAP_CARD = 'font-size:12px;font-weight:700;color:#4B564F;margin-bottom:4px;';     // Dose Feed preparation caption
  var PC_CARD = 'background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;'; // Dose cards
  var PC_CARD_HEAD = 'font-size:12px;font-weight:700;color:#4B564F;margin-bottom:10px;';   // Dose card heading
  var PC_SUFFIX = 'position:absolute;top:50%;transform:translateY(-50%);font-size:12px;color:#526159;font-weight:600;';
  var PC_HELP = 'font-size:12px;color:#56635B;margin-top:6px;';                             // Dose pump-capacity helper
  var PC_JAR_BTN = 'flex:1;border:1px solid #D8D2C4;background:#FFF;cursor:pointer;border-radius:11px;padding:11px;font-size:14px;font-weight:700;'; // Jars add/remove
  var PC_BACKUP_BTN = 'flex:1;border:1px solid #087568;cursor:pointer;background:#FFF;color:#087568;border-radius:11px;padding:11px 8px;font-size:14px;font-weight:700;'; // Clients backup pair
  var PC_DISCLOSURE = 'margin-top:9px;width:100%;border:1px dashed #D8D2C4;cursor:pointer;background:#FBF9F4;color:#16211F;border-radius:11px;padding:10px;font-size:14px;font-weight:600;min-height:44px;'; // Clients restore toggle (+44px target)
  function pcSuffixPad(suffix, base) { return { '%': 34, '% DS': 44, '% w/v': 58, 'kg/L': 44, 'kg': 40, 'L': 34, 'h/day': 52, 'kg/t DS': 64 }[suffix] || base; }
  // Calculator message stack: a field not yet entered or chosen is a neutral prompt (Dose page fa-help note);
  // an entered value that cannot be used is a red error naming the field.
  function pcMsg(e) { return e.prompt ? '<div role="note" class="fa-help">' + esc(e.text) + '</div>' : '<div role="alert" class="fa-note fa-note-error">' + esc(e.text) + '</div>'; }
  // Make-down 'Strength from' method + its own inputs (sludge 'pc' / water 'wt' state; never mixed)
  function pcStrengthFields(k, s, r, solved) {
    var from = s[k + 'StrengthFrom'], F4 = function (n) { return App.pcFmt(n, 4); }, x = r.v;
    var html = pcLabelSelect('Strength from', k + 'StrengthFrom', App.PC_STRENGTH_FROM, from, 'Strength from');
    if (from === 'strength') {
      html += solved
        ? '<div style="' + PC_HELP + '">Batch strength is being solved: the required % w/v as made down is a result.</div>'
        : '<div style="margin-top:10px;"><div style="' + PC_CAP_CARD + '">Solution strength (% w/v)</div>' + pcCardInput(k + 'SolStrength', s[k + 'SolStrength'], 'Solution strength (% w/v)', '% w/v') + '</div>' +
          '<div style="' + PC_HELP + '">' + esc(App.PC_STRENGTH_HELP) + '</div>' +
          (r.ok ? '<div data-pc-help style="' + PC_HELP + '">= ' + esc(F4(k === 'pc' ? x.c : x.conc)) + ' kg/L · ' + esc(F4((k === 'pc' ? x.c : x.conc) * 1000)) + ' kg per 1000 L</div>' : '');
    } else if (from === 'batch') {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;margin-top:10px;">' +
          (solved ? '' : '<div><div style="' + PC_CAP_CARD + '">Neat product per batch</div>' + pcCardInput(k + 'BatchKg', s[k + 'BatchKg'], 'Neat product per batch (kg)', 'kg') + '</div>') +
          '<div><div style="' + PC_CAP_CARD + '">Batch water volume</div>' + pcCardInput(k + 'BatchL', s[k + 'BatchL'], 'Batch water volume (L)', 'L') + '</div></div>' +
        (r.ok ? (k === 'pc' ? '<div data-pc-help style="' + PC_HELP + '">= ' + esc(F4(x.c)) + ' kg/L · ' + esc(F4(x.cPctWV)) + ' % w/v · ' + esc(F4(x.kgPer1000)) + ' kg per 1000 L</div>'
          : '<div data-pc-help style="' + PC_HELP + '">= ' + esc(F4(x.conc)) + ' kg/L · ' + esc(F4(x.conc * 100)) + ' % w/v</div>') : '');
    }
    return html;
  }
  // white top-level field (Dose "Dry solids" / "Polymer dose")
  function pcTopInput(key, val, aria, suffix, text) {
    return '<div style="position:relative;"><input ' + (text ? '' : 'inputmode="decimal" ') + 'autocomplete="off" data-set="' + key + '" data-key="' + key + '" aria-label="' + esc(aria) + '" value="' + esc(val) + '"' + (text ? ' placeholder="' + esc(text) + '"' : '') + ' style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px ' + (suffix ? pcSuffixPad(suffix, 44) + 'px' : '13px') + ' 13px 13px;font-size:16px;' + (text ? '' : PC_MONO) + 'font-weight:600;">' +
      (suffix ? '<span style="' + PC_SUFFIX + 'right:13px;">' + suffix + '</span>' : '') + '</div>';
  }
  // cream in-card field (Dose "Solution strength" / "Neat density")
  function pcCardInput(key, val, aria, suffix, act, i) {
    var bind = act ? 'data-actinput="' + act + '"' + (i != null ? ' data-i="' + i + '"' : '') : 'data-set="' + key + '"';
    return '<div style="position:relative;"><input inputmode="decimal" autocomplete="off" ' + bind + ' data-key="' + key + '" aria-label="' + esc(aria) + '" value="' + esc(val) + '" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px ' + pcSuffixPad(suffix, 34) + 'px 11px 11px;font-size:16px;' + PC_MONO + 'font-weight:600;">' +
      '<span style="' + PC_SUFFIX + 'right:11px;">' + suffix + '</span></div>';
  }
  // embedded unit select (Dose flowUnitSel / pumpUnitSel): "Confirm unit" only while no unit is chosen
  function pcUnitSelect(key, list, cur, aria) {
    var known = !!App.pcOption(list, cur);
    return '<select data-set="' + key + '" data-key="' + key + '" aria-label="' + esc(aria) + '" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 30px 0 13px;font-size:14px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 11px center;">' +
      (known ? '' : '<option value="" selected>Confirm unit</option>') + list.map(function (x) { return '<option value="' + esc(x.v) + '"' + (x.v === cur ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select>';
  }
  // label-wrapped select (Dose "Feed basis")
  function pcLabelSelect(caption, key, list, cur, aria, act, i, placeholder) {
    var bind = act ? 'data-actchange="' + act + '"' + (i != null ? ' data-i="' + i + '"' : '') : 'data-set="' + key + '"';
    var known = !!App.pcOption(list, cur);
    if (!known && placeholder && !cur) return '<label>' + caption + ' <select ' + bind + ' data-key="' + key + '" aria-label="' + esc(aria) + '" style="width:100%;"><option value="" selected>' + esc(placeholder) + '</option>' +
      list.map(function (x) { return '<option value="' + esc(x.v) + '">' + esc(x.label) + '</option>'; }).join('') + '</select></label>';
    // width:100% only matters for short-option selects, which styleNativeControls leaves unwrapped (its
    // .fa-select-field rule gives the same 100% width to every select with an option longer than 8 characters).
    return '<label>' + caption + ' <select ' + bind + ' data-key="' + key + '" aria-label="' + esc(aria) + '" style="width:100%;">' + (known ? '' : '<option value="" selected>Not recognised</option>') +
      list.map(function (x) { return '<option value="' + esc(x.v) + '"' + (x.v === cur ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></label>';
  }
  // Shared pump-row component (Jars row cards): k = state/key prefix ('pc' sludge, 'wt' water), A = handler infix.
  function pumpCards(rows, unitCode, k, A) {
    var unit = App.pumpFlowLabel(unitCode) || 'unit';
    return rows.map(function (r, i) {
      var n = i + 1, standby = r && r.status === 'standby';
      return '<div data-' + k + '-pump-row="' + i + '" style="background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:12px 13px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="font-size:14px;font-weight:700;white-space:nowrap;flex-shrink:0;">Pump ' + n + '</div>' +
        (standby ? '<div style="font-size:12px;color:#526159;min-width:0;">excluded from the total</div>' : '') +
        (rows.length > 1 ? '<button type="button" data-act="remove' + A + 'Pump" data-i="' + i + '" aria-label="Remove pump ' + n + '" style="margin-left:auto;' + PC_JAR_BTN + 'flex:0 0 auto;color:#56635B;">– Remove</button>' : '') + '</div>' +
        // two columns while each can show "Standby/off" unclipped (>=140px); below ~354px viewport they stack
        '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;align-items:start;">' +
          '<div><div style="' + PC_CAP_TOP + '">Flow</div>' + pcCardInput(k + 'Pump-' + i, r ? r.flow : '', 'Pump ' + n + ' flow', unit, 'on' + A + 'Pump', i) + '</div>' +
          '<div>' + pcLabelSelect('Status', k + 'PumpStatus-' + i, App.PC_PUMP_STATUS, r ? r.status : '', 'Pump ' + n + ' status', 'on' + A + 'PumpStatus', i) + '</div>' +
        '</div></div>';
    }).join('');
  }
  function pcPumpCards(s) { return pumpCards(s.pcPumps, s.pcPumpUnit, 'pc', 'Pc'); }
  // Calculator mode switch: the Dose page segmented mode switch, with group/pressed semantics and exact names.
  function ccModeSwitch(mode) {
    var sub = '<div style="font-size:12px;font-weight:400;opacity:1;">';
    return '<div data-cc-mode role="group" aria-label="Calculator mode" style="display:flex;background:#E4DFD3;border-radius:12px;padding:3px;gap:3px;">' +
      '<button type="button" data-act="onCcSludge" aria-pressed="' + (mode !== 'water') + '" aria-label="Sludge dewatering (kg/t DS)" style="' + css(App.segStyle(mode !== 'water')) + '">Sludge dewatering' + sub + 'kg/t DS</div></button>' +
      '<button type="button" data-act="onCcWater" aria-pressed="' + (mode === 'water') + '" aria-label="Potable water (mg/L)" style="' + css(App.segStyle(mode === 'water')) + '">Potable water' + sub + 'mg/L</div></button></div>';
  }
  function pcResCell(label, val, sub, attrs) {   // Dose resCell
    attrs = attrs || {};
    return '<div><div' + (attrs.label || '') + ' style="font-size:12px;color:#A6BEB3;font-weight:600;">' + esc(label) + '</div>' +
      '<div' + (attrs.value || '') + ' style="' + PC_MONO + 'font-size:24px;line-height:1.25;font-weight:600;color:#4FE0B5;letter-spacing:-0.01em;overflow-wrap:anywhere;word-wrap:break-word;">' + esc(val) + '</div>' +
      '<div' + (attrs.sub || '') + ' style="font-size:12px;color:#9FB0AA;">' + esc(sub) + '</div>' + (attrs.extra || '') + '</div>';
  }
  App.screens.calculator = function (v) {
    var water = App.state.ccMode === 'water';
    return '<div style="padding:22px 18px 30px;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#087568;font-weight:700;">Calculator</div>' +
      // Dose page header: eyebrow, title, then the mode switch. Both mode titles fit one line from 320px, so the
      // switch sits exactly where the Dose page switch sits and never moves when the mode changes.
      '<div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;margin:2px 0 12px;">' + (water ? 'Dose — potable water' : 'Polymer dose — sludge') + '</div>' +
      ccModeSwitch(App.state.ccMode) +
      (water ? waterBody(v) : sludgeBody(v)) + '</div>';
  };
  function sludgeBody(v) {
    var s = App.state, r = v.pc, solve = s.pcSolve, x = r.v, F4 = function (n) { return App.pcFmt(n, 4); };
    var sUnit = App.pcOption(App.PC_SLUDGE_UNITS, s.pcSludgeUnit), pUnit = App.pumpUnitOf(s.pcPumpUnit);
    // ---- top-level sludge fields (Dose sludge block) ----
    var flowField = solve !== 'sludge'
      ? '<div><div style="' + PC_CAP_TOP + '">Sludge flow</div><div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FFF;overflow:hidden;"><input inputmode="decimal" autocomplete="off" data-set="pcSludgeFlow" data-key="pcSludgeFlow" aria-label="Sludge flow" value="' + esc(s.pcSludgeFlow) + '" style="flex:1;min-width:0;border:none;background:transparent;padding:13px;font-size:16px;' + PC_MONO + 'font-weight:600;">' + pcUnitSelect('pcSludgeUnit', App.PC_SLUDGE_UNITS, s.pcSludgeUnit, 'Sludge flow unit') + '</div>' +
        (r.ok && sUnit && sUnit.v !== 'Lh' ? '<div style="font-size:12px;color:#526159;margin-top:5px;' + PC_MONO + '">= ' + esc(F4(x.qsLh)) + ' L/h used in calc</div>' : '') + '</div>'
      : '<div>' + pcLabelSelect('Sludge flow unit', 'pcSludgeUnit', App.PC_SLUDGE_UNITS, s.pcSludgeUnit, 'Sludge flow unit', null, null, 'Confirm unit') + '<div style="' + PC_HELP + '">Sludge flow is being solved; the result is shown in this unit.</div></div>';
    var dsCell = solve !== 'ds' ? '<div><div style="' + PC_CAP_TOP + '">Dry solids (%)</div>' + pcTopInput('pcDs', s.pcDs, 'Dry solids (%)', '% DS') + '</div>' : '';
    var doseCell = solve !== 'dose' ? '<div><div style="' + PC_CAP_TOP + '">Target dose</div>' + pcTopInput('pcDose', s.pcDose, 'Target dose (kg product per t DS)', 'kg/t DS') + '</div>' : '';
    var topBlock = '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' + flowField +
      ((dsCell || doseCell) ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;">' + dsCell + doseCell + '</div>' : '') +
      '<div><div style="' + PC_CAP_TOP + '">DS sample location (optional)</div>' + pcTopInput('pcDsLocation', s.pcDsLocation, 'DS sample location (optional)', '', 'e.g. press feed, thickener, digester') + '</div>' +
      '<div style="' + PC_HELP + 'margin-top:0;">Dry solids is % w/w of the wet sludge' + (solve === 'ds' ? ' and is being solved' : '') + '. Use DS from the same point as the sludge flow (normally the press feed).</div></div>';
    // ---- Make-down card (Dose Feed preparation card): 'Strength from' method, then product form and active content ----
    var byStrength = s.pcStrengthFrom === 'strength', byBatch = s.pcStrengthFrom === 'batch';
    var makeCard = '<div style="margin-top:14px;' + PC_CARD + '"><div style="' + PC_CARD_HEAD + '">Make-down</div>' +
      pcStrengthFields('pc', s, r, solve === 'batch') +
      '<div style="margin-top:10px;">' + pcLabelSelect('Product form', 'pcForm', App.PC_FORMS, s.pcForm, 'Product form') + '</div>' +
      '<div style="margin-top:10px;"><div style="' + PC_CAP_CARD + '">Active content of neat product (%, optional, from supplier TDS/CoA)</div>' + pcCardInput('pcActive', s.pcActive, 'Active content of neat product (%, optional, from supplier TDS/CoA)', '%') +
        '<div style="' + PC_HELP + '">Not your solution strength.</div>' +
        (r.activeHint ? '<div role="note" class="fa-help" data-pc-active-hint style="margin-top:6px;">' + esc(r.activeHint) + '</div>' : '') + '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#526159;">' + (solve === 'batch' && byBatch ? 'Batch strength is being solved: kg of product per batch is a result. ' : '') +
        (byBatch ? 'kg per L of batch water is treated as kg per L of solution (negligible at field strengths). ' : byStrength ? 'Solution strength is % w/v as made down: 1 % w/v = 10 g per L = 0.01 kg/L. ' : '') +
        'The dose is kg of product as made down; no active fraction is assumed for any form. Active content is optional: enter the neat product\u2019s active % from the supplier TDS/CoA to also see kg active.</div></div>';
    // ---- Pumps card (Dose Dosing pump card) + pump rows (Jars list) ----
    // required unit: the stacked label-wrapped field (as Reading type), never an inline caption beside a narrow select
    var pumpUnitRow = '<div style="margin-top:10px;">' + pcLabelSelect('Pump flow unit', 'pcPumpUnit', App.PUMP_FLOW_UNITS, s.pcPumpUnit, 'Pump flow unit', null, null, 'Confirm unit') + '</div>';
    var pumpsCard = '<div style="margin-top:12px;' + PC_CARD + '"><div style="' + PC_CARD_HEAD + '">Polymer pumps</div>' +
      (solve === 'flow'
        ? '<div style="' + PC_HELP + 'margin-top:0;">The total running polymer solution flow is being solved — no per-pump split; pump readings are not used. The result is shown in the pump flow unit.</div>' + pumpUnitRow
        : pcLabelSelect('Reading type', 'pcReading', App.PC_READING, s.pcReading, 'Pump reading type') + pumpUnitRow +
          (s.pcReading !== 'measured' ? '<div style="' + PC_HELP + '">Not a measured reading: verify actual delivery by drawdown or catch test.</div>' : '') +
          '<div style="' + PC_HELP + '">Only Running pumps are summed; Standby/off rows stay listed but are excluded. Rows: ' + s.pcPumps.length + ' of ' + App.PC_MAX_PUMPS + '.' + (r.ok ? ' Running total ' + esc(App.pcFmt(r.pumpsRunningEntered, 6)) + ' ' + esc(pUnit.label) + ' = ' + esc(F4(x.qpLh)) + ' L/h.' : '') + '</div>') + '</div>';
    var pumpList = solve === 'flow' ? '' :
      '<div style="margin-top:15px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#56635B;">Pumps</div><div style="font-size:12px;color:#526159;">' + (isFinite(r.pumpsRunning) ? r.pumpsRunning : 0) + ' of ' + s.pcPumps.length + ' running</div></div>' +
      '<div style="margin-top:9px;display:flex;flex-direction:column;gap:10px;">' + pcPumpCards(s) + '</div>' +
      '<div style="margin-top:11px;display:flex;gap:9px;"><button type="button" data-act="addPcPump" style="' + PC_JAR_BTN + 'color:#16211F;"><span aria-hidden="true">+ </span>Add pump</button></div>' +
      (s.pcPumpMsg ? '<div data-pc-pump-msg role="status" class="fa-note" style="margin-top:8px;">' + esc(s.pcPumpMsg) + '</div>' : '');
    // ---- Advanced (disclosure + Dose card) ----
    var advanced = '<button type="button" data-act="togglePcAdvanced" aria-expanded="' + (s.pcShowAdvanced ? 'true' : 'false') + '" aria-controls="fa-pc-advanced" style="' + PC_DISCLOSURE + 'margin-top:14px;">Advanced: sludge SG and run hours</button>' +
      (s.pcShowAdvanced ? '<div id="fa-pc-advanced" style="margin-top:12px;' + PC_CARD + '"><div style="' + PC_CARD_HEAD + '">Advanced</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;">' +
          '<div><div style="' + PC_CAP_CARD + '">Sludge SG</div>' + pcCardInput('pcSg', s.pcSg, 'Sludge SG (kg/L)', 'kg/L', 'onPcSg') + '</div>' +
          '<div><div style="' + PC_CAP_CARD + '">Run hours per day</div>' + pcCardInput('pcHours', s.pcHours, 'Run hours per day', 'h/day') + '</div></div>' +
        '<div style="margin-top:8px;font-size:12px;color:#526159;">SG is prefilled 1.0 and labelled assumed in the results until you change it. Run hours are used only for the daily totals.</div></div>' : '');
    // ---- Results panel (Dose) ----
    var grid = '', rows = '';
    if (r.ok) {
      if (solve !== 'dose') grid += pcResCell('Dose', F4(x.dose), 'kg product / t DS (target)');
      if (solve !== 'ds') grid += pcResCell('Dry solids load', F4(x.tdsH), 't DS/h · ' + F4(x.kgDsH) + ' kg DS/h'); else grid += pcResCell('Dry solids load', F4(x.tdsH), 't DS/h · ' + F4(x.kgDsH) + ' kg DS/h');
      if (solve !== 'flow') grid += pcResCell('Solution flow', F4(x.qpLh), 'L/h running total' + (pUnit && pUnit.v !== 'Lh' ? ' · ' + F4(x.qpUnitValue) + ' ' + pUnit.label : ''));
      grid += pcResCell('Product', F4(x.productKgH), 'kg/h · ' + (isFinite(x.productKgDay) ? F4(x.productKgDay) + ' kg/day (' + s.pcHours.trim() + ' h)' : 'kg/day not calculated'));
      grid += pcResCell('Solution : sludge', F4(x.ratioPct), '% of sludge flow');
      if (solve !== 'sludge') rows += rowKV('Sludge flow', F4(x.qsLh) + ' L/h', '#EFECE3');
      rows += rowKV('Sludge flow (m³/h)', F4(x.qsM3h), '#EFECE3');
      if (solve !== 'flow') rows += rowKV('Pumps', r.pumpsRunning + ' of ' + r.pumpsTotal + ' pumps running', '#EFECE3');
      rows += rowKV('Strength', F4(x.c) + ' kg/L', '#EFECE3');
      rows += rowKV('Strength (w/v)', F4(x.cPctWV) + ' % w/v', '#EFECE3');
      if (solve === 'batch' && byBatch) rows += rowKV('Per batch', F4(x.batchKg) + ' kg / ' + s.pcBatchL.trim() + ' L', '#4FE0B5');
      if (byBatch) rows += rowKV('Batches per day', isFinite(x.batchesDay) ? F4(x.batchesDay) + ' × ' + s.pcBatchL.trim() + ' L' : '—', '#EFECE3'); // no batch volume in strength mode
      if (isFinite(x.activeDose)) { rows += rowKV('Active dose', F4(x.activeDose) + ' kg active/t DS', '#4FE0B5'); rows += rowKV('Active', F4(x.activeKgH) + ' kg active/h', '#EFECE3'); }
    }
    rows += rowKV('Sludge SG', s.pcSg.trim() + ' kg/L' + (!s.pcSgEntered && s.pcSg.trim() === '1.0' ? ' (assumed)' : ''), '#EFECE3');
    var reading = App.pcOption(App.PC_READING, s.pcReading), form = App.pcOption(App.PC_FORMS, s.pcForm);
    var results = '<div data-pc-results style="margin-top:18px;background:#16211F;border-radius:18px;padding:18px 17px;color:#EFECE3;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><div data-pc-results-label style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Results</div><div style="width:8px;height:8px;border-radius:50%;background:' + (r.ok ? (r.warnings.length ? '#E86A4A' : '#4FE0B5') : '#4A5A54') + ';"></div></div>' +
      pcResCell(r.headline.label, r.headline.text, r.headline.unit, { label: ' data-pc-headline-label', value: ' data-pc-headline-value', sub: ' data-pc-headline-unit', extra: r.headline.precise ? '<div data-pc-headline-precise style="font-size:12px;color:#9FB0AA;">More precisely: ' + esc(r.headline.precise) + '</div>' : '' }) +
      (grid ? '<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px 12px;">' + grid + '</div>' : '') +
      '<div style="margin-top:15px;padding-top:14px;border-top:1px solid #2C3B37;display:flex;flex-direction:column;gap:7px;">' + rows + '</div>' +
      '<div style="margin-top:10px;font-size:12px;color:#9FB0AA;">' + (solve !== 'flow' ? 'Reading type: ' + esc(reading ? reading.label : 'Not recognised') + ' · ' : '') + 'Product form: ' + esc(form ? form.label : 'Not recognised') + ' · DS sample location: ' + esc(s.pcDsLocation.trim() || 'not recorded') + '</div>' +
      (r.ok && r.strengthUsed ? '<div data-pc-strength-used style="margin-top:6px;font-size:12px;color:#9FB0AA;">' + esc(r.strengthUsed) + '</div>' : '') + '</div>';
    // ---- abstentions / flags (Dose warning stack; fa-note classes have identical computed styles) ----
    var errHtml = '<div data-pc-errors' + (r.errors.length ? ' style="margin-top:12px;display:flex;flex-direction:column;gap:8px;"' : '') + '>' + r.errors.map(pcMsg).join('') + '</div>';
    var flagHtml = (r.warnings.length || r.cautions.length) ? '<div data-pc-flags style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">' + r.warnings.map(function (w) { return '<div role="status" class="fa-note">' + esc(w.text) + '</div>'; }).join('') + r.cautions.map(function (t) { return '<div role="status" class="fa-note">' + esc(t) + '</div>'; }).join('') + '</div>' : '';
    var notesHtml = r.notes.map(function (t) { return '<div style="' + PC_HELP + '">' + esc(t) + '</div>'; }).join('');
    // ---- Show working (Clients disclosure + Jars step-list panel) ----
    var working = '<button type="button" data-act="togglePcWorking" aria-expanded="' + (s.pcShowWorking ? 'true' : 'false') + '" aria-controls="fa-pc-working" style="' + PC_DISCLOSURE + 'margin-top:14px;">Show working</button>' +
      (s.pcShowWorking ? '<div id="fa-pc-working" data-pc-working style="margin-top:12px;background:#16211F;border-radius:12px;padding:13px 14px;color:#EFECE3;">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M15 14v4"/></svg><div data-pc-working-title style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Working — each step with the actual numbers</div></div>' +
        (r.ok ? '<ol style="margin:0;padding-left:17px;display:flex;flex-direction:column;gap:6px;">' + r.working.map(function (t) { return '<li style="font-size:12px;color:#DCE6E1;overflow-wrap:anywhere;word-wrap:break-word;">' + esc(t) + '</li>'; }).join('') + '</ol>'
          : '<div style="font-size:12px;color:#DCE6E1;">The working appears when every required input is valid.</div>') + '</div>' : '');
    // ---- Share / copy (Clients backup pair) ----
    var share = '<div style="display:flex;gap:9px;margin-top:14px;"><button type="button" data-act="sharePcResults" style="' + PC_BACKUP_BTN + 'background:#087568;color:#FFF;">Share results</button><button type="button" data-act="copyPcResults" style="' + PC_BACKUP_BTN + '">Copy results</button></div>' +
      (s.pcShareMsg ? '<div role="status" class="fa-note-text" style="margin-top:10px;">' + esc(s.pcShareMsg) + '</div>' : '') +
      (s.pcShareText ? '<textarea readonly data-key="pcShareText" aria-label="Results text (select all and copy)" style="margin-top:9px;width:100%;height:110px;border:1px solid #D8D2C4;border-radius:10px;padding:9px;' + PC_MONO + 'font-size:12px;background:#FBF9F4;color:#16211F;">' + esc(s.pcShareText) + '</textarea>' +
        '<div style="margin-top:9px;display:flex;gap:9px;"><button type="button" data-act="dismissPcShareText" style="' + PC_JAR_BTN + 'color:#56635B;">Hide text</button></div>' : '');
    return '<div style="margin-top:12px;font-size:14px;color:#56635B;">kg of product (as made down) per tonne of dry solids. Choose what to solve for; every other field is required. Nothing here is saved.</div>' +
      '<div style="margin-top:14px;">' + pcLabelSelect('Solve for', 'pcSolve', App.PC_SOLVE, solve, 'Solve for') + '</div>' +
      topBlock + makeCard + pumpsCard + pumpList + advanced + results + errHtml + flagHtml + notesHtml + working + share +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12px;color:#56635B;"><b style="color:#16211F;">How this works.</b> Dose (kg product/t DS) = 1000 × running solution flow (L/h) × strength (kg/L = % w/v × 0.01) ÷ (sludge flow (L/h) × SG (kg/L) × DS % ÷ 100). Flows are converted to L/h first; results are rounded for display only.</div>' +
      '<div style="margin-top:10px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:12px;padding:13px 14px;font-size:12px;color:#6B5A38;"><b style="color:#8A5E17;">Basis &amp; assumptions.</b> Dose is on an <b>as-made-down product</b> basis, not active polymer, unless you enter active content. No unit, density, active fraction or dosing window is assumed. The 1–8 kg product/t DS (product basis) and 1–5 % checks are indicative belt-press guidance supplied by the user, not a specification or approval. Confirm pump delivery by drawdown or catch test.</div>';
  }

  // ============================ CALCULATOR mode 2: water treatment dose (mg/L) ==================
  // Same existing components as the sludge mode; none of the sludge-only fields, outputs or checks are rendered.
  function waterBody(v) {
    var s = App.state, r = v.wt, solve = s.wtSolve, x = r.v, F4 = function (n) { return App.pcFmt(n, 4); };
    var wUnit = App.pcOption(App.WT_WATER_UNITS, s.wtWaterUnit), pUnit = App.pumpUnitOf(s.wtPumpUnit), basis = App.pcOption(App.WT_BASIS, s.wtBasis);
    var have = r.ok || r.volOk;
    var flowField = solve !== 'water'
      ? '<div><div style="' + PC_CAP_TOP + '">Water flow</div><div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FFF;overflow:hidden;"><input inputmode="decimal" autocomplete="off" data-set="wtWaterFlow" data-key="wtWaterFlow" aria-label="Water flow" value="' + esc(s.wtWaterFlow) + '" style="flex:1;min-width:0;border:none;background:transparent;padding:13px;font-size:16px;' + PC_MONO + 'font-weight:600;">' + pcUnitSelect('wtWaterUnit', App.WT_WATER_UNITS, s.wtWaterUnit, 'Water flow unit') + '</div>' +
        (have && wUnit && wUnit.v !== 'Lh' ? '<div style="font-size:12px;color:#526159;margin-top:5px;' + PC_MONO + '">= ' + esc(F4(x.qwLh)) + ' L/h used in calc</div>' : '') + '</div>'
      : '<div>' + pcLabelSelect('Water flow unit', 'wtWaterUnit', App.WT_WATER_UNITS, s.wtWaterUnit, 'Water flow unit', null, null, 'Confirm unit') + '<div style="' + PC_HELP + '">Water flow is being solved; the result is shown in this unit.</div></div>';
    var topBlock = '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' + flowField +
      (solve !== 'dose' ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;"><div><div style="' + PC_CAP_TOP + '">Target dose</div>' + pcTopInput('wtDose', s.wtDose, 'Target dose (mg/L)', 'mg/L') + '</div></div>' : '') +
      '<div style="' + PC_HELP + 'margin-top:0;">Plant or water flow from telemetry. 1 ML/d = 1,000,000 L ÷ 24 h; 1 m³/d = 1000 L ÷ 24 h.</div></div>';
    // ---- Chemical card (Dose Feed preparation card) ----
    var chem = '<div style="margin-top:14px;' + PC_CARD + '"><div style="' + PC_CARD_HEAD + '">Chemical</div>' +
      pcLabelSelect('Chemical basis', 'wtBasis', App.WT_BASIS, s.wtBasis, 'Chemical basis', null, null, 'Choose basis');
    if (basis && basis.v === 'neat') {
      var choices = App.waterDensityChoices(), lib = r.library;
      chem += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start;margin-top:10px;"><div><div style="' + PC_CAP_TOP + '">Product density</div>' + pcCardInput('wtDensity', s.wtDensity, 'Product density (kg/L)', 'kg/L', 'onWtDensity') + '</div></div>' +
        '<div style="margin-top:10px;">' + pcLabelSelect('Density from product library (optional)', 'wtDensitySource', [{ v: '', label: 'None — use the entered density' }].concat(choices.map(function (p) { return { v: p.id, label: p.name + ' — typical ' + p.density + ' kg/L (' + p.densityText + ')' }; })), s.wtDensitySource, 'Density from product library (optional)', 'onWtDensitySource') + '</div>' +
        '<div style="' + PC_HELP + '">' + (lib ? 'Library typical value for ' + esc(lib.name) + ' (range ' + esc(lib.densityText) + '). Enter the SG from the CoA or delivery docket if known.' : 'Density (SG) of the neat product in kg/L — from the CoA, delivery docket or a measurement. No density is assumed; without it only the volumetric dose (L/ML) is shown.') + '</div>';
    } else if (basis && basis.v === 'madedown') {
      chem += '<div style="margin-top:10px;">' + pcStrengthFields('wt', s, r, false) + '</div>';
    }
    chem += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start;margin-top:10px;">' +
        '<div><div style="' + PC_CAP_TOP + '">Active content</div>' + pcCardInput('wtStrength', s.wtStrength, 'Active content of neat product (% w/w, optional, from supplier TDS/CoA)', '%') + '</div>' +
        '<div><div style="' + PC_CAP_TOP + '">Basis label</div><div style="position:relative;"><input autocomplete="off" data-set="wtStrengthBasis" data-key="wtStrengthBasis" aria-label="Strength basis label (optional)" value="' + esc(s.wtStrengthBasis) + '" placeholder="e.g. as Al2O3" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px;font-size:16px;font-weight:600;"></div></div></div>' +
      (r.activeHint ? '<div role="note" class="fa-help" data-wt-active-hint style="margin-top:6px;">' + esc(r.activeHint) + '</div>' : '') +
      '<div style="margin-top:8px;font-size:12px;color:#526159;">Active content is optional: the neat product\u2019s active % (% w/w, e.g. 8 % as Al2O3, as Fe or active polymer) from the supplier TDS/CoA.' + (basis && basis.v === 'madedown' ? ' It is not your solution strength.' : '') + ' No active content is assumed; the dose is mg of product per L of water' + (basis && basis.v === 'madedown' && s.wtStrengthFrom === 'batch' ? ' (kg per L of batch water is treated as kg per L of solution, negligible at field strengths)' : basis && basis.v === 'madedown' && s.wtStrengthFrom === 'strength' ? ' (solution strength is % w/v as made down: 1 % w/v = 0.01 kg/L)' : '') + '.</div></div>';
    // ---- Pumps card + pump rows (shared component, water state) ----
    var pumpUnitRow = '<div style="margin-top:10px;">' + pcLabelSelect('Pump flow unit', 'wtPumpUnit', App.PUMP_FLOW_UNITS, s.wtPumpUnit, 'Pump flow unit', null, null, 'Confirm unit') + '</div>';
    var pumpsCard = '<div style="margin-top:12px;' + PC_CARD + '"><div style="' + PC_CARD_HEAD + '">Dosing pumps</div>' +
      (solve === 'flow'
        ? '<div style="' + PC_HELP + 'margin-top:0;">The total running chemical flow is being solved — no per-pump split; pump readings are not used. The result is shown in the pump flow unit.</div>' + pumpUnitRow
        : pcLabelSelect('Reading type', 'wtReading', App.PC_READING, s.wtReading, 'Pump reading type') + pumpUnitRow +
          (s.wtReading !== 'measured' ? '<div style="' + PC_HELP + '">Not a measured reading: verify actual delivery by drawdown or catch test.</div>' : '') +
          '<div style="' + PC_HELP + '">Only Running pumps are summed; Standby/off rows stay listed but are excluded. Rows: ' + s.wtPumps.length + ' of ' + App.PC_MAX_PUMPS + '.' + (have && pUnit ? ' Running total ' + esc(App.pcFmt(r.pumpsRunningEntered, 6)) + ' ' + esc(pUnit.label) + ' = ' + esc(F4(x.qcLh)) + ' L/h.' : '') + '</div>') + '</div>';
    var pumpList = solve === 'flow' ? '' :
      '<div style="margin-top:15px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#56635B;">Pumps</div><div style="font-size:12px;color:#526159;">' + (isFinite(r.pumpsRunning) ? r.pumpsRunning : 0) + ' of ' + s.wtPumps.length + ' running</div></div>' +
      '<div style="margin-top:9px;display:flex;flex-direction:column;gap:10px;">' + pumpCards(s.wtPumps, s.wtPumpUnit, 'wt', 'Wt') + '</div>' +
      '<div style="margin-top:11px;display:flex;gap:9px;"><button type="button" data-act="addWtPump" style="' + PC_JAR_BTN + 'color:#16211F;"><span aria-hidden="true">+ </span>Add pump</button></div>' +
      (s.wtPumpMsg ? '<div data-wt-pump-msg role="status" class="fa-note" style="margin-top:8px;">' + esc(s.wtPumpMsg) + '</div>' : '');
    var advanced = '<button type="button" data-act="toggleWtAdvanced" aria-expanded="' + (s.wtShowAdvanced ? 'true' : 'false') + '" aria-controls="fa-wt-advanced" style="' + PC_DISCLOSURE + 'margin-top:14px;">Advanced: run hours</button>' +
      (s.wtShowAdvanced ? '<div id="fa-wt-advanced" style="margin-top:12px;' + PC_CARD + '"><div style="' + PC_CARD_HEAD + '">Advanced</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;"><div><div style="' + PC_CAP_CARD + '">Run hours per day</div>' + pcCardInput('wtHours', s.wtHours, 'Run hours per day', 'h/day') + '</div></div>' +
        '<div style="margin-top:8px;font-size:12px;color:#526159;">Used only for the daily totals (kg/day, L/day).</div></div>' : '');
    // ---- Results panel (Dose) ----
    var grid = '', rows = '', activeLabel = String(s.wtStrengthBasis || '').trim() || 'active (basis not stated)';
    if (r.ok) {
      if (solve !== 'dose') grid += pcResCell('Dose', F4(x.doseMgL), 'mg/L (target)');
      if (isFinite(x.volLperML)) grid += pcResCell('Volumetric dose', F4(x.volLperML), 'L/ML (= mL/m³)');
      if (isFinite(x.activeMgL)) grid += pcResCell('Active dose', F4(x.activeMgL), 'mg/L ' + activeLabel);
      grid += pcResCell('Product', F4(x.productKgH), 'kg/h · ' + (isFinite(x.productKgDay) ? F4(x.productKgDay) + ' kg/day (' + s.wtHours.trim() + ' h)' : 'kg/day not calculated'));
      if (solve !== 'flow') grid += pcResCell('Chemical flow', F4(x.qcLh), 'L/h running total' + (pUnit && pUnit.v !== 'Lh' ? ' · ' + F4(x.qcUnitValue) + ' ' + pUnit.label : ''));
      if (solve !== 'water') grid += pcResCell('Water flow', F4(x.qwM3h), 'm³/h · ' + F4(x.qwMLd) + ' ML/d');
      rows += rowKV('Water flow', F4(x.qwLh) + ' L/h', '#EFECE3');
      if (solve !== 'flow') rows += rowKV('Pumps', r.pumpsRunning + ' of ' + r.pumpsTotal + ' pumps running', '#EFECE3');
      rows += rowKV(basis.v === 'neat' ? 'Product density' : 'Solution strength', basis.v === 'neat' ? s.wtDensity.trim() + ' kg/L (' + (r.library ? 'library typical' : 'entered') + ')' : F4(x.conc) + ' kg/L', '#EFECE3');
      rows += rowKV('Chemical per day', isFinite(x.chemLDay) ? F4(x.chemLDay) + ' L/day' : '—', '#EFECE3');
    } else if (r.volOk) {
      rows += rowKV('Water flow', F4(x.qwLh) + ' L/h', '#EFECE3');
      rows += rowKV('Pumps', r.pumpsRunning + ' of ' + r.pumpsTotal + ' pumps running', '#EFECE3');
      rows += rowKV('Chemical flow', F4(x.qcLh) + ' L/h', '#EFECE3');
    }
    var reading = App.pcOption(App.PC_READING, s.wtReading);
    var results = '<div data-wt-results style="margin-top:18px;background:#16211F;border-radius:18px;padding:18px 17px;color:#EFECE3;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><div data-wt-results-label style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Results</div><div style="width:8px;height:8px;border-radius:50%;background:' + (r.ok ? '#4FE0B5' : '#4A5A54') + ';"></div></div>' +
      pcResCell(r.headline.label, r.headline.text, r.headline.unit, { label: ' data-wt-headline-label', value: ' data-wt-headline-value', sub: ' data-wt-headline-unit', extra: r.headline.precise ? '<div data-wt-headline-precise style="font-size:12px;color:#9FB0AA;">More precisely: ' + esc(r.headline.precise) + '</div>' : '' }) +
      (grid ? '<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px 12px;">' + grid + '</div>' : '') +
      (rows ? '<div style="margin-top:15px;padding-top:14px;border-top:1px solid #2C3B37;display:flex;flex-direction:column;gap:7px;">' + rows + '</div>' : '') +
      '<div style="margin-top:10px;font-size:12px;color:#9FB0AA;">' + (solve !== 'flow' ? 'Reading type: ' + esc(reading ? reading.label : 'Not recognised') + ' · ' : '') + 'Basis: ' + esc(basis ? basis.label : 'not selected') + '</div>' +
      (r.ok && r.strengthUsed ? '<div data-wt-strength-used style="margin-top:6px;font-size:12px;color:#9FB0AA;">' + esc(r.strengthUsed) + '</div>' : '') + '</div>';
    var errHtml = '<div data-wt-errors' + (r.errors.length ? ' style="margin-top:12px;display:flex;flex-direction:column;gap:8px;"' : '') + '>' + r.errors.map(pcMsg).join('') + '</div>';
    var flagHtml = r.cautions.length ? '<div data-wt-flags style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">' + r.cautions.map(function (t) { return '<div role="status" class="fa-note">' + esc(t) + '</div>'; }).join('') + '</div>' : '';
    var notesHtml = r.notes.map(function (t) { return '<div style="' + PC_HELP + '">' + esc(t) + '</div>'; }).join('');
    var working = '<button type="button" data-act="toggleWtWorking" aria-expanded="' + (s.wtShowWorking ? 'true' : 'false') + '" aria-controls="fa-wt-working" style="' + PC_DISCLOSURE + 'margin-top:14px;">Show working</button>' +
      (s.wtShowWorking ? '<div id="fa-wt-working" data-wt-working style="margin-top:12px;background:#16211F;border-radius:12px;padding:13px 14px;color:#EFECE3;">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M15 14v4"/></svg><div data-wt-working-title style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A6BEB3;font-weight:700;">Working — each step with the actual numbers</div></div>' +
        (r.working.length ? '<ol style="margin:0;padding-left:17px;display:flex;flex-direction:column;gap:6px;">' + r.working.map(function (t) { return '<li style="font-size:12px;color:#DCE6E1;overflow-wrap:anywhere;word-wrap:break-word;">' + esc(t) + '</li>'; }).join('') + '</ol>'
          : '<div style="font-size:12px;color:#DCE6E1;">The working appears when every required input is valid.</div>') + '</div>' : '');
    var share = '<div style="display:flex;gap:9px;margin-top:14px;"><button type="button" data-act="shareWtResults" style="' + PC_BACKUP_BTN + 'background:#087568;color:#FFF;">Share results</button><button type="button" data-act="copyWtResults" style="' + PC_BACKUP_BTN + '">Copy results</button></div>' +
      (s.wtShareMsg ? '<div role="status" class="fa-note-text" style="margin-top:10px;">' + esc(s.wtShareMsg) + '</div>' : '') +
      (s.wtShareText ? '<textarea readonly data-key="wtShareText" aria-label="Results text (select all and copy)" style="margin-top:9px;width:100%;height:110px;border:1px solid #D8D2C4;border-radius:10px;padding:9px;' + PC_MONO + 'font-size:12px;background:#FBF9F4;color:#16211F;">' + esc(s.wtShareText) + '</textarea>' +
        '<div style="margin-top:9px;display:flex;gap:9px;"><button type="button" data-act="dismissWtShareText" style="' + PC_JAR_BTN + 'color:#56635B;">Hide text</button></div>' : '');
    return '<div style="margin-top:12px;font-size:14px;color:#56635B;">Back-calculate the coagulant or polymer dose in mg/L (ppm) from plant flow and dosing-pump flow, or solve the chemical flow or water flow. Every other field is required. Nothing here is saved.</div>' +
      '<div style="margin-top:14px;">' + pcLabelSelect('Solve for', 'wtSolve', App.WT_SOLVE, solve, 'Solve for') + '</div>' +
      topBlock + chem + pumpsCard + pumpList + advanced + results + errHtml + flagHtml + notesHtml + working + share +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12px;color:#56635B;"><b style="color:#16211F;">How this works.</b> mg/h = chemical flow (L/h) × density or make-down strength (kg/L) × 1,000,000; dose (mg/L) = mg/h ÷ water flow (L/h). Neat liquid also gives the volumetric dose L/ML (= mL/m³) = chemical L/h × 1,000,000 ÷ water L/h. Flows are converted to L/h first; results are rounded for display only.</div>' +
      '<div style="margin-top:10px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:12px;padding:13px 14px;font-size:12px;color:#6B5A38;"><b style="color:#8A5E17;">Basis &amp; assumptions.</b> The dose is mg of product per L of water unless you enter the neat product\u2019s active content, which adds the active dose under your basis label. No unit, density, strength, active content or typical dose range is assumed or applied; a result is not an approval of the dose. Confirm pump delivery by drawdown or catch test.</div>';
  }

  function navBtn(act, style, svg, label) {
    return '<button data-act="' + act + '" style="' + style + '">' + svg + '<span style="font-size:12px;font-weight:600;">' + label + '</span></button>';
  }
  App.renderNav = function (v) {
    return navBtn('goHome', v.navHomeStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>', 'Home') +
      navBtn('goProducts', v.navProductsStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 2v6l-4 8a3 3 0 0 0 3 4h10a3 3 0 0 0 3-4l-4-8V2"/><path d="M6 2h8"/></svg>', 'Products') +
      navBtn('goCalc', v.navCalcStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M15 14v4"/></svg>', 'Dose') +
      navBtn('goCalculator', v.navCalculatorStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="7.5" y="5" width="9" height="4" rx="1"/><circle cx="8.5" cy="13.5" r="1" fill="currentColor"/><circle cx="12" cy="13.5" r="1" fill="currentColor"/><circle cx="15.5" cy="13.5" r="1" fill="currentColor"/><circle cx="8.5" cy="17.5" r="1" fill="currentColor"/><circle cx="12" cy="17.5" r="1" fill="currentColor"/><circle cx="15.5" cy="17.5" r="1" fill="currentColor"/></svg>', 'Calculator') +
      navBtn('goJars', v.navJarsStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/></svg>', 'Jars') +
      navBtn('goPumps', v.navPumpsStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>', 'Pumps') +
      navBtn('goGuide', v.navGuideStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', 'Guide');
  };

  // ============================ MOUNT / RENDER ==============================
  App.mount = function () {
    this._coordinated = true;
    if (!this._seenRaw) this.load();
    this.$screen = document.getElementById('fa-screen');
    this.$nav = document.getElementById('fa-nav');
    var frame = document.getElementById('fa-frame');

    var self = this;
    frame.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (el && !el.disabled) { var fn = App.H[el.dataset.act]; if (fn) fn(el, e); }
      if (self._pickerClickAway) { self._pickerClickAway = false; self.render(); }
    });
    frame.addEventListener('compositionstart', function () { self._composing = true; });
    frame.addEventListener('compositionend', function (e) {
      self._composing = false;
      // Commit the final text through the same delegated input path exactly once.
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
    });
    frame.addEventListener('input', function (e) {
      if (self._composing || e.isComposing) return;
      var el = e.target;
      if (el.tagName === 'SELECT') return;
      if (el.dataset.set != null) {
        var key = el.dataset.set, patch = {}; patch[key] = el.value;
        if (['jarVol', 'stockPct', 'jarVolumeBasis'].indexOf(key) >= 0) { self.editJarSetup(patch); return; }
        // search boxes update only their own option list — no full-screen re-render (smooth typing)
        var comboName = { productPickerQuery: 'product', calcPumpPickerQuery: 'pump', jarProductPickerQuery: 'jarProduct', guideProgPickerQuery: 'guideProduct' }[el.dataset.set];
        if (comboName) { self.state[key] = el.value; self.updateComboList(comboName); }
        else self.setState(patch);
      }
      else if (el.dataset.actinput) { var fn = App.H[el.dataset.actinput]; if (fn) fn(el, e); }
    });
    frame.addEventListener('change', function (e) {
      var el = e.target;
      // file pickers (backup restore) act on change
      if (el.tagName === 'INPUT' && el.type === 'file') { var ff = el.dataset.actchange && App.H[el.dataset.actchange]; if (ff) ff(el, e); return; }
      if (el.tagName !== 'SELECT') return;
      if (el.dataset.set != null) { self.setState_change(el.dataset.set, el.value); }
      else if (el.dataset.actchange) { var fn = App.H[el.dataset.actchange]; if (fn) fn(el, e); }
    });
    // Close on pointerdown without replacing the target between pointerdown and
    // click: the first outside click must still execute its intended action.
    frame.addEventListener('pointerdown', function (e) {
      if ((self.state.productPickerOpen || self.state.calcPumpPickerOpen || self.state.jarProductPickerOpen || self.state.guideProgPickerOpen) && !e.target.closest('[data-combo]')) {
        self.state.productPickerOpen = false; self.state.calcPumpPickerOpen = false; self.state.jarProductPickerOpen = false; self.state.guideProgPickerOpen = false; self._pickerClickAway = true;
      }
    }, true);
    // Escape always dismisses an open picker (hardware keyboards, desktop, assistive tech).
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && App.openComboName()) { e.preventDefault(); App.H.closePickers(null); }
    });
    // Modal dialog behaviour for the open picker: Tab/Shift+Tab wrap inside it, and focus that lands outside
    // (screen-reader navigation, programmatic focus) is returned to it.
    function comboDialog() { return self.$screen && App.openComboName() ? self.$screen.querySelector('[data-combo-sheet],[data-combo-panel]') : null; }
    function comboFocusables(dlg) {
      return Array.prototype.filter.call(dlg.querySelectorAll('button, input, select, textarea, a[href], [tabindex]'), function (el) {
        return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0;
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      self._tabNavAt = Date.now();   // list scrolls caused by keyboard focus movement must not blur the search box
      var dlg = comboDialog(); if (!dlg) return;
      var list = comboFocusables(dlg); if (!list.length) return;
      var first = list[0], last = list[list.length - 1], act = document.activeElement;
      if (!dlg.contains(act)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('focusin', function (e) {
      var dlg = comboDialog(); if (!dlg || dlg.contains(e.target)) return;
      var list = comboFocusables(dlg); if (list.length) { try { list[0].focus({ preventScroll: true }); } catch (e5) {} }
    });
    // Scrolling the mobile list dismisses the on-screen keyboard: a raised keyboard shrinks and shifts the
    // visual viewport while the list is dragged, which made the fixed sheet jitter.
    frame.addEventListener('scroll', function (e) {
      var t = e.target, a = document.activeElement;
      if (t && t.getAttribute && t.getAttribute('data-combo-list') && t.closest('[data-combo-sheet]') && a && a.tagName === 'INPUT' && a.closest('[data-combo-sheet]') && !(self._tabNavAt && Date.now() - self._tabNavAt < 600)) { try { a.blur(); } catch (x) {} }
    }, true);
    // keep the mobile picker sheet fitted above the on-screen keyboard as it opens/closes
    if (window.visualViewport) {
      var vvFrame = 0;
      var onVV = function () {
        if (vvFrame || !(self.state.productPickerOpen || self.state.calcPumpPickerOpen || self.state.jarProductPickerOpen || self.state.guideProgPickerOpen)) return;
        vvFrame = window.requestAnimationFrame ? window.requestAnimationFrame(function () { vvFrame = 0; self.sizeMobileSheet(); }) : (self.sizeMobileSheet(), 0);
      };
      window.visualViewport.addEventListener('resize', onVV);
      window.visualViewport.addEventListener('scroll', onVV);
    }
    this.render();
  };
  App.setState_change = function (key, val) { if (key === 'pumpMaxUnit') { this.H.changePumpUnit(val); return; } var p = {}; p[key] = val; if (['jarVol', 'stockPct', 'jarVolumeBasis'].indexOf(key) >= 0) this.editJarSetup(p); else this.setState(p); };

  // Rebuild only the open combobox's option list as the user types (keeps the
  // search input, its caret, and the rest of the screen perfectly still).
  App.updateComboList = function (name) {
    var v = this.derive(), s = this.state, cfg;
    if (name === 'product') cfg = { pickAct: 'pickProduct', includeNone: true, noneLabel: '— none / generic —', query: v.productPickerQuery, items: v.filteredProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.calcProductId }; }) };
    else if (name === 'pump') cfg = { pickAct: 'pickCalcPump', includeNone: true, noneLabel: '— select a pump —', query: v.calcPumpPickerQuery, items: v.filteredCalcPumps.map(function (p) { return { id: p.id, label: p.model + ' — ' + p.maxFlow, sub: p.brand + ' · ' + p.type, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.selectedCalcPumpId }; }) };
    else if (name === 'jarProduct') cfg = { pickAct: 'pickJarProduct', includeNone: true, noneLabel: '— select a product —', query: v.jarProductPickerQuery, items: v.filteredJarProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.jarProductId }; }) };
    else if (name === 'guideProduct') cfg = { pickAct: 'pickGuideProgProduct', includeNone: true, noneLabel: '— not in library / unknown —', query: v.guideProgPickerQuery, items: v.filteredGuideProgProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.guideProgProductId }; }) };
    else return;
    var el = this.$screen.querySelector('[data-combo-list="' + name + '"]');
    if (el) el.innerHTML = comboRowsHtml(cfg);
  };

  // Mobile: trim the fixed top-sheet to the visible viewport (above the keyboard),
  // and keep it pinned to the top of the visible area if iOS scrolls the layout.
  App.sizeMobileSheet = function () {
    var sheet = document.querySelector('[data-combo-sheet]');
    if (!sheet) return;
    var vv = window.visualViewport;
    if (vv) {
      // Never fill the visible viewport: leave a tappable backdrop zone below the sheet.
      var top = (vv.offsetTop + 8) + 'px', maxH = Math.round(Math.max(200, Math.min(vv.height * 0.72, vv.height - 96))) + 'px';
      if (sheet.style.top !== top) sheet.style.top = top;
      if (sheet.style.maxHeight !== maxH) sheet.style.maxHeight = maxH;
    }
  };

  // Accessible names are attached to the real rendered controls, including
  // repeated jar fields and dynamically generated Guide measurements.
  App.labelControls = function () {
    var self = this, names = { pumpMax: 'Pump maximum capacity (in the selected pump flow unit)', pumpMaxUnit: 'Pump capacity unit', flowUnit: 'Plant flow unit', sludgeFlowUnit: 'Slurry flow unit', jarVol: 'Initial raw jar volume (mL; see selected basis)', stockPct: 'Stock strength (% w/v as-supplied product)', guideSaveClient: 'Client and site to save readings to', guideSaveName: 'New client name', guideProgDoseUnit: 'Programme dose unit', guideProgFlowUnit: 'Programme flow unit', guideProgDose: 'Current dose endpoints or scalar (as-supplied product)', guideProgFlow: 'Plant or slurry flow', 'np-type': 'Product chemical type', 'np-form': 'Product physical form', 'np-doseUnit': 'Product workflow entry dose unit', 'npu-type': 'Pump type', backupText: 'Backup text (copy and preserve off-device)', mgSample: 'Slurry sample mass (g)', mgSolids: 'Dry solids (% w/w)', mgStock: 'Stock strength (% w/v)', mgMl: 'Stock added (mL)' };
    Array.prototype.forEach.call(this.$screen.querySelectorAll('input, select, textarea'), function (el) {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length)) return;
      var key = el.dataset.key || el.dataset.set || '', label = names[key], jar = /^jar-(\d+)-(dose|ph|turb|floc)$/.exec(key);
      if (jar) label = 'Jar ' + (+jar[1] + 1) + ' ' + ({ dose: 'stock volume added (mL)', ph: 'measured pH', turb: 'measured turbidity (NTU)', floc: 'floc observation' })[jar[2]];
      if (el.dataset.actinput === 'onGuideReading') {
        var pb = window.PLAYBOOKS.list.find(function (p) { return p.id === self.state.guideId; });
        var field = pb && pb.fields.find(function (f) { return self.state.guideId + ':' + f.k === el.dataset.f; });
        if (field) label = field.label + (field.u ? ' (' + field.u + ')' : '');
      }
      if (el.type === 'file') label = 'Choose Field Assistant backup file to restore';
      label = label || el.getAttribute('placeholder');
      if (label) el.setAttribute('aria-label', label);
    });
    Array.prototype.forEach.call(this.$screen.querySelectorAll('[data-act="setWinner"]'), function (el) {
      el.setAttribute('aria-label', 'Mark jar ' + (+el.dataset.i + 1) + ' as winner');
      el.setAttribute('aria-pressed', String(self.state.winner === +el.dataset.i));
      el.style.minWidth = '44px'; el.style.minHeight = '44px';
    });
  };

  // Keep native select semantics/pickers; expose full chosen wording beside the
  // single-line native face. Never abbreviate provenance or unknown-basis options.
  App.styleNativeControls = function () {
    var screen = this.$screen;
    Array.prototype.forEach.call(screen.querySelectorAll('select'), function (el, i) {
      el.classList.add('fa-native-select');
      var key = el.getAttribute('data-key') || '', embedded = ['flowUnit', 'sludgeFlowUnit', 'guideProgDoseUnit', 'guideProgFlowUnit', 'pumpMaxUnit', 'pcSludgeUnit', 'wtWaterUnit'].indexOf(key) >= 0 && !(el.parentNode && el.parentNode.tagName === 'LABEL');
      var needsContext = Array.prototype.some.call(el.options, function (o) { return o.text.length > 8; });
      if (!needsContext) return;
      if (el.labels && el.labels.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
        // Only the visible label caption names the control. Options and the
        // adjacent selected-value description must never become its name.
        var caption = el.labels[0].cloneNode(true);
        Array.prototype.forEach.call(caption.querySelectorAll('select, input, textarea, .fa-selected-value'), function (child) { child.parentNode.removeChild(child); });
        el.setAttribute('aria-label', caption.textContent.trim());
      }
      var context = document.createElement('span');
      context.className = 'fa-selected-value'; context.id = 'fa-selected-' + i;
      context.textContent = 'Selected: ' + (el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : 'Unknown / not selected');
      el.setAttribute('aria-describedby', context.id);
      if (embedded) {
        el.parentNode.parentNode.insertBefore(context, el.parentNode.nextSibling);
      } else {
        var wrap = document.createElement('span'); wrap.className = 'fa-select-field';
        el.parentNode.insertBefore(wrap, el); wrap.appendChild(el); wrap.appendChild(context);
      }
    });
  };

  App.render = function () {
    if (this._composing) return; // Never detach the active IME composition node.
    var v = this.derive();
    // capture focus + caret + scroll before replacing DOM
    var active = document.activeElement;
    // Only restore focus for text-entry fields. Re-focusing a <select> after a
    // change re-renders leaves the native picker looking stuck/active, so skip it.
    var focusable = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    var akey = (focusable && active.dataset) ? active.dataset.key : null;
    var aStart = null, aEnd = null;
    try { if (active && 'selectionStart' in active) { aStart = active.selectionStart; aEnd = active.selectionEnd; } } catch (e) {}
    var scrollTop = this.$screen ? this.$screen.scrollTop : 0;

    var html;
    if (v.isProductDetail) html = this.screens.productDetail(v);
    else if (v.isProducts) html = this.screens.products(v);
    else if (v.isCalc) html = this.screens.calc(v);
    else if (v.isCalculator) html = this.screens.calculator(v);
    else if (v.isJars) html = this.screens.jars(v);
    else if (v.isPumps) html = this.screens.pumps(v);
    else if (v.isClients) html = this.screens.clients(v);
    else if (v.isGuideDetail) html = this.screens.guideDetail(v);
    else if (v.isGuide) html = this.screens.guide(v);
    else html = this.screens.home(v);

    if (this.state.storageError) html = '<div role="alert" class="fa-note-text" style="background:#FBEBE7;color:#8A3A24;padding:12px;">' + esc(this.state.storageError) + (this.state.storageConflict ? '<button data-act="refreshSavedLists" class="fa-btn" style="display:block;margin-top:8px;">Refresh saved lists (keep entered form)</button>' : '') + '</div>' + html;
    // Export results, Restore Cancel and Hide text cannot dismiss pending recovery.
    // Sharing/copying/downloading is not a verified repair of saved storage.
    if (this._restoreRecovery) html = '<div role="alert" data-recovery-warning style="position:sticky;top:0;z-index:20;background:#FBEBE7;border-bottom:2px solid #E8C2B8;color:#8A3A24;padding:12px;font-size:14px;">' +
      '<strong>Recovery pending. Restore rollback could not be verified; storage may have changed.</strong> The original recovery backup exists only in this open session. <strong>Do not close or reload this app.</strong> Closing or crashing can lose this session-only recovery. Save the original recovery backup off-device now, and check that the file or text was preserved. Saved-data writes, further restore and refresh remain blocked. Download started, share completed or clipboard copied does not verify off-device preservation or repair saved storage.' +
      (v.isClients ? '' : '<button data-act="goClients" class="fa-btn" style="display:block;margin-top:8px;">Open original recovery backup</button>') + '</div>' + html;
    this.$screen.innerHTML = html;
    this.labelControls();
    this.styleNativeControls();
    this.$nav.innerHTML = this.renderNav(v);
    // While the fixed mobile sheet is open the page behind it is locked (see index.html); the scroll
    // position is kept and restored below, and unlocking happens on the next render after closing.
    var frameEl = document.getElementById('fa-frame');
    if (frameEl) frameEl.classList.toggle('fa-picker-open', !!this.$screen.querySelector('[data-combo-sheet]'));

    // restore
    this.$screen.scrollTop = scrollTop;
    if (this._refocusTrigger && this.$screen.querySelector('[data-combo-sheet],[data-combo-panel]')) this._refocusTrigger = null;
    if (this._refocusTrigger) {
      var trig = this.$screen.querySelector('[data-combo="' + this._refocusTrigger + '"] > button[data-act]');
      this._refocusTrigger = null;
      if (trig) { try { trig.focus({ preventScroll: true }); } catch (e4) {} }
    }
    if (akey) {
      var el = this.$screen.querySelector('[data-key="' + (window.CSS && CSS.escape ? CSS.escape(akey) : akey) + '"]');
      if (el) {
        el.focus({ preventScroll: true });
        if (aStart != null && el.setSelectionRange) { try { el.setSelectionRange(aStart, aEnd); } catch (e2) {} }
      }
    }
    // one-shot: when a combobox opens, scroll its panel fully into view (the pump
    // picker sits low on the page) THEN focus the search box, so you can see what
    // you type. preventScroll on focus keeps the browser from undoing our scroll.
    if (App._focusKey) {
      var fk = this.$screen.querySelector('[data-key="' + (window.CSS && CSS.escape ? CSS.escape(App._focusKey) : App._focusKey) + '"]');
      if (fk) {
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (coarse) {
          this.sizeMobileSheet();  // fixed top-sheet: fit it to the space above the keyboard
        } else {
          var wrap = fk.closest('[data-combo]');
          if (wrap && this.$screen) {
            var wr = wrap.getBoundingClientRect(), scr = this.$screen.getBoundingClientRect();
            var overflow = (wr.bottom + 312) - scr.bottom; // panel ≈ 306px below the trigger
            if (overflow > 0) this.$screen.scrollTop += overflow + 14;
          }
        }
        // no preventScroll: let mobile browsers keep the search box above the keyboard
        try { fk.focus({ preventScroll: true }); } catch (e3) {}
      }
      App._focusKey = null;
    }
  };

  // some derive() fields need calcMode/form flags used only in calc screen:
  var _origDerive = App.derive;
  App.derive = function () {
    var v = _origDerive.call(this);
    v.isConcMode = this.state.calcMode === 'conc';
    v.isSludgeMode = this.state.calcMode === 'sludge';
    v.isLiquidForm = this.state.form === 'liquid';
    return v;
  };
})();
