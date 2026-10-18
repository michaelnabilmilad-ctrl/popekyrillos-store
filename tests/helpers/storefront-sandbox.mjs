// Loads selected top-level functions from the storefront's script.js into an
// isolated sandbox with a fake localStorage and a fake Firestore cart store, so cart
// behaviour can be tested exactly as shipped without a browser or the network.
import fs from "node:fs";
import vm from "node:vm";

const scriptSource = fs.readFileSync(new URL("../../script.js", import.meta.url), "utf8");

export function extractFunction(source, name) {
  const match = new RegExp(`^[ \\t]*(async )?function ${name}\\(`, "m").exec(source);
  if (!match) throw new Error(`function ${name} not found`);
  // Skip the parameter list, which may itself contain destructuring braces.
  let index = source.indexOf("(", match.index);
  for (let parens = 0; index < source.length; index += 1) {
    if (source[index] === "(") parens += 1;
    if (source[index] === ")" && --parens === 0) break;
  }
  let depth = 0;
  for (index = source.indexOf("{", index); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(`Unbalanced function ${name}`);
}

const CART_FUNCTIONS = [
  "cartKey", "parseCartKey", "cartPayloadFromMap", "cartMapFromPayload", "readCartRecord", "mergeCartMaps",
  "cartHasItems", "cartFingerprint", "timestampMillis", "clampCartMap", "nextCartTimestamp", "saveCartToLocal",
  "setActiveCartStorageKey", "currentUserCartStorageKey", "currentCartStorageKey", "isAllowedCartStorageKey",
  "effectiveAuthUser", "localCartCandidateKeys", "preferredLocalCartRecord", "loadGuestCart",
  "applySignedInCart", "getProduct", "isVariantAvailable", "variantQuantity", "isProductUnavailable",
  "signOutCustomer", "saveCartNow", "clearCachedAuthUser"
];

export class FakeStorage {
  constructor(entries = []) { this.map = new Map(entries); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clone() { return new FakeStorage(this.map); }
}

// A shared "server": one document per signed-in user, like Firestore customerCarts/{uid}.
export function fakeFirestore() {
  const docs = new Map();
  // Server time follows the real clock (like Firestore's serverTimestamp) and only
  // moves forward; tick() simulates time passing before the next server write.
  let clock = Date.now();
  let skew = 0;
  return {
    docs,
    tick(ms = 1000) { skew += ms; return Date.now() + skew; },
    read(uid) { return docs.get(uid) || null; },
    write(uid, items) {
      clock = Math.max(clock + 1, Date.now() + skew);
      docs.set(uid, { items: JSON.parse(JSON.stringify(items)), updatedAt: clock });
    }
  };
}

// One sandbox = one browser tab of the storefront. Pass the same storage to simulate
// a reload or reopening the browser, and the same firestore to simulate another device.
export function storefrontTab({ storage = new FakeStorage(), firestore = fakeFirestore(), catalog = [], user = null } = {}) {
  const context = {
    console, Date, Math, JSON, Map, Set, Number, String, Array, Object, Promise, Error,
    localStorage: storage,
    products: catalog,
    productDetailsCache: new Map(),
    bestSellerProducts: [],
    cartItemMetadata: new Map(),
    cartWriteClock: 0,
    cartSeparator: "::",
    guestCartStorageKey: "pope-kyrillos-cart:guest",
    userCartStoragePrefix: "pope-kyrillos-cart:user:",
    activeCartStorageKey: "pope-kyrillos-cart:active",
    cartSyncStorageKey: "pope-kyrillos-cart:sync",
    state: { cart: new Map(), auth: { user, ready: true, cachedUser: null, services: null } },
    updateCartCount() {},
    renderCart() {},
    renderAuthState() {},
    closeAccountModal() {},
    showToast() {},
    t: (key) => key,
    warnCartAccountSaveFailed() {},
    queueRemoteCartSave() { return context.saveRemoteCart(); },
    cachedAuthStorageKey: "pope-kyrillos-auth:user",
    findVariant(product, variantId) {
      const variants = Array.isArray(product?.variants) && product.variants.length ? product.variants : [{ id: "default", available: true }];
      return variants.find((variant) => variant.id === variantId) || variants[0];
    },
    async loadRemoteCartRecord(signedInUser) {
      if (firestore.offline) return { ok: false, cart: new Map(), updatedAt: 0 };
      const doc = firestore.read(signedInUser.uid);
      return { ok: true, cart: context.cartMapFromPayload(doc?.items || []), updatedAt: doc?.updatedAt || 0 };
    },
    async saveRemoteCart() {
      const signedInUser = context.state.auth.user;
      if (!signedInUser || firestore.offline) return false;
      firestore.write(signedInUser.uid, context.cartPayloadFromMap());
      return true;
    }
  };
  vm.createContext(context);
  vm.runInContext(CART_FUNCTIONS.map((name) => extractFunction(scriptSource, name)).join("\n\n"), context);

  const tab = {
    context,
    storage,
    firestore,
    get cart() { return Object.fromEntries(context.state.cart); },
    load() { context.loadGuestCart(); return tab; },
    add(productId, qty = 1, variantId = "default") {
      const key = context.cartKey(productId, variantId);
      context.state.cart.set(key, (context.state.cart.get(key) || 0) + qty);
      context.state.cart = context.clampCartMap(context.state.cart);
      context.saveCartToLocal(context.currentCartStorageKey(), context.state.cart);
      return tab;
    },
    // What loadProducts() does after a catalog page arrives (script.js loadProducts).
    showCatalogPage(pageProducts) {
      context.products = pageProducts;
      const before = context.cartFingerprint(context.state.cart);
      context.state.cart = context.clampCartMap(context.state.cart);
      if (context.cartFingerprint(context.state.cart) !== before) context.saveCartToLocal(context.currentCartStorageKey(), context.state.cart);
      return tab;
    },
    async signIn(signedInUser) {
      context.state.auth.user = signedInUser;
      await context.applySignedInCart(signedInUser);
      return tab;
    },
    // Runs the shipped signOutCustomer() (Firebase signOut is not configured here).
    async signOut() {
      await context.signOutCustomer();
      return tab;
    },
    remove(productId, variantId = "default") {
      context.state.cart.delete(context.cartKey(productId, variantId));
      context.saveCartToLocal(context.currentCartStorageKey(), context.state.cart);
      return tab;
    }
  };
  return tab;
}

const productPageSource = fs.readFileSync(new URL("../../product-page.js", import.meta.url), "utf8");

// What product-page.js does when "add to cart" is pressed, using its own
// readCart/activeCartKey/saveCartItems functions against the given storage.
export function productPageAdd(storage, item) {
  const context = { JSON, Date, Math, Number, Array, localStorage: storage, guestCartKey: "pope-kyrillos-cart:guest" };
  vm.createContext(context);
  vm.runInContext(["activeCartKey", "readCart", "saveCartItems"].map((name) => extractFunction(productPageSource, name)).join("\n\n"), context);
  const items = context.readCart();
  const existing = items.find((line) => line.productId === item.productId && line.variantId === item.variantId);
  if (existing) existing.qty += item.qty; else items.push(item);
  context.saveCartItems(items);
  return context.activeCartKey();
}

export { scriptSource };
