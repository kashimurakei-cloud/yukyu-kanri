// Firestore のデータ操作をまとめた層（予約方式の計画年休に対応）
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { weekdayKeyOf, todayStr, calcBalance, empTypeOf } from "./lib/leave";

/* ---------- スタッフ ---------- */
export async function getStaff(uid) {
  const snap = await getDoc(doc(db, "staff", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getAllStaff() {
  const snap = await getDocs(collection(db, "staff"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertStaff(uid, data) {
  await setDoc(doc(db, "staff", uid), data, { merge: true });
}

// 退職処理: データは残したまま status="retired" にする（復帰は status:"active" で上書き）
export async function retireStaff(uid, retiredDate) {
  await updateDoc(doc(db, "staff", uid), { status: "retired", retiredDate });
}
export async function unretireStaff(uid) {
  await updateDoc(doc(db, "staff", uid), { status: "active", retiredDate: "" });
}

// 完全削除: 取得記録ごとFirestoreから消す（Authアカウントはコンソールで別途削除）
export async function deleteStaffCompletely(uid) {
  const records = await getLeaveRecords(uid);
  for (const r of records) {
    await deleteDoc(doc(db, "staff", uid, "leaveRecords", r.id));
  }
  await deleteDoc(doc(db, "staff", uid));
}

/* ---------- 取得記録 ---------- */
export async function getLeaveRecords(uid) {
  const q = query(collection(db, "staff", uid, "leaveRecords"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addLeaveRecord(uid, staffName, rec, notify = true) {
  const ref = await addDoc(collection(db, "staff", uid, "leaveRecords"), {
    ...rec,
    createdAt: serverTimestamp(),
  });
  if (notify) {
    await addDoc(collection(db, "notifications"), {
      staffUid: uid,
      staffName: staffName || "",
      action: rec.type === "planned" ? "計画年休の反映" : "新規取得登録",
      date: rec.date,
      minutes: rec.minutes,
      read: false,
      createdAt: serverTimestamp(),
    });
  }
  return ref.id;
}

// 取得記録の更新（院長が使用）
export async function updateLeaveRecord(uid, recordId, patch) {
  await updateDoc(doc(db, "staff", uid, "leaveRecords", recordId), patch);
}

// 取得記録の削除（院長＝全件、本人＝未来日の通常取得のみ）
export async function deleteLeaveRecord(uid, recordId) {
  await deleteDoc(doc(db, "staff", uid, "leaveRecords", recordId));
}

/* ---------- アカウント再発行の引き継ぎ ----------
   旧UIDのスタッフ情報と取得記録を新UIDへ丸ごとコピーし、旧データを削除する。
   （パスワードを忘れた際、院長がコンソールで旧アカウント削除→アプリで再発行した後に使う） */
export async function migrateStaffData(oldUid, newUid) {
  const staff = await getStaff(oldUid);
  if (!staff) throw new Error("旧データが見つかりません");
  const { id: _omit, ...staffData } = staff;
  await setDoc(doc(db, "staff", newUid), staffData);
  const records = await getLeaveRecords(oldUid);
  for (const r of records) {
    const { id: _rid, ...recData } = r;
    await addDoc(collection(db, "staff", newUid, "leaveRecords"), recData);
  }
  for (const r of records) {
    await deleteDoc(doc(db, "staff", oldUid, "leaveRecords", r.id));
  }
  await deleteDoc(doc(db, "staff", oldUid));
}

/* ---------- 通知（院長のみ） ---------- */
export async function getNotifications() {
  const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addNotification(payload) {
  await addDoc(collection(db, "notifications"), {
    ...payload,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(notifs) {
  await Promise.all(
    (notifs || [])
      .filter((n) => !n.read)
      .map((n) => updateDoc(doc(db, "notifications", n.id), { read: true }))
  );
}

/* ---------- 計画年休（予約方式） ----------
   plannedLeaves: { date, memo, status: 'pending' | 'applied', createdAt }
*/
export async function getPlannedLeaves() {
  const q = query(collection(db, "plannedLeaves"), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addPlannedLeave(dateStr, memo) {
  const ref = await addDoc(collection(db, "plannedLeaves"), {
    date: dateStr,
    memo: memo || "",
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePlannedLeave(id) {
  await deleteDoc(doc(db, "plannedLeaves", id));
}

// 反映済の計画年休を取消: 各スタッフに配られた記録(plannedId一致)を削除して残高を戻し、予定自体も削除する。
// 退職者の記録も対象（復帰時に残高が正しくなるように）。
export async function cancelPlannedLeave(id) {
  const all = await getAllStaff();
  const staffOnly = all.filter((s) => s.role === "staff");
  let removed = 0;
  for (const s of staffOnly) {
    const snap = await getDocs(collection(db, "staff", s.id, "leaveRecords"));
    for (const d of snap.docs) {
      if (d.data().plannedId === id) {
        await deleteDoc(doc(db, "staff", s.id, "leaveRecords", d.id));
        removed++;
      }
    }
  }
  await deleteDoc(doc(db, "plannedLeaves", id));
  return removed;
}

// 到来した計画年休を取得記録に反映する。
// 「反映済」も毎回チェックする（冪等）: 反映処理の後からスタッフ登録や曜日設定をした場合でも、
// 次回の起動時に不足分が自動で追い反映される。plannedIdの重複チェックがあるので二重には入らない。
export async function applyDuePlannedLeaves(allStaff, asOf = todayStr()) {
  const planned = await getPlannedLeaves();
  const due = planned.filter((p) => p.date <= asOf);
  const staffOnly = allStaff.filter((s) => s.role === "staff" && s.status !== "retired");
  const appliedSummaries = [];
  if (due.length === 0) return appliedSummaries;

  // スタッフごとの記録と反映済plannedIdを一括取得（1人1回の読み取りで済ませる）
  const havePlanned = {};
  const recsByStaff = {};
  for (const s of staffOnly) {
    const recs = await getLeaveRecords(s.id);
    recsByStaff[s.id] = recs;
    havePlanned[s.id] = new Set(recs.map((r) => r.plannedId).filter(Boolean));
  }

  const skippedShort = []; // 残不足で反映しなかった人（特別休暇/休業手当で対応してもらう）
  for (const p of due) {
    for (const s of staffOnly) {
      if (s.joinDate && p.date < s.joinDate) continue; // 入職前の計画年休は対象外
      const key = weekdayKeyOf(p.date);
      const m = s.minutesPerDay?.[key] ?? 0;
      if (m <= 0) continue;
      if (havePlanned[s.id].has(p.id)) continue;
      // 反映しないケース（取得しすぎ・超過を出さない）:
      // ① まだ一度も付与されていない人（入職6ヶ月未満・付与なし設定のみ）→ 常勤/非常勤とも
      // ② 非常勤で、その日時点の残が足りない人
      // 常勤で付与済みの人は不足でも反映し、超過分は別枠（overflowMin）で警告される。
      const recsBefore = recsByStaff[s.id].filter((r) => r.date <= p.date);
      const balAt = calcBalance(s, recsBefore, p.date);
      const noGrantYet = balAt.grantedMin <= 0;
      if (noGrantYet || (empTypeOf(s) === "part" && balAt.remainMin < m)) {
        skippedShort.push({ staffName: s.name, date: p.date });
        continue;
      }
      await addLeaveRecord(
        s.id,
        s.name,
        { date: p.date, minutes: m, type: "planned", memo: p.memo || "計画年休", plannedId: p.id },
        false
      );
      havePlanned[s.id].add(p.id);
      recsByStaff[s.id].push({ date: p.date, minutes: m, type: "planned", plannedId: p.id });
      appliedSummaries.push({ staffName: s.name, date: p.date, minutes: m });
    }
    if (p.status !== "applied") {
      await updateDoc(doc(db, "plannedLeaves", p.id), { status: "applied" });
    }
  }

  if (skippedShort.length > 0) {
    const byDate = {};
    for (const x of skippedShort) {
      byDate[x.date] = byDate[x.date] || [];
      byDate[x.date].push(x.staffName);
    }
    for (const date of Object.keys(byDate)) {
      await addNotification({
        staffUid: "",
        staffName: "計画年休",
        action: date + " の計画年休: " + byDate[date].join("・") + " は残不足（または未付与）のため反映していません",
        date,
        minutes: 0,
      });
    }
  }

  if (appliedSummaries.length > 0) {
    const byDate = {};
    for (const a of appliedSummaries) {
      byDate[a.date] = byDate[a.date] || [];
      byDate[a.date].push(a.staffName);
    }
    for (const date of Object.keys(byDate)) {
      await addNotification({
        staffUid: "",
        staffName: "計画年休",
        action: date + " の計画年休を反映（" + byDate[date].join("・") + "）",
        date,
        minutes: 0,
      });
    }
  }
  return appliedSummaries;
}
