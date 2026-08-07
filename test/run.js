const { makeEnv, mkStore, mkCloud } = require("./harness");

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  OK   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b }); }
function head(t) { console.log("\n== " + t + " =="); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. 店舗設定そのもの ---------- */
head("1. 店舗ごとの設定（お客様の数字どおりか）");
{
  const { sandbox: S } = makeEnv();
  const oh = S.shopBy("ohashi"), oc = S.shopBy("ochiai");

  eq(oh.doc, "shifttrial_ohashi", "おはし二日町の保存先は今までと同じ shifttrial_ohashi");
  eq(oc.doc, "shifttrial_ochiai", "落合は別ドキュメント shifttrial_ochiai");
  ok(oh.doc !== oc.doc, "2店舗の保存先が別");

  eq([oc.open / 60, oc.close / 60], [5, 21], "落合の時間軸は5時〜21時");
  eq(oc.pos.map((p) => p.label),
     ["社員①", "社員②", "社員③", "オーブン", "カレーパン", "昼①", "昼②", "昼③", "昼④", "午後①", "午後②", "午後③", "外販"],
     "落合のポジション13種（オーブンの上に社員①②③）");
  eq(oc.needWd, [1, 2, 3, 5, 6, 4, 4, 3, 3, 3, 3, 3, 2, 2, 0, 0], "落合 平日の必要人数");
  eq(oc.needHd, [1, 2, 2, 4, 5, 3, 3, 2, 2, 2, 2, 2, 2, 2, 0, 0], "落合 土日祝の必要人数");
  eq(oc.needWd.reduce((a, b) => a + b, 0), 44, "落合 平日 合計44");
  eq(oc.needHd.reduce((a, b) => a + b, 0), 34, "落合 土日祝 合計34");
  eq(oc.needWd.length, (oc.close - oc.open) / 60, "平日の必要人数の個数＝時間軸の時間数");
  eq(oc.needHd.length, (oc.close - oc.open) / 60, "土日祝の必要人数の個数＝時間軸の時間数");

  eq([oh.open / 60, oh.close / 60], [10, 23], "おはし二日町の時間軸は10時〜23時（従来どおり）");
  eq(oh.needWd, oh.needHd, "おはし二日町は平日・土日祝とも同じ値（今の値をそのまま）");
  /* 旧 SLOTS（10-11:2, 11-14:3, 14-15:2, 15-17:2, 17-18:2, 18-21:5, 21-23:3）と一致するか */
  eq(oh.needWd, [2, 3, 3, 3, 2, 2, 2, 2, 5, 5, 5, 3, 3], "おはし二日町の必要人数＝従来の時間帯設定と同じ");
  eq(oh.needWd.length, 13, "おはし二日町は13時間分");

  eq(oc.off.hd, ["p10"], "落合の土日祝は外販なし");
  eq(oc.band.wd.p1, [300, 570], "平日オーブン 5:00-9:30");
  eq(oc.band.wd.p10, [480, 840], "平日外販 8:00-14:00");
  eq(oc.band.hd.p10, undefined, "土日祝の外販の帯は無い");
  eq(oc.band.hd.p3, [480, 720], "土日祝の昼①は8:00開始");
  eq([oc.band.hd.p7, oc.band.hd.p8, oc.band.hd.p9], [[840, 1140], [840, 1140], [840, 1140]], "土日祝の午後は14:00-19:00");
}

/* ---------- 2. 必要人数 / 時間帯の導出 ---------- */
head("2. 必要人数の読み取り（平日／土日祝の切り替え）");
{
  const { sandbox: S } = makeEnv();
  S.applyShop("ochiai");
  /* 2026/8: 17日=月(平日), 22日=土, 23日=日 */
  eq([S.wday(17), S.wday(22), S.wday(23)], [1, 6, 0], "曜日の判定");
  eq([S.isHol(17), S.isHol(22), S.isHol(23)], [false, true, true], "土日祝の判定");

  eq(S.needAt(5 * 60, 17), 1, "落合 平日 5時は1人");
  eq(S.needAt(9 * 60, 17), 6, "落合 平日 9時は6人（ピーク）");
  eq(S.needAt(9 * 60, 23), 5, "落合 日曜 9時は5人");
  eq(S.needAt(19 * 60, 17), 0, "落合 19時以降は0人");
  eq(S.needAt(4 * 60, 17), 0, "営業時間の外は0人");
  eq(S.needAt(22 * 60, 17), 0, "営業時間の外は0人（後ろ）");

  const wd = S.slotsFor(17);
  eq(wd, [
    { from: "05:00", to: "06:00", need: 1 },
    { from: "06:00", to: "07:00", need: 2 },
    { from: "07:00", to: "08:00", need: 3 },
    { from: "08:00", to: "09:00", need: 5 },
    { from: "09:00", to: "10:00", need: 6 },
    { from: "10:00", to: "12:00", need: 4 },
    { from: "12:00", to: "17:00", need: 3 },
    { from: "17:00", to: "19:00", need: 2 },
  ], "落合 平日の時間帯（同じ人数はまとめる・0の時間は作らない）");

  const hd = S.slotsFor(23);
  const hdTotal = hd.reduce((a, s) => a + s.need * (S.minutes(s.to) - S.minutes(s.from)) / 60, 0);
  eq(hdTotal, 34, "落合 土日祝の時間帯を積み上げると のべ34時間");
  ok(hd.every((s) => S.minutes(s.to) <= 21 * 60 && S.minutes(s.from) >= 5 * 60), "時間帯が営業時間内におさまる");

  eq(S.posFor(17).length, 13, "平日は13ポジション（社員①②③を含む）");
  eq(S.posFor(23).map((p) => p.label), ["社員①", "社員②", "社員③", "オーブン", "カレーパン", "昼①", "昼②", "昼③", "昼④", "午後①", "午後②", "午後③"], "土日祝は外販を除く12ポジション");

  /* おはし二日町は従来の時間帯にもどるか */
  S.applyShop("ohashi");
  eq(S.slotsFor(17), [
    { from: "10:00", to: "11:00", need: 2 },
    { from: "11:00", to: "14:00", need: 3 },
    { from: "14:00", to: "18:00", need: 2 },   /* 14-15/15-17/17-18 はどれも2人なので1本にまとまる */
    { from: "18:00", to: "21:00", need: 5 },
    { from: "21:00", to: "23:00", need: 3 },
  ], "おはし二日町は従来と同じ必要人数（同じ人数の枠は結合される）");
  /* 1時間ごとに見て従来の設定と完全一致するか（結合の仕方によらない確認） */
  const oldNeed = { 10: 2, 11: 3, 12: 3, 13: 3, 14: 2, 15: 2, 16: 2, 17: 2, 18: 5, 19: 5, 20: 5, 21: 3, 22: 3 };
  eq(Object.keys(oldNeed).map((h) => S.needAt(+h * 60, 17)), Object.keys(oldNeed).map((h) => oldNeed[h]),
     "おはし二日町の1時間ごとの必要人数が従来の時間帯設定と完全一致");
  eq(S.slotsFor(17), S.slotsFor(23), "おはし二日町は平日も土日祝も同じ");
  eq(S.needAt(18 * 60, 17), 5, "おはし二日町 18時は5人（従来どおり）");
  eq(S.needAt(22 * 60, 17), 3, "おはし二日町 22時は3人（従来どおり）");
  eq(S.posFor(17).length, 11, "おはし二日町は曜日で減るポジションなし（厨房を足して11種）");
  eq(S.POS.map((p) => p.label).indexOf("厨房") >= 0, true, "おはし二日町に厨房がある");
}

/* ---------- 3. 既存データ（おはし二日町）が読めるか ---------- */
head("3. 既存の保存データを壊さず読めるか");
{
  /* 従来バージョンが保存した形（asg=旧の時間帯×人、shiftなし）を用意 */
  const legacy = {
    staff: [
      { id: "a1", name: "山田", pos: [] },
      { id: "a2", name: "佐藤", pos: [] },
    ],
    req: { a1: { 17: { s: "tm", f: "18:00", t: "23:00" } } },
    asg: { 17: { s6: ["a1", "a2"], s7: ["a1"] } },
    submitted: { a1: 111 },
    updatedAt: 1000,
  };
  const cloud = mkCloud({ shifttrial_ohashi: JSON.stringify(legacy) });
  const storage = mkStore();
  storage.setItem("st_role", "mgr");                     /* 旧バージョンの利用者 */
  storage.setItem("st_cache", JSON.stringify(legacy));

  const { sandbox: S } = makeEnv({ cloud, storage });
  eq(S.SHOPID, "ohashi", "店舗選択が無かった利用者は自動で おはし二日町");
  eq(S.ROLE, "mgr", "以前の役割（店長）がそのまま復元される");
  eq(S.DATA.staff.map((x) => x.name), ["山田", "佐藤"], "既存スタッフが読める");
  eq(S.DATA.submitted.a1, 111, "提出済みの記録が残っている");
  eq(S.reqLabel("a1", 17), "18:00〜23:00", "既存の希望（時間指定）が読める");

  /* 旧 asg → 帯への引き継ぎが従来どおり動くか */
  const ents = S.shiftOf(17);
  eq(ents.length, 2, "旧データから2人ぶんの帯ができる");
  const a1 = ents.filter((e) => e.sid === "a1")[0];
  const a2 = ents.filter((e) => e.sid === "a2")[0];
  eq([a1.f, a1.t], ["18:00", "23:00"], "山田: 18-21と21-23がつながって18:00-23:00");
  eq([a2.f, a2.t], ["18:00", "21:00"], "佐藤: 18:00-21:00");
  ok(a1.pos !== a2.pos, "同じ時間の2人は別ポジションに置かれる");
  eq(S.DATA.asg[17], { s6: ["a1", "a2"], s7: ["a1"] }, "元の asg は消さずに残している");
}

/* ---------- 4. 店舗を切り替えてもデータが混ざらないか ---------- */
head("4. 店舗切替（データが混ざらない / 保存先が正しい）");
(async () => {
  const ohashiSaved = {
    staff: [{ id: "a1", name: "山田", pos: [], ci: 0 }],
    req: {}, asg: {}, submitted: {}, updatedAt: 500,
  };
  const cloud = mkCloud({ shifttrial_ohashi: JSON.stringify(ohashiSaved) });
  const storage = mkStore();
  const { sandbox: S } = makeEnv({ cloud, storage });

  eq(S.SHOPID, "", "はじめての人はまず店舗選択（名前選択の前）");
  ok(S.els === undefined || true, "");

  /* おはし二日町を選ぶ */
  S.switchShop("ohashi");
  await wait(750);
  eq(S.SHOP.name, "おはし二日町", "おはし二日町に切り替わる");
  eq(S.DATA.staff.map((x) => x.name), ["山田"], "クラウドの既存スタッフを読み込む");
  eq(storage.getItem("st_shop"), "ohashi", "選んだ店舗を記憶する");

  /* 落合に切り替えてスタッフを足す */
  S.switchShop("ochiai");
  await wait(750);
  eq(S.SHOP.name, "落合", "落合に切り替わる");
  eq(S.DATA.staff.length, 0, "落合は空（おはし二日町のスタッフが混ざらない）");
  eq(S.POS[0].label, "社員①", "ポジションが落合のものに入れ替わる（先頭は社員①）");
  eq([S.DAY_OPEN / 60, S.DAY_CLOSE / 60], [5, 21], "時間軸が落合のものに入れ替わる");

  S.DATA.staff.push({ id: "b1", name: "田中", pos: [] });
  S.save();
  await wait(750);
  eq(JSON.parse(cloud.docs["shifttrial_ochiai"]).staff.map((x) => x.name), ["田中"], "落合の保存先に田中が入る");
  eq(JSON.parse(cloud.docs["shifttrial_ohashi"]).staff.map((x) => x.name), ["山田"], "おはし二日町の保存先は書き換わっていない");
  eq(JSON.parse(storage.getItem("st_cache")).staff.map((x) => x.name), ["山田"], "端末のキャッシュも店舗別（おはし二日町は従来キー st_cache のまま）");
  eq(JSON.parse(storage.getItem("st_cache_ochiai")).staff.map((x) => x.name), ["田中"], "落合のキャッシュは別キー");

  /* おはし二日町へ戻す */
  S.switchShop("ohashi");
  await wait(750);
  eq(S.DATA.staff.map((x) => x.name), ["山田"], "おはし二日町に戻すと元のスタッフ");
  eq(S.POS[0].label, "仕込①", "ポジションも元に戻る");
  eq([S.DAY_OPEN / 60, S.DAY_CLOSE / 60], [10, 23], "時間軸も元に戻る");

  /* 未送信のまま切り替えても、前の店舗の保存先に正しく届くか */
  S.DATA.staff.push({ id: "a9", name: "鈴木", pos: [] });
  S.DATA.updatedAt = Date.now();
  S.dirty = true;
  S.switchShop("ochiai");           /* 送信前に切り替え */
  await wait(900);
  eq(JSON.parse(cloud.docs["shifttrial_ohashi"]).staff.map((x) => x.name), ["山田", "鈴木"],
     "切替直前の未送信ぶんは、ちゃんと おはし二日町 の保存先に届く");
  eq(JSON.parse(cloud.docs["shifttrial_ochiai"]).staff.map((x) => x.name), ["田中"], "落合の保存先に紛れ込んでいない");

  /* 名前の記憶が店舗ごとか */
  S.switchShop("ohashi"); await wait(750);
  S.pickRole("staff:a1");
  S.switchShop("ochiai"); await wait(750);
  eq(S.ROLE, "", "別店舗では名前を選び直す（前の店舗の名前が残らない）");
  S.pickRole("staff:b1");
  S.switchShop("ohashi"); await wait(750);
  eq(S.ROLE, "staff:a1", "おはし二日町に戻ると、その店舗で選んだ名前を覚えている");
  S.switchShop("ochiai"); await wait(750);
  eq(S.ROLE, "staff:b1", "落合に戻ると、落合で選んだ名前を覚えている");
  eq(storage.getItem("st_role"), "staff:a1", "おはし二日町の記憶キーは従来どおり st_role");

  await part5();
})();

/* ---------- 5. 自動作成が新しい必要人数で動くか ---------- */
async function part5() {
  head("5. 自動作成（落合の必要人数どおりに組めるか）");
  const cloud = mkCloud();
  const storage = mkStore();
  const { sandbox: S } = makeEnv({ cloud, storage });
  S.switchShop("ochiai");
  await wait(750);

  /* いつでも出られるスタッフを12人 */
  for (let i = 0; i < 12; i++) S.DATA.staff.push({ id: "s" + i, name: "スタッフ" + i, pos: [] });
  S.ensureColors();

  function check(day, label) {
    S.MDAY = day;
    S.autoDraft();
    const ents = S.DATA.shift[day];
    const need = S.needsFor(day);
    let allMet = true, lack = [];
    for (let h = 0; h < need.length; h++) {
      const m = S.DAY_OPEN + h * 60;
      const got = ents.filter((e) => S.minutes(e.f) <= m && m < S.minutes(e.t)).length;
      if (got !== need[h]) { allMet = false; lack.push({ h: m / 60, got, need: need[h] }); }
    }
    ok(allMet, label + "：1時間ごとの人数が必要人数とぴったり合う", lack);
    const outside = ents.filter((e) => S.minutes(e.f) < S.DAY_OPEN || S.minutes(e.t) > S.DAY_CLOSE);
    eq(outside.length, 0, label + "：営業時間の外に帯が出ない");
    const badPos = ents.filter((e) => !S.POS.some((p) => p.id === e.pos));
    eq(badPos.length, 0, label + "：知らないポジションが出ない");
    const dup = ents.filter((e) => S.hasDup(day, e));
    eq(dup.length, 0, label + "：同じ人の時間が重ならない");
    return ents;
  }

  const wdEnts = check(17, "落合 平日(8/17月)");
  const totalWd = wdEnts.reduce((a, e) => a + (S.minutes(e.t) - S.minutes(e.f)), 0) / 60;
  eq(totalWd, 44, "落合 平日ののべ時間は44時間（必要人数の合計と一致）");

  const hdEnts = check(23, "落合 土日祝(8/23日)");
  const totalHd = hdEnts.reduce((a, e) => a + (S.minutes(e.t) - S.minutes(e.f)), 0) / 60;
  eq(totalHd, 34, "落合 土日祝ののべ時間は34時間");
  eq(hdEnts.filter((e) => e.pos === "p10").length, 0, "土日祝は外販に人を入れない");
  ok(wdEnts.some((e) => e.pos === "p10"), "平日は外販が使われる");

  /* 目安の帯に沿って置かれているか */
  const early = wdEnts.filter((e) => S.minutes(e.f) === 300)[0];
  eq(early && early.pos, "p1", "5時スタートの人は『オーブン』に置かれる");
  const six = wdEnts.filter((e) => S.minutes(e.f) === 360)[0];
  eq(six && six.pos, "p2", "6時スタートの人は『カレーパン』に置かれる");
  const pm = wdEnts.filter((e) => S.minutes(e.f) === 840)[0];
  ok(pm && ["p7", "p8", "p9"].indexOf(pm.pos) >= 0, "14時スタートの人は『午後』に置かれる", pm && pm.pos);

  /* どの帯も、そのポジションの目安の時間と重なっているか */
  [[wdEnts, 17, "平日"], [hdEnts, 23, "土日祝"]].forEach(([es, day, nm]) => {
    const off = es.filter((e) => { const b = S.bandOf(e.pos, day); return b && !(S.minutes(e.f) < b[1] && b[0] < S.minutes(e.t)); });
    eq(off.length, 0, "落合 " + nm + "：ポジションの目安の時間から外れた帯が無い");
  });

  /* 1回の勤務が長すぎ／細切れすぎないか */
  [[wdEnts, "平日"], [hdEnts, "土日祝"]].forEach(([es, nm]) => {
    const lens = es.map((e) => (S.minutes(e.t) - S.minutes(e.f)) / 60);
    ok(Math.max(...lens) <= 6, "落合 " + nm + "：1人の連続勤務は6時間まで", Math.max(...lens) + "時間");
    ok(Math.min(...lens) >= 3, "落合 " + nm + "：1〜2時間だけの細切れシフトが出ない", Math.min(...lens) + "時間");
    /* 同じ人が1日に2回に分かれて入っていないか */
    const byS = {}; es.forEach((e) => { byS[e.sid] = (byS[e.sid] || 0) + 1; });
    eq(Object.keys(byS).filter((k) => byS[k] > 1).length, 0, "落合 " + nm + "：同じ人が1日に2回入らない");
  });

  /* 休み・時間指定の希望が守られるか */
  S.DATA.req = { s0: { 17: { s: "ng" } }, s1: { 17: { s: "tm", f: "14:00", t: "19:00" } } };
  S.MDAY = 17; S.autoDraft();
  const e17 = S.DATA.shift[17];
  eq(e17.filter((e) => e.sid === "s0").length, 0, "『休み』の人は入らない");
  ok(e17.filter((e) => e.sid === "s1").every((e) => S.minutes(e.f) >= 840 && S.minutes(e.t) <= 1140),
     "『時間指定』の人はその時間内だけ", e17.filter((e) => e.sid === "s1"));

  /* できるポジション（担当制限）が守られるか */
  S.DATA.req = {};
  S.DATA.staff.forEach((s, i) => { s.pos = i < 3 ? ["p1", "p2"] : []; });
  S.MDAY = 17; S.autoDraft();
  const bad = S.DATA.shift[17].filter((e) => !S.canPos(S.staffBy(e.sid), e.pos));
  ok(bad.length <= 0, "担当できるポジション以外に置かれない", bad.map((e) => e.sid + "->" + e.pos));
  S.DATA.staff.forEach((s) => { s.pos = []; });

  /* おはし二日町側の自動作成が従来どおりか */
  head("6. おはし二日町の自動作成が従来と同じ結果か");
  S.switchShop("ohashi"); await wait(750);
  for (let i = 0; i < 8; i++) S.DATA.staff.push({ id: "o" + i, name: "従業員" + i, pos: [] });
  S.ensureColors();
  S.MDAY = 17; S.autoDraft();
  const oh = S.DATA.shift[17];
  const need = S.needsFor(17);
  let met = true, det = [];
  for (let h = 0; h < need.length; h++) {
    const m = S.DAY_OPEN + h * 60;
    const got = oh.filter((e) => S.minutes(e.f) <= m && m < S.minutes(e.t)).length;
    if (got !== need[h]) { met = false; det.push({ h: m / 60, got, need: need[h] }); }
  }
  ok(met, "おはし二日町：従来の必要人数どおりに組める", det);
  const t = oh.reduce((a, e) => a + (S.minutes(e.t) - S.minutes(e.f)), 0) / 60;
  eq(t, 2 + 3 * 3 + 2 + 2 * 2 + 2 + 5 * 3 + 3 * 2, "おはし二日町ののべ時間が従来の設定と一致（36時間）");

  /* ---------- 7. 画面が落ちずに描画できるか ---------- */
  head("7. 画面の描画（エラーが出ないか）");
  const V = S;
  function draws(name, fn) {
    try { fn(); ok(true, name); } catch (e) { ok(false, name, String(e && e.message)); }
  }
  ["ohashi", "ochiai"].forEach((sid) => {
    V.applyShop(sid);
    [17, 22, 23].forEach((d) => {
      V.MDAY = d;
      draws(sid + " " + d + "日：シフト作成ボード", () => { const h = V.mgrBoard(); if (!h || h.indexOf("必要人数") < 0) throw new Error("中身が出ていない"); });
      draws(sid + " " + d + "日：シフト追加パネル", () => V.openEnt(d, null));
    });
    draws(sid + "：希望一覧", () => V.mgrReq());
    draws(sid + "：スタッフ画面", () => V.mgrStaff());
    draws(sid + "：店長メニュー", () => V.viewMgr());
    draws(sid + "：名前えらび", () => V.viewWho());
    draws(sid + "：印刷ビュー", () => V.renderPrint());
  });
  draws("店舗えらび画面", () => { const h = V.viewShop(); if (h.indexOf("落合") < 0 || h.indexOf("おはし二日町") < 0) throw new Error("店舗が並んでいない"); });
  draws("従業員画面", () => { V.applyShop("ochiai"); V.DATA.staff[0] && V.viewStaff(V.DATA.staff[0]); });

  /* ガントチャートの目盛りが店舗ごとの時間数になっているか */
  V.applyShop("ochiai"); V.MDAY = 17;
  const g = V.mgrBoard();
  ok(g.indexOf("calc(100%/16)") >= 0, "落合のガントチャートは16時間分の目盛り");
  ok(g.indexOf(">5<") >= 0 && g.indexOf(">20<") >= 0, "落合の目盛りは5時から20時まで");
  V.applyShop("ohashi");
  const g2 = V.mgrBoard();
  ok(g2.indexOf("calc(100%/13)") >= 0, "おはし二日町のガントチャートは13時間分の目盛り");
  ok(g2.indexOf(">10<") >= 0 && g2.indexOf(">22<") >= 0, "おはし二日町の目盛りは10時から22時まで");

  /* ---------- 8. 従業員のはじめての流れ ---------- */
  head("8. 従業員のはじめての流れ（店舗→名前→入力→提出）");
  {
    const cloud = mkCloud({
      shifttrial_ochiai: JSON.stringify({ staff: [{ id: "b1", name: "田中", pos: [] }], req: {}, asg: {}, submitted: {}, updatedAt: 9 }),
      shifttrial_ohashi: JSON.stringify({ staff: [{ id: "a1", name: "山田", pos: [] }], req: {}, asg: {}, submitted: {}, updatedAt: 9 }),
    });
    const storage = mkStore();
    const { sandbox: E, els } = makeEnv({ cloud, storage });

    E.render();
    ok(els.app.innerHTML.indexOf("お店をえらんでください") >= 0, "最初は店舗えらびの画面が出る");
    ok(els.app.innerHTML.indexOf("落合") >= 0, "落合が選べる");

    E.switchShop("ochiai");
    await wait(750);
    ok(els.app.innerHTML.indexOf("田中") >= 0, "落合のスタッフ（田中）が名前えらびに並ぶ");
    ok(els.app.innerHTML.indexOf("山田") < 0, "おはし二日町のスタッフは並ばない");

    E.pickRole("staff:b1");
    ok(els.app.innerHTML.indexOf("田中さん") >= 0, "名前をえらぶと希望入力の画面になる");
    E.setReq("b1", 18, "ng");
    E.setReq("b1", 19, "tm");
    E.setTime("b1", 19, "f", "05:00");
    E.setTime("b1", 19, "t", "10:00");
    E.submitReq("b1");
    await wait(750);

    const oc = JSON.parse(cloud.docs["shifttrial_ochiai"]);
    eq(oc.req.b1["18"].s, "ng", "落合の保存先に『休み』が入る");
    eq([oc.req.b1["19"].f, oc.req.b1["19"].t], ["05:00", "10:00"], "早朝5時からの時間指定も入る");
    ok(!!oc.submitted.b1, "提出済みになる");
    eq(JSON.parse(cloud.docs["shifttrial_ohashi"]).req, {}, "おはし二日町の希望データは空のまま（混ざらない）");

    /* 開き直したときに、店舗も名前も覚えているか */
    const { sandbox: E2, els: els2 } = makeEnv({ cloud, storage });
    await wait(750);
    eq(E2.SHOPID, "ochiai", "次に開くと落合が自動で開く（店舗を毎回選ばせない）");
    eq(E2.ROLE, "staff:b1", "名前も覚えている（毎回選ばせない）");
    ok(els2.app.innerHTML.indexOf("田中さん") >= 0, "そのまま希望入力の画面が出る");
    ok(els2.app.innerHTML.indexOf("休み") >= 0, "入力済みの内容が表示される");
  }

  console.log("\n=========================");
  console.log("  成功 " + pass + " / 失敗 " + fail);
  console.log("=========================");
  process.exit(fail ? 1 : 0);
}
