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
import { weekdayKeyOf, todayStr } from "./lib/leave";

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

/* ---------- 取得記録 ---------- */
export async function getLeaveRecords(uid) {
  const q = query(collection(db, "staff", uid, "leaveRecords"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addLeaveRecord(uid, staffName, rec, notify = true) {
  await addDoc(collection(db, "staff", uid, "leaveRecords"), {
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
}

async function hasPlannedRecord(uid, plannedId) {
  const snap = await getDocs(collection(db, "staff", uid, "leaveRecords"));
  return snap.docs.some((d) => d.data().plannedId === plannedId);
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
  await addDoc(collection(db, "plannedLeaves"), {
    date: dateStr,
    memo: memo || "",
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function deletePlannedLeave(id) {
  await deleteDoc(doc(db, "plannedLeaves", id));
}

// 到来した計画年休（今日以前のpending）を取得記録に反映する。
export async function applyDuePlannedLeaves(allStaff, asOf = todayStr()) {
  const planned = await getPlannedLeaves();
  const due = planned.filter((p) => p.status !== "applied" && p.date <= asOf);
  const staffOnly = allStaff.filter((s) => s.role === "staff");
  const appliedSummaries = [];

  for (const p of due) {
    for (const s of staffOnly) {
      const key = weekdayKeyOf(p.date);
      const m = s.minutesPerDay?.[key] ?? 0;
      if (m <= 0) continue;
      const already = await hasPlannedRecord(s.id, p.id);
      if (already) continue;
      await addLeaveRecord(
        s.id,
        s.name,
        { date: p.date, minutes: m, type: "planned", memo: p.memo || "計画年休", plannedId: p.id },
        false
      );
      appliedSummaries.push({ staffName: s.name, date: p.date, minutes: m });
    }
    await updateDoc(doc(db, "plannedLeaves", p.id), { status: "applied" });
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
