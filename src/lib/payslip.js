// 給与明細Excel（1シート=1ヶ月、シート内に1人ずつの明細ブロックが縦に並ぶ形式）のパーサ。
// ブロック構造（先頭行を b とする）:
//   b   : 「給 与 明 細」タイトル
//   b+2 : 支給日（col11）
//   b+3 : ラベル行（専従年月日/職名/氏名）
//   b+4 : 値行（col0=「令和8年6月分」、col5=職名、col7=氏名）
//   支給ブロック: col0が「支給」の行=ラベル、+1=サブラベル（ベースアップ手当/通勤手当）、+2=金額
//   控除ブロック: col0が「控除」の行=ラベル、+1=金額
//   「差引支給額」ラベルセルの2行下・同じ列に差引額
//   勤怠: col0が「勤怠」の行=ラベル（col1,2）、+1=値

const norm = (s) => String(s ?? "").replace(/[\s　]/g, "");

export function normalizeName(s) {
  return norm(s);
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,，円]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// シート名 → "YYYY-MM"。例: "R8.6分"→2026-06, "Ｈ29.4分"→2017-04。変換できなければ null。
export function sheetNameToMonth(name) {
  const s = String(name || "")
    .replace(/[Ｒ]/g, "R").replace(/[Ｈ]/g, "H").replace(/[．]/g, ".")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s/g, "");
  const m = s.match(/^([RH])(\d+)\.(\d+)分?$/);
  if (!m) return null;
  const era = m[1] === "R" ? 2018 : 1988;
  const year = era + Number(m[2]);
  const month = Number(m[3]);
  if (month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

// 給与の月シートらしい名前か（年末調整やSheet1を除外）
export function isMonthSheet(name) {
  return sheetNameToMonth(name) !== null;
}

// rows: 2次元配列（XLSX.utils.sheet_to_json(ws, {header:1}) の結果）
// 戻り値: [{name, title, monthLabel, payDate, pay:[{label,amount}], payTotal, deduct:[{label,amount}], deductTotal, net, kintai:[{label,value}]}]
export function parsePayslipRows(rows) {
  const R = rows || [];
  const cellv = (r, c) => (R[r] && R[r][c] != null ? R[r][c] : "");
  const txt = (r, c) => String(cellv(r, c)).trim();
  const ntxt = (r, c) => norm(cellv(r, c));

  // ブロック先頭（「給与明細」で始まる行）
  const starts = [];
  for (let r = 0; r < R.length; r++) {
    if (ntxt(r, 0).startsWith("給与明細")) starts.push(r);
  }

  const slips = [];
  for (let i = 0; i < starts.length; i++) {
    const b = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : R.length;

    // 氏名: ラベル行(b+3)で「氏」を含む列 → その下の行の同じ列
    let name = "";
    let title = "";
    let monthLabel = "";
    let payDate = "";
    for (let r = b; r < Math.min(b + 6, end); r++) {
      for (let c = 0; c < 16; c++) {
        if (ntxt(r, c).startsWith("氏名")) {
          name = norm(cellv(r + 1, c));
        }
        if (ntxt(r, c) === "職名") {
          title = norm(cellv(r + 1, c));
        }
      }
      if (/年.*月分/.test(txt(r, 0))) monthLabel = txt(r, 0);
      for (let c = 8; c < 16; c++) {
        if (/令和|平成|\d+\.\d+\.\d+/.test(txt(r, c)) && !payDate) payDate = txt(r, c);
      }
    }
    if (!name) continue; // 空ブロックはスキップ

    // 支給・控除・勤怠・差引
    const pay = [];
    const deduct = [];
    const kintai = [];
    let payTotal = null;
    let deductTotal = null;
    let net = null;

    for (let r = b; r < end; r++) {
      const head = ntxt(r, 0);
      if (head === "支給") {
        const sub = r + 1;
        const val = r + 2;
        for (let c = 1; c < 16; c++) {
          const label = norm(cellv(sub, c)) || norm(cellv(r, c));
          const amount = num(cellv(val, c));
          if (!label || amount == null) continue;
          if (label === "計") continue;
          if (label === "支給総額") { payTotal = amount; continue; }
          pay.push({ label, amount });
        }
        // 支給総額列: ラベル行で探して値行から取る（サブラベルに無い場合）
        if (payTotal == null) {
          for (let c = 1; c < 16; c++) {
            if (norm(cellv(r, c)) === "支給総額") payTotal = num(cellv(val, c));
          }
        }
      } else if (head === "控除") {
        const val = r + 1;
        for (let c = 1; c < 16; c++) {
          const label = norm(cellv(r, c));
          const amount = num(cellv(val, c));
          if (!label || amount == null) continue;
          if (label === "計") continue;
          if (label === "控除計") { deductTotal = amount; continue; }
          deduct.push({ label, amount });
        }
      } else if (head === "勤怠") {
        for (let c = 1; c < 8; c++) {
          const label = norm(cellv(r, c));
          const value = String(cellv(r + 1, c)).trim();
          if (label && value) kintai.push({ label, value });
        }
      }
      // 差引支給額: ラベルセルの下2行以内の同じ列
      for (let c = 0; c < 16; c++) {
        if (ntxt(r, c) === "差引支給額") {
          for (let dr = 1; dr <= 3; dr++) {
            const n = num(cellv(r + dr, c));
            if (n != null) { net = n; break; }
          }
        }
      }
    }

    slips.push({ name, title, monthLabel, payDate, pay, payTotal, deduct, deductTotal, net, kintai });
  }
  return slips;
}
