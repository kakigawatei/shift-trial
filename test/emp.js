/* 「社員を先に配置」と「両店舗の兼務スタッフ」の検証
   1. 社員をつけていないお店は、今までと1文字も変わらない
   2. 社員は自動作成でいちばん先に、できるだけ長い1本の帯で入る
   3. 社員の「休み」「時間指定」は今までどおり守る
   4. 必要人数を超えて社員を入れない（残りだけアルバイトが埋める）
   5. 兼務スタッフは、他のお店で入っている時間には自動で入らない／手で入れると⚠  */
const { makeEnv } = require("./harness");

let pass = 0, fail = 0;
function ok(c, n, x) { if (c) { pass++; console.log("  OK   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } }
function eq(a, b, n) { ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b }); }
function sec(t) { console.log("\n== " + t + " =="); }

const STAFF = [
  { id: "s0", name: "内海", avF: "05:00", avT: "14:00", pos: [] },
  { id: "s1", name: "池田", avF: "05:00", avT: "14:00", pos: [] },
  { id: "s2", name: "大泉", avF: "08:00", avT: "15:00", pos: [] },
  { id: "s3", name: "佐藤", avF: "08:00", avT: "15:00", pos: [] },
  { id: "s4", name: "鈴木", avF: "09:00", avT: "17:00", pos: [] },
  { id: "s5", name: "高橋", avF: "13:00", avT: "21:00", pos: [] },
  { id: "s6", name: "田中", avF: "13:00", avT: "21:00", pos: [] },
  { id: "s7", name: "渡辺", pos: [] },                        /* 終日OK */
  { id: "s8", name: "伊藤", avF: "07:00", avT: "13:00", pos: [] },
];
function env(shop, tweak) {
  const { sandbox: S, els } = makeEnv();
  S.applyShop(shop);
  S.DATA = { staff: JSON.parse(JSON.stringify(STAFF)), req: {}, asg: {}, submitted: {}, updatedAt: 1 };
  if (tweak) tweak(S);
  S.ensureColors();
  return { S, els };
}
function draft(S, day) { S.MDAY = day; S.autoDraft(); return S.DATA.shift[day] || []; }
function bandsOf(S, day, sid) {
  return (S.DATA.shift[day] || []).filter((e) => e.sid === sid)
    .sort((a, b) => S.minutes(a.f) - S.minutes(b.f)).map((e) => e.f + "-" + e.t);
}
/* その時刻に入っている人数 */
function gotAt(S, day, m) { let n = 0; (S.DATA.shift[day] || []).forEach((e) => { if (S.minutes(e.f) <= m && m < S.minutes(e.t)) n++; }); return n; }
function key(list) { return list.map((e) => e.sid + "|" + e.pos + "|" + e.f + "|" + e.t).sort().join(","); }

/* ---------- 1. 社員をつけない＝今までと同じ ---------- */
sec("1. 社員・兼務をつけないお店は今までと同じ結果");
["ohashi", "ochiai"].forEach((shop) => {
  const a = env(shop), b = env(shop);
  const days = [16, 17, 20, 22, 23];
  const ka = days.map((d) => key(draft(a.S, d))).join("#");
  const kb = days.map((d) => key(draft(b.S, d))).join("#");
  eq(ka, kb, shop + "：同じ入力なら同じ結果（作り直しても安定）");
  ok(ka.length > 100, shop + "：ちゃんと帯ができている");
});

/* ---------- 2. 社員が先に、長い1本の帯で入る ---------- */
sec("2. 社員はいちばん先に、長い1本の帯で入る");
{
  /* 落合は「1人6時間まで」の上限があるが、社員はその対象外 */
  const { S } = env("ochiai", (S) => { S.DATA.staff.filter((s) => s.id === "s7")[0].emp = 1; });
  draft(S, 17);
  const b = bandsOf(S, 17, "s7");
  eq(b.length, 1, "社員は1日1本の帯（細切れにならない）");
  const f = S.minutes(b[0].split("-")[0]), t = S.minutes(b[0].split("-")[1]);
  ok(t - f > 360, "6時間の上限を超えて終日入る（社員は上限の対象外）", b[0]);
  /* 必要人数がある時間はすべて社員がカバーしている */
  let uncovered = 0;
  for (let m = S.DAY_OPEN; m < S.DAY_CLOSE; m += 60) if (S.needAt(m, 17) && !(f <= m && m < t)) uncovered++;
  eq(uncovered, 0, "営業している時間はすべて社員が入っている");

  /* 社員にしなかった場合と比べる：上限6時間で切られていたことを確認 */
  const { S: S2 } = env("ochiai");
  draft(S2, 17);
  const b2 = bandsOf(S2, 17, "s7");
  ok(b2.every((x) => S.minutes(x.split("-")[1]) - S.minutes(x.split("-")[0]) <= 360), "アルバイトのままなら今までどおり6時間以内", b2);
}
{
  const { S } = env("ohashi", (S) => { S.DATA.staff.filter((s) => s.id === "s7")[0].emp = 1; });
  draft(S, 16);
  eq(bandsOf(S, 16, "s7"), ["10:00-23:00"], "おはし二日町：社員は開店から閉店まで1本");
}

/* ---------- 3. 社員でも希望（休み・時間指定）は守る ---------- */
sec("3. 社員でも「休み」「時間指定」は守る");
{
  const { S } = env("ochiai", (S) => {
    S.DATA.staff.filter((s) => s.id === "s7")[0].emp = 1;
    S.DATA.req["s7"] = { 17: { s: "ng", f: "", t: "" }, 18: { s: "tm", f: "09:00", t: "15:00" } };
  });
  draft(S, 17);
  eq(bandsOf(S, 17, "s7"), [], "「休み」の日は社員でも入らない");
  ok((S.DATA.shift[17] || []).length > 0, "その日はほかの人で組まれている");
  draft(S, 18);
  const b = bandsOf(S, 18, "s7");
  eq(b, ["09:00-15:00"], "「時間指定」の日はその時間だけ");
}
{
  /* 基本の勤務可能時間（条件）も守る */
  const { S } = env("ochiai", (S) => { S.DATA.staff.filter((s) => s.id === "s0")[0].emp = 1; });
  draft(S, 19);
  const b = bandsOf(S, 19, "s0");
  eq(b, ["05:00-14:00"], "社員でも基本の勤務可能時間の外には入らない");
}

/* ---------- 4. 必要人数を超えて社員を入れない ---------- */
sec("4. 社員は必要人数の枠内。残りをアルバイトが埋める");
{
  const { S } = env("ochiai", (S) => {
    ["s7", "s0", "s5"].forEach((id) => { S.DATA.staff.filter((s) => s.id === id)[0].emp = 1; });
  });
  draft(S, 20);
  let over = 0;
  for (let m = S.DAY_OPEN; m < S.DAY_CLOSE; m += 60) { const n = S.needAt(m, 20); if (n && gotAt(S, 20, m) > n) over++; }
  eq(over, 0, "社員3人でも必要人数を超えて入れない");
  /* 5時台は必要1人 → 社員だけ。人手が要る10時台はアルバイトも入る */
  const at5 = (S.DATA.shift[20] || []).filter((e) => S.minutes(e.f) <= 300 && 300 < S.minutes(e.t));
  ok(at5.every((e) => S.staffBy(e.sid).emp), "必要1人の時間は社員だけが入る", at5.map((e) => S.staffBy(e.sid).name));
  const at10 = (S.DATA.shift[20] || []).filter((e) => S.minutes(e.f) <= 600 && 600 < S.minutes(e.t));
  ok(at10.some((e) => !S.staffBy(e.sid).emp), "人数が要る時間はアルバイトも入る", at10.map((e) => S.staffBy(e.sid).name));
  ok(at10.some((e) => S.staffBy(e.sid).emp), "その時間も社員は入ったまま");
}
{
  /* 社員が全員休みでも、今までどおりアルバイトだけで組める */
  const { S } = env("ochiai", (S) => {
    ["s7", "s0"].forEach((id) => { S.DATA.staff.filter((s) => s.id === id)[0].emp = 1;
      S.DATA.req[id] = { 21: { s: "ng", f: "", t: "" } }; });
  });
  const { S: S2 } = env("ochiai", (S) => {
    ["s7", "s0"].forEach((id) => { S.DATA.req[id] = { 21: { s: "ng", f: "", t: "" } }; });
  });
  draft(S, 21); draft(S2, 21);
  eq(key(S.DATA.shift[21]), key(S2.DATA.shift[21]), "社員が全員休みの日は、今までとまったく同じ組み方");
}

/* ---------- 5. 両店舗の兼務 ---------- */
sec("5. 兼務スタッフは他のお店の予定と重ならない");
function withOther(tweak) {
  const { S } = env("ochiai", (S) => {
    S.DATA.staff.filter((s) => s.id === "s7")[0].both = 1;
    if (tweak) tweak(S);
  });
  /* おはし二日町側のデータ（読み取り専用で持っている想定） */
  S.XDATA["ohashi"] = {
    staff: [{ id: "x1", name: "渡辺" }, { id: "x2", name: "内海" }],
    shift: { 22: [{ id: "e1", sid: "x1", pos: "p1", f: "10:00", t: "15:00" }] },
  };
  return S;
}
{
  const S = withOther();
  eq(S.otherBusy("s7", 22).map((b) => b.shop + b.f + "-" + b.t), ["おはし二日町600-900"], "他店の予定を読める");
  eq(S.otherBusy("s7", 23), [], "予定のない日は空");
  ok(S.otherHit("s7", 22, 660, 720), "重なっている時間は重複と判定");
  ok(!S.otherHit("s7", 22, 900, 1020), "重ならない時間は問題なし");
  eq(S.otherLabel("s7", 22), "おはし二日町 10〜15", "画面に出す文言");
  draft(S, 22);
  const b = bandsOf(S, 22, "s7");
  ok(b.every((x) => !S.otherHit("s7", 22, S.minutes(x.split("-")[0]), S.minutes(x.split("-")[1]))), "自動作成が他店と重なる時間に入れない", b);
  ok((S.DATA.shift[22] || []).length > 0, "その日のシフトはちゃんと組めている");
}
{
  /* 兼務のチェックを外した人には、他店データがあっても何も起きない */
  const S = withOther((S) => { S.DATA.staff.filter((s) => s.id === "s7")[0].both = 0; });
  eq(S.otherBusy("s7", 22), [], "兼務にしていない人は他店を見ない");
  const { S: S2 } = env("ochiai");
  draft(S, 22); draft(S2, 22);
  eq(key(S.DATA.shift[22]), key(S2.DATA.shift[22]), "兼務なしなら今までとまったく同じ組み方");
}
{
  /* 名前がちがえば別人あつかい。空白のちがいは同じ人 */
  const S = withOther();
  S.DATA.staff.filter((s) => s.id === "s7")[0].name = "渡邊";
  eq(S.otherBusy("s7", 22), [], "名前がちがう人は別人あつかい（かってに重ねない）");
  S.DATA.staff.filter((s) => s.id === "s7")[0].name = "渡辺 ";
  eq(S.otherBusy("s7", 22).length, 1, "うしろの空白があっても同じ人と分かる");
}
{
  /* 他店データが取れていないとき（オフライン等）も落ちない */
  const { S } = env("ochiai", (S) => { S.DATA.staff.filter((s) => s.id === "s7")[0].both = 1; });
  eq(S.otherBusy("s7", 22), [], "他店データ未取得でもエラーにならない");
  draft(S, 22);
  ok((S.DATA.shift[22] || []).length > 0, "他店データがなくてもシフトは組める");
}
{
  /* 手で入れたときは⚠（帯に warn クラス）が出る */
  const S = withOther();
  S.MDAY = 22; S.MTAB = "board"; S.shiftOf(22);
  S.DATA.shift[22] = [{ id: "z1", sid: "s7", pos: "p1", f: "11:00", t: "13:00" }];
  ok(S.mgrBoard().indexOf("gband warn") >= 0, "他店と重なる帯には⚠が出る");
  S.DATA.shift[22] = [{ id: "z1", sid: "s7", pos: "p1", f: "05:00", t: "09:00" }];
  ok(S.mgrBoard().indexOf("gband warn") < 0, "重ならない時間なら⚠は出ない");
  ok(S.mgrBoard().indexOf("🔁") >= 0, "兼務スタッフがいるときは他店の予定を画面に出す");
}

/* ---------- 6. 保存データの形 ---------- */
sec("6. 保存データ（既存の内容を壊していないか）");
{
  const { S, els } = env("ohashi");
  const before = JSON.parse(JSON.stringify(S.DATA));
  S.openCond("s7");
  S.setCondEmp(1); S.toggleCondBoth();
  els.cnd_f = { value: "" }; els.cnd_t = { value: "" }; els.cnd_w = { value: "" };
  /* openCond が作る入力欄はスタブに無いので、値だけ差し替えて保存する */
  const origGet = S.document.getElementById;
  S.document.getElementById = (id) => (id in els ? els[id] : { value: "", innerHTML: "" });
  S.saveCond("s7");
  S.document.getElementById = origGet;
  const s = S.staffBy("s7");
  eq([s.emp, s.both], [1, 1], "社員・兼務が保存される");
  eq(s.name, before.staff.filter((x) => x.id === "s7")[0].name, "名前は変わらない");
  eq(Object.keys(S.DATA).sort(), Object.keys(before).sort(), "データの項目（staff/req/asg/submitted…）は増減しない");
  eq(S.DATA.req, before.req, "希望データは触っていない");
  eq(S.DATA.submitted, before.submitted, "提出状況は触っていない");
}
{
  /* 古い保存データ（emp/both が無い）でもそのまま動く */
  const { S } = env("ohashi");
  S.DATA.staff.forEach((s) => { delete s.emp; delete s.both; });
  ok(!S.hasBoth(), "兼務の人がいなければ他店を読みに行かない");
  draft(S, 16);
  ok((S.DATA.shift[16] || []).length > 0, "古いデータでも自動作成できる");
}

/* ---------- 7. たくさんの日でおかしくならないか ---------- */
sec("7. ランダムな希望で16日ぶん×両店（社員あり・兼務あり）");
{
  let rnd = 20260805;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let bands = 0, selfOverlap = 0, over = 0, xOverlap = 0, empSplit = 0, empDays = 0;
  ["ochiai", "ohashi"].forEach((shop) => {
    const { S } = env(shop, (S) => {
      S.DATA.staff.filter((s) => s.id === "s7")[0].emp = 1;      /* 終日OKの社員 */
      S.DATA.staff.filter((s) => s.id === "s4")[0].emp = 1;      /* 時間の限られた社員 */
      S.DATA.staff.filter((s) => s.id === "s7")[0].both = 1;
      S.DATA.staff.forEach((s) => {
        S.DATA.req[s.id] = {};
        for (let d = 16; d <= 31; d++) {
          const r = rand();
          S.DATA.req[s.id][d] = r < 0.2 ? { s: "ng", f: "", t: "" }
            : r < 0.35 ? { s: "tm", f: "09:00", t: "18:00" } : { s: "ok", f: "", t: "" };
        }
      });
    });
    /* 他店では s7（渡辺）が毎日 8〜12 時に入っている想定 */
    const xsh = {}; for (let d = 16; d <= 31; d++) xsh[d] = [{ id: "e" + d, sid: "x1", pos: "p1", f: "08:00", t: "12:00" }];
    S.XDATA[shop === "ochiai" ? "ohashi" : "ochiai"] = { staff: [{ id: "x1", name: "渡辺" }], shift: xsh };
    for (let d = 16; d <= 31; d++) {
      const ents = draft(S, d);
      bands += ents.length;
      ents.forEach((e) => { if (S.hasDup(d, e)) selfOverlap++;
        if (S.otherHit(e.sid, d, S.minutes(e.f), S.minutes(e.t))) xOverlap++; });
      for (let m = S.DAY_OPEN; m < S.DAY_CLOSE; m += 60) { const n = S.needAt(m, d); if (n && gotAt(S, d, m) > n) over++; }
      ["s7", "s4"].forEach((id) => { const b = bandsOf(S, d, id); if (b.length) empDays++; if (b.length > 2) empSplit++; });
    }
  });
  ok(bands > 150, "じゅうぶんな量を試した（32日ぶん・帯" + bands + "本）", bands);
  eq(selfOverlap, 0, "同じ人が同じ時間に二重に入っていない");
  eq(over, 0, "必要人数を超えて入れていない");
  eq(xOverlap, 0, "兼務スタッフが他のお店と重なっていない");
  ok(empSplit === 0, "社員が1日3本以上に細切れになっていない（" + empDays + "日ぶん）", empSplit);
}

/* ---------- 8. 他店データの読み込みは「見るだけ」か ---------- */
sec("8. 他店データは見るだけ（もう一方のお店を書きかえない）");
{
  const { mkStore, mkCloud } = require("./harness");
  const storage = mkStore(), cloud = mkCloud();
  const OHASHI = JSON.stringify({ staff: [{ id: "x1", name: "渡辺" }],
    shift: { 22: [{ id: "e1", sid: "x1", pos: "p1", f: "10:00", t: "15:00" }] }, req: {}, updatedAt: 5 });
  cloud.docs["shifttrial_ohashi"] = OHASHI;
  storage.setItem("st_cache", '{"staff":[],"req":{},"asg":{},"submitted":{},"updatedAt":99}');  /* おはし二日町の端末キャッシュ */
  const { sandbox: S } = makeEnv({ storage, cloud });
  S.applyShop("ochiai");
  S.DATA = { staff: [{ id: "s7", name: "渡辺", pos: [], both: 1 }], req: {}, asg: {}, submitted: {}, updatedAt: 1 };
  S.loadOther();
  new Promise((r) => setTimeout(r, 30)).then(() => {
    ok(S.otherBusy("s7", 22).length === 1, "他店のデータをクラウドから読めた", S.otherBusy("s7", 22));
    eq(cloud.docs["shifttrial_ohashi"], OHASHI, "他店のクラウドデータは変わっていない");
    ok(!cloud.log.some((l) => l.op === "PUT" && l.doc === "shifttrial_ohashi"), "他店へ書き込んでいない", cloud.log);
    eq(JSON.parse(storage.getItem("st_cache")).updatedAt, 99, "他店の端末キャッシュを上書きしていない");
    fin();
  });
}
function fin() {
  console.log("\n=========================");
  console.log("  成功 " + pass + " / 失敗 " + fail);
  console.log("=========================");
  process.exit(fail ? 1 : 0);
}
