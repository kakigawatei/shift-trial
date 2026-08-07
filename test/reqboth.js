/* 「両店舗かけもちスタッフの希望を1回の提出で両店に反映」の検証
   1. 兼務（both）の人が提出→もう一方のお店の同じ名前の人に希望と提出済みが入る
   2. もう一方のお店のスタッフ登録・シフト・他の人の希望は書き換えない
   3. 兼務でない人が提出しても、他のお店には何も書かない（今までどおり）
   4. 同じ名前の登録が無い／お店のデータがまだ無い→何もしない（落ちない）
   5. 反映後の updatedAt が新しくなり、切り替えたときに読み込まれる形になる */
const { makeEnv, mkStore, mkCloud } = require("./harness");

let pass = 0, fail = 0;
function ok(c, n, x) { if (c) { pass++; console.log("  OK   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } }
function eq(a, b, n) { ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b }); }
function sec(t) { console.log("\n== " + t + " =="); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function ohashiDoc() {
  return {
    staff: [
      { id: "x1", name: "渡辺", pos: [], both: 1 },
      { id: "x2", name: "山田", pos: [] },
    ],
    req: { x2: { 17: { s: "ng", f: "", t: "" } } },
    asg: {},
    shift: { 22: [{ id: "s1", sid: "x1", pos: "p1", f: "10:00", t: "15:00" }] },
    submitted: { x2: 123 },
    updatedAt: 500,
  };
}
function ochiaiDoc() {
  return {
    staff: [
      { id: "b1", name: "渡辺", pos: [], both: 1 },
      { id: "b2", name: "田中", pos: [] },
    ],
    req: {}, asg: {}, submitted: {}, updatedAt: 500,
  };
}
async function boot(cloudSeed) {
  const cloud = mkCloud(cloudSeed);
  const storage = mkStore();
  const { sandbox: S, els } = makeEnv({ cloud, storage });
  S.switchShop("ochiai");
  await wait(750);
  return { S, els, cloud, storage };
}

(async () => {
  /* ---------- 1・2. 兼務の人の提出が両店に入る ---------- */
  sec("1. 兼務の人が落合で提出→おはし二日町にも同じ希望が入る");
  {
    const { S, cloud } = await boot({
      shifttrial_ochiai: JSON.stringify(ochiaiDoc()),
      shifttrial_ohashi: JSON.stringify(ohashiDoc()),
    });
    S.pickRole("staff:b1");
    S.setReq("b1", 17, "ng");
    S.setReq("b1", 18, "tm");
    S.setTime("b1", 18, "f", "09:00");
    S.setTime("b1", 18, "t", "15:00");
    S.submitReq("b1");
    await wait(900);

    const oc = JSON.parse(cloud.docs["shifttrial_ochiai"]);
    const oh = JSON.parse(cloud.docs["shifttrial_ohashi"]);
    eq(oc.req.b1["17"].s, "ng", "落合（自分のお店）に希望が入る");
    ok(!!oc.submitted.b1, "落合で提出済みになる");
    eq(oh.req.x1["17"].s, "ng", "おはし二日町の渡辺（x1）にも『休み』が入る");
    eq([oh.req.x1["18"].s, oh.req.x1["18"].f, oh.req.x1["18"].t], ["tm", "09:00", "15:00"], "時間指定もそのまま入る");
    ok(!!oh.submitted.x1, "おはし二日町でも提出済みになる");
    ok(oh.updatedAt > 500, "おはし二日町の updatedAt が新しくなる（切替時に読み込まれる）");

    const base = ohashiDoc();
    eq(oh.staff.map((s) => s.id + ":" + s.name), base.staff.map((s) => s.id + ":" + s.name), "おはし二日町のスタッフ登録は変わらない");
    eq(oh.shift, base.shift, "おはし二日町のシフトは変わらない");
    eq(oh.req.x2, base.req.x2, "他の人（山田）の希望は変わらない");
    eq(oh.submitted.x2, 123, "他の人の提出記録も変わらない");
  }

  /* ---------- 3. 兼務でない人は今までどおり ---------- */
  sec("2. 兼務でない人の提出は他のお店に書かない");
  {
    const { S, cloud } = await boot({
      shifttrial_ochiai: JSON.stringify(ochiaiDoc()),
      shifttrial_ohashi: JSON.stringify(ohashiDoc()),
    });
    const before = cloud.docs["shifttrial_ohashi"];
    S.pickRole("staff:b2");
    S.setReq("b2", 17, "ng");
    S.submitReq("b2");
    await wait(900);
    eq(cloud.docs["shifttrial_ohashi"], before, "おはし二日町のデータは1文字も変わらない");
    ok(!cloud.log.some((l) => l.op === "PUT" && l.doc === "shifttrial_ohashi"), "おはし二日町への書き込みが発生しない");
  }

  /* ---------- 4. 同じ名前が無い／データが無い ---------- */
  sec("3. 同じ名前の登録が無い・お店のデータがまだ無いときは何もしない");
  {
    const doc = ohashiDoc(); doc.staff = [{ id: "x2", name: "山田", pos: [] }];
    const { S, cloud } = await boot({
      shifttrial_ochiai: JSON.stringify(ochiaiDoc()),
      shifttrial_ohashi: JSON.stringify(doc),
    });
    const before = cloud.docs["shifttrial_ohashi"];
    S.setReq("b1", 17, "ng");
    const rs = await S.syncReqBoth("b1");
    eq(rs, [{ miss: "おはし二日町" }], "『名前が見つからない』と分かる");
    eq(cloud.docs["shifttrial_ohashi"], before, "おはし二日町のデータは変わらない");
  }
  {
    const { S, cloud } = await boot({ shifttrial_ochiai: JSON.stringify(ochiaiDoc()) });
    S.setReq("b1", 17, "ng");
    const rs = await S.syncReqBoth("b1");
    eq(rs, [{ miss: "おはし二日町" }], "お店のデータがまだ無くても落ちない");
    ok(!("shifttrial_ohashi" in cloud.docs), "勝手にデータを作らない");
  }

  /* ---------- 5. おはし二日町側から提出しても落合に入る（逆向き） ---------- */
  sec("4. おはし二日町で提出→落合にも入る（どちらの店からでもOK）");
  {
    const cloud = mkCloud({
      shifttrial_ochiai: JSON.stringify(ochiaiDoc()),
      shifttrial_ohashi: JSON.stringify(ohashiDoc()),
    });
    const storage = mkStore();
    const { sandbox: S } = makeEnv({ cloud, storage });
    S.switchShop("ohashi");
    await wait(750);
    S.pickRole("staff:x1");
    S.setReq("x1", 20, "tm");
    S.setTime("x1", 20, "f", "17:00");
    S.setTime("x1", 20, "t", "21:00");
    S.submitReq("x1");
    await wait(900);
    const oc = JSON.parse(cloud.docs["shifttrial_ochiai"]);
    eq([oc.req.b1["20"].s, oc.req.b1["20"].f], ["tm", "17:00"], "落合の渡辺（b1）に時間指定が入る");
    ok(!!oc.submitted.b1, "落合でも提出済みになる");
  }

  /* ---------- 6. 再提出で上書きされる ---------- */
  sec("5. 出し直すと新しい希望で上書きされる");
  {
    const { S, cloud } = await boot({
      shifttrial_ochiai: JSON.stringify(ochiaiDoc()),
      shifttrial_ohashi: JSON.stringify(ohashiDoc()),
    });
    S.pickRole("staff:b1");
    S.setReq("b1", 17, "ng");
    S.submitReq("b1");
    await wait(900);
    S.setReq("b1", 17, "ok");
    S.submitReq("b1");
    await wait(900);
    const oh = JSON.parse(cloud.docs["shifttrial_ohashi"]);
    eq(oh.req.x1["17"].s, "ok", "出し直した内容（出られる）に置きかわる");
  }

  console.log("\n=========================");
  console.log("  成功 " + pass + " / 失敗 " + fail);
  console.log("=========================");
  process.exit(fail ? 1 : 0);
})();
