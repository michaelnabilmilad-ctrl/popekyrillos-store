const whatsappNumber = "201016125589";

function trackCheckoutEvent(name, data = {}) {
  window.StoreAnalytics?.track?.(name, data);
  if ((name === "checkout_error" || name === "order_failed") && data.errorMessage) {
    window.Sentry?.captureMessage?.(String(data.errorMessage).slice(0, 300), "error");
  }
}

function checkoutAnalyticsItem(item, quantity = item?.qty || 1) {
  return {
    productId: item?.product?.id || item?.id || "",
    productName: item?.product?.name || "",
    category: item?.product?.mainCategory || item?.product?.category || "",
    price: item?.price,
    quantity,
    currency: "EGP"
  };
}
const firebaseSdkVersion = "10.14.1";
const paymobIntentionEndpointPath = "/api/create-paymob-intention";
const bostaDeliveryEndpointPath = "/api/create-bosta-delivery";
const ordersEndpointPath = "/api/orders";
const guestCartStorageKey = "pope-kyrillos-cart:guest";
const userCartStoragePrefix = "pope-kyrillos-cart:user:";
const activeCartStorageKey = "pope-kyrillos-cart:active";
const cachedAuthStorageKey = "pope-kyrillos-auth:user";
const cartSyncStorageKey = "pope-kyrillos-cart:sync";
const checkoutStorageKey = "pope-kyrillos-checkout";
const checkoutOrderRequestStorageKey = "pope-kyrillos-checkout:order-request";
const encodingCleanupStorageKey = "pope-kyrillos-encoding-cleanup:v1";
const mojibakeSequencePattern = /[\u00d8\u00d9][\u0080-\u00ff\u201a-\u2026]/u;
const cartSeparator = "::";

const formatter = new Intl.NumberFormat("ar-EG");
let products = [];
let cart = new Map();
let cartItemMetadata = new Map();
let cartWriteClock = 0;
clearCorruptedBrowserStorage();
let customer = loadCustomer();
let checkoutAuthServicesPromise = null;

const translations = {
  available: "متاح",
  askPrice: "اسأل عن السعر",
  emptyCart: "السلة فارغة حاليا.",
  unavailableLine: "غير متاح حاليًا — احذفه من السلة لإكمال الطلب",
  unavailableBlock: "في السلة منتجات غير متاحة حاليًا. احذفها للمتابعة.",
  total: "الإجمالي",
  productsTotal: "إجمالي المنتجات",
  continueShopping: "الرجوع للتسوق",
  checkout: "إدخال بيانات الاستلام",
  continuePayment: "الذهاب للدفع",
  updateCart: "تم تحديث السلة",
  remove: "حذف",
  quantity: "الكمية",
  detailsRequired: "اكتب بيانات الاستلام الأول",
  invalidPhone: "اكتب رقم موبايل صحيح",
  invalidEmail: "اكتب بريد إلكتروني صحيح أو سيبه فاضي",
  governorateRequired: "اختار المحافظة",
  cityRequired: "اكتب المدينة أو المنطقة",
  addressRequired: "اكتب العنوان بالتفصيل",
  bostaNote: "الشحن مع بوسطا يتم تأكيده حسب العنوان.",
  pickupNote: "استلام من الفرع بدون شحن.",
  paymobBusy: "جاري فتح Paymob...",
  paymobFailed: "تعذر فتح Paymob الآن. حاول مرة أخرى.",
  sendOrder: "إرسال الطلب",
  payPaymob: "ادفع Paymob الآن",
  copied: "تم النسخ",
  bostaBusy: "جاري إنشاء شحنة بوسطا...",
  bostaFailed: "تعذر إنشاء شحنة بوسطا الآن. هنرسل الطلب وتقدر تتابعه يدويًا.",
  bostaReady: "تم إنشاء شحنة بوسطا",
  bostaReferenceLine: "رقم شحنة بوسطا: {reference}"
};

function t(key) {
  return translations[key] || key;
}

function text(key, values = {}) {
  return Object.entries(values).reduce((message, [name, value]) => message.replaceAll(`{${name}}`, value), t(key));
}

Object.assign(translations, {
  orderSubmitBusy: "\u062c\u0627\u0631\u064a \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0637\u0644\u0628...",
  orderSubmitFailed: "\u0644\u0645 \u064a\u062a\u0645 \u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0637\u0644\u0628. \u0627\u062d\u062a\u0641\u0638\u0646\u0627 \u0628\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u062f\u0627\u062e\u0644 \u0627\u0644\u0633\u0644\u0629\u060c \u0628\u0631\u062c\u0627\u0621 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
  orderSubmitReady: "\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0637\u0644\u0628. \u0633\u064a\u062a\u0645 \u0641\u062a\u062d \u0648\u0627\u062a\u0633\u0627\u0628 \u0644\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644."
});

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return t("askPrice");
  return `${formatter.format(amount)} ج.م`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearCorruptedBrowserStorage() {
  try {
    if (localStorage.getItem(encodingCleanupStorageKey) === "done") return;
  } catch {
    return;
  }

  [localStorage, sessionStorage].forEach((storage) => {
    try {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        const value = key ? storage.getItem(key) : "";
        if (value && mojibakeSequencePattern.test(value)) storage.removeItem(key);
      }
    } catch {
      // Storage can be blocked in private browsing; continue with fresh page data.
    }
  });

  try {
    localStorage.setItem(encodingCleanupStorageKey, "done");
  } catch {
    // Ignore storage write failures.
  }
}

function cartKey(productId, variantId = "default", lineId = "") {
  return `${productId}${cartSeparator}${variantId || "default"}${lineId ? `${cartSeparator}${lineId}` : ""}`;
}

function parseCartKey(key) {
  const [productId, variantId = "default", lineId = ""] = String(key).split(cartSeparator);
  return { productId, variantId, lineId };
}

function cartPayloadFromMap(map = cart) {
  return [...map.entries()]
    .map(([key, qty]) => {
      const { productId, variantId, lineId } = parseCartKey(key);
      return { productId, variantId, ...(lineId ? { lineId } : {}), qty: Number(qty) || 0, ...(cartItemMetadata.get(key) || {}) };
    })
    .filter((item) => item.productId && item.qty > 0);
}

function cartMapFromPayload(items = []) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  items.forEach((item) => {
    const productId = item.productId || parseCartKey(item.key || "").productId;
    const variantId = item.variantId || parseCartKey(item.key || "").variantId || "default";
    const qty = Number(item.qty);
    if (!productId || !Number.isFinite(qty) || qty <= 0) return;
    const key = cartKey(productId, variantId, item.lineId || "");
    map.set(key, Math.floor(qty));
    const metadata = {
      previewImage: item.previewImage || "",
      designId: item.designId || "",
      designName: item.designName || "",
      selectedColors: Array.isArray(item.selectedColors) ? item.selectedColors : [],
      coloringDesign: item.coloringDesign || null,
      woodType: item.woodType || "",
      finalPrice: Number(item.finalPrice) || 0
    };
    if (metadata.previewImage || metadata.coloringDesign || metadata.woodType) cartItemMetadata.set(key, metadata);
  });
  return map;
}

function mergeCartMaps(first, second) {
  const merged = new Map(first);
  second.forEach((qty, key) => merged.set(key, Math.max(merged.get(key) || 0, qty)));
  return merged;
}

function readCartRecord(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { key, cart: new Map(), updatedAt: 0, exists: false };
    const data = JSON.parse(raw);
    const updatedAt = Date.parse(data.updatedAt || "") || 0;
    return { key, cart: cartMapFromPayload(data.items || data), updatedAt, exists: true };
  } catch {
    return { key, cart: new Map(), updatedAt: 0, exists: false };
  }
}

function nextCartTimestamp(key) {
  const storedUpdatedAt = readCartRecord(key).updatedAt;
  cartWriteClock = Math.max(Date.now(), storedUpdatedAt + 1, cartWriteClock + 1);
  return new Date(cartWriteClock).toISOString();
}

// uid in the session record Firebase persists itself (firebase:authUser:<apiKey>:[DEFAULT]).
// It is a hint only: it never selects an account cart on its own.
function persistedFirebaseSessionUid() {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (!key.startsWith("firebase:authUser:")) continue;
      const uid = JSON.parse(localStorage.getItem(key) || "null")?.uid;
      if (uid) return String(uid);
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }
  return "";
}

// Last profile the Firebase SDK confirmed on this device (written by
// saveCachedAuthUser after a confirmed sign-in, removed on sign-out).
function storedConfirmedProfile() {
  try {
    const raw = localStorage.getItem(cachedAuthStorageKey);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.uid ? user : null;
  } catch {
    return null;
  }
}

function hasLocalSessionHint() {
  return Boolean(storedConfirmedProfile() || persistedFirebaseSessionUid());
}

function cartOwnerOfKey(key = "") {
  return String(key).startsWith(userCartStoragePrefix) ? String(key).slice(userCartStoragePrefix.length) : "";
}

// Identity used to pick the account cart: only the user the Firebase SDK confirmed
// on this page. Local records only tell the page to wait for that answer.
let checkoutConfirmedUser = null;
let checkoutAuthSettled = false;
// Owner of the cart in memory ("" = guest); a cart is only ever written to the
// server document of the account that owns it.
let cartOwner = "";
// uid whose server cart this page has merged with; direct saves wait for it.
let checkoutSyncedUid = "";

function loadCachedAuthUser() {
  return checkoutConfirmedUser;
}

function authProfile(user) {
  if (!user?.uid) return null;
  return {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || ""
  };
}

function saveCachedAuthUser(user) {
  const profile = authProfile(user);
  if (!profile) return;
  try {
    localStorage.setItem(cachedAuthStorageKey, JSON.stringify({ ...profile, confirmedAt: Date.now() }));
  } catch {
    // Ignore localStorage write failures.
  }
}

function clearCachedAuthUser() {
  try {
    localStorage.removeItem(cachedAuthStorageKey);
  } catch {
    // Local storage cleanup is best-effort.
  }
}

function currentUserCartStorageKey(user = loadCachedAuthUser()) {
  return user?.uid ? `${userCartStoragePrefix}${user.uid}` : guestCartStorageKey;
}

function isAllowedCartStorageKey(key, user = loadCachedAuthUser()) {
  return key === guestCartStorageKey || key === currentUserCartStorageKey(user);
}

function saveCartRecord(key, map) {
  try {
    const updatedAt = nextCartTimestamp(key);
    localStorage.setItem(
      key,
      JSON.stringify({ items: cartPayloadFromMap(map), updatedAt })
    );
    setActiveCartKey(key);
    localStorage.setItem(cartSyncStorageKey, JSON.stringify({ key, updatedAt }));
  } catch {
    // Ignore localStorage write failures.
  }
}

function setActiveCartKey(key) {
  try {
    localStorage.setItem(activeCartStorageKey, key);
  } catch {
    // Ignore localStorage write failures.
  }
}

function cartHasItems(map) {
  return [...map.values()].some((qty) => Number(qty) > 0);
}

function cartFingerprint(map) {
  return JSON.stringify(
    cartPayloadFromMap(map).sort((a, b) => `${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`))
  );
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  if (typeof value === "number") return value;
  return Date.parse(String(value)) || 0;
}

function withTimeout(promise, timeoutMs = 3500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("Timed out")), timeoutMs);
    })
  ]);
}

function savedCartKeys(user = loadCachedAuthUser()) {
  // Same rule as script.js: a confirmed customer reads the account copy only.
  if (user?.uid) return [currentUserCartStorageKey(user)];
  const keys = [];
  try {
    const activeKey = localStorage.getItem(activeCartStorageKey);
    if (isAllowedCartStorageKey(activeKey, user)) keys.push(activeKey);
  } catch {
    // Ignore localStorage read failures.
  }
  keys.push(guestCartStorageKey);
  return [...new Set(keys.filter(Boolean))];
}

function loadCart(user = loadCachedAuthUser()) {
  const records = savedCartKeys(user)
    .map(readCartRecord)
    .filter((record) => record.exists || record.updatedAt > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const selected = records[0];
  if (!selected) {
    cartOwner = user?.uid ? String(user.uid) : "";
    return new Map();
  }
  setActiveCartKey(selected.key);
  cartOwner = cartOwnerOfKey(selected.key);
  return selected.cart;
}

function saveCart() {
  // The cart in memory belongs to the confirmed account or to the guest; save it
  // under that owner's key (the guest key while the session is not confirmed).
  const confirmedUser = loadCachedAuthUser();
  const targetKey = confirmedUser?.uid && cartOwner === confirmedUser.uid ? currentUserCartStorageKey(confirmedUser) : guestCartStorageKey;
  saveCartRecord(targetKey, cart);
  saveCurrentCheckoutCartRemote();
}

function checkoutCartStorageKeys(user = loadCachedAuthUser()) {
  const keys = new Set([
    guestCartStorageKey,
    currentUserCartStorageKey(user),
    activeCartStorageKey,
    cartSyncStorageKey
  ]);
  [localStorage, sessionStorage].forEach((storage) => {
    try {
      const activeKey = storage.getItem(activeCartStorageKey);
      if (activeKey === guestCartStorageKey || activeKey?.startsWith(userCartStoragePrefix)) keys.add(activeKey);
    } catch {
      // Storage cleanup is best-effort.
    }
  });
  return [...keys].filter(Boolean);
}

function clearCheckoutCartStorage() {
  const keys = checkoutCartStorageKeys();
  [localStorage, sessionStorage].forEach((storage) => {
    keys.forEach((key) => {
      try {
        storage.removeItem(key);
      } catch {
        // Storage cleanup is best-effort.
      }
    });
  });
}

async function clearCheckoutCartAfterSuccessfulOrder() {
  cart = new Map();
  const remoteClear = saveCurrentCheckoutCartRemote().catch(() => false);
  clearCheckoutCartStorage();
  setCartCount();
  renderCartPage();
  renderOrderSummary();
  await remoteClear;
}

function firebaseConfig() {
  return window.POPE_KYRILLOS_FIREBASE_CONFIG || {};
}

// Local testing only; same guard as script.js connectLocalFirebaseEmulators.
function connectLocalFirebaseEmulators(authModule, firestoreModule, auth, db) {
  const emulator = firebaseConfig().emulator;
  if (!emulator || !["127.0.0.1", "localhost"].includes(window.location.hostname)) return;
  authModule.connectAuthEmulator(auth, emulator.authUrl, { disableWarnings: true });
  firestoreModule.connectFirestoreEmulator(db, emulator.firestoreHost, Number(emulator.firestorePort));
}

function hasFirebaseConfig() {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

async function checkoutAuthServices() {
  if (!hasFirebaseConfig()) return null;
  if (checkoutAuthServicesPromise) return checkoutAuthServicesPromise;

  checkoutAuthServicesPromise = (async () => {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-firestore.js`)
    ]);
    const app = appModule.initializeApp(firebaseConfig());
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);
    connectLocalFirebaseEmulators(authModule, firestoreModule, auth, db);
    await authModule.setPersistence(auth, authModule.browserLocalPersistence);
    return {
      auth,
      db,
      onAuthStateChanged: authModule.onAuthStateChanged,
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      setDoc: firestoreModule.setDoc,
      serverTimestamp: firestoreModule.serverTimestamp
    };
  })();
  // A failed download is retried on the next call instead of failing for good.
  checkoutAuthServicesPromise.catch(() => { checkoutAuthServicesPromise = null; });

  return checkoutAuthServicesPromise;
}

async function currentCheckoutUser() {
  try {
    const services = await checkoutAuthServices();
    if (!services?.auth) return null;
    if (services.auth.currentUser) {
      checkoutConfirmedUser = authProfile(services.auth.currentUser);
      checkoutAuthSettled = true;
      saveCachedAuthUser(services.auth.currentUser);
      return services.auth.currentUser;
    }
    return await new Promise((resolve) => {
      let unsubscribe = () => {};
      const timeout = window.setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, 2500);
      unsubscribe = services.onAuthStateChanged(services.auth, (user) => {
        window.clearTimeout(timeout);
        unsubscribe();
        checkoutConfirmedUser = user ? authProfile(user) : null;
        checkoutAuthSettled = true;
        if (user) {
          saveCachedAuthUser(user);
        } else {
          clearCachedAuthUser();
        }
        resolve(user);
      });
    });
  } catch (error) {
    console.warn("Could not restore checkout auth.", error);
    return null;
  }
}

async function loadRemoteCartForCheckout(services, user) {
  return (await loadRemoteCartRecordForCheckout(services, user)).cart;
}

async function loadRemoteCartRecordForCheckout(services, user) {
  try {
    const snapshot = await withTimeout(services.getDoc(services.doc(services.db, "customerCarts", user.uid)));
    const data = snapshot.exists() ? snapshot.data() : {};
    return {
      ok: true,
      cart: cartMapFromPayload(data.items || []),
      updatedAt: Math.max(timestampMillis(data.clientUpdatedAt), timestampMillis(data.updatedAt))
    };
  } catch (error) {
    console.warn("Could not load remote checkout cart.", error);
    return { ok: false, cart: new Map(), updatedAt: 0 };
  }
}

async function saveRemoteCartForCheckout(services, user, map) {
  try {
    await withTimeout(
      services.setDoc(
        services.doc(services.db, "customerCarts", user.uid),
        {
          items: cartPayloadFromMap(map),
          clientUpdatedAt: new Date().toISOString(),
          updatedAt: services.serverTimestamp()
        },
        { merge: true }
      )
    );
    return true;
  } catch (error) {
    console.warn("Could not save remote checkout cart.", error);
    return false;
  }
}

async function saveCurrentCheckoutCartRemote() {
  const user = await currentCheckoutUser();
  if (!user?.getIdToken) return false;
  // Never write a guest or other account's cart over this account's server cart:
  // merge it into the account cart instead (the merge saves the result).
  if (cartOwner !== user.uid || checkoutSyncedUid !== user.uid) {
    const changed = await restoreSignedInCheckoutCart();
    applyCheckoutCartSync(changed);
    return true;
  }

  let services = null;
  try {
    services = await checkoutAuthServices();
  } catch {
    services = null;
  }
  if (!services?.db) return false;

  return saveRemoteCartForCheckout(services, user, cart);
}

async function restoreSignedInCheckoutCart() {
  const realUser = await currentCheckoutUser();
  const user = realUser;
  if (!user) return false;
  const before = cartFingerprint(cart);

  let services = null;
  try {
    services = await checkoutAuthServices();
  } catch {
    services = null;
  }
  // Same rule as the storefront (script.js applySignedInCart): account cart plus
  // every guest line, larger quantity wins, guest cleared only after a server save.
  const userCartKey = `${userCartStoragePrefix}${user.uid}`;
  const guestRecord = readCartRecord(guestCartStorageKey);
  const userLocalRecord = readCartRecord(userCartKey);
  const remoteResult =
    services && realUser?.getIdToken ? await loadRemoteCartRecordForCheckout(services, realUser) : { ok: false, cart: new Map() };
  const localHasNewerChanges = userLocalRecord.updatedAt > (remoteResult.updatedAt || 0);
  const accountCart = !remoteResult.ok
    ? userLocalRecord.cart
    : localHasNewerChanges ? mergeCartMaps(remoteResult.cart, userLocalRecord.cart) : remoteResult.cart;
  const signedInCart = mergeCartMaps(accountCart, guestRecord.cart);

  saveCartRecord(userCartKey, signedInCart);
  cartOwner = user.uid;
  if (remoteResult.ok) {
    checkoutSyncedUid = user.uid;
    const saved = cartFingerprint(signedInCart) === cartFingerprint(remoteResult.cart)
      || await saveRemoteCartForCheckout(services, realUser, signedInCart);
    if (saved && guestRecord.exists) {
      try {
        localStorage.removeItem(guestCartStorageKey);
      } catch {
        // Local storage cleanup is best-effort.
      }
    }
  }
  return cartFingerprint(signedInCart) !== before;
}

function loadCustomer() {
  try {
    return JSON.parse(localStorage.getItem(checkoutStorageKey) || "{}");
  } catch {
    return {};
  }
}

function saveCustomer(next) {
  customer = next;
  localStorage.setItem(checkoutStorageKey, JSON.stringify(next));
}

function getProduct(id) {
  return products.find((item) => item.id === id);
}

function productPrice(product) {
  const value = Number(product?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getProductVariants(product) {
  if (isMedalProduct(product)) {
    return [
      { id: "medal-wood-plywood", title: "خشب كونتر", price: 18, compareAtPrice: 20, discountRate: 0.1, options: { "نوع الخشب": "كونتر" }, available: true },
      { id: "medal-wood-beech", title: "خشب زان", price: 27, compareAtPrice: 30, discountRate: 0.1, options: { "نوع الخشب": "زان" }, available: true }
    ];
  }
  if (Array.isArray(product?.variants) && product.variants.length) return product.variants;
  return [{ id: "default", price: productPrice(product), options: {}, available: product?.stock !== "غير متاح حاليا" }];
}

function isMedalProduct(product) {
  return /(?:مادلي|ميدالي|medal)/i.test(String(product?.name || ""));
}

function findVariant(product, variantId = "default") {
  return getProductVariants(product).find((variant) => String(variant.id || "default") === String(variantId)) || getProductVariants(product)[0];
}

function variantPrice(variant, product) {
  const value = Number(variant?.price ?? product?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function variantOptionText(variant) {
  const options = Object.entries(variant?.options || {});
  return options.map(([name, value]) => `${name}: ${value}`).join("، ");
}

function productImage(product) {
  if (Array.isArray(product?.images) && product.images[0]) return product.images[0];
  return product?.image || "";
}

// Mirrors the storefront rule (script.js isVariantAvailable); the server re-checks at order time.
function isCartLineUnavailable(product, variant) {
  if (product?.stock === "غير متاح حاليا" || product?.stock === "Currently unavailable" || product?.available === false) return true;
  if (variant?.quantity !== null && variant?.quantity !== undefined && variant?.quantity !== "" && Number(variant.quantity) <= 0) return true;
  return variant?.available === false;
}

function cartEntries() {
  return [...cart.entries()]
    .map(([key, qty]) => {
      const { productId, variantId } = parseCartKey(key);
      const product = getProduct(productId);
      if (!product) return null;
      const variant = findVariant(product, variantId);
      const price = variantPrice(variant, product);
      const basePrice = Number(variant?.compareAtPrice);
      const safeBasePrice = Number.isFinite(basePrice) && basePrice >= price ? basePrice : price;
      const metadata = cartItemMetadata.get(key) || {};
      return {
        key,
        product,
        variant,
        qty,
        price,
        basePrice: safeBasePrice,
        discount: safeBasePrice !== null && price !== null ? safeBasePrice - price : 0,
        optionText: variantOptionText(variant),
        ...metadata,
        unavailable: isCartLineUnavailable(product, variant)
      };
    })
    .filter(Boolean);
}

function cartHasUnavailableLines() {
  return cartEntries().some((item) => item.unavailable);
}

function cartTotal() {
  return cartEntries().reduce((sum, item) => sum + (item.unavailable ? 0 : (item.price || 0) * item.qty), 0);
}

let checkoutSessionPending = false;
let checkoutVerifyFailed = false;

function setCartCount() {
  if (checkoutSessionPending) {
    document.querySelectorAll("[data-cart-count]").forEach((node) => { node.textContent = ""; });
    return;
  }
  // Same badge rule as script.js and product-page.js.
  const count = [...cart.values()].reduce((sum, qty) => sum + Math.max(0, Math.floor(Number(qty) || 0)), 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = formatter.format(count);
  });
}

function canonicalPathname() {
  return window.location.pathname.replace(/\/$/, "") || "/";
}

function isCartPage() {
  const path = canonicalPathname();
  return path === "/cart" || path === "/cart.html";
}

function renderOrderSummary(targetSelector = "[data-order-summary]") {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  const entries = cartEntries();
  if (!entries.length) {
    target.innerHTML = `<p class="checkout-empty">${t("emptyCart")}</p>`;
    return;
  }
  target.innerHTML = `
    <div class="checkout-summary-list">
      ${entries
        .map((item) => {
          const image = item.previewImage || productImage(item.product);
          const lineTotal = item.price === null ? t("askPrice") : money(item.price * item.qty);
          return `
            <article class="checkout-summary-item">
              ${image ? `<img src="${escapeHtml(image)}" alt="" width="72" height="72" loading="lazy" decoding="async" />` : ""}
              <div>
                <h3>${escapeHtml(item.product.name)}</h3>
                ${item.optionText ? `<p>${escapeHtml(item.optionText)}</p>` : ""}
                <span>${t("quantity")}: ${formatter.format(item.qty)}</span>
                ${isMedalProduct(item.product) ? `<small>السعر الأساسي: <del>${money(item.basePrice)}</del> · الخصم: ${money(item.discount)} · السعر النهائي: ${money(item.price)}</small>` : ""}
              </div>
              <strong>${lineTotal}</strong>
            </article>
          `;
        })
        .join("")}
    </div>
    <div class="checkout-summary-total">
      <span>${t("productsTotal")}</span>
      <strong>${money(cartTotal())}</strong>
    </div>
  `;
}

function renderCartPage() {
  const list = document.querySelector("[data-cart-page-items]");
  if (!list) return;
  const entries = cartEntries();
  if (!entries.length) {
    const english = document.documentElement.lang === "en";
    const waiting = checkoutSessionPending
      ? (english ? "Confirming your account and loading your cart…" : "جاري تأكيد حسابك وتحميل سلتك…")
      : checkoutVerifyFailed
      ? (english ? "Your account could not be confirmed (connection problem). Refresh the page to see your cart." : "تعذر تأكيد حسابك بسبب الاتصال. حدّث الصفحة لعرض سلة حسابك.")
      : t("emptyCart");
    list.innerHTML = `<p class="checkout-empty">${waiting}</p>`;
    document.querySelector("[data-cart-page-total]").textContent = money(0);
    document.querySelector("[data-cart-next]")?.setAttribute("aria-disabled", "true");
    return;
  }
  // Additions made while the account could not be confirmed: say the account cart
  // is still missing instead of letting these lines look like the whole cart.
  const accountNotice = checkoutVerifyFailed
    ? `<p class="checkout-empty">${document.documentElement.lang === "en" ? "Your account could not be confirmed (connection problem). Refresh the page to see your account cart; these are the items added meanwhile." : "تعذر تأكيد حسابك بسبب الاتصال. حدّث الصفحة لعرض سلة حسابك؛ دي المنتجات اللي اتضافت في الوقت ده."}</p>`
    : "";
  list.innerHTML = accountNotice + entries
    .map((item) => {
      const image = item.previewImage || productImage(item.product);
      const unitPrice = item.price === null ? t("askPrice") : money(item.price);
      return `
        <article class="cart-page-item">
          ${image ? `<img src="${escapeHtml(image)}" alt="" width="96" height="96" loading="lazy" decoding="async" />` : ""}
          <div>
            <h2>${escapeHtml(item.product.name)}</h2>
            ${item.optionText ? `<p>${escapeHtml(item.optionText)}</p>` : ""}
            ${item.unavailable ? `<p class="cart-unavailable" role="status">${t("unavailableLine")}</p>` : ""}
            ${isMedalProduct(item.product) ? `<p class="cart-medal-pricing"><span>السعر الأساسي: <del>${money(item.basePrice)}</del></span><span>خصم الخدمات 10%: -${money(item.discount)}</span><strong>السعر النهائي: ${unitPrice}</strong><strong>الإجمالي: ${money(item.price * item.qty)}</strong></p>` : `<span>${unitPrice}</span>`}
          </div>
          <div class="cart-page-actions">
            <div class="qty-control">
              <button type="button" data-cart-delta="-1" data-cart-key="${escapeHtml(item.key)}">-</button>
              <span>${formatter.format(item.qty)}</span>
              <button type="button" data-cart-delta="1" data-cart-key="${escapeHtml(item.key)}">+</button>
            </div>
            <button type="button" class="cart-remove" data-cart-remove="${escapeHtml(item.key)}">${t("remove")}</button>
          </div>
        </article>
      `;
    })
    .join("");
  if (entries.some((item) => item.unavailable)) {
    list.insertAdjacentHTML("afterbegin", `<p class="cart-unavailable-summary" role="alert">${t("unavailableBlock")}</p>`);
    document.querySelector("[data-cart-next]")?.setAttribute("aria-disabled", "true");
  } else {
    document.querySelector("[data-cart-next]")?.removeAttribute("aria-disabled");
  }
  document.querySelector("[data-cart-page-total]").textContent = money(cartTotal());
}

function bindCartPage() {
  const list = document.querySelector("[data-cart-page-items]");
  if (!list) return;
  document.querySelector("[data-cart-next]")?.addEventListener("click", (event) => {
    if (!cartEntries().length || cartHasUnavailableLines()) event.preventDefault();
  });
  list.addEventListener("click", (event) => {
    const deltaButton = event.target.closest("[data-cart-delta]");
    const removeButton = event.target.closest("[data-cart-remove]");
    if (deltaButton) {
      const key = deltaButton.dataset.cartKey;
      const previous = cartEntries().find((item) => item.key === key);
      const next = (cart.get(key) || 0) + Number(deltaButton.dataset.cartDelta || 0);
      if (next <= 0) {
        cart.delete(key);
        cartItemMetadata.delete(key);
      }
      else cart.set(key, next);
      if (previous && Number(deltaButton.dataset.cartDelta || 0) < 0) {
        trackCheckoutEvent("remove_from_cart", checkoutAnalyticsItem(previous, Math.min(previous.qty, Math.abs(Number(deltaButton.dataset.cartDelta || 0)))));
      }
    }
    if (removeButton) {
      const removed = cartEntries().find((item) => item.key === removeButton.dataset.cartRemove);
      if (removed) trackCheckoutEvent("remove_from_cart", checkoutAnalyticsItem(removed));
      cart.delete(removeButton.dataset.cartRemove);
      cartItemMetadata.delete(removeButton.dataset.cartRemove);
    }
    saveCart();
    renderCartPage();
    setCartCount();
  });
}

function checkoutFormValues() {
  const deliveryMethod = document.querySelector("[name='deliveryMethod']:checked")?.value || "bosta";
  return {
    deliveryMethod,
    name: document.querySelector("[data-checkout-name]")?.value.trim() || "",
    phone: String(document.querySelector("[data-checkout-phone]")?.value || "").replace(/[^\d+]/g, "").trim(),
    email: document.querySelector("[data-checkout-email]")?.value.trim() || "",
    governorate: document.querySelector("[data-checkout-governorate]")?.value.trim() || "",
    city: document.querySelector("[data-checkout-city]")?.value.trim() || "",
    address: document.querySelector("[data-checkout-address]")?.value.trim() || "",
    notes: document.querySelector("[data-checkout-notes]")?.value.trim() || ""
  };
}

function validateCustomer(next) {
  if (!next.name) return "اكتب اسم العميل";
  if (!next.phone || next.phone.length < 10) return t("invalidPhone");
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return t("invalidEmail");
  if (next.deliveryMethod === "bosta") {
    if (!next.governorate) return t("governorateRequired");
    if (!next.city) return t("cityRequired");
    if (!next.address) return t("addressRequired");
  }
  return "";
}

function fillCheckoutForm() {
  if (!document.querySelector("[data-checkout-form]")) return;
  document.querySelector(`[name='deliveryMethod'][value='${customer.deliveryMethod || "bosta"}']`)?.click();
  const fields = {
    "[data-checkout-name]": customer.name,
    "[data-checkout-phone]": customer.phone,
    "[data-checkout-email]": customer.email,
    "[data-checkout-governorate]": customer.governorate,
    "[data-checkout-city]": customer.city,
    "[data-checkout-address]": customer.address,
    "[data-checkout-notes]": customer.notes
  };
  Object.entries(fields).forEach(([selector, value]) => {
    const node = document.querySelector(selector);
    if (node && value) node.value = value;
  });
  updateShippingFields();
}

function updateShippingFields() {
  const needsShipping = (document.querySelector("[name='deliveryMethod']:checked")?.value || "bosta") === "bosta";
  const shipping = document.querySelector("[data-shipping-fields]");
  if (shipping) shipping.hidden = !needsShipping;
  const note = document.querySelector("[data-delivery-note]");
  if (note) note.textContent = needsShipping ? t("bostaNote") : t("pickupNote");
}

function bindCheckoutPage() {
  const form = document.querySelector("[data-checkout-form]");
  if (!form) return;
  form.addEventListener("change", (event) => {
    updateShippingFields();
    if (event.target.matches("[name='deliveryMethod']")) {
      trackCheckoutEvent("select_delivery", { deliveryMethod: event.target.value || "unknown" });
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = checkoutFormValues();
    const error = validateCustomer(next);
    const status = document.querySelector("[data-checkout-status]");
    if (error) {
      if (status) status.textContent = error;
      return;
    }
    saveCustomer(next);
    trackCheckoutEvent("begin_checkout", { quantity: cartEntries().reduce((sum, item) => sum + item.qty, 0), price: cartTotal(), currency: "EGP" });
    window.location.href = "/payment";
  });
}

function paymentMessageLine(paymentMethod) {
  if (paymentMethod === "paymob") return "طريقة الدفع: Paymob Checkout.";
  if (paymentMethod === "pickupCash") return "طريقة الاستلام والدفع: استلام من الفرع، والدفع كاش بعد تجهيز الأوردر والتأكيد.";
  if (paymentMethod === "vodafoneCash") return "طريقة الدفع: فودافون كاش على رقم 01016125589. بعد التحويل سأرسل صورة الإيصال.";
  if (paymentMethod === "fawry") return "طريقة الدفع: فوري. برجاء إرسال كود الدفع بعد تأكيد الطلب.";
  return "طريقة الدفع: إنستاباي / تحويل بنكي على رقم 01223515989 باسم مايكل نبيل ميلاد. بعد التحويل سأرسل صورة الإيصال.";
}

function paymentCopyText(paymentMethod) {
  if (paymentMethod === "vodafoneCash") return "فودافون كاش\nرقم المحفظة: 01016125589";
  if (paymentMethod === "fawry") return "فوري\nسيتم تأكيد كود الدفع بعد مراجعة الطلب.";
  if (paymentMethod === "pickupCash") return "استلام من الفرع\nالدفع: كاش بعد تجهيز الأوردر والتأكيد";
  return "إنستاباي / تحويل بنكي\nرقم التحويل: 01223515989\nاسم الحساب: مايكل نبيل ميلاد";
}

function bostaReferenceLine(delivery = {}) {
  const reference =
    delivery.bostaReference ||
    delivery.trackingNumber ||
    delivery.awbNumber ||
    delivery.trackingCode ||
    delivery._id ||
    delivery.id ||
    delivery.businessReference ||
    "";
  return reference ? text("bostaReferenceLine", { reference }) : "";
}

async function createBostaDelivery(paymentMethod) {
  if (customer.deliveryMethod !== "bosta") return null;
  const response = await fetch(bostaDeliveryEndpointPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: cartPayloadFromMap(),
      customer,
      paymentMethod
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || data.message || t("bostaFailed"));
  return data;
}

function shippingMessageLine() {
  const email = customer.email ? `\nالبريد الإلكتروني: ${customer.email}` : "";
  const notes = customer.notes ? `\nملاحظات: ${customer.notes}` : "";
  if (customer.deliveryMethod === "pickup") {
    return `طريقة الاستلام: استلام من الفرع\nبيانات الاستلام:\nالاسم: ${customer.name}\nالموبايل: ${customer.phone}${email}${notes}`;
  }
  return `طريقة الاستلام: شحن مع بوسطا\nبيانات الشحن:\nالاسم: ${customer.name}\nالموبايل: ${customer.phone}\nالمحافظة: ${customer.governorate}\nالمدينة/المنطقة: ${customer.city}\nالعنوان: ${customer.address}${email}${notes}`;
}

function orderLines() {
  return cartEntries()
    .map((item) => {
      const price = item.price === null ? t("askPrice") : money(item.price);
      return `- ${item.product.name}${item.optionText ? ` (${item.optionText})` : ""}: ${formatter.format(item.qty)} × ${price}`;
    })
    .join("\n");
}

function savedColoringDesign(productId) {
  try {
    const modelId = localStorage.getItem(`yota-coloring-product-model:${productId}`) || "";
    const storageKey = modelId
      ? `yota-coloring-design-${modelId}`
      : `pope-kyrillos-coloring:${productId}`;
    const coloredParts = Object.values(JSON.parse(
      localStorage.getItem(storageKey) || "{}"
    )).filter((part) => part?.regionId && part?.colorId && part?.colorName && part?.colorHex);
    if (!coloredParts.length) return null;
    return {
      modelId: modelId || "yota-01",
      selectedColors: [...new Map(coloredParts.map((part) => [part.colorId, {
        colorId: part.colorId,
        colorName: part.colorName,
        colorHex: part.colorHex
      }])).values()],
      coloredParts
    };
  } catch {
    return null;
  }
}

function orderProductsPayload() {
  return JSON.stringify(
    cartEntries().map((item) => {
      const productId = item.product.id || item.id || "";
      const coloringDesign = item.coloringDesign || savedColoringDesign(productId);
      return {
        productId,
        name: item.product.name || "",
        image: item.previewImage || productImage(item.product),
        previewImage: item.previewImage || "",
        woodType: item.woodType || String(item.variant?.options?.["نوع الخشب"] || ""),
        designId: item.designId || productId,
        designName: item.designName || item.product.name || "",
        selectedColors: item.selectedColors || coloringDesign?.selectedColors || [],
        variantId: item.variant?.id || "",
        sku: String(item.variant?.sku || item.product?.sku || "").trim(),
        option: item.optionText || "",
        quantity: item.qty,
        price: item.price,
        basePrice: item.basePrice,
        discountRate: Number(item.variant?.discountRate) || 0,
        discountValue: item.discount,
        lineTotal: item.price === null ? null : (item.price || 0) * item.qty,
        ...(coloringDesign ? {
          coloringDesign,
          notes: `تصميم تلوين اليوطا: ${JSON.stringify(coloringDesign)}`
        } : {})
      };
    })
  );
}

function paymentStatusForOrder(paymentMethod) {
  if (["instapay", "vodafoneCash", "fawry"].includes(paymentMethod)) return "\u062a\u062d\u0648\u064a\u0644 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629";
  return "\u063a\u064a\u0631 \u0645\u062f\u0641\u0648\u0639";
}

function paymentMethodForOrder(paymentMethod) {
  if (paymentMethod === "vodafoneCash") return "Vodafone Cash";
  if (paymentMethod === "fawry") return "Online Payment";
  if (paymentMethod === "pickupCash") return "Cash";
  if (paymentMethod === "paymob") return "Online Payment";
  return "InstaPay";
}

function deliveryTypeForOrder() {
  return customer.deliveryMethod === "pickup" ? "\u0627\u0633\u062a\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629" : "\u0634\u062d\u0646";
}

function orderAddress() {
  if (customer.deliveryMethod === "pickup") return "\u0627\u0633\u062a\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629";
  return [customer.governorate, customer.city, customer.address].filter(Boolean).join(" - ");
}

function orderMissingInfo() {
  const missing = validateCustomer(customer);
  return missing ? missing : "\u0644\u0627 \u064a\u0648\u062c\u062f";
}

function createRequestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function checkoutRequestId() {
  const fingerprint = cartFingerprint(cart);
  try {
    const saved = JSON.parse(sessionStorage.getItem(checkoutOrderRequestStorageKey) || "{}");
    if (saved.requestId && saved.fingerprint === fingerprint) return saved.requestId;
  } catch {
    // Fall through and create a new request id.
  }
  const requestId = createRequestId();
  try {
    sessionStorage.setItem(checkoutOrderRequestStorageKey, JSON.stringify({ requestId, fingerprint }));
  } catch {
    // Session storage can be unavailable; the in-page submission guard still applies.
  }
  return requestId;
}

function clearCheckoutRequestId(requestId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(checkoutOrderRequestStorageKey) || "{}");
    if (!requestId || saved.requestId === requestId) sessionStorage.removeItem(checkoutOrderRequestStorageKey);
  } catch {
    try {
      sessionStorage.removeItem(checkoutOrderRequestStorageKey);
    } catch {
      // Session storage cleanup is best-effort.
    }
  }
}

function completedOrderId(data = {}) {
  return data.orderId || data.publicOrderToken || "";
}

function assertCompletedOrder(data, expectedDetailCount) {
  const detailCount = Number(data?.detailCount);
  if (
    data?.ok !== true ||
    !completedOrderId(data) ||
    !Number.isInteger(detailCount) ||
    detailCount !== expectedDetailCount
  ) {
    throw new Error(t("orderSubmitFailed"));
  }
  return data;
}

async function createWebsiteOrder(paymentMethod, requestId) {
  const products = orderProductsPayload();
  const expectedDetailCount = JSON.parse(products).length;
  const response = await fetch(ordersEndpointPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId
    },
    body: JSON.stringify({
      requestId,
      customerName: customer.name,
      phone: customer.phone,
      address: orderAddress(),
      source: "Website",
      products,
      total: cartTotal(),
      paymentStatus: paymentStatusForOrder(paymentMethod),
      paymentMethod: paymentMethodForOrder(paymentMethod),
      paymentProof: "",
      pickupDate: "",
      deliveryType: deliveryTypeForOrder(),
      orderStatus: "\u062c\u062f\u064a\u062f",
      missingInfo: orderMissingInfo(),
      notes: customer.notes || ""
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.message || t("orderSubmitFailed"));
    error.status = response.status;
    error.serverCode = data.error || "request_failed";
    error.fields = Array.isArray(data.fields) ? data.fields : [];
    throw error;
  }
  return assertCompletedOrder(data, expectedDetailCount);
}

function whatsappOrderUrl(paymentMethod, extra = "") {
  const note = customer.deliveryMethod === "bosta" ? t("bostaNote") : t("pickupNote");
  const body = `مرحباً، أريد طلب المنتجات التالية من مكتبة البابا كيرلس:\n${orderLines()}\nإجمالي المنتجات المسعرة: ${money(cartTotal())}\n${note}\n${shippingMessageLine()}${extra ? `\n${extra}` : ""}\n${paymentMessageLine(paymentMethod)}`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(body)}`;
}

async function startPaymob(button) {
  const items = cartPayloadFromMap();
  if (!items.length) return;
  button.disabled = true;
  button.textContent = t("paymobBusy");
  try {
    const response = await fetch(paymobIntentionEndpointPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, customer, language: "ar" })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error || !data.checkoutUrl) throw new Error(data.message || data.error || t("paymobFailed"));
    window.location.href = data.checkoutUrl;
  } catch (error) {
    const status = document.querySelector("[data-payment-status]");
    if (status) status.textContent = error.message || t("paymobFailed");
    button.disabled = false;
    button.textContent = t("payPaymob");
  }
}

function bindPaymentPage() {
  const page = document.querySelector("[data-payment-page]");
  if (!page) return;
  const missingCustomer = validateCustomer(customer);
  if (missingCustomer) {
    window.location.href = "/checkout";
    return;
  }
  let isSubmittingOrder = false;
  document.querySelectorAll("[data-payment-action]").forEach((button) => {
    if (button.dataset.paymentAction === "paymob") {
      button.disabled = true;
      button.closest("article")?.setAttribute("hidden", "");
      return;
    }
    if (button.dataset.paymentAction === "pickupCash" && customer.deliveryMethod !== "pickup") {
      button.disabled = true;
      button.closest("article")?.classList.add("payment-option-disabled");
      return;
    }
    button.addEventListener("click", () => {
      const method = button.dataset.paymentAction;
      trackCheckoutEvent("select_payment_method", { paymentMethod: method || "unknown", price: cartTotal(), currency: "EGP" });
      if (method === "paymob") {
        startPaymob(button);
        return;
      }
      const sendOrder = async () => {
        if (isSubmittingOrder) return;
        const status = document.querySelector("[data-payment-status]");
        const missingCustomerField = validateCustomer(customer);
        if (missingCustomerField) {
          if (status) status.textContent = `\u0627\u0644\u062d\u0642\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628: ${missingCustomerField}`;
          return;
        }
        if (!method) {
          if (status) status.textContent = "\u0627\u0644\u062d\u0642\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628: \u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639";
          return;
        }
        if (cartHasUnavailableLines()) {
          if (status) status.textContent = t("unavailableBlock");
          return;
        }
        const originalText = button.textContent;
        const requestId = checkoutRequestId();
        let extraLine = "";
        const completedEntries = cartEntries();
        isSubmittingOrder = true;
        button.disabled = true;
        try {
          if (status) status.textContent = t("orderSubmitBusy");
          trackCheckoutEvent("place_order", { eventId: requestId, quantity: completedEntries.reduce((sum, item) => sum + item.qty, 0), price: cartTotal(), currency: "EGP", paymentMethod: method });
          const orderResult = await createWebsiteOrder(method, requestId);
          if (customer.deliveryMethod === "bosta") {
            try {
              if (status) status.textContent = t("bostaBusy");
              const result = await createBostaDelivery(method);
              extraLine = bostaReferenceLine(result) || bostaReferenceLine(result.delivery);
              if (status) status.textContent = extraLine ? `${t("bostaReady")} - ${extraLine}` : t("bostaReady");
            } catch (error) {
              if (status) status.textContent = error.message || t("bostaFailed");
              extraLine = t("bostaFailed");
            }
          }
          const whatsappUrl = whatsappOrderUrl(method, extraLine);
          await clearCheckoutCartAfterSuccessfulOrder();
          clearCheckoutRequestId(requestId);
          completedEntries.forEach((item) => trackCheckoutEvent("order_success", { ...checkoutAnalyticsItem(item), eventId: requestId }));
          if (status) status.textContent = t("orderSubmitReady");
          window.open(whatsappUrl, "_blank", "noopener");
          const publicOrderId = completedOrderId(orderResult);
          const trackingToken = /^[a-f0-9]{64}$/.test(orderResult.publicOrderToken || "") ? orderResult.publicOrderToken : "";
          window.location.href = `/order-success?orderId=${encodeURIComponent(publicOrderId)}${trackingToken ? `#${trackingToken}` : ""}`;
        } catch (error) {
          const errorMessage = error?.message || t("orderSubmitFailed");
          trackCheckoutEvent("order_failed", { eventId: requestId, errorType: "checkout", errorMessage, paymentMethod: method });
          trackCheckoutEvent("checkout_error", { errorType: "checkout", errorMessage });
          if (status) {
            const responseStatus = Number.isInteger(error?.status) ? `HTTP ${error.status}` : "Network error";
            const fields = Array.isArray(error?.fields) && error.fields.length ? ` — الحقول: ${error.fields.join(", ")}` : "";
            status.textContent = `${responseStatus}: ${errorMessage}${fields}`;
          }
          isSubmittingOrder = false;
          button.disabled = false;
          button.textContent = originalText;
        }
      };
      sendOrder();
    });
  });
  document.querySelectorAll("[data-copy-payment-method], [data-copy-instapay]").forEach((copyButton) => {
    copyButton.addEventListener("click", async () => {
      const method = copyButton.dataset.copyPaymentMethod || "instapay";
      await navigator.clipboard?.writeText(paymentCopyText(method));
      const status = document.querySelector("[data-payment-status]");
      if (status) status.textContent = t("copied");
    });
  });
}

function applyCheckoutCartSync(changed) {
  if (!changed) return;
  cart = loadCart();
  setCartCount();
  renderCartPage();
  renderOrderSummary();
}

function scheduleCheckoutCartSync() {
  const run = () => restoreSignedInCheckoutCart()
    .then(applyCheckoutCartSync)
    .catch((error) => console.warn("Could not sync checkout cart.", error));
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 3000);
  }
}

// Wait for Firebase's answer (retrying a slow or failed download), then merge.
async function waitForCheckoutVerdict(maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await restoreSignedInCheckoutCart().catch(() => false);
    if (checkoutAuthSettled) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  return false;
}

async function initCheckoutFlow() {
  // With a possible session, no cart is shown until Firebase confirms who is signed
  // in: a waiting message instead of an account cart taken from local data.
  const sessionHint = hasLocalSessionHint();
  checkoutSessionPending = sessionHint;
  cart = loadCart();
  setCartCount();
  let syncedBeforeRender = false;
  if (checkoutSessionPending) {
    if (isCartPage()) renderCartPage();
    const settled = await waitForCheckoutVerdict(20000);
    syncedBeforeRender = settled;
    checkoutSessionPending = false;
    cart = loadCart();
    setCartCount();
    if (!settled) {
      // No answer (usually a failed download, which only a reload retries): never
      // show "empty cart" to a customer whose account cart could not be loaded.
      checkoutVerifyFailed = true;
      void waitForCheckoutVerdict(120000).then((ok) => {
        if (!ok) return;
        checkoutVerifyFailed = false;
        applyCheckoutCartSync(true);
      });
    }
  }
  try {
    const response = await fetch(`/products.json?v=${Date.now()}`, { cache: "no-store" });
    products = await response.json();
  } catch {
    products = [];
  }
  if (!cartEntries().length && !isCartPage()) {
    const syncCartPromise = restoreSignedInCheckoutCart();
    await Promise.race([syncCartPromise, new Promise((resolve) => window.setTimeout(resolve, 2500))]);
    syncedBeforeRender = true;
    cart = loadCart();
    setCartCount();
  }
  if (!cartEntries().length && !isCartPage()) {
    window.location.href = "/cart";
    return;
  }
  renderCartPage();
  if (isCartPage()) trackCheckoutEvent("view_cart", { quantity: cartEntries().reduce((sum, item) => sum + item.qty, 0), price: cartTotal(), currency: "EGP" });
  renderOrderSummary();
  fillCheckoutForm();
  bindCartPage();
  bindCheckoutPage();
  bindPaymentPage();
  if (!syncedBeforeRender) scheduleCheckoutCartSync();
}

function refreshCheckoutCartFromStorage() {
  const before = cartFingerprint(cart);
  cart = loadCart();
  setCartCount();
  if (cartFingerprint(cart) === before) return;
  renderCartPage();
  renderOrderSummary();
}

// Back/forward cache restores the page without re-reading the saved cart.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) refreshCheckoutCartFromStorage();
});

window.addEventListener("storage", (event) => {
  const userKey = currentUserCartStorageKey();
  const relevantKeys = [guestCartStorageKey, userKey, activeCartStorageKey, cartSyncStorageKey];
  if (!relevantKeys.includes(event.key)) return;
  const before = cartFingerprint(cart);
  cart = loadCart();
  if (cartFingerprint(cart) === before) return;
  setCartCount();
  renderCartPage();
  renderOrderSummary();
});

initCheckoutFlow();
