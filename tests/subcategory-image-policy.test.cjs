const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm");
const context={}; vm.createContext(context); vm.runInContext(fs.readFileSync("subcategory-image-policy.js","utf8"),context);
const {chooseImage}=context.POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY;
const product=(id,main,sub,image,extra={})=>({id,mainCategory:main,subcategory:sub,images:image?[image]:[],...extra});
const choose=(subcategory,products)=>chooseImage({categoryId:"occasions-service",subcategory,products,getMainId:p=>p.mainCategory,getSubId:p=>p.subcategory,getImages:p=>p.images,isActive:p=>p.published!==false&&p.deleted!==true});

test("manual category image has first priority",()=>{
  const choice=choose({id:"tote-bags",manualImage:"assets/manual.webp"},[product("bag","occasions-service","tote-bags","assets/bag.webp")]);
  assert.equal(choice.image,"assets/manual.webp"); assert.equal(choice.source,"manual");
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
