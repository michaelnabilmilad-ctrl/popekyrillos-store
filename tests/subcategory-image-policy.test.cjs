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
test("broken URL cannot create a card img before a successful preload",()=>{
  const source=fs.readFileSync("script.js","utf8");
  assert.match(source,/probe\.onload\s*=\s*\(\)\s*=>/);
  assert.match(source,/document\.createElement\("img"\)/);
  assert.doesNotMatch(source,/subcategory-card-image[^\n]+<img/);
});
