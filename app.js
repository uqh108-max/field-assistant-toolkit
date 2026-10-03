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
      makedown: '0.5', density: '1.0', pumpMax: '20', feedBasis: 'solution',
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
      customProducts: [], jarTests: [],
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
      jarCurrentDose: '', bracketNote: '',
      mgSample: '500', mgSolids: '30', mgStock: '0.1', mgMl: '',
      backupMsg: '', backupText: '', lastBackup: '',
      showRestore: false, restoreText: '', restoreMsg: '', restoreOk: false
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
    // The four saved lists: state key <-> localStorage key <-> label.
    STORE_KEYS: [
      { state: 'clients', key: 'ctf_clients_v1', one: 'client', many: 'clients', count: 'clients' },
      { state: 'jarTests', key: 'ctf_jartests_v1', one: 'jar test', many: 'jar tests', count: 'jarTests' },
      { state: 'customProducts', key: 'ctf_products_v1', one: 'custom product', many: 'custom products', count: 'products' },
      { state: 'foundPumps', key: 'ctf_pumps_v1', one: 'saved pump', many: 'saved pumps', count: 'pumps' }
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

      var incoming = {};
      for (var i = 0; i < this.STORE_KEYS.length; i++) {
        var k = this.STORE_KEYS[i], v = src[k.key];
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
        return { ok: true, added: added, differ: differ };
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
      if (s.pumpSource === 'manual') return this.parseNum(s.pumpMax);
      if (s.pumpSource !== 'select') return NaN;
      return this.pumpCapacityOf(this.allPumps().find(function (p) { return p.id === s.selectedCalcPumpId; }));
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

      var warnings = [];
      var numericUnavailable = ok && ((massGh > 0 && (strengthOk || (neat && liquid && rho > 0)) && !isFinite(solLh)) || (liquid && rho > 0 && !isFinite(neatLh)) || (solLh > 0 && pumpMax > 0 && !isFinite(strokePct)) || !isFinite(massKgDay));
      if (numericUnavailable) warnings.push({ text: 'A derived rate exceeds the representable numeric range or underflows. No zero-rate or pump-setting confirmation is inferred; check the entered magnitudes.', bg: '#FBEBE7', border: '#E9C4B9', color: '#8A3A24' });
      if ((!neat && !strengthOk) || (neat && (!liquid || !(rho > 0)))) warnings.push({ text: 'Invalid strength or density. Neat feed requires liquid product and confirmed kg/L density. Solution strength is g as-supplied product per 100 mL FINAL solution, not percent neat; it cannot exceed the neat mass per volume.', bg: '#FBEBE7', border: '#E9C4B9', color: '#8A3A24' });
      if (!(pumpMax > 0)) warnings.push({ text: 'Pump capacity unavailable or ambiguous. Enter a confirmed capacity in L/h at operating pressure; bare gallons and multi-model annotations are not interpreted.', bg: '#FBF6EC', border: '#EBD9BC', color: '#8A5E17' });
      if (!isFinite(this.flowFactor(s.calcMode === 'sludge' ? s.sludgeFlowUnit : s.flowUnit))) warnings.push({ text: 'Flow unit is unknown or missing. Confirm the flow unit explicitly before calculating delivery or catch advice; historical records are retained unchanged.', bg: '#FBF9F4', border: '#E2DDD0', color: '#56635B' });
      if (!ok) warnings.push({ text: 'Invalid or missing flow, dose or solids values. Use plain non-negative decimal numbers (decimal point, no commas or grouping); flow and density must be positive, dry solids 0–100%.', bg: '#FBF9F4', border: '#E2DDD0', color: '#56635B' });
      if (isFinite(strokePct) && strokePct > 100) warnings.push({ text: 'Pump stroke exceeds 100% — this pump is too small for the required feed, or dilute the solution less (higher %). Consider a larger pump.', bg: '#FBEBE7', border: '#E9C4B9', color: '#8A3A24' });
      else if (isFinite(strokePct) && strokePct < 10 && strokePct > 0) warnings.push({ text: 'Pump running below ~10% stroke — accuracy suffers at very low output. Consider a smaller pump or a more dilute solution.', bg: '#FBF6EC', border: '#EBD9BC', color: '#8A5E17' });
      var cp = this.allProducts().find(function (p) { return p.id === s.calcProductId; });
      var powderPolymer = cp && /\bpolymer\b|polyacrylamide|polyacrylate/i.test([cp.name, cp.application, cp.makeup, cp.subtitle].join(' '));
      if (!liquid && powderPolymer && S > 0.7) warnings.push({ text: 'Powder polymer solutions can become viscous at higher strengths. Confirm the supplier-specific make-down limit and mixing procedure; no universal chemical threshold is assumed.', bg: '#FBF6EC', border: '#EBD9BC', color: '#8A5E17' });

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
      this.invalidateProgrammeAuthorities();
      if (Object.prototype.hasOwnProperty.call(patch, 'clients') || Object.prototype.hasOwnProperty.call(patch, 'jarTests')) this.invalidateSavedSnapshots();
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
    guideDraftIsDirty: function (pb) {
      var s = this.state, snap = this._snap;
      var slate = s.guideProgFor === pb.id ? this.programmeSlate() : (s.guideProgByPb[pb.id] || {});
      if (String(slate.saveName || '').trim()) return true;
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
    jarsSig: function () {
      var s = this.state;
      return JSON.stringify([s.jars, s.winner, s.jarCurrentDose, s.jarProductId, s.jarVol, s.stockPct, s.jarVolumeBasis]);
    },
    // index.html's controllerchange handler asks this before auto-reloading an
    // update: a mid-visit reload would destroy these memory-only entries.
    calcInputSig: function () {
      var s = this.state;
      return JSON.stringify(['calcMode', 'calcProductId', 'form', 'flow', 'dose', 'flowUnit', 'sludgeFlow', 'sludgeFlowUnit', 'ds', 'doseKg', 'sludgeDensity', 'makedown', 'density', 'feedBasis', 'pumpMax', 'pumpSource', 'selectedCalcPumpId', 'calMl', 'calSec'].map(function (k) { return s[k]; }));
    },
    hasUnsavedFieldData: function () {
      if (this._mutationBusy || this._restoreRecovery) return true;
      var s = this.state, snap = this._snap;
      if (s.showClientForm || s.showProductForm || s.showPumpForm || s.showJarSave || String(s.guideSaveName || '').trim()) return true;
      // Conservative: a changed calculation can include memory-only catch inputs.
      if (this.calcInputSig() !== this._initialCalcSig) return true;
      for (var k in s.guideReadings) {
        if ((String(s.guideReadings[k] || '').trim() || Object.prototype.hasOwnProperty.call(snap.readings, k)) && snap.readings[k] !== s.guideReadings[k]) return true;
      }
      if (s.guideProgFor && (s.guideObservedDate || s.guideObservedTime || s.guideObservedOffset || (snap.observation && snap.observation[s.guideProgFor])) && (!snap.observation || snap.observation[s.guideProgFor] !== this.observationSig())) return true;
      if (s.guideProgFor) {
        var liveSig = this.liveProgSig();
        if ((liveSig || snap.prog[s.guideProgFor]) && snap.prog[s.guideProgFor] !== liveSig) return true;
      }
      for (var pid in s.guideProgByPb) {
        var sig = this.progSig(s.guideProgByPb[pid] || {});
        if ((sig || snap.prog[pid]) && snap.prog[pid] !== sig) return true;
        var parked = s.guideProgByPb[pid] || {};
        if (String(parked.saveName || '').trim()) return true;
        if ((parked.observedDate || parked.observedTime || parked.observedOffset || (snap.observation && snap.observation[pid])) && (!snap.observation || snap.observation[pid] !== JSON.stringify([parked.observedDate || '', parked.observedTime || '', parked.observedOffset || '']))) return true;
      }
      var jarsHaveData = s.winner !== null || String(s.jarCurrentDose || '').trim() !== '' ||
        s.jars.some(function (j) { return j.ph || j.turb || j.floc; });
      if (jarsHaveData && snap.jars !== this.jarsSig()) return true;
      if (String(s.mgMl || '').trim()) return true; // bench entry has no save path
      return false;
    },
    clientCalcSig: function (c) {
      return JSON.stringify(['mode', 'flow', 'dose', 'sludgeFlow', 'ds', 'doseKg', 'sludgeDensity', 'flowUnit', 'sludgeFlowUnit', 'makedown', 'density', 'pumpMax', 'pumpSource', 'selectedCalcPumpId', 'pumpCapacityVersion', 'form', 'feedBasis', 'productId', 'productName'].map(function (k) { return c[k]; }));
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
      if (snap.jarBacking && !s.jarTests.some(function (t) { return t.id === snap.jarBacking.id && JSON.stringify(t) === snap.jarBacking.record; })) {
        snap.jars = ''; delete snap.jarBacking; s.jarSaved = false;
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
      return { flex: 1, border: 'none', cursor: 'pointer', borderRadius: '9px', padding: '9px 6px', fontSize: '13px', fontWeight: 700, lineHeight: 1.15, background: active ? '#16211F' : 'transparent', color: active ? '#EFECE3' : '#56635B' };
    },
    segSmall: function (active) {
      return { flex: 1, border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '9px 6px', fontSize: '12.5px', fontWeight: 700, background: active ? '#087568' : 'transparent', color: active ? '#FFF' : '#56635B' };
    }
  };

  App._initialCalcSig = App.calcInputSig();

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
      var prev = { jarCurrentDose: s.jarCurrentDose, jarProductId: s.jarProductId, jars: s.jars };
      // Bracketing confirms before replacing results; attribution commits only
      // when a new jar array was actually produced.
      App.setState({ jarCurrentDose: App.decimalText(d) });
      App.H.bracketJars();
      if (s.jars !== prev.jars) App.setState({ screen: 'jars', jarProductId: p ? p.id : '' });
      else App.setState({ jarCurrentDose: prev.jarCurrentDose, jarProductId: prev.jarProductId });
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
      var vf = p ? App.pumpCapacityOf(p) : NaN;
      App.setState({
        selectedCalcPumpId: id,
        pumpMax: (p && isFinite(vf)) ? App.decimalText(vf) : '',
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
      var s = App.state, patch = { jarProductId: id, jarProductPickerOpen: false, jarProductPickerQuery: '' };
      App.editJarSetup(patch);
    },
    onFormLiquid: function () { App.changeCalcForm('liquid'); },
    onFormPowder: function () { App.changeCalcForm('powder'); },
    onPumpSelect: function () { App.setState({ pumpSource: 'select' }); },
    onPumpManual: function () { App.setState({ pumpSource: 'manual' }); },
    startSaveClient: function () { App.setState({ screen: 'clients', showClientForm: true }); },

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
    useWinner: function () {
      var s = App.state;
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
        jarVol: s.jarVol, stockPct: s.stockPct, jarVolumeBasis: s.jarVolumeBasis, doseConvention: s.jarVolumeBasis === 'initial' ? 'nominal-raw-sample-v1' : 'final-concentration-only-v1',
        jars: s.jars.map(function (j) { return Object.assign({}, j); }),
        winnerN: s.winner !== null ? s.winner + 1 : null,
        winnerPpm: isFinite(wPpm) ? App.decimalText(wPpm) : '—',
        winnerFinalMgL: wj && isFinite(App.jarFinalPpm(wj.dose)) ? App.decimalText(App.jarFinalPpm(wj.dose)) : '—',
        note: s.jarSaveNote.trim()
      };
      var jarTests = [t].concat(s.jarTests);
      if (!App.persistTests(jarTests)) {
        App.setState({ jarSaveError: 'Could not write to this device’s storage — the test is NOT saved. Free up space (or leave private browsing) and save again.' });
        return;
      }
      App._snap.jars = App.jarsSig(); // this exact jar setup is now on record — safe for an update reload
      App._snap.jarBacking = { id: t.id, record: JSON.stringify(t) };
      App.setState({ jarTests: jarTests, showJarSave: false, jarSaved: true, jarSaveNote: '', jarSaveError: '' });
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
      var capacity = App.calcPumpCapacity({ pumpSource: c.pumpSource, pumpMax: c.pumpMax, selectedCalcPumpId: c.selectedCalcPumpId });
      var capacityOk = c.pumpCapacityVersion === 1 && isFinite(capacity) && capacity > 0;
      App.setState({
        screen: 'calc', productId: null,
        calcProductId: productId, calcMode: c.mode || 'conc', form: material.form,
        flow: c.flow != null ? c.flow : '', dose: c.dose != null ? c.dose : '',
        sludgeFlow: c.sludgeFlow != null ? c.sludgeFlow : '', ds: c.ds != null ? c.ds : '',
        doseKg: c.doseKg != null ? c.doseKg : '', sludgeDensity: c.sludgeDensity || '',
        flowUnit: typeof c.flowUnit === 'string' && isFinite(App.flowFactor(c.flowUnit)) ? c.flowUnit : '', sludgeFlowUnit: typeof c.sludgeFlowUnit === 'string' && isFinite(App.flowFactor(c.sludgeFlowUnit)) ? c.sludgeFlowUnit : '',
        makedown: c.makedown != null ? c.makedown : '',
        density: material.density != null ? material.density : '',
        pumpMax: capacityOk ? App.decimalText(capacity) : '',
        calcHandoffNote: materialNote + (capacityOk ? '' : ' Historical pump capacity provenance is unknown or unconfirmed. Original record retained; reconfirm operating-duty capacity.'),
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
    var self = this, parts = [], nd = 0;
    this.STORE_KEYS.forEach(function (k) { var n = r.added[k.count]; if (n) parts.push(n + ' ' + (n === 1 ? k.one : k.many)); nd += (r.differ && r.differ[k.count]) || 0; });
    var msg = parts.length ? ('Restored: added ' + parts.join(', ') + '. Everything already on this phone was kept.')
                           : (nd ? 'Nothing added.' : 'Nothing new in that backup \u2014 everything in it is already on this phone.');
    if (nd) msg += ' ' + nd + (nd === 1 ? ' record in the backup differs' : ' records in the backup differ') + ' from this phone; the phone\u2019s copy was kept.';
    this.setState({ showRestore: false, restoreText: '', restoreOk: true, restoreMsg: msg });
    self.requestPersistentStorage();
  };

  // Wrap every synchronous list mutation; internal callers retain boolean write
  // guards, but mounted browser actions acquire the cross-tab transaction first.
  var mutationKeys = { confirmClient: ['ctf_clients_v1'], saveGuideReadings: ['ctf_clients_v1'], deleteClient: ['ctf_clients_v1'], confirmJarSave: ['ctf_jartests_v1', 'ctf_clients_v1'], deleteJarTest: ['ctf_jartests_v1'], confirmAddProduct: ['ctf_products_v1'], deleteProduct: ['ctf_products_v1'], confirmAddPump: ['ctf_pumps_v1'], removePump: ['ctf_pumps_v1'] };
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
    try { App.state.lastBackup = localStorage.getItem('ctf_last_backup_v1') || ''; } catch (e) {}
    App.mount();
    App.requestPersistentStorage();
  });
})();
