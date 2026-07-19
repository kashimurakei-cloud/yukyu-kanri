import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { parsePayslipRows, sheetNameToMonth, isMonthSheet, normalizeName } from "../lib/payslip";
import { upsertPayslip, getPayslips, setPayslipPublished, deletePayslip } from "../data";
import { S } from "../styles";

/* 給与明細の取り込みタブ（院長のみ）
   1. 給与明細のExcel（.xls / .xlsx）をアップロード
   2. 月（シート）を選ぶ → 明細ブロックをパースして名前でスタッフに自動照合
   3. プレビューを確認して保存 → 各スタッフの staff/{uid}/payslips/{YYYY-MM} に入る
   同じ月をもう一度取り込むと上書きされる（修正はやり直せばOK）。 */
export default function PayrollTab({ staffList, showToast }) {
  const [wb, setWb] = useState(null);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState("");
  const [slips, setSlips] = useState(null);
  const [month, setMonth] = useState("");
  const [assign, setAssign] = useState({}); // slip index -> staff.id or ""
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [error, setError] = useState("");
  const [existing, setExisting] = useState(null); // 取り込み済み: [{month, entries:[{staffId,name,net,published}]}]

  const monthSheets = wb ? wb.SheetNames.filter(isMonthSheet) : [];

  // 取り込み済みの月一覧（公開状態の管理用）
  async function loadExisting() {
    try {
      const map = {};
      for (const s of staffList) {
        const ps = await getPayslips(s.id);
        for (const p of ps) {
          map[p.month] = map[p.month] || [];
          map[p.month].push({ staffId: s.id, name: s.name, net: p.net, published: p.published === true });
        }
      }
      setExisting(
        Object.keys(map).sort().reverse().map((m) => ({ month: m, entries: map[m] }))
      );
    } catch (e) {
      console.error(e);
      setExisting([]);
    }
  }
  useEffect(() => {
    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function publishMonth(m, entries, published) {
    if (published && !window.confirm(
      `${m.replace("-", "年")}月分（${entries.length}人）をスタッフに公開しますか?\n公開すると各スタッフが自分の明細を見られるようになります。`
    )) return;
    setBusy(true);
    try {
      for (const e of entries) await setPayslipPublished(e.staffId, m, published);
      await loadExisting();
      showToast?.(published ? `✓ ${m.replace("-", "年")}月分を公開しました` : `✓ ${m.replace("-", "年")}月分を非公開に戻しました`);
    } catch (e) {
      console.error(e);
      alert("更新に失敗しました。");
    }
    setBusy(false);
  }

  async function deleteMonth(m, entries) {
    if (!window.confirm(`${m.replace("-", "年")}月分（${entries.length}人）の明細データを削除しますか?`)) return;
    setBusy(true);
    try {
      for (const e of entries) await deletePayslip(e.staffId, m);
      await loadExisting();
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました。");
    }
    setBusy(false);
  }

  function autoAssign(parsed) {
    const map = {};
    parsed.forEach((slip, i) => {
      const hit = staffList.find((s) => normalizeName(s.name) === normalizeName(slip.name));
      map[i] = hit ? hit.id : "";
    });
    return map;
  }

  function selectSheet(workbook, name) {
    setSheet(name);
    setDoneMsg("");
    setError("");
    try {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true });
      const parsed = parsePayslipRows(rows);
      setSlips(parsed);
      setAssign(autoAssign(parsed));
      setMonth(sheetNameToMonth(name) || "");
      if (parsed.length === 0) setError("このシートから明細を読み取れませんでした。月のシートを選んでいるか確認してください。");
    } catch (e) {
      console.error(e);
      setSlips(null);
      setError("シートの読み取りに失敗しました。");
    }
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setDoneMsg("");
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const workbook = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
        setWb(workbook);
        const months = workbook.SheetNames.filter(isMonthSheet);
        const latest = months.length ? months[months.length - 1] : workbook.SheetNames[0];
        selectSheet(workbook, latest);
      } catch (err) {
        console.error(err);
        setError("ファイルを読み込めませんでした。Excelファイル（.xls / .xlsx）か確認してください。");
      }
    };
    reader.readAsArrayBuffer(f);
  }

  async function save() {
    if (!month || !slips) return;
    const targets = slips.map((slip, i) => ({ slip, uid: assign[i] })).filter((x) => x.uid);
    if (targets.length === 0) { setError("保存先のスタッフが1人も選ばれていません。"); return; }
    setBusy(true);
    setError("");
    try {
      for (const t of targets) {
        const { name, ...rest } = t.slip;
        await upsertPayslip(t.uid, month, { ...rest, sourceName: name, importedAt: new Date().toISOString() });
      }
      setDoneMsg(
        `✓ ${month.replace("-", "年")}月分として ${targets.length}人の明細を保存しました（まだ非公開です。下の「取り込み済みの月」で内容を確認して「公開する」を押すとスタッフに見えるようになります）。`
      );
      showToast?.(`✓ 給与明細 ${targets.length}人分を保存しました（非公開）`);
      await loadExisting();
    } catch (e) {
      console.error(e);
      setError("保存に失敗しました。Firestoreルールに payslips の許可を追加したか確認してください。");
    }
    setBusy(false);
  }

  return (
    <section style={S.card}>
      <h2 style={S.cardTitle}>💰 給与明細の取り込み</h2>
      <p style={S.noteSmall}>
        給与明細のExcel（1シート=1ヶ月の形式）をアップロード → 月を選ぶ → 照合を確認して保存。
        スタッフは自分の明細だけを自分の画面で見られます。電子交付にする場合は本人の同意を取っておいてください。
      </p>

      <label style={S.fieldLabel}>給与明細のExcelファイル（.xls / .xlsx）</label>
      <input type="file" accept=".xls,.xlsx" onChange={handleFile} style={{ marginBottom: 10 }} />
      {fileName && <p style={S.noteSmall}>読み込み中のファイル: {fileName}</p>}

      {wb && (
        <>
          <label style={S.fieldLabel}>取り込む月（シート）</label>
          <select value={sheet} onChange={(e) => selectSheet(wb, e.target.value)} style={S.input}>
            {monthSheets.map((n) => (
              <option key={n} value={n}>{n}（{sheetNameToMonth(n)?.replace("-", "年")}月）</option>
            ))}
          </select>

          <label style={S.fieldLabel}>保存する月</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={S.input} />
        </>
      )}

      {slips && slips.length > 0 && (
        <>
          <h3 style={S.subTitle}>照合プレビュー（{slips.length}人分を検出）</h3>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Excelの氏名</th>
                <th style={S.thR}>差引支給額</th>
                <th style={S.th}>保存先スタッフ</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((slip, i) => (
                <tr key={i}>
                  <td style={S.tdBold}>{slip.name}{slip.title ? `（${slip.title}）` : ""}</td>
                  <td style={S.tdR}>{slip.net != null ? `${slip.net.toLocaleString()}円` : "—"}</td>
                  <td style={S.td}>
                    <select
                      value={assign[i] || ""}
                      onChange={(e) => setAssign((m) => ({ ...m, [i]: e.target.value }))}
                      style={{ ...S.input, padding: "6px 8px", margin: 0 }}
                    >
                      <option value="">取り込まない</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={S.noteSmall}>
            名前が自動で一致しなかった人は「保存先スタッフ」を選んでください。院長自身などアプリで管理しない人は「取り込まない」のままでOK。
          </p>

          {error && <div style={S.errorBox}>{error}</div>}
          {doneMsg && <div style={{ ...S.errorBox, background: "#e8f3ee", color: "#2f6358" }}>{doneMsg}</div>}

          <button style={{ ...S.btnPrimary, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy || !month}>
            {busy ? "保存中…" : "この内容で保存する"}
          </button>
        </>
      )}
      {!slips && error && <div style={S.errorBox}>{error}</div>}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed #e2ded5" }}>
        <h3 style={S.subTitle}>📂 取り込み済みの月（公開の管理）</h3>
        <p style={S.noteSmall}>
          保存した明細は<strong>非公開</strong>から始まります。内容を確認して「公開する」を押した月だけスタッフに表示されます。
        </p>
        {existing === null ? (
          <p style={S.empty}>読み込み中…</p>
        ) : existing.length === 0 ? (
          <p style={S.empty}>まだ取り込みはありません。</p>
        ) : (
          existing.map((g) => {
            const pubCount = g.entries.filter((e) => e.published).length;
            const allPub = pubCount === g.entries.length;
            return (
              <details key={g.month} style={{ marginBottom: 8, border: "1px solid #e2ded5", borderRadius: 10, padding: "8px 12px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 13.5, padding: "2px 0" }}>
                  {g.month.replace("-", "年")}月分
                  <span style={{ marginLeft: 10 }}>
                    {allPub ? (
                      <span style={S.tagActive}>公開中（{g.entries.length}人）</span>
                    ) : pubCount > 0 ? (
                      <span style={S.cautionTag}>一部公開（{pubCount}/{g.entries.length}人）</span>
                    ) : (
                      <span style={S.tagExpired}>非公開（{g.entries.length}人）</span>
                    )}
                  </span>
                </summary>
                <table style={S.table}>
                  <tbody>
                    {g.entries.map((e) => (
                      <tr key={e.staffId}>
                        <td style={S.tdBold}>{e.name}</td>
                        <td style={S.tdR}>{e.net != null ? `${Number(e.net).toLocaleString()}円` : "—"}</td>
                        <td style={S.td}>{e.published ? <span style={S.tagActive}>公開</span> : <span style={S.tagExpired}>非公開</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {!allPub && (
                    <button style={{ ...S.btnPrimary, marginTop: 0, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => publishMonth(g.month, g.entries, true)}>
                      公開する
                    </button>
                  )}
                  {pubCount > 0 && (
                    <button style={S.btnGhost} disabled={busy} onClick={() => publishMonth(g.month, g.entries, false)}>
                      非公開に戻す
                    </button>
                  )}
                  <button
                    style={{ ...S.btnGhost, color: "#b4341f", borderColor: "#e3b5ad" }}
                    disabled={busy}
                    onClick={() => deleteMonth(g.month, g.entries)}
                  >
                    この月を削除
                  </button>
                </div>
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}
