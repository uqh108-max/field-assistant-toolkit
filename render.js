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

    var FU = this.FLOW_UNITS;
    var clients = s.clients.map(function (c) {
      var fu = (FU.find(function (x) { return x.v === c.flowUnit; }) || { label: 'm³/h' }).label;
      var su = (FU.find(function (x) { return x.v === c.sludgeFlowUnit; }) || { label: 'm³/h' }).label;
      var nTests = s.jarTests.filter(function (x) { return x.clientId === c.id; }).length;
      return {
        id: c.id, name: c.name, site: c.site || 'No site noted',
        summary: (c.productName || 'Generic') + ' · ' + (c.mode === 'sludge' ? (c.doseKg + ' kg/tDS') : (c.dose + ' mg/L')),
        chip1: (c.mode === 'sludge' ? (c.sludgeFlow + ' ' + su + ' sludge') : (c.flow + ' ' + fu)),
        chip2: (c.mode === 'sludge' ? (c.doseKg + ' kg/t DS') : (c.dose + ' mg/L')),
        chip3: (c.productName || 'Generic product'),
        hasTests: nTests > 0,
        testLabel: nTests + ' saved jar test' + (nTests === 1 ? '' : 's')
      };
    });

    var stockPctN = parseFloat(s.stockPct);
    var stockPrep = isFinite(stockPctN)
      ? 'To make this stock: dissolve ' + this.fmt(stockPctN * 10, 2) + ' g of product per 1 L of water (' + this.fmt(stockPctN * 10, 2) + ' g/L = ' + this.fmt(stockPctN * 10, 2) + ' mg/mL). Then 1 mL added to a ' + (s.jarVol || '?') + ' mL jar ≈ ' + this.fmt(this.jarPpm('1'), 2) + ' mg/L.'
      : 'Enter a stock strength to see the make-up quantity.';

    var cpFu = (FU.find(function (x) { return x.v === s.flowUnit; }) || { label: 'm³/h' }).label;
    var cpSu = (FU.find(function (x) { return x.v === s.sludgeFlowUnit; }) || { label: 'm³/h' }).label;
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
      calc: calc, cal: cal,
      calcPumpChosen: !!s.selectedCalcPumpId, calcPumpInfo: calcPumpInfo,
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
      navPumpsStyle: css(this.navStyle(screen === 'pumps'))
    };
  };

  // shared field/icon fragments
  var CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
  var DOWNARROW = "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 fill=%22none%22 stroke=%22%2394A099%22 stroke-width=%222%22><path d=%22M2 3l3 3 3-3%22/></svg>')";

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
          '<select data-actchange="onNpField" data-f="doseUnit" data-key="np-doseUnit" style="background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:11px;font-size:12.5px;color:#FFF;appearance:none;">' + optionTags([{ v: 'mg/L on flow' }, { v: 'kg / t dry solids' }], np.doseUnit, 'v', 'v') + '</select>' +
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
      '<select data-actchange="onSelectCalcPump" data-key="selectedCalcPumpId" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:12px;padding:13px 12px;font-size:14px;font-weight:600;color:#16211F;appearance:none;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 13px center;">' +
        '<option value="">— select a pump —</option>' + v.allPumps.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === s.selectedCalcPumpId ? ' selected' : '') + '>' + esc(p.model + ' — ' + p.maxFlow) + '</option>'; }).join('') + '</select>' +
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
        '<select data-actchange="onSelectProduct" data-key="calcProductId" style="width:100%;background:#FFF;border:1px solid #D8D2C4;border-radius:12px;padding:13px 12px;font-size:14px;font-weight:600;color:#16211F;appearance:none;background-image:' + DOWNARROW + ';background-repeat:no-repeat;background-position:right 13px center;">' + productOpts + '</select></div>' +
      concBlock + sludgeBlock +
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
    var winnerHtml = v.hasWinner ? '<div style="margin-top:15px;background:#16211F;border-radius:16px;padding:16px 17px;color:#EFECE3;">' +
      '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6E8A82;font-weight:700;">Selected optimum — Jar ' + esc(v.winnerN) + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:8px;margin-top:5px;"><div style="font-family:\'IBM Plex Mono\';font-size:30px;font-weight:600;color:#4FE0B5;">' + esc(v.winnerPpm) + '</div><div style="font-size:13px;color:#9FB0AA;">mg/L equivalent full-scale dose</div></div>' +
      '<button data-act="useWinner" style="margin-top:12px;width:100%;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:12px;padding:13px;font-size:14.5px;font-weight:700;">Send this dose to the calculator →</button></div>' : '';
    var jarSaveForm = s.showJarSave ? ('<div style="margin-top:12px;background:#16211F;border-radius:16px;padding:16px;color:#EFECE3;">' +
      '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E8A82;font-weight:700;margin-bottom:11px;">Save jar test</div>' +
      '<div style="font-size:11.5px;font-weight:600;color:#9FB0AA;margin-bottom:5px;">Attach to client (optional)</div>' +
      '<select data-set="jarSaveClient" data-key="jarSaveClient" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#FFF;appearance:none;margin-bottom:9px;"><option value="">— no client —</option>' + v.clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.jarSaveClient ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' +
      '<input data-set="jarSaveNote" data-key="jarSaveNote" value="' + esc(s.jarSaveNote) + '" placeholder="Note (e.g. raw water 45 NTU)" style="width:100%;background:#202E2A;border:1px solid #35453F;border-radius:10px;padding:12px;font-size:13.5px;color:#EFECE3;margin-bottom:11px;">' +
      '<div style="display:flex;gap:9px;"><button data-act="cancelJarSave" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmJarSave" style="flex:2;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save test</button></div></div>') : '';
    var jarSaved = s.jarSaved ? '<div style="margin-top:10px;background:#ECF7F3;border:1px solid #B8E0D3;border-radius:12px;padding:11px 13px;font-size:12.5px;color:#17564C;font-weight:600;">✓ Test saved to your history below.</div>' : '';
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
        '<select data-actchange="onSelectJarProduct" data-key="jarProductId" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:12px;padding:13px 12px;font-size:14px;font-weight:600;color:#16211F;appearance:none;">' + prodOpts + '</select>' + stockBlock + '</div>' +
      '<div style="margin-top:12px;background:#FFF;border:1px solid #E2DDD0;border-radius:14px;padding:14px 15px;">' +
        '<div style="font-size:12.5px;font-weight:700;color:#4B564F;margin-bottom:10px;">Test setup</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Jar volume</div><div style="position:relative;"><input inputmode="decimal" data-set="jarVol" data-key="jarVol" value="' + esc(s.jarVol) + '" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 40px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">mL</span></div></div>' +
          '<div><div style="font-size:11.5px;font-weight:600;color:#6B776F;margin-bottom:4px;">Stock strength</div><div style="position:relative;"><input inputmode="decimal" data-set="stockPct" data-key="stockPct" value="' + esc(s.stockPct) + '" style="width:100%;background:#FBF9F4;border:1px solid #D8D2C4;border-radius:10px;padding:11px 32px 11px 11px;font-size:15px;font-family:\'IBM Plex Mono\';font-weight:600;"><span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:#94A099;font-weight:600;">%</span></div></div>' +
        '</div>' +
        '<div style="margin-top:10px;background:#ECF7F3;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#17564C;line-height:1.5;">' + esc(v.stockPrep) + '</div></div>' +
      '<div style="margin-top:15px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6B776F;">Jars</div><div style="font-size:11px;color:#94A099;">tap ◎ to mark the winner</div></div>' +
      '<div style="margin-top:9px;display:flex;flex-direction:column;gap:10px;">' + jarRowsHtml + '</div>' +
      '<div style="margin-top:11px;display:flex;gap:9px;"><button data-act="addJar" style="flex:1;border:1px solid #D8D2C4;background:#FFF;cursor:pointer;border-radius:11px;padding:11px;font-size:13.5px;font-weight:700;color:#16211F;">+ Add jar</button><button data-act="removeJar" style="flex:1;border:1px solid #D8D2C4;background:#FFF;cursor:pointer;border-radius:11px;padding:11px;font-size:13.5px;font-weight:700;color:#6B776F;">– Remove last</button></div>' +
      winnerHtml +
      '<button data-act="startJarSave" style="margin-top:14px;width:100%;border:1px solid #0C8577;cursor:pointer;background:#FFF;color:#0C8577;border-radius:14px;padding:14px;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Save this test</button>' +
      jarSaveForm + jarSaved + historyHtml +
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
      '<div style="display:flex;gap:9px;"><button data-act="cancelClient" style="flex:1;border:1px solid #35453F;background:none;cursor:pointer;color:#9FB0AA;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Cancel</button><button data-act="confirmClient" style="flex:2;border:none;cursor:pointer;background:#0C8577;color:#FFF;border-radius:11px;padding:12px;font-size:14px;font-weight:700;">Save client</button></div></div>') : '';
    var listHtml = v.hasClients ? ('<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">' + v.clients.map(function (c) {
      var testLine = c.hasTests ? '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:12px;color:#0C8577;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0C8577" stroke-width="2"><path d="M9 2h6M8 2v6.5L4.5 16A3 3 0 0 0 7.2 20h9.6a3 3 0 0 0 2.7-3.5L16 8.5V2"/></svg>' + esc(c.testLabel) + '</div>' : '';
      return '<div style="background:#FFF;border:1px solid #E2DDD0;border-radius:15px;padding:14px 15px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="flex:1;min-width:0;"><div style="font-size:16px;font-weight:700;">' + esc(c.name) + '</div><div style="font-size:12.5px;color:#6B776F;margin-top:1px;">' + esc(c.site) + '</div></div>' +
        '<button data-act="deleteClient" data-id="' + esc(c.id) + '" style="border:none;background:none;cursor:pointer;padding:4px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C0574A" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button></div>' +
        '<div style="margin-top:11px;display:flex;flex-wrap:wrap;gap:6px;"><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip1) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip2) + '</div><div style="background:#F0F6F3;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:#17564C;">' + esc(c.chip3) + '</div></div>' +
        testLine +
        '<button data-act="loadClient" data-id="' + esc(c.id) + '" style="margin-top:12px;width:100%;border:1px solid #0C8577;cursor:pointer;background:#FFF;color:#0C8577;border-radius:11px;padding:11px;font-size:14px;font-weight:700;">Load into calculator</button></div>';
    }).join('') + '</div>') : '';
    var empty = v.noClients ? '<div style="margin-top:14px;background:#FBF9F4;border:1px dashed #D8D2C4;border-radius:14px;padding:18px;font-size:13px;color:#6B776F;line-height:1.5;text-align:center;">No clients yet. Go to the Dosing Calc, enter a site\'s flow and product, and tap <b style="color:#16211F">Save as client</b>.</div>' : '';
    return '<div style="padding:22px 18px 30px;animation:fadeUp .3s ease;">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#0C8577;font-weight:700;">Saved locally</div>' +
      '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 4px;">Clients &amp; Sites</div>' +
      '<div style="font-size:13px;color:#6B776F;line-height:1.5;">Each saved client stores its flow, product, dose and solution setup so you can recall it in one tap next visit. Stored on this device only.</div>' +
      addForm + listHtml + empty +
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
      navBtn('goPumps', v.navPumpsStyle, '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>', 'Pumps');
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
      if (el.dataset.set != null) { self.state[el.dataset.set] = el.value; self.render(); }
      else if (el.dataset.actinput) { var fn = App.H[el.dataset.actinput]; if (fn) fn(el, e); }
    });
    frame.addEventListener('change', function (e) {
      var el = e.target;
      if (el.tagName !== 'SELECT') return;
      if (el.dataset.set != null) { self.setState_change(el.dataset.set, el.value); }
      else if (el.dataset.actchange) { var fn = App.H[el.dataset.actchange]; if (fn) fn(el, e); }
    });
    this.render();
  };
  App.setState_change = function (key, val) { var p = {}; p[key] = val; this.setState(p); };

  App.render = function () {
    var v = this.derive();
    // capture focus + caret + scroll before replacing DOM
    var active = document.activeElement;
    var akey = (active && active.dataset) ? active.dataset.key : null;
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
