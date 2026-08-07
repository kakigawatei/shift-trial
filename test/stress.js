/* まとめ検証：いろいろな条件（勤務可能時間・休み・できるポジション）をランダムに作り、
   16日×40通りぶん自動作成して、シフト表として破綻していないかを確かめる。
   ・同じポジションに何人も細切れで入っていないか
   ・同じポジション・同じ時間に重ねていないか（ガントで帯が隠れる）
   ・ポジションの時間帯から外れた場所に置いていないか
   ・上限を設けた店舗で、同じ人が1日に2本に分かれていないか            */
const { makeEnv } = require("./harness");
const { sandbox: S } = makeEnv();

let pass = 0, fail = 0;
function ok(c, n, x) { if (c) { pass++; console.log("  OK   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } }

let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pickA(a) { return a[Math.floor(rnd() * a.length)]; }

function measure(shop) {
  seed = 12345;
  const T = { multi: 0, withEmpty: 0, overlap: 0, outBand: 0, dupPerson: 0, bands: 0, days: 0 };
  for (let k = 0; k < 40; k++) {
    S.applyShop(shop);
    const O = S.DAY_OPEN, C = S.DAY_CLOSE, n = 6 + Math.floor(rnd() * 8), staff = [];
    for (let i = 0; i < n; i++) {
      const st = { id: "s" + i, name: "人" + i, pos: [] };
      if (rnd() < 0.6) { const a = O + Math.floor(rnd() * ((C - O) / 60 - 4)) * 60;
        st.avF = S.fmtHM(a); st.avT = S.fmtHM(Math.min(a + (5 + Math.floor(rnd() * 6)) * 60, C)); }
      if (rnd() < 0.25) { const all = S.POS.map((p) => p.id);
        st.pos = all.filter(() => rnd() < 0.5); if (!st.pos.length) st.pos = [pickA(all)]; }
      staff.push(st);
    }
    const req = {};
    staff.forEach((s) => { req[s.id] = {}; S.PERIOD.days.forEach((d) => { if (rnd() < 0.15) req[s.id][d] = { s: "ng" }; }); });
    S.DATA = { staff: staff, req: req, asg: {}, submitted: {}, updatedAt: 1 };
    S.ensureColors();

    S.PERIOD.days.forEach((day) => {
      S.MDAY = day; S.autoDraft(); T.days++;
      const ents = S.DATA.shift[day] || [], byPos = {};
      T.bands += ents.length;
      ents.forEach((e) => { (byPos[e.pos] = byPos[e.pos] || []).push(e); });
      /* 外販など nc のポジションは頭数あわせの置き場所ではないので「空きポジション」に数えない */
      const empty = S.posFor(day).filter((p) => !p.nc).map((p) => p.id).filter((p) => !byPos[p]).length;
      let mm = 0;
      Object.keys(byPos).forEach((p) => {
        const es = byPos[p]; if (es.length > 1) mm += es.length - 1;
        es.forEach((a, i) => es.forEach((b, j) => {
          if (j > i && S.overlapMM(S.minutes(a.f), S.minutes(a.t), S.minutes(b.f), S.minutes(b.t))) T.overlap++; }));
      });
      T.multi += mm; if (mm && empty) T.withEmpty++;
      const seen = {};
      ents.forEach((e) => {
        if (seen[e.sid]) T.dupPerson++; seen[e.sid] = 1;
        if (!S.fitsPos(e.pos, day, S.minutes(e.f), S.minutes(e.t))) T.outBand++;
      });
    });
  }
  return T;
}

/* 修正前（コミット 2a0557c）に同じ条件で測った値。ここより悪くなっていないことを見る */
const BEFORE = {
  ochiai: { multi: 248, withEmpty: 218, overlap: 0, outBand: 19, dupPerson: 450 },
  ohashi: { multi: 489, withEmpty: 332, overlap: 0, outBand: 22, dupPerson: 245 },
};

console.log("\n== 落合（1人6時間まで・ポジションの時間あり） ==");
{
  const T = measure("ochiai"), B = BEFORE.ochiai;
  console.log("  " + T.days + "日ぶん / 帯" + T.bands + "本 " + JSON.stringify(T));
  ok(T.bands > 1000, "じゅうぶんな量を試した", T.bands);
  ok(T.overlap === 0, "同じポジション・同じ時間に重ねた帯は0（ガントで帯が隠れない）", T.overlap);
  ok(T.dupPerson === 0, "同じ人が1日に2本に分かれた帯は0（修正前" + B.dupPerson + "件の細切れ→0）", T.dupPerson);
  /* 外販を頭数から外した(2026-08-07)ため、外販の時間帯(8-14時)に必要人数がポジション数を超えると
     同じポジションに2人入る日が増える（外販に頭数あわせの人を置かなくなったぶん。修正前248件よりは大幅に少ない）。
     ここより悪くなっていないことを見る */
  ok(T.multi <= 128, "同じポジションに複数人が増えていない（外販除外の基準値128件→" + T.multi + "件・修正前は" + B.multi + "件）", T.multi);
  ok(T.withEmpty <= 112, "『空いているポジションがあるのに同じ所へ』が増えていない（基準値112日→" + T.withEmpty + "日／" + T.days + "日・修正前は" + B.withEmpty + "日）", T.withEmpty);
  /* 時間帯から外れる残りは、その人の「できるポジション」が限られていて置き場所が無い場合。
     店長に⚠で見えているので直せる。修正前より増えていないことだけ確かめる */
  ok(T.outBand <= B.outBand, "ポジションの時間帯から外れた帯が増えていない（修正前" + B.outBand + "件→" + T.outBand + "件）", T.outBand);
}

console.log("\n== おはし二日町（上限なし・従来どおりの組み方） ==");
{
  const T = measure("ohashi"), B = BEFORE.ohashi;
  console.log("  " + T.days + "日ぶん / 帯" + T.bands + "本 " + JSON.stringify(T));
  ok(T.overlap === 0, "同じポジション・同じ時間に重ねた帯は0", T.overlap);
  ok(T.outBand <= B.outBand, "ポジションの時間帯から外れた帯が増えていない（修正前" + B.outBand + "件→" + T.outBand + "件）", T.outBand);
  ok(T.multi * 3 < B.multi, "同じポジションに複数人が減った（修正前" + B.multi + "件→" + T.multi + "件）", T.multi);
  /* おはし二日町は1人あたりの上限を設けていないので、昼と夜に分けて入る「中抜け」は今までどおり。
     だれが何時から何時まで入るかは旧版と完全に同じ（test/regress.js で確認） */
  ok(T.dupPerson === B.dupPerson, "人の割り当ては従来どおり（中抜け" + T.dupPerson + "件も修正前と同じ）", T.dupPerson);
}

console.log("\n=========================\n  成功 " + pass + " / 失敗 " + fail + "\n=========================");
process.exit(fail ? 1 : 0);
