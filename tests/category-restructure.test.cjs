const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const migration = require('../category-migration.js');

function taxonomy(stored) {
  const storage = new Map([
    ['pope-kyrillos-taxonomy', JSON.stringify(stored || null)],
    ['pope-kyrillos-taxonomy-version', '2026081701'],
    ['pope-kyrillos-cart', 'untouched']
  ]);
  const context = { window: {}, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) } };
  vm.createContext(context);
  for (const file of ['category-migration.js', 'category-taxonomy.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return { ...context.window.POPE_KYRILLOS_TAXONOMY, storage };
}

test('new hierarchy and product assignments are valid in every catalog copy', () => {
  const t = taxonomy();
  assert.equal(t.categoryById.has('censers-incense'), false);
  assert.equal(t.categoryById.get('candles-lamps').name, 'الشمع والبخور');
  for (const [id, name] of [['censers', 'الشوريات'], ['lamps', 'القناديل']]) {
    assert.equal(t.subcategoryById.get(id).mainId, 'altar-vessels');
    assert.equal(t.subcategoryById.get(id).name, name);
  }
  const ids = t.categories.flatMap(c => [c.id, ...c.subcategories.map(s => s.id)]);
  assert.equal(ids.length, new Set(ids).size);
  for (const file of ['products.json', 'firebase-functions/products.json', 'dist/products.json']) {
    const products = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(products.length, new Set(products.map(p => p.id)).size);
    for (const p of products) {
      assert.equal(t.subcategoryById.get(p.subcategory)?.mainId, p.mainCategory, p.id);
      assert.deepEqual(migration.product(p), p, `${p.id}: migration must be idempotent`);
    }
    assert.equal(products.find(p => p.id === 'incense-chat-1500-kg').mainCategory, 'candles-lamps');
    assert.equal(products.find(p => p.id === 'old-9762760196403').subcategory, 'censers');
  }
});

test('old IDs and Arabic category links resolve to their new destinations', () => {
  for (const [main, sub, expectedMain, expectedSub] of [
    ['censers-incense', '', 'altar-vessels', 'censers'],
    ['censers-incense', 'church-incense', 'candles-lamps', 'church-incense'],
    ['censers-incense', 'brass-censers', 'altar-vessels', 'censers'],
    ['candles-lamps', 'hanging-lamps', 'altar-vessels', 'lamps'],
    ['candles-lamps', 'church-candles', 'candles-lamps', 'church-candles'],
    ['الشمع والبخور', 'candles', 'candles-lamps', 'church-candles'],
    ['الشمع والبخور', 'incense-sets', 'candles-lamps', 'church-incense'],
    ['الشمع والبخور', 'incense', 'candles-lamps', 'church-incense'],
    ['الشمع والقناديل', 'قناديل حائط', 'altar-vessels', 'lamps'],
    ['الشوريات والبخور', 'بخور يوناني', 'candles-lamps', 'greek-incense']
  ]) assert.deepEqual(migration.route(main, sub), { category: expectedMain, label: expectedSub });
});

test('old product records migrate only taxonomy fields including misclassified censers and lamps', () => {
  for (const [name, sub, expected] of [
    ['شورية نحاس', 'church-incense', 'censers'],
    ['بخور كنسي', 'church-incense', 'church-incense'],
    ['قنديل', 'hanging-lamps', 'lamps'],
    ['شمعة', 'church-candles', 'church-candles']
  ]) {
    const p = { id: 'test', name, mainCategory: sub.includes('incense') ? 'censers-incense' : 'candles-lamps', subcategory: sub, subCategory: sub, price: 123, stock: 'متاح', image: '/image.webp', variants: [{ price: 123, quantity: 4 }] };
    const next = migration.product(p);
    assert.equal(next.subcategory, expected);
    for (const key of Object.keys(p).filter(k => !['mainCategory','subcategory','subCategory'].includes(k))) assert.deepEqual(next[key], p[key]);
    assert.deepEqual(migration.product(next), next);
  }
});

test('cached taxonomy and admin drafts migrate without losing unrelated custom categories or cart storage', () => {
  const stored = JSON.parse(JSON.stringify(taxonomy().defaultCategories));
  const altar = stored.find(c => c.id === 'altar-vessels');
  altar.subcategories = altar.subcategories.filter(s => !['censers','lamps'].includes(s.id));
  const candles = stored.find(c => c.id === 'candles-lamps');
  candles.name = 'الشمع والقناديل';
  candles.subcategories.push({ id: 'hanging-lamps', name: 'قناديل معلقة' });
  stored.push({ id: 'censers-incense', name: 'الشوريات والبخور', subcategories: [{ id: 'brass-censers', name: 'شوريات نحاس' }, { id: 'church-incense', name: 'بخور كنسي' }] });
  stored.find(c => c.id === 'crosses').name = 'اسم محفوظ';
  stored.push({ id: 'custom-main', name: 'قسم محفوظ', subcategories: [] });
  const t = taxonomy(stored);
  assert.equal(t.categoryById.has('censers-incense'), false);
  assert.equal(t.categoryById.get('crosses').name, 'اسم محفوظ');
  assert.equal(t.categoryById.has('custom-main'), true);
  assert.equal(t.storage.get('pope-kyrillos-cart'), 'untouched');
  assert.deepEqual(migration.categories(migration.categories(stored)), migration.categories(stored));
});

test('storefront route parser migrates both path and query links', () => {
  const source = fs.readFileSync('script.js', 'utf8');
  // Locate just the category parser; other URL helpers are deliberately excluded.
  const end = source.indexOf('function categoryShareUrl');
  const start = source.indexOf('function catalogFilterFromUrl()');
  const parser = source.slice(start, end);
  const functionName = parser.match(/function (\w+)/)[1];
  const t = taxonomy();
  for (const url of ['https://example.com/category/candles-lamps/hanging-lamps', 'https://example.com/?category=candles-lamps&subcategory=hanging-lamps']) {
    const context = { URL, window: { location: { href: url }, POPE_KYRILLOS_CATEGORY_MIGRATION: migration }, taxonomy: t, normalizeCategoryFilter: value => value };
    vm.createContext(context);
    vm.runInContext(parser, context);
    assert.equal(context[functionName]().category, 'altar-vessels');
    assert.equal(context[functionName]().label, 'lamps');
  }
});
