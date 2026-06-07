# طريقة إضافة المنتجات والأسعار

ملف المنتجات هو:

`products.json`

كل منتج له شكل قريب من المثال ده:

```json
{
  "id": "unique-product-id",
  "name": "اسم المنتج",
  "category": "brass",
  "label": "نحاسيات",
  "description": "وصف المنتج",
  "price": 1250,
  "priceNote": "",
  "stock": "متاح",
  "badge": "جديد",
  "image": "assets/products/gallery/product-01.jpg",
  "images": [
    "assets/products/gallery/product-01.jpg",
    "assets/products/gallery/product-02.jpg"
  ],
  "tags": ["كلمة", "كلمة"]
}
```

## السعر

- لو السعر معروف: اكتب رقم فقط بدون `ج.م`
- مثال: `"price": 1250`
- لو السعر له مقاسات أو اختيارات: اكتب أقل سعر في `price` واكتب المدى في `priceNote`
- مثال: `"priceNote": "يبدأ من ٦٠ ج.م حتى ١٣٠ ج.م"`
- لو السعر لسه مش معروف: اكتب `null`

## الصور

ضع صور المنتج داخل:

`assets/products/gallery/`

حقل `image` هو الصورة الرئيسية، وحقل `images` هو كل صور المنتج التي تظهر كصور مصغرة تحت الصورة الرئيسية.

لو المنتج له صورة واحدة فقط، اكتب نفس الصورة في الحقلين.

## الأقسام الحالية

- `brass` = نحاسيات
- `books` = كتب وطقوس
- `candles` = شموع وبخور
- `vestments` = أقمشة ومفارش
- `icons` = أيقونات وهدايا

بعد تعديل `products.json`، اعمل Refresh للصفحة.
