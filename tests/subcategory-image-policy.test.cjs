const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm");
const context={}; vm.createContext(context); vm.runInContext(fs.readFileSync("subcategory-image-policy.js","utf8"),context);
const {chooseImage,configuredImage}=context.POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY;
const product=(id,main,sub,image,extra={})=>({id,mainCategory:main,subcategory:sub,images:image?[image]:[],...extra});
const choose=(subcategory,products)=>chooseImage({categoryId:"occasions-service",subcategory,products,getMainId:p=>p.mainCategory,getSubId:p=>p.subcategory,getImages:p=>p.images,isActive:p=>p.published!==false&&p.deleted!==true});

test("manual category image has first priority",()=>{
  const choice=choose({id:"tote-bags",manualImage:"assets/manual.webp"},[product("bag","occasions-service","tote-bags","assets/bag.webp")]);
  assert.equal(choice.image,"assets/manual.webp"); assert.equal(choice.source,"configured");
});
test("tasbeha custom taxonomy image wins over its representative product",()=>{
  const saved="assets/optimized/products/gallery/taxonomy-tasbeha-books-image-20260922083741-512087.webp";
  const choice=chooseImage({categoryId:"books-rituals",subcategory:{id:"tasbeha-books",customImage:saved,representativeProductId:"tasbeha-product"},products:[product("tasbeha-product","books-rituals","tasbeha-books","assets/representative.webp")],getMainId:p=>p.mainCategory,getSubId:p=>p.subcategory,getImages:p=>p.images,isActive:()=>true});
  assert.equal(choice.image,saved); assert.equal(choice.source,"configured");
});
test("legacy manual image remains readable and public paths become production URLs",()=>{
  assert.equal(configuredImage({manualImage:"assets/legacy.webp"}),"assets/legacy.webp");
  assert.equal(configuredImage({customImage:"public/assets/custom.webp"}),"/assets/custom.webp");
  assert.equal(configuredImage({customImage:"/public/assets/custom.webp"}),"/assets/custom.webp");
});
test("legacy subcategoryImage is not a custom image and cannot override an exact product",()=>{
  const choice=choose({id:"tote-bags",subcategoryImage:"assets/wrong-sibling.webp"},[product("bag","occasions-service","tote-bags","assets/bag.webp")]);
  assert.equal(configuredImage({subcategoryImage:"assets/wrong-sibling.webp"}),"");
  assert.equal(choice.image,"assets/bag.webp");
  assert.equal(choice.productId,"bag");
});
test("a sibling product can never represent book-accessories",()=>{
  const products=[
    product("katameros-book","books-rituals","katameros","assets/katameros.webp"),
    product("book-cover","books-rituals","book-accessories","assets/book-cover.webp")
  ];
  const exact=chooseImage({categoryId:"books-rituals",subcategory:{id:"book-accessories",subcategoryImage:"assets/legacy-katameros.webp"},products,getMainId:p=>p.mainCategory,getSubId:p=>p.subcategory,getImages:p=>p.images,isActive:()=>true});
  assert.deepEqual({image:exact.image,productId:exact.productId},{image:"assets/book-cover.webp",productId:"book-cover"});
  const missing=chooseImage({categoryId:"books-rituals",subcategory:{id:"book-accessories"},products:[products[0]],getMainId:p=>p.mainCategory,getSubId:p=>p.subcategory,getImages:p=>p.images,isActive:()=>true});
  assert.equal(missing.image,"");
});
test("manually selected representative must belong to the exact main and subcategory IDs",()=>assert.equal(choose({id:"tote-bags",representativeProductId:"bag-2"},[product("bag-1","occasions-service","tote-bags","assets/one.webp"),product("bag-2","occasions-service","tote-bags","assets/two.webp")]).image,"assets/two.webp"));
test("empty category stays blank",()=>assert.equal(choose({id:"empty"},[]).image,""));
test("category whose products have no images stays blank",()=>assert.equal(choose({id:"tote-bags"},[product("bag","occasions-service","tote-bags","")]).image,""));
test("product with correct main category but wrong subcategory is rejected",()=>assert.equal(choose({id:"tote-bags"},[product("colors","occasions-service","crafts-coloring","assets/colors.webp")]).image,""));
test("all-subcategories pseudo-card has no image",()=>assert.equal(choose({id:""},[product("bag","occasions-service","tote-bags","assets/bag.webp")]).image,""));
test("tote bag card never uses colors and loses product image after product is moved",()=>{
  const sub={id:"tote-bags",name:"توتي باج وشنط"};
  const colors=product("colors","occasions-service","crafts-coloring","assets/colors.webp");
  const bag=product("bag","occasions-service","tote-bags","assets/bag.webp");
  assert.equal(choose(sub,[colors]).image,"");
  assert.equal(choose(sub,[colors,bag]).image,"assets/bag.webp");
  bag.subcategory="meeting-gifts";
  assert.equal(choose(sub,[colors,bag]).image,"");
});
test("hidden or deleted product image is never selected",()=>assert.equal(choose({id:"tote-bags"},[product("bag","occasions-service","tote-bags","assets/bag.webp",{published:false})]).image,""));
test("every subcategory image is rendered immediately and independently of active state",()=>{
  const source=fs.readFileSync("script.js","utf8");
  const renderer=source.slice(source.indexOf("function renderSubcategoryCards()"),source.indexOf("function updateFilterButtons()"));
  assert.match(renderer,/card\.image \? `<img src=/);
  assert.match(renderer,/loading="lazy" decoding="async"/);
  assert.doesNotMatch(renderer,/data-subcategory-image-src|loadSubcategoryCardImages|new Image\(\)/);
  assert.doesNotMatch(renderer,/card\.active[^\n]+<img|activeLabel[^\n]+<img/);
  const css=fs.readFileSync("styles.css","utf8");
  assert.match(css,/\.subcategory-card-image img\s*\{[^}]*display:\s*block;[^}]*visibility:\s*visible;[^}]*opacity:\s*1;/s);
});
test("subcategory navigation keeps sibling cards sourced from unfiltered catalog counts",()=>{
  const source=fs.readFileSync("script.js","utf8");
  const labels=source.slice(source.indexOf("function orderedLabelsForCategory"),source.indexOf("function productsForCurrentCategory"));
  assert.match(labels,/subcategoryProductCount\(normalized, subcategory\.id\)/);
  assert.match(labels,/totalCount > 0/);
  assert.doesNotMatch(labels,/productMatchesSubcategory\(product, state\.labelFilter\)/);
  assert.match(source,/payload\.subcategoryCounts/);
  assert.match(source,/catalogSubcategoryCounts = catalogSubcategoryCountsLoaded \? payload\.subcategoryCounts : \{\}/);
});
test("catalog API computes subcategory counts before applying request filters",()=>{
  const worker=fs.readFileSync("cloudflare-worker.js","utf8");
  const endpoint=worker.slice(worker.indexOf("async function catalogApiResponse"),worker.indexOf("async function productApiResponse"));
  assert.ok(endpoint.indexOf("const subcategoryCounts = allProducts.filter(hasAvailableVariant)") < endpoint.indexOf("const matched ="));
  assert.match(endpoint,/categoryCounts, subcategoryCounts/);
});
test("crosses navigation keeps wooden crosses and Iota medals visible through every selection",()=>{
  const counts=new Map([["wooden-crosses",12],["yota-medallions",9],["pectoral-crosses",4]]);
  const visibleSiblingIds=()=>[...counts].filter(([,count])=>count>0).map(([id])=>id).sort();
  const initial=visibleSiblingIds();
  assert.ok(initial.includes("wooden-crosses"));
  assert.ok(initial.includes("yota-medallions"));
  for(const selected of ["yota-medallions","wooden-crosses","yota-medallions"]){
    assert.ok(initial.includes(selected));
    assert.deepEqual(visibleSiblingIds(),initial);
  }
});
