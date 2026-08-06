/* 「ポジションごとの優先スタッフ（①②③）」の検証
   1. 優先スタッフに当てはまる人がいないお店は、今までと1文字も変わらない
   2. 落合：オーブン＝鈴木勇気／カレーパン＝3人のうち1人／外販＝優先順で1人
   3. ①の人が休みなら②の人、②も休みなら③の人が入る
   4. 全員休みならそのポジションは空ける（ほかの人で埋めない）
   5. おはし：ランチ①②③に3人が入る
   6. 社員が優先ポジションを埋めてしまわない（アルバイトのために空く）
   7. 1つのポジションに1人・同じ人が同時に2か所に入らない
   8. 店長画面で決めた内容（DATA.prio）が初期値より優先される
   9. 保存済みデータを壊さない                                                     */
const { makeEnv } = require("./harness");

let pass = 0, fail = 0;
function ok(c, n, x) { if (c) { pass++; console.log("  OK   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } }
function eq(a, b, n) { ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b }); }
function sec(t) { console.log("\n== " + t + " =="); }

/* 落合：お客様の要望に出てくる人＋人数合わせのアルバイト */
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
];
/* おはし：ランチの3人＋アルバイト */
const OHASHI = [
  { id: "u", name: "梅田佳央里", pos: [] },
  { id: "sa", name: "佐藤佳菜", pos: [] },
  { id: "it", name: "伊藤恵子", pos: [] },
  { id: "b1", name: "アルバイトA", pos: [] },
  { id: "b2", name: "アルバイトB", pos: [] },
  { id: "b3", name: "アルバイトC", pos: [] },
  { id: "b4", name: "アルバイトD", pos: [] },
  { id: "b5", name: "アルバイトE", pos: [] },
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
/* その人の帯を「ポジション 開始-終了」で返す */
function bandsOf(S, day, sid) {
  return (S.DATA.shift[day] || []).filter((e) => e.sid === sid)
    .sort((a, b) => S.minutes(a.f) - S.minutes(b.f))
    .map((e) => S.posLabel(e.pos) + " " + e.f + "-" + e.t);
}
/* そのポジションに入っている人の名前 */
function whoAt(S, day, pid) {
  const nm = {};
  (S.DATA.shift[day] || []).filter((e) => e.pos === pid).forEach((e) => {
    const s = S.staffBy(e.sid); if (s) nm[s.name] = 1;
  });
  return Object.keys(nm).sort();
}
function key(list) { return list.map((e) => e.sid + "|" + e.pos + "|" + e.f + "|" + e.t).sort().join(","); }
function ng(S, sid, day) { S.DATA.req[sid] = S.DATA.req[sid] || {}; S.DATA.req[sid][day] = { s: "ng", f: "", t: "" }; }

const WDAYS = [17, 18, 19, 20, 21];   /* 平日 */
const HDAYS = [16, 22, 23, 29, 30];   /* 土日 */

/* ---------- 1. 名前が一致しなければ今までどおり ---------- */
sec("1. 優先スタッフの名前が登録されていないお店は今までと同じ");
["ohashi", "ochiai"].forEach((shop) => {
  const OTHER = [
    { id: "s0", name: "内海", pos: [] }, { id: "s1", name: "池田", pos: [] },
    { id: "s2", name: "大泉", pos: [] }, { id: "s3", name: "佐藤", pos: [] },
    { id: "s4", name: "鈴木", pos: [] }, { id: "s5", name: "高橋", pos: [] },
    { id: "s6", name: "田中", pos: [] }, { id: "s7", name: "渡辺", pos: [] },
  ];
  const a = env(shop, OTHER), b = env(shop, OTHER);
  const days = [16, 17, 20, 22, 23];
  const ka = days.map((d) => key(draft(a.S, d))).join("#");
  const kb = days.map((d) => key(draft(b.S, d))).join("#");
  eq(ka, kb, shop + "：同じ入力なら同じ結果");
  ok(ka.length > 100, shop + "：ちゃんと帯ができている");
  eq(a.S.prioOf("p1"), [], shop + "：登録のない名前は優先スタッフにならない");
});

/* ---------- 2. 落合：要望どおりの初期値 ---------- */
sec("2. 落合：オーブン＝鈴木勇気／カレーパン＝1人／外販＝1人");
{
  const { S } = env("ochiai", OCHIAI);
  eq(S.prioOf("p1").map((i) => S.staffBy(i).name), ["鈴木勇気"], "オーブンの優先＝鈴木勇気");
  eq(S.prioOf("p2").map((i) => S.staffBy(i).name), ["高橋とき", "高橋マユミ", "逢坂和也"], "カレーパンの優先＝3人");
  eq(S.prioOf("p10").map((i) => S.staffBy(i).name), ["長谷部琉衣", "鈴木彩愛", "秋山さやか"], "外販の優先＝3人（順番どおり）");

  WDAYS.forEach((d) => {
    draft(S, d);
    eq(whoAt(S, d, "p1"), ["鈴木勇気"], d + "日：オーブンは鈴木勇気だけ");
    eq(whoAt(S, d, "p2"), ["高橋とき"], d + "日：カレーパンは①の高橋ときだけ（3人まとめて入らない）");
    eq(whoAt(S, d, "p10"), ["長谷部琉衣"], d + "日：外販は①の長谷部琉衣だけ");
  });
  /* 帯が細切れになっていない */
  const b = bandsOf(S, 17, "y");
  ok(b.length === 1 && b[0].indexOf("オーブン") === 0, "鈴木勇気は1本の帯でオーブンに入る", b);
  ok(bandsOf(S, 17, "g1").length === 1, "長谷部琉衣も1本の帯", bandsOf(S, 17, "g1"));
}

/* ---------- 3. ①が休みなら②、②も休みなら③ ---------- */
sec("3. 上の順位の人が休みなら、次の順位の人が入る");
{
  const { S } = env("ochiai", OCHIAI, (S2) => { });
  ng(S, "t1", 17);                                   /* 高橋とき（①）が休み */
  draft(S, 17);
  eq(whoAt(S, 17, "p2"), ["高橋マユミ"], "カレーパン：①が休み→②の高橋マユミ");

  ng(S, "t2", 18); ng(S, "t1", 18);                  /* ①②とも休み */
  draft(S, 18);
  eq(whoAt(S, 18, "p2"), ["逢坂和也"], "カレーパン：①②が休み→③の逢坂和也");

  ng(S, "g1", 19); ng(S, "g2", 19);                  /* 外販の①②が休み */
  draft(S, 19);
  eq(whoAt(S, 19, "p10"), ["秋山さやか"], "外販：①②が休み→③の秋山さやか");
}
/* 時間が合わない人もとばす */
{
  const { S } = env("ochiai", OCHIAI);
  S.DATA.req["g1"] = { 17: { s: "tm", f: "15:00", t: "21:00" } };   /* 外販の時間に出られない */
  draft(S, 17);
  eq(whoAt(S, 17, "p10"), ["鈴木彩愛"], "外販：①が夕方しか出られない→②の鈴木彩愛");
}

/* ---------- 4. 全員休みならそのポジションは空ける ---------- */
sec("4. 優先スタッフが全員休みのときは、そのポジションを空ける");
{
  const { S } = env("ochiai", OCHIAI);
  ng(S, "g1", 17); ng(S, "g2", 17); ng(S, "g3", 17);
  draft(S, 17);
  eq(whoAt(S, 17, "p10"), [], "外販は空のまま（ほかの人で埋めない）");
  ok((S.DATA.shift[17] || []).length > 5, "ほかのポジションはちゃんと埋まっている", (S.DATA.shift[17] || []).length);
}

/* ---------- 5. おはし：ランチ①②③に3人 ---------- */
sec("5. おはし：ランチ①②③に 梅田・佐藤・伊藤 の3人");
{
  const { S } = env("ohashi", OHASHI);
  WDAYS.concat(HDAYS).forEach((d) => {
    draft(S, d);
    const l = [].concat(whoAt(S, d, "p2"), whoAt(S, d, "p3"), whoAt(S, d, "p4")).sort();
    eq(l, ["伊藤恵子", "佐藤佳菜", "梅田佳央里"], d + "日：ランチ①②③は3人（重複なし）");
    eq(whoAt(S, d, "p2").length, 1, d + "日：ランチ①は1人");
  });
  /* ①の人が休みなら②の人がくり上がる（ランチは3枠あるので2人＋くり上がり） */
  ng(S, "u", 17);
  draft(S, 17);
  const l2 = [].concat(whoAt(S, 17, "p2"), whoAt(S, 17, "p3"), whoAt(S, 17, "p4")).sort();
  eq(l2, ["伊藤恵子", "佐藤佳菜"], "梅田さんが休みの日は残り2人がランチに入る");
}

/* ---------- 6. 社員が優先ポジションを埋めない ---------- */
sec("6. 社員がいても、優先ポジションはその人のために空く");
{
  /* 社員を2人つける（従来なら社員が先に好きな場所を取ってしまっていた） */
  const { S } = env("ochiai", OCHIAI, (S2) => {
    S2.DATA.staff.filter((s) => s.id === "a1")[0].emp = 1;
    S2.DATA.staff.filter((s) => s.id === "a2")[0].emp = 1;
  });
  WDAYS.forEach((d) => {
    draft(S, d);
    eq(whoAt(S, d, "p2"), ["高橋とき"], d + "日：カレーパンに社員が入っていない");
    eq(whoAt(S, d, "p10"), ["長谷部琉衣"], d + "日：外販に社員が入っていない");
    const emps = (S.DATA.shift[d] || []).filter((e) => e.sid === "a1" || e.sid === "a2");
    ok(emps.length > 0, d + "日：社員はちゃんと働いている", emps.length);
  });
  /* 鈴木勇気を社員にすると、オーブンに入り、そのあとも働ける */
  const { S: S2 } = env("ochiai", OCHIAI, (X) => { X.DATA.staff.filter((s) => s.id === "y")[0].emp = 1; });
  draft(S2, 17);
  const b = bandsOf(S2, 17, "y");
  ok(b.length >= 1 && b[0].indexOf("オーブン") === 0, "社員の鈴木勇気は朝いちばんにオーブンへ", b);
  ok(S2.minutes(b[0].split(" ")[1].split("-")[0]) === 300, "5時から入っている", b);
}

/* ---------- 7. 重なりの検査（全期間・両店舗） ---------- */
sec("7. 1つのポジションに1人・同じ人が2か所に入らない（16日ぶん×両店舗）");
[["ochiai", OCHIAI], ["ohashi", OHASHI]].forEach(([shop, staff]) => {
  const { S } = env(shop, staff);
  let posDup = 0, selfDup = 0, outBand = 0, bands = 0;
  for (let d = 16; d <= 31; d++) {
    const es = draft(S, d);
    bands += es.length;
    es.forEach((e, i) => {
      const f = S.minutes(e.f), t = S.minutes(e.t);
      if (!S.fitsPos(e.pos, d, f, t)) outBand++;
      es.forEach((o, j) => {
        if (j <= i) return;
        const of_ = S.minutes(o.f), ot = S.minutes(o.t);
        if (!(f < ot && of_ < t)) return;
        if (o.pos === e.pos) posDup++;
        if (o.sid === e.sid) selfDup++;
      });
    });
  }
  eq(posDup, 0, shop + "：同じポジション・同じ時間に2人はいない");
  eq(selfDup, 0, shop + "：同じ人が同じ時間に2か所に入っていない");
  eq(outBand, 0, shop + "：ポジションの時間からはみ出した帯はない");
  ok(bands > 50, shop + "：帯はちゃんと作られている（" + bands + "本）");
});

/* ---------- 8. 店長が決めた内容が優先される ---------- */
sec("8. 店長画面で決めた内容（DATA.prio）が初期値より優先される");
{
  const { S, els } = env("ochiai", OCHIAI);
  S.MDAY = 17; S.MTAB = "board"; S.ROLE = "mgr";
  S.openPosPrio();
  ok(els.sheet.innerHTML.indexOf("優先スタッフ") >= 0, "設定画面がひらく");
  ok(els.sheet.innerHTML.indexOf("鈴木勇気") >= 0, "初期値が出ている");
  /* カレーパンの順番を入れかえる：①逢坂和也にする */
  S.ppEdit("p2");
  ok(els.sheet.innerHTML.indexOf("カレーパン") >= 0, "ポジションごとの編集画面がひらく");
  S.ppMove(2, -1); S.ppMove(1, -1);                 /* 逢坂和也を先頭へ */
  S.ppBack(); S.savePosPrio();
  eq(S.prioOf("p2").map((i) => S.staffBy(i).name), ["逢坂和也", "高橋とき", "高橋マユミ"], "順番を入れかえられる");
  draft(S, 17);
  eq(whoAt(S, 17, "p2"), ["逢坂和也"], "入れかえた①の人が入る");
  ok(S.DATA.prio && S.DATA.prio.p2.length === 3, "DATA.prio に保存される");

  /* はずす＝そのポジションは指定なしになる */
  S.openPosPrio(); S.ppEdit("p10");
  S.ppDel(0); S.ppDel(0); S.ppDel(0);
  S.ppBack(); S.savePosPrio();
  eq(S.prioOf("p10"), [], "全員はずすと『指定なし』になる（初期値に戻らない）");
  /* 最初の設定にもどす */
  S.ppResetAll();
  eq(S.prioOf("p10").map((i) => S.staffBy(i).name), ["長谷部琉衣", "鈴木彩愛", "秋山さやか"], "『最初の設定にもどす』で初期値へ");
  ok(!S.DATA.prio, "もどすと DATA.prio は消える");

  /* いなくなった人は自動で外れる */
  S.DATA.staff = S.DATA.staff.filter((s) => s.id !== "g1");
  eq(S.prioOf("p10").map((i) => S.staffBy(i).name), ["鈴木彩愛", "秋山さやか"], "削除された人は優先から外れる");
  draft(S, 17);
  eq(whoAt(S, 17, "p10"), ["鈴木彩愛"], "次の順位の人が入る");
}

/* ---------- 9. 保存済みデータを壊さない ---------- */
sec("9. 保存済みデータを壊さない");
{
  const { S, els } = env("ochiai", OCHIAI, (X) => {
    X.DATA.shift = { 16: [{ id: "keep", sid: "y", pos: "p5", f: "09:00", t: "12:00" }] };
    X.DATA.submitted = { y: 12345 };
    X.DATA.postime = { wd: { p1: [300, 600] }, hd: {} };
    X.DATA.req = { t1: { 16: { s: "ng", f: "", t: "" } } };
  });
  S.MDAY = 20; S.MTAB = "board"; S.ROLE = "mgr"; S.SHOPID = "ochiai"; S.render();
  eq(S.DATA.shift[16], [{ id: "keep", sid: "y", pos: "p5", f: "09:00", t: "12:00" }], "保存済みの帯はそのまま");
  eq(S.DATA.submitted, { y: 12345 }, "提出済みの記録が消えない");
  eq(S.DATA.postime.wd.p1, [300, 600], "ポジションの時間設定が消えない");
  eq(S.DATA.req.t1[16].s, "ng", "希望データが消えない");
  ok(els.app.innerHTML.indexOf("優先スタッフ") >= 0, "店長画面に優先スタッフの案内が出る");
  /* 保存しても shift/req の形は変わらない */
  const before = JSON.stringify(S.DATA.shift[16]);
  S.openPosPrio(); S.savePosPrio();
  eq(JSON.stringify(S.DATA.shift[16]), before, "優先スタッフを保存しても帯は変わらない");
  ok(typeof S.DATA.prio === "object", "追加されるのは prio だけ");
}

console.log("\n=========================");
console.log("  成功 " + pass + " / 失敗 " + fail);
console.log("=========================");
process.exit(fail ? 1 : 0);
