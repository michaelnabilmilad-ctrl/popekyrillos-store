// Local stand-in for the Firebase web SDK, used only by scripts/e2e-cross-engraving.cjs so a
// "signed-in customer" can be tested without any real account or network. Playwright serves
// these modules in place of www.gstatic.com/firebasejs/*; the customer's server cart
// (Firestore customerCarts/<uid>) lives in this browser's localStorage under __fakeFirestore.
const USER = { uid: "uid-local-customer", email: "local.customer@example.test", displayName: "عميل مسجل (تجربة)" };
const API_KEY = "local-demo-key";

const config = `window.POPE_KYRILLOS_FIREBASE_CONFIG = ${JSON.stringify({ apiKey: API_KEY, authDomain: "local.test", projectId: "local-demo", appId: "1:0:web:local" })};
window.POPE_KYRILLOS_API_CONFIG = { bostaDeliveryEndpoint: "", orderEndpoint: "" };`;

const app = `export const initializeApp = (c) => ({ options: c, name: "[DEFAULT]" });
export const getApps = () => [];
export const getApp = () => ({ name: "[DEFAULT]" });`;

const auth = `const USER = ${JSON.stringify(USER)};
const KEY = "firebase:authUser:${API_KEY}:[DEFAULT]";
const signedIn = () => { try { return localStorage.getItem("__fakeSignedOut") !== "1"; } catch { return true; } };
function user() { return { ...USER, isAnonymous: false, emailVerified: true, providerData: [{ providerId: "password" }], getIdToken: async () => "local-fake-token" }; }
const listeners = new Set();
const authObj = { get currentUser() { return signedIn() ? user() : null; } };
if (signedIn()) localStorage.setItem(KEY, JSON.stringify({ uid: USER.uid, email: USER.email }));
export const browserLocalPersistence = {}; export const indexedDBLocalPersistence = {}; export const browserPopupRedirectResolver = {};
export const initializeAuth = () => authObj; export const getAuth = () => authObj; export const connectAuthEmulator = () => {};
export function onAuthStateChanged(_a, cb) { listeners.add(cb); setTimeout(() => cb(authObj.currentUser), 30); return () => listeners.delete(cb); }
export async function signOut() { localStorage.setItem("__fakeSignedOut", "1"); localStorage.removeItem(KEY); listeners.forEach((cb) => cb(null)); }
export async function signInWithEmailAndPassword() { localStorage.removeItem("__fakeSignedOut"); listeners.forEach((cb) => cb(user())); return { user: user() }; }
export const createUserWithEmailAndPassword = signInWithEmailAndPassword; export const signInWithPopup = signInWithEmailAndPassword; export const signInWithRedirect = signInWithEmailAndPassword;
export const sendPasswordResetEmail = async () => {};
export class GoogleAuthProvider { setCustomParameters() {} }`;

const firestore = `const STORE = "__fakeFirestore";
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
export const getFirestore = () => ({}); export const connectFirestoreEmulator = () => {};
export const doc = (_db, collection, id) => ({ path: collection + "/" + id });
export const serverTimestamp = () => new Date().toISOString();
export async function getDoc(ref) { const data = read()[ref.path]; return { exists: () => Boolean(data), data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined) }; }
export async function setDoc(ref, data, opts) { const all = read(); all[ref.path] = opts?.merge ? { ...(all[ref.path] || {}), ...data } : data; localStorage.setItem(STORE, JSON.stringify(all)); }`;

async function installFakeFirebase(context) {
  const js = (body) => ({ status: 200, contentType: "text/javascript; charset=utf-8", body });
  await context.route(/\/firebase-config(\.min)?\.js/, (route) => route.fulfill(js(config)));
  await context.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-app\.js/, (route) => route.fulfill(js(app)));
  await context.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-auth\.js/, (route) => route.fulfill(js(auth)));
  await context.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-firestore\.js/, (route) => route.fulfill(js(firestore)));
}

module.exports = { installFakeFirebase, USER };
