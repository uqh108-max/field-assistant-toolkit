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
  // Capture shipped material tuples before restored records can enter the library.
  // Identity plus unchanged contents, never an imported verification label, is trust.
  var catalogueMaterials = DATA.products.map(function (p) {
    return { product: p, id: p.id, form: p.form, density: p.density, text: p.densityText };
  });

  // Session-only operator consent: never restored from schema/provenance flags.
  var jarPreparationAuthority = null;
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
      makedown: '0.5', density: '1.0', pumpMax: '20', pumpMaxUnit: 'Lh', pumpMaxCanon: null, feedBasis: 'solution',
      pumpSource: 'manual', selectedCalcPumpId: '',
      productPickerOpen: false, productPickerQuery: '',
      calcPumpPickerOpen: false, calcPumpPickerQuery: '',
      jarProductPickerOpen: false, jarProductPickerQuery: '',
      jarVol: '1000', stockPct: '0.1', jarProductId: '', jarVolumeBasis: 'initial',
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
      customProducts: [], jarTests: [], jarTestsV2: [],
      calMl: '', calSec: '',
      showProductForm: false,
      np: { name: '', brand: '', type: 'Flocculant', charge: '', form: 'Powder', doseRange: '', doseUnit: 'mg/L on flow', density: '', makedown: '', ageing: '', application: '', makeup: '' },
      showPumpForm: false,
      npu: { model: '', brand: '', type: 'Solenoid diaphragm', maxFlow: '', maxPress: '', control: 'Digital', note: '' },
      showJarSave: false, jarSaveClient: '', jarSaveNote: '', jarSaved: false, jarSaveError: '', clientSaveError: '',
      guideId: null, guideChecks: {},
      guideObservedDate: '', guideObservedTime: '', guideObservedOffset: '',
      guideReadings: {}, guideSaveClient: '', guideSaveName: '', guideSaved: false, guideSaveError: '',
      guideProgProductId: '', guideProgPickerOpen: false, guideProgPickerQuery: '',
      guideProgDose: '', guideProgMassBasis: 'unknown', guideProgDoseUnit: 'mgL', guideProgFlow: '', guideProgFlowUnit: 'm3h',
      guideProgSludgeDensity: '', guideProgDs: '', guideProgScalar: '', guideProgSource: null, guideProgRestoreError: '',
      guideProgFor: '', guideProgByPb: {},
      jarCurrentDose: '', bracketNote: '', guideRetestNote: '',
      mgSample: '500', mgSolids: '30', mgStock: '0.1', mgMl: '',
      // Calculator (polymer dose solver): in-memory draft only, never saved. Units, product form and
      // reading type start unconfirmed; SG 1.0 and 24 run hours are visible, labelled defaults.
      pcSolve: 'dose', pcSludgeFlow: '', pcSludgeUnit: '', pcDs: '', pcDsLocation: '',
      pcPumps: [{ flow: '', status: 'running' }], pcPumpUnit: '', pcReading: 'unknown',
      pcBatchKg: '', pcBatchL: '', pcForm: 'unknown', pcActive: '', pcDose: '',
      // Make-down 'Strength from': only the method is defaulted (solution strength % w/v as made down); the value
      // starts empty. The batch (kg + L) draft is kept separately and never mixed with it.
      pcStrengthFrom: 'strength', pcSolStrength: '',
      pcSg: '1.0', pcSgEntered: false, pcHours: '24',
      pcShowAdvanced: false, pcShowWorking: false, pcPumpMsg: '', pcShareMsg: '', pcShareText: '',
      // Calculator mode selector + water treatment dose (mg/L) in-memory draft (never persisted)
      ccMode: 'sludge',
      wtSolve: 'dose', wtWaterFlow: '', wtWaterUnit: '', wtBasis: '', wtDensity: '', wtDensitySource: '', wtBatchKg: '', wtBatchL: '',
      wtPumps: [{ flow: '', status: 'running' }], wtPumpUnit: '', wtReading: 'unknown', wtStrength: '', wtStrengthBasis: '', wtDose: '', wtHours: '24',
      wtStrengthFrom: 'strength', wtSolStrength: '',
      wtShowAdvanced: false, wtShowWorking: false, wtPumpMsg: '', wtShareMsg: '', wtShareText: '',
      // Jar Test mode: 'potable' (mg/L jars, saved tests) or 'sludge' (bench dewatering dose, kg product / t DS).
      // The sludge jar inputs are a memory-only draft (never persisted); only the sludge SG has a default (1.0, shown as assumed).
      jarMode: 'potable',
      // Potable water has two editors: 'multi' (the multi-product test, saved by id in ctf_jartests_v2) and 'classic' (the
      // single-product jar of earlier releases, kept as it was). pj is the multi-product draft; pjUi is view state only (never saved).
      potableView: 'multi', pj: null, pjSaved: false, pjError: '', pjMsg: '', pjExportMsg: '', pjExportText: '', pjExportWhere: '', pjExportErr: false,
      // autosave of the open multi-product test (ctf_jartest_v2_draft): one neutral note (restored / damaged / storage full)
      pjDraftNote: '', pjDraftNoteKind: '',
      pjUi: { open: { site: true, baseline: false, params: false, products: false, batches: true, summary: false }, batchOpen: {}, productOpen: {}, view: '' },
      jdSolve: 'dose', jdSampleMl: '', jdDs: '', jdSg: '1.0', jdSgEntered: false, jdSolStrength: '', jdPolyMl: '', jdDose: '', jdShowWorking: false,
      backupMsg: '', backupText: '', lastBackup: '',
      showRestore: false, restoreText: '', restoreMsg: '', restoreOk: false,
      // Plain-notice disclosures ("Why?", "Source details"): view state only, collapsed by default, never saved.
      noticeOpen: {}
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

    // Dosing-pump flow units (entry/display only). Canonical stored/calculated value is always L/h:
    // L/h = value x num / den. 1 L/min = 60 L/h, 1 L/s = 3600 L/h, 1 mL/min = 60 mL/h = 0.06 L/h.
    PUMP_FLOW_UNITS: [
      { v: 'Lh', label: 'L/h', num: 1, den: 1 },
      { v: 'Lmin', label: 'L/min', num: 60, den: 1 },
      { v: 'Ls', label: 'L/s', num: 3600, den: 1 },
      { v: 'mLmin', label: 'mL/min', num: 60, den: 1000 }
    ],

    DOSE_UNITS: [
      { v: 'mgL', label: 'mg/L' },
      { v: 'kgt', label: 'kg/t DS' },
      { v: 'gt', label: 'g/t DS' }
    ],

    // ---- persistence --------------------------------------------------------
    // The four saved lists: state key <-> localStorage key <-> label.
    STORE_KEYS: [
      { state: 'clients', key: 'ctf_clients_v1', one: 'client', many: 'clients', count: 'clients' },
      { state: 'jarTests', key: 'ctf_jartests_v1', one: 'jar test', many: 'jar tests', count: 'jarTests' },
      { state: 'customProducts', key: 'ctf_products_v1', one: 'custom product', many: 'custom products', count: 'products' },
      { state: 'foundPumps', key: 'ctf_pumps_v1', one: 'saved pump', many: 'saved pumps', count: 'pumps' },
      // multi-product potable jar tests: their own key so releases without this feature never touch them
      { state: 'jarTestsV2', key: 'ctf_jartests_v2', one: 'multi-product jar test', many: 'multi-product jar tests', count: 'jarTestsV2' }
    ],

    // Each key loads on its own: one damaged key must not blank the other three.
    // Anything that can't be used is copied aside (<key>_corrupt…) before the
    // next save overwrites it, so it can still be recovered from a backup file.
    load: function () {
      var self = this;
      this._seenRaw = this._seenRaw || {};
      this.STORE_KEYS.forEach(function (k) {
        var raw = null;
        try { raw = localStorage.getItem(k.key); } catch (e) { return; }
        self._seenRaw[k.key] = raw;
        if (raw == null || raw === '') { self.state[k.state] = []; return; }
        var parsed, ok = true;
        try { parsed = JSON.parse(raw); } catch (e) { ok = false; }
        var list = [];
        if (ok && Array.isArray(parsed)) {
          var c = self.cleanList(k.state, parsed);
          list = c.list;
          if (c.changed) ok = false;
        } else ok = false;
        if (!ok && !self.keepAside(k.key, raw)) {
          self._protectedKeys = self._protectedKeys || {}; self._protectedKeys[k.key] = raw;
          self.state.storageError = 'Damaged saved data is protected: its recovery copy could not be stored. Save a backup now; writes and restore are blocked until safe recovery.';
        }
        self.state[k.state] = list;
      });
      this.invalidateProgrammeAuthorities();
      this.invalidateSavedSnapshots();
    },
    isRec: function (r) { return !!r && typeof r === 'object' && !Array.isArray(r); },
    // Drop entries the screens can't draw: non-object records, and in clients
    // any reading / reading value that isn't an object. Returns the cleaned
    // list and whether anything had to change (valid data is returned as is).
    cleanList: function (stateKey, arr) {
      var self = this, changed = false;
      var list = arr.filter(function (r) { var ok = self.isRec(r); if (!ok) changed = true; return ok; });
      if (stateKey === 'clients') {
        list = list.map(function (c) {
          if (c.readings == null) return c;
          var rd = c.readings, fixed = false;
          if (!Array.isArray(rd)) { rd = []; fixed = true; }
          rd = rd.filter(function (x) { var ok = self.isRec(x); if (!ok) fixed = true; return ok; }).map(function (x) {
            var y = x;
            // a missing `values` is fine (screens treat it as none); a non-list or non-object entries are damage
            if (x.values != null) {
              var vv = Array.isArray(x.values) ? x.values.filter(self.isRec) : [];
              if (!Array.isArray(x.values) || vv.length !== x.values.length) { y = Object.assign({}, x, { values: vv }); fixed = true; }
            }
            if (y.prog != null && !self.isRec(y.prog)) { y = Object.assign({}, y); delete y.prog; fixed = true; }
            return y;
          });
          if (!fixed) return c;
          changed = true;
          return Object.assign({}, c, { readings: rd });
        });
      }
      if (stateKey === 'jarTestsV2') {
        list = list.map(function (r) {
          var c = self.pjCleanRecord(r);
          if (c.fixed) changed = true;
          return c.fixed ? c.rec : r;
        });
      }
      return { list: list, changed: changed };
    },
    // Keep one copy of each distinct damaged value (never one per launch).
    keepAside: function (key, raw) {
      try {
        var names = [];
        for (var i = 0; i < localStorage.length; i++) {
          var n = localStorage.key(i);
          if (n && n.indexOf(key + '_corrupt') === 0) names.push(n);
        }
        for (var j = 0; j < names.length; j++) if (localStorage.getItem(names[j]) === raw) return true;
        var aside = names.indexOf(key + '_corrupt') < 0 ? key + '_corrupt' : key + '_corrupt_' + Date.now();
        localStorage.setItem(aside, raw);
        return localStorage.getItem(aside) === raw;
      } catch (e) { return false; }
    },

    // ---- backup / restore ---------------------------------------------------
    exportData: function () {
      if (this._restoreRecovery) return JSON.parse(this._restoreRecovery);
      var s = this.state, data = {}, counts = {}, extra = {};
      for (var protectedKey in (this._protectedKeys || {})) extra[protectedKey + '_protected_raw'] = this._protectedKeys[protectedKey];
      this.STORE_KEYS.forEach(function (k) {
        data[k.key] = s[k.state] || [];
        counts[k.count] = data[k.key].length;
      });
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var name = localStorage.key(i);
          // set-aside damaged copies etc. travel in the file for manual recovery; restore ignores them
          if (!name || name.indexOf('ctf_') !== 0 || data[name]) continue;
          extra[name] = localStorage.getItem(name);
        }
      } catch (e) {}
      return { app: 'field-assistant', format: 1, exportedAt: new Date().toISOString(), counts: counts, data: data, extra: extra };
    },

    // Restore = merge. Records already on this phone are kept as they are; records
    // from the file with a new id are added; same id with different content is
    // counted in `differ` (the phone's copy wins). Failure attempts exact-byte
    // rollback; unverifiable recovery stays visible and blocks further writes.
    importData: function (text) {
      if (this._restoreRecovery) return { ok: false, error: 'Recovery is pending. Save the original recovery backup off-device before closing or reloading; further restore is blocked.' };
      if (this._coordinated && !this._mutationActive) return { ok: false, error: 'Restore requires safe storage coordination. Use the Restore control; nothing was changed.' };
      if (Object.keys(this._protectedKeys || {}).length) return { ok: false, error: 'Damaged original data is protected. Export a backup and recover the original before restoring; nothing was changed.' };
      var self = this;
      var NOT_BACKUP = 'That isn\u2019t a Field Assistant backup. Nothing was changed.';
      var obj;
      try { obj = JSON.parse(String(text == null ? '' : text).trim()); } catch (e) { return { ok: false, error: NOT_BACKUP }; }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: NOT_BACKUP };
      var src;
      if (obj.app === 'field-assistant') {
        if (obj.format !== 1) return { ok: false, error: 'This backup was made by a newer version of the app. Update the app, then restore again. Nothing was changed.' };
        src = obj.data;
        if (!src || typeof src !== 'object') return { ok: false, error: NOT_BACKUP };
      } else if (obj.app == null && this.STORE_KEYS.some(function (k) { return k.key in obj; })) {
        src = obj; // a raw copy of the storage keys
      } else return { ok: false, error: NOT_BACKUP };

      var incoming = {}, skipped = [], partial = [], extra = obj.app === 'field-assistant' && this.isRec(obj.extra) ? obj.extra : null;
      for (var i = 0; i < this.STORE_KEYS.length; i++) {
        var k = this.STORE_KEYS[i], v = src[k.key];
        // A release that did not know this key (e.g. multi-product jar tests on the release before them) carries its raw
        // text under `extra`. Accept it when it parses to a list of records, then clean and merge it by id exactly like
        // `data`. If it is there but cannot be read (bad JSON, not a list, no record in it), skip only that list and name it
        // in the restore message (review fix1 N1); the rest of the file restores and the bytes stay in the file. A MIXED list
        // (records plus non-records) restores its readable records, cleaned exactly as `data` would clean them, and is named
        // in its own "Some ... could not be read" sentence (review fix2 N13).
        if (v == null && extra && Object.prototype.hasOwnProperty.call(extra, k.key)) {
          var ev = null;
          if (typeof extra[k.key] === 'string') { try { ev = JSON.parse(extra[k.key]); } catch (e) { ev = null; } }
          if (Array.isArray(ev) && ev.every(this.isRec)) { incoming[k.key] = this.cleanList(k.state, ev).list; continue; }
          if (Array.isArray(ev) && ev.some(this.isRec)) { incoming[k.key] = this.cleanList(k.state, ev).list; partial.push(k.many); continue; }
          skipped.push(k.many); incoming[k.key] = []; continue;
        }
        if (v == null) { incoming[k.key] = []; continue; }
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return { ok: false, error: 'The ' + k.many + ' in this backup are damaged. Nothing was changed.' }; } }
        if (!Array.isArray(v) || !v.every(this.isRec)) {
          return { ok: false, error: 'The ' + k.many + ' in this backup are damaged. Nothing was changed.' };
        }
        incoming[k.key] = this.cleanList(k.state, v).list;
      }

      var idOf = function (r) { return r.id != null ? 'id:' + r.id : 'json:' + JSON.stringify(r); };
      var merged = {}, added = {}, differ = {};
      this.STORE_KEYS.forEach(function (k) {
        var cur = (self.state[k.state] || []).slice();
        var seen = {};
        cur.forEach(function (r) { seen[idOf(r)] = JSON.stringify(r); });
        var n = 0, d = 0;
        incoming[k.key].forEach(function (r) {
          var id = idOf(r);
          if (!(id in seen)) { seen[id] = JSON.stringify(r); cur.push(r); n++; }
          else if (seen[id] !== JSON.stringify(r)) d++;
        });
        merged[k.key] = cur; added[k.count] = n; differ[k.count] = d;
      });

      var before = {}, next = {}, oldState = {}, oldSeen = this._seenRaw, attempted = [], recovery;
      // Capture exact bytes before any write. Never spend scarce quota on a huge
      // persistent pre-restore copy. This immutable text is session-only; if
      // rollback fails the user must save it off-device BEFORE closing/reloading.
      try {
        var backup = this.exportData();
        backup.extra = backup.extra || {};
        // Export normally tolerates unreadable extras; a restore must not.
        for (var bi = 0; bi < localStorage.length; bi++) {
          var bn = localStorage.key(bi);
          if (bn && bn.indexOf('ctf_') === 0 && !backup.data[bn]) backup.extra[bn] = localStorage.getItem(bn);
        }
        this.STORE_KEYS.forEach(function (k) {
          before[k.key] = localStorage.getItem(k.key);
          backup.extra[k.key + '_restore_original_raw'] = before[k.key];
          next[k.key] = JSON.stringify(merged[k.key]);
          oldState[k.state] = self.state[k.state];
        });
        recovery = JSON.stringify(backup);
      } catch (e) { return { ok: false, error: 'Could not read or prepare the original saved data. Restore was not started; nothing was changed.' }; }
      this._restoreRecovery = recovery;
      try {
        this.STORE_KEYS.forEach(function (k) {
          attempted.push(k.key);
          localStorage.setItem(k.key, next[k.key]);
          if (localStorage.getItem(k.key) !== next[k.key]) throw new Error('Restore readback failed');
        });
        var patch = {}, seen = {};
        this.STORE_KEYS.forEach(function (k) { patch[k.state] = merged[k.key]; seen[k.key] = next[k.key]; });
        this._seenRaw = seen;
        this.setState(patch);
        this._restoreRecovery = null;
        return { ok: true, added: added, differ: differ, skipped: skipped, partial: partial };
      } catch (e) {
        // First revert quota-consuming growth (or remove failed new writes),
        // including a setter that wrote then threw. Only then restore larger
        // originals. In-place shrink avoids needless key removal. Forward-order
        // restoration can itself exceed quota while an imported jar still fits.
        attempted.forEach(function (key) {
          try {
            var current = localStorage.getItem(key);
            if (current === before[key]) return;
            if (before[key] == null) localStorage.removeItem(key);
            else if (current != null && current.length >= before[key].length) localStorage.setItem(key, before[key]);
          } catch (x) { try { localStorage.removeItem(key); } catch (y) {} }
        });
        attempted.forEach(function (key) {
          try {
            if (localStorage.getItem(key) === before[key]) return;
            if (before[key] == null) localStorage.removeItem(key); else localStorage.setItem(key, before[key]);
          } catch (x) {}
        });
        var exact = false;
        try { exact = this.STORE_KEYS.every(function (k) { return localStorage.getItem(k.key) === before[k.key]; }); } catch (x) {}
        this.STORE_KEYS.forEach(function (k) { self.state[k.state] = oldState[k.state]; });
        var bookkeeping = true;
        try { this._seenRaw = oldSeen; } catch (x) { bookkeeping = false; }
        if (exact && bookkeeping) { this._restoreRecovery = null; return { ok: false, error: 'Restore failed. Original saved bytes were verified unchanged. Nothing was changed.' }; }
        this.state.backupText = recovery;
        this.state.backupMsg = 'Original pre-restore backup — save this file or copy the text off-device NOW. This recovery copy exists only in this open session; do not close or reload.';
        if (exact) return { ok: false, error: 'Restore failed. Original storage bytes were verified unchanged, but session bookkeeping failed. Save the original recovery backup off-device now; further writes are blocked. Do not close or reload.' };
        return { ok: false, error: 'Restore failed and rollback could not be verified. Saved storage may have changed. Original bytes are retained in the recovery backup below; save it off-device now. Do not close or reload. Further saved-data writes are blocked.' };
      }
    },

    // Ask the browser not to evict saved data under storage pressure (best effort).
    requestPersistentStorage: function () {
      try {
        var st = (typeof navigator !== 'undefined' && navigator) ? navigator.storage : null;
        if (!st || typeof st.persist !== 'function') return Promise.resolve(false);
        return Promise.resolve(typeof st.persisted === 'function' ? st.persisted() : false)
          .then(function (already) { return already || st.persist(); })
          .catch(function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    },

    // IndexedDB readwrite transactions on one shared store serialize mounted
    // tabs, including browsers without Web Locks. Saved bytes remain in the four
    // localStorage keys. No lease, timeout takeover or read/write "CAS" fiction.
    // All list writes execute synchronously inside the request callback while
    // this transaction owns the store. Old releases do not obey this protocol:
    // close/update them before editing (their writes cannot be made safe here).
    mutateSaved: function (keys, action, refresh) {
      var self = this;
      if (!this._coordinated) return action(); // unmounted non-browser test/runtime
      if (this._mutationBusy) { this.setState({ pumpLoading: false, storageError: 'Another storage action is in progress — this action was NOT saved or deleted. Keep your entries and explicitly retry when it finishes.' }); return; }
      var expected = {}, db = null, tx = null, ended = false, ran = false;
      keys.forEach(function (key) { expected[key] = self._seenRaw[key]; });
      function finish(message) {
        if (ended) return;
        ended = true; clearTimeout(timer); self._mutationBusy = false;
        if (db) db.close();
        if (message) self.setState({ storageError: message, pumpLoading: false });
      }
      function unavailable() { finish('Safe storage coordination is unavailable — nothing was saved or deleted. Keep your entries and export a backup. Enable IndexedDB / leave private browsing, then retry. No unsafe single-tab fallback is used.'); }
      this._mutationBusy = true;
      var timer = setTimeout(function () {
        if (tx && !ran) { try { tx.abort(); } catch (e) {} }
        finish(ran ? 'Storage coordination was interrupted after the action. Check saved records and export a backup before retrying.' : 'Storage coordination is blocked or busy — nothing was saved or deleted. Keep your entries; close other editing tabs and retry.');
      }, 8000);
      try {
        if (!window.indexedDB) { unavailable(); return; }
        var open = window.indexedDB.open('field-assistant-mutations-v1', 1);
        open.onupgradeneeded = function () { open.result.createObjectStore('mutex'); };
        open.onerror = unavailable;
        open.onblocked = unavailable;
        open.onsuccess = function () {
          db = open.result;
          if (ended) { db.close(); return; }
          db.onversionchange = function () { db.close(); };
          try {
            tx = db.transaction(['mutex'], 'readwrite');
            tx.oncomplete = function () { finish(); };
            tx.onabort = tx.onerror = function () { if (ran) finish('Storage coordination was interrupted after the action. Check saved records and export a backup before retrying.'); else unavailable(); };
            tx.objectStore('mutex').get('lock').onsuccess = function () {
              if (ended) return;
              try {
                var stale = !refresh && keys.some(function (key) { return localStorage.getItem(key) !== expected[key]; });
                if (stale) { self.setState({ storageConflict: true, pumpLoading: false, storageError: 'Saved records changed in another tab. This action was NOT saved or deleted; your entries are kept. Refresh saved lists, review the changed record, then explicitly retry.' }); return; }
                var ambiguous = keys.some(function (key) {
                  var spec = self.STORE_KEYS.find(function (k) { return k.key === key; }), seen = {};
                  return spec && (self.state[spec.state] || []).some(function (r) {
                    if (r.id == null) return false;
                    var id = 'id:' + r.id; if (Object.prototype.hasOwnProperty.call(seen, id)) return true; seen[id] = true; return false;
                  });
                });
                if (ambiguous && !refresh) { self.setState({ storageError: 'Duplicate record IDs make this action ambiguous — nothing was saved or deleted. Export a backup and resolve the duplicate identities before editing. Original records are retained.' }); return; }
                self._mutationActive = true; ran = true;
                action();
              } catch (e) { finish('Storage action could not finish. Check saved records and export a backup before retrying.'); }
              finally { self._mutationActive = false; }
            };
          } catch (e) { unavailable(); }
        };
      } catch (e) { unavailable(); }
    },
    refreshSavedLists: function () {
      var self = this;
      if (this._restoreRecovery) { this.setState({ storageError: 'Recovery is pending. Save the original backup off-device now; refresh is blocked to retain the recovery state.' }); return; }
      this.mutateSaved(this.STORE_KEYS.map(function (k) { return k.key; }), function () {
        self.load(); self.state.storageConflict = false;
        if (!Object.keys(self._protectedKeys || {}).length) self.state.storageError = '';
        self.render();
      }, true);
    },
    writeList: function (key, list) {
      if (this._restoreRecovery) return false;
      if (this._coordinated && !this._mutationActive) return false;
      if (this._protectedKeys && Object.prototype.hasOwnProperty.call(this._protectedKeys, key)) return false;
      try {
        var raw = JSON.stringify(list); localStorage.setItem(key, raw);
        if (localStorage.getItem(key) !== raw) return false;
        this._seenRaw = this._seenRaw || {}; this._seenRaw[key] = raw;
        return true;
      } catch (e) { return false; }
    },
    protectedStorageWarning: function () {
      return Object.keys(this._protectedKeys || {}).length ? 'Damaged saved data is protected: its recovery copy could not be stored. Save a backup now; writes to protected lists and restore are blocked until safe recovery.' : '';
    },
    persist: function (c) { return this.writeList('ctf_clients_v1', c); },
    persistPumps: function (p) { return this.writeList('ctf_pumps_v1', p); },
    persistProducts: function (p) { return this.writeList('ctf_products_v1', p); },
    persistTests: function (t) { return this.writeList('ctf_jartests_v1', t); },

    observation: function () {
      var s = this.state, date = String(s.guideObservedDate || '').trim(), time = String(s.guideObservedTime || '').trim(), offset = String(s.guideObservedOffset || '').trim();
      var bad = { error: 'Enter a real observation date (YYYY-MM-DD), time (HH:MM) and explicit UTC offset (+10:00, -04:00 or +00:00). Leave time blank if unknown; save time is recorded separately.' };
      if (!date && !time && !offset) return { observedAt: null, observedDate: null, observationOffset: null };
      if (!this.validObservationDate(date)) return bad;
      if (!time && !offset) return { observedAt: null, observedDate: date, observationOffset: null };
      var t = /^(\d{2}):(\d{2})$/.exec(time);
      if (!t || +t[1] > 23 || +t[2] > 59 || !this.validObservationOffset(offset)) return bad;
      return { observedAt: date + 'T' + time + ':00' + offset, observedDate: date, observationOffset: offset };
    },
    validObservationDate: function (date) {
      var d = typeof date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (!d || +d[1] < 1000) return false;
      var cal = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
      return cal.getUTCFullYear() === +d[1] && cal.getUTCMonth() === +d[2] - 1 && cal.getUTCDate() === +d[3];
    },
    validObservationOffset: function (offset) {
      var z = typeof offset === 'string' && /^([+-])(\d{2}):(\d{2})$/.exec(offset);
      return !!z && +z[2] <= 14 && +z[3] <= 59 && (+z[2] !== 14 || +z[3] === 0) && offset !== '-00:00';
    },
    // Presentation validates imported/startup metadata without rewriting history.
    historicalObservation: function (r) {
      var at = r.observedAt, date = r.observedDate, offset = r.observationOffset;
      var unknown = { observedAt: '', observedDate: '', invalid: !!(at || date || offset) };
      if (at != null && at !== '') {
        var m = typeof at === 'string' && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):00([+-]\d{2}:\d{2})$/.exec(at);
        if (!m || !this.validObservationDate(m[1]) || +m[2] > 23 || +m[3] > 59 || !this.validObservationOffset(m[4])) return unknown;
        if ((date != null && date !== m[1]) || (offset != null && offset !== m[4])) return unknown;
        return { observedAt: at, observedDate: m[1], invalid: false };
      }
      if (offset != null && offset !== '') return unknown;
      if (date != null && date !== '') return this.validObservationDate(date) ? { observedAt: '', observedDate: date, invalid: false } : unknown;
      return unknown;
    },
    observationSig: function () { var s = this.state; return JSON.stringify([s.guideObservedDate || '', s.guideObservedTime || '', s.guideObservedOffset || '']); },
    readingSig: function (r) { return JSON.stringify([r.date, r.app, r.values, r.prog, r.observedAt || null, r.observedDate || null, r.observationOffset || null]); },

    // ---- maths (verbatim port) ---------------------------------------------
    flowFactor: function (u) { var f = this.FLOW_UNITS.find(function (x) { return x.v === u; }); return f ? f.k : NaN; },
    // Unknown, empty, non-string or inherited-property codes never resolve to a unit (no guessing).
    pumpUnitOf: function (code) { return typeof code === 'string' ? (this.PUMP_FLOW_UNITS.find(function (x) { return x.v === code; }) || null) : null; },
    pumpFlowLabel: function (code) { var u = this.pumpUnitOf(code); return u ? u.label : ''; },
    pumpFlowToLh: function (value, code) {
      var u = this.pumpUnitOf(code);
      if (!u || typeof value !== 'number' || !isFinite(value)) return NaN;
      var lh = value * u.num / u.den;
      return isFinite(lh) ? lh : NaN;
    },
    lhToPumpFlow: function (lh, code) {
      var u = this.pumpUnitOf(code);
      if (!u || typeof lh !== 'number' || !isFinite(lh)) return NaN;
      var v = lh * u.den / u.num;
      return isFinite(v) ? v : NaN;
    },
    // Display text of a canonical L/h value in the selected unit with >= 4 significant digits.
    pumpFlowText: function (lh, code, dp) {
      var v = this.lhToPumpFlow(lh, code);
      if (!isFinite(v) || code === 'Lh') return this.fmt(code === 'Lh' ? lh : v, dp); // L/h text is byte-identical to the pre-unit releases
      var places = dp;
      if (v > 0) places = Math.max(dp, Math.min(12, 3 - Math.floor(Math.log(v) / Math.LN10)));
      return this.fmt(v, places);
    },
    // Shortest decimal entry text that converts back to exactly this L/h capacity in the unit.
    pumpEntryText: function (lh, code) {
      var x = this.lhToPumpFlow(lh, code);
      if (!isFinite(x)) return '';
      for (var p = 1; p <= 17; p++) {
        var t = Number(x.toPrecision(p));
        if (this.pumpFlowToLh(t, code) === lh) return this.decimalText(t);
      }
      return this.decimalText(x);
    },
    // Readable entry text (<= 6 significant digits; integer digits are never rounded away) for a canonical L/h
    // capacity in a unit. When the text is not exactly that capacity the exact L/h travels beside it as `canon`
    // ({lh,text,unit}), so display rounding can never change the stored/used capacity or accumulate over unit switches.
    pumpDisplayEntry: function (lh, code) {
      var x = this.lhToPumpFlow(lh, code);
      if (!isFinite(x)) return { text: '', canon: null };
      var maxP = Math.max(6, x >= 1 ? Math.floor(Math.log(x) / Math.LN10 + 1e-12) + 1 : 0);
      for (var p = 1; p <= maxP; p++) {
        var t = Number(x.toPrecision(p));
        if (this.pumpFlowToLh(t, code) === lh) return { text: this.decimalText(t), canon: null };
      }
      var text = this.decimalText(Number(x.toPrecision(maxP)));
      return { text: text, canon: { lh: lh, text: text, unit: code } };
    },
    // Exact canonical L/h behind the entry field while the text still is the unedited rounded display of it.
    pumpCanonLh: function (s) {
      var c = s && s.pumpMaxCanon;
      return c && typeof c === 'object' && typeof c.lh === 'number' && isFinite(c.lh) && c.text === String(s.pumpMax) && c.unit === s.pumpMaxUnit ? c.lh : NaN;
    },
    flowLabel: function (u) { var f = this.FLOW_UNITS.find(function (x) { return x.v === u; }); return f ? f.label : 'm³/h'; },
    // Unknown codes label as themselves — a silent fallback label would relabel
    // a saved dose under the wrong unit.
    doseUnitLabel: function (v) { var u = this.DOSE_UNITS.find(function (x) { return x.v === v; }); return u ? u.label : String(v); },
    // Strict decimal parse: the whole string must be one plain positive number.
    // parseFloat's prefix parsing turns '1,000' into 1 and '5-10' into 5 — a
    // three-orders-of-magnitude dosing error that looks valid on screen.
    parseNum: function (str) {
      // Actual internal numbers are not user-entered exponent strings.
      if (typeof str === 'number') return isFinite(str) && str >= 0 ? str : NaN;
      var t = String(str == null ? '' : str).trim();
      var n = /^\d*\.?\d+$/.test(t) ? Number(t) : NaN;
      return isFinite(n) && !(n === 0 && /[1-9]/.test(t)) ? n : NaN;
    },
    parsePumpFlow: function (str) {
      // Full-string dimensional parse. Bare gallons and capacity annotations
      // spanning different models/pressures cannot establish a safe capacity.
      var t = String(str == null ? '' : str).trim().toLowerCase().replace(/³/g, '3');
      var number = '(?:\\d+(?:\\.\\d+)?|\\.\\d+|\\d+,\\d{1,2})';
      var m = t.match(new RegExp('^(' + number + ')(?:\\s*[-–—]\\s*(' + number + '))?\\s*(ml/h|ml/min|l/h|l/min|l/s|m3/h|us\\s*gal/h|imp\\s*gal/h|usgph|usgpd)$'));
      if (!m) return NaN;
      var lo = this.parseNum(m[1].replace(',', '.'));
      var hi = m[2] ? this.parseNum(m[2].replace(',', '.')) : lo;
      if (!(lo >= 0 && hi > 0 && hi >= lo)) return NaN;
      var u = m[3].replace(/\s/g, '');
      var k = { 'ml/h': 0.001, 'ml/min': 0.06, 'l/min': 60, 'l/s': 3600, 'l/h': 1, 'm3/h': 1000, 'usgal/h': 3.785411784, 'impgal/h': 4.54609, 'usgph': 3.785411784, 'usgpd': 3.785411784 / 24 }[u];
      var capacity = hi * k;
      return isFinite(capacity) && capacity > 0 ? capacity : NaN;
    },
    // Audit: family headlines, frequency-specific ratings and motive-water
    // flow do not establish an injection capacity at the operating duty.
    UNCONFIRMED_PUMPS: 'pk18roytronics pk19seriesaafa pk20seriesaa9m pk21seriesbfam pk22seriescfam pk23seriespfam pk24seriese7ex pk25seriesgmac pk26seriesgmod pk27roytronice pk28priusprius pk34memdoslasi pk35magdoslbsi pk48extronicty pk49betabbt5b0 pk57pulsatrons pk75qdoshflo pkgdme_s pkgdme_l pkgdmx pkprdelta pkprvario pk32d9wlwaterp pk60teknaserie pk61teknaakl pk62teknaapg pk64tekbaserie'.split(' '),
    pumpCapacityOf: function (p) {
      return !p || p.capacityLh === null || p.familyEnvelope || p.id === 'pk33d9wl5' || p.ai || /^ai$/i.test(p.verified || '') || this.UNCONFIRMED_PUMPS.indexOf(p.id) >= 0 ? NaN : this.parsePumpFlow(p.maxFlow);
    },
    calcPumpCapacity: function (s) {
      if (s.pumpSource === 'manual') { var canonLh = this.pumpCanonLh(s); return isFinite(canonLh) ? canonLh : this.pumpFlowToLh(this.parseNum(s.pumpMax), s.pumpMaxUnit); }
      if (s.pumpSource !== 'select') return NaN;
      return this.pumpCapacityOf(this.allPumps().find(function (p) { return p.id === s.selectedCalcPumpId; }));
    },
    openComboName: function () {
      var s = this.state;
      return s.productPickerOpen ? 'product' : (s.calcPumpPickerOpen ? 'pump' : (s.jarProductPickerOpen ? 'jarProduct' : (s.guideProgPickerOpen ? 'guideProduct' : null)));
    },
    decimalText: function (n) {
      var text = String(n);
      if (!isFinite(Number(text))) return '';
      if (/e/i.test(text)) {
        var parts = text.toLowerCase().split('e'), sign = '';
        var mantissa = parts[0];
        if (mantissa.charAt(0) === '-') { sign = '-'; mantissa = mantissa.slice(1); }
        var digits = mantissa.replace('.', '');
        var point = (mantissa.indexOf('.') < 0 ? mantissa.length : mantissa.indexOf('.')) + Number(parts[1]);
        if (point <= 0) text = '0.' + new Array(1 - point).join('0') + digits;
        else if (point >= digits.length) text = digits + new Array(point - digits.length + 1).join('0');
        else text = digits.slice(0, point) + '.' + digits.slice(point);
        text = sign + text;
      }
      return text;
    },
    fmt: function (n, dp) {
      if (n === null || n === undefined || !isFinite(n)) return '—';
      var v = Number(n);
      var places = dp == null ? 3 : dp;
      // Preserve small nonzero rates instead of displaying a false zero.
      if (v !== 0 && Math.abs(v) < Math.pow(10, -places) / 2) places = Math.min(12, Math.ceil(-Math.log(Math.abs(v)) / Math.LN10) + 2);
      var text = v.toFixed(places).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      if (v !== 0 && Number(text) === 0) text = String(v);
      // Display rounding is separate from exact numeric handoff serialization.
      return this.decimalText(text);
    },
    finiteResult: function (n, positive) {
      return isFinite(n) && (!positive || n > 0) ? n : NaN;
    },
    jarPreparationTuple: function () {
      var s = this.state, p = this.allProducts().find(function (x) { return x.id === s.jarProductId; }) || null;
      return { product: p, tuple: JSON.stringify([s.jarProductId, p, s.stockPct, s.jarVol, s.jarVolumeBasis]) };
    },
    jarPreparationConfirmed: function () {
      var current = this.jarPreparationTuple();
      if (!jarPreparationAuthority || current.product !== jarPreparationAuthority.product || current.tuple !== jarPreparationAuthority.tuple) { jarPreparationAuthority = null; return false; }
      return true;
    },
    confirmJarPreparation: function () {
      var s = this.state;
      if (!isFinite(this.jarStockStrength()) || !(this.parseNum(s.jarVol) > 0) || (s.jarProductId && !this.allProducts().some(function (p) { return p.id === s.jarProductId; })) || (s.jarVolumeBasis !== 'initial' && s.jarVolumeBasis !== 'final')) { this.setState({ bracketNote: 'Preparation unconfirmed — correct stock, product and sample volume/basis first.' }); return; }
      var p = this.jarPreparationTuple().product;
      if (!window.confirm('Confirm actual prepared stock for ' + (p ? p.name : 'manually specified as-supplied product') + ': ' + s.stockPct + '% w/v as-supplied product (grams per 100 mL FINAL stock volume), NOT active ingredient. Sample: ' + s.jarVol + ' mL, ' + (s.jarVolumeBasis === 'initial' ? 'initial RAW sample before stock addition; nominal dose uses this raw volume' : 'final TOTAL including stock; raw sample volume unknown and transfer blocked') + '. I have checked the actual preparation and supplier-specific compatibility. This is not supplier/site approval.')) return;
      jarPreparationAuthority = this.jarPreparationTuple();
      this.setState({ bracketNote: '', jarSaved: false });
    },
    jarStockStrength: function () {
      var sp = this.parseNum(this.state.stockPct);
      return sp > 0 && sp <= 100 ? sp : NaN;
    },
    jarPpm: function (dose) {
      var d = this.parseNum(dose), sp = this.jarStockStrength(), v = this.parseNum(this.state.jarVol);
      if (!(d >= 0) || !(sp > 0 && sp <= 100) || !(v > 0)) return NaN;
      var basis = this.state.jarVolumeBasis;
      if (basis !== 'initial' && basis !== 'final') return NaN;
      // Only initial RAW sample volume establishes a raw-feed nominal dose.
      if (basis !== 'initial') return NaN;
      return this.finiteResult(d * 10000 * sp / v, d > 0);
    },
    jarFinalPpm: function (dose) {
      var d = this.parseNum(dose), sp = this.jarStockStrength(), v = this.parseNum(this.state.jarVol);
      var basis = this.state.jarVolumeBasis;
      if (!(d >= 0) || !(sp > 0 && sp <= 100) || !(v > 0) || (basis !== 'initial' && basis !== 'final') || (basis === 'final' && d >= v)) return NaN;
      return this.finiteResult(d * 10000 * sp / (basis === 'initial' ? v + d : v), d > 0);
    },
    // Inverse of jarPpm: mL of stock that delivers `ppm` in the current jar setup.
    jarMl: function (ppm) {
      var sp = this.jarStockStrength(), v = this.parseNum(this.state.jarVol);
      if (!isFinite(ppm) || !isFinite(sp) || sp <= 0 || !isFinite(v) || v <= 0) return NaN;
      ppm = this.parseNum(ppm);
      if (!(ppm >= 0) || sp > 100) return NaN;
      var basis = this.state.jarVolumeBasis;
      if (basis !== 'initial' && basis !== 'final') return NaN;
      if (basis !== 'initial') return NaN;
      return this.finiteResult(ppm * v / (10000 * sp), ppm > 0);
    },
    // Full-string point density in kg/L. Plain decimals use the density field's
    // kg/L contract; missing text, ranges, SG and unsupported units are unknown.
    densitySourceKgL: function (text) {
      if (typeof text !== 'string' || /bulk/i.test(text)) return NaN;
      var m = /^\s*(?:approx\.?\s*|≈\s*|~\s*)?(\d+(?:\.\d+|,\d{1,2})?|\.\d+)(?:\s*(kg\/l|g\/cm[³3]|kg\/m[³3]))?(?:\s*\(at\s+\d+(?:\.\d+)?\s*°?c\))?\s*$/i.exec(text);
      if (!m) {
        var eq = /^(.+?)\s*\(=\s*([^()]+)\)\s*$/.exec(text);
        if (!eq || !/(?:kg\/l|g\/cm[³3]|kg\/m[³3])\s*$/i.test(eq[1]) || !/(?:kg\/l|g\/cm[³3]|kg\/m[³3])\s*$/i.test(eq[2])) return NaN;
        var left = this.densitySourceKgL(eq[1]), right = this.densitySourceKgL(eq[2]);
        return left > 0 && right > 0 && Math.abs(left - right) <= 1e-12 * Math.max(left, right) ? left : NaN;
      }
      var n = this.parseNum(m[1].replace(',', '.'));
      if (/^kg\/m/i.test(m[2] || '')) n /= 1000;
      return isFinite(n) && n > 0 ? n : NaN;
    },
    // Old UI/ingestion used parseFloat. Reconcile every record independently of
    // custom/verified metadata, retaining historical source bytes unchanged.
    productDensityConfirmed: function (p) {
      if (!p || typeof p.density !== 'number' || !isFinite(p.density) || !(p.density > 0) || /bulk/i.test(p.densityText || '')) return false;
      var raw = this.densitySourceKgL(p.densityText);
      if (raw > 0) return Math.abs(raw - p.density) <= 1e-12 * Math.max(raw, p.density);
      // Existing curated ranges have an explicitly shipped representative value.
      // Only the original object AND its captured semantic tuple may retain it.
      return catalogueMaterials.some(function (c) {
        return c.product === p && c.id === p.id && c.form === p.form && c.density === p.density && c.text === p.densityText;
      });
    },
    // Validate material semantics at the calculation boundary as well as load.
    // Stored snapshots are never rewritten; contradictory live assumptions abstain.
    calcMaterial: function (s) {
      var p = this.allProducts().find(function (x) { return x.id === s.calcProductId; });
      var known = p ? (/^powder\b/i.test(p.form || '') ? 'powder' : (/^(liquid|emulsion)\b/i.test(p.form || '') ? 'liquid' : '')) : '';
      var supported = s.form === 'liquid' || s.form === 'powder';
      var valid = supported && (!s.calcProductId || (p && known === s.form && !(known === 'liquid' && !this.productDensityConfirmed(p))));
      return { valid: valid, form: p && known ? known : (supported ? s.form : ''), density: valid && s.form === 'liquid' ? s.density : '' };
    },
    // Dose-page input state for messages only: '' (usable), 'empty' (not yet entered: a prompt, never an error) or the
    // specific problem with the entered text. Same strict parse as the calculation; it never supplies a value.
    inputIssue: function (raw, positive, max) {
      var t = String(raw == null ? '' : raw).trim();
      if (t === '') return 'empty';
      var n = this.parseNum(raw);
      if (!isFinite(n)) return /^[-\u2212]/.test(t) ? 'negative' : (t.indexOf(',') >= 0 ? 'comma' : (/^\d*\.?\d+$/.test(t) ? 'range' : 'nan'));
      if (positive && !(n > 0)) return 'zero';
      if (max != null && n > max) return 'over';
      return '';
    },
    inputIssueText: function (label, issue, rule, overText) {
      var why = { comma: ' uses a comma.', negative: ' can\u2019t be negative.', zero: ' must be greater than zero.', over: ' can\u2019t be more than ' + overText + '.', range: ' is too large or too small to calculate with.', nan: ' isn\u2019t a plain number.' }[issue];
      return label + why + ' ' + rule;
    },
    computeCalc: function () {
      var s = this.state;
      var material = this.calcMaterial(s);
      var S = this.parseNum(s.makedown);
      var rho = this.parseNum(s.density);
      var pumpMax = this.calcPumpCapacity(s);
      var liquid = material.valid && s.form === 'liquid';
      var formOk = material.valid;

      var massGh = NaN;
      if (s.calcMode === 'conc') {
        var Q = this.parseNum(s.flow) * this.flowFactor(s.flowUnit), D = this.parseNum(s.dose);
        if (Q > 0 && D >= 0) massGh = this.finiteResult(Q * D, D > 0);
      } else if (s.calcMode === 'sludge') {
        var Qs = this.parseNum(s.sludgeFlow) * this.flowFactor(s.sludgeFlowUnit), DS = this.parseNum(s.ds), dk = this.parseNum(s.doseKg);
        var rhoS = this.parseNum(s.sludgeDensity);
        // dry-solids rate DS[t/h] = Qs[m3/h] x rho_sludge[t/m3] x (ds/100); product g/h = doseKg x DS x 1000
        if (Qs > 0 && DS > 0 && DS <= 100 && dk >= 0 && rhoS > 0) massGh = this.finiteResult(dk * (Qs * rhoS * (DS / 100)) * 1000, dk > 0);
      }
      var ok = isFinite(massGh);
      var massKgH = ok ? this.finiteResult(massGh / 1000, massGh > 0) : NaN;
      if (!isFinite(massKgH)) ok = false;
      var massKgDay = ok ? this.finiteResult(massKgH * 24, massKgH > 0) : NaN;
      var neatLh = (ok && liquid && rho > 0) ? this.finiteResult(massKgH / rho, massKgH > 0) : NaN;
      var neat = s.feedBasis === 'neat';
      var strengthOk = formOk && s.feedBasis === 'solution' && S > 0 && (liquid ? (rho > 0 && S <= 100 * rho) : S <= 100);
      var solLh = neat ? (liquid ? neatLh : NaN) : ((ok && strengthOk) ? massGh / (10 * S) : NaN);
      solLh = this.finiteResult(solLh, massGh > 0);
      var batchKg = neat ? (liquid && rho > 0 ? 1000 * rho : NaN) : (strengthOk ? 10 * S : NaN);
      var batchHours = (isFinite(solLh) && solLh > 0) ? this.finiteResult(1000 / solLh, true) : NaN;
      var strokePct = (isFinite(solLh) && pumpMax > 0) ? this.finiteResult(solLh / pumpMax * 100, solLh > 0) : NaN;

      var dilution = '—';
      if (neat && liquid && rho > 0) {
        dilution = 'Neat product — no dilution';
      } else if (!neat && strengthOk) {
        dilution = this.fmt(10 * S, 3) + ' g product; top up to 1 L final volume';
        if (liquid) dilution += ' (' + this.fmt(10 * S / rho, 3) + ' mL product)';
      }

      // Messages only: every figure above is decided by the same conditions as before. kind 'prompt' = a field not yet
      // entered (neutral), 'error' = entered text that cannot be used (red), 'caution' = a genuine caution (amber).
      var warnings = [], self = this;
      var add = function (kind, text) { warnings.push({ kind: kind, text: text }); };
      var missingCode = function (u) { return u === undefined || u === null || u === ''; };
      var NUMERIC_RANGE = 'A derived rate exceeds the representable numeric range or underflows. No zero-rate or pump-setting confirmation is inferred; check the entered magnitudes.';
      var numericUnavailable = ok && ((massGh > 0 && (strengthOk || (neat && liquid && rho > 0)) && !isFinite(solLh)) || (liquid && rho > 0 && !isFinite(neatLh)) || (solLh > 0 && pumpMax > 0 && !isFinite(strokePct)) || !isFinite(massKgDay));
      if (numericUnavailable) add('error', NUMERIC_RANGE);
      // Feed preparation. A cleared strength (e.g. after a library product pick) is a prompt, not an error.
      var MATERIAL = 'Feed figures aren\u2019t calculated: the selected product\u2019s form or density isn\u2019t confirmed. Check the form (Liquid / emulsion or Powder), or choose the product again.';
      var DENSITY_RULE = 'Enter the confirmed density in kg/L using a decimal point, e.g. 1.05.';
      var NOT_NEAT = 'Strength is g product per 100 mL final solution, not percent neat.';
      var strengthStatus = 'ok';
      if (neat) {
        if (s.form === 'powder') add('caution', 'Neat feed needs a liquid product. Choose Liquid / emulsion, or use a made-up solution for a powder.');
        else if (!formOk) add('caution', MATERIAL);
        else {
          var neatDensityIssue = this.inputIssue(s.density, true);
          if (neatDensityIssue === 'empty') add('prompt', 'Enter the confirmed product density (kg/L) to use neat feed.');
          else if (neatDensityIssue) add('error', this.inputIssueText('Neat density', neatDensityIssue, DENSITY_RULE));
        }
      } else {
        if (!formOk) add('caution', MATERIAL);
        if (s.feedBasis !== 'solution') add('prompt', 'Choose the feed basis (made-up solution or neat liquid) to get pump feed figures.');
        var strengthIssue = this.inputIssue(s.makedown, true), densityIssue = liquid ? this.inputIssue(s.density, true) : '';
        if (strengthIssue === 'empty') { strengthStatus = 'empty'; add('prompt', 'Enter the solution strength (g product per 100 mL final solution) to get pump feed, stroke and batch figures.'); }
        else if (strengthIssue) { strengthStatus = 'invalid'; add('error', this.inputIssueText('Solution strength', strengthIssue, 'Enter g product per 100 mL final solution using a decimal point, e.g. 0.25.')); }
        if (densityIssue === 'empty') add('prompt', 'Enter the confirmed product density (kg/L) to check the solution strength against the neat product.');
        else if (densityIssue) add('error', this.inputIssueText('Neat density', densityIssue, DENSITY_RULE));
        else if (!strengthIssue && liquid && S > 100 * rho) { strengthStatus = 'invalid'; add('error', 'Solution strength can\u2019t be more than the neat product: ' + this.fmt(100 * rho) + '% w/v at ' + this.fmt(rho) + ' kg/L. ' + NOT_NEAT); }
        else if (!strengthIssue && formOk && !liquid && S > 100) { strengthStatus = 'invalid'; add('error', 'Solution strength can\u2019t be more than 100% w/v (100 g per 100 mL). ' + NOT_NEAT); }
      }
      // Pump flow unit and capacity: a missing unit or capacity is a prompt; nothing is assumed or converted.
      var pumpUnitKnown = !!this.pumpUnitOf(s.pumpMaxUnit);
      if (s.pumpSource === 'manual' && !pumpUnitKnown) {
        if (missingCode(s.pumpMaxUnit)) add('prompt', 'Confirm the pump flow unit (L/h, L/min, L/s or mL/min) to use the capacity. No unit is assumed.');
        else add('caution', 'The saved pump flow unit isn\u2019t recognised. Confirm L/h, L/min, L/s or mL/min before the capacity is used; no unit is assumed and the entered number is not converted.');
      }
      if (!(pumpMax > 0)) {
        var capacityIssue = s.pumpSource === 'manual' ? this.inputIssue(s.pumpMax, true) : '';
        if (capacityIssue === 'empty') add('prompt', 'Enter the pump\u2019s maximum capacity at operating pressure to get pump stroke figures.');
        else if (capacityIssue) add('error', this.inputIssueText('Pump capacity', capacityIssue, 'Enter the maximum delivery at operating pressure using a decimal point, with no commas or signs.'));
        else if (s.pumpSource === 'manual' && !pumpUnitKnown) { /* the pump flow unit message above is the visible abstention */ }
        else if (s.pumpSource === 'select' && !s.selectedCalcPumpId) add('prompt', 'Choose a pump, or tap Enter capacity, to get pump stroke figures.');
        else add('caution', 'Pump capacity unavailable or ambiguous. Enter a confirmed capacity at operating pressure in the selected unit (L/h, L/min, L/s or mL/min); bare gallons and multi-model annotations are not interpreted.');
      }
      var flowCode = s.calcMode === 'sludge' ? s.sludgeFlowUnit : s.flowUnit, flowUnitKnown = isFinite(this.flowFactor(flowCode));
      if (!flowUnitKnown) {
        if (missingCode(flowCode)) add('prompt', 'Confirm the flow unit to get results. No unit is assumed.');
        else add('caution', 'The saved flow unit isn\u2019t recognised. Confirm a listed flow unit before calculating delivery or catch advice; historical records are retained unchanged.');
      }
      // Flow, dose and solids: one prompt naming every empty field; one specific error per entered-but-invalid field.
      if (!ok) {
        var FLOW_RULE = 'Enter a number above zero using a decimal point, with no commas, signs or grouping.', DOSE_RULE = 'Enter zero or more using a decimal point, with no commas, signs or grouping.';
        var fields = s.calcMode === 'sludge' ? [
          ['sludge flow', 'Sludge flow', s.sludgeFlow, true, null, FLOW_RULE],
          ['dry solids', 'Dry solids', s.ds, true, 100, 'Enter a % w/w above 0 and up to 100 using a decimal point, with no commas or signs.', '100 %'],
          ['polymer dose', 'Polymer dose', s.doseKg, false, null, DOSE_RULE],
          ['sludge density', 'Sludge density', s.sludgeDensity, true, null, 'Enter t/m\u00B3 above zero using a decimal point, with no commas or signs.']
        ] : (s.calcMode === 'conc' ? [['flow rate', 'Flow rate', s.flow, true, null, FLOW_RULE], ['target dose', 'Target dose', s.dose, false, null, DOSE_RULE]] : []);
        var missing = [], fieldInvalid = false;
        fields.forEach(function (f) {
          var issue = self.inputIssue(f[2], f[3], f[4]);
          if (issue === 'empty') missing.push(f[0]);
          else if (issue) { fieldInvalid = true; add('error', self.inputIssueText(f[1], issue, f[5], f[6])); }
        });
        if (missing.length) add('prompt', 'Enter the ' + (missing.length > 1 ? missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1] : missing[0]) + ' to get results.');
        if (!fields.length) add('prompt', 'Choose Concentration or Sludge dewatering to get results.');
        else if (!missing.length && !fieldInvalid && flowUnitKnown) add('error', NUMERIC_RANGE);
      }
      if (isFinite(strokePct) && strokePct > 100) add('error', 'Pump stroke exceeds 100% — this pump is too small for the required feed, or dilute the solution less (higher %). Consider a larger pump.');
      else if (isFinite(strokePct) && strokePct < 10 && strokePct > 0) add('caution', 'Pump running below ~10% stroke — accuracy suffers at very low output. Consider a smaller pump or a more dilute solution.');
      var cp = this.allProducts().find(function (p) { return p.id === s.calcProductId; });
      var powderPolymer = cp && /\bpolymer\b|polyacrylamide|polyacrylate/i.test([cp.name, cp.application, cp.makeup, cp.subtitle].join(' '));
      if (!liquid && powderPolymer && S > 0.7) add('caution', 'Powder polymer solutions can become viscous at higher strengths. Confirm the supplier-specific make-down limit and mixing procedure; no universal chemical threshold is assumed.');

      var statusDot = !ok || !isFinite(solLh) || !isFinite(strokePct) || !(pumpMax > 0) || numericUnavailable ? '#4A5A54' : (isFinite(strokePct) && strokePct > 100 ? '#E86A4A' : '#4FE0B5');
      var strokeColor = (isFinite(strokePct) && strokePct > 100) ? '#FF8A6B' : '#4FE0B5';

      var strokeLen = '—', strokeRate = '—';
      if (isFinite(solLh) && pumpMax > 0) {
        var f = solLh / pumpMax;
        if (f > 0 && f <= 1) {
          var spl = 0.8, spm = f / spl;
          if (spm > 1) { spl = 1.0; spm = f; }
          strokeLen = Math.round(spl * 100) + '%';
          strokeRate = this.fmt(spm * 100, 2) + '%';
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
        // Display in the selected pump unit. The canonical L/h fields above are unchanged; an unknown unit shows L/h.
        pumpUnitLabel: this.pumpUnitOf(s.pumpMaxUnit) ? this.pumpFlowLabel(s.pumpMaxUnit) : 'L/h',
        solPumpText: this.pumpUnitOf(s.pumpMaxUnit) ? this.pumpFlowText(solLh, s.pumpMaxUnit, 2) : this.fmt(solLh, 2),
        neatPumpText: liquid ? (this.pumpUnitOf(s.pumpMaxUnit) ? this.pumpFlowText(neatLh, s.pumpMaxUnit, 3) : this.fmt(neatLh, 3)) : 'n/a',
        strokePct: isFinite(strokePct) ? this.fmt(strokePct, 1) + '%' : '—',
        strokeColor: strokeColor, strokeLen: strokeLen, strokeRate: strokeRate,
        dilution: dilution,
        batchKg: this.fmt(batchKg, 2),
        batchHours: this.fmt(batchHours, 1),
        statusDot: statusDot,
        strengthStatus: strengthStatus,
        warnings: warnings,
        hasWarn: warnings.length > 0
      };
    },

    // ---- Calculator: polymer dose solver for sludge dewatering ---------------
    // dose [kg product / t DS] = 1000 x Qpoly[L/h] x C[kg/L] / (Qsludge[L/h] x SG[kg/L] x DS%/100)
    // Flows are converted once to L/h with exact factors; display rounding never feeds back into a
    // calculation. No unit, active fraction, density or dosing window is assumed: a missing, invalid or
    // unknown input abstains with a message naming the field.
    PC_SLUDGE_UNITS: [
      { v: 'Ls', label: 'L/s', lh: 3600 },
      { v: 'Lmin', label: 'L/min', lh: 60 },
      { v: 'Lh', label: 'L/h', lh: 1 },
      { v: 'm3h', label: 'm³/h', lh: 1000 }
    ],
    PC_SOLVE: [
      { v: 'dose', label: 'Dose (kg product / t DS)' },
      { v: 'flow', label: 'Total polymer solution flow' },
      { v: 'sludge', label: 'Sludge flow' },
      { v: 'ds', label: 'Dry solids %' },
      { v: 'batch', label: 'Batch strength (make-down)' }
    ],
    PC_READING: [
      { v: 'unknown', label: 'Unknown' },
      { v: 'measured', label: 'Measured (drawdown or catch test)' },
      { v: 'setpoint', label: 'Setpoint or display' }
    ],
    PC_FORMS: [
      { v: 'unknown', label: 'Unknown' },
      { v: 'powder', label: 'Powder' },
      { v: 'emulsion', label: 'Emulsion' },
      { v: 'liquid', label: 'Liquid' }
    ],
    PC_PUMP_STATUS: [
      { v: 'running', label: 'Running' },
      { v: 'standby', label: 'Standby/off' }
    ],
    PC_MAX_PUMPS: 20,
    PC_CHECK_LABEL: 'Indicative belt-press check from user-supplied field guidance, not a specification or approval',
    PC_CONVENTION: 'Convention: make-down is entered as kg neat product + L batch water; kg per L of batch water is treated as kg per L of solution (the product\u2019s own volume is ignored, negligible at field strengths).',
    // Make-down strength method, shared by the sludge mode and the potable made-down basis (each keeps its own state).
    PC_STRENGTH_FROM: [
      { v: 'strength', label: 'Solution strength (% w/v)' },
      { v: 'batch', label: 'Batch: kg product + L water' }
    ],
    PC_CONVENTION_STRENGTH: 'Convention: solution strength is % w/v as made down = g product per 100 mL of solution, so kg/L = % w/v \u00D7 0.01 (from the batching unit screen or batch sheet).',
    PC_STRENGTH_BASIS: 'basis: kg product as made down',
    // Solution strength = the dilution made up on site and pumped in; Active content = the NEAT product's own strength (supplier TDS/CoA).
    PC_STRENGTH_HELP: 'The dilution you made up on site and are pumping in, in % w/v (g of product per 100 mL of solution), from the batching unit screen or batch sheet. Not the neat product\u2019s strength.',
    PC_ACTIVE_DEF: 'Active content is the neat product\u2019s strength from the supplier TDS/CoA; solution strength is the dilution you made up on site and pump in.',
    // An active % that is not higher than the solution strength in use (equal counts: the same number typed into both boxes) is almost
    // certainly the solution strength typed in the wrong box. The tolerance keeps a batch-derived strength (kg / L x 100) from missing an
    // exact repeat through binary rounding. Neutral hint only; the maths use what was entered.
    pcActiveAtOrBelow: function (active, strengthPct) { return isFinite(active) && isFinite(strengthPct) && strengthPct > 0 && active <= strengthPct * (1 + 1e-9); },
    // ---- Jar Test, Sludge dewatering: bench dose in kg product per t DS from a jar / beaker test ----
    JD_SOLVE: [{ v: 'dose', label: 'Dose (kg product / t DS)' }, { v: 'ml', label: 'Polymer solution to add (mL)' }],
    jarSludgeInputs: function () {
      var s = this.state;
      return { solve: s.jdSolve, sampleMl: s.jdSampleMl, ds: s.jdDs, sg: s.jdSg, sgEntered: s.jdSgEntered, solStrength: s.jdSolStrength, polyMl: s.jdPolyMl, dose: s.jdDose };
    },
    computeJarSludge: function () { return this.jarSludgeCalc(this.jarSludgeInputs()); },
    jdInputSig: function () {
      var s = this.state;
      return JSON.stringify(['jdSolve', 'jdSampleMl', 'jdDs', 'jdSg', 'jdSgEntered', 'jdSolStrength', 'jdPolyMl', 'jdDose'].map(function (k) { return s[k]; }));
    },
    // sludge g = mL x SG (kg/L = g/mL); DS g = sludge g x DS % / 100; product g = mL x S % w/v / 100 (S g per 100 mL);
    // dose kg/t DS = product g / DS g x 1000. The polymer solution added does not change the dry solids, so it is
    // never added to the sludge volume. Dose is kg of product as made down, not active polymer.
    jarSludgeCalc: function (inp) {
      var self = this, errors = [], cautions = [], notes = [], working = [];
      var err = function (field, text, prompt) { errors.push(prompt ? { field: field, text: text, prompt: true } : { field: field, text: text }); };
      var num = function (field, raw, label, opts) { var r = self.pcNumber(raw, label, opts); if (r.error) { err(field, r.error, r.empty); return NaN; } return r.value; };
      var raw = function (x) { return String(x == null ? '' : x).trim(); };
      var F = function (n) { return self.pcFmt(n, 6); };
      var v = { sampleMl: NaN, ds: NaN, sg: NaN, S: NaN, sludgeG: NaN, dsG: NaN, productG: NaN, polyMl: NaN, dose: NaN };
      var solveOpt = this.pcOption(this.JD_SOLVE, inp.solve), solve = solveOpt ? solveOpt.v : '';
      if (!solveOpt) err('solve', 'Solve-for choice is not recognised \u2014 choose what to calculate.');
      v.sampleMl = num('sampleMl', inp.sampleMl, 'Sludge sample volume', { emptyHint: ' \u2014 enter the volume of sludge in the jar or beaker, in mL.' });
      v.ds = num('ds', inp.ds, 'Dry solids', { emptyHint: ' \u2014 enter the % DS of the sludge sample.' });
      if (v.ds >= 100) { err('ds', 'Dry solids must be below 100 % (it is the dry fraction of the wet sludge mass).'); v.ds = NaN; }
      v.sg = num('sg', inp.sg, 'Sludge SG');
      var sr = this.pcSolutionStrength(inp.solStrength);
      if (sr.error) err('solStrength', sr.error, sr.empty); else v.S = sr.value;
      if (solve === 'dose') v.polyMl = num('polyMl', inp.polyMl, 'Polymer solution added', { emptyHint: ' \u2014 enter the mL of made-down polymer solution added to the jar.' });
      if (solve === 'ml') v.dose = num('dose', inp.dose, 'Target dose', { emptyHint: ' \u2014 enter the target dose in kg product per t DS.' });
      cautions.push.apply(cautions, this.plausibilityCautions(v.sg, v.S, false));
      var sgAssumed = !inp.sgEntered && raw(inp.sg) === '1.0';
      if (sgAssumed) notes.push('Sludge SG 1.0 kg/L (assumed): 1 mL of sludge is taken as 1 g. Enter a measured SG if known.');
      notes.push('Dose is kg of product as made down per tonne of dry solids, not active polymer.');
      notes.push('The polymer solution added does not change the dry solids in the jar, so it is not added to the sludge volume.');
      var hl = { label: { dose: 'Polymer dose', ml: 'Polymer solution to add' }[solve] || 'Result', text: '\u2014', unit: '', precise: '' };
      var ok = !errors.length;
      if (ok) {
        v.sludgeG = v.sampleMl * v.sg;
        v.dsG = v.sludgeG * v.ds / 100;
        if (solve === 'dose') { v.productG = v.polyMl * v.S / 100; v.dose = v.productG / v.dsG * 1000; }
        else { v.productG = v.dose * v.dsG / 1000; v.polyMl = v.productG / v.S * 100; }
        var hv = solve === 'dose' ? v.dose : v.polyMl;
        if (!isFinite(hv) || !(hv > 0) || !isFinite(v.dsG) || !(v.dsG > 0)) {
          err('result', 'The result is outside the representable numeric range \u2014 check the entered values.'); ok = false;
        }
      }
      if (ok) {
        hl.text = this.pcFmt(hv, 3); var h4 = this.pcFmt(hv, 4); if (h4 !== hl.text) hl.precise = h4;
        hl.unit = solve === 'dose' ? 'kg product / t DS' : 'mL of ' + raw(inp.solStrength) + ' % w/v solution';
        working.push('Sludge mass = ' + raw(inp.sampleMl) + ' mL \u00d7 ' + raw(inp.sg) + ' kg/L = ' + F(v.sludgeG) + ' g' + (sgAssumed ? ' (assumed SG)' : ''));
        working.push('Dry solids = ' + F(v.sludgeG) + ' g \u00d7 ' + raw(inp.ds) + ' % \u00f7 100 = ' + F(v.dsG) + ' g');
        if (solve === 'dose') {
          working.push('Product added = ' + raw(inp.polyMl) + ' mL \u00d7 ' + raw(inp.solStrength) + ' % w/v \u00f7 100 = ' + F(v.productG) + ' g (' + raw(inp.solStrength) + ' g per 100 mL)');
          working.push('Dose = ' + F(v.productG) + ' g \u00f7 ' + F(v.dsG) + ' g \u00d7 1000 = ' + F(v.dose) + ' kg product/t DS');
        } else {
          working.push('Product needed = ' + raw(inp.dose) + ' kg/t DS \u00d7 ' + F(v.dsG) + ' g \u00f7 1000 = ' + F(v.productG) + ' g');
          working.push('Solution to add = ' + F(v.productG) + ' g \u00f7 ' + raw(inp.solStrength) + ' % w/v \u00d7 100 = ' + F(v.polyMl) + ' mL');
        }
        if (v.polyMl >= v.sampleMl) cautions.push('The polymer solution volume (' + this.pcFmt(v.polyMl, 4) + ' mL) is not smaller than the sludge sample (' + raw(inp.sampleMl) + ' mL). Check the sample volume, solution strength and ' + (solve === 'dose' ? 'solution added' : 'target dose') + '.');
      }
      if (!ok) { v.sludgeG = NaN; v.dsG = NaN; v.productG = NaN; if (solve === 'dose') v.dose = NaN; if (solve === 'ml') v.polyMl = NaN; }
      return { ok: ok, solve: solve, errors: errors, cautions: cautions, notes: notes, working: working, headline: hl, v: v };
    },
    // Plausibility cautions (user decision 2026-10-07): neutral, never blocking. A sludge SG outside 0.9-1.5 kg/L or a
    // polymer solution strength above 1 % w/v is usually a typo (SG 10.2 for 1.02) or the neat product's % typed as the
    // made-down strength. Sludge dewatering only (Calculator and Jar Test); potable coagulants are often made down above 1 %.
    PLAUS_SG_MIN: 0.9, PLAUS_SG_MAX: 1.5, PLAUS_POLY_MAX_PCT: 1,
    plausibilityCautions: function (sg, strengthPct, fromBatch) {
      var out = [];
      if (isFinite(sg) && sg > 0 && (sg < this.PLAUS_SG_MIN || sg > this.PLAUS_SG_MAX)) out.push('Sludge SG of ' + this.pcFmt(sg, 4) + ' kg/L is outside the usual 0.9\u20131.5 kg/L for sludge. Check it is a measured value and not a typo.');
      if (isFinite(strengthPct) && strengthPct > this.PLAUS_POLY_MAX_PCT) out.push(fromBatch
        ? 'The batch works out at ' + this.pcFmt(strengthPct, 4) + ' % w/v, above 1 % w/v, which is unusual for made-down polymer. Check the kg of product and the litres of water.'
        : 'A solution strength of ' + this.pcFmt(strengthPct, 4) + ' % w/v is above 1 % w/v, which is unusual for made-down polymer. Check you entered the made-down solution strength, not the neat product\u2019s strength or active content.');
      return out;
    },
    // Solution strength S (% w/v as made down) -> { value } or { error[, empty] } naming the field. Never guessed.
    pcSolutionStrength: function (raw) {
      var r = this.pcNumber(raw, 'Solution strength', { emptyHint: ' \u2014 enter the % w/v as made down (g product per 100 mL solution), e.g. 0.25.' });
      if (r.error) return r;
      if (r.value > 100) return { error: 'Solution strength can\u2019t be more than 100 % w/v (100 g product per 100 mL) \u2014 enter the strength as made down, not the active content.' };
      return r;
    },
    pcOption: function (list, code) {
      if (typeof code !== 'string') return null;
      for (var i = 0; i < list.length; i++) if (list[i].v === code) return list[i];
      return null;
    },
    // Display only: sf significant figures; integer digits are never rounded away; no exponent text.
    pcFmt: function (n, sf, keepZeros) {
      if (typeof n !== 'number' || !isFinite(n)) return '—';
      if (n === 0) return '0';
      var text = this.decimalText(Math.abs(n) >= Math.pow(10, sf) ? String(Math.round(n)) : n.toPrecision(sf));
      if (!keepZeros && text.indexOf('.') >= 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
      return text;
    },
    // One entered number -> { value } or { error } naming the field. Plain positive decimals only.
    pcNumber: function (raw, label, opts) {
      opts = opts || {};
      var t = String(raw == null ? '' : raw).trim();
      if (!t) return { error: label + ' is empty' + (opts.emptyHint || ' — enter a value.'), empty: true };
      if (t.indexOf(',') >= 0) return { error: label + ': comma decimals are not accepted — use a decimal point (e.g. 23.7).' };
      if (/^[-+]?(\d+\.?\d*|\.\d+)e[-+]?\d+$/i.test(t)) return { error: label + ': exponent notation is not accepted — enter a plain decimal number.' };
      if (t.charAt(0) === '-') return { error: label + ' must be positive — negative values are not accepted.' };
      if (!/^\d*\.?\d+$/.test(t)) return { error: label + ' is not a plain decimal number — use digits and one decimal point only.' };
      var n = this.parseNum(t);
      if (!isFinite(n)) return { error: label + ' is outside the representable numeric range (too large or too small).' };
      if (!(n > 0)) return { error: label + ' must be greater than zero' + (opts.zeroHint || '.') };
      return { value: n };
    },
    polyInputs: function () {
      var s = this.state;
      return { solve: s.pcSolve, sludgeFlow: s.pcSludgeFlow, sludgeUnit: s.pcSludgeUnit, ds: s.pcDs, dsLocation: s.pcDsLocation, pumps: s.pcPumps, pumpUnit: s.pcPumpUnit, reading: s.pcReading, strengthFrom: s.pcStrengthFrom, solStrength: s.pcSolStrength, batchKg: s.pcBatchKg, batchL: s.pcBatchL, form: s.pcForm, active: s.pcActive, dose: s.pcDose, sg: s.pcSg, sgEntered: s.pcSgEntered, hours: s.pcHours };
    },
    computePoly: function () { return this.polyCalc(this.polyInputs()); },
    polyInputSig: function () {
      var s = this.state;
      return JSON.stringify(['pcSolve', 'pcSludgeFlow', 'pcSludgeUnit', 'pcDs', 'pcDsLocation', 'pcPumps', 'pcPumpUnit', 'pcReading', 'pcBatchKg', 'pcBatchL', 'pcForm', 'pcActive', 'pcDose', 'pcSg', 'pcSgEntered', 'pcHours', 'pcStrengthFrom', 'pcSolStrength'].map(function (k) { return s[k]; }));
    },
    polyCalc: function (inp) {
      var self = this, errors = [], warnings = [], cautions = [], notes = [], working = [];
      var NUMS = ['qsLh', 'qsM3h', 'qsUnitValue', 'dsPct', 'tdsH', 'kgDsH', 'qpLh', 'qpUnitValue', 'c', 'cPctWV', 'kgPer1000', 'batchKg', 'batchL', 'productKgH', 'productKgDay', 'solutionLDay', 'batchesDay', 'ratioPct', 'dose', 'activeKgH', 'activeDose', 'crossDose', 'sg', 'hours'];
      var v = {}; NUMS.forEach(function (k) { v[k] = NaN; });
      // prompt = a field not yet entered or chosen (shown as a neutral note); otherwise an entered value that cannot be used (red)
      var err = function (field, text, prompt) { errors.push(prompt ? { field: field, text: text, prompt: true } : { field: field, text: text }); };
      var num = function (field, raw, label, opts) { var r = self.pcNumber(raw, label, opts); if (r.error) { err(field, r.error, r.empty); return NaN; } return r.value; };
      var raw = function (x) { return String(x == null ? '' : x).trim(); };
      var F = function (n) { return self.pcFmt(n, 6); };
      var solveOpt = this.pcOption(this.PC_SOLVE, inp.solve), solve = solveOpt ? solveOpt.v : '';
      if (!solveOpt) err('solve', 'Solve-for choice is not recognised — choose what to calculate.');
      var sUnit = this.pcOption(this.PC_SLUDGE_UNITS, inp.sludgeUnit), pUnit = this.pumpUnitOf(inp.pumpUnit);
      var sUnitMsg = function () { return raw(inp.sludgeUnit) ? 'Sludge flow unit is not recognised — choose L/s, L/min, L/h or m³/h.' : 'Sludge flow unit is not selected — choose L/s, L/min, L/h or m³/h. No unit is assumed (a unit mix-up causes a 3.6× or larger error).'; };
      var pUnitMsg = function () { return raw(inp.pumpUnit) ? 'Pump flow unit is not recognised — choose L/h, L/min, L/s or mL/min.' : 'Pump flow unit is not selected — choose L/h, L/min, L/s or mL/min. No unit is assumed.'; };
      var qs = NaN, ds = NaN, qp = NaN, bk = NaN, bl = NaN, dose = NaN, sg, hours, active = NaN, c = NaN, tds = NaN, kg = NaN, S = NaN, strengthUsed = '';
      // sludge flow and its unit (the unit is optional display-only when sludge flow is the solved field)
      if (solve !== 'sludge') { qs = num('sludgeFlow', inp.sludgeFlow, 'Sludge flow'); if (!sUnit) err('sludgeUnit', sUnitMsg(), !raw(inp.sludgeUnit)); else qs = qs * sUnit.lh; }
      else if (raw(inp.sludgeUnit) && !sUnit) err('sludgeUnit', sUnitMsg());
      if (solve !== 'ds') {
        ds = num('ds', inp.ds, 'Dry solids');
        if (ds >= 100) { err('ds', 'Dry solids must be below 100 % (it is the dry fraction of the wet sludge mass).'); ds = NaN; }
      }
      // polymer pumps: only Running rows are summed; Standby/off rows stay listed but excluded
      var rows = Array.isArray(inp.pumps) ? inp.pumps : [], running = 0, sumEntered = 0, sumLh = 0, runParts = [], excluded = [], pumpsOk = true;
      if (solve !== 'flow') {
        if (!rows.length) { err('pumps', 'Add at least one pump row.'); pumpsOk = false; }
        else if (rows.length > this.PC_MAX_PUMPS) { err('pumps', 'A maximum of 20 pump rows is supported — remove rows.'); pumpsOk = false; }
        else {
          rows.forEach(function (row, i) {
            var n = i + 1, st = row && typeof row === 'object' ? row.status : undefined, flowRaw = row && typeof row === 'object' ? row.flow : '';
            if (st === 'standby') { excluded.push({ n: n, text: raw(flowRaw) }); return; }
            if (st !== 'running') { err('pumpStatus-' + n, 'Pump ' + n + ' status is not recognised — choose Running or Standby/off.'); pumpsOk = false; return; }
            running++;
            var x = num('pump-' + n, flowRaw, 'Pump ' + n + ' flow', { emptyHint: ' — enter its reading, set it to Standby/off or remove the row.', zeroHint: ' — set the pump to Standby/off if it is not running.' });
            if (!isFinite(x)) { pumpsOk = false; return; }
            runParts.push(raw(flowRaw)); sumEntered += x;
            if (pUnit) sumLh += self.pumpFlowToLh(x, pUnit.v);
          });
          if (!running) { err('pumps', 'No pump is set to Running — at least one running pump is needed to total the polymer solution flow.'); pumpsOk = false; }
        }
        if (!pUnit) err('pumpUnit', pUnitMsg(), !raw(inp.pumpUnit));
        if (pumpsOk && pUnit) qp = sumLh;
      } else if (raw(inp.pumpUnit) && !pUnit) err('pumpUnit', pUnitMsg());
      // make-down strength: the chosen method only; the other method's draft is neither validated nor used
      var from = this.pcOption(this.PC_STRENGTH_FROM, inp.strengthFrom), byBatch = !!from && from.v === 'batch', byStrength = !!from && from.v === 'strength';
      if (!from) err('strengthFrom', 'Strength from is not recognised \u2014 choose Solution strength (% w/v) or Batch: kg product + L water. No method is assumed.');
      else if (byBatch) {
        if (solve !== 'batch') bk = num('batchKg', inp.batchKg, 'Neat product per batch');
        bl = num('batchL', inp.batchL, 'Batch water volume');
      } else if (solve !== 'batch') {
        var sr = this.pcSolutionStrength(inp.solStrength);
        if (sr.error) err('solStrength', sr.error, sr.empty); else S = sr.value;
      }
      // kg/L as made down: batch kg / L, or S % w/v = S g per 100 mL = S x 0.01 kg/L (computed as S / 100, correctly rounded)
      var cOf = function () { return byBatch ? bk / bl : S / 100; };
      if (solve !== 'dose') dose = num('dose', inp.dose, 'Target dose', { emptyHint: ' — enter the target dose in kg product per t DS.' });
      sg = num('sg', inp.sg, 'Sludge SG');
      var blocking = errors.length;
      // optional / daily-only inputs never block the product-basis result
      hours = num('hours', inp.hours, 'Run hours per day');
      if (hours > 24) { err('hours', 'Run hours per day cannot exceed 24.'); hours = NaN; }
      if (raw(inp.active)) {
        active = num('active', inp.active, 'Active content');
        if (active > 100) { err('active', 'Active content cannot exceed 100 %.'); active = NaN; }
      }
      var sgAssumed = !inp.sgEntered && raw(inp.sg) === '1.0';
      var sgText = 'SG ' + raw(inp.sg) + ' kg/L' + (sgAssumed ? ' (assumed)' : '');
      var form = this.pcOption(this.PC_FORMS, inp.form), reading = this.pcOption(this.PC_READING, inp.reading);
      if (solve !== 'flow') {
        if (reading && reading.v === 'setpoint') cautions.push('Pump readings are setpoints or display values, not measured delivery: verify by drawdown or catch test before relying on this result.');
        else if (!reading || reading.v !== 'measured') cautions.push('Pump reading type is unknown: verify actual delivery by drawdown or catch test before relying on this result.');
      }
      if (sgAssumed) notes.push('Sludge SG 1.0 kg/L (assumed) — change it under Advanced if a measured value is known.');
      cautions.push.apply(cautions, this.plausibilityCautions(sg, byBatch ? (isFinite(bk) && isFinite(bl) ? bk / bl * 100 : NaN) : S, byBatch));
      if (!raw(inp.active)) {
        notes.push('Dose is kg of product as made down (as-supplied basis). No active fraction is assumed for any product form; enter active content % (from the supplier TDS/CoA) to also show kg active.');
        if (form && (form.v === 'emulsion' || form.v === 'liquid')) notes.push('Emulsion and liquid products are typically not 100 % active: do not compare this product-basis dose with an active-basis figure.');
      }
      if (solve !== 'ds' && !raw(inp.dsLocation)) notes.push('DS sample location not recorded — DS sampled away from the press feed changes the dose in proportion.');

      var ok = !blocking, dsInvalid = false;
      if (ok) {
        var dsf = ds / 100;
        if (solve === 'dose') { tds = qs * sg * dsf / 1000; kg = qp * (c = cOf()); dose = kg / tds; }
        else if (solve === 'flow') { tds = qs * sg * dsf / 1000; kg = dose * tds; c = cOf(); qp = kg / c; }
        else if (solve === 'sludge') { c = cOf(); kg = qp * c; tds = kg / dose; qs = tds * 1000 / (sg * dsf); }
        else if (solve === 'ds') { c = cOf(); kg = qp * c; tds = kg / dose; ds = tds * 1000 / (qs * sg) * 100; }
        else if (solve === 'batch') { tds = qs * sg * dsf / 1000; kg = dose * tds; c = kg / qp; if (byBatch) bk = c * bl; }
        var cross = (qp / qs * 100 / 100) * ((c * 100) / ds) * 1000 / sg;
        var core = [qs, ds, tds, qp, c, kg, dose, qp / qs * 100, c * 100, c * 1000, tds * 1000, cross].concat(byBatch ? [bk] : []);
        if (solve === 'ds' && isFinite(ds) && ds >= 100) {
          dsInvalid = true; ok = false;
          err('ds', 'Solved dry solids of ' + this.pcFmt(ds, 4) + ' % is not physically possible (must be above 0 and below 100 %). Check the target dose, flows, units and make-down.');
        } else if (solve === 'batch' && isFinite(c) && c > 1) {
          // 100 % w/v (1 kg per L) is undiluted product, the same limit as an entered strength: a pump too small for the dose cannot be solved
          ok = false; err('batchStrength', 'Solved solution strength of ' + this.pcFmt(c * 100, 4) + ' % w/v is not possible (it can\u2019t be more than 100 % w/v, which is undiluted product). Check the target dose, flows and units.');
        } else if (core.some(function (x) { return !isFinite(x) || !(x > 0); })) {
          ok = false; err('result', 'A derived value is outside the representable numeric range (overflow or underflow) — check the magnitudes entered. No result is shown.');
        }
      }
      if (ok) {
        v.qsLh = qs; v.qsM3h = qs / 1000; v.qsUnitValue = sUnit ? qs / sUnit.lh : NaN;
        v.dsPct = ds; v.tdsH = tds; v.kgDsH = tds * 1000; v.qpLh = qp; v.qpUnitValue = pUnit ? this.lhToPumpFlow(qp, pUnit.v) : NaN;
        v.c = c; v.cPctWV = c * 100; v.kgPer1000 = c * 1000; v.batchKg = bk; v.batchL = bl; v.productKgH = kg;
        v.ratioPct = qp / qs * 100; v.dose = dose; v.crossDose = cross; v.sg = sg;
        if (hours > 0) {
          v.hours = hours; v.productKgDay = kg * hours; v.solutionLDay = qp * hours; v.batchesDay = byBatch ? qp * hours / bl : NaN; // no batch volume in strength mode
          if (![v.productKgDay, v.solutionLDay].concat(byBatch ? [v.batchesDay] : []).every(function (x) { return isFinite(x) && x > 0; })) { v.productKgDay = v.solutionLDay = v.batchesDay = NaN; err('hours', 'Daily totals are outside the representable numeric range — not shown.'); }
        }
        if (active > 0) {
          v.activeKgH = kg * active / 100; v.activeDose = dose * active / 100;
          if (!(isFinite(v.activeKgH) && v.activeKgH > 0 && isFinite(v.activeDose) && v.activeDose > 0)) { v.activeKgH = v.activeDose = NaN; err('active', 'Active-basis values are outside the representable numeric range — not shown.'); }
        }
        if (dose < 1 || dose > 8) warnings.push({ kind: 'dose-range', text: this.PC_CHECK_LABEL + ': dose ' + this.pcFmt(dose, 3) + ' kg product/t DS is outside 1–8 kg product/t DS (product basis, as made down; not active polymer). Check pump totals (per-pump vs total, standby pumps), flow units, DS sample point.' });
        if (v.ratioPct < 1 || v.ratioPct > 5) warnings.push({ kind: 'ratio-range', text: this.PC_CHECK_LABEL + ': solution-to-sludge ratio ' + this.pcFmt(v.ratioPct, 3) + ' % is outside 1–5 %. Check pump totals, flow units and the make-down.' });

        // ---- Show working: each step with the actual numbers (more digits than the results) ----
        var dsText = solve === 'ds' ? F(ds) : raw(inp.ds), wet = qs * sg;
        var sludgeLine = 'Sludge flow: ' + raw(inp.sludgeFlow) + ' ' + (sUnit ? sUnit.label : '') + ' × ' + (sUnit ? sUnit.lh : '') + ' = ' + F(qs) + ' L/h';
        var wetLine = 'Wet sludge: ' + F(qs) + ' L/h × ' + sgText + ' = ' + F(wet) + ' kg/h';
        var dsLine = 'Dry solids: ' + F(wet) + ' kg/h × ' + dsText + ' % ÷ 100 = ' + F(tds * 1000) + ' kg DS/h = ' + F(tds) + ' t DS/h';
        var pumpLines = function () {
          var lines = ['Pumps: ' + running + ' of ' + rows.length + ' pumps running: ' + runParts.join(' + ') + ' = ' + F(sumEntered) + ' ' + pUnit.label + ' × ' + F(pUnit.num / pUnit.den) + ' = ' + F(qp) + ' L/h (total running flow)'];
          excluded.forEach(function (x) { lines.push('Pump ' + x.n + ': ' + (x.text ? x.text + ' ' + pUnit.label : '(blank)') + ' — standby/off, excluded from the total'); });
          return lines;
        };
        var strengthLine = byBatch
          ? 'Solution strength: ' + raw(inp.batchKg) + ' kg ÷ ' + raw(inp.batchL) + ' L = ' + F(c) + ' kg/L (' + F(c * 100) + ' % w/v; ' + F(c * 1000) + ' kg per 1000 L)'
          : 'Solution strength: ' + raw(inp.solStrength) + ' % w/v (entered solution strength) \u00D7 0.01 = ' + F(c) + ' kg/L (' + F(c * 1000) + ' kg per 1000 L)';
        var convention = byBatch ? this.PC_CONVENTION : this.PC_CONVENTION_STRENGTH;
        // strength used, how it was obtained and its basis (results, working and share text)
        strengthUsed = 'Strength used: ' + (byStrength && solve !== 'batch' ? raw(inp.solStrength) : F(c * 100)) + ' % w/v (' + F(c) + ' kg/L) \u2014 ' +
          (solve === 'batch' ? 'solved for the target dose' + (byBatch ? ' (' + F(bk) + ' kg in ' + raw(inp.batchL) + ' L)' : '') : byBatch ? 'from batch: ' + raw(inp.batchKg) + ' kg in ' + raw(inp.batchL) + ' L' : 'entered solution strength') +
          '; ' + this.PC_STRENGTH_BASIS;
        var productLine = 'Product: ' + F(qp) + ' L/h × ' + F(c) + ' kg/L = ' + F(kg) + ' kg product/h';
        if (solve === 'dose') working = [sludgeLine, wetLine, dsLine].concat(pumpLines(), [strengthLine, convention, strengthUsed, productLine, 'Dose: ' + F(kg) + ' kg/h ÷ ' + F(tds) + ' t DS/h = ' + F(dose) + ' kg product/t DS']);
        else if (solve === 'flow') working = [sludgeLine, wetLine, dsLine, strengthLine, convention, strengthUsed, 'Product needed: ' + raw(inp.dose) + ' kg product/t DS × ' + F(tds) + ' t DS/h = ' + F(kg) + ' kg product/h', 'Total running solution flow: ' + F(kg) + ' kg/h ÷ ' + F(c) + ' kg/L = ' + F(qp) + ' L/h' + (pUnit ? ' = ' + F(v.qpUnitValue) + ' ' + pUnit.label : '') + ' (no per-pump split)'];
        else if (solve === 'sludge') working = pumpLines().concat([strengthLine, convention, strengthUsed, productLine, 'Dry solids load: ' + F(kg) + ' kg/h ÷ ' + raw(inp.dose) + ' kg/t DS = ' + F(tds) + ' t DS/h = ' + F(tds * 1000) + ' kg DS/h', 'Sludge flow: ' + F(tds * 1000) + ' kg DS/h ÷ (' + dsText + ' % ÷ 100) ÷ ' + sgText + ' = ' + F(qs) + ' L/h = ' + F(qs / 1000) + ' m³/h' + (sUnit ? ' = ' + F(v.qsUnitValue) + ' ' + sUnit.label : '')]);
        else if (solve === 'ds') working = [sludgeLine, wetLine].concat(pumpLines(), [strengthLine, convention, strengthUsed, productLine, 'Dry solids load: ' + F(kg) + ' kg/h ÷ ' + raw(inp.dose) + ' kg/t DS = ' + F(tds) + ' t DS/h = ' + F(tds * 1000) + ' kg DS/h', 'Dry solids: ' + F(tds * 1000) + ' kg DS/h ÷ ' + F(wet) + ' kg/h × 100 = ' + F(ds) + ' %']);
        else if (solve === 'batch' && byBatch) working = [sludgeLine, wetLine, dsLine].concat(pumpLines(), ['Product needed: ' + raw(inp.dose) + ' kg product/t DS × ' + F(tds) + ' t DS/h = ' + F(kg) + ' kg product/h', 'Solution strength: ' + F(kg) + ' kg/h ÷ ' + F(qp) + ' L/h = ' + F(c) + ' kg/L (' + F(c * 100) + ' % w/v)', 'Per batch: ' + F(c) + ' kg/L × ' + raw(inp.batchL) + ' L = ' + F(bk) + ' kg product (' + F(c * 1000) + ' kg per 1000 L)', this.PC_CONVENTION, strengthUsed]);
        else if (solve === 'batch') working = [sludgeLine, wetLine, dsLine].concat(pumpLines(), ['Product needed: ' + raw(inp.dose) + ' kg product/t DS × ' + F(tds) + ' t DS/h = ' + F(kg) + ' kg product/h', 'Required solution strength: ' + F(kg) + ' kg/h ÷ ' + F(qp) + ' L/h = ' + F(c) + ' kg/L × 100 = ' + F(c * 100) + ' % w/v (' + F(c * 1000) + ' kg per 1000 L)', this.PC_CONVENTION_STRENGTH, strengthUsed]);
        working.push('Solution-to-sludge ratio: ' + F(qp) + ' L/h ÷ ' + F(qs) + ' L/h × 100 = ' + F(v.ratioPct) + ' %');
        var agrees = Math.abs(cross - dose) <= 1e-9 * dose;
        working.push('Cross-check: ' + F(v.ratioPct) + ' % × (' + F(c * 100) + ' % ÷ ' + dsText + ' %) × 1000 ÷ SG ' + raw(inp.sg) + ' = ' + F(cross) + ' kg product/t DS — ' + (agrees ? 'agrees with the dose' : 'DOES NOT agree with the dose'));
        if (isFinite(v.productKgDay)) working.push(byBatch
          ? 'Daily: ' + F(kg) + ' kg/h × ' + raw(inp.hours) + ' h = ' + F(v.productKgDay) + ' kg product/day; ' + F(qp) + ' L/h × ' + raw(inp.hours) + ' h ÷ ' + raw(inp.batchL) + ' L = ' + F(v.batchesDay) + ' batches/day'
          : 'Daily: ' + F(kg) + ' kg/h × ' + raw(inp.hours) + ' h = ' + F(v.productKgDay) + ' kg product/day; ' + F(qp) + ' L/h × ' + raw(inp.hours) + ' h = ' + F(v.solutionLDay) + ' L/day of solution');
        if (isFinite(v.activeDose)) working.push('Active: ' + F(kg) + ' kg/h × ' + raw(inp.active) + ' % = ' + F(v.activeKgH) + ' kg active/h; ' + F(dose) + ' × ' + raw(inp.active) + ' % = ' + F(v.activeDose) + ' kg active/t DS');
      }
      // Active content is the NEAT product's active % (supplier TDS/CoA); solution strength is the dilution made up on site and pumped in.
      // A value not higher than the solution strength in use is almost certainly the solution strength typed in the wrong box.
      var activeHint = '';
      if (raw(inp.active) && active > 0) {
        var AF = function (n) { return self.pcFmt(n, 6); };
        if (byStrength && solve !== 'batch' && S > 0) { if (this.pcActiveAtOrBelow(active, S)) activeHint = raw(inp.active) + ' % active is not higher than your ' + raw(inp.solStrength) + ' % w/v solution strength. ' + this.PC_ACTIVE_DEF + ' Did you mean to enter it as the solution strength above?'; }
        else if (byBatch && solve !== 'batch' && bk > 0 && bl > 0) { var sb = bk / bl * 100; if (this.pcActiveAtOrBelow(active, sb)) activeHint = raw(inp.active) + ' % active is not higher than your ' + AF(sb) + ' % w/v solution strength from the batch. ' + this.PC_ACTIVE_DEF; }
        else if (solve === 'batch' && ok && this.pcActiveAtOrBelow(active, c * 100)) activeHint = raw(inp.active) + ' % active is not higher than the solved ' + AF(c * 100) + ' % w/v solution strength. ' + this.PC_ACTIVE_DEF;
      }
      // headline: the solved field
      var hl = { label: { dose: 'Polymer dose', flow: 'Total running polymer solution flow required', sludge: 'Sludge flow', ds: 'Dry solids', batch: 'Batch strength' }[solve] || 'Result', text: '—', unit: '', precise: '' };
      if (solve === 'dose') hl.unit = 'kg product / t DS';
      else if (solve === 'flow') hl.unit = pUnit ? pUnit.label + (ok ? ' (' + this.pcFmt(qp, 4) + ' L/h)' : '') : 'L/h' + (ok ? ' (choose a pump flow unit to also show L/min, L/s or mL/min)' : '');
      else if (solve === 'sludge') hl.unit = (sUnit ? sUnit.label : 'L/h') + (ok ? ' (' + (sUnit ? this.pcFmt(qs, 4) + ' L/h; ' : '') + this.pcFmt(qs / 1000, 4) + ' m³/h)' : '');
      else if (solve === 'ds') hl.unit = '% dry solids';
      else if (solve === 'batch' && byStrength) hl.unit = '% w/v as made down' + (ok ? ' \u00B7 ' + this.pcFmt(c * 1000, 4) + ' kg product per 1000 L' : '');
      else if (solve === 'batch') hl.unit = ok ? 'kg product per ' + this.pcFmt(bl, 6) + ' L batch (' + this.pcFmt(c * 1000, 4) + ' kg per 1000 L; ' + this.pcFmt(c * 100, 4) + ' % w/v)' : 'kg product per batch';
      if (ok) { // display only; trailing zeros stripped as on the Dose page (App.fmt); a 4-figure value is carried when it differs from the 3-figure headline
        var hv = { dose: dose, flow: pUnit ? v.qpUnitValue : qp, sludge: sUnit ? v.qsUnitValue : qs, ds: ds, batch: byStrength ? c * 100 : bk }[solve];
        hl.text = this.pcFmt(hv, 3); var h4 = this.pcFmt(hv, 4); if (h4 !== hl.text) hl.precise = h4;
      }
      return { ok: ok, solve: solve, dsInvalid: dsInvalid, errors: errors, warnings: warnings, cautions: cautions, notes: notes, working: working, v: v, headline: hl,
        strengthFrom: from ? from.v : '', strengthUsed: ok ? strengthUsed : '', activeHint: activeHint,
        pumpsRunning: solve === 'flow' ? NaN : running, pumpsTotal: solve === 'flow' ? NaN : rows.length, pumpsRunningEntered: sumEntered, excluded: excluded };
    },
    // Plain-text record for Share / Copy: inputs, units, assumptions, flags and the serving release.
    polyShareText: function (r, inp, build) {
      var self = this, L = [], raw = function (x) { return String(x == null ? '' : x).trim(); }, F = function (n, sf) { return self.pcFmt(n, sf || 4); };
      var solve = this.pcOption(this.PC_SOLVE, inp.solve), sUnit = this.pcOption(this.PC_SLUDGE_UNITS, inp.sludgeUnit), pUnit = this.pumpUnitOf(inp.pumpUnit);
      var reading = this.pcOption(this.PC_READING, inp.reading), form = this.pcOption(this.PC_FORMS, inp.form), v = r.v;
      L.push('Field Assistant — Calculator: polymer dose (sludge dewatering)');
      L.push('Solved for: ' + (solve ? solve.label : 'not recognised'));
      L.push(r.ok ? 'Result: ' + r.headline.text + ' ' + r.headline.unit + ' (' + r.headline.label + ')' : 'No result: ' + r.errors.map(function (e) { return e.text; }).join(' '));
      L.push('Inputs:');
      L.push('- Sludge flow: ' + (inp.solve === 'sludge' ? 'solved (see result)' : raw(inp.sludgeFlow) + ' ' + (sUnit ? sUnit.label : '[unit not selected]') + (r.ok ? ' (' + F(v.qsLh, 6) + ' L/h)' : '')));
      L.push('- Dry solids: ' + (inp.solve === 'ds' ? 'solved (see result)' : raw(inp.ds) + ' %') + ' (sample location: ' + (raw(inp.dsLocation) || 'not recorded') + ')');
      if (inp.solve === 'flow') L.push('- Pumps: solved as the total running flow (no per-pump split); pump flow unit: ' + (pUnit ? pUnit.label : 'not selected'));
      else {
        L.push('- Pump flow unit: ' + (pUnit ? pUnit.label : 'not selected') + '; Reading type: ' + (reading ? reading.label : 'not recognised'));
        var rows = Array.isArray(inp.pumps) ? inp.pumps : [];
        L.push('- Pumps: ' + (isFinite(r.pumpsRunning) ? r.pumpsRunning : 0) + ' of ' + rows.length + ' pumps running' + (r.ok ? '; Total running flow: ' + F(r.pumpsRunningEntered, 6) + ' ' + pUnit.label + ' (' + F(v.qpLh, 6) + ' L/h)' : ''));
        rows.forEach(function (p, i) {
          var t = p && typeof p === 'object' ? raw(p.flow) : '', st = p && typeof p === 'object' ? p.status : '';
          L.push('  Pump ' + (i + 1) + ': ' + (t ? t + (pUnit ? ' ' + pUnit.label : '') : '(blank)') + (st === 'standby' ? ' — standby/off, excluded' : st === 'running' ? ' (running)' : ' (status not recognised)'));
        });
      }
      var from = this.pcOption(this.PC_STRENGTH_FROM, inp.strengthFrom);
      L.push('- Strength from: ' + (from ? from.label : 'not recognised'));
      if (from && from.v === 'strength') L.push('- Solution strength: ' + (inp.solve === 'batch' ? 'solved (see result)' : raw(inp.solStrength) + ' % w/v as made down (g product per 100 mL solution)'));
      else if (from) L.push('- Make-down: ' + (inp.solve === 'batch' ? 'solved' : raw(inp.batchKg) + ' kg') + ' product in ' + raw(inp.batchL) + ' L water' + (r.ok ? ' = ' + F(v.c, 6) + ' kg/L (' + F(v.cPctWV, 6) + ' % w/v)' : ''));
      if (r.ok && r.strengthUsed) L.push('- ' + r.strengthUsed);
      L.push('- Product form: ' + (form ? form.label : 'not recognised') + '; active content: ' + (raw(inp.active) ? raw(inp.active) + ' % of the neat product (supplier TDS/CoA)' : 'not entered (dose is kg product as made down; no active fraction assumed)'));
      if (inp.solve !== 'dose') L.push('- Target dose: ' + raw(inp.dose) + ' kg product/t DS');
      L.push('- Sludge SG: ' + raw(inp.sg) + ' kg/L' + (!inp.sgEntered && raw(inp.sg) === '1.0' ? ' (assumed)' : ' (entered)'));
      L.push('- Run hours per day: ' + raw(inp.hours));
      if (r.ok) {
        L.push('Outputs:');
        L.push('- Dose: ' + F(v.dose, 4) + ' kg product/t DS');
        L.push('- Dry solids load: ' + F(v.tdsH) + ' t DS/h (' + F(v.kgDsH) + ' kg DS/h); DS ' + F(v.dsPct) + ' %');
        L.push('- Sludge flow: ' + F(v.qsLh) + ' L/h (' + F(v.qsM3h) + ' m³/h' + (sUnit ? '; ' + F(v.qsUnitValue) + ' ' + sUnit.label : '') + ')');
        L.push('- Polymer solution (total running): ' + F(v.qpLh) + ' L/h' + (pUnit ? ' (' + F(v.qpUnitValue) + ' ' + pUnit.label + ')' : ''));
        L.push('- Product: ' + F(v.productKgH) + ' kg/h' + (isFinite(v.productKgDay) ? '; ' + F(v.productKgDay) + ' kg/day' : '; per day not calculated'));
        L.push('- Batches per day: ' + (from && from.v === 'strength' ? 'not calculated (no batch volume: strength entered as % w/v)' : isFinite(v.batchesDay) ? F(v.batchesDay) + ' × ' + raw(inp.batchL) + ' L' : 'not calculated'));
        L.push('- Solution-to-sludge ratio: ' + F(v.ratioPct) + ' %');
        if (isFinite(v.activeDose)) L.push('- Active: ' + F(v.activeKgH) + ' kg active/h; ' + F(v.activeDose) + ' kg active/t DS (from the entered ' + raw(inp.active) + ' %)');
      }
      var flags = r.warnings.map(function (w) { return w.text; }).concat(r.cautions, r.ok ? r.errors.map(function (e) { return e.text; }) : [], r.activeHint ? [r.activeHint] : [], r.notes);
      if (flags.length) { L.push('Flags and notes:'); flags.forEach(function (t) { L.push('- ' + t); }); }
      if (from) L.push(from.v === 'strength' ? this.PC_CONVENTION_STRENGTH : this.PC_CONVENTION);
      L.push('Indicative 1–8 kg product/t DS (product basis, as made down) and 1–5 % ratio checks are user-supplied field guidance, not a specification or approval.');
      L.push('BUILD: ' + (build && build.status === 'ok' ? build.build + ' (release that served this app session)' : build && build.status === 'none' ? 'not available (app opened before the offline release was installed; reopen the app to include it)' : 'not available (the serving release could not be confirmed)'));
      var d = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; }, off = -d.getTimezoneOffset();
      L.push('Generated: ' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' (UTC' + (off >= 0 ? '+' : '-') + p2(Math.floor(Math.abs(off) / 60)) + ':' + p2(Math.abs(off) % 60) + ')');
      return L.join('\n');
    },

    // ---- Calculator mode 2: water treatment dose (mg/L) ------------------------------------------------
    // mg/h = chemical L/h x K kg/L x 1e6 (K = product density for neat liquid, kg product per L water for a
    // made-down solution); dose mg/L = mg/h / water L/h. Volumetric dose (neat only) L/ML = chemical L/h x 1e6 /
    // water L/h (= mL/m3). Flows are converted once to L/h with exact factors. No unit, density, strength or
    // dosing range is assumed and no range warning is issued for drinking water.
    WT_WATER_UNITS: [
      { v: 'MLd', label: 'ML/d', num: 1000000, den: 24 },
      { v: 'm3d', label: 'm³/d', num: 1000, den: 24 },
      { v: 'm3h', label: 'm³/h', num: 1000, den: 1 },
      { v: 'Ls', label: 'L/s', num: 3600, den: 1 },
      { v: 'Lmin', label: 'L/min', num: 60, den: 1 },
      { v: 'Lh', label: 'L/h', num: 1, den: 1 }
    ],
    WT_SOLVE: [
      { v: 'dose', label: 'Dose (mg/L)' },
      { v: 'flow', label: 'Chemical flow (for a target mg/L)' },
      { v: 'water', label: 'Water flow' }
    ],
    WT_BASIS: [
      { v: 'neat', label: 'Neat liquid as supplied' },
      { v: 'madedown', label: 'Made-down solution' }
    ],
    WT_DOSE_UNIT: 'mg/L (ppm, mass per volume in water)',
    WT_CONVENTION: 'Convention: a made-down solution is entered as kg neat product + L batch water; kg per L of batch water is treated as kg per L of solution (the product\u2019s own volume is ignored, negligible at field strengths).',
    WT_CONVENTION_STRENGTH: 'Convention: a made-down solution is entered as its solution strength, % w/v as made down = g product per 100 mL of solution, so kg/L = % w/v \u00D7 0.01.',
    waterInputs: function () {
      var s = this.state;
      return { solve: s.wtSolve, waterFlow: s.wtWaterFlow, waterUnit: s.wtWaterUnit, basis: s.wtBasis, density: s.wtDensity, densitySource: s.wtDensitySource, strengthFrom: s.wtStrengthFrom, solStrength: s.wtSolStrength, batchKg: s.wtBatchKg, batchL: s.wtBatchL,
        pumps: s.wtPumps, pumpUnit: s.wtPumpUnit, reading: s.wtReading, strength: s.wtStrength, strengthBasis: s.wtStrengthBasis, dose: s.wtDose, hours: s.wtHours };
    },
    computeWater: function () { return this.waterCalc(this.waterInputs()); },
    wtInputSig: function () {
      var s = this.state;
      return JSON.stringify(['wtSolve', 'wtWaterFlow', 'wtWaterUnit', 'wtBasis', 'wtDensity', 'wtDensitySource', 'wtBatchKg', 'wtBatchL', 'wtPumps', 'wtPumpUnit', 'wtReading', 'wtStrength', 'wtStrengthBasis', 'wtDose', 'wtHours', 'wtStrengthFrom', 'wtSolStrength'].map(function (k) { return s[k]; }));
    },
    // Library densities follow the Dose page rule: liquid/emulsion products whose kg/L density is confirmed.
    waterDensityChoices: function () {
      var self = this;
      return this.allProducts().filter(function (p) { return /^(liquid|emulsion)\b/i.test(p.form || '') && self.productDensityConfirmed(p); });
    },
    waterCalc: function (inp) {
      var self = this, errors = [], cautions = [], notes = [], working = [];
      var NUMS = ['qwLh', 'qwM3h', 'qwMLd', 'qwUnitValue', 'qcLh', 'qcUnitValue', 'conc', 'mgH', 'productKgH', 'productKgDay', 'chemLDay', 'doseMgL', 'volLperML', 'activeMgL', 'crossKgH', 'hours'];
      var v = {}; NUMS.forEach(function (k) { v[k] = NaN; });
      var err = function (field, text, prompt) { errors.push(prompt ? { field: field, text: text, prompt: true } : { field: field, text: text }); };
      var num = function (field, raw, label, opts) { var r = self.pcNumber(raw, label, opts); if (r.error) { err(field, r.error, r.empty); return NaN; } return r.value; };
      var raw = function (x) { return String(x == null ? '' : x).trim(); };
      var F = function (n) { return self.pcFmt(n, 6); };
      var solveOpt = this.pcOption(this.WT_SOLVE, inp.solve), solve = solveOpt ? solveOpt.v : '';
      if (!solveOpt) err('solve', 'Solve-for choice is not recognised — choose what to calculate.');
      var wUnit = this.pcOption(this.WT_WATER_UNITS, inp.waterUnit), pUnit = this.pumpUnitOf(inp.pumpUnit), basis = this.pcOption(this.WT_BASIS, inp.basis);
      var wUnitMsg = function () { return raw(inp.waterUnit) ? 'Water flow unit is not recognised — choose ML/d, m³/d, m³/h, L/s, L/min or L/h.' : 'Water flow unit is not selected — choose ML/d, m³/d, m³/h, L/s, L/min or L/h. No unit is assumed.'; };
      var pUnitMsg = function () { return raw(inp.pumpUnit) ? 'Pump flow unit is not recognised — choose L/h, L/min, L/s or mL/min.' : 'Pump flow unit is not selected — choose L/h, L/min, L/s or mL/min. No unit is assumed.'; };
      var qw = NaN, qc = NaN, k = NaN, dose = NaN, bk = NaN, bl = NaN, hours, strength = NaN, lib = null, S = NaN, byBatch = false, byStrength = false, strengthUsed = '';
      if (solve !== 'water') { qw = num('waterFlow', inp.waterFlow, 'Water flow'); if (!wUnit) err('waterUnit', wUnitMsg(), !raw(inp.waterUnit)); else qw = qw * wUnit.num / wUnit.den; }
      else if (raw(inp.waterUnit) && !wUnit) err('waterUnit', wUnitMsg());
      if (!basis) err('basis', raw(inp.basis) ? 'Chemical basis is not recognised — choose Neat liquid as supplied or Made-down solution.' : 'Chemical basis is not selected — choose Neat liquid as supplied (needs the product density) or Made-down solution (needs its strength). No basis is assumed.', !raw(inp.basis));
      else if (basis.v === 'neat') {
        if (raw(inp.densitySource)) {
          var src = raw(inp.densitySource);
          lib = this.waterDensityChoices().filter(function (p) { return p.id === src; })[0] || null;
          if (!lib) err('densitySource', 'Density library product is not recognised or its density is not confirmed — enter the product density in kg/L.');
        }
        k = num('density', inp.density, 'Product density', { emptyHint: ' — enter the product density in kg/L (SG) from the CoA, delivery docket or a measurement. Without it only the volumetric dose (L/ML) is shown.' });
        if (lib && isFinite(k) && k !== lib.density) { err('densitySource', 'Product density differs from the selected library value — re-select the library product or clear it to use the entered density.'); lib = null; }
      } else {
        // The density and its library source belong to the neat basis only (their controls are not rendered here):
        // they are ignored, never validated or reported, and stay in the draft for a switch back to neat.
        // Made-down strength: the chosen method only; the other method's draft is neither validated nor used.
        var from = this.pcOption(this.PC_STRENGTH_FROM, inp.strengthFrom); byBatch = !!from && from.v === 'batch'; byStrength = !!from && from.v === 'strength';
        if (!from) err('strengthFrom', 'Strength from is not recognised \u2014 choose Solution strength (% w/v) or Batch: kg product + L water. No method is assumed.');
        else if (byBatch) { bk = num('batchKg', inp.batchKg, 'Neat product per batch'); bl = num('batchL', inp.batchL, 'Batch water volume'); k = bk / bl; }
        else { var sr = this.pcSolutionStrength(inp.solStrength); if (sr.error) err('solStrength', sr.error, sr.empty); else { S = sr.value; k = S / 100; } } // S % w/v x 0.01 = kg/L
      }
      // dosing pumps: only Running rows are summed; Standby/off rows stay listed but excluded
      var rows = Array.isArray(inp.pumps) ? inp.pumps : [], running = 0, sumEntered = 0, sumLh = 0, runParts = [], excluded = [], pumpsOk = true;
      if (solve !== 'flow') {
        if (!rows.length) { err('pumps', 'Add at least one pump row.'); pumpsOk = false; }
        else if (rows.length > this.PC_MAX_PUMPS) { err('pumps', 'A maximum of 20 pump rows is supported — remove rows.'); pumpsOk = false; }
        else {
          rows.forEach(function (row, i) {
            var n = i + 1, st = row && typeof row === 'object' ? row.status : undefined, flowRaw = row && typeof row === 'object' ? row.flow : '';
            if (st === 'standby') { excluded.push({ n: n, text: raw(flowRaw) }); return; }
            if (st !== 'running') { err('pumpStatus-' + n, 'Pump ' + n + ' status is not recognised — choose Running or Standby/off.'); pumpsOk = false; return; }
            running++;
            var x = num('pump-' + n, flowRaw, 'Pump ' + n + ' flow', { emptyHint: ' — enter its reading, set it to Standby/off or remove the row.', zeroHint: ' — set the pump to Standby/off if it is not running.' });
            if (!isFinite(x)) { pumpsOk = false; return; }
            runParts.push(raw(flowRaw)); sumEntered += x;
            if (pUnit) sumLh += self.pumpFlowToLh(x, pUnit.v);
          });
          if (!running) { err('pumps', 'No pump is set to Running — at least one running pump is needed to total the chemical flow.'); pumpsOk = false; }
        }
        if (!pUnit) err('pumpUnit', pUnitMsg(), !raw(inp.pumpUnit));
        if (pumpsOk && pUnit) qc = sumLh;
      } else if (raw(inp.pumpUnit) && !pUnit) err('pumpUnit', pUnitMsg());
      if (solve !== 'dose') dose = num('dose', inp.dose, 'Target dose', { emptyHint: ' — enter the target dose in mg/L.' });
      var blockingErrors = errors.slice(), blocking = errors.length;
      // optional / daily-only inputs never block the dose
      hours = num('hours', inp.hours, 'Run hours per day');
      if (hours > 24) { err('hours', 'Run hours per day cannot exceed 24.'); hours = NaN; }
      if (raw(inp.strength)) {
        strength = num('strength', inp.strength, 'Active content');
        if (strength > 100) { err('strength', 'Active content cannot exceed 100 %.'); strength = NaN; }
      }
      var label = raw(inp.strengthBasis), activeLabel = label ? label : 'active (basis not stated)';
      var reading = this.pcOption(this.PC_READING, inp.reading);
      if (solve !== 'flow') {
        if (reading && reading.v === 'setpoint') cautions.push('Pump readings are setpoints or display values, not measured delivery: verify by drawdown or catch test before relying on this result.');
        else if (!reading || reading.v !== 'measured') cautions.push('Pump reading type is unknown: verify actual delivery by drawdown or catch test before relying on this result.');
      }
      if (lib) notes.push('Product density ' + raw(inp.density) + ' kg/L is the product library typical value for ' + lib.name + ' (library range ' + lib.densityText + (lib.verified ? '; library status: ' + lib.verified : '') + '). Enter the SG from the CoA or delivery docket if it is known.');
      if (!raw(inp.strength)) notes.push('Dose is mg of product ' + (basis && basis.v === 'madedown' ? 'as weighed into the make-down' : 'as supplied') + ' per L of water; enter the neat product\u2019s active content % (w/w active, from the supplier TDS/CoA) with its basis label to also show the active dose.');
      // Active content is the NEAT product's active % in either basis. On the made-down basis a value not higher than the solution strength
      // in use (the dilution made up on site and pumped in) is almost certainly that strength typed in the wrong box: neutral hint only.
      var activeHint = '';
      if (basis && basis.v === 'madedown' && strength > 0) {
        if (byStrength && S > 0) { if (this.pcActiveAtOrBelow(strength, S)) activeHint = raw(inp.strength) + ' % active is not higher than your ' + raw(inp.solStrength) + ' % w/v solution strength. ' + this.PC_ACTIVE_DEF + ' Did you mean to enter it as the solution strength above?'; }
        else if (byBatch && bk > 0 && bl > 0) { var sb = bk / bl * 100; if (this.pcActiveAtOrBelow(strength, sb)) activeHint = raw(inp.strength) + ' % active is not higher than your ' + F(sb) + ' % w/v solution strength from the batch. ' + this.PC_ACTIVE_DEF; }
      }
      var wLine = function () { return 'Water flow: ' + raw(inp.waterFlow) + ' ' + wUnit.label + (wUnit.den !== 1 ? ' × ' + wUnit.num + ' ÷ ' + wUnit.den : ' × ' + wUnit.num) + ' = ' + F(qw) + ' L/h (' + F(qw / 1000) + ' m³/h; ' + F(qw / 1000000) + ' ML/h)'; };
      var pumpLines = function () {
        var lines = ['Pumps: ' + running + ' of ' + rows.length + ' pumps running: ' + runParts.join(' + ') + ' = ' + F(sumEntered) + ' ' + pUnit.label + ' × ' + F(pUnit.num / pUnit.den) + ' = ' + F(qc) + ' L/h (total running chemical flow)'];
        excluded.forEach(function (x) { lines.push('Pump ' + x.n + ': ' + (x.text ? x.text + ' ' + pUnit.label : '(blank)') + ' — standby/off, excluded from the total'); });
        return lines;
      };
      var ok = !blocking, volOk = false;
      if (ok) {
        var mgH;
        if (solve === 'dose') { mgH = qc * k * 1000000; dose = mgH / qw; }
        else if (solve === 'flow') { mgH = dose * qw; qc = mgH / (k * 1000000); }
        else { mgH = qc * k * 1000000; qw = mgH / dose; }
        var kgH = qc * k, cross = (qw / 1000) * dose / 1000, vol = basis.v === 'neat' ? qc * 1000000 / qw : NaN;
        var core = [qw, qc, k, mgH, dose, kgH, cross].concat(basis.v === 'neat' ? [vol] : []);
        if (core.some(function (x) { return !isFinite(x) || !(x > 0); })) { ok = false; err('result', 'A derived value is outside the representable numeric range (overflow or underflow) — check the magnitudes entered. No result is shown.'); }
      }
      if (ok) {
        v.qwLh = qw; v.qwM3h = qw / 1000; v.qwMLd = qw * 24 / 1000000; v.qwUnitValue = wUnit ? qw * wUnit.den / wUnit.num : NaN;
        v.qcLh = qc; v.qcUnitValue = pUnit ? this.lhToPumpFlow(qc, pUnit.v) : NaN; v.conc = k; v.mgH = mgH; v.productKgH = kgH; v.doseMgL = dose; v.crossKgH = cross; v.volLperML = vol;
        if (hours > 0) {
          v.hours = hours; v.productKgDay = kgH * hours; v.chemLDay = qc * hours;
          if (!(isFinite(v.productKgDay) && v.productKgDay > 0 && isFinite(v.chemLDay) && v.chemLDay > 0)) { v.productKgDay = v.chemLDay = NaN; err('hours', 'Daily totals are outside the representable numeric range — not shown.'); }
        }
        if (strength > 0) { v.activeMgL = dose * strength / 100; if (!(isFinite(v.activeMgL) && v.activeMgL > 0)) { v.activeMgL = NaN; err('strength', 'The active dose is outside the representable numeric range — not shown.'); } }
        // ---- Show working ----
        if (basis.v === 'madedown') strengthUsed = 'Strength used: ' + (byStrength ? raw(inp.solStrength) : F(k * 100)) + ' % w/v (' + F(k) + ' kg/L) \u2014 ' +
          (byBatch ? 'from batch: ' + raw(inp.batchKg) + ' kg in ' + raw(inp.batchL) + ' L' : 'entered solution strength') + '; ' + this.PC_STRENGTH_BASIS;
        var kLines = basis.v === 'neat'
          ? ['Product mass: ' + F(qc) + ' L/h × ' + raw(inp.density) + ' kg/L = ' + F(kgH) + ' kg/h (neat product, density ' + (lib ? 'library typical value' : 'entered') + ')']
          : [byBatch ? 'Solution strength: ' + raw(inp.batchKg) + ' kg ÷ ' + raw(inp.batchL) + ' L = ' + F(k) + ' kg/L (' + F(k * 100) + ' % w/v)'
            : 'Solution strength: ' + raw(inp.solStrength) + ' % w/v (entered solution strength) \u00D7 0.01 = ' + F(k) + ' kg/L (' + F(k * 1000) + ' kg per 1000 L)',
            byBatch ? this.WT_CONVENTION : this.WT_CONVENTION_STRENGTH, strengthUsed, 'Product mass: ' + F(qc) + ' L/h × ' + F(k) + ' kg/L = ' + F(kgH) + ' kg/h'];
        var mgLine = F(kgH) + ' kg/h × 1000000 = ' + F(mgH) + ' mg/h';
        if (solve === 'dose') working = [wLine()].concat(pumpLines(), kLines, [mgLine, 'Dose: ' + F(mgH) + ' mg/h ÷ ' + F(qw) + ' L/h = ' + F(dose) + ' ' + this.WT_DOSE_UNIT]);
        else if (solve === 'flow') working = [wLine(), 'Product needed: ' + raw(inp.dose) + ' mg/L × ' + F(qw) + ' L/h = ' + F(mgH) + ' mg/h = ' + F(kgH) + ' kg/h'].concat(basis.v === 'madedown' ? kLines.slice(0, 3) : [],
          ['Chemical flow: ' + F(kgH) + ' kg/h ÷ ' + F(k) + ' kg/L = ' + F(qc) + ' L/h' + (pUnit ? ' = ' + F(v.qcUnitValue) + ' ' + pUnit.label : '') + ' (total running ' + (basis.v === 'neat' ? 'neat product' : 'solution') + ' flow; no per-pump split)']);
        else working = pumpLines().concat(kLines, [mgLine, 'Water flow: ' + F(mgH) + ' mg/h ÷ ' + raw(inp.dose) + ' mg/L = ' + F(qw) + ' L/h = ' + F(qw / 1000) + ' m³/h = ' + F(v.qwMLd) + ' ML/d' + (wUnit && wUnit.v !== 'MLd' && wUnit.v !== 'm3h' && wUnit.v !== 'Lh' ? ' = ' + F(v.qwUnitValue) + ' ' + wUnit.label : '')]);
        if (basis.v === 'neat') working.push('Volumetric dose: ' + F(qc) + ' L/h ÷ ' + F(qw / 1000000) + ' ML/h = ' + F(vol) + ' L/ML (= ' + F(vol) + ' mL/m³)');
        var agrees = Math.abs(cross - kgH) <= 1e-9 * kgH;
        working.push('Cross-check: ' + F(qw / 1000) + ' m³/h × ' + F(dose) + ' mg/L ÷ 1000 = ' + F(cross) + ' kg/h — ' + (agrees ? 'agrees with the product kg/h' : 'DOES NOT agree with the product kg/h') + ' (Dose page formula kg/h = m³/h × mg/L ÷ 1000)');
        if (isFinite(v.productKgDay)) working.push('Daily: ' + F(kgH) + ' kg/h × ' + raw(inp.hours) + ' h = ' + F(v.productKgDay) + ' kg/day; ' + F(qc) + ' L/h × ' + raw(inp.hours) + ' h = ' + F(v.chemLDay) + ' L/day of ' + (basis.v === 'neat' ? 'neat product' : 'solution'));
        if (isFinite(v.activeMgL)) working.push('Active: ' + F(dose) + ' mg/L × ' + raw(inp.strength) + ' % = ' + F(v.activeMgL) + ' mg/L ' + activeLabel);
      } else if (solve === 'dose' && basis && basis.v === 'neat' && blockingErrors.length && blockingErrors.every(function (e) { return e.field === 'density' || e.field === 'densitySource'; })) {
        // density missing/invalid: the mass dose abstains; the volumetric dose needs only the two flows
        var vol2 = qc * 1000000 / qw;
        if (isFinite(vol2) && vol2 > 0) {
          volOk = true; v.qwLh = qw; v.qwM3h = qw / 1000; v.qwMLd = qw * 24 / 1000000; v.qwUnitValue = wUnit ? qw * wUnit.den / wUnit.num : NaN; v.qcLh = qc; v.qcUnitValue = this.lhToPumpFlow(qc, pUnit.v); v.volLperML = vol2;
          working = [wLine()].concat(pumpLines(), ['Volumetric dose: ' + F(qc) + ' L/h ÷ ' + F(qw / 1000000) + ' ML/h = ' + F(vol2) + ' L/ML (= ' + F(vol2) + ' mL/m³)', 'The mass dose (mg/L) needs the product density — not calculated.']);
        }
      }
      // headline: the solved field
      var hl = { label: { dose: 'Dose', flow: 'Chemical flow required', water: 'Water flow' }[solve] || 'Result', text: '—', unit: '', precise: '' };
      if (solve === 'dose') hl.unit = this.WT_DOSE_UNIT;
      else if (solve === 'flow') hl.unit = pUnit ? pUnit.label + (ok ? ' (' + this.pcFmt(qc, 4) + ' L/h)' : '') : 'L/h' + (ok ? ' (choose a pump flow unit to also show L/min, L/s or mL/min)' : '');
      else if (solve === 'water') hl.unit = (wUnit ? wUnit.label : 'L/h') + (ok ? ' (' + (wUnit ? this.pcFmt(qw, 4) + ' L/h; ' : '') + this.pcFmt(qw / 1000, 4) + ' m³/h)' : '');
      if (ok) { // a 4-figure value is carried when it differs from the 3-figure headline
        var hv = { dose: dose, flow: pUnit ? v.qcUnitValue : qc, water: wUnit ? v.qwUnitValue : qw }[solve];
        hl.text = this.pcFmt(hv, 3); var h4 = this.pcFmt(hv, 4); if (h4 !== hl.text) hl.precise = h4;
      }
      else if (volOk) { hl.label = 'Volumetric dose'; hl.text = this.pcFmt(v.volLperML, 3); hl.unit = 'L/ML (= mL/m³) — the mg/L dose needs the product density'; }
      return { ok: ok, volOk: volOk, solve: solve, errors: errors, warnings: [], cautions: cautions, notes: notes, working: working, v: v, headline: hl, library: lib,
        strengthFrom: basis && basis.v === 'madedown' ? (byBatch ? 'batch' : byStrength ? 'strength' : '') : '', strengthUsed: ok ? strengthUsed : '', activeHint: activeHint,
        pumpsRunning: solve === 'flow' ? NaN : running, pumpsTotal: solve === 'flow' ? NaN : rows.length, pumpsRunningEntered: sumEntered, excluded: excluded };
    },
    waterShareText: function (r, inp, build) {
      var self = this, L = [], raw = function (x) { return String(x == null ? '' : x).trim(); }, F = function (n, sf) { return self.pcFmt(n, sf || 4); };
      var solve = this.pcOption(this.WT_SOLVE, inp.solve), wUnit = this.pcOption(this.WT_WATER_UNITS, inp.waterUnit), pUnit = this.pumpUnitOf(inp.pumpUnit), basis = this.pcOption(this.WT_BASIS, inp.basis);
      var reading = this.pcOption(this.PC_READING, inp.reading), v = r.v;
      L.push('Field Assistant — Calculator: potable water dose (mg/L)');
      L.push('Solved for: ' + (solve ? solve.label : 'not recognised'));
      L.push(r.ok || r.volOk ? 'Result: ' + r.headline.text + ' ' + r.headline.unit + ' (' + r.headline.label + ')' : 'No result: ' + r.errors.map(function (e) { return e.text; }).join(' '));
      if (!r.ok && r.volOk) L.push('Not calculated: ' + r.errors.map(function (e) { return e.text; }).join(' '));
      L.push('Inputs:');
      L.push('- Water flow: ' + (inp.solve === 'water' ? 'solved (see result)' : raw(inp.waterFlow) + ' ' + (wUnit ? wUnit.label : '[unit not selected]') + (isFinite(v.qwLh) ? ' (' + F(v.qwLh, 6) + ' L/h)' : '')));
      L.push('- Chemical basis: ' + (basis ? basis.label : 'not selected'));
      if (basis && basis.v === 'neat') L.push('- Product density: ' + (raw(inp.density) ? raw(inp.density) + ' kg/L' : 'not entered') + (r.library ? ' (library typical value: ' + r.library.name + ', range ' + r.library.densityText + ')' : raw(inp.density) ? ' (entered)' : ''));
      if (basis && basis.v === 'madedown') {
        var from = this.pcOption(this.PC_STRENGTH_FROM, inp.strengthFrom);
        L.push('- Strength from: ' + (from ? from.label : 'not recognised'));
        if (from && from.v === 'strength') L.push('- Solution strength: ' + raw(inp.solStrength) + ' % w/v as made down (g product per 100 mL solution)');
        else if (from) L.push('- Make-down: ' + raw(inp.batchKg) + ' kg product in ' + raw(inp.batchL) + ' L water' + (r.ok ? ' = ' + F(v.conc, 6) + ' kg/L' : ''));
        if (r.ok && r.strengthUsed) L.push('- ' + r.strengthUsed);
      }
      if (inp.solve === 'flow') L.push('- Pumps: solved as the total running chemical flow (no per-pump split); pump flow unit: ' + (pUnit ? pUnit.label : 'not selected'));
      else {
        L.push('- Pump flow unit: ' + (pUnit ? pUnit.label : 'not selected') + '; Reading type: ' + (reading ? reading.label : 'not recognised'));
        var rows = Array.isArray(inp.pumps) ? inp.pumps : [];
        L.push('- Pumps: ' + (isFinite(r.pumpsRunning) ? r.pumpsRunning : 0) + ' of ' + rows.length + ' pumps running' + (isFinite(v.qcLh) && pUnit ? '; Total running flow: ' + F(r.pumpsRunningEntered, 6) + ' ' + pUnit.label + ' (' + F(v.qcLh, 6) + ' L/h)' : ''));
        rows.forEach(function (p, i) {
          var t = p && typeof p === 'object' ? raw(p.flow) : '', st = p && typeof p === 'object' ? p.status : '';
          L.push('  Pump ' + (i + 1) + ': ' + (t ? t + (pUnit ? ' ' + pUnit.label : '') : '(blank)') + (st === 'standby' ? ' — standby/off, excluded' : st === 'running' ? ' (running)' : ' (status not recognised)'));
        });
      }
      L.push('- Active content of neat product: ' + (raw(inp.strength) ? raw(inp.strength) + ' % w/w ' + (raw(inp.strengthBasis) || 'active (basis not stated)') : 'not entered (dose is product, no active fraction assumed)'));
      if (inp.solve !== 'dose') L.push('- Target dose: ' + raw(inp.dose) + ' mg/L');
      L.push('- Run hours per day: ' + raw(inp.hours));
      if (r.ok) {
        L.push('Outputs:');
        L.push('- Dose: ' + F(v.doseMgL, 6) + ' ' + this.WT_DOSE_UNIT);
        if (isFinite(v.volLperML)) L.push('- Volumetric dose: ' + F(v.volLperML, 6) + ' L/ML (= ' + F(v.volLperML, 6) + ' mL/m³)');
        if (isFinite(v.activeMgL)) L.push('- Active dose: ' + F(v.activeMgL, 6) + ' mg/L ' + (raw(inp.strengthBasis) || 'active (basis not stated)') + ' (from the entered ' + raw(inp.strength) + ' %)');
        L.push('- Water flow: ' + F(v.qwLh, 6) + ' L/h (' + F(v.qwM3h) + ' m³/h; ' + F(v.qwMLd) + ' ML/d)');
        L.push('- Chemical flow (total running): ' + F(v.qcLh) + ' L/h' + (pUnit ? ' (' + F(v.qcUnitValue) + ' ' + pUnit.label + ')' : ''));
        L.push('- Product: ' + F(v.productKgH) + ' kg/h' + (isFinite(v.productKgDay) ? '; ' + F(v.productKgDay) + ' kg/day; ' + F(v.chemLDay) + ' L/day' : '; per day not calculated'));
      } else if (r.volOk) L.push('Outputs:', '- Volumetric dose: ' + F(v.volLperML, 6) + ' L/ML (= ' + F(v.volLperML, 6) + ' mL/m³)');
      var flags = r.cautions.concat(r.ok ? r.errors.map(function (e) { return e.text; }) : [], r.activeHint ? [r.activeHint] : [], r.notes);
      if (flags.length) { L.push('Flags and notes:'); flags.forEach(function (t) { L.push('- ' + t); }); }
      if (basis && basis.v === 'madedown' && from) L.push(from.v === 'strength' ? this.WT_CONVENTION_STRENGTH : this.WT_CONVENTION);
      L.push('No typical or expected dose range is applied; results are not an approval of the dose.');
      L.push('BUILD: ' + (build && build.status === 'ok' ? build.build + ' (release that served this app session)' : build && build.status === 'none' ? 'not available (app opened before the offline release was installed; reopen the app to include it)' : 'not available (the serving release could not be confirmed)'));
      var d = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; }, off = -d.getTimezoneOffset();
      L.push('Generated: ' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' (UTC' + (off >= 0 ? '+' : '-') + p2(Math.floor(Math.abs(off) / 60)) + ':' + p2(Math.abs(off) % 60) + ')');
      return L.join('\n');
    },

    // ---- Guide tab maths ------------------------------------------------------
    // Potable demand snapshot. The band thresholds are ILLUSTRATIVE demo values
    // (rendered with an EXAMPLE badge) — calibrate against site jar-test history.
    computeTdi: function (pbId) {
      if (pbId && pbId !== 'potable') return { rows: [], summary: 'No validated TDI model is available for this market; use descriptive measurements and site testing.', hasAny: false, invalid: false, supported: false };
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
        'Low UV254 observation only — required dose is not inferred.',
        'UV254 observation in the middle example band; confirm organic-removal objectives by testing.',
        'High UV254 observation; check colour/DOC and jar-test treatment objectives. No coagulant family or dose is inferred.'
      ][nom] });
      var part = band(t, 10, 50);
      if (part != null) rows.push({ label: 'Particle load (turbidity)', lvl: LEV[part], fg: COL[part].fg, bg: COL[part].bg, note: [
        'Low particle loading.',
        'Moderate particle loading.',
        'High turbidity example band; judge settled AND filtered turbidity by testing. No mechanism or required dose is inferred.'
      ][part] });
      if (isFinite(a)) {
        // Illustrative concentration bands, not a calculated buffering balance.
        var ab = a < 40 ? 2 : 0;
        rows.push({ label: 'Buffering (alkalinity)', lvl: a < 40 ? 'Low (example)' : (a <= 120 ? 'Middle (example)' : 'High (example)'), fg: COL[ab].fg, bg: COL[ab].bg, note: a < 40
          ? 'Low alkalinity example band. No alkalinity-demand calculation is available; verify the chemical species, dose basis and post-dose pH before deciding on supplementation.'
          : 'Illustrative alkalinity band only — this does not establish buffering adequacy for the selected dose. Chemical species and dose basis are not verified, so no alkalinity demand is calculated.' });
      }
      if (isFinite(p)) {
        var pb = 1; // Raw pH is an observation, not an optimum/green chemistry verdict.
        rows.push({ label: 'Raw pH', lvl: this.fmt(p, 2), fg: COL[pb].fg, bg: COL[pb].bg, note: 'Raw-water observation only. Determine treatment-objective post-dose pH by jar and plant testing; no universal coagulation optimum is inferred.' });
      }
      var demand = Math.max(nom == null ? -1 : nom, part == null ? -1 : part);
      var summary = rows.length ? 'Descriptive example bands, not a required chemical dose or coagulant-family prediction. Low turbidity does not imply low required dose. No alkalinity balance or post-dose pH is calculated; confirm by jar and plant testing.' : '';
      var self = this;
      var invalid = ['turb', 'uv', 'alk', 'ph'].some(function (key) { var raw = r[pre + key]; return String(raw == null ? '' : raw).trim() !== '' && !isFinite(self.parseNum(raw)); });
      return { rows: rows, summary: summary, hasAny: rows.length > 0, invalid: invalid, supported: true };
    },
    // Mining bench dose: sample mass + %solids + stock added → g/t dry solids.
    computeBench: function () {
      var s = this.state;
      var m = this.parseNum(s.mgSample), so = this.parseNum(s.mgSolids), st = this.parseNum(s.mgStock), ml = this.parseNum(s.mgMl);
      var dryG = (m > 0 && so > 0 && so <= 100) ? this.finiteResult(m * so / 100, true) : NaN; // g dry solids; >100 %w/w is physically impossible — abstain
      var activeMg = (st > 0 && st <= 100 && ml > 0) ? this.finiteResult(ml * st * 10, true) : NaN; // % w/v → mg/mL is ×10
      var doseGt = (isFinite(dryG) && dryG > 0 && isFinite(activeMg)) ? this.finiteResult(activeMg * 1000 / dryG, true) : NaN;
      return {
        dryG: this.fmt(dryG, 1),
        activeMg: this.fmt(activeMg, 1),
        doseGt: this.fmt(doseGt, 2),
        ok: isFinite(doseGt)
      };
    },

    // Legacy workflow entry units are separate from supplier-window units.
    // A workflow choice never approves a source basis or reference comparison.
    entryDoseBasisOf: function (p) {
      return this.doseBasisOf({ doseUnit: p && (p.entryDoseUnit || p.doseUnit) });
    },
    // Which basis a product's source dose is quoted in.
    // 'mgL' = mg/L on flow · 'kgt' = kg/t dry solids · 'gt' = g/t dry solids/substrate.
    // Returns null when the phrasing is unrecognisable — the callers then abstain
    // from any window comparison rather than guessing a basis (a wrong guess here
    // is a confident 1000× dosing error; an abstention is just a missing chip).
    doseBasisOf: function (p) {
      var c = String((p && p.doseUnit) || '').replace(/\s+/g, '').toLowerCase();
      if (!c) return null; // absent units cannot establish a dimensional basis
      if (c.indexOf('mg/l') >= 0 || c.indexOf('mgl') >= 0 || c.indexOf('ppm') >= 0) return 'mgL';
      if (c.indexOf('kg/t') >= 0 || c.indexOf('kgpert') >= 0) return 'kgt';
      if (c.indexOf('g/t') >= 0 || c.indexOf('gpert') >= 0) return 'gt';
      return null;
    },
    // Window comparison against a specific product's datasheet range. `val` must
    // already be in the product's own dose basis. Abstains rather than guesses:
    // no comparison for comma-grouped numbers, capped/multi-context ranges
    // ("0.25-0.5; NSF max 1.0"), or anything that isn't exactly "lo – hi".
    doseAbstention: function (p, application) {
      if (!p) return null;
      var reason = '';
      if (/[a-z%/]/i.test(String(p.doseRange || ''))) reason = 'Range includes unit text or multiple contexts; confirm matching units and basis before comparison.';
      else if (p.doseMassBasis !== 'as-supplied') reason = 'Chemical dose basis is not confirmed as as-supplied product (may be active ingredient, dry equivalent or reference formulation).';
      else if (!/^(potable|sewage|sludge|industrial|mining)$/.test(p.doseApplication || '') || p.doseApplication !== application) reason = 'Source-window application is unknown or does not match this treatment context; no cross-application comparison.';
      else if (typeof p.doseWindowSourceKind !== 'string' || !/^(supplier-tds|published-reference|site-test)$/.test(p.doseWindowSourceKind)) reason = 'Source-window provenance is unknown; confirm a field-specific source kind before comparison.';
      else if (!this.doseBasisOf(p)) reason = 'Dose units are unknown; mg/L and dry-tonne units require a solids balance, not a direct comparison.';
      else if (!/^(?:\d+(?:\.\d{1,2})?|0\.\d+|\.\d+)\s*[-–—]\s*(?:\d+(?:\.\d{1,2})?|0\.\d+|\.\d+)$/.test(String(p.doseRange || '').trim())) reason = 'No unambiguous single dose window is available.';
      if (!reason) {
        var bounds = String(p.doseRange).split(/[-–—]/);
        if (!(this.parseNum(bounds[0]) <= this.parseNum(bounds[1])) || !(this.parseNum(bounds[1]) > 0)) reason = 'Invalid dose window: bounds must be positive and in ascending order.';
        // Flat legacy tuples are supported only when explicit. If structured
        // metadata exists it must describe the same single window, not override it.
        if (!reason && Object.prototype.hasOwnProperty.call(p, 'doseWindows')) {
          var windows = p.doseWindows, w = Array.isArray(windows) && windows.length === 1 ? windows[0] : null;
          if (!w || typeof w !== 'object' || w.application !== p.doseApplication || w.massBasis !== p.doseMassBasis || w.sourceKind !== p.doseWindowSourceKind || w.unit !== p.doseUnit || !Array.isArray(w.range) || w.range.length !== 2 || typeof w.range[0] !== 'number' || typeof w.range[1] !== 'number' || w.range[0] !== this.parseNum(bounds[0]) || w.range[1] !== this.parseNum(bounds[1]) || (w.rawRange !== undefined && String(w.rawRange).replace(/\s/g, '') !== String(p.doseRange).replace(/\s/g, '')) || (w.approval !== undefined && w.approval !== 'unconfirmed')) reason = 'Source-window metadata is unknown or conflicting; reconcile application, range, units, mass basis and source provenance before comparison. Source metadata is not operating approval.';
        }
      }
      return reason ? { abstain: true, name: p.name, raw: p.doseRange || '—', rawUnit: p.doseUnit || 'Unknown', note: p.doseNote || '', reason: reason } : null;
    },
    doseWindowFor: function (p, val, application) {
      if (this.doseAbstention(p, application)) return null;
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
      if (!nums.every(function (n) { return /^(?:\d+(\.\d{1,2})?|0\.\d+|\.\d+)$/.test(n); })) return null;
      var m = all[0].match(/([\d.]+)\s*[–—-]\s*([\d.]+)/);
      var lo = parseFloat(m[1]), hi = parseFloat(m[2]);
      if (!isFinite(lo) || !isFinite(hi) || hi <= 0 || lo > hi) return null;
      var epsilon = 1e-12 * Math.max(1, Math.abs(val), Math.abs(lo), Math.abs(hi));
      var status = val < lo - epsilon ? 'below' : (val > hi + epsilon ? 'above' : 'within');
      return { lo: lo, hi: hi, val: val, status: status, unit: this.doseUnitLabel(basis), raw: p.doseRange, name: p.name, sourceKind: p.doseWindowSourceKind || 'unknown', note: p.doseNote || '' };
    },
    // Calc screen: compare the entered dose when the product's dose basis is
    // reachable from the calc mode (mg/L ↔ conc; kg/t or g/t ↔ sludge). A basis
    // the mode can't reach returns a mismatch object — the calc must SAY the
    // datasheet doses on a different basis, not silently drop the check.
    doseWindow: function () {
      var s = this.state;
      var p = this.allProducts().find(function (x) { return x.id === s.calcProductId; });
      if (!p) return null;
      var application = s.calcMode === 'sludge' ? 'sludge' : 'unknown';
      var abstain = this.doseAbstention(p, application);
      if (abstain) return abstain;
      var basis = this.doseBasisOf(p);
      if (!basis) return null; // unrecognisable basis — abstain
      var mismatch = { mismatch: true, name: p.name, rawUnit: p.doseUnit || '', note: p.doseNote || '' };
      if (s.calcMode === 'conc') {
        if (basis !== 'mgL') return mismatch;
        return this.doseWindowFor(p, this.parseNum(s.dose), application);
      }
      var v = this.parseNum(s.doseKg); // sludge mode doses in kg/t DS
      if (basis === 'kgt') return this.doseWindowFor(p, v, application);
      if (basis === 'gt') {
        var w = this.doseWindowFor(p, v * 1000, application);
        if (w) w.converted = true;
        return w;
      }
      return mismatch; // mg/L-basis product in sludge mode
    },
    // Programme entry grammar is separate from qualified supplier source windows.
    programmeDose: function (raw) {
      var text = String(raw || '').trim(), pieces = text.split(/\s*(?:[–—-]|\bto\b)\s*/i);
      if (pieces.length > 2) return null;
      var lo = this.parseNum(pieces[0]), hi = pieces.length === 2 ? this.parseNum(pieces[1]) : lo;
      return lo > 0 && hi >= lo && isFinite(hi) ? { lo: lo, hi: hi, range: pieces.length === 2 } : null;
    },
    programmeSourceMatches: function (slate) {
      if (!slate.productId) return true; // explicit unknown/manual product
      var product = this.allProducts().find(function (p) { return p.id === slate.productId; });
      return !!product && !!slate.source && JSON.stringify(product) === JSON.stringify(slate.source);
    },
    invalidateProgrammeAuthorities: function () {
      var s = this.state;
      if (!this.programmeSourceMatches(this.programmeSlate())) s.guideProgScalar = '';
      for (var id in s.guideProgByPb) {
        if (!this.programmeSourceMatches(s.guideProgByPb[id])) s.guideProgByPb[id].scalar = '';
      }
    },
    programmeScalar: function () {
      var s = this.state, dose = this.programmeDose(s.guideProgDose);
      if (!this.programmeSourceMatches(this.programmeSlate())) return NaN;
      if (s.guideProgRestoreError || !dose || s.guideProgMassBasis !== 'as-supplied' || ['mgL', 'kgt', 'gt'].indexOf(s.guideProgDoseUnit) < 0) return NaN;
      var val = dose.range ? this.parseNum(s.guideProgScalar) : dose.lo;
      return val >= dose.lo && val <= dose.hi ? val : NaN;
    },
    computeProg: function () {
      var s = this.state, self = this;
      var p = this.allProducts().find(function (x) { return x.id === s.guideProgProductId; }) || null;
      var dose = this.programmeDose(s.guideProgDose), basis = s.guideProgDoseUnit;
      var confirmed = !s.guideProgRestoreError && s.guideProgMassBasis === 'as-supplied' && ['mgL', 'kgt', 'gt'].indexOf(basis) >= 0;
      var win = null, rangeWin = null, unitMismatch = false;
      var reason = s.guideProgRestoreError || (!confirmed ? 'Confirm supported dose units and as-supplied product mass. Active or unknown basis cannot be converted without a verified active fraction.' : (!dose ? 'Enter a positive scalar or ordered dose endpoints, e.g. 2–4. Grouped, negative and mixed-unit entries are unsupported.' : ''));
      if (reason) win = { abstain: true, name: p ? p.name : 'Programme', raw: s.guideProgDose, rawUnit: this.doseUnitLabel(basis), reason: reason };
      else if (p) {
        win = this.doseAbstention(p, s.guideId);
        if (!win) {
          var pBasis = this.doseBasisOf(p), factor = basis === pBasis ? 1 : (basis === 'kgt' && pBasis === 'gt' ? 1000 : (basis === 'gt' && pBasis === 'kgt' ? 0.001 : NaN));
          if (isFinite(factor)) {
            win = this.doseWindowFor(p, dose.lo * factor, s.guideId);
            if (win) win.converted = factor !== 1;
            if (dose.range) { rangeWin = this.doseWindowFor(p, dose.hi * factor, s.guideId); if (rangeWin) rangeWin.converted = factor !== 1; }
          } else unitMismatch = true;
        }
      }
      var Q = this.parseNum(s.guideProgFlow) * this.flowFactor(s.guideProgFlowUnit);
      var rho = this.parseNum(s.guideProgSludgeDensity), ds = this.parseNum(s.guideProgDs);
      var mult = basis === 'mgL' ? Q / 1000 : Q * rho * ds / 100 * (basis === 'gt' ? 0.001 : 1);
      var balance = basis === 'mgL' || (rho > 0 && ds > 0 && ds <= 100);
      var bounds = confirmed && dose && Q > 0 && balance ? [this.finiteResult(mult * dose.lo, true), this.finiteResult(mult * dose.hi, true)] : [];
      var hasCons = bounds.length === 2 && bounds.every(function (n) { return isFinite(n); });
      if (!hasCons) bounds = [];
      var display = function (factor, dp) { return hasCons ? bounds.map(function (n) { return self.fmt(n * factor, dp); }).filter(function (n, i, a) { return !i || n !== a[0]; }).join('–') : '—'; };
      return {
        product: p, win: win, rangeWin: rangeWin, unitMismatch: unitMismatch, doseBounds: dose ? [dose.lo, dose.hi] : [],
        kgHBounds: bounds, kgH: display(1, 2), kgDay: display(24, 1), hasCons: hasCons,
        consumptionBasis: basis === 'mgL' ? 'flow × dose; as-supplied product mass' : 'Q × slurry density × dry solids % / 100 × dose; as-supplied product mass per dry tonne',
        consumptionReason: hasCons ? '' : (reason || (basis === 'mgL' ? 'Confirm positive flow and its unit.' : 'Dry-tonne consumption requires explicit positive flow, slurry density (kg/L) and dry solids (0–100% w/w). No density or solids default is assumed.')),
        canRetest: confirmed && basis === 'mgL' && isFinite(this.programmeScalar()),
        canSend: !!p || !!dose || Q > 0
      };
    },

    // ---- state plumbing -----------------------------------------------------
    setState: function (patch, jarConfirmed) {
      var s = this.state;
      // Any new pump-capacity text is a fresh exact entry: it never inherits the hidden precision of a rounded display.
      if (Object.prototype.hasOwnProperty.call(patch, 'pumpMax') && !Object.prototype.hasOwnProperty.call(patch, 'pumpMaxCanon')) patch.pumpMaxCanon = null;
      // A scalar is an operator choice under one dosing authority, not a value
      // that silently follows a different product, source, basis or endpoints.
      // Explicit full-slate transitions (open/recall) carry their own selection.
      var authorityChanged = ['guideProgProductId', 'guideProgSource', 'guideProgDose', 'guideProgDoseUnit', 'guideProgMassBasis', 'guideProgFor', 'guideProgRestoreError'].some(function (key) {
        return Object.prototype.hasOwnProperty.call(patch, key) && JSON.stringify(patch[key]) !== JSON.stringify(s[key]);
      });
      if (Object.prototype.hasOwnProperty.call(patch, 'customProducts') && s.guideProgProductId) {
        var selectedId = s.guideProgProductId;
        var oldProduct = this.allProducts().find(function (p) { return p.id === selectedId; });
        var newProduct = this.PRODUCTS.concat(patch.customProducts).find(function (p) { return p.id === selectedId; });
        if (JSON.stringify(oldProduct) !== JSON.stringify(newProduct)) authorityChanged = true;
      }
      if (authorityChanged && !Object.prototype.hasOwnProperty.call(patch, 'guideProgScalar')) patch.guideProgScalar = '';
      var preparationChanged = ['jarVol', 'stockPct', 'jarVolumeBasis', 'jarProductId'].some(function (key) { return Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== s[key]; }) || (patch.jars && JSON.stringify(patch.jars.map(function (j) { return j.dose; })) !== JSON.stringify(s.jars.map(function (j) { return j.dose; })));
      if (!jarConfirmed && preparationChanged && (s.winner !== null || s.jars.some(function (j) { return j.ph || j.turb || j.floc; }))) return this.editJarSetup(patch);
      // A catch belongs to the pump, media and operating setup it measured.
      if (['selectedCalcPumpId', 'pumpSource', 'pumpMax', 'calcProductId', 'form', 'feedBasis', 'density', 'makedown', 'calcMode', 'flow', 'flowUnit', 'dose', 'sludgeFlow', 'sludgeFlowUnit', 'ds', 'doseKg', 'sludgeDensity', 'foundPumps', 'customProducts'].some(function (key) { return Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== s[key]; })) { patch.calMl = ''; patch.calSec = ''; }
      if (['jarVol', 'stockPct', 'jarVolumeBasis', 'jars', 'winner', 'jarProductId'].some(function (key) { return Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== s[key]; })) patch.jarSaved = false;
      Object.assign(s, patch);
      this.jarPreparationConfirmed();
      this.invalidateProgrammeAuthorities();
      if (Object.prototype.hasOwnProperty.call(patch, 'clients') || Object.prototype.hasOwnProperty.call(patch, 'jarTests') || Object.prototype.hasOwnProperty.call(patch, 'jarTestsV2')) this.invalidateSavedSnapshots();
      // every edit of the open multi-product test ends here: schedule its autosave (no-op when nothing changed)
      if (this._pjDraftArmed) this.pjDraftTouch();
      this.render();
    },

    // User preparation edits are one guarded transition. History is never mutated.
    editJarSetup: function (patch) {
      var s = this.state;
      var changed = ['jarVol', 'stockPct', 'jarVolumeBasis', 'jarProductId', 'jars'].some(function (key) { return Object.prototype.hasOwnProperty.call(patch, key) && JSON.stringify(patch[key]) !== JSON.stringify(s[key]); });
      if (changed) {
        var results = s.winner !== null || s.jars.some(function (j) { return j.ph || j.turb || j.floc; });
        if (results && !window.confirm('Change jar preparation? Recorded pH / turbidity / floc and winner will be cleared. Saved history is unchanged.')) { this.render(); return false; }
        patch.jars = (patch.jars || s.jars).map(function (j) { return { dose: j.dose, ph: '', turb: '', floc: '' }; });
        patch.winner = null; patch.jarSaved = false;
      }
      this.setState(patch, true); return true;
    },
    allProducts: function () { return this.PRODUCTS.concat(this.state.customProducts); },
    allPumps: function () { return this.PUMPS.concat(this.state.foundPumps); },

    // Fresh client record. Both save paths (calc + playbook readings) build on
    // this so the shape and id scheme can never diverge.
    recordId: function (prefix, list) {
      var base = prefix + Date.now(), id = base, suffix = 0;
      while ((list || []).some(function (r) { return r.id === id; })) id = base + '-' + (++suffix);
      return id;
    },
    newClient: function (name, site) {
      return { id: this.recordId('c', this.state.clients), name: name, site: site || '', readings: [] };
    },
    findClientByName: function (clients, name, site) {
      var n = String(name || '').trim().toLowerCase();
      if (!n) return null;
      var matches = clients.filter(function (c) {
        return String(c.name || '').trim().toLowerCase() === n &&
          (site === undefined || String(c.site || '').trim().toLowerCase() === String(site || '').trim().toLowerCase());
      });
      return matches.length === 1 ? matches[0] : null;
    },
    // The patch a product selection applies to the calculator (form + density).
    productCalcPatch: function (p) {
      var patch = { density: '', form: 'liquid', feedBasis: 'solution', makedown: '' };
      if (!p) return patch;
      patch.form = /^powder\b/i.test(p.form || '') ? 'powder' : (/^(liquid|emulsion)\b/i.test(p.form || '') ? 'liquid' : '');
      if (patch.form === 'liquid' && this.productDensityConfirmed(p) && p.density > 0) patch.density = String(p.density);
      if (patch.form === 'liquid' && !this.productDensityConfirmed(p)) patch.calcHandoffNote = 'Product density source is invalid or conflicts with its stored value. Original product retained; select a new manual material setup (Powder then Liquid) and confirm actual kg/L density.';
      return patch;
    },
    changeCalcForm: function (form) {
      var s = this.state;
      if (form === s.form) return;
      // A manual material-form override cannot retain catalogue density/identity.
      this.setState({ form: form, density: '', calcProductId: '', feedBasis: 'solution', makedown: '', calcHandoffNote: 'Material form changed. Confirm the actual product, liquid density and feed preparation before calculating delivery.' });
    },
    // ---- unsaved-field tracking (guards the update auto-reload) -------------
    // _snap records what each save actually persisted this session. Flags like
    // guideSaved can't do this job: one playbook's save must not vouch for
    // another playbook's readings, and a saved jar test must stop vouching the
    // moment its jars are edited again. Not persisted — a reload loses the live
    // state too, which is exactly what the guard exists to prevent.
    _snap: { readings: {}, prog: {}, jars: '' },
    programmeSlate: function () {
      var s = this.state;
      return { productId: s.guideProgProductId, dose: s.guideProgDose, doseUnit: s.guideProgDoseUnit, flow: s.guideProgFlow, flowUnit: s.guideProgFlowUnit, massBasis: s.guideProgMassBasis, slurryDensity: s.guideProgSludgeDensity, ds: s.guideProgDs, scalar: s.guideProgScalar, source: s.guideProgSource, restoreError: s.guideProgRestoreError, observedDate: s.guideObservedDate, observedTime: s.guideObservedTime, observedOffset: s.guideObservedOffset, saveClient: s.guideSaveClient, saveName: s.guideSaveName };
    },
    progSig: function (slate) {
      var hasData = String(slate.dose || '').trim() || String(slate.flow || '').trim() || slate.productId || slate.slurryDensity || slate.ds || slate.scalar || slate.source || slate.restoreError;
      return hasData ? JSON.stringify([slate.productId || '', slate.dose || '', slate.doseUnit || '', slate.flow || '', slate.flowUnit || '', slate.massBasis || 'unknown', slate.slurryDensity || '', slate.ds || '', slate.scalar || '', slate.source || null, slate.restoreError || '']) : '';
    },
    guideClientIsDirty: function (pid, slate) {
      var saved = (this._snap.guideBacking || {})[pid];
      return saved ? (slate.saveClient || '') !== saved.clientId : !!slate.saveClient;
    },
    guideDraftIsDirty: function (pb) {
      var s = this.state, snap = this._snap;
      var slate = s.guideProgFor === pb.id ? this.programmeSlate() : (s.guideProgByPb[pb.id] || {});
      if (String(slate.saveName || '').trim() || this.guideClientIsDirty(pb.id, slate)) return true;
      var sig = this.progSig(slate);
      if ((sig || snap.prog[pb.id]) && snap.prog[pb.id] !== sig) return true;
      var observation = JSON.stringify([slate.observedDate || '', slate.observedTime || '', slate.observedOffset || '']);
      if ((slate.observedDate || slate.observedTime || slate.observedOffset || (snap.observation && snap.observation[pb.id])) && (!snap.observation || snap.observation[pb.id] !== observation)) return true;
      return pb.fields.some(function (f) {
        var key = pb.id + ':' + f.k;
        return (String(s.guideReadings[key] || '').trim() || Object.prototype.hasOwnProperty.call(snap.readings, key)) && snap.readings[key] !== s.guideReadings[key];
      });
    },
    liveProgSig: function () {
      var s = this.state;
      return this.progSig(this.programmeSlate());
    },
    // Identity is revalidated at every rendering boundary, not only on clicks.
    jarHistoryRecord: function (id) {
      if (typeof id !== 'string' || !id.trim()) return null;
      var matches = this.state.jarTests.filter(function (t) { return t.id === id; });
      return matches.length === 1 && (!this.state.jarHistoryClientId || matches[0].clientId === this.state.jarHistoryClientId) ? matches[0] : null;
    },
    jarsSetupSig: function () {
      var s = this.state;
      return JSON.stringify([s.jars, s.winner, s.jarCurrentDose, s.jarProductId, s.jarVol, s.stockPct, s.jarVolumeBasis, s.jarSaveClient, s.jarSaveNote]);
    },
    jarsSig: function () {
      return JSON.stringify([this.jarsSetupSig(), this.jarPreparationConfirmed()]);
    },
    // index.html's controllerchange handler asks this before auto-reloading an
    // update: a mid-visit reload would destroy these memory-only entries.
    calcInputSig: function () {
      var s = this.state;
      return JSON.stringify(['calcMode', 'calcProductId', 'form', 'flow', 'dose', 'flowUnit', 'sludgeFlow', 'sludgeFlowUnit', 'ds', 'doseKg', 'sludgeDensity', 'makedown', 'density', 'feedBasis', 'pumpMax', 'pumpMaxUnit', 'pumpSource', 'selectedCalcPumpId', 'calMl', 'calSec'].map(function (k) { return s[k]; }));
    },
    hasUnsavedFieldData: function () {
      if (this._mutationBusy || this._restoreRecovery || this._snap.jarBackingInvalid || this._snap.pjBackingInvalid) return true;
      var s = this.state, snap = this._snap;
      if (s.showClientForm || s.showProductForm || s.showPumpForm || s.showJarSave || String(s.guideSaveName || '').trim()) return true;
      // Conservative: a changed calculation can include memory-only catch inputs.
      if (this.calcInputSig() !== this._initialCalcSig) return true;
      // Calculator inputs are a memory-only draft (no save path): any change from the defaults is retained.
      if (this.polyInputSig() !== this._initialPolySig) return true;
      if (this.wtInputSig() !== this._initialWtSig) return true;
      if (this.jdInputSig() !== this._initialJdSig) return true;
      for (var k in s.guideReadings) {
        if ((String(s.guideReadings[k] || '').trim() || Object.prototype.hasOwnProperty.call(snap.readings, k)) && snap.readings[k] !== s.guideReadings[k]) return true;
      }
      if (s.guideProgFor && (s.guideObservedDate || s.guideObservedTime || s.guideObservedOffset || (snap.observation && snap.observation[s.guideProgFor])) && (!snap.observation || snap.observation[s.guideProgFor] !== this.observationSig())) return true;
      if (s.guideProgFor) {
        if (this.guideClientIsDirty(s.guideProgFor, this.programmeSlate())) return true;
        var liveSig = this.liveProgSig();
        if ((liveSig || snap.prog[s.guideProgFor]) && snap.prog[s.guideProgFor] !== liveSig) return true;
      }
      for (var pid in s.guideProgByPb) {
        var sig = this.progSig(s.guideProgByPb[pid] || {});
        if ((sig || snap.prog[pid]) && snap.prog[pid] !== sig) return true;
        var parked = s.guideProgByPb[pid] || {};
        if (String(parked.saveName || '').trim() || this.guideClientIsDirty(pid, parked)) return true;
        if ((parked.observedDate || parked.observedTime || parked.observedOffset || (snap.observation && snap.observation[pid])) && (!snap.observation || snap.observation[pid] !== JSON.stringify([parked.observedDate || '', parked.observedTime || '', parked.observedOffset || '']))) return true;
      }
      // Compare every saved slate, even stock-only rows or cleared observations.
      // Defaults alone are not a draft, but fresh session consent always is until
      // a successful explicit save records this exact current-runtime setup.
      if (snap.jars ? snap.jars !== this.jarsSig() :
          (this.jarsSetupSig() !== this._initialJarsSetupSig || this.jarPreparationConfirmed())) return true;
      // The multi-product potable draft: any difference from its saved (or initial blank) signature is unsaved work.
      if (this.pjSig() !== (typeof snap.pj === 'string' ? snap.pj : this._initialPjSig)) return true;
      if (String(s.mgMl || '').trim()) return true; // bench entry has no save path
      return false;
    },
    clientCalcSig: function (c) {
      return JSON.stringify(['mode', 'flow', 'dose', 'sludgeFlow', 'ds', 'doseKg', 'sludgeDensity', 'flowUnit', 'sludgeFlowUnit', 'makedown', 'density', 'pumpMax', 'pumpMaxUnit', 'pumpMaxEntered', 'pumpSource', 'selectedCalcPumpId', 'pumpCapacityVersion', 'form', 'feedBasis', 'productId', 'productName'].map(function (k) { return c[k]; }));
    },
    // A signature may vouch for a draft only while its exact durable backing
    // still exists. Refresh and local mutations share this check. Inputs and
    // parked slates are NEVER cleared or turned into manufactured history.
    invalidateSavedSnapshots: function () {
      var s = this.state, snap = this._snap;
      var backing = snap.guideBacking || {};
      Object.keys(backing).forEach(function (pid) {
        var saved = backing[pid];
        var client = s.clients.find(function (c) { return c.id === saved.clientId; });
        if (client && (client.readings || []).some(function (r) { return JSON.stringify(r) === saved.reading; })) return;
        Object.keys(snap.readings).forEach(function (key) { if (key.indexOf(pid + ':') === 0) delete snap.readings[key]; });
        delete snap.prog[pid];
        if (snap.observation) delete snap.observation[pid];
        delete backing[pid];
        if (s.guideProgFor === pid) s.guideSaved = false;
      });
      if (snap.calcBacking) {
        var c = s.clients.find(function (r) { return r.id === snap.calcBacking.id; });
        if (!c || this.clientCalcSig(c) !== snap.calcBacking.sig) { this._initialCalcSig = null; delete snap.calcBacking; }
      }
      if (snap.pjBacking) {
        var pjMatches = s.jarTestsV2.filter(function (t) { return t.id === snap.pjBacking.id; });
        if (pjMatches.length !== 1 || JSON.stringify(pjMatches[0]) !== snap.pjBacking.record) {
          snap.pj = ''; snap.pjBackingInvalid = true; delete snap.pjBacking; s.pjSaved = false;
        }
      }
      if (snap.jarBacking) {
        var jarMatches = s.jarTests.filter(function (t) { return t.id === snap.jarBacking.id; });
        if (jarMatches.length !== 1 || JSON.stringify(jarMatches[0]) !== snap.jarBacking.record) {
          snap.jars = ''; snap.jarBackingInvalid = true; delete snap.jarBacking; s.jarSaved = false;
        }
      }
    },
    // Record what a successful playbook save covered: this playbook's readings
    // and the live programme slate. Other playbooks' entries stay unsaved.
    _stampGuideSnap: function (pb, clientId, reading) {
      var s = this.state;
      pb.fields.forEach(function (f) {
        App._snap.readings[pb.id + ':' + f.k] = s.guideReadings[pb.id + ':' + f.k];
      });
      this._snap.prog[pb.id] = this.liveProgSig();
      this._snap.observation = this._snap.observation || {};
      this._snap.observation[pb.id] = this.observationSig();
      this._snap.guideBacking = this._snap.guideBacking || {};
      this._snap.guideBacking[pb.id] = { clientId: clientId, reading: JSON.stringify(reading) };
    },

    // ---- style factories (from design) -------------------------------------
    navStyle: function (active) {
      return { flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px 2px', borderRadius: '10px', color: active ? '#4FE0B5' : '#ACBEB5' };
    },
    segStyle: function (active) {
      return { flex: 1, border: 'none', cursor: 'pointer', borderRadius: '9px', padding: '9px 6px', fontSize: '14px', fontWeight: 700, background: active ? '#16211F' : 'transparent', color: active ? '#EFECE3' : '#56635B' };
    },
    segSmall: function (active) {
      return { flex: 1, border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '9px 6px', fontSize: '14px', fontWeight: 700, background: active ? '#087568' : 'transparent', color: active ? '#FFF' : '#56635B' };
    }
  };

  // ============================================================================
  // Jar Test -> Potable water v2: multi-product, batched jar testing with a plant baseline,
  // per-test result parameters, a summary and export. Saved as an EDITABLE record (updated by its
  // stable id) in its OWN list `ctf_jartests_v2`: a release that predates this feature never loads,
  // renders, rewrites or deletes these records (it only sees the raw bytes, which its backup copies
  // under `extra`), while the v1 list `ctf_jartests_v1` stays readable read-only and byte-identical.
  //
  // Draft (state.pj) -> record: the record is the draft plus {schema: 2, kind: 'potable-v2', clientName,
  // observation}. Unknown top-level fields of a stored record are kept (draft.keep) and written back.
  // Units: stock strength S is % w/v of the made-up stock (g product per 100 mL = 10 S mg/mL). A dose is
  // nominal per INITIAL raw sample volume V (stock volume is not added): mg/L = mL x S x 10000 / V.
  // 1 mg/L = 1 kg/ML, so cost per ML = dose (mg/L) x price ($/kg).
  // ============================================================================
  App.PJ_KEY = 'ctf_jartests_v2';
  App.PJ_PARAMS = [
    { k: 'settledNtu', an: 'settled turbidity', label: 'Settled turbidity', unit: 'NTU', kind: 'num', core: true, col: 'settled_turbidity_ntu' },
    { k: 'filteredNtu', an: 'filtered turbidity', label: 'Filtered turbidity', unit: 'NTU', kind: 'num', core: true, col: 'filtered_turbidity_ntu' },
    { k: 'colour', an: 'filtered (true) colour', label: 'Filtered (true) colour', unit: 'PtCo', kind: 'num', core: true, col: 'filtered_colour_ptco' },
    { k: 'ph', an: 'supernatant pH', label: 'Supernatant pH', unit: 'pH', kind: 'ph', core: true, col: 'supernatant_ph' },
    { k: 'flocTime', an: 'floc formation time', label: 'Floc formation time', unit: 's', kind: 'num', core: true, col: 'floc_form_time_s' },
    { k: 'flocSize', an: 'floc size', label: 'Floc size', unit: 'A–G', kind: 'grade', core: true, col: 'floc_size' },
    { k: 'settleRate', an: 'settling rate', label: 'Settling rate', unit: 'A–G', kind: 'grade', core: true, col: 'settling_rate' },
    { k: 'uv254', an: 'UV254', label: 'UV254', unit: '1/cm', kind: 'num', core: false, col: 'uv254_per_cm' },
    { k: 'resAl', an: 'residual aluminium', label: 'Residual aluminium', unit: 'mg/L', kind: 'num', core: false, col: 'residual_aluminium_mg_l' },
    { k: 'resFe', an: 'residual iron', label: 'Residual iron', unit: 'mg/L', kind: 'num', core: false, col: 'residual_iron_mg_l' },
    { k: 'alkAfter', an: 'alkalinity after dosing', label: 'Alkalinity after dosing', unit: 'mg/L as CaCO3', kind: 'num', core: false, col: 'alkalinity_after_mg_l_caco3' }
  ];
  App.PJ_BASE_ROWS = [
    { k: 'ntu', an: 'turbidity', label: 'Turbidity', unit: 'NTU' },
    { k: 'ph', an: 'pH', label: 'pH', unit: '', ph: true },
    { k: 'colour', an: 'colour', label: 'Colour', unit: 'PtCo' },
    { k: 'cond', an: 'conductivity', label: 'Conductivity', unit: 'µS/cm' },
    { k: 'temp', an: 'temperature', label: 'Temperature', unit: '°C' },
    { k: 'alk', an: 'total alkalinity', label: 'Total alkalinity', unit: 'mg/L as CaCO3' },
    { k: 'hard', an: 'total hardness', label: 'Total hardness', unit: 'mg/L as CaCO3' },
    { k: 'calHard', an: 'calcium hardness', label: 'Calcium hardness', unit: 'mg/L as CaCO3' },
    { k: 'phs', an: 'pHs', label: 'pHs (typed, not calculated)', unit: '' },
    { k: 'lsi', an: 'Langelier index', label: 'Langelier index, pH − pHs (typed)', unit: '', signed: true },
    { k: 'rsi', an: 'Ryznar index', label: 'Ryznar index, 2pHs − pH (typed)', unit: '' }
  ];
  App.PJ_BASE_COLS = [{ k: 'raw', label: 'Raw' }, { k: 'clarifier', label: 'Clarifier' }, { k: 'filtered', label: 'Filtered' }];
  App.PJ_CHEM_ROLES = [{ v: 'pH adjustment', label: 'pH adjustment' }, { v: 'coagulant', label: 'Coagulant' }, { v: 'coagulant aid', label: 'Coagulant aid' }, { v: 'polymer', label: 'Polymer' }, { v: 'other', label: 'Other' }];
  App.PJ_PARTY = [{ v: 'incumbent', label: 'Incumbent' }, { v: 'ours', label: 'Our product' }, { v: 'other', label: 'Other' }];
  App.PJ_GRADE_RE = /^[A-G](\/[A-G])?[+\-\u2212]{0,4}$/;
  App.pjNow = function () { return new Date().toISOString(); };

  // Plain decimal parse: s = 'empty' | 'ok' | 'bad'. No commas, exponents, grouping or unit text.
  App.pjParseDec = function (raw, o) {
    o = o || {};
    var t = String(raw == null ? '' : raw).trim();
    if (t === '') return { s: 'empty' };
    if (!(o.signed ? /^-?\d*\.?\d+$/ : /^\d*\.?\d+$/).test(t)) return { s: 'bad' };
    var n = Number(t);
    if (!isFinite(n) || (n === 0 && /[1-9]/.test(t))) return { s: 'bad' };
    if (o.max != null && n > o.max) return { s: 'bad' };
    return { s: 'ok', v: n };
  };
  App.pjParseGrade = function (raw) {
    var t = String(raw == null ? '' : raw).replace(/\s+/g, '').toUpperCase();
    if (t === '') return { s: 'empty' };
    return this.PJ_GRADE_RE.test(t) ? { s: 'ok', v: t } : { s: 'bad' };
  };
  // mL of stock into V mL of raw sample -> nominal mg/L; and the inverse. NaN = abstain.
  App.pjMgL = function (ml, stockPct, volMl) {
    var d = this.parseNum(ml), sp = this.parseNum(stockPct), v = this.parseNum(volMl);
    if (!(d >= 0) || !(sp > 0 && sp <= 100) || !(v > 0)) return NaN;
    return this.finiteResult(d * 10000 * sp / v, d > 0);
  };
  App.pjMl = function (mgL, stockPct, volMl) {
    var d = this.parseNum(mgL), sp = this.parseNum(stockPct), v = this.parseNum(volMl);
    if (!(d >= 0) || !(sp > 0 && sp <= 100) || !(v > 0)) return NaN;
    return this.finiteResult(d * v / (sp * 10000), d > 0);
  };
  // 1 mg/L = 1 kg/ML, so $/ML = dose (mg/L) x price ($/kg).
  App.pjCostPerMl = function (doseMgL, priceKg) {
    var d = this.parseNum(doseMgL), p = this.parseNum(priceKg);
    if (!(d >= 0) || !(p >= 0)) return NaN;
    return this.finiteResult(d * p, d > 0 && p > 0);
  };
  // half-up on the decimal value ($13.135 -> $13.14); the epsilon absorbs binary representation error only
  App.pjFormatMoney = function (n) { return typeof n === 'number' && isFinite(n) ? '$' + (Math.round((n + 1e-9) * 100) / 100).toFixed(2) : '—'; };
  // exact-looking text for a converted dose: 10 significant digits, never exponent notation
  App.pjDoseText = function (n) { return this.decimalText(Number(Number(n).toPrecision(10))); };

  App.pjBlankJar = function () {
    var r = {};
    this.PJ_PARAMS.forEach(function (p) { r[p.k] = ''; });
    return { coag: '', coagDose: '', poly: '', polyDose: '', r: r, notes: '' };
  };
  App.pjBlankBatch = function (id, gang) {
    var jars = [], i;
    for (i = 0; i < gang; i++) jars.push(this.pjBlankJar());
    return { id: id, gang: gang, flashS: '', flashRpm: '', slowMin: '', slowRpm: '', settleMin: '', filter: '', volMl: '', brkProduct: '', brkDose: '', jars: jars };
  };
  App.pjNew = function () {
    var self = this, cols = {}, params = {};
    this.PJ_BASE_COLS.forEach(function (c) {
      var v = {};
      self.PJ_BASE_ROWS.forEach(function (r) { v[r.k] = ''; });
      cols[c.k] = { time: '', v: v };
    });
    this.PJ_PARAMS.forEach(function (p) { params[p.k] = !!p.core; });
    return {
      id: '', createdAt: '', updatedAt: '', clientId: '',
      site: { name: '', source: '', date: '', time: '', offset: '', investigator: '' },
      base: { cols: cols },
      plant: { flow: '', flowUnit: '', hours: '', chems: [] },
      telemetry: [],
      params: params, doseMode: 'target', gang: 4,
      products: [], aid: { name: '', dose: '' },
      batches: [this.pjBlankBatch('b1', 4)],
      summary: { rows: {}, comments: '' },
      keep: {}, nextId: 2
    };
  };
  var PJ_NOKEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  // path 'batches.0.jars.1.r.colour'; objects on the way are created when missing (summary.rows.<id>.x)
  App.pjSet = function (path, val) {
    var parts = String(path).split('.'), o = this.state.pj, i, k;
    var pj = o;
    for (i = 0; i < parts.length; i++) if (PJ_NOKEYS[parts[i]]) return false;
    // a summary row is always created whole, so no field of it is ever undefined
    if (parts[0] === 'summary' && parts[1] === 'rows' && parts.length === 4 && pj.summary && pj.summary.rows && !pj.summary.rows[parts[2]]) pj.summary.rows[parts[2]] = { optDose: '', optSrc: '', filtNtu: '', colour: '', rating: '' };
    for (i = 0; i < parts.length - 1; i++) {
      k = parts[i];
      if (o == null || typeof o !== 'object') return false;
      if (o[k] == null) { if (Array.isArray(o)) return false; o[k] = {}; }
      o = o[k];
    }
    k = parts[parts.length - 1];
    if (o == null || typeof o !== 'object') return false;
    o[k] = parts[0] === 'params' ? !!val : String(val == null ? '' : val);
    this.setState({ pjSaved: false, pjError: '' });
    return true;
  };
  App.pjFindProduct = function (d, id) { return id ? (d.products.filter(function (p) { return p.id === id; })[0] || null) : null; };
  App.pjFindBatch = function (d, id) { return d.batches.filter(function (b) { return b.id === id; })[0] || null; };
  App.pjNextLabel = function (d, role) {
    var base = role === 'polymer' ? 'Poly' : 'Coag', n = 1;
    while (d.products.some(function (p) { return p.label === base + ' ' + n; })) n++;
    return base + ' ' + n;
  };
  App.pjAddProduct = function (role) {
    var d = this.state.pj, id = 'p' + (d.nextId++);
    role = role === 'polymer' ? 'polymer' : 'coagulant';
    d.products.push({ id: id, label: this.pjNextLabel(d, role), role: role, party: 'other', productId: '', name: '', stockPct: '', desc: '', price: '' });
    this.setState({ pjSaved: false, pjError: '' });
    return id;
  };
  App.pjRemoveProduct = function (id) {
    var d = this.state.pj, n = 0;
    if (!this.pjFindProduct(d, id)) return { ok: false };
    d.products = d.products.filter(function (p) { return p.id !== id; });
    d.batches.forEach(function (b) {
      if (b.brkProduct === id) b.brkProduct = '';
      b.jars.forEach(function (j) {
        var hit = false;
        if (j.coag === id) { j.coag = ''; j.coagDose = ''; hit = true; }
        if (j.poly === id) { j.poly = ''; j.polyDose = ''; hit = true; }
        if (hit) n++;
      });
    });
    delete d.summary.rows[id];
    this.setState({ pjSaved: false, pjError: '' });
    return { ok: true, jars: n };
  };
  App.pjProductJarCount = function (d, id) {
    var n = 0;
    d.batches.forEach(function (b) { b.jars.forEach(function (j) { if (j.coag === id || j.poly === id) n++; }); });
    return n;
  };
  App.pjAddChem = function () { this.state.pj.plant.chems.push({ role: 'coagulant', product: '', dose: '' }); this.setState({ pjSaved: false }); };
  App.pjRemoveChem = function (i) { this.state.pj.plant.chems.splice(+i, 1); this.setState({ pjSaved: false }); };
  App.pjAddTelemetry = function () { this.state.pj.telemetry.push({ label: '', value: '', unit: '', time: '' }); this.setState({ pjSaved: false }); };
  App.pjRemoveTelemetry = function (i) { this.state.pj.telemetry.splice(+i, 1); this.setState({ pjSaved: false }); };

  // ---- jars and batches ----
  App.pjJarTouched = function (j) {
    var any = !!(j.coag || j.poly || String(j.coagDose).trim() || String(j.polyDose).trim() || String(j.notes).trim());
    return any || this.PJ_PARAMS.some(function (p) { return String(j.r[p.k]).trim() !== ''; });
  };
  // A jar is "used" (exported) when it has a product, a dose, a note or a result for a SELECTED parameter.
  App.pjJarUsed = function (d, b, j) {
    if (j.coag || j.poly || String(j.coagDose).trim() || String(j.polyDose).trim() || String(j.notes).trim()) return true;
    return this.PJ_PARAMS.some(function (p) { return d.params[p.k] && String(j.r[p.k]).trim() !== ''; });
  };
  App.pjBatchHasData = function (b) {
    var self = this;
    return b.jars.some(function (j) { return self.pjJarTouched(j); });
  };
  App.pjAddBatch = function () {
    var d = this.state.pj, prev = d.batches[d.batches.length - 1], id = 'b' + (d.nextId++), b = this.pjBlankBatch(id, prev ? prev.gang : d.gang);
    if (prev) ['flashS', 'flashRpm', 'slowMin', 'slowRpm', 'settleMin', 'filter', 'volMl'].forEach(function (k) { b[k] = prev[k]; });
    d.batches.push(b);
    this.setState({ pjSaved: false, pjError: '' });
    return id;
  };
  App.pjDuplicateBatch = function (id) {
    var d = this.state.pj, src = this.pjFindBatch(d, id), nid, copy, at;
    if (!src) return null;
    nid = 'b' + (d.nextId++);
    copy = JSON.parse(JSON.stringify(src)); copy.id = nid;
    copy.jars.forEach(function (j) { var blank = {}; Object.keys(j.r).forEach(function (k) { blank[k] = ''; }); j.r = blank; j.notes = ''; });
    at = d.batches.indexOf(src);
    d.batches.splice(at + 1, 0, copy);
    this.setState({ pjSaved: false, pjError: '' });
    return nid;
  };
  App.pjRemoveBatch = function (id) {
    var d = this.state.pj, b = this.pjFindBatch(d, id);
    if (!b || d.batches.length < 2) return { ok: false };
    d.batches = d.batches.filter(function (x) { return x.id !== id; });
    Object.keys(d.summary.rows).forEach(function (pid) {
      var r = d.summary.rows[pid];
      if (r && typeof r.optSrc === 'string' && r.optSrc.indexOf(id + ':') === 0) r.optSrc = '';
    });
    this.setState({ pjSaved: false, pjError: '' });
    return { ok: true };
  };
  App.pjSetGang = function (batchId, n, force) {
    var d = this.state.pj, b = this.pjFindBatch(d, batchId), self = this, lost;
    n = Number(n);
    if (!b || (n !== 4 && n !== 6)) return { ok: false };
    if (n < b.jars.length) {
      lost = b.jars.slice(n).filter(function (j) { return self.pjJarTouched(j); }).length;
      if (lost && !force) return { ok: false, needsConfirm: true, lost: lost };
      b.jars = b.jars.slice(0, n);
    }
    while (b.jars.length < n) b.jars.push(this.pjBlankJar());
    b.gang = n; d.gang = n;
    this.setState({ pjSaved: false, pjError: '' });
    return { ok: true };
  };

  // Dose of one product in one jar, in both units. state: none | empty | ok | prompt (neutral) | error (red).
  App.pjJarDose = function (d, b, j, which) {
    var pid = which === 'poly' ? j.poly : j.coag, typed = which === 'poly' ? j.polyDose : j.coagDose, row = this.pjFindProduct(d, pid);
    var out = { state: 'none', typed: typed, mgL: NaN, ml: NaN, msg: '' }, t = this.pjParseDec(typed);
    var noun = which === 'poly' ? 'polymer' : 'coagulant';
    if (t.s === 'empty') { out.state = pid ? 'empty' : 'none'; return out; }
    if (t.s === 'bad') { out.state = 'error'; out.msg = 'Dose must be a plain non-negative decimal number with a decimal point (no commas, exponents or units).'; return out; }
    if (!row) { out.state = 'prompt'; out.msg = 'Choose a ' + noun + ' for this dose.'; return out; }
    var s = this.pjParseDec(row.stockPct, { max: 100 }), v = this.pjParseDec(b.volMl), label = row.label || 'this product';
    var target = d.doseMode !== 'ml';
    if (target) out.mgL = t.v; else out.ml = t.v;
    if (s.s === 'bad' || (s.s === 'ok' && !(s.v > 0))) { out.state = 'error'; out.msg = 'Stock strength of ' + label + ' must be a plain number above 0 and up to 100 (% w/v as made up).'; return out; }
    if (v.s === 'bad' || (v.s === 'ok' && !(v.v > 0))) { out.state = 'error'; out.msg = 'Jar sample volume must be a plain number above 0 (mL, initial raw sample).'; return out; }
    if (s.s === 'empty') { out.state = 'prompt'; out.msg = 'Enter the stock strength (% w/v) of ' + label + ' to see the ' + (target ? 'mL of stock to add.' : 'dose in mg/L.'); return out; }
    if (v.s === 'empty') { out.state = 'prompt'; out.msg = 'Enter the jar sample volume (mL) for this batch to see the ' + (target ? 'mL of stock to add.' : 'dose in mg/L.'); return out; }
    if (target) out.ml = this.pjMl(t.v, row.stockPct, b.volMl); else out.mgL = this.pjMgL(t.v, row.stockPct, b.volMl);
    if (!isFinite(target ? out.ml : out.mgL)) { out.state = 'error'; out.msg = 'That dose is outside the range this calculation can represent. Check the dose, stock strength and sample volume.'; if (!target) out.mgL = NaN; else out.ml = NaN; return out; }
    out.state = 'ok';
    return out;
  };
  // Why a typed dose cannot be converted to the other unit (null when it can). kind: product | stock | volume | invalid.
  App.pjDoseBlocker = function (d, b, j, which) {
    var r = this.pjJarDose(d, b, j, which), row = this.pjFindProduct(d, which === 'poly' ? j.poly : j.coag);
    if (r.state === 'ok' || r.state === 'none' || r.state === 'empty') return null;
    if (r.state === 'prompt' && !row) return { kind: 'product' };
    if (r.state === 'prompt' && this.pjParseDec(row.stockPct, { max: 100 }).s === 'empty') return { kind: 'stock', label: row.label || 'this product' };
    if (r.state === 'prompt') return { kind: 'volume' };
    return { kind: 'invalid' };
  };
  // "enter the stock strength of Coag 1; enter the jar volume of batch 2; choose a product for 1 dose; fix 1 invalid entry"
  App.pjBlockerText = function (list) {
    var parts = [], seen = {}, nProd = 0, nBad = 0;
    list.forEach(function (w) {
      if (w.kind === 'stock' && !seen['s:' + w.label]) { seen['s:' + w.label] = 1; parts.push('enter the stock strength of ' + w.label); }
      else if (w.kind === 'volume' && !seen['v:' + w.batch]) { seen['v:' + w.batch] = 1; parts.push('enter the jar volume of batch ' + w.batch); }
      else if (w.kind === 'product') nProd++;
      else if (w.kind === 'invalid') nBad++;
    });
    if (nProd) parts.push('choose a product for ' + nProd + ' dose' + (nProd === 1 ? '' : 's'));
    if (nBad) parts.push('fix ' + nBad + ' invalid entr' + (nBad === 1 ? 'y' : 'ies') + ' (shown in red)');
    return parts.join('; ');
  };
  // Converted text for one typed dose. Uses the shortest decimal (1-10 significant digits) whose conversion back gives
  // the typed number again at 10 significant digits, so switching back and forth never shows a number nobody typed.
  App.pjConvertDoseText = function (d, b, j, which, mode) {
    var row = this.pjFindProduct(d, which === 'poly' ? j.poly : j.coag), typed = Number(String(which === 'poly' ? j.polyDose : j.coagDose).trim()), self = this;
    var fwd = function (x) { return mode === 'ml' ? self.pjMl(x, row.stockPct, b.volMl) : self.pjMgL(x, row.stockPct, b.volMl); };
    var back = function (y) { return mode === 'ml' ? self.pjMgL(y, row.stockPct, b.volMl) : self.pjMl(y, row.stockPct, b.volMl); };
    var v = fwd(typed), p, y, bk;
    for (p = 1; p <= 10; p++) {
      y = Number(v.toPrecision(p));
      if (!isFinite(y) || (v > 0 && !(y > 0))) continue;
      bk = back(y);
      if (isFinite(bk) && Number(bk.toPrecision(10)) === typed) return this.decimalText(y);
    }
    return this.pjDoseText(v);
  };
  App.pjSetDoseMode = function (mode) {
    var d = this.state.pj, self = this, plan = [], blocked = [], memo = this._pjModeMemo, next = {};
    if (mode !== 'target' && mode !== 'ml') return { ok: false };
    if (mode === d.doseMode) return { ok: true, converted: 0, cleared: 0 };
    // Never clear or reinterpret a typed dose: if any one cannot be converted, nothing changes and the caller says why.
    d.batches.forEach(function (b, bi) {
      b.jars.forEach(function (j, ji) {
        ['coag', 'poly'].forEach(function (w) {
          var key = w + 'Dose', why, row, mk, sig, m, text;
          if (!String(j[key]).trim()) return;
          why = self.pjDoseBlocker(d, b, j, w);
          if (why) { why.batch = bi + 1; blocked.push(why); return; }
          row = self.pjFindProduct(d, w === 'poly' ? j.poly : j.coag);
          mk = b.id + ':' + ji + ':' + w; sig = JSON.stringify([row.id, row.stockPct, b.volMl]);
          m = memo && memo.to === d.doseMode && memo.from === mode && memo.map[mk];
          // switching straight back with nothing changed restores exactly what was typed
          text = m && m.wrote === j[key] && m.sig === sig ? m.orig : self.pjConvertDoseText(d, b, j, w, mode);
          plan.push({ j: j, key: key, text: text }); next[mk] = { orig: j[key], wrote: text, sig: sig };
        });
      });
    });
    if (blocked.length) return { ok: false, blocked: blocked.length, why: blocked };
    plan.forEach(function (x) { x.j[x.key] = x.text; });
    this._pjModeMemo = { from: d.doseMode, to: mode, map: next };
    d.doseMode = mode;
    this.setState({ pjSaved: false, pjError: '' });
    return { ok: true, converted: plan.length, cleared: 0 };
  };
  // Exact decimal arithmetic on plain non-negative integer strings (no BigInt in ES5): product and comparison.
  function pjBigMul(a, b) {
    var x = String(a).replace(/^0+(?=\d)/, ''), y = String(b).replace(/^0+(?=\d)/, ''), r = [], i, k, c, s = '';
    for (i = 0; i < x.length + y.length; i++) r.push(0);
    for (i = x.length - 1; i >= 0; i--) for (k = y.length - 1; k >= 0; k--) r[i + k + 1] += (x.charCodeAt(i) - 48) * (y.charCodeAt(k) - 48);
    for (i = r.length - 1; i > 0; i--) { c = Math.floor(r[i] / 10); r[i] -= c * 10; r[i - 1] += c; }
    for (i = 0; i < r.length; i++) s += r[i];
    return s.replace(/^0+(?=\d)/, '');
  }
  function pjBigCmp(a, b) { a = a.replace(/^0+(?=\d)/, ''); b = b.replace(/^0+(?=\d)/, ''); return a.length !== b.length ? (a.length < b.length ? -1 : 1) : (a < b ? -1 : (a > b ? 1 : 0)); }
  function pjScaled(t) { var m = /^(\d*)(?:\.(\d*))?$/.exec(String(t).trim()), f = m ? m[2] || '' : ''; return m ? { n: ((m[1] || '') + f) || '0', k: f.length } : null; }
  function pjZeros(n) { var s = ''; while (n-- > 0) s += '0'; return s; }
  // integer digit string scaled by 10^-k -> the shortest plain decimal text (no exponent, no trailing zeros)
  function pjDecimal(digits, k) {
    var s = String(digits), ip, fp;
    while (s.length <= k) s = '0' + s;
    ip = s.slice(0, s.length - k).replace(/^0+(?=\d)/, ''); fp = s.slice(s.length - k).replace(/0+$/, '');
    return fp ? ip + '.' + fp : ip;
  }
  // Exact decimal product of two plain non-negative decimal texts (review fix2 N14). Cost per ML = mg/L text x $/kg text with
  // no float anywhere, so the Summary screen, the CSV / Jars cost cells and the Report cost agree by construction (a reader
  // multiplying the two exported cells gets the cost cell exactly). null when either text is not a plain decimal.
  App.pjExactProduct = function (a, b) {
    var x, y;
    if (this.pjParseDec(a).s !== 'ok' || this.pjParseDec(b).s !== 'ok') return null;
    x = pjScaled(String(a).trim()); y = pjScaled(String(b).trim());
    if (!x || !y) return null;
    return pjDecimal(pjBigMul(x.n, y.n), x.k + y.k);
  };
  // '$x.xx': that exact product rounded half up to cents ('—' when it cannot be computed). No thousands grouping, as before.
  App.pjMoneyText = function (a, b) {
    var x, y, p, k, s, d, q, i, c;
    if (this.pjParseDec(a).s !== 'ok' || this.pjParseDec(b).s !== 'ok') return '\u2014';
    x = pjScaled(String(a).trim()); y = pjScaled(String(b).trim());
    if (!x || !y) return '\u2014';
    p = pjBigMul(x.n, y.n); k = x.k + y.k;
    if (k <= 2) q = p + pjZeros(2 - k);
    else {
      d = k - 2; s = p; while (s.length <= d) s = '0' + s;
      q = s.slice(0, s.length - d);
      if (s.charAt(s.length - d) >= '5') {
        // add one cent to the digit string
        q = q.split(''); i = q.length - 1; c = 1;
        while (c && i >= 0) { var dg = q[i].charCodeAt(0) - 48 + c; c = dg > 9 ? 1 : 0; q[i] = String(dg % 10); i--; }
        q = (c ? '1' : '') + q.join('');
      }
    }
    q = q.replace(/^0+(?=\d)/, ''); while (q.length < 3) q = '0' + q;
    return '$' + q.slice(0, q.length - 2) + '.' + q.slice(q.length - 2);
  };
  // 100 x mL for jar i of n, rounded half up on the EXACT decimal value: 100 mL = cur x (n-1+2i) x V / (200 (n-1) S).
  // est is the floating-point estimate; returns NaN when the exact check cannot be made (then the caller keeps est).
  function pjExactCentiMl(curT, sT, vT, n, i, est) {
    var c = pjScaled(curT), s = pjScaled(sT), v = pjScaled(vT), num, den, num2, r, t, guard;
    if (!c || !s || !v || !(est >= 0) || est > 1e15) return NaN;
    num = pjBigMul(pjBigMul(pjBigMul(c.n, String(n - 1 + 2 * i)), v.n), '1' + pjZeros(s.k));
    den = pjBigMul(pjBigMul(String(200 * (n - 1)), s.n), '1' + pjZeros(c.k + v.k));
    if (/^0+$/.test(den)) return NaN;
    num2 = pjBigMul(num, '2'); r = Math.round(est);
    // the answer r satisfies (2r - 1) den <= 2 num < (2r + 1) den
    for (guard = 0; guard < 8; guard++) {
      t = pjBigMul(String(2 * r + 1), den);
      if (pjBigCmp(t, num2) <= 0) { r++; continue; }
      if (r > 0 && pjBigCmp(pjBigMul(String(2 * r - 1), den), num2) > 0) { r--; continue; }
      return r;
    }
    return NaN;
  }
  // n evenly spaced doses from 50 % to 150 % of the current plant dose (mg/L). mode 'ml' returns mL rounded half up to
  // 0.01 mL on the exact decimal value (the finest step a jar resolves); mode 'target' returns mg/L to 4 significant digits.
  App.pjBracketDoses = function (curDose, stockPct, volMl, n, mode) {
    var cur = this.pjParseDec(curDose), s = this.pjParseDec(stockPct, { max: 100 }), v = this.pjParseDec(volMl), doses = [], i, seen = {};
    if (cur.s !== 'ok' || !(cur.v > 0)) return { ok: false, why: 'Enter the current plant dose (mg/L) as a plain number above 0.' };
    if (s.s !== 'ok' || !(s.v > 0)) return { ok: false, why: 'Enter the stock strength (% w/v, above 0 and up to 100) of the coagulant first.' };
    if (v.s !== 'ok' || !(v.v > 0)) return { ok: false, why: 'Enter the jar sample volume (mL) of this batch first.' };
    for (i = 0; i < n; i++) {
      var f = 0.5 + i / (n - 1), target = cur.v * f, val, est, exact;
      if (mode === 'ml') {
        est = this.pjMl(target, s.v, v.v) * 100; exact = isFinite(est) ? pjExactCentiMl(curDose, stockPct, volMl, n, i, est) : NaN;
        val = (isFinite(exact) ? exact : Math.round(est)) / 100;
        if (!isFinite(val) || val <= 0 || seen[val]) return { ok: false, why: 'At this dose and stock strength the ' + n + ' volumes collapse below 0.01 mL steps (or overflow). Use a weaker stock or a larger jar, then bracket again.' }; seen[val] = 1;
      }
      else { val = Number(target.toPrecision(4)); if (!isFinite(val) || val <= 0 || seen[val]) return { ok: false, why: 'The bracket endpoints are outside the finite numeric range. Check the current dose.' }; seen[val] = 1; }
      doses.push(this.decimalText(val));
    }
    return { ok: true, doses: doses };
  };
  App.pjBracketCore = function (batchId, force) {
    var d = this.state.pj, b = this.pjFindBatch(d, batchId), row, r, self = this;
    if (!b) return { ok: false, why: 'Batch not found.' };
    row = this.pjFindProduct(d, b.brkProduct);
    if (!row || row.role !== 'coagulant') return { ok: false, why: 'Choose the coagulant to bracket.' };
    r = this.pjBracketDoses(b.brkDose, row.stockPct, b.volMl, b.jars.length, d.doseMode);
    if (!r.ok) return r;
    if (!force && b.jars.some(function (j) { return self.pjJarTouched(j) && PJ_HAS_RESULT(self, j); })) return { ok: false, needsConfirm: true, why: 'Recorded results in this batch would be cleared.' };
    b.jars.forEach(function (j, i) {
      j.coag = row.id; j.coagDose = r.doses[i];
      Object.keys(j.r).forEach(function (k) { j.r[k] = ''; });
    });
    this.setState({ pjSaved: false, pjError: '' });
    return { ok: true, doses: r.doses };
  };
  function PJ_HAS_RESULT(self, j) { return self.PJ_PARAMS.some(function (p) { return String(j.r[p.k]).trim() !== ''; }); }

  // ---- problems the user should fix before exporting (saving never blocks on them) ----
  App.pjObservation = function (site) {
    var date = String(site.date || '').trim(), time = String(site.time || '').trim(), offset = String(site.offset || '').trim();
    var bad = { error: 'Sampled date must be a real date, the time HH:MM (24 h) and the UTC offset explicit (+10:00, -04:00 or +00:00). Leave the time and offset blank if unknown.' };
    if (!date && !time && !offset) return { observedAt: null, observedDate: null, observationOffset: null };
    if (!this.validObservationDate(date)) return bad;
    if (!time && !offset) return { observedAt: null, observedDate: date, observationOffset: null };
    var t = /^(\d{2}):(\d{2})$/.exec(time);
    if (!t || +t[1] > 23 || +t[2] > 59 || !this.validObservationOffset(offset)) return bad;
    return { observedAt: date + 'T' + time + ':00' + offset, observedDate: date, observationOffset: offset };
  };
  App.pjIssues = function (d) {
    var out = [], self = this, sec = 'site';
    function add(text) { out.push({ sec: sec, text: text }); }
    function num(label, raw, o) { if (self.pjParseDec(raw, o).s === 'bad') add(label + ': enter a plain decimal number' + (o && o.max != null ? ' up to ' + o.max : '') + ' (no commas, exponents or units).'); }
    sec = 'site'; var obs = this.pjObservation(d.site); if (obs.error) add('Sampled date/time: ' + obs.error);
    sec = 'baseline';
    this.PJ_BASE_COLS.forEach(function (c) {
      var col = d.base.cols[c.k];
      if (String(col.time).trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(col.time).trim())) add(c.label + ' reading time: use HH:MM (24 h).');
      self.PJ_BASE_ROWS.forEach(function (r) { num(c.label + ' ' + r.an, col.v[r.k], { signed: !!r.signed, max: r.ph ? 14 : undefined }); });
    });
    num('Plant flow', d.plant.flow); num('Plant hours per day', d.plant.hours, { max: 24 });
    if (String(d.plant.flow).trim() && !isFinite(this.flowFactor(d.plant.flowUnit))) add('Plant flow: choose its unit.');
    d.plant.chems.forEach(function (c, i) { num('Current chemical ' + (i + 1) + ' dose', c.dose); });
    d.telemetry.forEach(function (t, i) { num('Telemetry reading ' + (i + 1) + ' value', t.value, { signed: true }); if (String(t.time).trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t.time).trim())) add('Telemetry reading ' + (i + 1) + ' time: use HH:MM (24 h).'); });
    num('Given-to-all aid dose', d.aid.dose);
    sec = 'products';
    d.products.forEach(function (p) { num(p.label + ' stock strength', p.stockPct, { max: 100 }); if (self.pjParseDec(p.stockPct, { max: 100 }).s === 'ok' && !(self.pjParseDec(p.stockPct).v > 0)) add(p.label + ' stock strength: must be above 0.'); num(p.label + ' price', p.price); });
    sec = 'batches';
    d.batches.forEach(function (b, bi) {
      var bn = 'Batch ' + (bi + 1);
      ['flashS', 'flashRpm', 'slowMin', 'slowRpm', 'settleMin', 'brkDose'].forEach(function (k) { num(bn + ' ' + k.replace('flashS', 'flash mix seconds').replace('flashRpm', 'flash mix rpm').replace('slowMin', 'slow mix minutes').replace('slowRpm', 'slow mix rpm').replace('settleMin', 'settling minutes').replace('brkDose', 'current plant dose'), b[k]); });
      num(bn + ' jar volume', b.volMl);
      if (self.pjParseDec(b.volMl).s === 'ok' && !(self.pjParseDec(b.volMl).v > 0)) add(bn + ' jar volume: must be above 0.');
      var stockSeen = {};
      b.jars.forEach(function (j, ji) {
        var jn = bn + ' jar ' + (ji + 1);
        ['coag', 'poly'].forEach(function (w) {
          var r = self.pjJarDose(d, b, j, w);
          if (r.state === 'error') add(jn + ' ' + (w === 'poly' ? 'polymer' : 'coagulant') + ': ' + r.msg);
          else if (r.state === 'prompt' && /^Choose/.test(r.msg)) add(jn + ': ' + r.msg);
        });
        self.PJ_PARAMS.forEach(function (p) {
          if (!d.params[p.k]) return;
          var raw = j.r[p.k], res = p.kind === 'grade' ? self.pjParseGrade(raw) : self.pjParseDec(raw, p.kind === 'ph' ? { max: 14 } : undefined);
          if (res.s === 'bad') add(jn + ' ' + p.an + ': ' + (p.kind === 'grade' ? 'use a grade A–G with an optional / second grade and up to four + or − (e.g. C+, C/D).' : 'enter a plain decimal number' + (p.kind === 'ph' ? ' from 0 to 14' : '') + '.'));
        });
      });
    });
    sec = 'summary';
    Object.keys(d.summary.rows).forEach(function (pid) {
      var r = d.summary.rows[pid], p = self.pjFindProduct(d, pid); if (!p || !r) return;
      num(p.label + ' optimum dose', r.optDose); num(p.label + ' filtered turbidity at that dose', r.filtNtu); num(p.label + ' colour at that dose', r.colour);
      if (String(r.rating).trim() && !/^[1-9]$/.test(String(r.rating).trim())) add(p.label + ' rating: use a whole number from 1 to 9.');
    });
    return out;
  };

  // ---- cleaning, record <-> draft ----
  App.pjCleanRecord = function (r) {
    var self = this, fixed = false, y = r;
    function arr(obj, key) {
      if (obj[key] == null) return obj;
      if (!Array.isArray(obj[key])) { obj = Object.assign({}, obj); obj[key] = []; fixed = true; return obj; }
      var f = obj[key].filter(function (x) { return self.isRec(x); });
      if (f.length !== obj[key].length) { obj = Object.assign({}, obj); obj[key] = f; fixed = true; }
      return obj;
    }
    function rec(obj, key) {
      if (obj[key] == null || self.isRec(obj[key])) return obj;
      obj = Object.assign({}, obj); obj[key] = {}; fixed = true; return obj;
    }
    y = arr(y, 'products'); y = arr(y, 'telemetry'); y = arr(y, 'batches');
    ['site', 'base', 'plant', 'params', 'summary'].forEach(function (k) { y = rec(y, k); });
    if (Array.isArray(y.batches)) {
      var nb = y.batches.map(function (b) { var c = arr(b, 'jars'); return c; });
      if (nb.some(function (b, i) { return b !== y.batches[i]; })) { y = Object.assign({}, y, { batches: nb }); }
    }
    if (self.isRec(y.plant) && y.plant.chems != null) { var p2 = arr(y.plant, 'chems'); if (p2 !== y.plant) y = Object.assign({}, y, { plant: p2 }); }
    if (self.isRec(y.summary) && y.summary.rows != null && !self.isRec(y.summary.rows)) { y = Object.assign({}, y, { summary: Object.assign({}, y.summary, { rows: {} }) }); fixed = true; }
    if (self.isRec(y.base) && y.base.cols != null && !self.isRec(y.base.cols)) { y = Object.assign({}, y, { base: Object.assign({}, y.base, { cols: {} }) }); fixed = true; }
    return { rec: y, fixed: fixed };
  };
  var PJ_KNOWN = ['schema', 'kind', 'id', 'createdAt', 'updatedAt', 'clientId', 'clientName', 'observation', 'site', 'base', 'plant', 'telemetry', 'params', 'doseMode', 'gang', 'products', 'aid', 'batches', 'summary', 'nextId'];
  function pjS(x) { return typeof x === 'string' ? x : (typeof x === 'number' && isFinite(x) ? String(x) : ''); }
  App.pjHydrate = function (rec) {
    var self = this, d = this.pjNew(), site = this.isRec(rec.site) ? rec.site : {}, base = this.isRec(rec.base) && this.isRec(rec.base.cols) ? rec.base.cols : {}, plant = this.isRec(rec.plant) ? rec.plant : {};
    var used = Object.create(null), maxId = 1; // no inherited names: a product or batch id 'toString' keeps its id (review fix3 I1)
    function claim(id, prefix) {
      var m = /^[pb](\d+)$/.exec(id); if (m && +m[1] > maxId) maxId = +m[1];
      return id;
    }
    d.id = pjS(rec.id); d.createdAt = pjS(rec.createdAt); d.updatedAt = pjS(rec.updatedAt); d.clientId = pjS(rec.clientId);
    Object.keys(d.site).forEach(function (k) { d.site[k] = pjS(site[k]); });
    this.PJ_BASE_COLS.forEach(function (c) {
      var col = self.isRec(base[c.k]) ? base[c.k] : {}, v = self.isRec(col.v) ? col.v : {};
      d.base.cols[c.k].time = pjS(col.time);
      self.PJ_BASE_ROWS.forEach(function (r) { d.base.cols[c.k].v[r.k] = pjS(v[r.k]); });
    });
    d.plant.flow = pjS(plant.flow); d.plant.flowUnit = pjS(plant.flowUnit); d.plant.hours = pjS(plant.hours);
    d.plant.chems = (Array.isArray(plant.chems) ? plant.chems : []).filter(function (c) { return self.isRec(c); }).map(function (c) { return { role: pjS(c.role) || 'other', product: pjS(c.product), dose: pjS(c.dose) }; });
    d.telemetry = (Array.isArray(rec.telemetry) ? rec.telemetry : []).filter(function (c) { return self.isRec(c); }).map(function (c) { return { label: pjS(c.label), value: pjS(c.value), unit: pjS(c.unit), time: pjS(c.time) }; });
    var pr = this.isRec(rec.params) ? rec.params : {};
    this.PJ_PARAMS.forEach(function (p) { if (Object.prototype.hasOwnProperty.call(pr, p.k)) d.params[p.k] = pr[p.k] === true; });
    d.doseMode = rec.doseMode === 'ml' ? 'ml' : 'target';
    d.products = (Array.isArray(rec.products) ? rec.products : []).filter(function (p) { return self.isRec(p); }).map(function (p) {
      var id = pjS(p.id); if (!id || used[id]) id = ''; if (id) { used[id] = 1; claim(id); }
      return { id: id, label: pjS(p.label), role: p.role === 'polymer' ? 'polymer' : 'coagulant', party: p.party === 'incumbent' || p.party === 'ours' ? p.party : 'other', productId: pjS(p.productId), name: pjS(p.name), stockPct: pjS(p.stockPct), desc: pjS(p.desc), price: pjS(p.price) };
    });
    var bsrc = (Array.isArray(rec.batches) ? rec.batches : []).filter(function (b) { return self.isRec(b); });
    d.batches = bsrc.map(function (b) {
      var id = pjS(b.id); if (!id || used[id]) id = ''; if (id) { used[id] = 1; claim(id); }
      var jarsSrc = (Array.isArray(b.jars) ? b.jars : []).filter(function (j) { return self.isRec(j); });
      var gang = b.gang === 6 || b.gang === '6' ? 6 : (b.gang === 4 || b.gang === '4' ? 4 : (jarsSrc.length > 4 ? 6 : 4));
      var nb = self.pjBlankBatch(id, 0);
      ['flashS', 'flashRpm', 'slowMin', 'slowRpm', 'settleMin', 'filter', 'volMl', 'brkProduct', 'brkDose'].forEach(function (k) { nb[k] = pjS(b[k]); });
      nb.jars = jarsSrc.map(function (j) {
        var nj = self.pjBlankJar(), rr = self.isRec(j.r) ? j.r : {};
        nj.coag = pjS(j.coag); nj.coagDose = pjS(j.coagDose); nj.poly = pjS(j.poly); nj.polyDose = pjS(j.polyDose); nj.notes = pjS(j.notes);
        self.PJ_PARAMS.forEach(function (p) { nj.r[p.k] = pjS(rr[p.k]); });
        return nj;
      });
      while (nb.jars.length < gang) nb.jars.push(self.pjBlankJar());
      // honour the stored gang: jars beyond it are dropped only when they hold nothing; with entries they are kept
      // (gang 6), because dropping them would lose those entries on the next save
      if (nb.jars.length > gang) { if (nb.jars.slice(gang).some(function (j) { return self.pjJarTouched(j); })) gang = 6; else nb.jars = nb.jars.slice(0, gang); }
      nb.gang = gang;
      return nb;
    });
    if (!d.batches.length) d.batches = [this.pjBlankBatch('', 4)];
    // ids that were missing or duplicated get fresh ones after the highest existing number
    var stored = rec.nextId, next = (typeof stored === 'number' && stored === Math.floor(stored) && stored >= 1) ? stored : 1;
    if (next <= maxId) next = maxId + 1;
    d.products.forEach(function (p) { if (!p.id) p.id = 'p' + (next++); });
    d.batches.forEach(function (b) { if (!b.id) b.id = 'b' + (next++); });
    d.nextId = next; d.gang = d.batches[0].gang;
    var sm = this.isRec(rec.summary) ? rec.summary : {}, rows = this.isRec(sm.rows) ? sm.rows : {};
    d.summary.comments = pjS(sm.comments);
    Object.keys(rows).forEach(function (pid) {
      if (!self.isRec(rows[pid]) || PJ_NOKEYS[pid]) return;
      var r = rows[pid]; d.summary.rows[pid] = { optDose: pjS(r.optDose), optSrc: pjS(r.optSrc), filtNtu: pjS(r.filtNtu), colour: pjS(r.colour), rating: pjS(r.rating) };
    });
    var aid = this.isRec(rec.aid) ? rec.aid : {}; d.aid.name = pjS(aid.name); d.aid.dose = pjS(aid.dose);
    Object.keys(rec).forEach(function (k) { if (PJ_KNOWN.indexOf(k) < 0 && !PJ_NOKEYS[k]) d.keep[k] = JSON.parse(JSON.stringify(rec[k])); });
    return d;
  };
  App.pjRecord = function (d, meta) {
    var clients = this.state.clients, c = d.clientId ? clients.filter(function (x) { return x.id === d.clientId; }) : [];
    var rec = {}, copy = JSON.parse(JSON.stringify(d));
    Object.keys(copy.keep || {}).forEach(function (k) { rec[k] = copy.keep[k]; });
    rec.schema = 2; rec.kind = 'potable-v2';
    rec.id = meta.id; rec.createdAt = meta.createdAt; rec.updatedAt = meta.updatedAt;
    rec.clientId = copy.clientId; rec.clientName = c.length === 1 ? c[0].name : (meta.clientName || '');
    rec.observation = this.pjObservation(copy.site);
    if (rec.observation.error) rec.observation = { observedAt: null, observedDate: null, observationOffset: null };
    ['site', 'base', 'plant', 'telemetry', 'params', 'doseMode', 'gang', 'products', 'aid', 'batches', 'summary', 'nextId'].forEach(function (k) { rec[k] = copy[k]; });
    return rec;
  };
  App.pjSig = function () { return JSON.stringify(this.state.pj); };
  App.pjHasContent = function (d) {
    function strip(x) { var c = JSON.parse(JSON.stringify(x)); c.id = ''; c.createdAt = ''; c.updatedAt = ''; c.nextId = 0; c.keep = {}; return JSON.stringify(c); }
    return strip(d) !== strip(this.pjNew());
  };
  App.persistTestsV2 = function (t) { return this.writeList('ctf_jartests_v2', t); };

  // ---- save / open / delete (synchronous cores; handlers add confirmation and the storage lock) ----
  App.pjRecordMatches = function (id) { return typeof id === 'string' && id.trim() ? this.state.jarTestsV2.filter(function (r) { return r.id === id; }) : []; };
  App.pjSaveCore = function (force) {
    var s = this.state, d = s.pj, snap = this._snap, matches = d.id ? this.pjRecordMatches(d.id) : [], created, now, id, rec, next, idx, createdAt;
    if (!this.pjHasContent(d)) return { ok: false, error: 'Nothing to save yet — enter a site, a baseline value, a product or a jar entry first.' };
    if (matches.length > 1) return { ok: false, error: 'Duplicate saved IDs make this save ambiguous — nothing was saved. Export a backup and resolve the duplicate records first.' };
    created = matches.length === 0;
    if (!created && snap.pjBackingInvalid && !force) return { ok: false, needsConfirm: true, error: 'This saved test was changed after you opened it (another tab, a refresh or a restore). Saving now replaces the stored copy with this screen.' };
    now = this.pjNow();
    id = created && !d.id ? this.recordId('jt2-', s.jarTestsV2) : d.id;
    createdAt = created ? (d.createdAt || now) : (typeof matches[0].createdAt === 'string' && matches[0].createdAt ? matches[0].createdAt : now);
    rec = this.pjRecord(d, { id: id, createdAt: createdAt, updatedAt: now });
    if (created) next = [rec].concat(s.jarTestsV2);
    else { idx = s.jarTestsV2.indexOf(matches[0]); next = s.jarTestsV2.slice(); next[idx] = rec; }
    if (!this.persistTestsV2(next)) return { ok: false, error: 'Could not write to this device’s storage — the test is NOT saved. Free up space (or leave private browsing) and save again. Everything you entered is still on screen.' };
    d.id = id; d.createdAt = createdAt; d.updatedAt = now;
    snap.pjBacking = { id: id, record: JSON.stringify(rec) }; snap.pjBackingInvalid = false; snap.pj = this.pjSig();
    this.setState({ jarTestsV2: next, pjSaved: true, pjError: '' });
    this.pjDraftFlush(); // the draft equals the saved state at once; if that write fails, the stale draft is replaced by a
    // reference to this saved record or removed (review fix3 M1), so a kill never restores an id-less copy that could become a duplicate
    return { ok: true, id: id, created: created, record: rec, issues: this.pjIssues(d).length };
  };
  App.pjOpenCore = function (id) {
    var m = this.pjRecordMatches(id), rec, d;
    if (m.length !== 1) return { ok: false, error: 'That saved test is missing or its identity is ambiguous, so it was not opened. Saved records are unchanged.' };
    rec = m[0];
    if (typeof rec.schema === 'number' && rec.schema > 2) return { ok: false, error: 'That test was saved by a newer version of the app. Update the app to open it; the saved record is unchanged.' };
    if (rec.schema !== 2 || rec.kind !== 'potable-v2') return { ok: false, error: 'That record is not a multi-product jar test, so it was not opened.' };
    d = this.pjHydrate(rec); d.id = rec.id; this._pjModeMemo = null;
    this._snap.pj = JSON.stringify(d); this._snap.pjBacking = { id: rec.id, record: JSON.stringify(rec) }; this._snap.pjBackingInvalid = false;
    this.setState({ pj: d, pjSaved: false, pjError: '' });
    this.pjDraftFlush(); // the draft becomes the opened test at once (or a reference to it, or nothing: never the discarded test)
    return { ok: true };
  };
  App.pjDeleteCore = function (id) {
    var m = this.pjRecordMatches(id), next, d = this.state.pj;
    if (m.length !== 1) return { ok: false, error: 'That saved test is missing or its identity is ambiguous, so nothing was deleted.' };
    next = this.state.jarTestsV2.filter(function (r) { return r !== m[0]; });
    if (!this.persistTestsV2(next)) return { ok: false, error: 'Could not write to this device’s storage — the record is NOT deleted. Save a backup, free space and try again.' };
    if (d.id === id) { d.id = ''; d.createdAt = ''; d.updatedAt = ''; this._snap.pj = ''; delete this._snap.pjBacking; this._snap.pjBackingInvalid = false; }
    this.setState({ jarTestsV2: next, pjSaved: false, storageError: this.protectedStorageWarning() });
    this.pjDraftFlush(); // deleting the open test: the draft keeps the entries, without the id, at once
    return { ok: true };
  };
  App.pjNewCore = function () {
    var d = this.pjNew();
    this._pjModeMemo = null;
    this._snap.pj = JSON.stringify(d); delete this._snap.pjBacking; this._snap.pjBackingInvalid = false;
    this.setState({ pj: d, pjSaved: false, pjError: '' });
    this.pjDraftFlush(); // the empty test needs no draft: the key is removed at once
  };

  // ---- AUTOSAVE of the open multi-product test (fix round 3; user decision 2026-10-09; review fix3 M1/L1/L2 in fix round 4) ----
  // On iOS a backgrounded PWA is often killed, so the open test (state.pj, including its saved id) is kept in its OWN key
  // `ctf_jartest_v2_draft` as one JSON record {v: 1, savedAt, pj[, base]}. The draft is NOT a saved test: it is never listed in
  // Saved tests and is not a STORE_KEYS list, so a backup carries it only as raw text under `extra` (as every release does with
  // any app key it does not list, including ae77a30) and a restore never merges, counts or replaces it. Saved tests change
  // only through Save progress, exactly as before.
  //  - base (review fix3 L1): when the open test was opened or last saved from a saved record that is still valid, the draft
  //    also names THAT version: {id, updatedAt, sig} (sig = length + two 32-bit FNV-1a hashes of the record's exact JSON).
  //    At start-up a stored record that is not that version (saved since in another tab, restored, or a draft without base)
  //    makes Save progress ask the existing "changed after you opened it ... Replace?" question instead of overwriting it.
  //  - A REFERENCE draft {v: 1, savedAt, base} (no pj) means "the open test is exactly that saved record". It is written only
  //    when the whole test does not fit (review fix3 M1); the next start opens the stored record as Open does.
  //  - Writes: every change to state.pj ends in setState -> pjDraftTouch, throttled to at most one write per 400 ms
  //    (trailing: the last edit always lands), flushed at once on visibilitychange (hidden), pagehide, and on New / Open /
  //    Save progress / Delete. Nothing is written when nothing changed. An empty/default test removes the key.
  //  - Never stale after a tap (review fix3 M1): when the open test is the empty test, or is exactly a saved record as stored,
  //    and the write fails for lack of space, the older draft is removed first (removal needs no space), then the whole test
  //    or else the reference is written; if neither fits the key stays absent (the next start shows the empty test). So an
  //    id-less copy (after Save progress) or a discarded test (after Open / New) can never come back as unsaved entries.
  //  - Blocking: no draft write while a restore rollback is pending or a protected original blocks saved-data writes (the
  //    draft write is skipped, never the reverse), nor while a damaged draft that could not be copied aside is protected.
  //    While saved data is protected or a rollback is pending the screen says autosave is paused (review fix3 L2), and when
  //    the open test is the empty test or an unchanged saved record (after New, Open, Save progress, or typing back) a draft
  //    that holds anything else is REMOVED: removal needs no space and touches no saved key, protected original, aside copy
  //    or the in-memory recovery text. A damaged draft that could not be copied aside is never removed: it is the only copy.
  //  - Quota: a write that throws or reads back wrong shows one neutral note, never blocks typing, never evicts or alters
  //    other keys, and is retried on the next edit (the key keeps its previous content meanwhile, except as above).
  //  - Two tabs: LAST WRITER WINS for the draft. Each tab writes its whole open test; no lock is taken for the draft (a
  //    convenience copy; Saved tests keep their own cross-tab lock). The next start restores whichever tab wrote last, and its
  //    base makes Save progress ask before replacing a version another tab saved.
  //  - Start-up: a readable draft is cleaned through the saved-record cleaners (pjCleanRecord + pjHydrate) and opened. If its
  //    id names exactly one saved v2 test, unsaved-work and the saved banner compare against THAT record (as Open does). If
  //    the id no longer exists (deleted elsewhere) or names a record this release cannot open, the id is DROPPED: the entries
  //    stay as an unsaved new test, and Save progress makes a new record, so a deleted record is never resurrected.
  App.PJ_DRAFT_KEY = 'ctf_jartest_v2_draft';
  App.PJ_DRAFT_MS = 400;
  App.PJ_DRAFT_QUOTA = 'Autosave paused: phone storage is full. Press Save progress or export the test.';
  App.PJ_DRAFT_PAUSED = 'Autosave is paused while damaged saved data is protected. Press Save progress or export the test.';
  App.pjDraftNoteSet = function (kind, text) { this.state.pjDraftNoteKind = kind; this.state.pjDraftNote = text; };
  App.pjDraftBlocked = function () { return !!(this._restoreRecovery || Object.keys(this._protectedKeys || {}).length || this._pjDraftProtect); };
  // saved data is protected or a restore rollback is pending (not the draft's own protection, which has its own note)
  App.pjDraftPausedForData = function () { return !!(this._restoreRecovery || Object.keys(this._protectedKeys || {}).length); };
  // the note under Save progress: the start-up / quota note, plus the paused sentence while saved data is protected
  App.pjDraftNoteText = function () {
    var s = this.state, t = s.pjDraftNote || '', k = s.pjDraftNoteKind;
    if (!this._pjDraftArmed || k === 'protect' || !this.pjDraftPausedForData()) return t;
    return t && k !== 'quota' ? t + ' ' + this.PJ_DRAFT_PAUSED : this.PJ_DRAFT_PAUSED;
  };
  // false while entries are NOT being kept as you type (writes blocked, or the last write failed): the helper drops its promise
  App.pjAutosaveOn = function () { return !(this._pjDraftArmed && (this.pjDraftBlocked() || this.state.pjDraftNoteKind === 'quota')); };
  function pjFnv(t, h) {
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; }
    return h;
  }
  function pjHex8(n) { return ('0000000' + n.toString(16)).slice(-8); }
  // identity of a saved record's exact JSON (review fix3 L1)
  App.pjRecordSig = function (json) {
    var t = String(json), c = this._pjSigCache, sig;
    if (c && c.t === t) return c.sig;
    sig = t.length + ':' + pjHex8(pjFnv(t, 2166136261)) + pjHex8(pjFnv(t, 3735928559));
    this._pjSigCache = { t: t, sig: sig };
    return sig;
  };
  // the saved version the open test was opened or last saved from, while it is still valid; else null
  App.pjDraftBase = function () {
    var snap = this._snap, b = snap.pjBacking, d = this.state.pj;
    if (!b || snap.pjBackingInvalid || !d.id || d.id !== b.id) return null;
    return { id: b.id, updatedAt: pjS(d.updatedAt), sig: this.pjRecordSig(b.record) };
  };
  // 'blank': the open test is the empty test. 'saved': it is unchanged from the saved record it was opened or last saved
  // from, and that record is stored exactly as it was. '': it holds entries no saved record holds.
  App.pjDraftCovered = function () {
    var sig = this.pjSig(), snap = this._snap, b = snap.pjBacking, m;
    if (sig === this._initialPjSig) return 'blank';
    if (!b || snap.pjBackingInvalid || typeof snap.pj !== 'string' || sig !== snap.pj || this.state.pj.id !== b.id) return '';
    m = this.pjRecordMatches(b.id);
    return m.length === 1 && JSON.stringify(m[0]) === b.record ? 'saved' : '';
  };
  function pjTryWrite(key, raw) { try { localStorage.setItem(key, raw); return localStorage.getItem(key) === raw; } catch (e) { return false; } }
  function pjTryRemove(key) { try { localStorage.removeItem(key); return localStorage.getItem(key) === null; } catch (e) { return false; } }
  App.pjDraftSchedule = function () {
    var self = this;
    if (this._pjDraftTimer || typeof setTimeout !== 'function') return;
    this._pjDraftTimer = setTimeout(function () { self._pjDraftTimer = null; self.pjDraftFlush(true); }, this.PJ_DRAFT_MS);
  };
  // from setState: the open test changed since the last write (and since the last failed attempt) -> schedule a write
  App.pjDraftTouch = function () {
    var sig = JSON.stringify(this.state.pj), k = this.state.pjDraftNoteKind;
    if (sig !== this._pjDraftSeen) { this._pjDraftSeen = sig; if (k === 'restored' || k === 'damaged') this.pjDraftNoteSet('', ''); } // an edit clears the start-up note
    if (sig === this._pjDraftSig || sig === this._pjDraftFailed) return;
    this.pjDraftSchedule();
  };
  App.pjDraftFlush = function (fromTimer) {
    var s = this.state, key = this.PJ_DRAFT_KEY, sig, raw, ok = false, was = s.pjDraftNoteKind, cover, base, now;
    if (this._pjDraftTimer) { clearTimeout(this._pjDraftTimer); this._pjDraftTimer = null; }
    if (!this._pjDraftArmed) return false;
    sig = JSON.stringify(s.pj);
    if (this.pjDraftBlocked()) {
      // nothing is written while blocked; a draft that no longer matches an open test that holds nothing unsaved is removed (L2)
      if (!this._pjDraftProtect && sig !== this._pjDraftSig && this.pjDraftCovered() && pjTryRemove(key)) this._pjDraftSig = this._initialPjSig;
      return false;
    }
    if (sig === this._pjDraftSig) return true;
    cover = this.pjDraftCovered();
    if (cover === 'blank') ok = pjTryRemove(key);
    else {
      base = this.pjDraftBase(); now = this.pjNow();
      raw = JSON.stringify(base ? { v: 1, savedAt: now, pj: s.pj, base: base } : { v: 1, savedAt: now, pj: s.pj });
      ok = pjTryWrite(key, raw);
      if (!ok && cover === 'saved' && base) {
        // M1: never keep an older draft beside an unchanged saved record: drop it, then the whole test, else the reference
        pjTryRemove(key);
        ok = pjTryWrite(key, raw) || pjTryWrite(key, JSON.stringify({ v: 1, savedAt: now, base: base }));
        if (!ok && pjTryRemove(key)) this._pjDraftSig = this._initialPjSig; // nothing kept: the next start shows the empty test
      }
    }
    if (ok) { this._pjDraftSig = sig; this._pjDraftFailed = null; if (was === 'quota') this.pjDraftNoteSet('', ''); }
    else { this._pjDraftFailed = sig; this.pjDraftNoteSet('quota', this.PJ_DRAFT_QUOTA); }
    if (fromTimer && was !== s.pjDraftNoteKind) this.render();
    return ok;
  };
  // Start-up (DOMContentLoaded, after load(), before mount): restore the draft, then arm the writes and the flush listeners.
  App.pjDraftStart = function () {
    var self = this, key = this.PJ_DRAFT_KEY, s = this.state, snap = this._snap, raw = null, obj = null, src, ref, rec, cleaned, d, m, dirty, when, bs;
    this._pjDraftSig = JSON.stringify(s.pj);
    try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
    if (raw != null && raw !== '') {
      try { obj = JSON.parse(raw); } catch (e) { obj = null; }
      src = this.isRec(obj) && obj.v === 1 && this.isRec(obj.pj) ? obj.pj : null;
      ref = !src && this.isRec(obj) && obj.v === 1 && obj.pj === undefined && this.isRec(obj.base) && typeof obj.base.id === 'string' && obj.base.id ? obj.base : null;
      if (ref) {
        // a reference draft: the open test was exactly this saved record. Open the stored record as Open does (clean, no
        // note: nothing unsaved). If it is gone, ambiguous or not openable here, the empty test (and the key is removed).
        m = this.pjRecordMatches(ref.id);
        if (m.length === 1 && m[0].kind === 'potable-v2' && m[0].schema === 2) {
          d = this.pjHydrate(m[0]); d.id = m[0].id; this._pjModeMemo = null;
          snap.pj = JSON.stringify(d); snap.pjBacking = { id: m[0].id, record: JSON.stringify(m[0]) }; snap.pjBackingInvalid = false;
          s.pjSaved = false; s.pj = d;
          this._pjDraftSig = JSON.stringify(d);
        } else this._pjDraftSig = null;
      } else if (!src) {
        // unreadable or a shape this release does not know: never used, never touches a saved list; kept aside once
        if (this.keepAside(key, raw)) this.pjDraftNoteSet('damaged', 'Unsaved entries kept on this phone could not be read, so they were not restored. A copy was kept aside and travels in backup files.');
        else { this._pjDraftProtect = true; this.pjDraftNoteSet('protect', 'Unsaved entries kept on this phone could not be read and could not be copied aside, so autosave is paused to keep them. Save a backup file now; Save progress still works.'); }
      } else {
        // the draft has the open-test shape: lift kept unknown fields back to the top level, then clean exactly like a saved record
        rec = {};
        Object.keys(src).forEach(function (k) { if (k !== 'keep' && !PJ_NOKEYS[k]) rec[k] = src[k]; });
        if (this.isRec(src.keep)) Object.keys(src.keep).forEach(function (k) { if (PJ_KNOWN.indexOf(k) < 0 && !PJ_NOKEYS[k] && !Object.prototype.hasOwnProperty.call(rec, k)) rec[k] = src.keep[k]; });
        cleaned = this.pjCleanRecord(rec);
        if (cleaned.fixed && !this.keepAside(key, raw)) this._pjDraftProtect = true;
        d = this.pjHydrate(cleaned.rec);
        m = d.id ? this.pjRecordMatches(d.id) : [];
        delete snap.pj; delete snap.pjBacking; snap.pjBackingInvalid = false;
        if (m.length === 1 && m[0].schema === 2 && m[0].kind === 'potable-v2') {
          var saved = this.pjHydrate(m[0]); saved.id = m[0].id; d.id = m[0].id;
          snap.pj = JSON.stringify(saved); snap.pjBacking = { id: m[0].id, record: JSON.stringify(m[0]) };
          // L1: the stored record must be the version this draft was opened or last saved from; otherwise (saved since in
          // another tab, restored, or a draft without base) Save progress asks before replacing it
          bs = this.isRec(obj.base) ? obj.base : null;
          if (!bs || bs.id !== m[0].id || bs.sig !== this.pjRecordSig(snap.pjBacking.record)) snap.pjBackingInvalid = true;
        } else if (m.length > 1) snap.pj = ''; // ambiguous: keep the id; Save progress refuses until the duplicates are resolved
        else { d.id = ''; d.createdAt = ''; d.updatedAt = ''; } // deleted (or not openable here): an unsaved NEW test
        this._pjModeMemo = null;
        s.pj = d; s.pjSaved = false;
        dirty = this.pjSig() !== (typeof snap.pj === 'string' ? snap.pj : this._initialPjSig);
        when = typeof obj.savedAt === 'string' && !isNaN(Date.parse(obj.savedAt)) ? new Date(obj.savedAt).toLocaleString('en-AU') : '';
        if (dirty || cleaned.fixed) {
          this.pjDraftNoteSet(cleaned.fixed ? 'damaged' : 'restored', 'Restored your unsaved entries from ' + (when || 'an earlier session') + '.' +
            (cleaned.fixed ? (this._pjDraftProtect ? ' Some of them could not be read, and the original could not be copied aside, so autosave is paused to keep it. Save a backup file now.' : ' Some of them could not be read; a copy of the original was kept aside.') : ''));
          if (this._pjDraftProtect) s.pjDraftNoteKind = 'protect';
        }
        this._pjDraftSig = JSON.stringify(src); // what the key holds: a cleaned or id-dropped test is rewritten once armed
      }
    }
    this._pjDraftArmed = true; this._pjDraftSeen = JSON.stringify(s.pj);
    if (this._pjDraftSeen !== this._pjDraftSig) this.pjDraftSchedule();
    try {
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') self.pjDraftFlush(); });
      window.addEventListener('pagehide', function () { self.pjDraftFlush(); });
    } catch (e) {}
  };
  App.state.pj = App.pjNew();
  App._initialPjSig = App.pjSig();

  App._initialCalcSig = App.calcInputSig();
  App._initialPolySig = App.polyInputSig();
  App._initialWtSig = App.wtInputSig();
  App._initialJdSig = App.jdInputSig();
  App._initialJarsSetupSig = App.jarsSetupSig();

  // ============================================================================
  // Jar Test, Potable water v2: EXPORT. One test -> CSV (two files) or .xlsx (one file, three sheets).
  //
  // JARS CSV (one row per USED jar; UTF-8 with BOM, RFC 4180 quoting, CRLF, decimal points, ISO dates). Stable column names;
  // every dose, volume, strength and money column carries its unit and basis in its name (fix round 1, review M4):
  //   test_id, client, site, water_source, sampled_date (YYYY-MM-DD), sampled_time (HH:MM, 24 h),
  //   utc_offset (+10:00; written '+10:00 with a leading apostrophe like any text starting with + or -, so a spreadsheet keeps
  //   it as text), sampled_at (ISO 8601 with offset, empty when unknown), investigator,
  //   batch, gang_size, flash_mix_s, flash_mix_rpm, slow_mix_min, slow_mix_rpm, settle_min, filter,
  //   jar_initial_raw_sample_ml (the jar sample volume = INITIAL raw sample before any stock is added),
  //   jar (number within the batch), dose_entry_mode ("target mg/L" or "mL added": the unit the user TYPED),
  //   coagulant_label, coagulant_product, coagulant_supplied_by,
  //   coagulant_stock_strength_pct_wv (stock as made up, % w/v = g of product as supplied per 100 mL of stock; NOT the neat
  //     product's strength or its active content),
  //   coagulant_dose_mg_l_nominal (mg of product as supplied per L of INITIAL raw sample; stock volume not added),
  //   coagulant_stock_added_ml (mL of that stock added to the jar),
  //   coagulant_price_aud_per_kg (Australian dollars per kg of product as supplied),
  //   coagulant_cost_aud_per_megalitre (A$ per ML of water treated = dose mg/L x price A$/kg, because 1 mg/L = 1 kg/ML),
  //   polymer_label ... polymer_cost_aud_per_megalitre (the same eight columns for the polymer),
  //   given_to_all_product, given_to_all_dose_mg_l_nominal,
  //   one column per result parameter (PJ_PARAMS[].col): "Not tested" when that parameter is switched off, EMPTY when it is
  //   switched on but left blank, the value otherwise; jar_notes.
  //   The dose in the unit that was NOT typed is derived (mg/L = mL x S x 10000 / V and back; nominal per INITIAL raw sample)
  //   and left empty when the stock strength or jar volume is missing.
  //   Text that begins with = + - @ is written with a leading apostrophe so a spreadsheet cannot run it as a formula.
  // BASIS (PJ_BASIS_TEXT; first row of the baseline CSV / Baseline sheet, and the line under the Report's jar table):
  //   Doses are nominal mg/L of product as supplied per initial raw sample; stock strength is % w/v as made up (g of product per 100 mL of stock); cost per ML = dose (mg/L) × price ($/kg), since 1 mg/L = 1 kg/ML.
  // BASELINE CSV (long format, one row per datum): test_id, client, site, section, name, product, unit, raw, clarifier,
  //   filtered, value, time. Sections: basis (name "Dose and cost basis", value = the basis text above), parameter (11 rows,
  //   raw/clarifier/filtered), reading_time, plant_flow, plant_hours, current_chemical (name = role, product, value = dose
  //   mg/L), telemetry (name = label, value, unit, time).
  // XLSX: Report (laid out like the Gympie report), Jars (= the jars CSV rows), Baseline (= the baseline CSV rows).
  //   STORE zip with CRC-32, inline strings, no shared strings, no formulas, no macros. The Report's "Jar test number" is the
  //   jar card's test no.: it counts every jar of the earlier batches, used or not, so unused jars leave gaps.
  // ============================================================================
  App.PJ_BASIS_TEXT = 'Doses are nominal mg/L of product as supplied per initial raw sample; stock strength is % w/v as made up (g of product per 100 mL of stock); cost per ML = dose (mg/L) × price ($/kg), since 1 mg/L = 1 kg/ML.';
  App.PJ_REPORT_ORDER = ['flocTime', 'flocSize', 'settleRate', 'settledNtu', 'filteredNtu', 'colour', 'ph', 'uv254', 'resAl', 'resFe', 'alkAfter'];
  App.PJ_REPORT_HEAD = { flocTime: 'Floc form time (s)', flocSize: 'Floc size (A–G) **', settleRate: 'Floc settling rate (A–G) ***', settledNtu: 'Settled turbidity (NTU)', filteredNtu: 'Filtered turbidity (NTU) *', colour: 'Filtered colour (PtCo) *', ph: 'Supernatant pH', uv254: 'UV254 (1/cm)', resAl: 'Residual aluminium (mg/L)', resFe: 'Residual iron (mg/L)', alkAfter: 'Alkalinity after dosing (mg/L as CaCO3)' };
  App.PJ_BASE_EXPORT_NAMES = { phs: 'pHs', lsi: 'Langelier index (pH − pHs)', rsi: 'Ryznar index (2pHs − pH)' };
  App.PJ_JARS_HEADER_HEAD = ['test_id', 'client', 'site', 'water_source', 'sampled_date', 'sampled_time', 'utc_offset', 'sampled_at', 'investigator', 'batch', 'gang_size', 'flash_mix_s', 'flash_mix_rpm', 'slow_mix_min', 'slow_mix_rpm', 'settle_min', 'filter', 'jar_initial_raw_sample_ml', 'jar', 'dose_entry_mode'];
  App.PJ_JARS_HEADER_PROD = ['label', 'product', 'supplied_by', 'stock_strength_pct_wv', 'dose_mg_l_nominal', 'stock_added_ml', 'price_aud_per_kg', 'cost_aud_per_megalitre'];
  App.PJ_BASELINE_HEADER = ['test_id', 'client', 'site', 'section', 'name', 'product', 'unit', 'raw', 'clarifier', 'filtered', 'value', 'time'];

  // ---- bytes: UTF-8, CRC-32, STORE zip ----
  App.pjUtf8 = function (str) {
    var s = String(str == null ? '' : str), out = [], i, c, n;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        n = s.charCodeAt(i + 1);
        if (n >= 0xDC00 && n <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (n - 0xDC00); i++; } else c = 0xFFFD;
      } else if (c >= 0xDC00 && c <= 0xDFFF) c = 0xFFFD;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  };
  var PJ_CRC_TABLE = null;
  App.pjCrc32 = function (bytes) {
    var c, i, k, crc = 0xFFFFFFFF;
    if (!PJ_CRC_TABLE) {
      PJ_CRC_TABLE = [];
      for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); PJ_CRC_TABLE[i] = c >>> 0; }
    }
    for (i = 0; i < bytes.length; i++) crc = PJ_CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  // entries: [{ name, data: Uint8Array }]; returns a Uint8Array holding a STORE (method 0) zip with UTF-8 names.
  App.pjZipStore = function (entries, date) {
    var d = date && typeof date.getFullYear === 'function' ? date : new Date(), y = d.getFullYear(), dosDate, dosTime, local = [], central = [], offset = 0, total = 0, i, out, p;
    if (y < 1980) { dosDate = (1 << 5) | 1; dosTime = 0; }
    else { dosDate = ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(); dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1); }
    function le16(a, n) { a.push(n & 255, (n >> 8) & 255); }
    function le32(a, n) { a.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255); }
    for (i = 0; i < entries.length; i++) {
      var e = entries[i], name = this.pjUtf8(e.name), crc = this.pjCrc32(e.data), h = [], c = [];
      le32(h, 0x04034b50); le16(h, 20); le16(h, 0x0800); le16(h, 0); le16(h, dosTime); le16(h, dosDate); le32(h, crc); le32(h, e.data.length); le32(h, e.data.length); le16(h, name.length); le16(h, 0);
      le32(c, 0x02014b50); le16(c, 20); le16(c, 20); le16(c, 0x0800); le16(c, 0); le16(c, dosTime); le16(c, dosDate); le32(c, crc); le32(c, e.data.length); le32(c, e.data.length); le16(c, name.length); le16(c, 0); le16(c, 0); le16(c, 0); le16(c, 0); le32(c, 0); le32(c, offset);
      local.push({ head: h, name: name, data: e.data }); central.push({ head: c, name: name });
      offset += h.length + name.length + e.data.length;
    }
    var cdSize = 0; for (i = 0; i < central.length; i++) cdSize += central[i].head.length + central[i].name.length;
    var end = []; le32(end, 0x06054b50); le16(end, 0); le16(end, 0); le16(end, entries.length); le16(end, entries.length); le32(end, cdSize); le32(end, offset); le16(end, 0);
    total = offset + cdSize + end.length; out = new Uint8Array(total); p = 0;
    function put(arr) { var k; for (k = 0; k < arr.length; k++) out[p++] = arr[k]; }
    for (i = 0; i < local.length; i++) { put(local[i].head); put(local[i].name); put(local[i].data); }
    for (i = 0; i < central.length; i++) { put(central[i].head); put(central[i].name); }
    put(end);
    return out;
  };

  // ---- text cleaning, CSV ----
  // Lone surrogates -> U+FFFD; control characters other than tab, LF and CR are dropped (they cannot live in XML or a CSV).
  App.pjClean = function (s) {
    s = String(s == null ? '' : s);
    var out = '', i, c, n;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) { n = s.charCodeAt(i + 1); if (n >= 0xDC00 && n <= 0xDFFF) { out += s.charAt(i) + s.charAt(i + 1); i++; } else out += '\uFFFD'; continue; }
      if (c >= 0xDC00 && c <= 0xDFFF) { out += '\uFFFD'; continue; }
      if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 0xFFFE || c === 0xFFFF) continue;
      out += s.charAt(i);
    }
    return out;
  };
  App.pjCsvCell = function (cell) {
    var t;
    if (cell === null || cell === undefined || cell === '') return '';
    if (typeof cell === 'object') { if (cell.x === undefined) return String(cell.n); t = this.pjClean(cell.x); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; } // {n} plain number, {x} validated text that must stay verbatim
    t = this.pjClean(cell);
    if (/^[=+\-@\t\r]/.test(t)) t = '\'' + t;
    if (/[",\r\n]/.test(t) || /^\s|\s$/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
    return t;
  };
  App.pjCsvText = function (header, rows) {
    var self = this, lines = [header.map(function (h) { return self.pjCsvCell(h); }).join(',')];
    rows.forEach(function (r) { lines.push(r.map(function (c) { return self.pjCsvCell(c); }).join(',')); });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  };
  // a plain decimal typed by the user -> { n: canonical text } (so the file shows what was typed, no float noise); else the text itself
  App.pjNumCell = function (s) {
    var t = String(s == null ? '' : s).trim(), neg, body;
    if (t === '') return '';
    if (this.pjParseDec(t, { signed: true }).s !== 'ok') return t;
    neg = t.charAt(0) === '-'; body = neg ? t.slice(1) : t;
    if (body.charAt(0) === '.') body = '0' + body;
    body = body.replace(/^0+(?=\d)/, '');
    return { n: (neg ? '-' : '') + body };
  };
  App.pjCalcCell = function (n) { return isFinite(n) ? { n: this.pjDoseText(n) } : ''; };
  App.pjPartyLabel = function (v) { var p = this.PJ_PARTY.filter(function (x) { return x.v === v; })[0]; return p ? p.label : ''; };

  // ---- the two tables ----
  App.pjJarsHeader = function () {
    var h = this.PJ_JARS_HEADER_HEAD.slice();
    ['coagulant', 'polymer'].forEach(function (w) { App.PJ_JARS_HEADER_PROD.forEach(function (c) { h.push(w + '_' + c); }); });
    h.push('given_to_all_product', 'given_to_all_dose_mg_l_nominal');
    this.PJ_PARAMS.forEach(function (p) { h.push(p.col); });
    h.push('jar_notes');
    return h;
  };
  // [{ batch, jar, seq, cells: [...] , row: { coag: {...}, poly: {...} } }] for every USED jar
  App.pjJarRows = function (d, meta) {
    var self = this, rows = [], obs = this.pjObservation(d.site), seq = 0, before = 0;
    d.batches.forEach(function (b, bi) {
      var first = before; before += b.jars.length;
      b.jars.forEach(function (j, ji) {
        if (!self.pjJarUsed(d, b, j)) return;
        seq++;
        // utc_offset is plain text here, so the CSV neutralises its leading + / - like any other text (review L5)
        var cells = [meta.id, meta.client, d.site.name, d.site.source, d.site.date, d.site.time, d.site.offset, obs.observedAt || '', d.site.investigator,
          bi + 1, b.gang, self.pjNumCell(b.flashS), self.pjNumCell(b.flashRpm), self.pjNumCell(b.slowMin), self.pjNumCell(b.slowRpm), self.pjNumCell(b.settleMin), b.filter, self.pjNumCell(b.volMl), ji + 1, d.doseMode === 'ml' ? 'mL added' : 'target mg/L'];
        cells[9] = { n: String(bi + 1) }; cells[10] = { n: String(b.gang) }; cells[18] = { n: String(ji + 1) };
        var prods = {};
        ['coag', 'poly'].forEach(function (w) {
          var pid = w === 'poly' ? j.poly : j.coag, typed = w === 'poly' ? j.polyDose : j.coagDose, p = self.pjFindProduct(d, pid), r = self.pjJarDose(d, b, j, w), mg = '', ml = '', cost = '', mgNum = NaN;
          if (!p && !String(typed).trim()) { prods[w] = { mg: NaN, price: '' }; cells.push('', '', '', '', '', '', '', ''); return; }
          // the cost is the EXACT decimal product of the SAME mg/L text and price text this row exports (review fix1 N3, fix2
          // N14): cost cell = mg/L cell x price cell, digit for digit. Target mode uses the typed mg/L text.
          if (d.doseMode === 'ml') { ml = self.pjNumCell(typed); if (r.state === 'ok' && isFinite(r.mgL)) { mg = self.pjCalcCell(r.mgL); mgNum = Number(mg.n); } }
          else { mg = self.pjNumCell(typed); mgNum = self.parseNum(typed); if (r.state === 'ok' && isFinite(r.ml)) ml = self.pjCalcCell(r.ml); }
          var price = p ? self.pjParseDec(p.price) : { s: 'empty' }, priceCell = p ? self.pjNumCell(p.price) : '';
          if (price.s === 'ok' && isFinite(mgNum) && mg && typeof mg === 'object' && priceCell && typeof priceCell === 'object') { var cst = self.pjExactProduct(mg.n, priceCell.n); if (cst !== null) cost = { n: cst }; }
          prods[w] = { mg: mgNum, price: p ? p.price : '', cost: cost };
          cells.push(p ? p.label : '', p ? p.name : '', p ? self.pjPartyLabel(p.party) : '', p ? self.pjNumCell(p.stockPct) : '', mg, ml, priceCell, cost);
        });
        cells.push(d.aid.name, self.pjNumCell(d.aid.dose));
        self.PJ_PARAMS.forEach(function (p) {
          if (!d.params[p.k]) { cells.push('Not tested'); return; }
          var raw = j.r[p.k];
          if (p.kind === 'grade') { var g = self.pjParseGrade(raw); cells.push(g.s === 'ok' ? g.v : String(raw == null ? '' : raw).trim()); } else cells.push(self.pjNumCell(raw));
        });
        cells.push(j.notes);
        // testNo = the jar card's "test no." (every jar of the earlier batches counts, used or not)
        rows.push({ batch: bi + 1, jar: ji + 1, seq: seq, testNo: first + ji + 1, b: b, j: j, cells: cells, prods: prods });
      });
    });
    return rows;
  };
  App.pjBaselineRows = function (d, meta) {
    var self = this, rows = [];
    function row(section, name, product, unit, raw, clar, filt, value, time) { rows.push([meta.id, meta.client, d.site.name, section, name, product, unit, raw, clar, filt, value, time]); }
    row('basis', 'Dose and cost basis', '', '', '', '', '', this.PJ_BASIS_TEXT, '');
    this.PJ_BASE_ROWS.forEach(function (r) {
      row('parameter', self.PJ_BASE_EXPORT_NAMES[r.k] || r.label, '', r.unit, self.pjNumCell(d.base.cols.raw.v[r.k]), self.pjNumCell(d.base.cols.clarifier.v[r.k]), self.pjNumCell(d.base.cols.filtered.v[r.k]), '', '');
    });
    row('reading_time', 'Reading time (24 h)', '', '', d.base.cols.raw.time, d.base.cols.clarifier.time, d.base.cols.filtered.time, '', '');
    row('plant_flow', 'Plant flow', '', d.plant.flowUnit ? this.flowLabel(d.plant.flowUnit) : '', '', '', '', self.pjNumCell(d.plant.flow), '');
    row('plant_hours', 'Plant hours per day', '', 'h/day', '', '', '', self.pjNumCell(d.plant.hours), '');
    d.plant.chems.forEach(function (c) { row('current_chemical', c.role, c.product, 'mg/L', '', '', '', self.pjNumCell(c.dose), ''); });
    d.telemetry.forEach(function (t) { row('telemetry', t.label, '', t.unit, '', '', '', self.pjNumCell(t.value), t.time); });
    return rows;
  };

  // ---- xlsx writer (OOXML, inline strings, STORE zip) ----
  App.pjXmlText = function (s) {
    return this.pjClean(s).replace(/\r\n?/g, '\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  function pjColName(n) { var s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; }
  function PjSheet(widths) { this.cells = {}; this.maxR = 1; this.maxC = 1; this.widths = widths || []; this.freeze = false; }
  PjSheet.prototype.put = function (r, c, v, style) {
    if ((v === '' || v === null || v === undefined) && !style) return;
    this.cells[r + ':' + c] = { r: r, c: c, v: (v === null || v === undefined) ? '' : v, s: style || 0 };
    if (r > this.maxR) this.maxR = r; if (c > this.maxC) this.maxC = c;
  };
  PjSheet.prototype.xml = function (selected) {
    var self = this, byRow = {}, keys = Object.keys(this.cells), rows, xml, i;
    keys.forEach(function (k) { var c = self.cells[k]; (byRow[c.r] = byRow[c.r] || []).push(c); });
    rows = Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; });
    xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1' + (this.maxR > 1 || this.maxC > 1 ? ':' + pjColName(this.maxC) + this.maxR : '') + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"' + (selected ? ' tabSelected="1"' : '') + '>' + (this.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '') + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>';
    if (this.widths.length) xml += '<cols>' + this.widths.map(function (w) { return '<col min="' + w[0] + '" max="' + w[1] + '" width="' + w[2] + '" customWidth="1"/>'; }).join('') + '</cols>';
    xml += '<sheetData>';
    for (i = 0; i < rows.length; i++) {
      var cs = byRow[rows[i]].sort(function (a, b) { return a.c - b.c; });
      xml += '<row r="' + rows[i] + '">' + cs.map(function (c) {
        var ref = pjColName(c.c) + c.r, st = c.s ? ' s="' + c.s + '"' : '';
        if (c.v === '') return '<c r="' + ref + '"' + st + '/>';
        if (typeof c.v === 'object' && c.v.x !== undefined) c.v = c.v.x;
        else if (typeof c.v === 'object') return '<c r="' + ref + '"' + st + '><v>' + c.v.n + '</v></c>';
        if (typeof c.v === 'number') return isFinite(c.v) ? '<c r="' + ref + '"' + st + '><v>' + App.decimalText(c.v) + '</v></c>' : '<c r="' + ref + '"' + st + '/>';
        return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + App.pjXmlText(c.v) + '</t></is></c>';
      }).join('') + '</row>';
    }
    return xml + '</sheetData><pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
  };
  // style ids: 0 normal, 1 bold, 2 title, 3 header (bold, grey, border, wrapped), 4 border, 5 border + $0.00, 6 wrapped text
  var PJ_STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6E2"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  App.pjTableSheet = function (header, rows, widths) {
    var S = new PjSheet(widths), r, c, v;
    header.forEach(function (h, i) { S.put(1, i + 1, h, 3); });
    rows.forEach(function (row, ri) {
      for (c = 0; c < row.length; c++) {
        v = row[c];
        if (v === '' || v === null || v === undefined) continue;
        S.put(ri + 2, c + 1, v, 0);
      }
    });
    S.freeze = true;
    return S;
  };
  // The Report sheet, laid out like the Gympie report.
  App.pjReportSheet = function (d, meta, jarRows) {
    var self = this, S = new PjSheet([[1, 1, 26], [2, 14, 14], [15, 20, 14]]), r, i, k, flowM3h = NaN, fl = self.pjParseDec(d.plant.flow), left, right;
    function put(rr, cc, v, st) { S.put(rr, cc, v, st); }
    function nc(s) { return self.pjNumCell(s); }
    put(1, 1, 'LABORATORY REPORT', 2);
    put(3, 1, 'Investigation done by'); put(3, 4, d.site.investigator);
    put(4, 1, 'Date'); put(4, 4, d.site.date);
    put(6, 1, 'JAR TESTING OF RAW WATER - COAGULANTS', 1);
    put(8, 1, 'CUSTOMER SITE:', 1); put(8, 4, d.site.name);
    put(9, 1, 'CLIENT:', 1); put(9, 4, meta.client);
    put(10, 1, 'WATER SOURCE:', 1); put(10, 4, d.site.source);
    put(11, 1, 'DATE SAMPLED:', 1); put(11, 4, d.site.date); put(11, 5, (d.site.time + ' ' + d.site.offset).replace(/^\s+|\s+$/g, ''));
    put(8, 10, 'CURRENT PLANT PARAMETERS:', 1);
    put(9, 10, 'Parameter', 3); put(9, 11, '', 3); put(9, 12, 'Raw', 3); put(9, 13, 'Clarifier', 3); put(9, 14, 'Filtered', 3);
    this.PJ_BASE_ROWS.forEach(function (br, bi) {
      var rr = 10 + bi, name = self.PJ_BASE_EXPORT_NAMES[br.k] || br.label;
      put(rr, 10, name + (br.unit ? ' (' + br.unit + ')' : ''), 4); put(rr, 11, '', 4);
      put(rr, 12, nc(d.base.cols.raw.v[br.k]), 4); put(rr, 13, nc(d.base.cols.clarifier.v[br.k]), 4); put(rr, 14, nc(d.base.cols.filtered.v[br.k]), 4);
    });
    right = 10 + this.PJ_BASE_ROWS.length;
    put(right, 10, 'Reading time (24 h)', 4); put(right, 11, '', 4); put(right, 12, d.base.cols.raw.time, 4); put(right, 13, d.base.cols.clarifier.time, 4); put(right, 14, d.base.cols.filtered.time, 4);
    right++;
    put(13, 1, 'CURRENT PLANT OPERATION:', 1);
    put(14, 1, 'Water treated');
    if (fl.s === 'ok' && isFinite(this.flowFactor(d.plant.flowUnit))) flowM3h = fl.v * this.flowFactor(d.plant.flowUnit);
    put(15, 1, 'Daily (ML/d)'); put(15, 4, isFinite(flowM3h) ? { n: this.decimalText(Number((flowM3h * 24 / 1000).toPrecision(10))) } : '');
    put(16, 1, 'L / sec'); put(16, 4, isFinite(flowM3h) ? { n: this.decimalText(Number((flowM3h / 3.6).toPrecision(10))) } : '');
    put(17, 1, 'hrs/day'); put(17, 4, nc(d.plant.hours));
    r = 19; put(r, 1, 'Chemical application', 3); put(r, 4, 'Product', 3); put(r, 7, 'Dose rate (mg/L)', 3);
    d.plant.chems.forEach(function (c) { r++; put(r, 1, c.role, 4); put(r, 4, c.product, 4); put(r, 7, nc(c.dose), 4); });
    if (d.telemetry.length) {
      r += 2; put(r, 1, 'Extra telemetry readings', 3); put(r, 4, 'Value', 3); put(r, 5, 'Unit', 3); put(r, 6, 'Time (24 h)', 3);
      d.telemetry.forEach(function (t) { r++; put(r, 1, t.label, 4); put(r, 4, nc(t.value), 4); put(r, 5, t.unit, 4); put(r, 6, t.time, 4); });
    }
    left = r;
    r = Math.max(left, right) + 2;
    put(r, 1, 'MIXING / EXPERIMENTAL CONDITIONS', 1); r++;
    d.batches.forEach(function (b, bi) {
      var lines = [];
      if (String(b.flashS).trim() || String(b.flashRpm).trim()) lines.push((String(b.flashS).trim() ? b.flashS.trim() + ' sec. ' : '') + 'flash mixing' + (String(b.flashRpm).trim() ? ' @ ' + b.flashRpm.trim() + ' rpm' : ''));
      if (String(b.slowMin).trim() || String(b.slowRpm).trim()) lines.push((String(b.slowMin).trim() ? b.slowMin.trim() + ' min. ' : '') + 'conditioning' + (String(b.slowRpm).trim() ? ' @ ' + b.slowRpm.trim() + ' rpm' : ''));
      if (String(b.settleMin).trim()) lines.push(b.settleMin.trim() + ' min. settling');
      if (!lines.length && d.batches.length === 1) return;
      if (d.batches.length > 1 || lines.length) { put(r, 1, 'Batch ' + (bi + 1) + ' (' + b.jars.length + ' jars' + (String(b.volMl).trim() ? ', ' + b.volMl.trim() + ' mL raw sample each' : '') + ')', 1); r++; }
      lines.forEach(function (t) { put(r, 1, t); r++; });
    });
    put(r, 1, d.params.filteredNtu || d.params.colour ? 'Measure supernatant and filtered parameters' : 'Measure supernatant parameters'); r += 2;
    // jar table
    var params = this.PJ_REPORT_ORDER.filter(function (k) { return d.params[k]; }), nProd = d.products.length, pc0 = 3, par0 = pc0 + nProd, notesCol = par0 + params.length;
    put(r, 1, 'Jar test number', 3); put(r + 1, 1, '', 3); put(r, 2, 'Batch / jar', 3); put(r + 1, 2, '', 3);
    for (i = 0; i < nProd; i++) { put(r, pc0 + i, i === 0 ? 'Product dosages (mg/L)' : '', 3); put(r + 1, pc0 + i, d.products[i].name || d.products[i].label, 3); }
    params.forEach(function (k, pi) { put(r, par0 + pi, self.PJ_REPORT_HEAD[k], 3); put(r + 1, par0 + pi, '', 3); });
    put(r, notesCol, 'Notes', 3); put(r + 1, notesCol, '', 3);
    r += 2;
    jarRows.forEach(function (jr) {
      put(r, 1, jr.testNo, 4); put(r, 2, jr.batch + '.' + jr.jar, 4);
      d.products.forEach(function (p, pi) {
        var w = jr.j.coag === p.id ? 'coag' : (jr.j.poly === p.id ? 'poly' : ''), v = '';
        if (w && isFinite(jr.prods[w].mg)) v = { n: self.pjDoseText(jr.prods[w].mg) };
        put(r, pc0 + pi, v, 4);
      });
      params.forEach(function (k, pi) {
        var p = self.PJ_PARAMS.filter(function (x) { return x.k === k; })[0], raw = jr.j.r[k], v = '';
        if (p.kind === 'grade') { var g = self.pjParseGrade(raw); v = g.s === 'ok' ? g.v : ''; } else v = nc(raw);
        put(r, par0 + pi, v, 4);
      });
      put(r, notesCol, jr.j.notes, 4);
      r++;
    });
    // units and basis directly under the jar table (review M4)
    put(r, 1, this.PJ_BASIS_TEXT); r++;
    r++;
    put(r, 1, 'Notes :', 1); r++;
    var seen = {}, filters = [];
    d.batches.forEach(function (b, bi) { var f = String(b.filter).trim(); if (f && !seen[f]) { seen[f] = 1; filters.push({ f: f, b: bi + 1 }); } });
    filters.forEach(function (x) { put(r, 1, '* Supernatant filtered with: ' + x.f + (filters.length > 1 ? ' (batch ' + x.b + (d.batches.length > 1 ? ' onward' : '') + ')' : '')); r++; });
    if (String(d.aid.name).trim() || String(d.aid.dose).trim()) { put(r, 1, 'All samples were given an additional ' + (String(d.aid.dose).trim() ? d.aid.dose.trim() + ' mg/L of ' : '') + (String(d.aid.name).trim() || 'the given-to-all aid')); r++; }
    jarRows.forEach(function (jr) { if (String(jr.j.notes).trim()) { put(r, 1, 'Jar test ' + jr.testNo + ' (batch ' + jr.batch + ', jar ' + jr.jar + '): ' + jr.j.notes.trim()); r++; } });
    r++;
    put(r, 1, '** Floc Sizes :', 1); put(r, 7, '*** Settling Rate :', 1); r++;
    var sizes = [['G', 'V. large'], ['F', 'Large'], ['E', 'Medium'], ['D', 'V. good'], ['C', 'Fair'], ['B', 'Small'], ['A', 'Pin']], rates = [['A', 'Excellent'], ['B', 'Quick'], ['C', 'Fast'], ['D', 'Medium'], ['E', 'Slow'], ['F', 'V. slow'], ['G', 'U. slow']];
    for (i = 0; i < 7; i++) { put(r, 1, sizes[i][0], 4); put(r, 2, sizes[i][1], 4); put(r, 7, rates[i][0], 4); put(r, 8, rates[i][1], 4); r++; }
    r++; put(r, 1, 'An additional "+" or "-" means better or worse than the given symbol.'); r += 2;
    put(r, 1, 'Product Description :', 1); r++;
    put(r, 1, 'Product', 3); put(r, 3, 'Description', 3); put(r, 6, 'Role', 3); put(r, 7, 'Stock strength (% w/v as made up)', 3); put(r, 9, 'Supplied by', 3); r++;
    d.products.forEach(function (p) { put(r, 1, p.name || p.label, 4); put(r, 3, p.desc, 4); put(r, 6, p.role, 4); put(r, 7, nc(p.stockPct), 4); put(r, 9, self.pjPartyLabel(p.party), 4); r++; });
    r++;
    put(r, 1, 'Treatment Results :', 1); r++;
    put(r, 1, 'Product Name', 3); put(r, 3, 'Optimum dose rate (mg/L)', 3); put(r, 5, 'Filtered turbidity at that dose (NTU)', 3); put(r, 7, 'Filtered colour at that dose (PtCo)', 3); put(r, 9, 'Treatment cost per ML ($)', 3); put(r, 11, 'Assumed product price ($/kg)', 3); put(r, 13, 'Rating overall', 3); r++;
    d.products.forEach(function (p) {
      var sr = d.summary.rows[p.id] || {}, any = ['optDose', 'filtNtu', 'colour', 'rating'].some(function (k) { return String(sr[k] == null ? '' : sr[k]).trim() !== ''; }) || String(p.price).trim() !== '';
      if (!any) return;
      var cost = self.pjExactProduct(sr.optDose, p.price);
      put(r, 1, p.name || p.label, 4); put(r, 3, nc(sr.optDose), 4); put(r, 5, nc(sr.filtNtu), 4); put(r, 7, nc(sr.colour), 4);
      // the exact product of the dose and price cells (review fix2 N14); Excel's $0.00 display then rounds the same value the
      // Summary screen rounds half up
      put(r, 9, cost !== null ? { n: cost } : '', 5); put(r, 11, nc(p.price), 4); put(r, 13, nc(sr.rating), 4); r++;
    });
    r++;
    if (String(d.summary.comments).trim()) { put(r, 1, 'Comments :', 1); r++; String(d.summary.comments).replace(/\r\n?/g, '\n').split('\n').forEach(function (line) { put(r, 1, line); r++; }); }
    return S;
  };

  App.pjXlsxBytes = function (d, meta, now) {
    var self = this, jarRows = this.pjJarRows(d, meta), header = this.pjJarsHeader(), bh = this.PJ_BASELINE_HEADER, i, widths = [[1, header.length, 16]];
   
    var report = this.pjReportSheet(d, meta, jarRows), jars = this.pjTableSheet(header, jarRows.map(function (x) { return x.cells; }), widths), base = this.pjTableSheet(bh, this.pjBaselineRows(d, meta), [[1, 3, 16], [4, 4, 18], [5, 5, 30], [6, 12, 16]]);
    var NS = 'http://schemas.openxmlformats.org/', HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    var types = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      [1, 2, 3].map(function (n) { return '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    var rels = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var wb = HEAD + '<workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>' +
      '<sheet name="Report" sheetId="1" r:id="rId1"/><sheet name="Jars" sheetId="2" r:id="rId2"/><sheet name="Baseline" sheetId="3" r:id="rId3"/></sheets></workbook>';
    var wrels = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      [1, 2, 3].map(function (n) { return '<Relationship Id="rId' + n + '" Type="' + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>'; }).join('') +
      '<Relationship Id="rId4" Type="' + NS + 'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    var parts = [['[Content_Types].xml', types], ['_rels/.rels', rels], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wrels], ['xl/styles.xml', PJ_STYLES_XML], ['xl/worksheets/sheet1.xml', report.xml(true)], ['xl/worksheets/sheet2.xml', jars.xml(false)], ['xl/worksheets/sheet3.xml', base.xml(false)]];
    return this.pjZipStore(parts.map(function (p) { return { name: p[0], data: self.pjUtf8(p[1]) }; }), now);
  };

  // ---- files ----
  App.pjSlug = function (s, max, fallback) {
    var t = String(s == null ? '' : s);
    if (typeof t.normalize === 'function') t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (t.length > max) t = t.slice(0, max).replace(/-+$/g, '');
    return t || fallback;
  };
  App.pjExportBase = function (d, id, now) {
    var n = now && typeof now.getFullYear === 'function' ? now : new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    return 'jar-test-' + n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate()) + '-' + this.pjSlug(d.site.name, 40, 'unnamed-site') + '-' + this.pjSlug(id, 40, 'unsaved');
  };
  // d: a draft-shaped test; opts: { id, now, clientName }. Refuses while any entry is invalid (saving never blocks).
  App.pjExportFiles = function (fmt, d, opts) {
    opts = opts || {};
    var issues, meta, base, client = '', c, jarRows, header, jarsText, baseText, now = opts.now && typeof opts.now.getFullYear === 'function' ? opts.now : new Date();
    if (fmt !== 'csv' && fmt !== 'xlsx') return { ok: false, error: 'That is not a known export format, so nothing was exported.' };
    issues = this.pjIssues(d);
    if (issues.length) return { ok: false, error: issues.length + ' entr' + (issues.length === 1 ? 'y needs' : 'ies need') + ' fixing before export (shown in red in its section). Saving is not affected.' };
    c = d.clientId ? this.state.clients.filter(function (x) { return x.id === d.clientId; }) : [];
    client = c.length === 1 ? c[0].name : (opts.clientName || '');
    meta = { id: opts.id || 'unsaved', client: client };
    base = this.pjExportBase(d, opts.id, now);
    header = this.pjJarsHeader();
    jarRows = this.pjJarRows(d, meta);
    jarsText = this.pjCsvText(header, jarRows.map(function (x) { return x.cells; }));
    if (fmt === 'csv') {
      baseText = this.pjCsvText(this.PJ_BASELINE_HEADER, this.pjBaselineRows(d, meta));
      return { ok: true, files: [{ name: base + '-jars.csv', mime: 'text/csv;charset=utf-8', text: jarsText }, { name: base + '-baseline.csv', mime: 'text/csv;charset=utf-8', text: baseText }],
        fallbackText: base + '-jars.csv\n' + jarsText + '\n' + base + '-baseline.csv\n' + baseText };
    }
    return { ok: true, files: [{ name: base + '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: this.pjXlsxBytes(d, meta, now) }], fallbackText: base + '-jars.csv\n' + jarsText };
  };
  App.pjExportFilesForRecord = function (fmt, id, opts) {
    var m = this.pjRecordMatches(id), rec, d;
    if (m.length !== 1) return { ok: false, error: 'That saved test is missing or its identity is ambiguous, so nothing was exported. Saved records are unchanged.' };
    rec = m[0];
    if (typeof rec.schema === 'number' && rec.schema > 2) return { ok: false, error: 'That test was saved by a newer version of the app. Update the app to export it; the saved record is unchanged.' };
    if (rec.schema !== 2 || rec.kind !== 'potable-v2') return { ok: false, error: 'That record is not a multi-product jar test, so it was not exported.' };
    d = this.pjHydrate(rec); d.id = rec.id;
    return this.pjExportFiles(fmt, d, { id: rec.id, now: opts && opts.now, clientName: typeof rec.clientName === 'string' ? rec.clientName : '' });
  };
  // Delivery: share files (files ONLY) -> download links -> the text. Success is claimed only when the browser reports it.
  App.pjDeliver = function (r, fmt) {
    var files = r.files, names = files.map(function (f) { return f.name; }).join(' and '), made = null, fallback = r.fallbackText;
    var note = fmt === 'xlsx' ? ' An Excel file cannot be shown as text, so the jar table is given below as CSV text.' : '';
    function part(f) { return f.text !== undefined ? f.text : f.bytes; }
    function download() {
      try {
        files.forEach(function (f) {
          var url = URL.createObjectURL(new Blob([part(f)], { type: f.mime })), a = document.createElement('a');
          a.href = url; a.download = f.name; a.rel = 'noopener';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        });
        // a download cannot be confirmed from the page: say it started, and offer the text
        App.setState({ pjExportMsg: 'Download started as ' + names + '. If no file appeared (Downloads / Files app), copy the text below instead.' + note, pjExportText: fallback });
      } catch (e) { App.setState({ pjExportMsg: 'This phone blocked the file. Copy the text below instead.' + note, pjExportText: fallback }); }
    }
    App.setState({ pjExportMsg: '', pjExportText: '' });
    try {
      if (typeof File === 'function') made = files.map(function (f) { return new File([part(f)], f.name, { type: f.mime }); });
      if (made && typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: made })) {
        // files only: iOS adds a title/text as an extra .txt next to a shared file
        navigator.share({ files: made }).then(function () {
          App.setState({ pjExportMsg: 'Shared ' + names + '. If you picked “Save to Files”, it is in the Files app.', pjExportText: '' });
        }, function (err) {
          if (err && err.name === 'AbortError') App.setState({ pjExportMsg: 'Export cancelled. Nothing was sent or saved.', pjExportText: '' });
          else download();
        });
        return;
      }
    } catch (e) {}
    download();
  };

  // ============================ HANDLERS =====================================
  var H = {
    goHome: function () { App.setState({ screen: 'home', productId: null }); },
    goProducts: function () { App.setState({ screen: 'products', productId: null }); },
    goCalc: function () { App.setState({ screen: 'calc' }); },
    goJars: function () { App.setState({ screen: 'jars' }); },
    goPumps: function () { App.setState({ screen: 'pumps' }); },
    goClients: function () { App.setState({ screen: 'clients' }); },
    goCalculator: function () { App.setState({ screen: 'calculator' }); },

    // Calculator (polymer dose solver): pump rows start at one, cap at 20, never fewer than one.
    addPcPump: function () {
      var rows = App.state.pcPumps;
      if (rows.length >= App.PC_MAX_PUMPS) { App.setState({ pcPumpMsg: 'Maximum of 20 pumps reached — remove a row before adding another.' }); return; }
      App._focusKey = 'pcPump-' + rows.length;
      App.setState({ pcPumps: rows.concat([{ flow: '', status: 'running' }]), pcPumpMsg: '' });
    },
    removePcPump: function (el) {
      var rows = App.state.pcPumps, i = +el.dataset.i;
      if (rows.length <= 1 || !(i >= 0 && i < rows.length)) return;
      App.setState({ pcPumps: rows.slice(0, i).concat(rows.slice(i + 1)), pcPumpMsg: '' });
    },
    onPcPump: function (el) {
      var rows = App.state.pcPumps.slice(), i = +el.dataset.i;
      if (!(i >= 0 && i < rows.length)) return;
      rows[i] = { flow: el.value, status: rows[i].status };
      App.setState({ pcPumps: rows });
    },
    onPcPumpStatus: function (el) {
      var rows = App.state.pcPumps.slice(), i = +el.dataset.i;
      if (!(i >= 0 && i < rows.length)) return;
      rows[i] = { flow: rows[i].flow, status: el.value };
      App.setState({ pcPumps: rows });
    },
    onPcSg: function (el) { App.setState({ pcSg: el.value, pcSgEntered: true }); },
    togglePcAdvanced: function () { App.setState({ pcShowAdvanced: !App.state.pcShowAdvanced }); },
    togglePcWorking: function () { App.setState({ pcShowWorking: !App.state.pcShowWorking }); },
    // Toggle one plain-notice disclosure; focus stays on its button so keyboard users can collapse it again.
    toggleNotice: function (el) {
      var key = el.getAttribute('data-notice'), cur = App.state.noticeOpen || {}, next = {};
      for (var k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) next[k] = cur[k]; }
      next[key] = !(Object.prototype.hasOwnProperty.call(cur, key) && cur[key] === true);
      App.setState({ noticeOpen: next });
      var btns = App.$screen ? App.$screen.querySelectorAll('[data-notice]') : [];
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-notice') === key) { try { btns[i].focus({ preventScroll: true }); } catch (e) {} break; }
      }
    },
    // Share / copy the results text: the same fallback chain as backups (share -> clipboard -> visible text).
    // Success is claimed only when the browser reports it; a cancelled share sends nothing.
    sharePcResults: function () {
      var text = App.polyShareText(App.computePoly(), App.polyInputs(), App._build);
      try {
        if (navigator.share && (!navigator.canShare || navigator.canShare({ text: text }))) {
          navigator.share({ text: text }).then(function () {
            App.setState({ pcShareMsg: 'Results shared.', pcShareText: '' });
          }, function (err) {
            if (err && err.name === 'AbortError') App.setState({ pcShareMsg: 'Share cancelled. Nothing was sent.', pcShareText: '' });
            else App.H.copyPcResults();
          });
          return;
        }
      } catch (e) {}
      App.H.copyPcResults();
    },
    copyPcResults: function () {
      var text = App.polyShareText(App.computePoly(), App.polyInputs(), App._build);
      var manual = function () { App.setState({ pcShareMsg: 'Select all the text below and copy it.', pcShareText: text }); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { App.setState({ pcShareMsg: 'Results copied. Paste them into a message or report.', pcShareText: '' }); }, manual);
          return;
        }
      } catch (e) {}
      manual();
    },
    dismissPcShareText: function () { App.setState({ pcShareText: '', pcShareMsg: '' }); },

    // Calculator mode selector: each mode keeps its own in-memory draft; switching never mixes outputs.
    onCcSludge: function () { App.setState({ ccMode: 'sludge' }); },
    // Jar Test mode switch (each mode keeps its own draft) and the sludge jar's own controls
    onJarModeSludge: function () { App.setState({ jarMode: 'sludge' }); },
    onJarModePotable: function () { App.setState({ jarMode: 'potable' }); },
    onJdSg: function (el) { App.setState({ jdSg: el.value, jdSgEntered: true }); },
    toggleJdWorking: function () { App.setState({ jdShowWorking: !App.state.jdShowWorking }); },
    onCcWater: function () { App.setState({ ccMode: 'water' }); },
    // Water treatment dose: the same pump-list rules as the sludge mode, on its own state.
    addWtPump: function () {
      var rows = App.state.wtPumps;
      if (rows.length >= App.PC_MAX_PUMPS) { App.setState({ wtPumpMsg: 'Maximum of 20 pumps reached — remove a row before adding another.' }); return; }
      App._focusKey = 'wtPump-' + rows.length;
      App.setState({ wtPumps: rows.concat([{ flow: '', status: 'running' }]), wtPumpMsg: '' });
    },
    removeWtPump: function (el) {
      var rows = App.state.wtPumps, i = +el.dataset.i;
      if (rows.length <= 1 || !(i >= 0 && i < rows.length)) return;
      App.setState({ wtPumps: rows.slice(0, i).concat(rows.slice(i + 1)), wtPumpMsg: '' });
    },
    onWtPump: function (el) {
      var rows = App.state.wtPumps.slice(), i = +el.dataset.i;
      if (!(i >= 0 && i < rows.length)) return;
      rows[i] = { flow: el.value, status: rows[i].status };
      App.setState({ wtPumps: rows });
    },
    onWtPumpStatus: function (el) {
      var rows = App.state.wtPumps.slice(), i = +el.dataset.i;
      if (!(i >= 0 && i < rows.length)) return;
      rows[i] = { flow: rows[i].flow, status: el.value };
      App.setState({ wtPumps: rows });
    },
    // Typing a density makes it an entered value; a library density is taken only from a confirmed product.
    onWtDensity: function (el) { App.setState({ wtDensity: el.value, wtDensitySource: '' }); },
    onWtDensitySource: function (el) {
      var id = String(el.value || ''), p = id ? App.waterDensityChoices().filter(function (x) { return x.id === id; })[0] : null;
      if (!p) { App.setState({ wtDensitySource: '' }); return; }
      App.setState({ wtDensitySource: p.id, wtDensity: String(p.density) });
    },
    toggleWtAdvanced: function () { App.setState({ wtShowAdvanced: !App.state.wtShowAdvanced }); },
    toggleWtWorking: function () { App.setState({ wtShowWorking: !App.state.wtShowWorking }); },
    shareWtResults: function () {
      var text = App.waterShareText(App.computeWater(), App.waterInputs(), App._build);
      try {
        if (navigator.share && (!navigator.canShare || navigator.canShare({ text: text }))) {
          navigator.share({ text: text }).then(function () {
            App.setState({ wtShareMsg: 'Results shared.', wtShareText: '' });
          }, function (err) {
            if (err && err.name === 'AbortError') App.setState({ wtShareMsg: 'Share cancelled. Nothing was sent.', wtShareText: '' });
            else App.H.copyWtResults();
          });
          return;
        }
      } catch (e) {}
      App.H.copyWtResults();
    },
    copyWtResults: function () {
      var text = App.waterShareText(App.computeWater(), App.waterInputs(), App._build);
      var manual = function () { App.setState({ wtShareMsg: 'Select all the text below and copy it.', wtShareText: text }); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { App.setState({ wtShareMsg: 'Results copied. Paste them into a message or report.', wtShareText: '' }); }, manual);
          return;
        }
      } catch (e) {}
      manual();
    },
    dismissWtShareText: function () { App.setState({ wtShareText: '', wtShareMsg: '' }); },

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
          store[s.guideProgFor] = App.programmeSlate();
        }
        var pb = (window.PLAYBOOKS && window.PLAYBOOKS.list.find(function (x) { return x.id === id; })) || null;
        var saved = store[id] || null;
        if (saved) delete store[id]; // the live slate owns it again — a stale copy would double-count as unsaved data
        patch.guideProgByPb = store;
        patch.guideProgFor = id;
        patch.guideSaveClient = saved ? (saved.saveClient || '') : '';
        patch.guideSaveName = saved ? (saved.saveName || '') : '';
        patch.guideObservedDate = saved ? (saved.observedDate || '') : '';
        patch.guideObservedTime = saved ? (saved.observedTime || '') : '';
        patch.guideObservedOffset = saved ? (saved.observedOffset || '') : '';
        patch.guideProgProductId = saved ? saved.productId : '';
        patch.guideProgDose = saved ? saved.dose : '';
        patch.guideProgMassBasis = saved && saved.massBasis ? saved.massBasis : 'unknown';
        patch.guideProgFlow = saved ? saved.flow : '';
        patch.guideProgDoseUnit = saved ? saved.doseUnit : ((pb && pb.progUnit) || 'mgL');
        patch.guideProgFlowUnit = saved ? saved.flowUnit : 'm3h';
        patch.guideProgSludgeDensity = saved ? (saved.slurryDensity || '') : '';
        patch.guideProgDs = saved ? (saved.ds || '') : '';
        patch.guideProgScalar = saved ? (saved.scalar || '') : '';
        patch.guideProgSource = saved ? (saved.source || null) : null;
        patch.guideProgRestoreError = saved ? (saved.restoreError || '') : '';
        patch.guideSaved = !!saved && !!pb && App._snap.prog[id] === App.progSig(saved) && !!(App._snap.guideBacking && App._snap.guideBacking[id]) && pb.fields.every(function (f) { var key = id + ':' + f.k; return App._snap.readings[key] === s.guideReadings[key]; }) && (!App._snap.observation || App._snap.observation[id] === JSON.stringify([saved.observedDate || '', saved.observedTime || '', saved.observedOffset || '']));
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
    guideToSludgeCalc: function () { App.H.freshGuideCalc('sludge'); },
    // A playbook whose dose basis is mg/L on flow must land in Concentration
    // mode, whatever mode the calc was last left in.
    guideToConcCalc: function () { App.H.freshGuideCalc('conc'); },
    freshGuideCalc: function (mode) { App.setState({ screen: 'calc', calcMode: mode, calcProductId: '', form: 'liquid', density: '', flow: '', dose: '', sludgeFlow: '', ds: '', doseKg: '', sludgeDensity: '', makedown: '', feedBasis: 'solution', pumpSource: 'manual', selectedCalcPumpId: '', pumpMax: '', calMl: '', calSec: '', calcHandoffNote: 'New site calculation: enter confirmed flow, dose, density and feed preparation. No previous site values carried.' }); },
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
      if (el.dataset.f === 'guideSaveName') patch.guideSaveClient = '';
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
      App._refocusTrigger = App.openComboName() || null;   // focus returns to the picker trigger after a choice
      var p = App.allProducts().find(function (x) { return x.id === el.dataset.id; });
      App.setState({ guideProgProductId: el.dataset.id, guideProgSource: p ? JSON.parse(JSON.stringify(p)) : null, guideProgPickerOpen: false, guideProgPickerQuery: '', guideSaved: false, guideSaveError: '' });
    },
    // Carry the plant's current programme into the calculator. An explicit
    // "send" action is allowed to set the matching calc mode.
    guideProgToCalc: function () {
      var s = App.state;
      var p = App.allProducts().find(function (x) { return x.id === s.guideProgProductId; }) || null;
      // '— not in library / unknown —' must clear the calc's product too: leaving
      // a stale selection would grade this plant's dose against the wrong datasheet.
      var patch = Object.assign({ screen: 'calc', calcProductId: p ? p.id : '', flow: '', dose: '', sludgeFlow: '', ds: '', doseKg: '', sludgeDensity: '', calMl: '', calSec: '', selectedCalcPumpId: '', pumpSource: 'manual', pumpMax: '' }, App.productCalcPatch(p));
      patch.calcHandoffNote = s.guideProgMassBasis !== 'as-supplied' ? 'Dose not transferred: confirm as-supplied product mass. Active or unknown basis cannot be converted without a verified active fraction.' : '';
      var d = App.programmeScalar();
      if (!isFinite(d) && s.guideProgMassBasis === 'as-supplied') patch.calcHandoffNote = 'Dose not transferred: select an explicit scalar within the entered range. No midpoint is assumed.';
      var f = isFinite(App.flowFactor(s.guideProgFlowUnit)) ? App.parseNum(s.guideProgFlow) : NaN;
      if (s.guideProgDoseUnit === 'mgL') {
        patch.calcMode = 'conc';
        if (d > 0) patch.dose = App.decimalText(d);
        if (f > 0) { patch.flow = App.decimalText(f); patch.flowUnit = s.guideProgFlowUnit; }
      } else if (s.guideProgDoseUnit === 'kgt' || s.guideProgDoseUnit === 'gt') {
        patch.calcMode = 'sludge';
        var convertedDose = App.finiteResult(s.guideProgDoseUnit === 'gt' ? d / 1000 : d, true);
        if (d > 0 && isFinite(convertedDose)) patch.doseKg = App.decimalText(convertedDose);
        else if (d > 0) patch.calcHandoffNote = 'Dose not transferred: the unit conversion underflows or exceeds the representable numeric range.';
        if (f > 0) { patch.sludgeFlow = App.decimalText(f); patch.sludgeFlowUnit = s.guideProgFlowUnit; }
        // Programme DS is an explicit mass-balance input. A separate measured
        // Guide reading is not consent to adopt it; missing context stays blank.
        var sv = App.parseNum(s.guideProgDs);
        if (sv > 0 && sv <= 100) patch.ds = App.decimalText(sv);
        var rho = App.parseNum(s.guideProgSludgeDensity);
        if (rho > 0) patch.sludgeDensity = App.decimalText(rho);
      } else { patch.calcMode = 'conc'; patch.calcHandoffNote = 'Dose not transferred: unknown or unsupported dose unit. Confirm mg/L, kg/t or g/t explicitly.'; }
      App.setState(patch);
    },
    // Optimisation retest of the current programme: jump to jars pre-bracketed,
    // carrying the programme's product so the test is attributed correctly.
    guideProgRetest: function () {
      var s = App.state;
      var d = App.programmeScalar();
      if (!(d > 0) || s.guideProgMassBasis !== 'as-supplied' || s.guideProgDoseUnit !== 'mgL') { App.setState({ bracketNote: 'Retest blocked: a dry-solids dose cannot become mg/L without a solids balance.' }); return; }
      var p = App.allProducts().find(function (x) { return x.id === s.guideProgProductId; }) || null;
      if (p && App.entryDoseBasisOf(p) !== 'mgL') { App.setState({ bracketNote: 'Retest blocked: product dose basis does not match mg/L.' }); return; }
      // Product/sample preparation consent is separate from programme dose basis. The multi-product jar test gets a
      // NEW batch for this product, pre-set to bracket the current dose; it never invents or confirms a stock strength.
      App.pjRetestHandoff(p, d);
    },
    newGuideProgramme: function () {
      if (!window.confirm('Clear the live programme for a fresh explicit setup? Saved history is unchanged.')) return;
      App.setState({ guideProgProductId: '', guideProgSource: null, guideProgRestoreError: '', guideProgDose: '', guideProgScalar: '', guideProgMassBasis: 'unknown', guideProgFlow: '', guideProgSludgeDensity: '', guideProgDs: '', guideSaved: false, guideSaveError: '' });
    },
    recallGuideReading: function (el) {
      var s = App.state, clients = s.clients.filter(function (c) { return c.id === el.dataset.clientId; });
      var matches = clients.length === 1 ? (clients[0].readings || []).filter(function (r) { return r.id === el.dataset.readingId; }) : [];
      var r = matches.length === 1 ? matches[0] : null;
      var pb = r && window.PLAYBOOKS.list.find(function (p) { return p.id === r.playbookId; });
      if (!r || !pb || !r.readingInputs || (r.prog && r.prog.schemaVersion !== 1)) { App.setState({ storageError: 'Recall unavailable: choose an exact stable saved ID with a complete programme context. Historical records are unchanged.' }); return; }
      // Inspect the replacement target before openGuide consumes its parked slate.
      // Outgoing drafts are parked, not replaced; consent applies only to this ID.
      if (App.guideDraftIsDirty(pb) && !window.confirm('Replace this playbook\'s unsaved Guide draft with this exact saved reading/programme? Other playbook drafts and saved history are unchanged.')) return;
      App.H.openGuide({ dataset: { id: pb.id } });
      var g = r.prog || {}, readings = Object.assign({}, s.guideReadings), time = App.historicalObservation(r);
      pb.fields.forEach(function (f) { readings[pb.id + ':' + f.k] = typeof r.readingInputs[f.k] === 'string' ? r.readingInputs[f.k] : ''; });
      var at = time.observedAt, parsed = App.programmeDose(g.dose), source = App.allProducts().find(function (p) { return p.id === g.productId; });
      var contextError = r.prog && (g.application !== pb.id || !Array.isArray(g.doseEndpoints) || JSON.stringify(g.doseEndpoints) !== JSON.stringify(parsed ? [parsed.lo, parsed.hi] : []) || (g.productId && (!source || !g.productSnapshot || JSON.stringify(source) !== JSON.stringify(g.productSnapshot)))) ? 'Saved programme context is unconfirmed or contradictory (application, endpoints or product source changed). History is unchanged; start a new programme and explicitly confirm its inputs.' : '';
      App.setState({ screen: 'guide', guideId: pb.id, guideProgFor: pb.id, guideReadings: readings, guideSaveClient: clients[0].id, guideSaveName: '', guideSaveError: '', storageError: App.protectedStorageWarning(),
        guideProgProductId: typeof g.productId === 'string' ? g.productId : '', guideProgSource: g.productSnapshot || null, guideProgRestoreError: contextError,
        guideProgDose: typeof g.dose === 'string' ? g.dose : '', guideProgDoseUnit: typeof g.doseUnit === 'string' ? g.doseUnit : '', guideProgMassBasis: typeof g.massBasis === 'string' ? g.massBasis : 'unknown',
        guideProgFlow: typeof g.flow === 'string' ? g.flow : '', guideProgFlowUnit: typeof g.flowUnitCode === 'string' ? g.flowUnitCode : '', guideProgSludgeDensity: typeof g.slurryDensity === 'string' ? g.slurryDensity : '', guideProgDs: typeof g.ds === 'string' ? g.ds : '', guideProgScalar: typeof g.scalar === 'string' ? g.scalar : '',
        guideObservedDate: time.observedDate || '', guideObservedTime: at ? at.slice(11, 16) : '', guideObservedOffset: at ? at.slice(19) : '', guideProgPickerOpen: false, guideProgPickerQuery: '', guideSaved: true });
      App._stampGuideSnap(pb, clients[0].id, r);
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
      if (progP || vals.length || App.liveProgSig()) {
        prog = {
          product: progP ? progP.name : '',
          dose: pd, unit: App.doseUnitLabel(s.guideProgDoseUnit), massBasis: s.guideProgMassBasis || 'unknown',
          flow: pf, flowUnit: App.flowLabel(s.guideProgFlowUnit),
          schemaVersion: 1, productId: s.guideProgProductId || '', productSnapshot: s.guideProgSource || (progP ? JSON.parse(JSON.stringify(progP)) : null), application: pb.id,
          doseUnit: s.guideProgDoseUnit, flowUnitCode: s.guideProgFlowUnit, doseEndpoints: App.computeProg().doseBounds,
          slurryDensity: s.guideProgSludgeDensity, ds: s.guideProgDs, scalar: s.guideProgScalar
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
        var matches = clients.filter(function (c) { return String(c.name || '').trim().toLowerCase() === newName.toLowerCase(); });
        if (matches.length > 1) { App.setState({ guideSaveError: 'More than one client has this name. Choose the exact client/site from the list — nothing was saved.' }); return; }
        var existing = matches[0];
        if (existing) cid = existing.id;
        else { var nc = App.newClient(newName); clients = [nc].concat(clients); cid = nc.id; }
      }
      if (!cid) {
        App.setState({ guideSaveError: 'Choose a client or type a new client name first — nothing was saved.' });
        return;
      }
      var observation = App.observation();
      if (observation.error) { App.setState({ guideSaveError: observation.error }); return; }
      var readingInputs = {};
      pb.fields.forEach(function (f) { readingInputs[f.k] = s.guideReadings[pb.id + ':' + f.k] || ''; });
      var entry = Object.assign({ date: observation.observedDate || 'Observation date unknown', app: pb.name, playbookId: pb.id, readingInputs: readingInputs, values: vals, prog: prog }, observation);
      // The record already holding exactly this entry (Save re-enabled by
      // navigation with nothing changed) is a success, not a duplicate — a
      // second identical append would only pollute the site history. Backstop
      // to the disabled-while-guideSaved button.
      var target = clients.find(function (c) { return c.id === cid; });
      var latest = target && target.readings && target.readings[0];
      if (latest && App.readingSig(latest) === App.readingSig(entry)) {
        App._stampGuideSnap(pb, cid, latest);
        App.setState({ guideSaved: true, guideSaveClient: cid, guideSaveError: '' });
        return;
      }
      entry.id = App.recordId('reading-', clients.reduce(function (all, c) { return all.concat(c.readings || []); }, []));
      entry.savedAt = new Date().toISOString();
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
      App._stampGuideSnap(pb, cid, entry);
      App.setState({ clients: clients, guideSaved: true, guideSaveClient: cid, guideSaveName: '', guideSaveError: '' });
    },
    // Optimisation retest: set the jars to 50–150% of the current full-scale dose.
    // Abstains loudly (bracketNote) instead of leaving stale jars that would
    // masquerade as the requested bracket.
    bracketJars: function () {
      var s = App.state;
      if (!App.jarPreparationConfirmed()) { App.setState({ bracketNote: 'Jars unchanged — confirm actual prepared stock concentration and sample volume/basis first. The example default is not preparation evidence.' }); return; }
      var cur = App.parseNum(s.jarCurrentDose), vol = App.parseNum(s.jarVol), sp = App.parseNum(s.stockPct);
      if (!(cur > 0) || !(vol > 0) || !(sp > 0)) {
        App.setState({ bracketNote: 'Jars unchanged — enter the current dose, jar volume and stock strength first.' });
        return;
      }
      if (s.jarVolumeBasis !== 'initial') { App.setState({ bracketNote: 'Jars unchanged — nominal bracketing requires an initial RAW sample volume. Final total alone cannot establish it.' }); return; }
      if (sp > 100) { App.setState({ bracketNote: 'Jars unchanged — stock strength must be within the supported 0–100% w/v domain.' }); return; }
      var doses = [0.5, 0.75, 1, 1.25, 1.5].map(function (f) {
        return Math.round(App.jarMl(cur * f) * 100) / 100; // 0.01 mL is the finest step the jar cards resolve
      });
      if (doses.some(function (ml) { return typeof ml !== 'number' || !isFinite(ml); })) { App.setState({ bracketNote: 'Jars unchanged — a bracket endpoint exceeds the finite numeric range. Check the dose, raw sample volume and stock strength; no concentration remedy is inferred.' }); return; }
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
      var jars = doses.map(function (ml) { return { dose: App.decimalText(ml), ph: '', turb: '', floc: '' }; });
      App.setState({ jars: jars, winner: null, bracketNote: '' }, true);
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
      var densityText = String(np.density || '').trim();
      // Density allows a single decimal comma with 1–2 places, never grouping.
      var density = App.parseNum(/^\d+,\d{1,2}$/.test(densityText) ? densityText.replace(',', '.') : densityText);
      if (densityText && !(density > 0)) { App.setState({ productSaveError: 'Invalid density: enter a positive kg/L decimal (e.g. 1.34 or 1,34), no grouping.' }); return; }
      var type = np.type;
      var tint = type === 'Coagulant' ? '#FBEFE7' : (type === 'Flocculant' ? '#EAF5EC' : '#E7F1FB');
      var tintText = type === 'Coagulant' ? '#B05A28' : (type === 'Flocculant' ? '#2C7A45' : '#1D5F99');
      var tag = (np.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || 'NEW').toUpperCase();
      var prod = {
        id: App.recordId('up', App.allProducts()), custom: true, tag: tag, tint: tint, tintText: tintText,
        name: np.name.trim(), subtitle: (np.charge.trim() || type) + ' · ' + np.form,
        brand: np.brand.trim() || 'Custom entry', type: type, charge: np.charge.trim() || '—', form: np.form,
        densityText: np.density ? ('~' + np.density + ' kg/L') : '—',
        doseRange: np.doseRange.trim() || '—', doseUnit: np.doseUnit, doseMassBasis: np.doseMassBasis || 'unknown',
        doseApplication: /^(potable|sewage|sludge|industrial|mining)$/.test(np.doseApplication || '') ? np.doseApplication : 'unknown',
        doseWindowSourceKind: /^(supplier-tds|published-reference|site-test)$/.test(np.doseWindowSourceKind || '') ? np.doseWindowSourceKind : 'unknown',
        doseNote: 'Your custom entry — verify against the supplier data sheet.',
        application: np.application.trim() || '—', makeup: np.makeup.trim() || '—',
        makedownText: np.makedown.trim() || '—', ageing: np.ageing.trim() || '—',
        density: density > 0 ? density : null, verified: 'custom'
      };
      var customProducts = [prod].concat(App.state.customProducts);
      if (!App.persistProducts(customProducts)) { App.setState({ storageError: 'Could not write to this device’s storage — the product is NOT saved. Keep this form and try again after backing up/freeing space.' }); return; }
      App.setState({ storageError: '', customProducts: customProducts, showProductForm: false, productSaveError: '', np: { name: '', brand: '', type: 'Flocculant', charge: '', form: 'Powder', doseRange: '', doseUnit: 'mg/L on flow', density: '', makedown: '', ageing: '', application: '', makeup: '' } });
    },
    deleteProduct: function (el) {
      var id = el.dataset.id;
      var record = App.state.customProducts.find(function (r) { return r.id === id; });
      if (!record || !window.confirm('Delete custom product “' + (record.name || id) + '”? This cannot be undone.')) return;
      var customProducts = App.state.customProducts.filter(function (p) { return p.id !== id; });
      if (!App.persistProducts(customProducts)) { App.setState({ storageError: 'Could not write to this device’s storage — the record is NOT deleted. Save a backup, free space and try again.' }); return; }
      App.setState({ storageError: App.protectedStorageWarning(), customProducts: customProducts, productId: (App.state.productId === id ? null : App.state.productId) });
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
      App._refocusTrigger = App.openComboName() || null;   // focus returns to the picker trigger after a choice
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
      App._refocusTrigger = App.openComboName() || null;   // focus returns to the picker trigger after a choice
      var id = el.dataset.id;
      var p = App.allPumps().find(function (x) { return x.id === id; });
      var vf = p ? App.pumpCapacityOf(p) : NaN;
      // Catalogue capacity is L/h: express it in the selected unit exactly once (an unknown unit falls back to L/h).
      var unit = App.pumpUnitOf(App.state.pumpMaxUnit) ? App.state.pumpMaxUnit : 'Lh';
      var shown = (p && isFinite(vf)) ? App.pumpDisplayEntry(vf, unit) : { text: '', canon: null };
      App.setState({
        selectedCalcPumpId: id,
        pumpMaxUnit: unit,
        pumpMax: shown.text, pumpMaxCanon: shown.canon,
        calcPumpPickerOpen: false, calcPumpPickerQuery: ''
      });
    },
    // Which combo picker is open (null if none); used for Escape and for returning focus to its trigger.
    closePickers: function (el) {
      var wrap = el && el.closest ? el.closest('[data-combo]') : null;
      App._refocusTrigger = (wrap && wrap.getAttribute('data-combo')) || App.openComboName();
      App.setState({ productPickerOpen: false, calcPumpPickerOpen: false, jarProductPickerOpen: false, guideProgPickerOpen: false });
    },
    toggleJarProductPicker: function () {
      var open = !App.state.jarProductPickerOpen;
      App._focusKey = open ? 'jarProductPickerQuery' : null;
      App.setState({ jarProductPickerOpen: open, jarProductPickerQuery: '' });
    },
    pickJarProduct: function (el) {
      App._refocusTrigger = App.openComboName() || null;   // focus returns to the picker trigger after a choice
      var id = el.dataset.id;
      var s = App.state, patch = { jarProductId: id, jarProductPickerOpen: false, jarProductPickerQuery: '' };
      App.editJarSetup(patch);
    },
    onFormLiquid: function () { App.changeCalcForm('liquid'); },
    onFormPowder: function () { App.changeCalcForm('powder'); },
    // Changing the unit re-expresses the entered capacity as the same physical pump (never reinterprets the number).
    changePumpUnit: function (code) {
      var s = App.state, next = App.pumpUnitOf(code) ? code : '';
      var patch = { pumpMaxUnit: next, pumpMaxCanon: null }, text = String(s.pumpMax == null ? '' : s.pumpMax);
      var oldUnit = App.pumpUnitOf(s.pumpMaxUnit), n = App.parseNum(text);
      if (text.trim() !== '') {
        if (!oldUnit || !next) patch.pumpMax = oldUnit && !next ? text : '';   // text of unknown meaning is cleared, never reinterpreted
        else if (isFinite(n)) {
          var canonLh = App.pumpCanonLh(s), lh = isFinite(canonLh) ? canonLh : App.pumpFlowToLh(n, s.pumpMaxUnit);
          if (isFinite(lh)) { var shown = App.pumpDisplayEntry(lh, next); patch.pumpMax = shown.text; patch.pumpMaxCanon = shown.canon; }
        }
      }
      var ml = s.calMl, sec = s.calSec;
      App.setState(patch);
      // Same physical pump and setup: the field catch measurement stays valid.
      if (App.state.calMl !== ml || App.state.calSec !== sec) App.setState({ calMl: ml, calSec: sec });
    },
    onPumpSelect: function () { App.setState({ pumpSource: 'select' }); },
    onPumpManual: function () { App.setState({ pumpSource: 'manual' }); },
    startSaveClient: function () { App.setState({ screen: 'clients', showClientForm: true }); },

    // Viewing history is read-only: exact identity, never a live setup recall.
    viewClientJarTests: function (el) { var id = el.dataset.id; if (typeof id === 'string' && id.trim() && App.state.clients.filter(function (c) { return c.id === id; }).length === 1) { App.state.pjUi.open.saved = true; App.setState({ screen: 'jars', jarMode: 'potable', potableView: 'multi', jarHistoryClientId: id, jarHistoryId: null }); } }, // both saved lists (v2 and read-only v1) show in the Saved tests section
    showAllJarTests: function () { App.setState({ jarHistoryClientId: '', jarHistoryId: null }); },
    viewJarTest: function (el) {
      var id = el.dataset.id;
      if (!App.jarHistoryRecord(id)) { App.setState({ jarHistoryId: null, storageError: 'Saved jar view unavailable: select a unique stable ID; ambiguous or missing identities are not guessed. Original history is unchanged.' }); return; }
      App.setState({ jarHistoryId: id });
    },
    closeJarTest: function () { App.setState({ jarHistoryId: null }); },
    // jars
    setStockStrength: function (el) { App.editJarSetup({ stockPct: el.dataset.v }); },
    onJarField: function (el) {
      var i = +el.dataset.i, f = el.dataset.f, v = el.value;
      var jars = App.state.jars.map(function (j, k) { if (k === i) { var nj = Object.assign({}, j); nj[f] = v; return nj; } return j; });
      if (f === 'dose') App.editJarSetup({ jars: jars });
      else App.setState({ jars: jars, jarSaved: false });
    },
    addJar: function () { App.setState({ jars: App.state.jars.concat([{ dose: '', ph: '', turb: '', floc: '' }]) }); },
    removeJar: function () {
      App.setState({ jars: App.state.jars.length > 1 ? App.state.jars.slice(0, -1) : App.state.jars, winner: App.state.winner === App.state.jars.length - 1 ? null : App.state.winner });
    },
    setWinner: function (el) { App.setState({ winner: +el.dataset.i }); },
    confirmJarPreparation: function () { App.confirmJarPreparation(); },
    useWinner: function () {
      var s = App.state;
      if (!App.jarPreparationConfirmed()) { App.setState({ bracketNote: 'Cannot transfer — confirm actual prepared stock concentration and sample volume/basis first.' }); return; }
      // A jar mg/L is only a full-scale dose for mg/L-on-flow products. For a
      // dry-tonne-basis product there is no conversion without the solids
      // balance — the winner card explains this instead of offering the button.
      var jp = App.allProducts().find(function (x) { return x.id === s.jarProductId; });
      if (jp && App.entryDoseBasisOf(jp) !== 'mgL') return;
      var wj = (s.winner !== null && s.jars[s.winner]) ? s.jars[s.winner] : null;
      var ppm = wj ? App.jarPpm(wj.dose) : NaN;
      if (!isFinite(ppm)) return;
      // plain string, not fmt(): locale grouping ('1,234.5') would misparse as 1
      App.setState(Object.assign({ screen: 'calc', calcMode: 'conc', dose: App.decimalText(ppm), calcProductId: jp ? jp.id : '', calMl: '', calSec: '', flow: '', sludgeFlow: '', ds: '', doseKg: '', sludgeDensity: '', pumpMax: '', selectedCalcPumpId: '', pumpSource: 'manual', calcHandoffNote: '' }, App.productCalcPatch(jp)));
    },
    startJarSave: function () { App.setState({ showJarSave: true, jarSaved: false, jarSaveError: '' }); },
    cancelJarSave: function () { App.setState({ showJarSave: false, jarSaveError: '' }); },
    confirmJarSave: function () {
      var s = App.state;
      var self = App;
      if (!isFinite(App.jarStockStrength()) || !(App.parseNum(s.jarVol) > 0) || (s.jarVolumeBasis !== 'initial' && s.jarVolumeBasis !== 'final') || s.jars.some(function (j) { return String(j.dose || '').trim() !== '' && !isFinite(self.jarFinalPpm(j.dose)); })) { App.setState({ jarSaveError: 'Invalid jar preparation or stock addition. Correct the setup before saving; existing history is unchanged.' }); return; }
      var jp = App.allProducts().find(function (x) { return x.id === s.jarProductId; });
      var client = s.clients.find(function (c) { return c.id === s.jarSaveClient; });
      var wj = (s.winner !== null && s.jars[s.winner]) ? s.jars[s.winner] : null;
      var wPpm = wj ? App.jarPpm(wj.dose) : NaN;
      var t = {
        id: App.recordId('jt', s.jarTests),
        date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        clientId: s.jarSaveClient || '', clientName: client ? client.name : '',
        productId: s.jarProductId || '', productName: jp ? jp.name : 'Generic',
        jarVol: s.jarVol, stockPct: s.stockPct, stockPreparation: App.jarPreparationConfirmed() ? 'operator-confirmed-as-supplied-wv-v1' : 'unknown', jarVolumeBasis: s.jarVolumeBasis, doseConvention: s.jarVolumeBasis === 'initial' ? 'nominal-raw-sample-v1' : 'final-concentration-only-v1',
        jars: s.jars.map(function (j) { return Object.assign({}, j); }),
        winnerN: s.winner !== null ? s.winner + 1 : null,
        winnerPpm: App.jarPreparationConfirmed() && isFinite(wPpm) ? App.decimalText(wPpm) : '—',
        winnerFinalMgL: App.jarPreparationConfirmed() && wj && isFinite(App.jarFinalPpm(wj.dose)) ? App.decimalText(App.jarFinalPpm(wj.dose)) : '—',
        note: s.jarSaveNote.trim()
      };
      var jarTests = [t].concat(s.jarTests);
      if (!App.persistTests(jarTests)) {
        App.setState({ jarSaveError: 'Could not write to this device’s storage — the test is NOT saved. Free up space (or leave private browsing) and save again.' });
        return;
      }
      App._snap.jarBacking = { id: t.id, record: JSON.stringify(t) };
      App._snap.jarBackingInvalid = false;
      App.setState({ jarTests: jarTests, showJarSave: false, jarSaved: true, jarSaveNote: '', jarSaveError: '' });
      App._snap.jars = App.jarsSig(); // explicit successful save only; consent stays session-only
    },
    deleteJarTest: function (el) {
      var id = el.dataset.id;
      var record = App.state.jarTests.find(function (r) { return r.id === id; });
      if (!record || !window.confirm('Delete jar test “' + (record.clientName || id) + '”? This cannot be undone.')) return;
      var jarTests = App.state.jarTests.filter(function (t) { return t.id !== id; });
      if (!App.persistTests(jarTests)) { App.setState({ storageError: 'Could not write to this device’s storage — the record is NOT deleted. Save a backup, free space and try again.' }); return; }
      App._snap.jars = '';
      App.setState({ jarTests: jarTests, jarSaved: false, storageError: App.protectedStorageWarning() });
    },

    // pumps
    startAddPump: function () { App.setState({ showPumpForm: true }); },
    cancelAddPump: function () { App.setState({ showPumpForm: false }); },
    onNpuField: function (el) { var f = el.dataset.f; var npu = Object.assign({}, App.state.npu); npu[f] = el.value; App.setState({ npu: npu }); },
    confirmAddPump: function () {
      var n = App.state.npu; if (!n.model.trim()) return;
      var pump = {
        id: App.recordId('up', App.allPumps()), mine: true, tag: 'MINE', tint: '#ECF7F3', tintText: '#087568',
        model: n.model.trim(), brand: n.brand.trim() || '—', type: n.type,
        maxFlow: n.maxFlow.trim() || '—', maxPress: n.maxPress.trim() || '—',
        control: n.control, note: n.note.trim() || 'User-declared capacity; confirm exact model and operating duty.', verified: 'custom', sourceType: 'user-entry', operationalApproval: 'user-declared, not supplier-certified'
      };
      var foundPumps = [pump].concat(App.state.foundPumps);
      if (!App.persistPumps(foundPumps)) { App.setState({ storageError: 'Could not write to this device’s storage — the pump is NOT saved. Keep this form and try again after backing up/freeing space.' }); return; }
      App.setState({ storageError: '', foundPumps: foundPumps, showPumpForm: false, npu: { model: '', brand: '', type: 'Solenoid diaphragm', maxFlow: '', maxPress: '', control: 'Digital', note: '' } });
    },
    removePump: function (el) {
      var id = el.dataset.id;
      var record = App.state.foundPumps.find(function (r) { return r.id === id; });
      if (!record || !window.confirm('Delete pump “' + (record.model || id) + '”? This cannot be undone.')) return;
      var foundPumps = App.state.foundPumps.filter(function (p) { return p.id !== id; });
      if (!App.persistPumps(foundPumps)) { App.setState({ storageError: 'Could not write to this device’s storage — the record is NOT deleted. Save a backup, free space and try again.' }); return; }
      App.setState({ storageError: App.protectedStorageWarning(), foundPumps: foundPumps });
    },
    lookupPump: function () {
      var query = (App.state.pumpQuery || '').trim();
      if (!query) return;
      var npu = Object.assign({}, App.state.npu, { model: query });
      App.setState({ pumpLoading: false, showPumpForm: true, npu: npu, pumpError: 'Automatic specification lookup is not supported. Enter user-declared values from the current first-party document for the exact model, frequency and operating pressure. No estimated family figures are retrieved.' });
    },

    // clients
    cancelClient: function () { App.setState({ showClientForm: false, clientName: '', clientSite: '', clientSaveError: '' }); },
    confirmClient: function () {
      var s = App.state;
      var name = s.clientName.trim();
      if (!name) return;
      var p = App.allProducts().find(function (x) { return x.id === s.calcProductId; });
      var capacity = App.calcPumpCapacity(s);
      var capacityOk = isFinite(capacity) && capacity > 0;
      var calcFields = {
        mode: s.calcMode, flow: s.flow, dose: s.dose, sludgeFlow: s.sludgeFlow, ds: s.ds, doseKg: s.doseKg, sludgeDensity: s.sludgeDensity,
        flowUnit: s.flowUnit, sludgeFlowUnit: s.sludgeFlowUnit,
        makedown: s.makedown, density: App.calcMaterial(s).density,
        pumpMax: capacityOk ? App.decimalText(capacity) : '',
        pumpSource: s.pumpSource, selectedCalcPumpId: s.pumpSource === 'select' ? s.selectedCalcPumpId : '', pumpCapacityVersion: capacityOk ? 1 : null,
        form: s.form, feedBasis: s.feedBasis,
        productId: s.calcProductId, productName: p ? p.name : ''
      };
      // pumpMax above stays canonical L/h (older releases read it as L/h). The chosen display unit and the exact
      // entered text are additive, backward-compatible fields; absent fields mean legacy L/h.
      if (capacityOk && App.pumpUnitOf(s.pumpMaxUnit)) {
        calcFields.pumpMaxUnit = s.pumpMaxUnit;
        if (s.pumpSource === 'manual') calcFields.pumpMaxEntered = String(s.pumpMax).trim();
      }
      if (s.clientSite.trim()) calcFields.site = s.clientSite.trim();
      var clients;
      var existing = App.findClientByName(s.clients, name, s.clientSite.trim());
      // A sole readings-only record without a site may acquire its first site.
      var unlabelled = !existing && App.findClientByName(s.clients, name);
      if (unlabelled && !unlabelled.site && !unlabelled.mode) existing = unlabelled;
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
      if (!s.calMl && !s.calSec) {
        App._initialCalcSig = App.calcInputSig();
        var savedCalc = existing ? clients.find(function (c) { return c.id === existing.id; }) : clients[0];
        App._snap.calcBacking = { id: savedCalc.id, sig: App.clientCalcSig(savedCalc) };
      }
      App.setState({ clients: clients, showClientForm: false, clientName: '', clientSite: '', clientSaveError: '' });
    },
    deleteClient: function (el) {
      var id = el.dataset.id;
      var record = App.state.clients.find(function (r) { return r.id === id; });
      if (!record || !window.confirm('Delete client “' + (record.name || id) + '” and all ' + (record.readings || []).length + ' reading sets? This cannot be undone.')) return;
      var clients = App.state.clients.filter(function (c) { return c.id !== id; });
      if (!App.persist(clients)) { App.setState({ storageError: 'Could not write to this device’s storage — the record is NOT deleted. Save a backup, free space and try again.' }); return; }
      // A deleted client may be the only durable copy of the live calculation.
      // Keep live inputs and conservatively restore update-reload protection.
      App._initialCalcSig = null;
      var patch = { storageError: App.protectedStorageWarning(), clients: clients };
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
      // Exact ID rename evidence: a22aada:data.js -> 4c0adde:data.js.
      // Resolve at recall only: historical bytes and stored density stay untouched.
      var aliases = { polyaluminiumchlor: 'pac', aluminiumchlorohyd: 'ach', ferricchloride40: 'ferric', aluminiumsulphatea: 'alum', sodiumaluminate: 'naalu' };
      var productId = Object.prototype.hasOwnProperty.call(aliases, c.productId) ? aliases[c.productId] : (c.productId || '');
      var material = App.calcMaterial({ calcProductId: productId, form: c.form, density: c.density });
      var materialNote = material.valid ? '' : 'Historical material form or density conflicts with the product, is missing or unknown. Original record retained; reconfirm material and liquid density.';
      // The saved pumpMax is canonical L/h, so evaluate it explicitly as L/h (never through the display unit).
      var capacity = App.calcPumpCapacity({ pumpSource: c.pumpSource, pumpMax: c.pumpMax, pumpMaxUnit: 'Lh', selectedCalcPumpId: c.selectedCalcPumpId });
      var hasSavedUnit = Object.prototype.hasOwnProperty.call(c, 'pumpMaxUnit');
      var unitOk = !hasSavedUnit || !!App.pumpUnitOf(c.pumpMaxUnit);
      var capacityOk = c.pumpCapacityVersion === 1 && isFinite(capacity) && capacity > 0 && unitOk;
      var unit = hasSavedUnit && unitOk ? c.pumpMaxUnit : 'Lh';
      var pumpText = '', pumpCanon = null;
      if (capacityOk) {
        var shownPump = App.pumpDisplayEntry(capacity, unit); pumpText = shownPump.text; pumpCanon = shownPump.canon;
        // The exact typed text is used only when it still means this canonical capacity; canonical wins otherwise.
        var typed = typeof c.pumpMaxEntered === 'string' ? c.pumpMaxEntered.trim() : '', typedLh = App.pumpFlowToLh(App.parseNum(typed), unit);
        if (c.pumpSource === 'manual' && typed && isFinite(typedLh) && Math.abs(typedLh - capacity) <= 1e-12 * Math.abs(capacity)) { pumpText = typed; pumpCanon = null; }
      }
      App.setState({
        screen: 'calc', productId: null,
        calcProductId: productId, calcMode: c.mode || 'conc', form: material.form,
        flow: c.flow != null ? c.flow : '', dose: c.dose != null ? c.dose : '',
        sludgeFlow: c.sludgeFlow != null ? c.sludgeFlow : '', ds: c.ds != null ? c.ds : '',
        doseKg: c.doseKg != null ? c.doseKg : '', sludgeDensity: c.sludgeDensity || '',
        flowUnit: typeof c.flowUnit === 'string' && isFinite(App.flowFactor(c.flowUnit)) ? c.flowUnit : '', sludgeFlowUnit: typeof c.sludgeFlowUnit === 'string' && isFinite(App.flowFactor(c.sludgeFlowUnit)) ? c.sludgeFlowUnit : '',
        makedown: c.makedown != null ? c.makedown : '',
        density: material.density != null ? material.density : '',
        pumpMax: pumpText, pumpMaxUnit: unit, pumpMaxCanon: pumpCanon,
        calcHandoffNote: materialNote + (capacityOk ? '' : (unitOk ? ' Historical pump capacity provenance is unknown or unconfirmed. Original record retained; reconfirm operating-duty capacity.' : ' Historical pump unit is unknown or unsupported. Original record retained; reconfirm the pump flow unit and operating-duty capacity.')),
        feedBasis: c.feedBasis || 'solution', calMl: '', calSec: '', pumpSource: capacityOk ? c.pumpSource : 'manual', selectedCalcPumpId: capacityOk && c.pumpSource === 'select' ? c.selectedCalcPumpId : ''
      });
    },

    // ---- backup / restore (Clients screen) --------------------------------
    saveBackupFile: function () {
      var json = JSON.stringify(App.exportData(), null, 1);
      var d = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var name = 'field-assistant-backup-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.json'; // local date
      var download = function () {
        try {
          var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          var a = document.createElement('a');
          a.href = url; a.download = name; a.rel = 'noopener';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
          // a download can't be confirmed from the page: don't stamp "last backup", and offer the text too
          App.setState({ backupMsg: 'Download started as ' + name + '. If no file appeared (Downloads / Files app), copy the backup text below instead.', backupText: json });
        } catch (e) { App.setState({ backupMsg: 'This phone blocked the file. Copy the backup text below instead.', backupText: json }); }
      };
      try {
        var file = (typeof File === 'function') ? new File([json], name, { type: 'application/json' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          // file only: iOS saves a title/text as an extra .txt next to the backup
          navigator.share({ files: [file] }).then(function () {
            App.markBackup();
            App.setState({ backupMsg: 'Backup shared. If you picked \u201cSave to Files\u201d, it is in the Files app.', backupText: '' });
          }, function (err) {
            if (err && err.name === 'AbortError') App.setState({ backupMsg: 'Backup cancelled. Nothing was saved.' });
            else download(); // shows the backup text as well and doesn't claim success
          });
          return;
        }
      } catch (e) {}
      download();
    },
    copyBackup: function () {
      var json = JSON.stringify(App.exportData());
      var manual = function () { App.setState({ backupMsg: 'Select all the text below, copy it, and paste it into Notes or an email to yourself.', backupText: json }); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).then(function () {
            App.markBackup();
            App.setState({ backupMsg: 'Backup copied. Paste it into Notes or an email to yourself now.', backupText: '' });
          }, manual);
          return;
        }
      } catch (e) {}
      manual();
    },
    toggleRestore: function () {
      App.setState({ showRestore: !App.state.showRestore, restoreText: '', restoreMsg: '', restoreOk: false });
    },
    restoreFile: function (el) {
      var f = el.files && el.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { App.doRestore(String(reader.result || '')); };
      reader.onerror = function () { App.setState({ restoreMsg: 'Couldn\u2019t read that file. Nothing was changed.', restoreOk: false }); };
      reader.readAsText(f);
    },
    restoreFromText: function () { App.doRestore(App.state.restoreText); },
    dismissBackupText: function () { App.setState({ backupText: '' }); }
  };

  // Which release served this page, asked once at start-up of the worker that controls it (for the
  // Calculator share text). A later controller change cannot relabel code that is already running.
  App._build = { status: 'pending' };
  App.queryBuild = function () {
    var self = this;
    try {
      var sw = navigator.serviceWorker, ctl = sw && sw.controller;
      if (!ctl || typeof MessageChannel !== 'function') { this._build = { status: 'none' }; return; }
      var done = false, ch = new MessageChannel();
      var finish = function (b) { if (!done) { done = true; self._build = b; } };
      sw.addEventListener('controllerchange', function () { finish({ status: 'unknown' }); });
      ch.port1.onmessage = function (e) { var d = e && e.data; finish(d && d.type === 'fa-build' && /^[0-9a-f]{12}$/.test(d.build) ? { status: 'ok', build: d.build } : { status: 'unknown' }); };
      ctl.postMessage({ type: 'fa-build' }, [ch.port2]);
      setTimeout(function () { finish({ status: 'unknown' }); }, 10000);
    } catch (e) { this._build = { status: 'unknown' }; }
  };

  App.markBackup = function () {
    if (this._restoreRecovery) return; // recovery export must not mutate original metadata
    var now = new Date().toISOString();
    try { localStorage.setItem('ctf_last_backup_v1', now); } catch (e) {}
    this.state.lastBackup = now;
  };
  App.doRestore = function (text) {
    if (this._restoreRecovery) { this.setState({ restoreOk: false, restoreMsg: 'Recovery is pending. Save the original recovery backup off-device now; further restore is blocked. Do not close or reload.' }); return; }
    var owner = this;
    if (this._coordinated && !this._mutationActive) { this.mutateSaved(this.STORE_KEYS.map(function (k) { return k.key; }), function () { owner.doRestore(text); }); return; }
    var r = this.importData(text);
    if (!r.ok) { this.setState({ restoreMsg: r.error, restoreOk: false }); return; }
    var self = this, parts = [], nd = 0, sk = r.skipped || [], pa = r.partial || [];
    function names(list) { return list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0]; }
    this.STORE_KEYS.forEach(function (k) { var n = r.added[k.count]; if (n) parts.push(n + ' ' + (n === 1 ? k.one : k.many)); nd += (r.differ && r.differ[k.count]) || 0; });
    var msg = parts.length ? ('Restored: added ' + parts.join(', ') + '. Everything already on this phone was kept.')
                           : (nd || sk.length || pa.length ? 'Nothing added.' : 'Nothing new in that backup \u2014 everything in it is already on this phone.');
    if (nd) msg += ' ' + nd + (nd === 1 ? ' record in the backup differs' : ' records in the backup differ') + ' from this phone; the phone\u2019s copy was kept.';
    // a mixed list under `extra` restored its readable records only (review fix2 N13): say so, neutrally
    if (pa.length) msg += ' Some ' + names(pa) + ' in this backup could not be read and were not restored; they are still in the file.';
    // a list carried under `extra` that could not be read was skipped (review fix1 N1): say so, neutrally
    if (sk.length) msg += ' The ' + names(sk) + ' in this backup could not be read and were not restored; they are still in the file.';
    this.setState({ showRestore: false, restoreText: '', restoreOk: true, restoreMsg: msg });
    self.requestPersistentStorage();
  };

  // ---- Jar Test, Potable water v2: handlers ----------------------------------------------------------
  // All field edits go through App.pjSet (path in data-p); structural edits call the pj* cores. Saving and
  // deleting take the cross-tab storage lock like every other list mutation (see mutationKeys below).
  function pjConfirmText(row, vol) {
    return 'Confirm the actual preparation for ' + row.label + (row.name ? ' (' + row.name + ')' : '') + ': stock ' + row.stockPct + ' % w/v of AS-SUPPLIED product (grams of product per 100 mL of stock), NOT active content; jar sample ' + vol + ' mL = INITIAL raw sample before the stock is added (nominal dose; the stock volume is not added). I have checked the actual preparation and supplier-specific compatibility. This is not supplier or site approval.';
  }
  App.pjUiNote = function (key, text) { var ui = this.state.pjUi; ui.notes = ui.notes || {}; ui.notes[key] = text; };
  App.pjBracketAction = function (batchId) {
    var d = this.state.pj, b = this.pjFindBatch(d, batchId), row, pre, r, key = 'brk:' + batchId;
    if (!b) return;
    row = this.pjFindProduct(d, b.brkProduct);
    if (!row || row.role !== 'coagulant') { this.pjUiNote(key, 'Doses unchanged — choose the coagulant to bracket.'); this.render(); return; }
    pre = this.pjBracketDoses(b.brkDose, row.stockPct, b.volMl, b.jars.length, d.doseMode);
    if (!pre.ok) { this.pjUiNote(key, 'Doses unchanged — ' + pre.why); this.render(); return; }
    // fresh explicit confirmation of the actual preparation, every time (typed numbers are not consent)
    if (!window.confirm(pjConfirmText(row, b.volMl) + ' Set the ' + b.jars.length + ' jars of this batch to 50–150 % of ' + b.brkDose + ' mg/L (' + pre.doses.join(', ') + (d.doseMode === 'ml' ? ' mL' : ' mg/L') + ')?')) { this.pjUiNote(key, ''); this.render(); return; }
    r = this.pjBracketCore(batchId);
    if (r.needsConfirm) {
      if (!window.confirm('Results recorded in this batch will be cleared when its doses are replaced. Continue? Saved tests are unchanged until you save.')) { this.pjUiNote(key, ''); this.render(); return; }
      r = this.pjBracketCore(batchId, true);
    }
    this.pjUiNote(key, r.ok ? '' : 'Doses unchanged — ' + r.why);
    this.setState({ pjSaved: false });
  };
  // Optimisation retest from the Guide: a NEW batch, pre-set to bracket the programme's current dose. It never
  // invents a stock strength: without one the batch says what is missing and no doses are written.
  App.pjRetestHandoff = function (p, dose) {
    var d = this.state.pj, row = null, b, ui = this.state.pjUi, pristine, title;
    // Never write into an open test that already has entries or a saved id without asking (it may be another site's test).
    if (d.id || this.pjHasContent(d)) {
      title = String(d.site.name || '').trim() || (d.id ? d.id : 'unnamed site');
      if (!window.confirm('Add the optimisation retest to the open multi-product jar test “' + title + '”? ' + (d.id ? 'It is a saved test: the next Save progress writes the retest into it.' : 'It has entries that are not saved yet.') + ' Cancel leaves it unchanged (start a new test in Jar Test first to keep the retest separate).')) {
        this.setState({ guideRetestNote: 'Retest not added. The open multi-product jar test was left unchanged. To retest separately, open Jar Test, tap “Start a new test”, then tap Retest again.' });
        return null;
      }
    }
    d.products.forEach(function (x) { if (!row && x.role === 'coagulant' && p && x.productId === p.id) row = x; });
    if (!row) {
      var id = this.pjAddProduct('coagulant'); row = this.pjFindProduct(d, id);
      if (p) { row.productId = p.id; row.name = p.name; }
    }
    pristine = d.batches.length === 1 && !this.pjBatchHasData(d.batches[0]) && !d.batches[0].volMl && !d.batches[0].brkProduct;
    b = pristine ? d.batches[0] : this.pjFindBatch(d, this.pjAddBatch());
    b.brkProduct = row.id; b.brkDose = this.decimalText(dose);
    ui.open.batches = true; ui.open.products = true; ui.batchOpen[b.id] = true; ui.productOpen[row.id] = true;
    var r = this.pjBracketDoses(b.brkDose, row.stockPct, b.volMl, b.jars.length, d.doseMode);
    this.pjUiNote('brk:' + b.id, r.ok ? 'Press “Bracket 50–150 %” to set the jar doses (you will be asked to confirm the stock preparation).' : ('Doses not set — ' + r.why));
    this.setState({ screen: 'jars', jarMode: 'potable', potableView: 'multi', pjSaved: false, guideRetestNote: '' });
    return b.id;
  };
  App.pjCalcHandoff = function (batchId, idx) {
    var d = this.state.pj, b = this.pjFindBatch(d, batchId), j = b && b.jars[idx], row, r, jp, key = 'jar:' + batchId + ':' + idx;
    if (!j) return;
    row = this.pjFindProduct(d, j.coag);
    if (!row || row.role !== 'coagulant') { this.pjUiNote(key, 'Nothing sent — choose a coagulant for this jar first. Polymer doses are not sent to the Calculator.'); this.render(); return; }
    r = this.pjJarDose(d, b, j, 'coag');
    if (!(r.state === 'ok' && isFinite(r.mgL) && r.mgL > 0)) { this.pjUiNote(key, 'Nothing sent — this jar needs a valid dose, a stock strength and a sample volume first.'); this.render(); return; }
    jp = row.productId ? this.allProducts().find(function (x) { return x.id === row.productId; }) : null;
    if (row.productId && !jp) { this.pjUiNote(key, 'Nothing sent — the library product of this row is no longer in the library.'); this.render(); return; }
    if (jp && this.entryDoseBasisOf(jp) !== 'mgL') { this.pjUiNote(key, 'Nothing sent — ' + jp.name + ' has a dry-solids workflow entry basis, so a jar mg/L does not convert to a plant dose without the solids balance.'); this.render(); return; }
    if (!window.confirm(pjConfirmText(row, b.volMl) + ' Send ' + this.decimalText(r.mgL) + ' mg/L (nominal, as-supplied product) to the Calculator?')) { this.pjUiNote(key, ''); this.render(); return; }
    this.pjUiNote(key, '');
    this.setState(Object.assign({ screen: 'calc', calcMode: 'conc', dose: this.decimalText(r.mgL), calcProductId: jp ? jp.id : '', calMl: '', calSec: '', flow: '', sludgeFlow: '', ds: '', doseKg: '', sludgeDensity: '', pumpMax: '', selectedCalcPumpId: '', pumpSource: 'manual', calcHandoffNote: '' }, this.productCalcPatch(jp)));
  };
  App.pjJarKey = function (b, i) { return b + ':' + i; };
  App.pjPickOptimum = function (productId, src) {
    var d = this.state.pj, prod = this.pjFindProduct(d, productId), parts = String(src || '').split(':'), b = this.pjFindBatch(d, parts[0]), ji = +parts[1], j = b && b.jars[ji], w, r, rows = d.summary.rows, row, key = 'opt:' + productId, why;
    if (!prod) return;
    function ensureRow() { if (!rows[productId]) rows[productId] = { optDose: '', optSrc: '', filtNtu: '', colour: '', rating: '' }; return rows[productId]; }
    if (!src) { ensureRow().optSrc = ''; this.pjUiNote(key, ''); this.setState({ pjSaved: false }); return; }
    w = prod.role === 'polymer' ? 'poly' : 'coag';
    // dose and results always come from ONE jar: a jar without a usable mg/L is refused and the summary is left as it was
    if (!j || j[w] !== productId) { this.pjUiNote(key, 'Not picked — that jar does not use ' + prod.label + '. The summary is unchanged.'); this.render(); return; }
    r = this.pjJarDose(d, b, j, w);
    if (!isFinite(r.mgL)) {
      why = this.pjDoseBlocker(d, b, j, w); if (why) why.batch = d.batches.indexOf(b) + 1;
      this.pjUiNote(key, 'Not picked — batch ' + (d.batches.indexOf(b) + 1) + ' jar ' + (ji + 1) + ' has no mg/L yet' + (why ? ': ' + this.pjBlockerText([why]) : ': enter its dose') + '. The summary is unchanged.');
      this.render(); return;
    }
    row = ensureRow(); row.optSrc = src; row.optDose = this.pjDoseText(r.mgL);
    // results only for parameters switched on (a switched-off parameter keeps its hidden value, which is "Not tested")
    row.filtNtu = d.params.filteredNtu ? String(j.r.filteredNtu == null ? '' : j.r.filteredNtu) : '';
    row.colour = d.params.colour ? String(j.r.colour == null ? '' : j.r.colour) : '';
    this.pjUiNote(key, '');
    this.setState({ pjSaved: false });
  };

  Object.assign(H, {
    onPotableMulti: function () { App.setState({ potableView: 'multi' }); },
    onPotableClassic: function () { App.setState({ potableView: 'classic' }); },
    togglePjSection: function (el) { var o = App.state.pjUi.open, k = el.dataset.k; o[k] = !o[k]; App.setState({}); },
    togglePjBatch: function (el) { var ui = App.state.pjUi, id = el.dataset.id, b = App.pjFindBatch(App.state.pj, id), cur = ui.batchOpen[id]; if (cur === undefined) cur = !!b && App.state.pj.batches[App.state.pj.batches.length - 1] === b; ui.batchOpen[id] = !cur; App.setState({}); },
    togglePjProduct: function (el) { var ui = App.state.pjUi, id = el.dataset.id; ui.productOpen[id] = ui.productOpen[id] === undefined ? false : !ui.productOpen[id]; App.setState({}); },
    togglePjJar: function (el) { var ui = App.state.pjUi; ui.jarOpen = ui.jarOpen || {}; var k = App.pjJarKey(el.dataset.id, el.dataset.i); ui.jarOpen[k] = !ui.jarOpen[k]; App.setState({}); },
    openPjJars: function (el) { var ui = App.state.pjUi, b = App.pjFindBatch(App.state.pj, el.dataset.id), open = el.dataset.open === '1'; ui.jarOpen = ui.jarOpen || {}; if (b) b.jars.forEach(function (j, i) { ui.jarOpen[App.pjJarKey(b.id, i)] = open; }); App.setState({}); },
    onPj: function (el) { if (el.dataset.p) App.pjSet(el.dataset.p, el.value); },
    onPjSel: function (el) { if (el.dataset.p) App.pjSet(el.dataset.p, el.value); },
    togglePjParam: function (el) { var k = el.dataset.k; if (App.PJ_PARAMS.some(function (p) { return p.k === k; })) App.pjSet('params.' + k, !App.state.pj.params[k]); },
    setPjDoseMode: function (el) {
      var to = el.dataset.v, r = App.pjSetDoseMode(to), msg = '';
      // blocked: nothing was cleared or converted; say what is missing (neutral note, not an error)
      if (!r.ok && r.blocked) msg = 'Dose entry not switched — ' + r.blocked + ' typed dose' + (r.blocked === 1 ? ' cannot' : 's cannot') + ' be converted to ' + (to === 'ml' ? 'mL of stock' : 'mg/L') + ' yet: ' + App.pjBlockerText(r.why) + '. Nothing was changed.';
      else if (r.ok && r.converted) msg = 'Doses switched to ' + (to === 'ml' ? 'mL of stock' : 'mg/L') + ': ' + r.converted + ' converted.';
      App.pjUiNote('mode', msg); App.render();
    },
    addPjProduct: function (el) { var id = App.pjAddProduct(el.dataset.role); App.state.pjUi.open.products = true; App.state.pjUi.productOpen[id] = true; App.render(); },
    removePjProduct: function (el) {
      var d = App.state.pj, row = App.pjFindProduct(d, el.dataset.id), n;
      if (!row) return; n = App.pjProductJarCount(d, row.id);
      if (n && !window.confirm('Remove ' + row.label + '? It is used in ' + n + ' jar' + (n === 1 ? '' : 's') + '; those jars lose this product and its dose (their results stay). Saved tests are unchanged until you save.')) return;
      App.pjRemoveProduct(row.id);
    },
    onPjLibrary: function (el) {
      var d = App.state.pj, row = App.pjFindProduct(d, el.dataset.id), p = el.value ? App.allProducts().find(function (x) { return x.id === el.value; }) : null;
      if (!row) return;
      row.productId = p ? p.id : ''; if (p) row.name = p.name;
      App.setState({ pjSaved: false });
    },
    addPjBatch: function () { var id = App.pjAddBatch(); App.state.pjUi.batchOpen[id] = true; App.state.pjUi.open.batches = true; App.render(); },
    duplicatePjBatch: function (el) { var id = App.pjDuplicateBatch(el.dataset.id); if (id) App.state.pjUi.batchOpen[id] = true; App.render(); },
    removePjBatch: function (el) {
      var b = App.pjFindBatch(App.state.pj, el.dataset.id), n = b ? App.state.pj.batches.indexOf(b) + 1 : 0;
      if (!b) return;
      if (App.state.pj.batches.length < 2) { App.pjUiNote('batches', 'The last batch cannot be removed; clear its entries instead.'); App.render(); return; }
      if (App.pjBatchHasData(b) && !window.confirm('Remove batch ' + n + ' and the doses and results recorded in it? Saved tests are unchanged until you save.')) return;
      App.pjUiNote('batches', ''); App.pjRemoveBatch(b.id);
    },
    setPjGang: function (el) {
      var id = el.dataset.id, r = App.pjSetGang(id, el.value);
      if (r.needsConfirm) {
        if (!window.confirm('Reduce this batch to ' + el.value + ' jars? ' + r.lost + ' jar' + (r.lost === 1 ? ' with entries' : 's with entries') + ' beyond jar ' + el.value + ' would be removed. Saved tests are unchanged until you save.')) { App.render(); return; }
        App.pjSetGang(id, el.value, true);
      } else if (!r.ok) App.render();
    },
    bracketPj: function (el) { App.pjBracketAction(el.dataset.id); },
    sendPjToCalc: function (el) { App.pjCalcHandoff(el.dataset.id, +el.dataset.i); },
    pickPjOptimum: function (el) { App.pjPickOptimum(el.dataset.id, el.value); },
    addPjChem: function () { App.pjAddChem(); },
    removePjChem: function (el) { App.pjRemoveChem(el.dataset.i); },
    addPjTelemetry: function () { App.pjAddTelemetry(); },
    removePjTelemetry: function (el) { App.pjRemoveTelemetry(el.dataset.i); },
    savePj: function () {
      var r = App.pjSaveCore();
      if (r.needsConfirm) {
        if (!window.confirm(r.error + ' Replace the stored copy?')) { App.setState({ pjError: 'Not saved — the stored copy was changed after you opened it. Nothing was overwritten.', pjSaved: false }); return; }
        r = App.pjSaveCore(true);
      }
      if (!r.ok) { App.setState({ pjError: r.error, pjSaved: false }); return; }
      App.setState({ pjSaved: true, pjError: '', pjMsg: r.issues ? ('Saved. ' + r.issues + ' entr' + (r.issues === 1 ? 'y needs' : 'ies need') + ' fixing before you can export (shown in red).') : '' });
    },
    // Export the open test (no data-id) or a saved one (data-id) as CSV (jars + baseline) or .xlsx. Never writes storage.
    exportPj: function (el) {
      var fmt = el.dataset.fmt, id = el.dataset.id || '', r;
      App.setState({ pjExportWhere: id, pjExportMsg: '', pjExportText: '', pjExportErr: false });
      r = id ? App.pjExportFilesForRecord(fmt, id) : App.pjExportFiles(fmt, App.state.pj, { id: App.state.pj.id });
      if (!r.ok) { App.setState({ pjExportMsg: r.error, pjExportText: '', pjExportErr: true }); return; }
      App.pjDeliver(r, fmt);
    },
    dismissPjExportText: function () { App.setState({ pjExportText: '' }); },
    newPjTest: function () {
      if (App.hasUnsavedFieldData() && !window.confirm('Start a new test? The open test has changes that are not saved; they will be lost. Saved tests are unchanged.')) return;
      App.pjUiNote('mode', ''); App.state.pjUi.jarOpen = {}; App.state.pjUi.batchOpen = {}; App.state.pjUi.productOpen = {};
      App.pjNewCore(); App.setState({ pjMsg: '' });
    },
    openPjTest: function (el) {
      if (App.hasUnsavedFieldData() && !window.confirm('Open this saved test? The test on screen has changes that are not saved; they will be lost. Saved tests are unchanged.')) return;
      var r = App.pjOpenCore(el.dataset.id);
      if (!r.ok) { App.setState({ pjError: r.error }); return; }
      App.state.pjUi.jarOpen = {}; App.state.pjUi.batchOpen = {}; App.state.pjUi.productOpen = {};
      App.setState({ screen: 'jars', jarMode: 'potable', potableView: 'multi', pjMsg: '' });
    },
    deletePjTest: function (el) {
      var m = App.pjRecordMatches(el.dataset.id), rec = m[0];
      if (!rec || m.length !== 1) { App.setState({ storageError: 'That saved test is missing or its identity is ambiguous, so nothing was deleted.' }); return; }
      var site = rec.site && typeof rec.site === 'object' && typeof rec.site.name === 'string' ? rec.site.name : '';
      if (!window.confirm('Delete saved test “' + (site || rec.clientName || rec.id) + '”? This cannot be undone.')) return;
      var r = App.pjDeleteCore(el.dataset.id);
      if (!r.ok) App.setState({ storageError: r.error });
    }
  });

  // Wrap every synchronous list mutation; internal callers retain boolean write
  // guards, but mounted browser actions acquire the cross-tab transaction first.
  var mutationKeys = { confirmClient: ['ctf_clients_v1'], saveGuideReadings: ['ctf_clients_v1'], deleteClient: ['ctf_clients_v1'], confirmJarSave: ['ctf_jartests_v1', 'ctf_clients_v1'], deleteJarTest: ['ctf_jartests_v1'], confirmAddProduct: ['ctf_products_v1'], deleteProduct: ['ctf_products_v1'], confirmAddPump: ['ctf_pumps_v1'], removePump: ['ctf_pumps_v1'], savePj: ['ctf_jartests_v2'], deletePjTest: ['ctf_jartests_v2'] };
  Object.keys(mutationKeys).forEach(function (name) {
    var original = H[name];
    H[name] = function (el, event) { return App.mutateSaved(mutationKeys[name], function () { original(el, event); }); };
  });
  H.refreshSavedLists = function () { App.refreshSavedLists(); };
  App.H = H;
  window.FieldAssistant = App;

  // The render/template layer is defined in render.js (loaded after this file).
  document.addEventListener('DOMContentLoaded', function () {
    App.load();
    App.pjDraftStart(); // the open multi-product test from the last session (autosave), before the first render
    try { App.state.lastBackup = localStorage.getItem('ctf_last_backup_v1') || ''; } catch (e) {}
    App.mount();
    App.queryBuild();
    App.requestPersistentStorage();
  });
})();
