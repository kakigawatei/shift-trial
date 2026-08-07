/* 「同じポジションに細切れで複数人が入る」不具合の検証
   1. 上限で上がった人が同じ枠で入り直し、それまでの帯が消えていた（色帯と必要人数の不一致）
   2. 空いているポジションがあるのに、同じポジションに何人も入れていた
   3. 同じ時間・同じポジションの帯が重なって描かれ、下の帯が見えなかった          */
const { makeEnv } = require("./harness");
const cp = require("child_process"), path = require("path"), vm = require("vm");

let pass = 0, fail = 0;
function ok(c, n, x) { if (c) { pass++; console.log("  OK   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } }
function eq(a, b, n) { ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b }); }
function sec(t) { console.log("\n== " + t + " =="); }

/* 「修正前」のバージョンを読み込む（不具合が本当に直ったかを比べるため） */
function loadOld() {
  const OLD = cp.execSync("git show 2a0557c:index.html", { cwd: path.join(__dirname, ".."), maxBuffer: 1 << 24 }).toString("utf8");
  const CODE = OLD.match(/<script>([\s\S]*?)<\/script>/)[1];
  const m = {}, els = {};
  const mkEl = (id) => ({ id, innerHTML: "", textContent: "", classList: { _s: new Set(), add() {}, remove() {}, contains: () => false } });
  ["app", "printview", "mask", "sheet", "toast"].forEach((i) => (els[i] = mkEl(i)));
  const sb = { document: { getElementById: (i) => els[i] || null, addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: () => {} },
    fetch: () => new Promise(() => {}), window: { addEventListener() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, console, confirm: () => true };
  sb.globalThis = sb; vm.createContext(sb); vm.runInContext(CODE, sb, { filename: "old" });
  return sb;
}

/* お客様の報告に近い構成：早番／昼／午後が混ざった落合のスタッフ */
const STAFF = [
  { id: "s0", name: "内海", avF: "05:00", avT: "14:00", pos: [] },
  { id: "s1", name: "池田", avF: "05:00", avT: "14:00", pos: [] },
  { id: "s2", name: "大泉", avF: "08:00", avT: "15:00", pos: [] },
  { id: "s3", name: "佐藤", avF: "08:00", avT: "15:00", pos: [] },
  { id: "s4", name: "鈴木", avF: "09:00", avT: "17:00", pos: [] },
  { id: "s5", name: "高橋", avF: "13:00", avT: "21:00", pos: [] },
  { id: "s6", name: "田中", avF: "13:00", avT: "21:00", pos: [] },
  { id: "s7", name: "渡辺", avF: "05:00", avT: "21:00", pos: [] },
  { id: "s8", name: "伊藤", avF: "07:00", avT: "13:00", pos: [] },
];
function seed(S, shop) {
  S.applyShop(shop);
  S.DATA = { staff: JSON.parse(JSON.stringify(STAFF)), req: {}, asg: {}, submitted: {}, updatedAt: 1 };
  S.ensureColors();
}
/* その日の「入っている人数」が必要人数に足りているか（不足のべ時間） */
function lackOf(S, day) {
  const ents = S.DATA.shift[day] || []; let lack = 0;
  for (let m = S.DAY_OPEN; m < S.DAY_CLOSE; m += 60) {
    let got = 0; ents.forEach((e) => { if (S.minutes(e.f) <= m && m < S.minutes(e.t)) got++; });
    if (got < S.needAt(m, day)) lack += S.needAt(m, day) - got;
  }
  return lack;
}
/* 働いているのべ時間 */
function totalMin(S, day) { let t = 0; (S.DATA.shift[day] || []).forEach((e) => { t += S.minutes(e.t) - S.minutes(e.f); }); return t; }

/* ---------- 1. 帯が消えていた不具合 ---------- */
sec("1. 上限で上がった人が入り直すと、それまでの帯が消えていた");
{
  const OLD = loadOld(), { sandbox: NEW } = makeEnv();
  seed(OLD, "ochiai"); seed(NEW, "ochiai");
  OLD.MDAY = 17; OLD.autoDraft();
  NEW.MDAY = 17; NEW.autoDraft();

  /* 修正前：鈴木が15時に上限で上がって同じ枠で入り直し、9:00-15:00 の6時間が消えていた */
  const oldSuzuki = (OLD.DATA.shift[17] || []).filter((e) => e.sid === "s4").map((e) => e.f + "-" + e.t);
  const newSuzuki = (NEW.DATA.shift[17] || []).filter((e) => e.sid === "s4").map((e) => e.f + "-" + e.t);
  eq(oldSuzuki, ["15:00-17:00"], "修正前：鈴木さんの帯は15:00-17:00だけ（9:00-15:00が消えていた）");
  eq(newSuzuki, ["09:00-15:00"], "修正後：鈴木さんは9:00-15:00で1本（6時間の上限どおり）");

  ok(totalMin(OLD, 17) < totalMin(NEW, 17), "修正前は働く時間が短くなっていた（帯が消えた分）",
     { 旧: totalMin(OLD, 17) / 60 + "h", 新: totalMin(NEW, 17) / 60 + "h" });

  /* 9時台は必要6人。修正前は5人しか帯が無く「色帯と必要人数の不一致」になっていた */
  const cnt = (S, m) => (S.DATA.shift[17] || []).filter((e) => S.minutes(e.f) <= m && m < S.minutes(e.t)).length;
  eq([cnt(OLD, 540), OLD.needAt(540, 17)], [5, 6], "修正前：9時台は色帯5本なのに必要6人（不一致）");
  eq([cnt(NEW, 540), NEW.needAt(540, 17)], [6, 6], "修正後：9時台は色帯6本＝必要6人（一致）");
  ok(lackOf(OLD, 17) > lackOf(NEW, 17), "修正後のほうが必要人数を満たしている", { 旧: lackOf(OLD, 17), 新: lackOf(NEW, 17) });
}

/* ---------- 2. 同じ人が1日に何本も（細切れ） ---------- */
sec("2. 同じ人が1日に2本以上に分かれないか（上限を設けた落合）");
{
  const { sandbox: S } = makeEnv(); seed(S, "ochiai");
  let dup = 0, checked = 0;
  S.PERIOD.days.forEach((d) => { S.MDAY = d; S.autoDraft();
    const seen = {}; (S.DATA.shift[d] || []).forEach((e) => { checked++; if (seen[e.sid]) dup++; seen[e.sid] = 1; }); });
  eq([dup, checked > 0], [0, true], "16日ぶん、同じ人が1日に2本に分かれた帯は0件");
}

/* ---------- 3. 同じポジションに複数人（本題） ---------- */
sec("3. 空いているポジションがあるのに同じポジションへ入れていないか");
{
  const OLD = loadOld(), { sandbox: NEW } = makeEnv();
  function measure(S) {
    seed(S, "ochiai");
    let multi = 0, withEmpty = 0;
    S.PERIOD.days.forEach((d) => { S.MDAY = d; S.autoDraft();
      const ents = S.DATA.shift[d] || [], byPos = {};
      ents.forEach((e) => { (byPos[e.pos] = byPos[e.pos] || []).push(e); });
      const empty = S.posFor(d).map((p) => p.id).filter((p) => !byPos[p]).length;
      let mm = 0; Object.keys(byPos).forEach((p) => { if (byPos[p].length > 1) mm += byPos[p].length - 1; });
      multi += mm; if (mm && empty) withEmpty++; });
    return { multi, withEmpty };
  }
  const o = measure(OLD), n = measure(NEW);
  ok(o.multi > 0, "修正前は同じポジションに複数人が入っていた（" + o.multi + "件）");
  ok(n.multi < o.multi, "修正後は減っている（" + o.multi + "件 → " + n.multi + "件）", { 旧: o, 新: n });
  eq(n.withEmpty, 0, "修正後：『空いているポジションがあるのに同じ所に入れる』日は0日");
}

/* ---------- 4. 時間帯を守れているか（やりすぎ防止） ---------- */
sec("4. 空きを優先しすぎて、時間帯の合わないポジションに置いていないか");
{
  const { sandbox: S } = makeEnv();
  ["ochiai", "ohashi"].forEach((shop) => {
    seed(S, shop);
    let outBand = 0, total = 0;
    S.PERIOD.days.forEach((d) => { S.MDAY = d; S.autoDraft();
      (S.DATA.shift[d] || []).forEach((e) => { total++;
        if (!S.fitsPos(e.pos, d, S.minutes(e.f), S.minutes(e.t))) outBand++; }); });
    eq([outBand, total > 0], [0, true], shop + "：すべての帯がポジションの時間帯と重なっている");
  });
  /* 9:00-14:00 の人をどこに置くか。外販(8:00-14:00)は頭数に数えない独立ポジションになったので、
     頭数あわせの人は自動では置かず、次に時間の合う昼③(8:30-15:00)へ */
  seed(S, "ochiai");
  eq(S.freePos([], 540, 840, "s0", 17), "p5", "外販が空いていても頭数あわせの人は置かず、時間の合う昼③へ");
  eq(S.freePos([{ pos: "p5", f: "09:00", t: "14:00" }], 540, 840, "s0", 17), "p4",
     "昼③に先客がいれば、次に時間の合う昼②へ（同じ所に重ねない・外販にも逃げない）");
  /* 時間の合う所がすべて埋まっていても、まったく合わない空きポジションには逃げないこと */
  const others = S.POS.filter((p) => p.id !== "p2").map((p) => ({ pos: p.id, f: "05:00", t: "06:00" }));
  const got = S.freePos(others, 540, 840, "s0", 17);
  ok(got !== "p2", "カレーパン(6:00-9:30)が空いていても、時間が合わないので置かない（→" + S.posLabel(got) + "）");
}

/* ---------- 5. ガントの段分け（帯が隠れない） ---------- */
sec("5. 同じポジション・同じ時間の帯を上下に分けて表示する");
{
  const { sandbox: S } = makeEnv(); seed(S, "ochiai");
  S.MDAY = 17;
  /* 店長が手で同じポジション・同じ時間に2人入れた状態を作る */
  S.DATA.shift = { 17: [
    { id: "a", sid: "s0", pos: "p3", f: "08:00", t: "12:00" },
    { id: "b", sid: "s1", pos: "p3", f: "09:00", t: "12:00" },
    { id: "c", sid: "s2", pos: "p4", f: "08:00", t: "12:00" },
  ] };
  const e0 = S.DATA.shift[17][0], e1 = S.DATA.shift[17][1], e2 = S.DATA.shift[17][2];
  ok(S.posDup(17, e0) && S.posDup(17, e1), "同じポジションの重なりを見つけられる");
  ok(!S.posDup(17, e2), "重なっていない帯は重なり扱いにしない");
  eq(S.lanesOf([{ f: "08:00", t: "12:00" }, { f: "09:00", t: "12:00" }]), { lane: [0, 1], n: 2 }, "重なる2本は1段目と2段目に分かれる");
  eq(S.lanesOf([{ f: "08:00", t: "10:00" }, { f: "10:00", t: "12:00" }]), { lane: [0, 0], n: 1 }, "続けて並ぶ2本は同じ段（今までどおりの見た目）");

  const html = S.mgrBoard();
  const bands = html.match(/class="gband[^"]*"[^>]*style="([^"]*)"/g) || [];
  ok(bands.length === 3, "帯は3本とも描かれる（重ねて隠さない）", bands.length);
  ok(bands.filter((b) => b.indexOf("top:") >= 0).length === 2, "重なっている2本だけ上下に振り分けられる");
  ok(bands.filter((b) => b.indexOf("top:") >= 0).every((b) => b.indexOf("bottom:auto") >= 0), "段分けした帯は高さが固定される");
  ok(html.indexOf("⚠") >= 0, "同じポジションの重なりには⚠が出る");
}

/* ---------- 6. 既存データ・他店舗を壊していないか ---------- */
sec("6. 保存済みデータと おはし二日町 を壊していないか");
{
  const { sandbox: S } = makeEnv(); S.applyShop("ochiai");
  const keep = { staff: JSON.parse(JSON.stringify(STAFF)), req: { s0: { 17: { s: "ng" } } }, asg: {}, submitted: { s0: 111 },
    shift: { 20: [{ id: "keep1", sid: "s0", pos: "p3", f: "07:00", t: "12:00" }] },
    postime: { wd: { p3: [420, 720] }, hd: {} }, updatedAt: 5 };
  S.DATA = JSON.parse(JSON.stringify(keep)); S.ensureColors();
  eq(S.shiftOf(20), keep.shift[20], "保存済みの帯はそのまま（自動で書き換えない）");
  eq(S.DATA.submitted, { s0: 111 }, "提出済みの記録が消えない");
  eq(S.DATA.postime, keep.postime, "ポジションの時間設定が消えない");
  eq(S.reqOf("s0", 17).s, "ng", "希望データが消えない");
  /* 描画しても保存データは変わらない */
  S.MDAY = 20; const before = JSON.stringify(S.DATA); S.mgrBoard(); S.renderPrint();
  ok(JSON.stringify(S.DATA).indexOf('"keep1"') >= 0, "画面を描いても保存済みの帯が残る");
  eq(JSON.parse(before).shift[20], keep.shift[20], "画面を描いても帯の中身が変わらない");
}

console.log("\n=========================\n  成功 " + pass + " / 失敗 " + fail + "\n=========================");
process.exit(fail ? 1 : 0);
