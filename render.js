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
    var map = {
      datasheet: { t: 'TDS', bg: '#ECF7F3', fg: '#0C8577', title: 'From the supplier data sheet' },
      typical: { t: 'TYPICAL', bg: '#FBF6EC', fg: '#8A5E17', title: 'Typical industry value — confirm on the TDS' },
      example: { t: 'EXAMPLE', bg: '#FBF9F4', fg: '#94A099', title: 'Editable example — not a datasheet value' },
      custom: { t: 'YOURS', bg: '#F3EFFA', fg: '#6A4CA0', title: 'Your custom entry' },
      ai: { t: 'AI', bg: '#F3EFFA', fg: '#6A4CA0', title: 'AI-retrieved — verify against the datasheet' }
    };
    var m = map[verified]; if (!m) return '';
    return '<span title="' + esc(m.title) + '" style="display:inline-block;font-family:\'IBM Plex Mono\',monospace;font-size:9px;font-weight:600;letter-spacing:.04em;padding:2px 6px;border-radius:6px;background:' + m.bg + ';color:' + m.fg + ';vertical-align:middle;">' + m.t + '</span>';
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
          border: '1px solid ' + (s.stockPct === val ? '#0C8577' : '#D8D2C4'),
          background: s.stockPct === val ? '#0C8577' : '#FBF9F4',
          color: s.stockPct === val ? '#FFF' : '#4B564F',
          cursor: 'pointer', borderRadius: '10px', padding: '9px 15px',
          fontSize: '14px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace"
        })
      };
    });
    var jarStockSteps = [];
    if (jarProductChosen) {
      var sp = parseFloat(s.stockPct);
      var gPerL = isFinite(sp) ? this.fmt(sp * 10, 2) : '—';
      var powder = jarProduct.form === 'Powder';
      jarStockSteps.push('Weigh ' + gPerL + ' g of ' + jarProduct.name + ' for each 1 L of stock (' + gPerL + ' g/L = ' + gPerL + ' mg/mL).');
      if (powder) jarStockSteps.push('Add the water first, then sprinkle the powder slowly into a well-stirred vortex — never tip it in as a lump, or you get gel "fish-eyes" that never dissolve.');
      else jarStockSteps.push('Add the product into the stirred water (product to water, not the reverse) so it disperses evenly with no stringy gels.');
      jarStockSteps.push('Mature ' + (jarProduct.ageing || '30–60 min') + ' with gentle stirring, then stop stirring before dosing — matured polymer is shear-sensitive. Make fresh each test day.');
      jarStockSteps.push('1 mL of this stock added to a ' + (s.jarVol || '?') + ' mL jar ≈ ' + this.fmt(this.jarPpm('1'), 2) + ' mg/L dose.');
    }

    var jarRows = s.jars.map(function (j, i) {
      var ppm = self.jarPpm(j.dose);
      var win = s.winner === i;
      return {
        i: i, n: i + 1, dose: j.dose, ph: j.ph, turb: j.turb, floc: j.floc,
        ppm: isFinite(ppm) ? self.fmt(ppm, 2) : '—',
        cardBg: win ? '#ECF7F3' : '#FFF',
        cardBorder: win ? '#0C8577' : '#E2DDD0',
        markColor: win ? '#0C8577' : '#B4BBB4',
        markFill: win ? 5 : 0
      };
    });
    var winnerJar = (s.winner !== null && s.jars[s.winner]) ? s.jars[s.winner] : null;
    var winnerPpmNum = winnerJar ? this.jarPpm(winnerJar.dose) : NaN;

    var q = s.pumpQuery.trim().toLowerCase();
    var pumpRows = allPumps.filter(function (p) { return !q || (p.model + ' ' + p.brand + ' ' + p.type).toLowerCase().indexOf(q) >= 0; })
      .map(function (p) { var o = Object.assign({}, p); o.removable = !!(p.ai || p.mine); return o; });

    var clients = s.clients.map(function (c) {
      var fu = App.flowLabel(c.flowUnit);
      var su = App.flowLabel(c.sludgeFlowUnit);
      var nTests = s.jarTests.filter(function (x) { return x.clientId === c.id; }).length;
      var hasCalc = !!c.mode;
      // preview strings render only on the clients screen — skip the string
      // assembly on every other screen's re-render
      var readings = screen !== 'clients' ? [] : (c.readings || []).slice(0, 2).map(function (r) {
        var vals = r.values || []; // one malformed stored entry must not brick derive()
        var progTxt = '';
        if (r.prog) {
          progTxt = 'Dosing: ' + (r.prog.product || 'current product') + (r.prog.dose ? (' ' + r.prog.dose + ' ' + r.prog.unit) : '') + (r.prog.flow ? (' @ ' + r.prog.flow + ' ' + r.prog.flowUnit) : '');
          if (vals.length) progTxt += ' · ';
        }
        return r.date + ' · ' + r.app + ' — ' + progTxt + vals.map(function (x) { return x.label + ' ' + x.v + (x.u ? ' ' + x.u : ''); }).join(', ');
      });
      return {
        id: c.id, name: c.name, site: c.site || 'No site noted',
        summary: hasCalc ? ((c.productName || 'Generic') + ' · ' + (c.mode === 'sludge' ? (c.doseKg + ' kg/tDS') : (c.dose + ' mg/L'))) : 'Site readings on file — no calc saved yet',
        hasCalc: hasCalc,
        chip1: (c.mode === 'sludge' ? (c.sludgeFlow + ' ' + su + ' sludge') : (c.flow + ' ' + fu)),
        chip2: (c.mode === 'sludge' ? (c.doseKg + ' kg/t DS') : (c.dose + ' mg/L')),
        chip3: (c.productName || 'Generic product'),
        readings: readings,
        nReadings: (c.readings || []).length,
        hasTests: nTests > 0,
        testLabel: nTests + ' saved jar test' + (nTests === 1 ? '' : 's')
      };
    });

    var stockPctN = parseFloat(s.stockPct);
    var stockPrep = isFinite(stockPctN)
      ? 'To make this stock: dissolve ' + this.fmt(stockPctN * 10, 2) + ' g of product per 1 L of water (' + this.fmt(stockPctN * 10, 2) + ' g/L = ' + this.fmt(stockPctN * 10, 2) + ' mg/mL). Then 1 mL added to a ' + (s.jarVol || '?') + ' mL jar ≈ ' + this.fmt(this.jarPpm('1'), 2) + ' mg/L.'
      : 'Enter a stock strength to see the make-up quantity.';

    var cpFu = App.flowLabel(s.flowUnit);
    var cpSu = App.flowLabel(s.sludgeFlowUnit);
    var calc = this.computeCalc();
    var calMl = parseFloat(s.calMl), calSec = parseFloat(s.calSec);
    var calActual = (isFinite(calMl) && isFinite(calSec) && calSec > 0) ? calMl * 3.6 / calSec : NaN;
    var calTarget = calc.solLhNum;
    var calDev = NaN, calFactor = NaN;
    if (isFinite(calActual) && isFinite(calTarget) && calActual > 0) {
      calDev = (calActual - calTarget) / calTarget * 100;
      calFactor = calTarget / calActual;
    }
    var calInTol = isFinite(calDev) && Math.abs(calDev) <= 5;
    var cal = {
      actual: isFinite(calActual) ? this.fmt(calActual, 3) + ' L/h' : '—',
      target: isFinite(calTarget) ? this.fmt(calTarget, 3) + ' L/h' : '—',
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
      var pv = this.parsePumpFlow(calcPumpObj.maxFlow);
      calcPumpInfo = calcPumpObj.model + ' — rated ' + calcPumpObj.maxFlow + (calcPumpObj.maxPress ? ' · ' + calcPumpObj.maxPress : '') + '. Using ' + (isFinite(pv) ? this.fmt(pv, 2) : '?') + ' L/h as max capacity.';
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
        flexShrink: 0, border: '1px solid ' + (s.productFilter === f.v ? '#0C8577' : '#D8D2C4'),
        background: s.productFilter === f.v ? '#0C8577' : '#FFF',
        color: s.productFilter === f.v ? '#FFF' : '#4B564F',
        cursor: 'pointer', borderRadius: '999px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap'
      });
      return f;
    });

    return {
      screen: screen, detail: detail,
      isHome: screen === 'home', isProducts: screen === 'products' && !s.productId, isProductDetail: detail,
      isCalc: screen === 'calc', isJars: screen === 'jars', isPumps: screen === 'pumps', isClients: screen === 'clients',
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
      showFlowConv: s.flowUnit !== 'm3h' && isFinite(parseFloat(s.flow)),
      flowConverted: this.fmt(parseFloat(s.flow) * this.flowFactor(s.flowUnit), 3),
      showSludgeConv: s.sludgeFlowUnit !== 'm3h' && isFinite(parseFloat(s.sludgeFlow)),
      sludgeConverted: this.fmt(parseFloat(s.sludgeFlow) * this.flowFactor(s.sludgeFlowUnit), 3),
      clientPreview: clientPreview,
      jarTestRows: s.jarTests.map(function (t) {
        return {
          id: t.id, date: t.date, who: t.clientName ? t.clientName : 'No client', product: t.productName,
          winner: (t.winnerN ? ('Jar ' + t.winnerN + ' · ') : '') + t.winnerPpm + ' mg/L',
          setup: t.jarVol + ' mL jar · ' + t.stockPct + '% stock', note: t.note || ''
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
      navJarsStyle: css(this.navStyle(screen === 'jars')),
      navPumpsStyle: css(this.navStyle(screen === 'pumps')),
      navGuideStyle: css(this.navStyle(screen === 'guide'))
    };
  };

  // One banner for every dose-vs-datasheet-window verdict (calc + guide) — the
  // wording, colours and the datasheet-basis footer can never drift apart.
  // `w` is a doseWindowFor result, or {mismatch:true, name, rawUnit, note}.
  function doseWindowBanner(w, subject) {
    if (!w) return '';
    var noteLine = w.note ? '<div style="margin-top:6px;font-size:11px;opacity:.8;line-height:1.45;">Datasheet basis: ' + esc(w.note) + '</div>' : '';
    if (w.mismatch) {
      return '<div style="margin-top:10px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:10px;padding:9px 12px;font-size:11.5px;color:#94A099;line-height:1.5;">' +
        subject + ' doesn’t match <b>' + esc(w.name) + '</b>’s datasheet basis (' + esc(w.rawUnit || '') + ') — no window comparison shown.' + noteLine + '</div>';
    }
    var ok = w.status === 'within';
    var msg = ok ? 'sits <b>within</b> the datasheet window — a good baseline; bracket 50–150% to see if less still performs.'
      : (w.status === 'above'
        ? 'is <b>above</b> the datasheet window — possible overdose (wasted product, risk of re-stabilising solids). Retest downward.'
        : 'is <b>below</b> the datasheet window — may be underdosing. Retest upward before changing anything.');
    var shown = App.fmt(w.val, 2) + ' ' + w.unit + (w.converted ? ' equivalent' : '');
    return '<div style="margin-top:10px;background:' + (ok ? '#ECF7F3' : '#FBF6EC') + ';border:1px solid ' + (ok ? '#B8E0D3' : '#EBD9BC') + ';border-radius:12px;padding:11px 13px;font-size:12.5px;line-height:1.55;color:' + (ok ? '#17564C' : '#6B5A38') + ';">' +
      '<b>' + esc(w.name) + '</b> — typical window <b style="font-family:\'IBM Plex Mono\';">' + w.lo + '–' + w.hi + ' ' + w.unit + '</b> ' + vbadge(w.verified) + '. ' + subject + ' (' + esc(shown) + ') ' + msg + noteLine + '</div>';
  }

  // shared field/icon fragments
  var CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
  var DOWNARROW = "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 fill=%22none%22 stroke=%22%2394A099%22 stroke-width=%222%22><path d=%22M2 3l3 3 3-3%22/></svg>')";

  // ---- searchable combobox (tap → type to filter → pick) -------------------
  function comboHtml(o) {
    var chev = '<svg width="12" height="12" viewBox="0 0 10 10" style="flex-shrink:0;margin-left:8px;transition:transform .15s;transform:rotate(' + (o.open ? '180deg' : '0deg') + ');" fill="none" stroke="#94A099" stroke-width="2"><path d="M2 3l3 3 3-3"/></svg>';
    var trigger = '<button data-act="' + o.toggleAct + '" style="width:100%;background:#FFF;border:1px solid ' + (o.open ? '#0C8577' : '#D8D2C4') + ';border-radius:12px;padding:13px 12px;font-size:14px;font-weight:600;color:' + (o.hasSelection ? '#16211F' : '#6B776F') + ';cursor:pointer;display:flex;align-items:center;justify-content:space-between;text-align:left;">' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(o.selectedLabel) + '</span>' + chev + '</button>';
    if (!o.open) return '<div data-combo="' + o.name + '">' + trigger + '</div>';

    // 16px font on the input stops iOS zooming in on focus.
    var searchBox = '<div style="padding:8px;border-bottom:1px solid #EFEBE2;flex-shrink:0;"><div style="position:relative;">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A099" stroke-width="2" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<input data-set="' + o.setKey + '" data-key="' + o.setKey + '" value="' + esc(o.query) + '" placeholder="' + esc(o.searchPlaceholder) + '" style="width:100%;background:#FBF9F4;border:1px solid #E2DDD0;border-radius:9px;padding:10px 9px 10px 32px;font-size:16px;font-weight:500;"></div></div>';

    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      // Mobile: fixed top sheet + dimmed backdrop, so the search box and list stay
      // pinned to the top of the screen above the keyboard. sizeMobileSheet() trims
      // it to the visible viewport once the keyboard is up.
      var backdrop = '<div data-act="closePickers" style="position:fixed;inset:0;z-index:999;background:rgba(20,25,23,0.35);"></div>';
      var sheet = '<div data-combo-sheet="' + o.name + '" style="position:fixed;top:calc(env(safe-area-inset-top, 0px) + 8px);left:8px;right:8px;z-index:1000;display:flex;flex-direction:column;max-height:calc(100dvh - 16px);background:#FFF;border:1px solid #D8D2C4;border-radius:14px;overflow:hidden;box-shadow:0 18px 44px rgba(0,0,0,0.30);">' +
        searchBox +
        '<div data-combo-list="' + o.name + '" style="flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;">' + comboRowsHtml(o) + '</div></div>';
      return '<div data-combo="' + o.name + '">' + trigger + backdrop + sheet + '</div>';
    }

    // Desktop: absolute overlay floating below the trigger (zero page shift).
    var panel = '<div style="position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:50;display:flex;flex-direction:column;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,0.18);">' +
      searchBox +
      '<div data-combo-list="' + o.name + '" style="height:240px;overflow-y:auto;-webkit-overflow-scrolling:touch;">' + comboRowsHtml(o) + '</div></div>';
    return '<div data-combo="' + o.name + '" style="position:relative;">' + trigger + panel + '</div>';
  }
  // Just the option rows — rebuilt on its own as the user types (no full re-render).
  function comboRowsHtml(o) {
    var rows = '';
    if (o.includeNone) rows += '<button data-act="' + o.pickAct + '" data-id="" style="width:100%;text-align:left;background:#FFF;border:none;border-bottom:1px solid #F0EDE4;padding:11px 12px;cursor:pointer;font-size:14px;font-weight:600;color:#6B776F;">' + esc(o.noneLabel) + '</button>';
    if (o.items.length) {
      rows += o.items.map(function (it) {
        var badge = it.tag ? '<span style="width:38px;height:26px;flex-shrink:0;border-radius:7px;background:' + (it.tint || '#EEE') + ';color:' + (it.tintText || '#333') + ';font-family:\'IBM Plex Mono\';font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;">' + esc(it.tag) + '</span>' : '';
        return '<button data-act="' + o.pickAct + '" data-id="' + esc(it.id) + '" style="width:100%;text-align:left;background:' + (it.selected ? '#ECF7F3' : '#FFF') + ';border:none;border-bottom:1px solid #F0EDE4;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;">' + badge +
          '<span style="min-width:0;flex:1;"><span style="display:block;font-size:14px;font-weight:600;color:#16211F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(it.label) + '</span>' +
          (it.sub ? '<span style="display:block;font-size:11.5px;color:#6B776F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(it.sub) + '</span>' : '') + '</span></button>';
      }).join('');
    } else {
      rows += '<div style="padding:16px 12px;font-size:13px;color:#94A099;text-align:center;line-height:1.5;">No match for “' + esc(o.query) + '”.</div>';
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
            '<div><div style="font-size:15px;font-weight:700;">' + esc(c.name) + '</div>' +
            '<div style="font-size:12px;color:#6B776F;margin-top:1px;">' + esc(c.summary) + '</div></div>' + CHEV + '</button>';
        }).join('') + '</div>';
    } else {
      clientsHtml = '<div style="margin-top:10px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:14px;padding:16px;font-size:13px;color:#6B776F;line-height:1.5;">No clients saved yet. Set up a calculation, then tap <b style="color:#16211F">Save as client</b> in the Dosing Calc to recall its flow, product and dose next visit.</div>';
    }
    function card(act, bg, color, accentSvg, title, sub, subColor, extra) {
      return '<button data-act="' + act + '" style="text-align:left;border:' + (extra || 'none') + ';cursor:pointer;background:' + bg + ';color:' + color + ';border-radius:18px;padding:18px 16px;min-height:128px;display:flex;flex-direction:column;justify-content:space-between;">' +
        accentSvg + '<div><div style="font-size:17px;font-weight:700;">' + title + '</div><div style="font-size:12px;color:' + subColor + ';margin-top:2px;">' + sub + '</div></div></button>';
    }
    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">' +
        '<div><div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Field Assistant</div>' +
        '<div style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-top:2px;">Treatment Toolkit</div></div>' +
        '<button data-act="goClients" style="border:1px solid #D8D2C4;background:#FFF;border-radius:12px;padding:9px 12px;font-size:12.5px;font-weight:600;color:#16211F;cursor:pointer;display:flex;align-items:center;gap:6px;">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>Clients</button></div>' +
      '<div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        card('goProducts', '#16211F', '#EFECE3', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="1.8"><path d="M6 2v6l-4 8a3 3 0 0 0 3 4h10a3 3 0 0 0 3-4l-4-8V2"/><path d="M6 2h8M8 14h6"/></svg>', 'Product Library', 'Polymers, coagulants &amp; data', '#9FB0AA') +
        card('goCalc', '#0C8577', '#EAFBF5', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M8 18h3M15 14v4"/></svg>', 'Dosing Calc', 'Feed rate &amp; pump stroke', '#BEEFE3') +
        card('goJars', '#FFF', '#16211F', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="1.8"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/><path d="M6.5 13h11"/></svg>', 'Jar Testing', 'Find the optimum dose', '#6B776F', '1px solid #E2DDD0') +
        card('goPumps', '#FFF', '#16211F', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>', 'Dosing Pumps', 'Specs &amp; feed capacity', '#6B776F', '1px solid #E2DDD0') +
      '</div>' +
      '<button data-act="goGuide" style="margin-top:12px;width:100%;text-align:left;cursor:pointer;background:#FFF;border:1px solid #E2DDD0;border-radius:18px;padding:15px 16px;display:flex;align-items:center;gap:13px;">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="1.8" style="flex-shrink:0;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
        '<span style="flex:1;min-width:0;"><span style="display:flex;align-items:center;gap:7px;"><span style="font-size:16px;font-weight:700;color:#16211F;">Field Playbooks</span><span style="background:#ECF7F3;color:#0C8577;border-radius:6px;padding:2px 7px;font-size:9.5px;font-weight:700;font-family:\'IBM Plex Mono\';letter-spacing:.04em;">NEW</span></span>' +
        '<span style="display:block;font-size:12px;color:#6B776F;margin-top:1px;">Potable · sewage · sludge · industrial · mining</span></span>' + CHEV + '</button>' +
      '<div style="margin-top:24px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B776F;">Saved clients</div>' +
        '<button data-act="goClients" style="border:none;background:none;color:#0C8577;font-size:12.5px;font-weight:600;cursor:pointer;">Manage</button></div>' +
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
        '<div style="width:44px;height:44px;flex-shrink:0;border-radius:12px;background:' + esc(p.tint) + ';display:flex;align-items:center;justify-content:center;font-family:\'IBM Plex Mono\';font-weight:600;font-size:12px;color:' + esc(p.tintText) + ';">' + esc(p.tag) + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:15.5px;font-weight:700;">' + esc(p.name) + ' ' + vbadge(p.verified) + '</div>' +
        '<div style="font-size:12px;color:#6B776F;margin-top:1px;">' + esc(p.subtitle) + '</div></div>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B4BBB4" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>';
    }).join('');
    var noMatch = v.noProductMatch ? '<div style="margin-top:8px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:16px;font-size:13px;color:#6B776F;line-height:1.5;text-align:center;">No product in your library matches “' + esc(s.productQuery) + '”. Adjust the search, or add it to your repository.</div>' : '';
    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Library</div>' +
      '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 3px;">Products</div>' +
      '<div style="font-size:13px;color:#6B776F;line-height:1.5;">Tap a product for its data sheet, typical dose window and make-up guidance. Badges show whether a value is from the supplier <b>TDS</b>, a <b>typical</b> range, or an editable <b>example</b>.</div>' +
      '<div style="position:relative;margin-top:14px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A099" stroke-width="2" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
        '<input data-set="productQuery" data-key="productQuery" value="' + esc(s.productQuery) + '" placeholder="Search name, type or charge…" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 13px 13px 40px;font-size:14.5px;font-weight:500;"></div>' +
      '<div style="margin-top:10px;display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;">' + filtersHtml + '</div>' +
      '<button data-act="startAddProduct" style="margin-top:12px;width:100%;border:1px dashed #C6BFAF;background:#FBF9F4;cursor:pointer;border-radius:12px;padding:12px;font-size:13.5px;font-weight:700;color:#4B564F;display:flex;align-items:center;justify-content:center;gap:7px;">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Add your own product</button>' +
      formHtml +
      '<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">' + rowsHtml + '</div>' + noMatch +
    '</div>';
  };

  function fld(dataf, val, ph, extra) {
    return '<input data-actinput="onNpField" data-f="' + dataf + '" data-key="np-' + dataf + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '" style="' + (extra || 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;') + '">';
  }
  function productFormHtml(s) {
    var np = s.np;
    return '<div style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E8A82;font-weight:700;margin-bottom:12px;">New product</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;">' +
        fld('name', np.name, 'Product name (required)', 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;font-weight:600;color:#FFF;') +
        fld('brand', np.brand, 'Brand / supplier') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
          '<select data-actchange="onNpField" data-f="type" data-key="np-type" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#FFF;appearance:none;">' + optionTags([{ v: 'Flocculant' }, { v: 'Coagulant' }, { v: 'Other' }], np.type, 'v', 'v') + '</select>' +
          '<select data-actchange="onNpField" data-f="form" data-key="np-form" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#FFF;appearance:none;">' + optionTags([{ v: 'Powder' }, { v: 'Liquid' }, { v: 'Emulsion' }], np.form, 'v', 'v') + '</select>' +
        '</div>' +
        fld('charge', np.charge, 'Charge (e.g. Cationic high)') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
          fld('doseRange', np.doseRange, 'Dose range e.g. 1 – 10', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;') +
          '<select data-actchange="onNpField" data-f="doseUnit" data-key="np-doseUnit" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:12.5px;color:#FFF;appearance:none;">' + optionTags([{ v: 'mg/L on flow' }, { v: 'kg / t dry solids' }, { v: 'g / t dry solids' }], np.doseUnit, 'v', 'v') + '</select>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
          fld('density', np.density, 'Density kg/L', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;') +
          fld('makedown', np.makedown, 'Make-down %', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;') +
        '</div>' +
        fld('ageing', np.ageing, 'Ageing / maturation time') +
        '<textarea data-actinput="onNpField" data-f="application" data-key="np-application" placeholder="Application notes" rows="2" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;resize:vertical;">' + esc(np.application) + '</textarea>' +
        '<textarea data-actinput="onNpField" data-f="makeup" data-key="np-makeup" placeholder="Make-up / mixing guidance" rows="2" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;resize:vertical;">' + esc(np.makeup) + '</textarea>' +
      '</div>' +
      '<div style="display:flex;gap:9px;margin-top:12px;">' +
        '<button data-act="cancelAddProduct" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button>' +
        '<button data-act="confirmAddProduct" style="flex:2;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save product</button>' +
      '</div></div>';
  }

  App.screens.productDetail = function (v) {
    var p = v.product;
    function statCard(label, val, mono) {
      return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:12px;padding:11px 13px;">' +
        '<div style="font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:#94A099;font-weight:700;">' + label + '</div>' +
        '<div style="font-size:14px;font-weight:700;margin-top:2px;' + (mono ? "font-family:'IBM Plex Mono';" : '') + '">' + esc(val) + '</div></div>';
    }
    var deleteBtn = p.custom ? '<button data-act="deleteProduct" data-id="' + esc(p.id) + '" style="margin-top:10px;width:100%;border:1px solid #E4C9C1;cursor:pointer;background:#FFF;color:#B8432B;border-radius:14px;padding:13px;font-size:14px;font-weight:700;">Delete this custom product</button>' : '';
    var srcLine = p.source ? '<div style="margin-top:14px;font-size:11.5px;color:#94A099;line-height:1.5;">Source: ' + esc(p.source) + '</div>' : '';
    return '<div style="padding:18px 18px 30px;animation:fadeUp .3s ease;">' +
      '<button data-act="backToProducts" style="border:none;background:none;cursor:pointer;color:#0C8577;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:5px;margin-bottom:14px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg> Library</button>' +
      '<div style="display:flex;gap:14px;align-items:center;">' +
        '<div style="width:56px;height:56px;flex-shrink:0;border-radius:15px;background:' + esc(p.tint) + ';display:flex;align-items:center;justify-content:center;font-family:\'IBM Plex Mono\';font-weight:600;font-size:14px;color:' + esc(p.tintText) + ';">' + esc(p.tag) + '</div>' +
        '<div><div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;">' + esc(p.name) + ' ' + vbadge(p.verified) + '</div><div style="font-size:13px;color:#6B776F;">' + esc(p.brand) + '</div></div></div>' +
      '<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
        statCard('Function', p.type) + statCard('Charge', p.charge) + statCard('Physical form', p.form) + statCard('Bulk density', p.densityText, true) +
      '</div>' +
      '<div style="margin-top:14px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
        '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6E8A82;font-weight:700;">Typical dose window</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;"><div style="font-family:\'IBM Plex Mono\';font-size:30px;font-weight:600;color:#4FE0B5;letter-spacing:-0.01em;">' + esc(p.doseRange) + '</div><div style="font-size:13px;color:#9FB0AA;">' + esc(p.doseUnit) + '</div></div>' +
        '<div style="font-size:12.5px;color:#9FB0AA;margin-top:6px;line-height:1.5;">' + esc(p.doseNote) + '</div></div>' +
      '<div style="margin-top:14px;"><div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6B776F;margin-bottom:7px;">Application</div>' +
        '<div style="font-size:14px;line-height:1.55;color:#333E39;">' + esc(p.application) + '</div></div>' +
      '<div style="margin-top:16px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:14px;padding:14px 15px;">' +
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B27A24" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' +
        '<div style="font-size:12.5px;font-weight:700;color:#8A5E17;letter-spacing:0.04em;text-transform:uppercase;">Make-up guidance</div></div>' +
        '<div style="font-size:13.5px;line-height:1.55;color:#5C4A24;">' + esc(p.makeup) + '</div></div>' +
      '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
        statCard('Make-down strength', p.makedownText, true) + statCard('Ageing / maturation', p.ageing) +
      '</div>' + srcLine +
      '<button data-act="useProductInCalc" style="margin-top:18px;width:100%;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:14px;padding:15px;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M15 14v4"/></svg>Use in dosing calculator</button>' +
      deleteBtn +
    '</div>';
  };

  App.screens.calc = function (v) {
    var s = App.state;
    var productOpts = '<option value="">— none / generic —</option>' + v.allProducts.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === s.calcProductId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var flowUnitSel = function (setKey, cur) {
      return '<select data-set="' + setKey + '" data-key="' + setKey + '" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 30px 0 13px;font-size:13.5px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 11px center;">' + optionTags(App.FLOW_UNITS, cur, 'v', 'label') + '</select>';
    };
    var concInputs = v.isConcMode !== undefined ? '' : '';
    var isConc = s.calcMode === 'conc';
    var isSludge = s.calcMode === 'sludge';
    var concBlock = isConc ? (
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' +
        '<div><div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:5px;">Flow rate</div>' +
          '<div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FFF;overflow:hidden;">' +
            '<input inputmode="decimal" data-set="flow" data-key="flow" value="' + esc(s.flow) + '" placeholder="0" style="flex:1;min-width:0;border:none;background:transparent;padding:13px;font-size:16px;font-family:\'IBM Plex Mono\';font-weight:600;">' + flowUnitSel('flowUnit', s.flowUnit) + '</div>' +
          (v.showFlowConv ? '<div style="font-size:11.5px;color:#94A099;margin-top:5px;font-family:\'IBM Plex Mono\';">= ' + esc(v.flowConverted) + ' m³/h used in calc</div>' : '') + '</div>' +
        '<div><div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:5px;">Target dose</div>' +
          '<div style="position:relative;"><input inputmode="decimal" data-set="dose" data-key="dose" value="' + esc(s.dose) + '" placeholder="0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 52px 13px 13px;font-size:16px;font-family:\'IBM Plex Mono\';font-weight:600;">' +
          '<span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">mg/L</span></div></div>' +
      '</div>') : '';
    var sludgeBlock = isSludge ? (
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' +
        '<div><div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:5px;">Sludge flow</div>' +
          '<div style="display:flex;border:1px solid #D8D2C4;border-radius:12px;background:#FFF;overflow:hidden;">' +
            '<input inputmode="decimal" data-set="sludgeFlow" data-key="sludgeFlow" value="' + esc(s.sludgeFlow) + '" placeholder="0" style="flex:1;min-width:0;border:none;background:transparent;padding:13px;font-size:16px;font-family:\'IBM Plex Mono\';font-weight:600;">' + flowUnitSel('sludgeFlowUnit', s.sludgeFlowUnit) + '</div>' +
            (v.showSludgeConv ? '<div style="font-size:11.5px;color:#94A099;margin-top:5px;font-family:\'IBM Plex Mono\';">= ' + esc(v.sludgeConverted) + ' m³/h used in calc</div>' : '') + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:5px;">Dry solids</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="ds" data-key="ds" value="' + esc(s.ds) + '" placeholder="0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 44px 13px 13px;font-size:16px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">% DS</span></div></div>' +
          '<div><div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:5px;">Polymer dose</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="doseKg" data-key="doseKg" value="' + esc(s.doseKg) + '" placeholder="0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 60px 13px 13px;font-size:16px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:11px;color:#94A099;font-weight:600;">kg/tDS</span></div></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:5px;">Sludge density</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="sludgeDensity" data-key="sludgeDensity" value="' + esc(s.sludgeDensity) + '" placeholder="1.0" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 44px 13px 13px;font-size:16px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:11px;color:#94A099;font-weight:600;">t/m³</span></div></div>' +
          '<div style="display:flex;align-items:flex-end;"><div style="font-size:11px;color:#94A099;line-height:1.4;padding-bottom:6px;">Raise above 1.0 for thickened / mineral sludge. Dry solids is % w/w on wet mass.</div></div>' +
        '</div></div>') : '';
    var liquidDensity = s.form === 'liquid' ? (
      '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Neat density</div>' +
        '<div style="position:relative;"><input inputmode="decimal" data-set="density" data-key="density" value="' + esc(s.density) + '" placeholder="1.0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 44px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:11px;color:#94A099;font-weight:600;">kg/L</span></div></div>') : '';
    var pumpBlock = s.pumpSource === 'select' ? (
      comboHtml({
        name: 'pump', open: v.calcPumpPickerOpen, query: v.calcPumpPickerQuery, setKey: 'calcPumpPickerQuery',
        toggleAct: 'toggleCalcPumpPicker', pickAct: 'pickCalcPump',
        selectedLabel: v.selectedCalcPumpLabel, hasSelection: !!s.selectedCalcPumpId,
        includeNone: true, noneLabel: '— select a pump —', searchPlaceholder: 'Search model or brand…',
        items: v.filteredCalcPumps.map(function (p) { return { id: p.id, label: p.model + ' — ' + p.maxFlow, sub: p.brand + ' · ' + p.type, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.selectedCalcPumpId }; })
      }) +
        (v.calcPumpChosen ? '<div style="margin-top:9px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12px;color:#17564C;line-height:1.5;">' + esc(v.calcPumpInfo) + '</div>' : '')
    ) : (
      '<div style="position:relative;"><input inputmode="decimal" data-set="pumpMax" data-key="pumpMax" value="' + esc(s.pumpMax) + '" placeholder="0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:12px;padding:13px 88px 13px 13px;font-size:16px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">L/h max</span></div>'
    );
    var c = v.calc;
    function resCell(label, val, color, sub) {
      return '<div><div style="font-size:11px;color:#6E8A82;font-weight:600;">' + label + '</div>' +
        '<div style="font-family:\'IBM Plex Mono\';font-size:23px;font-weight:600;color:' + color + ';letter-spacing:-0.01em;">' + esc(val) + '</div>' +
        '<div style="font-size:11px;color:#9FB0AA;">' + sub + '</div></div>';
    }
    var warnHtml = c.hasWarn ? '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">' + c.warnings.map(function (w) {
      return '<div style="background:' + w.bg + ';border:1px solid ' + w.border + ';border-radius:12px;padding:11px 13px;font-size:13px;line-height:1.45;color:' + w.color + ';">' + esc(w.text) + '</div>';
    }).join('') + '</div>' : '';
    var cal = v.cal;
    var calAdvice = cal.showAdvice ? '<div style="margin-top:11px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#17564C;line-height:1.5;">' + esc(cal.advice) + '</div>' : '';

    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Calculator</div>' +
      '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 12px;">Dosing &amp; Feed Rate</div>' +
      '<div style="display:flex;background:#E4DFD3;border-radius:12px;padding:3px;gap:3px;">' +
        '<button data-act="onModeConc" style="' + v.modeConcStyle + '">Concentration<div style="font-size:10.5px;font-weight:500;opacity:.7;">mg/L on flow</div></button>' +
        '<button data-act="onModeSludge" style="' + v.modeSludgeStyle + '">Sludge dewatering<div style="font-size:10.5px;font-weight:500;opacity:.7;">kg / t dry solids</div></button></div>' +
      '<div style="margin-top:14px;"><div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:5px;">Product</div>' +
        comboHtml({
          name: 'product', open: v.productPickerOpen, query: v.productPickerQuery, setKey: 'productPickerQuery',
          toggleAct: 'toggleProductPicker', pickAct: 'pickProduct',
          selectedLabel: v.selectedProductLabel, hasSelection: !!s.calcProductId,
          includeNone: true, noneLabel: '— none / generic —', searchPlaceholder: 'Search product, brand or charge…',
          items: v.filteredProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.calcProductId }; })
        }) + '</div>' +
      concBlock + sludgeBlock +
      doseWindowBanner(v.doseWin, v.doseWin && v.doseWin.mismatch ? 'The ' + (isConc ? 'mg/L' : 'kg/t DS') + ' entry' : 'The entered dose') +
      '<div style="margin-top:14px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:10px;">Make-down solution</div>' +
        '<div style="display:flex;background:#EEEAE1;border-radius:10px;padding:3px;gap:3px;margin-bottom:11px;">' +
          '<button data-act="onFormLiquid" style="' + v.formLiquidStyle + '">Liquid / emulsion</button>' +
          '<button data-act="onFormPowder" style="' + v.formPowderStyle + '">Powder</button></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Solution strength</div>' +
            '<div style="position:relative;"><input inputmode="decimal" data-set="makedown" data-key="makedown" value="' + esc(s.makedown) + '" placeholder="0.5" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 34px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">%</span></div></div>' +
          liquidDensity +
        '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#94A099;line-height:1.4;">Solution strength is % w/v (g product per 100 mL). Powder dose is on an as-supplied basis.</div>' +
      '</div>' +
      '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:10px;">Dosing pump</div>' +
        '<div style="display:flex;background:#EEEAE1;border-radius:10px;padding:3px;gap:3px;margin-bottom:11px;">' +
          '<button data-act="onPumpSelect" style="' + v.pumpSelectStyle + '">From my pumps</button>' +
          '<button data-act="onPumpManual" style="' + v.pumpManualStyle + '">Enter capacity</button></div>' + pumpBlock + '</div>' +
      '<div style="margin-top:18px;background:#16211F;border-radius:18px;padding:18px 17px;color:#EFECE3;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6E8A82;font-weight:700;">Results</div><div style="width:8px;height:8px;border-radius:50%;background:' + c.statusDot + ';"></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 12px;">' +
          resCell('Neat product', c.massKgH, '#4FE0B5', 'kg/h &nbsp;·&nbsp; ' + esc(c.massKgDay) + ' kg/day') +
          resCell('Solution feed', c.solLh, '#4FE0B5', 'L/h of ' + esc(s.makedown) + '% solution') +
          resCell('Pump stroke', c.strokePct, c.strokeColor, '% of max capacity') +
          resCell('Neat volume', c.neatLh, '#4FE0B5', 'L/h before dilution') +
        '</div>' +
        '<div style="margin-top:15px;padding-top:14px;border-top:1px solid #2C3B37;display:flex;flex-direction:column;gap:7px;">' +
          rowKV('Suggested stroke length', c.strokeLen, '#4FE0B5') +
          rowKV('Suggested stroke rate / speed', c.strokeRate, '#4FE0B5') +
          rowKV('Dilution ratio', c.dilution, '#EFECE3') +
          rowKV('Batch (1000 L tank)', c.batchKg + ' kg powder', '#EFECE3') +
          rowKV('1000 L batch lasts', c.batchHours + ' h', '#EFECE3') +
        '</div></div>' +
      warnHtml +
      calibrationHtml(s, cal, calAdvice) +
      '<button data-act="startSaveClient" style="margin-top:16px;width:100%;border:1px solid #0C8577;cursor:pointer;background:#FFF;color:#0C8577;border-radius:14px;padding:14px;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Save as client</button>' +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12.5px;color:#6B776F;line-height:1.55;"><b style="color:#16211F;">How this works.</b> Dose (mg/L) × flow (m³/h) = grams of neat product per hour. Divide by your solution strength to get the litres of made-up solution the pump must feed, then compare against the pump\'s max capacity to get the % stroke it needs to run at.</div>' +
      '<div style="margin-top:10px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:12px;padding:13px 14px;font-size:12px;color:#6B5A38;line-height:1.55;"><b style="color:#8A5E17;">Basis &amp; assumptions.</b> Dose is on an <b>as-supplied</b> (neat product) basis — if it is quoted as active polymer, divide by the active fraction first. Solution strength is <b>% w/v</b> (g per 100 mL; batch by dissolving, then top up to the final volume). Sludge mode reads dry solids as <b>% w/w on wet mass</b> and uses the sludge density you enter (default 1.0 t/m³ — raise it for thick sludge). The pump % stroke assumes capacity at operating back-pressure and roughly linear delivery — always confirm with the calibration catch-test above.</div>' +
    '</div>';
  };
  function rowKV(k, val, color) {
    return '<div style="display:flex;justify-content:space-between;font-size:12.5px;"><span style="color:#9FB0AA;">' + k + '</span><span style="font-family:\'IBM Plex Mono\';color:' + color + ';font-weight:600;">' + esc(val) + '</span></div>';
  }
  function calibrationHtml(s, cal, calAdvice) {
    return '<div style="margin-top:16px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
      '<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>' +
      '<div style="font-size:12.5px;font-weight:700;color:#4B564F;">Field calibration check</div></div>' +
      '<div style="font-size:12px;color:#6B776F;line-height:1.5;margin-bottom:11px;">Divert the pump into a measuring cylinder for a fixed time, then enter what you collected to confirm it matches the target feed.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Volume collected</div><div style="position:relative;"><input inputmode="decimal" data-set="calMl" data-key="calMl" value="' + esc(s.calMl) + '" placeholder="0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 40px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">mL</span></div></div>' +
        '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Over</div><div style="position:relative;"><input inputmode="decimal" data-set="calSec" data-key="calSec" value="' + esc(s.calSec) + '" placeholder="0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 34px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">s</span></div></div>' +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:18px;">' +
        '<div><div style="font-size:10.5px;color:#94A099;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Measured</div><div style="font-size:16px;font-weight:700;font-family:\'IBM Plex Mono\';color:#16211F;">' + esc(cal.actual) + '</div></div>' +
        '<div><div style="font-size:10.5px;color:#94A099;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Target</div><div style="font-size:16px;font-weight:700;font-family:\'IBM Plex Mono\';color:#16211F;">' + esc(cal.target) + '</div></div>' +
        '<div><div style="font-size:10.5px;color:#94A099;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Deviation</div><div style="font-size:16px;font-weight:700;font-family:\'IBM Plex Mono\';color:' + cal.devColor + ';">' + esc(cal.dev) + '</div></div>' +
      '</div>' + calAdvice + '</div>';
  }

  App.screens.jars = function (v) {
    var s = App.state;
    var prodOpts = '<option value="">— select a product —</option>' + v.allProducts.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === s.jarProductId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var stockBlock = '';
    if (v.jarProductChosen) {
      stockBlock = '<div style="margin-top:12px;"><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:6px;">Stock strength — ' + esc(v.jarProduct.name) + ' <span style="color:#94A099;">(supplier make-down ' + esc(v.jarProduct.makedownText) + ')</span></div>' +
        '<div style="display:flex;gap:7px;flex-wrap:wrap;">' + v.stockOptions.map(function (o) { return '<button data-act="setStockStrength" data-v="' + esc(o.v) + '" style="' + o.style + '">' + esc(o.label) + '</button>'; }).join('') + '</div></div>' +
        '<div style="margin-top:12px;background:#16211F;border-radius:12px;padding:13px 14px;color:#EFECE3;">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/></svg><div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6E8A82;font-weight:700;">How to make this stock</div></div>' +
          '<ol style="margin:0;padding-left:17px;display:flex;flex-direction:column;gap:6px;">' + v.jarStockSteps.map(function (t) { return '<li style="font-size:12.8px;line-height:1.5;color:#DCE6E1;">' + esc(t) + '</li>'; }).join('') + '</ol></div>';
    }
    var jarRowsHtml = v.jarRows.map(function (j) {
      function cell(label, dataf, val, ph) {
        return '<div><div style="font-size:10px;color:#94A099;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">' + label + '</div>' +
          '<input ' + (dataf === 'floc' ? '' : 'inputmode="decimal" ') + 'data-actinput="onJarField" data-i="' + j.i + '" data-f="' + dataf + '" data-key="jar-' + j.i + '-' + dataf + '" value="' + esc(val) + '"' + (ph ? ' placeholder="' + ph + '"' : '') + ' style="width:100%;background:#FFF;border:1px solid #DBD5C8;border-radius:8px;padding:8px 6px;font-size:' + (dataf === 'floc' ? '13' : '14') + 'px;' + (dataf === 'floc' ? '' : "font-family:'IBM Plex Mono';") + 'font-weight:600;text-align:center;"></div>';
      }
      return '<div style="background:' + j.cardBg + ';border:1px solid ' + j.cardBorder + ';border-radius:14px;padding:12px 13px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
          '<button data-act="setWinner" data-i="' + j.i + '" style="border:none;background:none;cursor:pointer;padding:0;display:flex;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' + j.markColor + '" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="' + j.markFill + '" fill="' + j.markColor + '" stroke="none"/></svg></button>' +
          '<div style="font-size:14.5px;font-weight:700;">Jar ' + j.n + '</div>' +
          '<div style="margin-left:auto;text-align:right;"><span style="font-family:\'IBM Plex Mono\';font-size:16px;font-weight:600;color:#0C8577;">' + esc(j.ppm) + '</span><span style="font-size:11px;color:#94A099;font-weight:600;"> mg/L</span></div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;">' + cell('Dose mL', 'dose', j.dose) + cell('pH', 'ph', j.ph) + cell('NTU', 'turb', j.turb) + cell('Floc', 'floc', j.floc, '—') + '</div></div>';
    }).join('');
    // A jar mg/L is only a full-scale dose when the product doses mg/L on flow.
    // Dry-tonne-basis products (g/t · kg/t DS) get an explanation, not a send
    // button — there is no conversion without the plant's solids balance.
    var jarBasisMgL = !s.jarProductId || App.doseBasisOf(v.jarProduct) === 'mgL';
    var winnerHtml = v.hasWinner ? '<div style="margin-top:15px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
      '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6E8A82;font-weight:700;">Selected optimum — Jar ' + esc(v.winnerN) + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:8px;margin-top:5px;"><div style="font-family:\'IBM Plex Mono\';font-size:30px;font-weight:600;color:#4FE0B5;">' + esc(v.winnerPpm) + '</div><div style="font-size:13px;color:#9FB0AA;">' + (jarBasisMgL ? 'mg/L equivalent full-scale dose' : 'mg/L in the jar') + '</div></div>' +
      (jarBasisMgL
        ? '<button data-act="useWinner" style="margin-top:12px;width:100%;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:12px;padding:13px;font-size:14.5px;font-weight:700;">Send this dose to the calculator →</button>'
        : '<div style="margin-top:12px;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:10px 12px;font-size:12px;color:#DCE6E1;line-height:1.5;"><b>' + esc(v.jarProduct.name) + '</b> doses per tonne of dry solids at full scale (' + esc(v.jarProduct.doseUnit || '') + ') — a jar mg/L doesn’t convert to a plant dose without the solids balance. Use the sludge / mining playbook’s dry-solids tools instead.</div>') +
      '</div>' : '';
    var jarSaveForm = s.showJarSave ? ('<div style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E8A82;font-weight:700;margin-bottom:11px;">Save jar test</div>' +
      '<div style="font-size:11.5px;font-weight:600;color:#9FB0AA;margin-bottom:5px;">Attach to client (optional)</div>' +
      '<select data-set="jarSaveClient" data-key="jarSaveClient" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#FFF;appearance:none;margin-bottom:9px;"><option value="">— no client —</option>' + v.clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.jarSaveClient ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' +
      '<input data-set="jarSaveNote" data-key="jarSaveNote" value="' + esc(s.jarSaveNote) + '" placeholder="Note (e.g. raw water 45 NTU)" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:12px;font-size:13.5px;color:#EFECE3;margin-bottom:11px;">' +
      '<div style="display:flex;gap:9px;"><button data-act="cancelJarSave" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmJarSave" style="flex:2;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save test</button></div></div>') : '';
    var jarSaved = s.jarSaved ? '<div style="margin-top:10px;background:#ECF7F3;border:1px solid #B8E0D3;border-radius:12px;padding:11px 13px;font-size:12.5px;color:#17564C;font-weight:600;">✓ Test saved to your history below.</div>' : '';
    var jarSaveErr = s.jarSaveError ? '<div style="margin-top:10px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:12px;padding:11px 13px;font-size:12.5px;color:#8A3A24;line-height:1.45;font-weight:600;">' + esc(s.jarSaveError) + '</div>' : '';
    var historyHtml = v.hasJarTests ? ('<div style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6B776F;">Test history</div><div style="font-size:11px;color:#94A099;">newest first</div></div>' +
      '<div style="margin-top:9px;display:flex;flex-direction:column;gap:9px;">' + v.jarTestRows.map(function (t) {
        return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:13px 14px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="flex:1;min-width:0;"><div style="font-size:14.5px;font-weight:700;">' + esc(t.product) + '</div><div style="font-size:12px;color:#6B776F;margin-top:1px;">' + esc(t.who) + ' · ' + esc(t.date) + '</div></div>' +
          '<button data-act="deleteJarTest" data-id="' + esc(t.id) + '" style="border:none;background:none;cursor:pointer;padding:4px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0574A" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button></div>' +
          '<div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:6px;"><div style="background:#16211F;color:#4FE0B5;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;font-family:\'IBM Plex Mono\';">' + esc(t.winner) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(t.setup) + '</div></div>' +
          (t.note ? '<div style="margin-top:8px;font-size:12.5px;color:#6B776F;line-height:1.45;">' + esc(t.note) + '</div>' : '') + '</div>';
      }).join('') + '</div>') : '';

    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Field test</div>' +
      '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 4px;">Jar Test</div>' +
      '<div style="font-size:13px;color:#6B776F;line-height:1.5;">Dose a set of jars with increasing amounts of stock solution, record how each performs, then carry the winning dose straight into the calculator.</div>' +
      '<div style="margin-top:15px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:8px;">Product for this test</div>' +
        comboHtml({
          name: 'jarProduct', open: v.jarProductPickerOpen, query: v.jarProductPickerQuery, setKey: 'jarProductPickerQuery',
          toggleAct: 'toggleJarProductPicker', pickAct: 'pickJarProduct',
          selectedLabel: v.selectedJarProductLabel, hasSelection: !!s.jarProductId,
          includeNone: true, noneLabel: '— select a product —', searchPlaceholder: 'Search product, brand or charge…',
          items: v.filteredJarProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.jarProductId }; })
        }) + stockBlock + '</div>' +
      '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:10px;">Test setup</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Jar volume</div><div style="position:relative;"><input inputmode="decimal" data-set="jarVol" data-key="jarVol" value="' + esc(s.jarVol) + '" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 40px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">mL</span></div></div>' +
          '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Stock strength</div><div style="position:relative;"><input inputmode="decimal" data-set="stockPct" data-key="stockPct" value="' + esc(s.stockPct) + '" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 32px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">%</span></div></div>' +
        '</div>' +
        '<div style="margin-top:10px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#17564C;line-height:1.5;">' + esc(v.stockPrep) + '</div>' +
        '<div style="margin-top:12px;"><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Optimisation retest — current full-scale dose</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<div style="position:relative;flex:1;"><input inputmode="decimal" data-set="jarCurrentDose" data-key="jarCurrentDose" value="' + esc(s.jarCurrentDose) + '" placeholder="e.g. 5" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 44px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:11px;color:#94A099;font-weight:600;">mg/L</span></div>' +
            '<button data-act="bracketJars" style="flex-shrink:0;border:1px solid #0C8577;background:#FFF;color:#0C8577;border-radius:10px;padding:0 13px;font-size:12.5px;font-weight:700;cursor:pointer;">Bracket 50–150%</button></div>' +
          '<div style="margin-top:6px;font-size:11px;color:#94A099;line-height:1.45;">Sets the jars to 50 / 75 / 100 / 125 / 150% of what the plant doses today — the troubleshooting bracket from the field-playbooks brief.</div>' +
          (s.bracketNote ? '<div style="margin-top:7px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:9px;padding:8px 11px;font-size:11.5px;color:#8A3A24;line-height:1.45;">' + esc(s.bracketNote) + '</div>' : '') + '</div></div>' +
      '<div style="margin-top:15px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6B776F;">Jars</div><div style="font-size:11px;color:#94A099;">tap ◎ to mark the winner</div></div>' +
      '<div style="margin-top:9px;display:flex;flex-direction:column;gap:10px;">' + jarRowsHtml + '</div>' +
      '<div style="margin-top:11px;display:flex;gap:9px;"><button data-act="addJar" style="flex:1;border:1px solid #D8D2C4;background:#FFF;cursor:pointer;border-radius:11px;padding:11px;font-size:13.5px;font-weight:700;color:#16211F;">+ Add jar</button><button data-act="removeJar" style="flex:1;border:1px solid #D8D2C4;background:#FFF;cursor:pointer;border-radius:11px;padding:11px;font-size:13.5px;font-weight:700;color:#6B776F;">– Remove last</button></div>' +
      winnerHtml +
      '<button data-act="startJarSave" style="margin-top:14px;width:100%;border:1px solid #0C8577;cursor:pointer;background:#FFF;color:#0C8577;border-radius:14px;padding:14px;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Save this test</button>' +
      jarSaveForm + jarSaveErr + jarSaved + historyHtml +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12.5px;color:#6B776F;line-height:1.55;"><b style="color:#16211F;">Reading the test.</b> The best dose is usually the <i>lowest</i> one that gives clear water, fast-settling floc and stable pH — overdosing wastes product and can re-stabilise (re-suspend) the solids. Note floc as pinpoint / small / medium / large.</div>' +
    '</div>';
  };

  App.screens.pumps = function (v) {
    var s = App.state;
    var formHtml = s.showPumpForm ? pumpFormHtml(s) : '';
    var rowsHtml = v.pumpRows.map(function (p) {
      var rm = p.removable ? '<button data-act="removePump" data-id="' + esc(p.id) + '" style="border:none;background:none;cursor:pointer;padding:2px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0574A" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>' : '';
      function box(label, val) { return '<div style="background:#F6F3EC;border-radius:9px;padding:8px 10px;"><div style="font-size:10px;color:#94A099;font-weight:700;text-transform:uppercase;">' + label + '</div><div style="font-size:14px;font-weight:700;font-family:\'IBM Plex Mono\';margin-top:1px;">' + esc(val) + '</div></div>'; }
      var aiNote = p.ai ? '<div style="margin-top:9px;background:#F3EFFA;border:1px solid #DDD1F0;border-radius:9px;padding:8px 11px;font-size:11.5px;color:#6A4CA0;line-height:1.45;">AI-retrieved from model knowledge — <b>verify against the official datasheet</b> before sizing a pump on these figures.</div>' : '';
      var srcNote = (p.source && !p.ai) ? '<div style="margin-top:8px;font-size:11px;color:#94A099;line-height:1.4;">Source: ' + esc(p.source) + '</div>' : '';
      return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:15px;padding:14px 15px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div style="font-size:15.5px;font-weight:700;">' + esc(p.model) + ' ' + vbadge(p.verified) + '</div><div style="font-size:12px;color:#6B776F;">' + esc(p.brand) + ' · ' + esc(p.type) + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px;"><div style="background:' + esc(p.tint) + ';color:' + esc(p.tintText) + ';border-radius:8px;padding:4px 9px;font-size:11px;font-weight:700;font-family:\'IBM Plex Mono\';">' + esc(p.tag) + '</div>' + rm + '</div></div>' +
        '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' + box('Max flow', p.maxFlow) + box('Max press', p.maxPress) +
          '<div style="background:#F6F3EC;border-radius:9px;padding:8px 10px;"><div style="font-size:10px;color:#94A099;font-weight:700;text-transform:uppercase;">Control</div><div style="font-size:13px;font-weight:700;margin-top:1px;">' + esc(p.control) + '</div></div></div>' +
        (p.note ? '<div style="margin-top:9px;font-size:12.5px;color:#6B776F;line-height:1.5;">' + esc(p.note) + '</div>' : '') + srcNote + aiNote + '</div>';
    }).join('');
    var noMatch = v.noPumpMatch ? ('<div style="margin-top:8px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:16px;text-align:center;"><div style="font-size:13px;color:#6B776F;line-height:1.5;">Not in your local repository yet.</div>' +
      '<button data-act="lookupPump" style="margin-top:12px;width:100%;border:none;cursor:pointer;background:#16211F;color:#EFECE3;border-radius:12px;padding:13px;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z"/><path d="M9 21h6"/></svg>Look up “' + esc(s.pumpQuery) + '” specs</button>' +
      '<div style="margin-top:8px;font-size:11.5px;color:#94A099;line-height:1.4;">Pulls typical specs for this model and saves it to your device (needs a connection); otherwise opens the manual form pre-filled.</div></div>') : '';
    var loadingHtml = s.pumpLoading ? '<div style="margin-top:8px;background:#16211F;border-radius:12px;padding:15px;text-align:center;color:#9FB0AA;font-size:13px;display:flex;align-items:center;justify-content:center;gap:10px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4FE0B5" stroke-width="2" style="animation:spin 0.9s linear infinite;"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>Looking up “' + esc(s.pumpQuery) + '”…</div>' : '';
    var errHtml = s.pumpError ? '<div style="margin-top:8px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:12px;padding:13px 14px;font-size:12.5px;color:#8A3A24;line-height:1.5;">' + esc(s.pumpError) + '</div>' : '';
    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Equipment</div>' +
      '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 12px;">Dosing Pumps</div>' +
      '<div style="position:relative;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A099" stroke-width="2" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
        '<input data-set="pumpQuery" data-key="pumpQuery" value="' + esc(s.pumpQuery) + '" placeholder="Search model or brand…" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 13px 13px 40px;font-size:14.5px;font-weight:500;"></div>' +
      '<button data-act="startAddPump" style="margin-top:12px;width:100%;border:1px dashed #C6BFAF;background:#FBF9F4;cursor:pointer;border-radius:12px;padding:12px;font-size:13.5px;font-weight:700;color:#4B564F;display:flex;align-items:center;justify-content:center;gap:7px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Add a pump manually</button>' +
      formHtml +
      '<div style="margin-top:13px;display:flex;flex-direction:column;gap:10px;">' + rowsHtml + '</div>' + noMatch + loadingHtml + errHtml +
      '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:12px;padding:13px 14px;font-size:12.5px;color:#6B776F;line-height:1.55;"><b style="color:#16211F;">Building your library.</b> Search any model — if it\'s not stored, add it manually from the datasheet. Always confirm max flow and back-pressure against the maker\'s datasheet; those drive the calculator\'s % stroke.</div>' +
    '</div>';
  };
  function pumpFormHtml(s) {
    var n = s.npu;
    function pf(dataf, val, ph, extra) { return '<input data-actinput="onNpuField" data-f="' + dataf + '" data-key="npu-' + dataf + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '" style="' + (extra || 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;') + '">'; }
    return '<div style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E8A82;font-weight:700;margin-bottom:12px;">New pump</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;">' +
        pf('model', n.model, 'Model (required)', 'width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:14px;font-weight:600;color:#FFF;') +
        pf('brand', n.brand, 'Brand / maker') +
        '<select data-actchange="onNpuField" data-f="type" data-key="npu-type" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#FFF;appearance:none;">' + optionTags([{ v: 'Solenoid diaphragm' }, { v: 'Motor diaphragm' }, { v: 'Digital diaphragm' }, { v: 'Peristaltic' }, { v: 'Progressive cavity' }], n.type, 'v', 'v') + '</select>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' + pf('maxFlow', n.maxFlow, 'Max flow e.g. 30 L/h', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;') + pf('maxPress', n.maxPress, 'Max press e.g. 16 bar', 'background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;') + '</div>' +
        pf('control', n.control, 'Control (Digital / pulse / stroke)') +
        '<textarea data-actinput="onNpuField" data-f="note" data-key="npu-note" placeholder="Notes (optional)" rows="2" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:13.5px;color:#EFECE3;resize:vertical;">' + esc(n.note) + '</textarea>' +
      '</div>' +
      '<div style="display:flex;gap:9px;margin-top:12px;"><button data-act="cancelAddPump" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmAddPump" style="flex:2;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save pump</button></div></div>';
  }

  App.screens.clients = function (v) {
    var s = App.state;
    var addForm = s.showClientForm ? ('<div style="margin-top:15px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E8A82;font-weight:700;margin-bottom:11px;">New client from current calc</div>' +
      '<input data-set="clientName" data-key="clientName" value="' + esc(s.clientName) + '" placeholder="Client / company name" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:11px;padding:12px;font-size:15px;font-weight:600;color:#FFF;margin-bottom:9px;">' +
      '<input data-set="clientSite" data-key="clientSite" value="' + esc(s.clientSite) + '" placeholder="Site / plant (optional)" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:11px;padding:12px;font-size:14px;color:#EFECE3;margin-bottom:11px;">' +
      '<div style="font-size:12px;color:#9FB0AA;line-height:1.5;margin-bottom:12px;">' + esc(v.clientPreview) + '</div>' +
      '<div style="display:flex;gap:9px;"><button data-act="cancelClient" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmClient" style="flex:2;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save client</button></div>' +
      (s.clientSaveError ? '<div style="margin-top:10px;background:#3A2320;border:1px solid #6B3A2E;border-radius:10px;padding:10px 12px;font-size:12px;color:#F0B7A8;line-height:1.45;font-weight:600;">' + esc(s.clientSaveError) + '</div>' : '') + '</div>') : '';
    var listHtml = v.hasClients ? ('<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">' + v.clients.map(function (c) {
      var testLine = c.hasTests ? '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:12px;color:#0C8577;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/></svg>' + esc(c.testLabel) + '</div>' : '';
      var chipsLine = c.hasCalc ? '<div style="margin-top:11px;display:flex;flex-wrap:wrap;gap:6px;"><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip1) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip2) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip3) + '</div></div>' : '';
      var readingsLine = c.nReadings ? ('<div style="margin-top:9px;display:flex;flex-direction:column;gap:5px;">' + c.readings.map(function (r) {
        return '<div style="background:#FBF9F4;border:1px solid #EFEBE2;border-radius:9px;padding:7px 10px;font-size:11.5px;color:#4B564F;line-height:1.45;"><span style="font-family:\'IBM Plex Mono\';font-weight:600;color:#0C8577;">☰</span> ' + esc(r) + '</div>';
      }).join('') + (c.nReadings > 2 ? '<div style="font-size:11px;color:#94A099;padding-left:2px;">+ ' + (c.nReadings - 2) + ' earlier reading set' + (c.nReadings - 2 === 1 ? '' : 's') + '</div>' : '') + '</div>') : '';
      var loadBtn = c.hasCalc ? '<button data-act="loadClient" data-id="' + esc(c.id) + '" style="margin-top:12px;width:100%;border:1px solid #0C8577;cursor:pointer;background:#FFF;color:#0C8577;border-radius:11px;padding:11px;font-size:14px;font-weight:700;">Load into calculator</button>' : '';
      return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:15px;padding:14px 15px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="flex:1;min-width:0;"><div style="font-size:16px;font-weight:700;">' + esc(c.name) + '</div><div style="font-size:12.5px;color:#6B776F;margin-top:1px;">' + esc(c.site) + '</div></div>' +
        '<button data-act="deleteClient" data-id="' + esc(c.id) + '" style="border:none;background:none;cursor:pointer;padding:4px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C0574A" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button></div>' +
        chipsLine + readingsLine + testLine + loadBtn + '</div>';
    }).join('') + '</div>') : '';
    var empty = v.noClients ? '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:14px;padding:18px;font-size:13px;color:#6B776F;line-height:1.5;text-align:center;">No clients yet. Go to the Dosing Calc, enter a site\'s flow and product, and tap <b style="color:#16211F">Save as client</b>.</div>' : '';
    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Saved locally</div>' +
      '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 4px;">Clients &amp; Sites</div>' +
      '<div style="font-size:13px;color:#6B776F;line-height:1.5;">Each saved client stores its flow, product, dose and solution setup so you can recall it in one tap next visit. Stored on this device only.</div>' +
      addForm + listHtml + empty +
    '</div>';
  };

  // ============================ GUIDE (playbooks) ===========================
  function guideSrcNote(extra) {
    var src = (window.PLAYBOOKS && window.PLAYBOOKS.source) || '';
    return '<div style="margin-top:16px;font-size:11px;color:#94A099;line-height:1.5;">' + esc(src) + (extra ? ' ' + extra : '') + '</div>';
  }

  App.screens.guide = function (v) {
    var PB = window.PLAYBOOKS;
    // playbooks.js can be missing after a partial offline update — degrade to a
    // message instead of throwing mid-render (which would freeze the screen)
    if (!PB) {
      return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
        '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 8px;">Field Playbooks</div>' +
        '<div style="background:#FBF6EC;border:1px solid #EBD9BC;border-radius:14px;padding:14px 15px;font-size:13px;color:#6B5A38;line-height:1.55;">The playbooks module didn’t load on this device — likely a partly-applied update while offline. Go online once, then pull to refresh; the rest of the app keeps working meanwhile.</div></div>';
    }
    var chain = PB.chain.map(function (step, i) {
      return '<span style="flex-shrink:0;background:#16211F;color:#4FE0B5;border-radius:8px;padding:6px 10px;font-family:\'IBM Plex Mono\';font-size:11px;font-weight:600;">' + esc(step) + '</span>' +
        (i < PB.chain.length - 1 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A099" stroke-width="2.4" style="flex-shrink:0;"><path d="M9 18l6-6-6-6"/></svg>' : '');
    }).join('');
    var cards = PB.list.map(function (g) {
      return '<button data-act="openGuide" data-id="' + esc(g.id) + '" style="text-align:left;cursor:pointer;background:#FFF;border:1px solid #E2DDD0;border-radius:16px;padding:14px 15px;display:flex;gap:13px;align-items:center;">' +
        '<div style="width:44px;height:44px;flex-shrink:0;border-radius:12px;background:' + esc(g.tint) + ';display:flex;align-items:center;justify-content:center;font-family:\'IBM Plex Mono\';font-weight:600;font-size:12px;color:' + esc(g.tintText) + ';">' + esc(g.tag) + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:15.5px;font-weight:700;">' + esc(g.name) + '</div>' +
        '<div style="font-size:12px;color:#6B776F;margin-top:1px;">' + esc(g.mech) + '</div></div>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B4BBB4" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>';
    }).join('');
    var l2rows = PB.kit.l2.map(function (r) {
      return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #F0EDE4;"><div style="width:118px;flex-shrink:0;font-size:12.5px;font-weight:700;color:#16211F;">' + esc(r.m) + '</div><div style="flex:1;font-size:12.5px;color:#6B776F;line-height:1.45;">' + esc(r.t) + '</div></div>';
    }).join('');
    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Field playbooks</div>' +
      '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 4px;">Application Guide</div>' +
      '<div style="font-size:13px;color:#6B776F;line-height:1.5;">Drinking water, sewage, industrial effluent and mineral slurries fail differently. Pick the application, measure the right surrogates, and let them narrow the product family and dose range — then confirm with a quick field test.</div>' +
      '<div style="margin-top:13px;display:flex;align-items:center;gap:6px;overflow-x:auto;padding-bottom:4px;" class="scroll">' + chain + '</div>' +
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' + cards + '</div>' +
      '<div style="margin-top:15px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
        '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6E8A82;font-weight:700;">Operating rule</div>' +
        '<div style="font-size:15px;font-weight:700;line-height:1.5;margin-top:6px;color:#4FE0B5;">' + esc(PB.rule) + '</div></div>' +
      '<div style="margin-top:18px;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6B776F;">Field kit levels</div>' +
      '<div style="margin-top:9px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;">Level 1 — carry always</div>' +
        '<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:6px;">' + PB.kit.l1.map(function (t) { return '<span style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(t) + '</span>'; }).join('') + '</div></div>' +
      '<div style="margin-top:10px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:4px;">Level 2 — add per application</div>' + l2rows + '</div>' +
      '<div style="margin-top:10px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;">Level 3 — occasional lab calibration</div>' +
        '<div style="font-size:12px;color:#6B776F;line-height:1.5;margin:5px 0 7px;">Representative samples only — used to calibrate and validate the field system, not for every call.</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + PB.kit.l3.map(function (t) { return '<span style="background:#FBF9F4;border:1px solid #E2DDD0;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#4B564F;">' + esc(t) + '</span>'; }).join('') + '</div></div>' +
      guideSrcNote('') +
    '</div>';
  };

  App.screens.guideDetail = function (v) {
    var g = v.guide, s = App.state;
    if (!g) return App.screens.guide(v);

    var outputsHtml = g.outputs ? ('<div style="margin-top:14px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
      '<div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:8px;">What this playbook predicts</div>' +
      '<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">' + g.outputs.map(function (t) { return '<li style="font-size:13px;line-height:1.5;color:#333E39;">' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div style="margin-top:9px;font-size:11.5px;color:#94A099;line-height:1.45;">…then the recommendation is checked with a compact jar test — the prediction never ships on its own.</div></div>') : '';

    var measureHtml = '';
    if (g.measure && g.measure.length) {
      var items = g.measure.map(function (m, i) {
        var k = g.id + ':' + i;
        var done = !!s.guideChecks[k];
        return '<button data-act="toggleGuideCheck" data-ck="' + esc(k) + '" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;padding:8px 0;display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid #F0EDE4;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + (done ? '#0C8577' : '#B4BBB4') + '" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="9"/>' + (done ? '<path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="#0C8577"/>' : '') + '</svg>' +
          '<span style="min-width:0;"><span style="display:block;font-size:13.5px;font-weight:600;color:' + (done ? '#94A099' : '#16211F') + ';' + (done ? 'text-decoration:line-through;' : '') + '">' + esc(m.n) + '</span>' +
          (m.why ? '<span style="display:block;font-size:11.5px;color:#94A099;line-height:1.4;">' + esc(m.why) + '</span>' : '') + '</span></button>';
      }).join('');
      measureHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div style="font-size:12.5px;font-weight:700;color:#4B564F;">Measure in the field</div><div style="font-size:11px;color:#94A099;">tap to tick off</div></div>' + items + '</div>';
    }

    var subsHtml = '';
    if (g.subs) {
      subsHtml = '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">' + g.subs.map(function (sub) {
        return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
          '<div style="font-size:14px;font-weight:700;">' + esc(sub.title) + '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#17564C;background:#F0F6F3;border-radius:9px;padding:8px 11px;line-height:1.5;"><b>Measure:</b> ' + esc(sub.m) + '</div>' +
          '<div style="margin-top:8px;font-size:12.5px;color:#6B776F;line-height:1.5;">' + esc(sub.note) + '</div></div>';
      }).join('') + '</div>';
    }

    var endpointsHtml = '<div style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
      g.endpointGroups.map(function (grp, gi) {
        return (gi > 0 ? '<div style="margin-top:13px;padding-top:12px;border-top:1px solid #2C3B37;"></div>' : '') +
          '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6E8A82;font-weight:700;">Confirm in the field — ' + esc(grp.title) + '</div>' +
          '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">' + grp.items.map(function (t) { return '<span style="background:#202E2A;border:1px solid #35453F;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#DCE6E1;">' + esc(t) + '</span>'; }).join('') + '</div>';
      }).join('') + '</div>';

    var db = g.doseBasis;
    var doseHtml = '<div style="margin-top:12px;background:#FBF6EC;border:1px solid #EBD9BC;border-radius:14px;padding:14px 15px;">' +
      '<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8A5E17;font-weight:700;">Dose basis</div>' +
      '<div style="font-family:\'IBM Plex Mono\';font-size:17px;font-weight:600;color:#5C4A24;margin-top:5px;">' + esc(db.label) + '</div>' +
      '<div style="font-size:12.5px;color:#6B5A38;line-height:1.55;margin-top:6px;">' + esc(db.body) + '</div>' +
      (db.formulas ? '<div style="margin-top:9px;display:flex;flex-direction:column;gap:5px;">' + db.formulas.map(function (f) { return '<div style="background:#FFF;border:1px solid #EBD9BC;border-radius:9px;padding:8px 11px;font-family:\'IBM Plex Mono\';font-size:12px;font-weight:600;color:#5C4A24;">' + esc(f) + '</div>'; }).join('') + '</div>' : '') + '</div>';

    var benchHtml = '';
    if (g.bench) {
      var b = App.computeBench();
      function bfld(label, key, val, unit) {
        return '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">' + label + '</div>' +
          '<div style="position:relative;"><input inputmode="decimal" data-set="' + key + '" data-key="' + key + '" value="' + esc(val) + '" placeholder="0" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px ' + (unit.length > 2 ? '52' : '38') + 'px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:11px;color:#94A099;font-weight:600;">' + unit + '</span></div></div>';
      }
      benchHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;">Bench dose calculator</div>' +
        '<div style="font-size:12px;color:#6B776F;line-height:1.5;margin:4px 0 11px;">Dose a measuring-cylinder settling test, then convert what you added into g/t dry solids.</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          bfld('Slurry sample', 'mgSample', s.mgSample, 'g') +
          bfld('Solids', 'mgSolids', s.mgSolids, '% w/w') +
          bfld('Stock strength', 'mgStock', s.mgStock, '% w/v') +
          bfld('Stock added', 'mgMl', s.mgMl, 'mL') +
        '</div>' +
        '<div style="margin-top:12px;background:#16211F;border-radius:12px;padding:13px 14px;color:#EFECE3;display:flex;gap:18px;">' +
          '<div><div style="font-size:10.5px;color:#6E8A82;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Dry solids</div><div style="font-size:16px;font-weight:600;font-family:\'IBM Plex Mono\';color:#EFECE3;">' + esc(b.dryG) + ' g</div></div>' +
          '<div><div style="font-size:10.5px;color:#6E8A82;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Active polymer</div><div style="font-size:16px;font-weight:600;font-family:\'IBM Plex Mono\';color:#EFECE3;">' + esc(b.activeMg) + ' mg</div></div>' +
          '<div><div style="font-size:10.5px;color:#6E8A82;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Dose</div><div style="font-size:16px;font-weight:600;font-family:\'IBM Plex Mono\';color:#4FE0B5;">' + esc(b.doseGt) + ' g/t</div></div>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#94A099;line-height:1.45;">Stock at 0.1% w/v = 1 mg active per mL. Dose basis is dry solids, so the answer is comparable across slurry concentrations.</div></div>';
    }

    // Site readings — every playbook. Values come from the plant visit and can
    // be saved against a client to build site history over time.
    var readingsHtml = '';
    if (g.fields && g.fields.length) {
      var fieldCells = g.fields.map(function (f) {
        var key = g.id + ':' + f.k;
        var val = s.guideReadings[key] || '';
        return '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">' + esc(f.label) + '</div>' +
          '<div style="position:relative;"><input inputmode="decimal" data-actinput="onGuideReading" data-f="' + esc(key) + '" data-key="' + esc(key) + '" value="' + esc(val) + '" placeholder="—" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px ' + (f.u ? '58' : '11') + 'px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;">' + (f.u ? '<span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:10.5px;color:#94A099;font-weight:600;">' + esc(f.u) + '</span>' : '') + '</div></div>';
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
            ? '<div style="margin-top:10px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#17564C;line-height:1.5;"><b>Particulate COD ≈ ' + App.fmt(pc, 0) + ' mg/L</b> (total − filtered) — the fraction coagulation captures readily.</div>'
            : '<div style="margin-top:10px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#8A3A24;line-height:1.5;">Filtered COD exceeds total COD — recheck one of the two readings.</div>';
        }
      }
      var clientOpts = '<option value="">— save to existing client —</option>' + v.clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.guideSaveClient ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
      // target select + name go through handlers that clear guideSaved: the
      // '✓ Saved' banner must never survive an edit it doesn't cover. The button
      // disables while guideSaved — that (not value-comparison) is the
      // double-tap guard; any edit re-enables it.
      var saveRow = '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<select data-actchange="onGuideProgSelect" data-f="guideSaveClient" data-key="guideSaveClient" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:10px;padding:11px 9px;font-size:13px;font-weight:600;color:#16211F;appearance:none;">' + clientOpts + '</select>' +
        '<input data-actinput="onGuideProgField" data-f="guideSaveName" data-key="guideSaveName" value="' + esc(s.guideSaveName) + '" placeholder="…or new client name" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px;font-size:13px;font-weight:500;">' +
        '</div>' +
        '<button data-act="saveGuideReadings" ' + (s.guideSaved ? 'disabled ' : '') + 'style="margin-top:9px;width:100%;border:1px solid ' + (s.guideSaved ? '#C9D2CD' : '#0C8577') + ';cursor:pointer;background:#FFF;color:' + (s.guideSaved ? '#B4BBB4' : '#0C8577') + ';border-radius:11px;padding:12px;font-size:13.5px;font-weight:700;">Save readings to client</button>' +
        (s.guideSaveError ? '<div style="margin-top:8px;background:#FBEBE7;border:1px solid #E9C4B9;border-radius:10px;padding:9px 12px;font-size:12px;color:#8A3A24;line-height:1.45;font-weight:600;">' + esc(s.guideSaveError) + '</div>' : '') +
        (s.guideSaved ? '<div style="margin-top:8px;background:#ECF7F3;border:1px solid #B8E0D3;border-radius:10px;padding:9px 12px;font-size:12px;color:#17564C;font-weight:600;">✓ Saved — dated ' + esc(new Date().toLocaleDateString('en-AU')) + ', see the client card.</div>' : '');
      readingsHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;">Site readings</div>' +
        '<div style="font-size:12px;color:#6B776F;line-height:1.5;margin:4px 0 11px;">From the plant visit. Save them against the client to build site history — repeat visits show what changed.</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + fieldCells + '</div>' + computedLine + saveRow + '</div>';
    }

    // Current dosing programme — what the plant runs today (product, rate, flow).
    // Grounded: window check against the library datasheet range, consumption is
    // flow × dose arithmetic; both save to the client with the readings.
    var progHtml = '';
    if (g.fields && g.fields.length) {
      var prog = App.computeProg();
      var unitSel = '<select data-actchange="onGuideProgSelect" data-f="guideProgDoseUnit" data-key="guideProgDoseUnit" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 26px 0 10px;font-size:12px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 9px center;">' +
        optionTags(App.DOSE_UNITS, s.guideProgDoseUnit, 'v', 'label') + '</select>';
      var flowSel = '<select data-actchange="onGuideProgSelect" data-f="guideProgFlowUnit" data-key="guideProgFlowUnit" style="border:none;border-left:1px solid #E2DDD0;background:#F6F3EC;padding:0 26px 0 10px;font-size:12px;font-weight:700;color:#4B564F;appearance:none;cursor:pointer;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 9px center;">' +
        optionTags(App.FLOW_UNITS, s.guideProgFlowUnit, 'v', 'label') + '</select>';
      var winHtml = '';
      if (prog.win) {
        winHtml = doseWindowBanner(prog.win, 'Their rate');
      } else if (prog.unitMismatch) {
        winHtml = doseWindowBanner({
          mismatch: true, name: (prog.product || {}).name || '',
          rawUnit: (prog.product || {}).doseUnit || '', note: (prog.product || {}).doseNote || ''
        }, 'The entered dose unit');
      }
      var consHtml = prog.hasCons ? '<div style="margin-top:9px;background:#16211F;border-radius:10px;padding:11px 13px;color:#EFECE3;">' +
        '<div style="display:flex;gap:22px;">' +
        '<div><div style="font-size:10.5px;color:#6E8A82;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Product use</div><div style="font-size:15px;font-weight:600;font-family:\'IBM Plex Mono\';color:#4FE0B5;white-space:nowrap;">' + esc(prog.kgH) + ' kg/h</div></div>' +
        '<div><div style="font-size:10.5px;color:#6E8A82;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Per day</div><div style="font-size:15px;font-weight:600;font-family:\'IBM Plex Mono\';color:#4FE0B5;white-space:nowrap;">' + esc(prog.kgDay) + ' kg</div></div>' +
        '</div>' +
        '<div style="margin-top:6px;font-size:11px;color:#9FB0AA;line-height:1.4;">flow × dose, neat product basis</div></div>' : '';
      var progBtns = '<div style="margin-top:11px;display:flex;gap:8px;">' +
        '<button data-act="guideProgToCalc" ' + (prog.canSend ? '' : 'disabled ') + 'style="flex:1;border:none;cursor:pointer;background:' + (prog.canSend ? '#0C8577' : '#C9D2CD') + ';color:#FFF;border-radius:11px;padding:12px 8px;font-size:13px;font-weight:700;">Send to calculator</button>' +
        '<button data-act="guideProgRetest" ' + (prog.canRetest ? '' : 'disabled ') + 'style="flex:1;border:1px solid ' + (prog.canRetest ? '#0C8577' : '#C9D2CD') + ';cursor:pointer;background:#FFF;color:' + (prog.canRetest ? '#0C8577' : '#B4BBB4') + ';border-radius:11px;padding:12px 8px;font-size:13px;font-weight:700;">Retest 50–150% in jars</button></div>' +
        (prog.canRetest ? '' : '<div style="margin-top:6px;font-size:10.5px;color:#94A099;">Retest bracketing works on mg/L doses (jar tests dose on flow).</div>');
      progHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;">Current dosing programme</div>' +
        '<div style="font-size:12px;color:#6B776F;line-height:1.5;margin:4px 0 11px;">What the plant runs today — their product, rate and flow. Saves with the readings; checks the rate against the datasheet window.</div>' +
        comboHtml({
          name: 'guideProduct', open: v.guideProgPickerOpen, query: v.guideProgPickerQuery, setKey: 'guideProgPickerQuery',
          toggleAct: 'toggleGuideProgPicker', pickAct: 'pickGuideProgProduct',
          selectedLabel: v.selectedGuideProgLabel, hasSelection: !!s.guideProgProductId,
          includeNone: true, noneLabel: '— not in library / unknown —', searchPlaceholder: 'Search product, brand or charge…',
          items: v.filteredGuideProgProducts.map(function (p) { return { id: p.id, label: p.name, sub: p.subtitle, tag: p.tag, tint: p.tint, tintText: p.tintText, selected: p.id === s.guideProgProductId }; })
        }) +
        '<div style="margin-top:6px;font-size:10.5px;color:#94A099;line-height:1.4;">Product not listed? Add it under Products → “Add your own product”, then pick it here.</div>' +
        '<div style="margin-top:10px;display:flex;flex-direction:column;gap:10px;">' +
          '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Current dose rate</div>' +
            '<div style="display:flex;border:1px solid #D8D2C4;border-radius:10px;background:#FBF9F4;overflow:hidden;"><input inputmode="decimal" data-actinput="onGuideProgField" data-f="guideProgDose" data-key="guideProgDose" value="' + esc(s.guideProgDose) + '" placeholder="—" style="flex:1;min-width:0;border:none;background:transparent;padding:11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;">' + unitSel + '</div></div>' +
          '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Plant / feed flow</div>' +
            '<div style="display:flex;border:1px solid #D8D2C4;border-radius:10px;background:#FBF9F4;overflow:hidden;"><input inputmode="decimal" data-actinput="onGuideProgField" data-f="guideProgFlow" data-key="guideProgFlow" value="' + esc(s.guideProgFlow) + '" placeholder="—" style="flex:1;min-width:0;border:none;background:transparent;padding:11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;">' + flowSel + '</div></div>' +
        '</div>' + winHtml + consHtml + progBtns + '</div>';
    }

    var tdiHtml = '';
    if (g.tdi) {
      var tdi = App.computeTdi(g.id);
      var flagRows = tdi.rows.map(function (r) {
        return '<div style="background:' + r.bg + ';border-radius:10px;padding:9px 12px;">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;"><span style="font-size:12.5px;font-weight:700;color:' + r.fg + ';">' + esc(r.label) + '</span><span style="font-size:12px;font-weight:700;font-family:\'IBM Plex Mono\';color:' + r.fg + ';flex-shrink:0;">' + esc(r.lvl) + '</span></div>' +
          '<div style="font-size:11.5px;color:' + r.fg + ';opacity:.85;line-height:1.45;margin-top:2px;">' + esc(r.note) + '</div></div>';
      }).join('');
      tdiHtml = '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="display:flex;align-items:center;gap:7px;"><div style="font-size:12.5px;font-weight:700;color:#4B564F;">Demand snapshot (TDI)</div>' + vbadge('example') + '</div>' +
        '<div style="font-size:12px;color:#6B776F;line-height:1.5;margin-top:4px;">Reads the site readings above and flags where the chemical demand is coming from. Band thresholds are illustrative demo values; calibrate against your own jar-test history before relying on them.</div>' +
        (tdi.hasAny ? '<div style="margin-top:11px;display:flex;flex-direction:column;gap:7px;">' + flagRows + '</div>' : '<div style="margin-top:11px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:10px;padding:11px 12px;font-size:12px;color:#94A099;text-align:center;">Enter turbidity, UV254, alkalinity or pH above to see the flags.</div>') +
        (tdi.summary ? '<div style="margin-top:9px;background:#16211F;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#DCE6E1;line-height:1.5;">' + esc(tdi.summary) + '</div>' : '') + '</div>';
    }

    var cautionsHtml = (g.cautions && g.cautions.length) ? ('<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">' + g.cautions.map(function (t) {
      return '<div style="background:#FBF6EC;border:1px solid #EBD9BC;border-radius:12px;padding:11px 13px;font-size:12.5px;line-height:1.5;color:#6B5A38;"><b style="color:#8A5E17;">Caution.</b> ' + esc(t) + '</div>';
    }).join('') + '</div>') : '';

    var productBtns = (g.products || []).map(function (p) {
      return '<button data-act="guideToProducts" data-v="' + esc(p.filter) + '" style="width:100%;border:1px solid #0C8577;cursor:pointer;background:#FFF;color:#0C8577;border-radius:13px;padding:13px;font-size:14px;font-weight:700;">' + esc(p.label) + ' →</button>';
    }).join('');
    var actionBtns = (g.actions || []).map(function (a) {
      return '<button data-act="' + esc(a.act) + '" style="width:100%;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:13px;padding:13px;font-size:14px;font-weight:700;">' + esc(a.label) + '</button>';
    }).join('');
    var linksHtml = (productBtns || actionBtns) ? '<div style="margin-top:14px;display:flex;flex-direction:column;gap:9px;">' + actionBtns + productBtns + '</div>' : '';

    return '<div style="padding:18px 18px 30px;animation:fadeUp .3s ease;">' +
      '<button data-act="backToGuide" style="border:none;background:none;cursor:pointer;color:#0C8577;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:5px;margin-bottom:14px;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg> Playbooks</button>' +
      '<div style="display:flex;gap:14px;align-items:center;">' +
        '<div style="width:56px;height:56px;flex-shrink:0;border-radius:15px;background:' + esc(g.tint) + ';display:flex;align-items:center;justify-content:center;font-family:\'IBM Plex Mono\';font-weight:600;font-size:14px;color:' + esc(g.tintText) + ';">' + esc(g.tag) + '</div>' +
        '<div style="min-width:0;"><div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;line-height:1.2;">' + esc(g.name) + '</div><div style="font-size:12px;color:#6B776F;margin-top:2px;">' + esc(g.mech) + '</div></div></div>' +
      '<div style="margin-top:13px;font-size:13.5px;line-height:1.55;color:#333E39;">' + esc(g.intro) + '</div>' +
      outputsHtml + measureHtml + readingsHtml + progHtml + tdiHtml + subsHtml + endpointsHtml + doseHtml + benchHtml + cautionsHtml + linksHtml +
      guideSrcNote('Not a substitute for jar or bench testing.') +
    '</div>';
  };

  function navBtn(act, style, svg, label) {
    return '<button data-act="' + act + '" style="' + style + '">' + svg + '<span style="font-size:10.5px;font-weight:600;">' + label + '</span></button>';
  }
  App.renderNav = function (v) {
    return navBtn('goHome', v.navHomeStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>', 'Home') +
      navBtn('goProducts', v.navProductsStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 2v6l-4 8a3 3 0 0 0 3 4h10a3 3 0 0 0 3-4l-4-8V2"/><path d="M6 2h8"/></svg>', 'Products') +
      navBtn('goCalc', v.navCalcStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h3M15 14v4"/></svg>', 'Dose') +
      navBtn('goJars', v.navJarsStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/></svg>', 'Jars') +
      navBtn('goPumps', v.navPumpsStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>', 'Pumps') +
      navBtn('goGuide', v.navGuideStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', 'Guide');
  };

  // ============================ MOUNT / RENDER ==============================
  App.mount = function () {
    this.$screen = document.getElementById('fa-screen');
    this.$nav = document.getElementById('fa-nav');
    var frame = document.getElementById('fa-frame');

    var self = this;
    frame.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (el && !el.disabled) { var fn = App.H[el.dataset.act]; if (fn) fn(el, e); }
    });
    frame.addEventListener('input', function (e) {
      var el = e.target;
      if (el.tagName === 'SELECT') return;
      if (el.dataset.set != null) {
        self.state[el.dataset.set] = el.value;
        // search boxes update only their own option list — no full-screen re-render (smooth typing)
        var comboName = { productPickerQuery: 'product', calcPumpPickerQuery: 'pump', jarProductPickerQuery: 'jarProduct', guideProgPickerQuery: 'guideProduct' }[el.dataset.set];
        if (comboName) self.updateComboList(comboName);
        else self.render();
      }
      else if (el.dataset.actinput) { var fn = App.H[el.dataset.actinput]; if (fn) fn(el, e); }
    });
    frame.addEventListener('change', function (e) {
      var el = e.target;
      if (el.tagName !== 'SELECT') return;
      if (el.dataset.set != null) { self.setState_change(el.dataset.set, el.value); }
      else if (el.dataset.actchange) { var fn = App.H[el.dataset.actchange]; if (fn) fn(el, e); }
    });
    // click-away: tapping outside an open combobox closes it (capture, pre-render)
    frame.addEventListener('pointerdown', function (e) {
      if ((self.state.productPickerOpen || self.state.calcPumpPickerOpen || self.state.jarProductPickerOpen || self.state.guideProgPickerOpen) && !e.target.closest('[data-combo]')) {
        self.state.productPickerOpen = false; self.state.calcPumpPickerOpen = false; self.state.jarProductPickerOpen = false; self.state.guideProgPickerOpen = false; self.render();
      }
    }, true);
    // keep the mobile picker sheet fitted above the on-screen keyboard as it opens/closes
    if (window.visualViewport) {
      var onVV = function () { if (self.state.productPickerOpen || self.state.calcPumpPickerOpen || self.state.jarProductPickerOpen || self.state.guideProgPickerOpen) self.sizeMobileSheet(); };
      window.visualViewport.addEventListener('resize', onVV);
      window.visualViewport.addEventListener('scroll', onVV);
    }
    this.render();
  };
  App.setState_change = function (key, val) { var p = {}; p[key] = val; this.setState(p); };

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
      sheet.style.top = (vv.offsetTop + 8) + 'px';
      sheet.style.maxHeight = (vv.height - 16) + 'px';
    }
  };

  App.render = function () {
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
    else if (v.isJars) html = this.screens.jars(v);
    else if (v.isPumps) html = this.screens.pumps(v);
    else if (v.isClients) html = this.screens.clients(v);
    else if (v.isGuideDetail) html = this.screens.guideDetail(v);
    else if (v.isGuide) html = this.screens.guide(v);
    else html = this.screens.home(v);

    this.$screen.innerHTML = html;
    this.$nav.innerHTML = this.renderNav(v);

    // restore
    this.$screen.scrollTop = scrollTop;
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
        try { fk.focus(); } catch (e3) {}
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
