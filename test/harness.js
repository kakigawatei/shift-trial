/* index.html の <script> をそのまま Node で動かすための最小スタブ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const CODE = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];

function mkStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    _raw: m,
  };
}

/* 疑似 Firestore：ドキュメントIDごとに JSON を持つ */
function mkCloud(seed) {
  const docs = Object.assign({}, seed || {});
  const log = [];
  return { docs, log };
}

function makeEnv(opts) {
  opts = opts || {};
  const storage = opts.storage || mkStore();
  const cloud = opts.cloud || mkCloud();

  const els = {};
  function mkEl(id) {
    return {
      id,
      innerHTML: "",
      textContent: "",
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); },
        remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
      },
    };
  }
  ["app", "printview", "mask", "sheet", "toast"].forEach((id) => (els[id] = mkEl(id)));

  const document = {
    getElementById: (id) => els[id] || null,
    addEventListener: () => {},
    hidden: false,
  };

  function fetchStub(url, init) {
    init = init || {};
    if (url.indexOf("identitytoolkit") >= 0) {
      return Promise.resolve(res200({ idToken: "tok", expiresIn: "3600", refreshToken: "rt" }));
    }
    if (url.indexOf("securetoken") >= 0) {
      return Promise.resolve(res200({ id_token: "tok", expires_in: "3600" }));
    }
    const m = url.match(/shime_docs\/([^?]+)/);
    const doc = m && m[1];
    if (init.method === "PATCH") {
      const body = JSON.parse(init.body);
      cloud.docs[doc] = body.fields.json.stringValue;
      cloud.log.push({ op: "PUT", doc, len: cloud.docs[doc].length });
      return Promise.resolve(res200({}));
    }
    cloud.log.push({ op: "GET", doc });
    if (!(doc in cloud.docs)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    return Promise.resolve(res200({ fields: { json: { stringValue: cloud.docs[doc] } } }));
  }
  function res200(o) { return { ok: true, status: 200, json: () => Promise.resolve(o) }; }

  const sandbox = {
    document,
    localStorage: storage,
    fetch: fetchStub,
    window: { addEventListener: () => {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat,
    console,
    confirm: () => true,
    alert: () => {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: "index.html.script" });
  return { sandbox, storage, cloud, els };
}

module.exports = { makeEnv, mkStore, mkCloud };
