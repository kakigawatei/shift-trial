/* 「厨房の追加」と「ポジションごとの時間設定」の確認 */
const { makeEnv } = require("./harness");

let ok = 0, ng = 0;
function eq(got, want, name) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { ok++; console.log("  OK   " + name); }
  else { ng++; console.log("  FAIL " + name + "  -> " + JSON.stringify({ got, want })); }
}
function sec(t) { console.log("\n== " + t + " =="); }

function env(shop) {
  const { sandbox: S, els } = makeEnv();
  S.applyShop(shop || "ohashi");
  S.DATA = { staff: [], req: {}, asg: {}, submitted: {}, updatedAt: 1 };
  return { S, els };
}
function withStaff(S, n) {
  S.DATA.staff = [];
  for (let i = 0; i < n; i++) S.DATA.staff.push({ id: "o" + i, name: "従業員" + i, pos: [] });
  S.ensureColors();
  return S;
}
const labelOf = (S, pid) => (S.POS.filter((p) => p.id === pid)[0] || {}).label;

/* ---------- 1. 厨房が増えたか ---------- */
sec("1. おはし二日町に「厨房」が増えたか");
{
  const { S } = env("ohashi");
  const labels = S.POS.map((p) => p.label);
  eq(labels.indexOf("厨房") >= 0, true, "ポジションに厨房がある");
  eq(labels, ["仕込①", "ランチ①", "ランチ②", "ランチ③", "厨房", "厨房補助", "ドリンク",
              "ホール①", "ホール②", "ホール③", "ホール④"], "並び順（厨房はランチのあと・厨房補助の前）");
  /* 既存データのポジションIDが変わっていないこと＝保存済みシフトが迷子にならない */
  eq(S.POS.filter((p) => p.label === "ドリンク")[0].id, "p6", "ドリンクのIDは今までどおり p6");
  eq(S.POS.filter((p) => p.label === "厨房補助")[0].id, "p5", "厨房補助のIDは今までどおり p5");
  eq(S.POS.filter((p) => p.label === "厨房")[0].id, "p11", "厨房は新しいID p11（既存とぶつからない）");
  eq(S.posLabel("p6"), "ドリンク", "保存済みのp6は今までどおりドリンクと表示される");

  const { S: T } = env("ochiai");
  eq(T.POS.map((p) => p.label).indexOf("厨房"), -1, "落合には厨房を足していない");
  eq(T.POS.length, 10, "落合のポジション数は今までどおり10");
}

/* ---------- 2. ランチにドリンク・ホールが入らないか（要望の本体） ---------- */
sec("2. 自動作成でランチの時間にドリンク／ホールが入らないか");
{
  const { S } = env("ohashi");
  withStaff(S, 8);
  const lunchNG = [];      /* ランチ帯(11:00〜15:00)に入った夜ポジション */
  const nightNG = [];      /* 夜(18:00〜23:00)に入ったランチ専用ポジション */
  for (const d of [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]) {
    S.MDAY = d; S.autoDraft();
    (S.DATA.shift[d] || []).forEach((e) => {
      const f = S.minutes(e.f), t = S.minutes(e.t);
      /* まるごとランチ時間の中にある帯が、夜だけのポジションに入っていないか */
      if (f >= 660 && t <= 900 && ["p6", "p7", "p8", "p9", "p10"].indexOf(e.pos) >= 0)
        lunchNG.push(d + " " + labelOf(S, e.pos) + " " + e.f + "-" + e.t);
      if (f >= 1080 && ["p1", "p2", "p3", "p4"].indexOf(e.pos) >= 0)
        nightNG.push(d + " " + labelOf(S, e.pos) + " " + e.f + "-" + e.t);
    });
  }
  eq(lunchNG, [], "ランチ時間だけの帯がドリンク・ホールに入っていない");
  eq(nightNG, [], "夜だけの帯が仕込み・ランチに入っていない");

  /* 「まったく時間の合わないポジション」に置かれた帯が1件も無いこと */
  let bad = 0, total = 0;
  for (const d of [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31])
    (S.DATA.shift[d] || []).forEach((e) => { total++;
      if (!S.fitsPos(e.pos, d, S.minutes(e.f), S.minutes(e.t))) bad++; });
  eq([bad, total > 0], [0, true], "16日ぶんすべての帯がポジションの時間と重なっている");
}

/* ---------- 3. 変更前（旧版）は本当にランチにドリンクが入っていたか ---------- */
sec("3. 変更前は困りごとが起きていたことの確認（比較）");
{
  const cp = require("child_process"), path = require("path"), vm = require("vm");
  /* 「ポジションの時間設定」を入れる前のバージョンを指定して比べる。
     HEAD だとコミットするたび比較相手がずれてしまうのでコミットIDで固定する */
  const OLD = cp.execSync("git show 9a863c2:index.html", { cwd: path.join(__dirname, ".."), maxBuffer: 1 << 24 }).toString("utf8");
  const CODE = OLD.match(/<script>([\s\S]*?)<\/script>/)[1];
  const m = {}, els = {};
  const mkEl = (id) => ({ id, innerHTML: "", textContent: "", classList: { _s: new Set(), add() {}, remove() {}, contains: () => false } });
  ["app", "printview", "mask", "sheet", "toast"].forEach((i) => (els[i] = mkEl(i)));
  const sb = { document: { getElementById: (i) => els[i] || null, addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } },
    fetch: () => new Promise(() => {}), window: { addEventListener() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, console, confirm: () => true };
  sb.globalThis = sb; vm.createContext(sb); vm.runInContext(CODE, sb, { filename: "old" });
  sb.applyShop("ohashi");
  sb.DATA = { staff: [], req: {}, asg: {}, submitted: {}, updatedAt: 1 };
  for (let i = 0; i < 8; i++) sb.DATA.staff.push({ id: "o" + i, name: "従業員" + i, pos: [] });
  sb.ensureColors();

  /* 旧版の下書きを、新しい「ポジションの時間」で採点すると何件が時間外だったか */
  const { S } = env("ohashi");
  let old = 0, sample = null;
  for (const d of [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]) {
    sb.MDAY = d; sb.autoDraft();
    (sb.DATA.shift[d] || []).forEach((e) => {
      if (!S.fitsPos(e.pos, d, sb.minutes(e.f), sb.minutes(e.t))) {
        old++; if (!sample) sample = "8/" + d + " " + labelOf(S, e.pos) + " " + e.f + "-" + e.t;
      }
    });
  }
  eq(old > 0, true, "旧版は時間の合わないポジションに置いていた（" + old + "件。例：" + sample + "）→ 新版は0件");
}

/* ---------- 4. 時間設定の保存・読み出し ---------- */
sec("4. ポジションの時間設定（保存・終日・もどす）");
{
  const { S } = env("ohashi");
  eq(S.bandOf("p6", 17), [1020, 1380], "はじめの設定：ドリンクは17時〜23時");
  eq(S.bandOf("p11", 17), null, "はじめの設定：厨房は終日（時間の決めなし）");
  eq(S.fitsPos("p6", 17, 660, 840), false, "11時〜14時のドリンクは時間外あつかい");
  eq(S.fitsPos("p6", 17, 1020, 1380), true, "17時〜23時のドリンクはOK");
  eq(S.fitsPos("p11", 17, 660, 840), true, "終日のポジションはいつでもOK");

  /* 画面を開いて平日のドリンクを19時〜に変える */
  S.MDAY = 17;                          /* 8/17は月曜＝平日 */
  S.openPosTime();
  eq(S.PTKEY, "wd", "平日の日を開いたので平日タブが選ばれる");
  S.ptSet("p6", "f", "1140");           /* 19:00 */
  S.savePosTime();
  eq(S.bandOf("p6", 17), [1140, 1380], "平日のドリンクが19時〜23時になった");
  eq(S.bandOf("p6", 22), [1020, 1380], "土日祝(8/22)は変えていないので17時〜のまま");
  eq(S.DATA.postime.wd.p6, [1140, 1380], "保存データに入っている");
  eq(S.DATA.postime.wd.p11, 0, "終日のポジションは0で保存（終日の意味）");

  /* 終日にもどす */
  S.openPosTime(); S.ptSet("p6", "f", ""); S.savePosTime();
  eq(S.bandOf("p6", 17), null, "「終日」を選ぶと時間の制限がなくなる");
  eq(S.fitsPos("p6", 17, 660, 840), true, "終日にすればランチ時間でも警告が出ない");

  /* 最初の設定にもどす */
  S.ptResetAll();
  eq(S.DATA.postime, undefined, "「最初の設定にもどす」で保存内容が消える");
  eq(S.bandOf("p6", 17), [1020, 1380], "お店のはじめの設定にもどる");

  /* 終わりの時間だけ変える */
  S.openPosTime(); S.ptSet("p2", "t", "960"); S.savePosTime();
  eq(S.bandOf("p2", 17), [660, 960], "ランチ①を16時までに延ばせる");

  /* 開始を終わりより後にしても、必ず終わりが後ろにずれる（さかさまにならない） */
  S.openPosTime(); S.ptSet("p2", "f", "930"); S.savePosTime();
  eq(S.bandOf("p2", 17)[0] < S.bandOf("p2", 17)[1], true, "開始＜終わりが必ず保たれる");
}

/* ---------- 5. 設定を変えたら自動作成もそれに従うか ---------- */
sec("5. 設定した時間に自動作成が従うか");
{
  const { S } = env("ohashi");
  withStaff(S, 8);
  S.MDAY = 17;
  /* ホール①〜④とドリンクを「20時〜23時」に狭めると、18〜20時はそこに入らないはず */
  S.openPosTime();
  ["p6", "p7", "p8", "p9", "p10"].forEach((p) => S.ptSet(p, "f", "1200"));
  S.savePosTime();
  S.MDAY = 17; S.autoDraft();
  const early = (S.DATA.shift[17] || []).filter((e) =>
    S.minutes(e.t) <= 1200 && ["p6", "p7", "p8", "p9", "p10"].indexOf(e.pos) >= 0);
  eq(early.map((e) => e.pos + e.f + "-" + e.t), [], "20時より前に終わる帯は夜ポジションに入らない");
  eq((S.DATA.shift[17] || []).length > 0, true, "それでも下書きは作られる（人の割り当ては消えない）");
}

/* ---------- 6. 落合はこれまでどおりか ---------- */
sec("6. 落合はこれまでどおり動くか");
{
  const { S } = env("ochiai");
  eq(S.bandOf("p1", 17), [300, 570], "落合のオーブンは5時〜9時半（今までの設定のまま）");
  eq(S.bandOf("p10", 17), [480, 840], "落合の外販は平日8時〜14時（今までの設定のまま）");
  eq(S.bandOf("p6", 17), null, "時間を決めていないポジション（昼④）は終日のまま");
  eq(S.posFor(22).map((p) => p.label).indexOf("外販"), -1, "土日祝に外販が出ないのは今までどおり");
  withStaff(S, 12);
  let bad = 0, n = 0;
  for (const d of [16, 17, 22, 23, 29, 30]) { S.MDAY = d; S.autoDraft();
    (S.DATA.shift[d] || []).forEach((e) => { n++;
      if (!S.fitsPos(e.pos, d, S.minutes(e.f), S.minutes(e.t))) bad++; }); }
  eq([bad, n > 0], [0, true], "落合も時間の合わないポジションに置かれない");
}

/* ---------- 7. 古い保存データを壊さず読めるか ---------- */
sec("7. 今までの保存データを壊さないか");
{
  const { S } = env("ohashi");
  /* postime が無い（＝今クラウドにある）データ */
  S.DATA = { staff: [{ id: "a", name: "山田", pos: ["p5", "p6"] }],
             req: { a: { 17: { s: "tm", f: "18:00", t: "23:00" } } },
             asg: {}, submitted: { a: 1 },
             shift: { 17: [{ id: "x", sid: "a", pos: "p6", f: "18:00", t: "23:00" }] },
             updatedAt: 5 };
  S.ensureColors();
  eq(S.bandOf("p6", 17), [1020, 1380], "postimeが無いデータでも初期値で動く");
  eq(S.shiftOf(17).length, 1, "保存済みの帯がそのまま残る");
  eq(S.shiftOf(17)[0].pos, "p6", "保存済みのポジションが書き換えられない");
  eq(S.DATA.submitted.a, 1, "提出済みの記録が消えない");
  eq(S.canPos(S.staffBy("a"), "p11"), false, "既存の『できるポジション』設定に厨房は含まれない（店長が足す）");
  S.ROLE = "mgr"; S.MTAB = "board"; S.MDAY = 17; S.SHOPID = "ohashi";
  S.render();
  eq(S.document.getElementById("app").innerHTML.indexOf("ポジションの時間設定") >= 0, true, "店長画面にボタンが出る");
  eq(S.document.getElementById("app").innerHTML.indexOf("厨房</div>") >= 0, true, "ガントチャートに厨房の行が出る");
  S.renderPrint();
  eq(S.document.getElementById("printview").innerHTML.indexOf("18-23") >= 0, true, "印刷は今までどおり時刻で出る");
}

console.log("\n=========================\n  成功 " + ok + " / 失敗 " + ng + "\n=========================");
process.exit(ng ? 1 : 0);
