/* 落合「社員①②③」ポジションの検証
   1. 落合のポジションはオーブンの上に社員①②③が並ぶ（おはしには無い）
   2. 自動作成：社員は「社員①②③」の場所に入る（社員2人なら別々の席）
   3. アルバイトは社員①②③をできるだけ空ける（他に空きがあれば入らない）
   4. 優先スタッフ（オーブン＝鈴木勇気など）は社員①②③より優先される
   5. 手で追加するときの初期ポジションは社員①にならない
   6. 保存済みの postime/prio（社員①②③のキーが無い古いデータ）でも動く */
const { makeEnv } = require("./harness");

let pass = 0, fail = 0;
function ok(c, n, x) { if (c) { pass++; console.log("  OK   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } }
function eq(a, b, n) { ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b }); }
function sec(t) { console.log("\n== " + t + " =="); }

const STAFF = [
  { id: "e1s", name: "社員の内海", avF: "05:00", avT: "14:00", pos: [], emp: 1 },
  { id: "e2s", name: "社員の渡辺", pos: [], emp: 1 },
  { id: "a1", name: "アルバイトA", pos: [] },
  { id: "a2", name: "アルバイトB", pos: [] },
  { id: "a3", name: "アルバイトC", pos: [] },
  { id: "a4", name: "アルバイトD", pos: [] },
  { id: "a5", name: "アルバイトE", pos: [] },
  { id: "a6", name: "アルバイトF", pos: [] },
  { id: "a7", name: "アルバイトG", pos: [] },
  { id: "a8", name: "アルバイトH", pos: [] },
];
function env(shop, staff, tweak) {
  const { sandbox: S, els } = makeEnv();
  S.applyShop(shop);
  S.DATA = { staff: JSON.parse(JSON.stringify(staff)), req: {}, asg: {}, submitted: {}, updatedAt: 1 };
  if (tweak) tweak(S);
  S.ensureColors();
  return { S, els };
}
function draft(S, day) { S.MDAY = day; S.autoDraft(); return S.DATA.shift[day] || []; }
const EMPPOS = ["e1", "e2", "e3"];

/* ---------- 1. ポジションの並び ---------- */
sec("1. 落合：オーブンの上に社員①②③");
{
  const { S } = env("ochiai", STAFF);
  eq(S.POS.slice(0, 4).map((p) => p.label), ["社員①", "社員②", "社員③", "オーブン"], "先頭から社員①②③→オーブンの順");
  eq(S.POS.filter((p) => p.emp).map((p) => p.id), EMPPOS, "社員の席はe1/e2/e3（既存のp1〜p10とぶつからない）");
  ok(S.mgrBoard().indexOf("社員①") >= 0, "シフト作成ボードに社員①の行が出る");
  const { S: OH } = env("ohashi", STAFF);
  eq(OH.POS.filter((p) => p.emp).length, 0, "おはし二日町には社員の席は増えない");
}

/* ---------- 2. 社員は社員①②③に入る ---------- */
sec("2. 自動作成で社員が社員①②③に入る");
{
  const { S } = env("ochiai", STAFF);
  [17, 20, 23].forEach((d) => {
    const ents = draft(S, d);
    const empEnts = ents.filter((e) => S.staffBy(e.sid).emp);
    ok(empEnts.length > 0, d + "日：社員が入っている");
    ok(empEnts.every((e) => EMPPOS.indexOf(e.pos) >= 0), d + "日：社員は全員「社員①②③」の席", empEnts.map((e) => S.staffBy(e.sid).name + "->" + S.posLabel(e.pos)));
    /* 同じ時間に同じ席へ2人入らない */
    const dup = empEnts.filter((e) => S.posDup(d, e));
    eq(dup.length, 0, d + "日：社員2人は別々の席（同じ席に重ならない）");
  });
}

/* ---------- 3. アルバイトは社員の席を空ける ---------- */
sec("3. アルバイトは社員①②③をできるだけ空ける");
{
  const { S } = env("ochiai", STAFF);
  [17, 20, 23].forEach((d) => {
    const ents = draft(S, d);
    const part = ents.filter((e) => !S.staffBy(e.sid).emp && EMPPOS.indexOf(e.pos) >= 0);
    eq(part.length, 0, d + "日：アルバイトが社員の席に入らない", part.map((e) => S.staffBy(e.sid).name));
  });
  /* 社員が1人もいないお店でも、アルバイトが社員の席に入らない（通常の席で足りる場合） */
  const { S: S2 } = env("ochiai", STAFF.map((s) => Object.assign({}, s, { emp: 0 })));
  [17, 23].forEach((d) => {
    const ents = draft(S2, d);
    const inEmp = ents.filter((e) => EMPPOS.indexOf(e.pos) >= 0);
    eq(inEmp.length, 0, d + "日：社員がいなくても社員の席は空いたまま", inEmp.map((e) => S2.staffBy(e.sid).name));
  });
}

/* ---------- 4. 優先スタッフは社員の席より優先 ---------- */
sec("4. 社員でも優先スタッフの場所（オーブン等）が先");
{
  const withY = STAFF.concat([{ id: "y", name: "鈴木勇気", pos: [], emp: 1 }]);
  const { S } = env("ochiai", withY);
  const ents = draft(S, 17);
  const yEnts = ents.filter((e) => e.sid === "y").sort((a, b) => S.minutes(a.f) - S.minutes(b.f));
  ok(yEnts.length >= 1 && yEnts[0].pos === "p1", "社員の鈴木勇気は朝はオーブン（優先スタッフの指定が先）", yEnts.map((e) => S.posLabel(e.pos) + " " + e.f + "-" + e.t));
  const others = ents.filter((e) => S.staffBy(e.sid).emp && e.sid !== "y");
  ok(others.every((e) => EMPPOS.indexOf(e.pos) >= 0), "ほかの社員は社員①②③", others.map((e) => S.staffBy(e.sid).name + "->" + S.posLabel(e.pos)));
}

/* ---------- 5. 手で追加するときの初期値 ---------- */
sec("5. ＋追加の初期ポジションは社員①にしない");
{
  const { S, els } = env("ochiai", STAFF);
  S.shiftOf(17); S.openEnt(17, null);
  ok(els.sheet.innerHTML.indexOf('value="p1" selected') >= 0 || els.sheet.innerHTML.indexOf('"p1" selected') >= 0,
     "初期の「どこ」はオーブン（社員①ではない）", (els.sheet.innerHTML.match(/value="\w+" selected/) || [])[0]);
}

/* ---------- 6. 古い保存データ（社員①②③のキーが無い）でも動く ---------- */
sec("6. 保存済みの postime / prio に社員①②③が無くても壊れない");
{
  const { S } = env("ochiai", STAFF, (S) => {
    /* 以前のバージョンで保存された形：p1〜p10のキーだけ */
    S.DATA.postime = { wd: { p1: [300, 570], p3: 0 }, hd: { p1: [300, 570] } };
    S.DATA.prio = { p2: [] };
  });
  eq(S.bandOf("e1", 17), null, "社員①の時間帯は「終日」あつかい");
  eq(S.bandOf("p1", 17), [300, 570], "保存済みのオーブンの時間帯はそのまま");
  eq(S.prioOf("e1"), [], "社員①の優先スタッフは「指定なし」");
  const ents = draft(S, 17);
  ok(ents.length > 0, "古い保存データのまま自動作成できる");
  ok(ents.filter((e) => S.staffBy(e.sid).emp).every((e) => EMPPOS.indexOf(e.pos) >= 0), "その場合も社員は社員①②③に入る");
}

console.log("\n=========================");
console.log("  成功 " + pass + " / 失敗 " + fail);
console.log("=========================");
process.exit(fail ? 1 : 0);
