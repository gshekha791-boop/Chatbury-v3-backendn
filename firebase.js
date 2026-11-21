import admin from "firebase-admin";

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim()) {
    return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
  }
  throw new Error("Missing Firebase Admin credentials. Add FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64.");
}

const serviceAccount = loadServiceAccount();
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
export const db = admin.firestore();
export const auth = admin.auth();
