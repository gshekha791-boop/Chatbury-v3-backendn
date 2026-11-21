import { db } from "./firebase.js";
import { FieldValue } from "firebase-admin/firestore";

const users = db.collection("users");
const conversations = db.collection("conversations");
const messages = db.collection("messages");
const usage = db.collection("usage");

export async function listConversations(uid) {
  const snap = await conversations.where("uid", "==", uid).orderBy("updated_at", "desc").limit(100).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function createConversation(uid, title = "New conversation") {
  const ref = await conversations.add({ uid, title: String(title).slice(0, 100), created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
  return ref.id;
}
export async function getConversation(uid, id) {
  const doc = await conversations.doc(id).get();
  if (!doc.exists || doc.data().uid !== uid) return null;
  return { id: doc.id, ...doc.data() };
}
export async function getMessages(uid, id) {
  if (!(await getConversation(uid, id))) return null;
  const snap = await messages.where("conversationId", "==", id).orderBy("created_at", "asc").limit(500).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addMessage(uid, id, role, content) {
  if (!(await getConversation(uid, id))) throw new Error("Conversation not found.");
  await messages.add({ uid, conversationId: id, role, content, created_at: FieldValue.serverTimestamp() });
  await conversations.doc(id).update({ updated_at: FieldValue.serverTimestamp() });
}
export async function renameConversation(uid, id, title) {
  if (!(await getConversation(uid, id))) return false;
  await conversations.doc(id).update({ title: String(title).trim().slice(0, 100), updated_at: FieldValue.serverTimestamp() });
  return true;
}
export async function deleteConversation(uid, id) {
  if (!(await getConversation(uid, id))) return false;
  const snap = await messages.where("conversationId", "==", id).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(conversations.doc(id));
  await batch.commit();
  return true;
}
export async function addUsage(uid, inputTokens = 0, outputTokens = 0) {
  await usage.doc(uid).set({
    requests: FieldValue.increment(1),
    inputTokens: FieldValue.increment(Number(inputTokens) || 0),
    outputTokens: FieldValue.increment(Number(outputTokens) || 0),
    updated_at: FieldValue.serverTimestamp()
  }, { merge: true });
}
export async function getUsage(uid) {
  const d = await usage.doc(uid).get();
  const x = d.exists ? d.data() : {};
  return { requests: x.requests || 0, inputTokens: x.inputTokens || 0, outputTokens: x.outputTokens || 0 };
}
