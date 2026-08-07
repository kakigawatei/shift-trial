/* 「落合の外販は頭数（必要人数）に数えない」の検証
   1. 外販は今までどおり優先スタッフが平日8:00-14:00に入る
   2. そのうえで、必要人数は外販の人とは別に満たされる（自動作成）
   3. 店長画面の「入っている人数／必要人数」に外販の人が入らない
   4. おはし二日町の p10（ホール④）は今までどおり数える
   5. 土日祝（外販なし）は今までどおり                                  */
const { makeEnv } = require("./harness");

let pass = 0, fail = 0;
function ok(c, n, x) { if (c) { pass++; console.log("  OK   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } }
function eq(a, b, n) { ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b }); }
function sec(t) { console.log("\n== " + t + " =="); }

const OCHIAI = [
  { id: "y", name: "鈴木勇気", pos: [] },
  { id: "t1", name: "高橋とき", pos: [] },
  { id: "t2", name: "高橋マユミ", pos: [] },
  { id: "t3", name: "逢坂和也", pos: [] },
  { id: "g1", name: "長谷部琉衣", pos: [] },
  { id: "g2", name: "鈴木彩愛", pos: [] },
  { id: "g3", name: "秋山さやか", pos: [] },
  { id: "a1", name: "アルバイトA", pos: [] },
  { id: "a2", name: "アルバイトB", pos: [] },
  { id: "a3", name: "アルバイトC", pos: [] },
  { id: "a4", name: "アルバイトD", pos: [] },
  { id: "a5", name: "アルバイトE", pos: [] },
  { id: "a6", name: "アルバイトF", pos: [] },
  { id: "a7", name: "アルバイトG", pos: [] },
];
function env(shop, staff) {
  const { sandbox: S, els } = makeEnv();
  S.applyShop(shop);
  S.DATA = { staff: JSON.parse(JSON.stringify(staff)), req: {}, asg: {}, submitted: {}, updatedAt: 1 };
  S.ensureColors();
  return { S, els };
}
/* 店長画面の「入っている人数／必要人数」のセルを [got, need] の並びで取り出す */
function cells(html) {
  const m = html.match(/<div class="gneed">[\s\S]*?<\/div><\/div>/)[0];
  const out = []; const re = /class="gn[^"]*">(\d+)\/(\d+)</g; let x;
  while ((x = re.exec(m))) out.push([+x[1], +x[2]]);
  return out;
}

/* ---------- 1. フラグと判定 ---------- */
sec("1. 外販だけが『頭数に数えない』ポジション");
{
  const { S } = env("ochiai", OCHIAI);
  eq(S.noCount("p10"), true, "落合の外販は頭数カウント対象外");
  eq(S.POS.filter((p) => S.noCount(p.id)).map((p) => p.label), ["外販"], "対象外は外販の1つだけ");
  S.applyShop("ohashi");
  eq(S.noCount("p10"), false, "おはし二日町の p10（ホール④）は今までどおり数える");
  eq(S.POS.filter((p) => S.noCount(p.id)).length, 0, "おはし二日町に対象外ポジションはない");
}

/* ---------- 2. 自動作成：外販とは別に必要人数を満たす ---------- */
sec("2. 自動作成：外販の人を頭数に入れず、必要人数はそれとは別に満たす");
{
  const { S } = env("ochiai", OCHIAI);
  [17, 18, 19, 20, 21].forEach((d) => {              /* 平日 */
    S.MDAY = d; S.autoDraft();
    const es = S.DATA.shift[d] || [];
    const gai = es.filter((e) => e.pos === "p10");
    const nm = {}; gai.forEach((e) => { nm[S.staffBy(e.sid).name] = 1; });
    eq(Object.keys(nm), ["長谷部琉衣"], d + "日：外販は今までどおり①の長谷部琉衣");
    const gmin = gai.reduce((a, e) => a + S.minutes(e.t) - S.minutes(e.f), 0);
    eq(gmin, 360, d + "日：外販は8:00-14:00の6時間");
    /* 1時間ごとに、外販を除いた人数が必要人数とぴったり合うか */
    const need = S.needsFor(d);
    let bad = [];
    for (let h = 0; h < need.length; h++) {
      const m = S.DAY_OPEN + h * 60;
      const got = es.filter((e) => e.pos !== "p10" && S.minutes(e.f) <= m && m < S.minutes(e.t)).length;
      if (got !== need[h]) bad.push({ h: m / 60, got, need: need[h] });
    }
    eq(bad, [], d + "日：外販を除いた人数が必要人数とぴったり（44時間ぶん）");
  });
}

/* ---------- 3. 店長画面の人数表示 ---------- */
sec("3. 店長画面の『入っている人数／必要人数』に外販が入らない");
{
  const { S } = env("ochiai", OCHIAI);
  S.MDAY = 17; S.ROLE = "mgr"; S.MTAB = "board";
  /* 8:00-9:00 は必要5人。店舗の仕事4人＋外販1人を手で入れた状態 */
  S.DATA.shift = { 17: [
    { id: "e1", sid: "a1", pos: "p3", f: "08:00", t: "12:00" },
    { id: "e2", sid: "a2", pos: "p4", f: "08:00", t: "12:00" },
    { id: "e3", sid: "a3", pos: "p5", f: "08:00", t: "12:00" },
    { id: "e4", sid: "a4", pos: "p6", f: "08:00", t: "12:00" },
    { id: "e5", sid: "g1", pos: "p10", f: "08:00", t: "14:00" },
  ] };
  const c = cells(S.mgrBoard());
  eq(c[3], [4, 5], "8時台は外販の1人を除いた4人／必要5人（外販を入れて5/5にしない）");
  const html = S.mgrBoard();
  ok(html.indexOf("外販は店舗の仕事と別のため人数に数えません") >= 0, "説明文に『外販は数えません』が出る");
  /* 外販の人を店舗の仕事（昼の空き）に動かせば、今までどおり数える */
  S.DATA.shift[17][4].pos = "p7";
  eq(cells(S.mgrBoard())[3], [5, 5], "外販から店舗の仕事へ動かせば5人と数える");

  /* 自動作成の結果は、どの時間も『外販を除いてぴったり』と表示される */
  S.DATA.shift = {}; S.MDAY = 17; S.autoDraft();
  const c2 = cells(S.mgrBoard());
  eq(c2.filter((x) => x[0] !== x[1]).length, 0, "自動作成後は全時間で 入っている人数＝必要人数（不足の赤が出ない）");
}

/* ---------- 4. おはし二日町は今までどおり ---------- */
sec("4. おはし二日町の p10（ホール④）は今までどおり数える");
{
  const OHASHI = [{ id: "a1", name: "山田", pos: [] }, { id: "a2", name: "佐藤", pos: [] }];
  const { S } = env("ohashi", OHASHI);
  S.MDAY = 17; S.ROLE = "mgr"; S.MTAB = "board";
  S.DATA.shift = { 17: [
    { id: "e1", sid: "a1", pos: "p10", f: "17:00", t: "21:00" },
    { id: "e2", sid: "a2", pos: "p7", f: "17:00", t: "21:00" },
  ] };
  const c = cells(S.mgrBoard());
  eq(c[7], [2, 2], "17時台はホール④の人も入れて2人／必要2人（従来どおり）");
  ok(S.mgrBoard().indexOf("人数に数えません") < 0, "おはし二日町には『数えません』の説明は出ない");
}

/* ---------- 5. 土日祝は今までどおり外販なし ---------- */
sec("5. 土日祝（外販なし）は今までどおり");
{
  const { S } = env("ochiai", OCHIAI);
  [16, 22, 23].forEach((d) => {
    S.MDAY = d; S.autoDraft();
    const es = S.DATA.shift[d] || [];
    eq(es.filter((e) => e.pos === "p10").length, 0, d + "日：外販に人が入らない");
    const need = S.needsFor(d);
    let bad = [];
    for (let h = 0; h < need.length; h++) {
      const m = S.DAY_OPEN + h * 60;
      const got = es.filter((e) => S.minutes(e.f) <= m && m < S.minutes(e.t)).length;
      if (got !== need[h]) bad.push({ h: m / 60, got, need: need[h] });
    }
    eq(bad, [], d + "日：必要人数どおり（34時間ぶん）");
  });
}

console.log("\n=========================\n  成功 " + pass + " / 失敗 " + fail + "\n=========================");
process.exit(fail ? 1 : 0);
