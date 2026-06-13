const whatsappNumber = "201016125589";
const paymobPaymentLink = "https://accept.paymob.com/payme/popekyrillosstore";
const firebaseSdkVersion = "10.14.1";
const guestCartStorageKey = "pope-kyrillos-cart:guest";
const userCartStoragePrefix = "pope-kyrillos-cart:user:";
const languageStorageKey = "pope-kyrillos-language";
const paymentMethods = {
  instapay: {
    label: "إنستاباي / تحويل بنكي",
    note: "حوّل على رقم 01223515989 باسم مايكل نبيل ميلاد، وبعد التحويل ابعت صورة الإيصال على الواتساب.",
    message: "طريقة الدفع: إنستاباي / تحويل بنكي على رقم 01223515989 باسم مايكل نبيل ميلاد. بعد التحويل سأرسل صورة الإيصال.",
    copyText: "إنستاباي / تحويل بنكي\nرقم التحويل: 01223515989\nاسم الحساب: مايكل نبيل ميلاد"
  },
  paymob: {
    label: "Paymob",
    note: "ادفع أونلاين مباشرة ببطاقتك عن طريق Paymob.",
    message: "طريقة الدفع: Paymob Checkout.",
    copyText: "Paymob Checkout\nلينك الدفع الاحتياطي: https://accept.paymob.com/payme/popekyrillosstore"
  }
};

const fallbackProducts = [
  {
    id: "sample-agbeya",
    name: "أجبية فاخرة",
    category: "books",
    label: "كتب وطقوس",
    description: "طباعة واضحة وغلاف متين مناسب للاستخدام اليومي والهدايا.",
    price: 220,
    stock: "متاح",
    badge: "مثال",
    art: "books",
    bg: "#efe6d6",
    bg2: "#d6e5dc",
    fg: "#0c6b68",
    tags: ["غلاف فاخر", "هدية"]
  }
];

let products = [];
let authInitPromise = null;

const state = {
  filter: "all",
  search: "",
  language: localStorage.getItem(languageStorageKey) === "en" ? "en" : "ar",
  cart: new Map(),
  paymentMethod: "instapay",
  deliveryMethod: "bosta",
  shippingConfirmed: false,
  shipping: null,
  bosta: {
    busy: false,
    shipment: null
  },
  checkoutBusy: false,
  auth: {
    configured: false,
    ready: false,
    loading: false,
    user: null,
    services: null,
    saveTimer: null
  },
  modal: {
    productId: "",
    selectedOptions: {},
    image: "",
    quantity: 1
  }
};

let formatter = new Intl.NumberFormat("ar-EG");
const productGrid = document.querySelector("[data-products]");
const filterButtons = document.querySelectorAll("[data-filter]");
const searchInput = document.querySelector("#product-search");
const header = document.querySelector(".site-header");
const languageToggle = document.querySelector("[data-language-toggle]");
const languageLabel = document.querySelector("[data-language-label]");
const accountToggle = document.querySelector("[data-account-toggle]");
const accountLabel = document.querySelector("[data-account-label]");
const accountModal = document.querySelector("[data-account-modal]");
const accountClose = document.querySelector("[data-account-close]");
const accountStatus = document.querySelector("[data-account-status]");
const accountUser = document.querySelector("[data-account-user]");
const authProviderList = document.querySelector("[data-auth-provider-list]");
const authProviderButtons = document.querySelectorAll("[data-auth-provider]");
const authSignoutButton = document.querySelector("[data-auth-signout]");
const emailAuthForm = document.querySelector("[data-email-auth-form]");
const authEmailInput = document.querySelector("[data-auth-email]");
const authPasswordInput = document.querySelector("[data-auth-password]");
const emailSignupButton = document.querySelector("[data-email-signup]");
const cartPanel = document.querySelector("[data-cart-panel]");
const cartItems = document.querySelector("[data-cart-items]");
const cartCount = document.querySelector("[data-cart-count]");
const cartTotal = document.querySelector("[data-cart-total]");
const whatsappLink = document.querySelector("[data-whatsapp-link]");
const checkoutLabel = document.querySelector("[data-checkout-label]");
const paymentInputs = document.querySelectorAll("[data-payment-method]");
const paymentSummary = document.querySelector("[data-payment-summary]");
const paymentNote = document.querySelector("[data-payment-note]");
const copyPaymentButton = document.querySelector("[data-copy-payment]");
const deliveryInputs = document.querySelectorAll("[data-delivery-method]");
const checkoutFields = document.querySelector("[data-checkout-fields]");
const shippingFields = document.querySelector("[data-shipping-fields]");
const shippingSummary = document.querySelector("[data-shipping-summary]");
const shippingStatus = document.querySelector("[data-shipping-status]");
const confirmShippingButton = document.querySelector("[data-confirm-shipping]");
const checkoutNameInput = document.querySelector("[data-checkout-name]");
const checkoutPhoneInput = document.querySelector("[data-checkout-phone]");
const checkoutEmailInput = document.querySelector("[data-checkout-email]");
const checkoutGovernorateInput = document.querySelector("[data-checkout-governorate]");
const checkoutCityInput = document.querySelector("[data-checkout-city]");
const checkoutAddressInput = document.querySelector("[data-checkout-address]");
const checkoutNotesInput = document.querySelector("[data-checkout-notes]");
const cartTotalBox = document.querySelector("[data-cart-total-box]");
const cartTotalLabel = document.querySelector("[data-cart-total-label]");
const cartTotalNote = document.querySelector("[data-cart-total-note]");
const toast = document.querySelector("[data-toast]");
const productModal = document.querySelector("[data-product-modal]");
const productModalBody = document.querySelector("[data-product-modal-body]");
const productModalClose = document.querySelector("[data-product-modal-close]");
const imageLightbox = document.querySelector("[data-image-lightbox]");
const imageLightboxImage = document.querySelector("[data-image-lightbox-image]");
const imageLightboxClose = document.querySelector("[data-image-lightbox-close]");
const scrim = document.querySelector("[data-scrim]");
const cartSeparator = "::";

const translations = {
  ar: {
    htmlLang: "ar",
    dir: "rtl",
    languageButton: "EN",
    documentTitle: "مكتبة البابا كيرلس | مستلزمات الكنائس",
    metaDescription: "مكتبة البابا كيرلس: مكتبة مسيحية متخصصة في مستلزمات الكنائس، الكتب الطقسية، الشموع، البخور، الأيقونات، والأقمشة الكنسية.",
    brandName: "مكتبة البابا كيرلس",
    brandTagline: "مستلزمات الكنائس والخدمة",
    navCategories: "الأقسام",
    navProducts: "المنتجات",
    navServices: "خدمات الكنائس",
    navContact: "تواصل",
    login: "دخول",
    languageToggleAria: "Switch language to English",
    accountAria: "تسجيل الدخول",
    cartAria: "فتح السلة",
    heroEyebrow: "كتب كنسية، شموع، بخور، أيقونات، وأدوات خدمة",
    heroTitle: "مكتبة البابا كيرلس",
    heroLead: "أسسها الشماس الدياكون بولس ملاك عام 2001 م\nاطلب منتجاتك الكنسية أونلاين والدفع عند الاستلام متاح",
    shopNow: "تسوق الآن",
    metricProducts: "منتج للخدمة",
    metricTime: "تجهيز شائع",
    metricChurch: "كميات ومقاسات",
    trustPaymentTitle: "طرق دفع مرنة",
    trustPaymentText: "دفع عند الاستلام أو أونلاين",
    trustChosenTitle: "منتجات مختارة",
    trustChosenText: "كتب وأدوات بجودة ثابتة",
    trustGiftTitle: "تغليف محترم",
    trustGiftText: "جاهز للهدايا والخدمة",
    trustShippingTitle: "استلام أو شحن",
    trustShippingText: "حسب المدينة والكمية",
    categoriesEyebrow: "الأقسام",
    categoriesTitle: "اختار احتياج الخدمة بسرعة",
    catalogEyebrow: "الكتالوج",
    catalogTitle: "منتجات مختارة للطلب",
    searchPlaceholder: "ابحث عن منتج",
    servicesEyebrow: "خدمات الكنائس",
    servicesTitle: "نجهز طلبك بنفس ترتيب الخدمة",
    servicesText: "سواء طلب موسمي، مقاس خاص، أو كميات لمدارس الأحد، نرتب لك المنتجات في قائمة واضحة ونجهزها حسب الميعاد.",
    service1Title: "قوائم توريد",
    service1Text: "قائمة بالكميات والأسعار حسب احتياج الكنيسة أو الاجتماع.",
    service2Title: "تطريز وتخصيص",
    service2Text: "ألوان ومقاسات وأسماء كنائس على الأقمشة والمفارش.",
    service3Title: "هدايا خدمة",
    service3Text: "تجميعات كتب وأيقونات وتذكارات للمؤتمرات والفصول.",
    contactEyebrow: "تواصل",
    contactTitle: "اطلب عرض سعر أو منتج غير موجود",
    nameLabel: "الاسم",
    namePlaceholder: "اسمك",
    phoneLabel: "رقم الهاتف",
    requestTypeLabel: "نوع الطلب",
    requestProducts: "طلب منتجات",
    requestChurch: "توريد كنيسة",
    requestCustom: "تطريز أو مقاس خاص",
    requestGeneral: "استفسار عام",
    detailsLabel: "التفاصيل",
    detailsPlaceholder: "اكتب المنتجات أو الكمية أو ميعاد المناسبة",
    prepareMessage: "تجهيز رسالة الطلب",
    policiesEyebrow: "الشروط والأحكام",
    policiesTitle: "سياسات الدفع والخصوصية",
    policiesIntro: "هذه السياسات متاحة بالعربية والإنجليزية لتوضيح شروط الدفع، الخصوصية، التواصل، والشحن.",
    cartEyebrow: "طلبك",
    cartTitle: "سلة المنتجات",
    paymentMethod: "طريقة الدفع",
    instapayLabel: "إنستاباي / تحويل بنكي",
    instapaySmall: "01223515989 - مايكل نبيل ميلاد",
    paymobSmall: "دفع أونلاين مباشر",
    pickupCashLabel: "استلام من الفرع",
    pickupCashSmall: "دفع كاش بعد تجهيز الأوردر",
    deliveryStep: "بيانات الاستلام والشحن",
    deliverySummaryPending: "اكتب البيانات قبل الإجمالي",
    deliverySummaryReady: "تم تأكيد بيانات الطلب",
    deliveryBostaLabel: "شحن مع بوسطا",
    deliveryBostaSmall: "للبيت أو الكنيسة حسب العنوان",
    deliveryPickupLabel: "استلام من الفرع",
    deliveryPickupSmall: "بدون شحن",
    checkoutGovernorate: "المحافظة",
    checkoutGovernoratePlaceholder: "اختار المحافظة",
    checkoutCity: "المدينة / المنطقة",
    checkoutCityPlaceholder: "مثال: شبرا، مدينة نصر...",
    checkoutAddress: "العنوان بالتفصيل",
    checkoutAddressPlaceholder: "اسم الشارع، رقم العمارة، الدور، الشقة، علامة مميزة",
    checkoutNotes: "ملاحظات للطلب",
    checkoutNotesPlaceholder: "اختياري: ميعاد مناسب، اسم كنيسة، ملاحظة للتغليف",
    confirmShipping: "تأكيد بيانات الطلب",
    editShipping: "تأكيد التعديل",
    shippingPendingStatus: "إجمالي المنتجات ظاهر، وبيانات الاستلام مطلوبة قبل إرسال الطلب.",
    shippingReadyStatus: "بيانات الاستلام محفوظة، وتكلفة شحن بوسطا يتم تأكيدها حسب العنوان.",
    pickupReadyStatus: "تم اختيار الاستلام من الفرع، بدون تكلفة شحن.",
    totalLockedLabel: "إجمالي المنتجات",
    totalReadyLabel: "إجمالي المنتجات",
    shippingPendingNote: "الشحن مع بوسطا يتم تأكيده حسب العنوان.",
    pickupNoShippingNote: "استلام من الفرع بدون شحن.",
    checkoutDetailsFirst: "أكد بيانات الاستلام الأول",
    checkoutGovernorateRequired: "اختار المحافظة قبل تأكيد الطلب",
    checkoutCityRequired: "اكتب المدينة أو المنطقة قبل تأكيد الطلب",
    checkoutAddressRequired: "اكتب العنوان بالتفصيل قبل تأكيد الطلب",
    deliveryBostaMessage: "طريقة الاستلام: شحن مع بوسطا",
    deliveryPickupMessage: "طريقة الاستلام: استلام من الفرع",
    shippingAddressMessage: "بيانات الشحن:\nالاسم: {name}\nالموبايل: {phone}\nالمحافظة: {governorate}\nالمدينة/المنطقة: {city}\nالعنوان: {address}{email}{notes}",
    pickupAddressMessage: "بيانات الاستلام:\nالاسم: {name}\nالموبايل: {phone}{email}{notes}",
    bostaCreating: "جاري إنشاء شحنة بوسطا...",
    bostaCreated: "تم إنشاء طلب الشحن في بوسطا",
    bostaFallback: "تعذر إنشاء شحنة بوسطا الآن، سيتم إرسال الطلب على واتساب للمتابعة اليدوية.",
    bostaReferenceLine: "بيانات بوسطا: رقم الشحنة/المرجع {reference}",
    orderReferenceLine: "رقم الطلب: {reference}",
    orderSaveFallback: "تعذر حفظ الطلب على السيرفر الآن، سيتم فتح واتساب للمتابعة.",
    checkoutName: "الاسم",
    checkoutNamePlaceholder: "اسم العميل",
    checkoutPhone: "رقم الموبايل",
    checkoutEmail: "البريد الإلكتروني",
    checkoutEmailPlaceholder: "اختياري",
    copyPayment: "نسخ بيانات الدفع",
    totalApprox: "الإجمالي التقريبي",
    sendOrder: "إرسال الطلب",
    emptyProducts: "لا توجد منتجات مطابقة للبحث الحالي.",
    emptyCart: "السلة فارغة حاليا.",
    cartLoading: "جاري تحميل بيانات السلة...",
    detailsAndPrices: "التفاصيل والأسعار",
    choices: "اختيارات",
    choose: "اختار",
    add: "أضف",
    unavailable: "غير متاح",
    available: "متاح",
    askPrice: "اسأل عن السعر",
    currentPrice: "السعر الحالي",
    basicChoice: "الاختيار الأساسي",
    modalQuantityLabel: "العدد اللي هيتحط في السلة",
    addToCart: "أضف {count} للسلة",
    pieces: "{count} قطعة",
    modalQuantityAria: "اختيار عدد القطع",
    quantityAdjustAria: "تعديل كمية {name}",
    decreaseQuantity: "تقليل الكمية",
    increaseQuantity: "زيادة الكمية",
    galleryLabel: "صور {name}",
    showImageLabel: "عرض صورة {index} من {name}",
    zoomImageLabel: "تكبير صورة {name}",
    zoomHint: "اضغط للتكبير",
    shareProduct: "مشاركة المنتج",
    copyProductLink: "نسخ لينك المنتج",
    shareOnWhatsApp: "مشاركة واتساب",
    productShareMessage: "شوف المنتج ده من مكتبة البابا كيرلس: {name}\n{url}",
    productLinkCopied: "تم نسخ لينك المنتج",
    productLinkCopyFallback: "انسخ لينك المنتج من شريط العنوان",
    accountEyebrow: "حساب العميل",
    accountTitle: "أهلا بيك في مكتبة البابا كيرلس",
    accountStatus: "ادخل بحسابك عشان السلة تفضل محفوظة وتقدر تكمل طلبك بسهولة في أي وقت.",
    accountSaved: "سلتك محفوظة على حسابك، ولو فتحت الموقع مرة تانية بنفس الحساب هتلاقيها موجودة.",
    accountLocalOnly: "السلة محفوظة تلقائيا على هذا الجهاز. تسجيل الدخول بالإيميل أو جوجل يحتاج إعداد Firebase في الموقع.",
    accountLoading: "جاري تجهيز تسجيل الدخول...",
    accountUser: "مسجل الدخول: {name}",
    benefitCart: "حفظ السلة",
    benefitFast: "دخول سريع",
    benefitOrders: "متابعة الطلبات",
    googleLogin: "الدخول بجوجل",
    googleSmall: "الأسرع لحفظ السلة على حسابك",
    authEmailLabel: "البريد الإلكتروني",
    authPasswordLabel: "كلمة المرور",
    authPasswordPlaceholder: "6 أحرف على الأقل",
    emailSignin: "دخول",
    emailSignup: "إنشاء حساب",
    signOut: "تسجيل الخروج",
    paymentFallback: "سيتم فتح صفحة Paymob الرسمية لإتمام الدفع ببطاقة بنكية.",
    fallbackLink: "لينك دفع احتياطي",
    checkoutBusy: "جاري فتح Paymob...",
    paymobNow: "ادفع Paymob الآن",
    unpricedSuffix: " + منتجات بسعر عند التواصل",
    instapayNote: "حوّل على رقم 01223515989 باسم مايكل نبيل ميلاد، وبعد التحويل ابعت صورة الإيصال على الواتساب.",
    instapayMessage: "طريقة الدفع: إنستاباي / تحويل بنكي على رقم 01223515989 باسم مايكل نبيل ميلاد. بعد التحويل سأرسل صورة الإيصال.",
    instapayCopy: "إنستاباي / تحويل بنكي\nرقم التحويل: 01223515989\nاسم الحساب: مايكل نبيل ميلاد",
    paymobNote: "سيتم فتح صفحة Paymob الرسمية لإتمام الدفع ببطاقة بنكية.",
    paymobCopy: "Paymob Checkout\nلينك الدفع: https://accept.paymob.com/payme/popekyrillosstore",
    pickupCashNote: "سيتم تجهيز الأوردر أولا، وبعد التأكيد يمكنك الاستلام من الفرع والدفع كاش.",
    pickupCashMessage: "طريقة الاستلام والدفع: استلام من الفرع، والدفع كاش بعد تجهيز الأوردر والتأكيد.",
    pickupCashCopy: "استلام من الفرع\nالدفع: كاش بعد تجهيز الأوردر والتأكيد",
    copiedPayment: "تم نسخ بيانات الدفع",
    copyPaymentFallback: "انسخ بيانات الدفع من السلة",
    cartEmptyToast: "السلة فارغة حاليا",
    checkoutNameRequired: "اكتب اسم العميل قبل الدفع",
    checkoutPhoneRequired: "اكتب رقم موبايل صحيح قبل الدفع",
    checkoutEmailInvalid: "اكتب بريد إلكتروني صحيح أو سيبه فاضي",
    paymobCheckoutFailed: "تعذر فتح checkout، هفتح لينك Paymob الاحتياطي",
    firebaseRequired: "تسجيل الدخول يحتاج إعداد Firebase أولا",
    firebaseLoading: "جاري تجهيز تسجيل الدخول، حاول مرة أخرى بعد لحظة",
    signinFailed: "تعذر تسجيل الدخول، راجع إعدادات Firebase",
    signupFailed: "تعذر إنشاء الحساب، تأكد من تفعيل Email/Password في Firebase",
    emailAuthInvalid: "اكتب بريد إلكتروني صحيح وكلمة مرور 6 أحرف على الأقل",
    emailSigninSuccess: "تم تسجيل الدخول",
    emailSignupSuccess: "تم إنشاء الحساب وتسجيل الدخول",
    signoutToast: "تم تسجيل الخروج",
    unavailableChoiceToast: "الاختيار ده غير متاح حاليا",
    quantityLimitToast: "وصلت للكمية المتاحة من الاختيار ده",
    addedToast: "تمت إضافة {count} من {name}{option} إلى السلة",
    contactEmpty: "لا توجد تفاصيل إضافية",
    contactMessage: "مرحباً، أنا {name}\nرقمي: {phone}\nنوع الطلب: {requestType}\nالتفاصيل: {message}"
  },
  en: {
    htmlLang: "en",
    dir: "ltr",
    languageButton: "AR",
    documentTitle: "Pope Kyrillos Store | Church Supplies",
    metaDescription: "Pope Kyrillos Store: a Christian bookstore specializing in church supplies, liturgical books, candles, incense, icons, and church fabrics.",
    brandName: "Pope Kyrillos Store",
    brandTagline: "Church and ministry supplies",
    navCategories: "Categories",
    navProducts: "Products",
    navServices: "Church services",
    navContact: "Contact",
    login: "Login",
    languageToggleAria: "تغيير اللغة إلى العربية",
    accountAria: "Login",
    cartAria: "Open cart",
    heroEyebrow: "Church books, candles, incense, icons, and ministry tools",
    heroTitle: "Pope Kyrillos Store",
    heroLead: "Founded by Deacon Boulos Malak in 2001\nOrder your church supplies online with cash on delivery available",
    shopNow: "Shop now",
    metricProducts: "service items",
    metricTime: "common prep time",
    metricChurch: "church orders",
    trustPaymentTitle: "Flexible payment",
    trustPaymentText: "Cash on delivery or online",
    trustChosenTitle: "Curated products",
    trustChosenText: "Books and tools with steady quality",
    trustGiftTitle: "Careful packing",
    trustGiftText: "Ready for gifts and ministry",
    trustShippingTitle: "Pickup or delivery",
    trustShippingText: "Based on city and quantity",
    categoriesEyebrow: "Categories",
    categoriesTitle: "Find what your ministry needs",
    catalogEyebrow: "Catalog",
    catalogTitle: "Selected products to order",
    searchPlaceholder: "Search products",
    servicesEyebrow: "Church services",
    servicesTitle: "We prepare your order around your service needs",
    servicesText: "Seasonal orders, custom sizes, or Sunday School quantities can be arranged in a clear list and prepared on time.",
    service1Title: "Supply lists",
    service1Text: "Quantities and prices based on church or meeting needs.",
    service2Title: "Embroidery and custom work",
    service2Text: "Colors, sizes, and church names on fabrics and altar cloths.",
    service3Title: "Ministry gifts",
    service3Text: "Bundles of books, icons, and keepsakes for conferences and classes.",
    contactEyebrow: "Contact",
    contactTitle: "Request a quote or a product not listed",
    nameLabel: "Name",
    namePlaceholder: "Your name",
    phoneLabel: "Phone",
    requestTypeLabel: "Request type",
    requestProducts: "Product order",
    requestChurch: "Church supply",
    requestCustom: "Custom size or embroidery",
    requestGeneral: "General question",
    detailsLabel: "Details",
    detailsPlaceholder: "Write the products, quantity, or event date",
    prepareMessage: "Prepare request message",
    policiesEyebrow: "Terms & Policies",
    policiesTitle: "Payment and privacy policies",
    policiesIntro: "These policies are available in Arabic and English for payment terms, privacy, contact, and shipping information.",
    cartEyebrow: "Your order",
    cartTitle: "Product cart",
    paymentMethod: "Payment method",
    instapayLabel: "Instapay / bank transfer",
    instapaySmall: "01223515989 - Michael Nabil Milad",
    paymobSmall: "Direct online payment",
    pickupCashLabel: "Pickup from branch",
    pickupCashSmall: "Cash after order preparation",
    deliveryStep: "Delivery details",
    deliverySummaryPending: "Enter details before the total",
    deliverySummaryReady: "Order details confirmed",
    deliveryBostaLabel: "Bosta delivery",
    deliveryBostaSmall: "Home or church delivery by address",
    deliveryPickupLabel: "Pickup from branch",
    deliveryPickupSmall: "No shipping",
    checkoutGovernorate: "Governorate",
    checkoutGovernoratePlaceholder: "Choose governorate",
    checkoutCity: "City / area",
    checkoutCityPlaceholder: "Example: Shubra, Nasr City...",
    checkoutAddress: "Full address",
    checkoutAddressPlaceholder: "Street name, building, floor, apartment, landmark",
    checkoutNotes: "Order notes",
    checkoutNotesPlaceholder: "Optional: preferred time, church name, gift note",
    confirmShipping: "Confirm order details",
    editShipping: "Confirm changes",
    shippingPendingStatus: "Products total is visible. Delivery details are required before sending the order.",
    shippingReadyStatus: "Delivery details are saved. Bosta shipping cost will be confirmed by address.",
    pickupReadyStatus: "Branch pickup selected. No shipping cost.",
    totalLockedLabel: "Products total",
    totalReadyLabel: "Products total",
    shippingPendingNote: "Bosta shipping cost will be confirmed by address.",
    pickupNoShippingNote: "Branch pickup with no shipping.",
    checkoutDetailsFirst: "Confirm delivery details first",
    checkoutGovernorateRequired: "Choose the governorate before confirming",
    checkoutCityRequired: "Enter the city or area before confirming",
    checkoutAddressRequired: "Enter the full address before confirming",
    deliveryBostaMessage: "Delivery method: Bosta shipping",
    deliveryPickupMessage: "Delivery method: branch pickup",
    shippingAddressMessage: "Shipping details:\nName: {name}\nMobile: {phone}\nGovernorate: {governorate}\nCity/area: {city}\nAddress: {address}{email}{notes}",
    pickupAddressMessage: "Pickup details:\nName: {name}\nMobile: {phone}{email}{notes}",
    bostaCreating: "Creating Bosta shipment...",
    bostaCreated: "Bosta shipment request created",
    bostaFallback: "Bosta shipment could not be created now. The order will be sent on WhatsApp for manual follow-up.",
    bostaReferenceLine: "Bosta details: shipment/reference {reference}",
    orderReferenceLine: "Order reference: {reference}",
    orderSaveFallback: "The order could not be saved on the server now. WhatsApp will open for follow-up.",
    checkoutName: "Name",
    checkoutNamePlaceholder: "Customer name",
    checkoutPhone: "Mobile number",
    checkoutEmail: "Email",
    checkoutEmailPlaceholder: "Optional",
    copyPayment: "Copy payment details",
    totalApprox: "Estimated total",
    sendOrder: "Send order",
    emptyProducts: "No products match your current search.",
    emptyCart: "Your cart is empty.",
    cartLoading: "Loading cart details...",
    detailsAndPrices: "Details and prices",
    choices: "Options",
    choose: "Choose",
    add: "Add",
    unavailable: "Unavailable",
    available: "Available",
    askPrice: "Ask for price",
    currentPrice: "Current price",
    basicChoice: "Default option",
    modalQuantityLabel: "Quantity to add to cart",
    addToCart: "Add {count} to cart",
    pieces: "{count} piece(s)",
    modalQuantityAria: "Select quantity",
    quantityAdjustAria: "Adjust quantity for {name}",
    decreaseQuantity: "Decrease quantity",
    increaseQuantity: "Increase quantity",
    galleryLabel: "Images of {name}",
    showImageLabel: "Show image {index} of {name}",
    zoomImageLabel: "Zoom image of {name}",
    zoomHint: "Tap to zoom",
    shareProduct: "Share product",
    copyProductLink: "Copy product link",
    shareOnWhatsApp: "Share on WhatsApp",
    productShareMessage: "See this product from Pope Kyrillos Store: {name}\n{url}",
    productLinkCopied: "Product link copied",
    productLinkCopyFallback: "Copy the product link from the address bar",
    accountEyebrow: "Customer account",
    accountTitle: "Welcome to Pope Kyrillos Store",
    accountStatus: "Sign in so your cart stays saved and you can continue your order anytime.",
    accountSaved: "Your cart is saved to your account and will be available next time you sign in.",
    accountLocalOnly: "Your cart is saved on this device. Email or Google login needs Firebase setup.",
    accountLoading: "Preparing login...",
    accountUser: "Signed in: {name}",
    benefitCart: "Save cart",
    benefitFast: "Fast login",
    benefitOrders: "Track orders",
    googleLogin: "Continue with Google",
    googleSmall: "Fastest way to save your cart",
    authEmailLabel: "Email",
    authPasswordLabel: "Password",
    authPasswordPlaceholder: "At least 6 characters",
    emailSignin: "Sign in",
    emailSignup: "Create account",
    signOut: "Sign out",
    paymentFallback: "The official Paymob page will open to complete card payment.",
    fallbackLink: "Backup payment link",
    checkoutBusy: "Opening Paymob...",
    paymobNow: "Pay with Paymob",
    unpricedSuffix: " + products priced on request",
    instapayNote: "Transfer to 01223515989 under the name Michael Nabil Milad, then send the receipt photo on WhatsApp.",
    instapayMessage: "Payment method: Instapay / bank transfer to 01223515989 under the name Michael Nabil Milad. I will send the receipt photo after transfer.",
    instapayCopy: "Instapay / bank transfer\nTransfer number: 01223515989\nAccount name: Michael Nabil Milad",
    paymobNote: "The official Paymob page will open to complete card payment.",
    paymobCopy: "Paymob Checkout\nPayment link: https://accept.paymob.com/payme/popekyrillosstore",
    pickupCashNote: "Your order will be prepared first. After confirmation, you can pick it up from the branch and pay cash.",
    pickupCashMessage: "Pickup and payment method: pickup from branch and cash payment after the order is prepared and confirmed.",
    pickupCashCopy: "Pickup from branch\nPayment: cash after the order is prepared and confirmed",
    copiedPayment: "Payment details copied",
    copyPaymentFallback: "Copy payment details from the cart",
    cartEmptyToast: "Your cart is empty",
    checkoutNameRequired: "Enter the customer name before payment",
    checkoutPhoneRequired: "Enter a valid mobile number before payment",
    checkoutEmailInvalid: "Enter a valid email or leave it empty",
    paymobCheckoutFailed: "Checkout could not open. Opening the backup Paymob link",
    firebaseRequired: "Login needs Firebase setup first",
    firebaseLoading: "Preparing login. Try again in a moment",
    signinFailed: "Sign-in failed. Check Firebase settings",
    signupFailed: "Could not create the account. Make sure Email/Password is enabled in Firebase",
    emailAuthInvalid: "Enter a valid email and a password of at least 6 characters",
    emailSigninSuccess: "Signed in",
    emailSignupSuccess: "Account created and signed in",
    signoutToast: "Signed out",
    unavailableChoiceToast: "This option is currently unavailable",
    quantityLimitToast: "You reached the available quantity for this option",
    addedToast: "Added {count} of {name}{option} to the cart",
    contactEmpty: "No additional details",
    contactMessage: "Hello, I am {name}\nMy phone: {phone}\nRequest type: {requestType}\nDetails: {message}"
  }
};

const categoryCopy = {
  all: { ar: ["الكل", "كل المنتجات"], en: ["All", "All products"] },
  books: { ar: ["كتب وطقوس", "أجبية، قطمارس، ألحان"], en: ["Books & rites", "Agpeya, katameros, hymns"] },
  candles: { ar: ["شموع وبخور", "شموع، فحم، شورية"], en: ["Candles & incense", "Candles, charcoal, censers"] },
  vestments: { ar: ["أقمشة ومفارش", "مذبح، شماسات، تطريز"], en: ["Fabrics & altar cloths", "Altar, deacon, embroidery"] },
  icons: { ar: ["أيقونات وهدايا", "براويز، صلبان، تذكارات"], en: ["Icons & gifts", "Frames, crosses, keepsakes"] },
  brass: { ar: ["نحاسيات", "صلبان، شمعدانات، ذخائر"], en: ["Brassware", "Crosses, candlesticks, reliquaries"] }
};

const catalogCategoryOrder = ["brass", "candles", "vestments", "icons", "books"];
const catalogLabelOrder = {
  brass: ["صلبان زفة", "إبريق نحاس", "حُق ذخيرة", "نحاسيات", "دفوف وتريانتو", "شغل شحن"],
  candles: ["شموع وبخور"],
  vestments: ["أقمشة ومفارش"],
  icons: ["أيقونات وهدايا"],
  books: ["كتب وطقوس"]
};
const featuredProductOrder = [
  "صليب زفة نحاس طبقتين بفصوص ملونة",
  "صليب زفة نحاس طبقتين",
  "صليب زفة نحاس رفيع بفص ألوان",
  "طقم أواني مذبح ذهبي يوناني",
  "إبريق نحاس ذهبي",
  "دف 18 سم نحاس ذهبي تقيل",
  "تريانتو ستانلس",
  "بخور كنسي فاخر",
  "شورية نحاس ذهبي يوناني",
  "جراب للكتاب المقدس",
  "أيقونة صليب صدر يوناني ذهبي"
];

const textMapEn = {
  "دفوف وتريانتو": "Cymbals & triangle",
  "كتب وطقوس": "Books & rites",
  "شموع وبخور": "Candles & incense",
  "أيقونات وهدايا": "Icons & gifts",
  "نحاسيات": "Brassware",
  "الحجم": "Size",
  "المقاس": "Size",
  "اللون": "Color",
  "الوزن": "Weight",
  "علب بخور": "Incense boxes",
  "صلبان زفة": "Processional crosses",
  "خرابات كتاب مقدس": "Bible cases",
  "منتج": "Product",
  "صغير": "Small",
  "وسط": "Medium",
  "كبير": "Large",
  "125 جرام": "125 g",
  "250 جرام": "250 g",
  "500 جرام": "500 g",
  "750 جرام": "750 g",
  "1 كيلو": "1 kg",
  "متاح": "Available",
  "غير متاح حاليا": "Currently unavailable"
};

function t(key, replacements = {}) {
  const value = translations[state.language]?.[key] ?? translations.ar[key] ?? key;
  return Object.entries(replacements).reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, replacement), value);
}

function isEnglish() {
  return state.language === "en";
}

function localized(value = "") {
  if (!isEnglish()) return value;
  return textMapEn[value] || value;
}

function lineBreakText(element, text) {
  if (!element) return;
  element.textContent = "";
  String(text).split("\n").forEach((line, index) => {
    if (index) element.appendChild(document.createElement("br"));
    element.appendChild(document.createTextNode(line));
  });
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function setControlText(element, text) {
  if (!element) return;
  const icon = element.querySelector("svg");
  element.textContent = "";
  if (icon) element.append(icon);
  element.append(document.createTextNode(text));
}

function setLabelText(label, text) {
  if (!label) return;
  const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (textNode) {
    textNode.textContent = `\n            ${text}\n            `;
  } else {
    label.prepend(document.createTextNode(`${text} `));
  }
}

function applyCategoryLanguage() {
  filterButtons.forEach((button) => {
    const copy = categoryCopy[button.dataset.filter]?.[state.language];
    if (!copy) return;
    const [title, subtitle] = copy;
    const strong = button.querySelector("strong");
    const small = button.querySelector("small");
    if (strong) strong.textContent = title;
    if (small) small.textContent = subtitle;
  });
}

function applyLanguage({ render = true } = {}) {
  document.documentElement.lang = t("htmlLang");
  document.documentElement.dir = t("dir");
  document.body.dir = t("dir");
  document.body.dataset.lang = state.language;
  formatter = new Intl.NumberFormat(isEnglish() ? "en-US" : "ar-EG");
  document.title = t("documentTitle");

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute("content", t("metaDescription"));
  if (languageLabel) languageLabel.textContent = t("languageButton");
  if (languageToggle) languageToggle.setAttribute("aria-label", t("languageToggleAria"));

  const brand = document.querySelector(".brand");
  if (brand) {
    brand.setAttribute("aria-label", t("brandName"));
    const brandName = brand.querySelector("strong");
    const brandTagline = brand.querySelector("small");
    if (brandName) brandName.textContent = t("brandName");
    if (brandTagline) brandTagline.textContent = t("brandTagline");
  }

  const navLabels = {
    "#categories": "navCategories",
    "#catalog": "navProducts",
    "#services": "navServices",
    "#contact": "navContact"
  };
  Object.entries(navLabels).forEach(([href, key]) => {
    setText(`.main-nav a[href="${href}"]`, t(key));
  });

  setText(".hero .eyebrow", t("heroEyebrow"));
  setText("#hero-title", t("heroTitle"));
  lineBreakText(document.querySelector(".hero-lead"), t("heroLead"));
  setControlText(document.querySelector(".hero-actions .button"), t("shopNow"));
  const metricBlocks = document.querySelectorAll(".hero-metrics > div");
  if (metricBlocks[0]) {
    metricBlocks[0].querySelector("strong").textContent = isEnglish() ? "120+" : "+120";
    metricBlocks[0].querySelector("span").textContent = t("metricProducts");
  }
  if (metricBlocks[1]) {
    metricBlocks[1].querySelector("strong").textContent = isEnglish() ? "48 hours" : "48 ساعة";
    metricBlocks[1].querySelector("span").textContent = t("metricTime");
  }
  if (metricBlocks[2]) {
    metricBlocks[2].querySelector("strong").textContent = isEnglish() ? "Church orders" : "طلبات كنائس";
    metricBlocks[2].querySelector("span").textContent = t("metricChurch");
  }

  const trustKeys = [
    ["trustPaymentTitle", "trustPaymentText"],
    ["trustChosenTitle", "trustChosenText"],
    ["trustGiftTitle", "trustGiftText"],
    ["trustShippingTitle", "trustShippingText"]
  ];
  document.querySelectorAll(".trust-strip > div").forEach((item, index) => {
    const [titleKey, textKey] = trustKeys[index] || [];
    if (!titleKey) return;
    const title = item.querySelector("strong");
    const text = item.querySelector("span:not(.trust-icon)");
    if (title) title.textContent = t(titleKey);
    if (text) text.textContent = t(textKey);
  });

  setText("#categories .eyebrow", t("categoriesEyebrow"));
  setText("#categories-title", t("categoriesTitle"));
  applyCategoryLanguage();

  setText("#catalog .eyebrow", t("catalogEyebrow"));
  setText("#catalog-title", t("catalogTitle"));
  if (searchInput) searchInput.placeholder = t("searchPlaceholder");

  setText("#services .eyebrow", t("servicesEyebrow"));
  setText("#services-title", t("servicesTitle"));
  setText(".services-copy p:not(.eyebrow)", t("servicesText"));
  const serviceArticles = document.querySelectorAll(".service-list article");
  [
    ["service1Title", "service1Text"],
    ["service2Title", "service2Text"],
    ["service3Title", "service3Text"]
  ].forEach(([titleKey, textKey], index) => {
    const article = serviceArticles[index];
    if (!article) return;
    const title = article.querySelector("h3");
    const text = article.querySelector("p");
    if (title) title.textContent = t(titleKey);
    if (text) text.textContent = t(textKey);
  });

  setText("#contact .eyebrow", t("contactEyebrow"));
  setText("#contact-title", t("contactTitle"));
  const contactLabels = document.querySelectorAll(".contact-form label");
  setLabelText(contactLabels[0], t("nameLabel"));
  setLabelText(contactLabels[1], t("phoneLabel"));
  setLabelText(contactLabels[2], t("requestTypeLabel"));
  setLabelText(contactLabels[3], t("detailsLabel"));
  const contactOptions = document.querySelectorAll(".contact-form select option");
  [t("requestProducts"), t("requestChurch"), t("requestCustom"), t("requestGeneral")].forEach((text, index) => {
    if (contactOptions[index]) contactOptions[index].textContent = text;
  });
  const nameInput = document.querySelector('.contact-form input[name="name"]');
  const detailsInput = document.querySelector('.contact-form textarea[name="message"]');
  if (nameInput) nameInput.placeholder = t("namePlaceholder");
  if (detailsInput) detailsInput.placeholder = t("detailsPlaceholder");
  setControlText(document.querySelector(".contact-form button"), t("prepareMessage"));

  setText("[data-policies-eyebrow]", t("policiesEyebrow"));
  setText("[data-policies-title]", t("policiesTitle"));
  setText("[data-policies-intro]", t("policiesIntro"));

  setText(".cart-panel-head .eyebrow", t("cartEyebrow"));
  setText(".cart-panel-head h2", t("cartTitle"));
  setText(".payment-box-head span", t("paymentMethod"));
  const paymentOptions = document.querySelectorAll(".payment-option");
  if (paymentOptions[0]) {
    paymentOptions[0].querySelector("strong").textContent = t("instapayLabel");
    paymentOptions[0].querySelector("small").textContent = t("instapaySmall");
  }
  if (paymentOptions[1]) {
    paymentOptions[1].querySelector("strong").textContent = "Paymob";
    paymentOptions[1].querySelector("small").textContent = t("paymobSmall");
  }
  if (paymentOptions[2]) {
    paymentOptions[2].querySelector("strong").textContent = t("pickupCashLabel");
    paymentOptions[2].querySelector("small").textContent = t("pickupCashSmall");
  }
  setText("[data-checkout-step-label]", t("deliveryStep"));
  setText("[data-delivery-bosta-label]", t("deliveryBostaLabel"));
  setText("[data-delivery-bosta-small]", t("deliveryBostaSmall"));
  setText("[data-delivery-pickup-label]", t("deliveryPickupLabel"));
  setText("[data-delivery-pickup-small]", t("deliveryPickupSmall"));
  setText("[data-checkout-name-label]", t("checkoutName"));
  setText("[data-checkout-phone-label]", t("checkoutPhone"));
  setText("[data-checkout-email-label]", t("checkoutEmail"));
  setText("[data-checkout-governorate-label]", t("checkoutGovernorate"));
  setText("[data-checkout-city-label]", t("checkoutCity"));
  setText("[data-checkout-address-label]", t("checkoutAddress"));
  setText("[data-checkout-notes-label]", t("checkoutNotes"));
  setText("[data-governorate-placeholder]", t("checkoutGovernoratePlaceholder"));
  if (checkoutNameInput) checkoutNameInput.placeholder = t("checkoutNamePlaceholder");
  if (checkoutEmailInput) checkoutEmailInput.placeholder = t("checkoutEmailPlaceholder");
  if (checkoutCityInput) checkoutCityInput.placeholder = t("checkoutCityPlaceholder");
  if (checkoutAddressInput) checkoutAddressInput.placeholder = t("checkoutAddressPlaceholder");
  if (checkoutNotesInput) checkoutNotesInput.placeholder = t("checkoutNotesPlaceholder");
  if (copyPaymentButton) copyPaymentButton.textContent = t("copyPayment");
  if (confirmShippingButton) confirmShippingButton.textContent = state.shippingConfirmed ? t("editShipping") : t("confirmShipping");

  setText(".account-hero .eyebrow", t("accountEyebrow"));
  setText("#account-modal-title", t("accountTitle"));
  document.querySelectorAll(".account-benefits span").forEach((item, index) => {
    setControlText(item, [t("benefitCart"), t("benefitFast"), t("benefitOrders")][index]);
  });
  const googleProvider = document.querySelector('[data-auth-provider="google"]');
  if (googleProvider) {
    googleProvider.querySelector("strong").textContent = t("googleLogin");
    googleProvider.querySelector("small").textContent = t("googleSmall");
  }
  setText("[data-auth-email-label]", t("authEmailLabel"));
  setText("[data-auth-password-label]", t("authPasswordLabel"));
  if (authEmailInput) authEmailInput.placeholder = "name@example.com";
  if (authPasswordInput) authPasswordInput.placeholder = t("authPasswordPlaceholder");
  if (emailAuthForm?.querySelector("[data-email-signin]")) {
    emailAuthForm.querySelector("[data-email-signin]").textContent = t("emailSignin");
  }
  if (emailSignupButton) emailSignupButton.textContent = t("emailSignup");
  if (authSignoutButton) authSignoutButton.textContent = t("signOut");

  if (render) {
    renderAuthState();
    renderProducts();
    renderCart();
    if (document.body.classList.contains("product-open")) renderProductModal();
  }
}

function money(amount) {
  if (amount === null || amount === undefined || amount === "") return t("askPrice");
  return isEnglish() ? `EGP ${formatter.format(Number(amount))}` : `${formatter.format(Number(amount))} ج.م`;
}

function productShareUrl(productId) {
  const url = new URL(window.location.href);
  url.searchParams.set("product", productId);
  url.hash = "";
  return url.toString();
}

function productIdFromUrl() {
  const url = new URL(window.location.href);
  const queryProduct = url.searchParams.get("product");
  if (queryProduct) return queryProduct;
  const hashMatch = decodeURIComponent(url.hash || "").match(/^#product=(.+)$/);
  return hashMatch ? hashMatch[1] : "";
}

function setProductUrl(productId) {
  const url = productShareUrl(productId);
  if (url !== window.location.href) window.history.pushState({ productId }, "", url);
}

function clearProductUrl() {
  const url = new URL(window.location.href);
  const hadProductUrl = url.searchParams.has("product") || decodeURIComponent(url.hash || "").startsWith("#product=");
  if (!hadProductUrl) return;
  url.searchParams.delete("product");
  url.hash = "catalog";
  window.history.replaceState({}, "", url);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactText(value = "", maxLength = 150) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function rankFromList(list, value) {
  const index = list.indexOf(value);
  return index === -1 ? 999 : index;
}

function compareCatalogProducts(first, second) {
  const firstFeatured = state.filter === "all" && !state.search.trim() ? rankFromList(featuredProductOrder, first.product.name) : 999;
  const secondFeatured = state.filter === "all" && !state.search.trim() ? rankFromList(featuredProductOrder, second.product.name) : 999;
  if (firstFeatured !== secondFeatured) return firstFeatured - secondFeatured;

  const firstCategory = rankFromList(catalogCategoryOrder, first.product.category);
  const secondCategory = rankFromList(catalogCategoryOrder, second.product.category);
  if (firstCategory !== secondCategory) return firstCategory - secondCategory;

  const firstLabel = rankFromList(catalogLabelOrder[first.product.category] || [], first.product.label);
  const secondLabel = rankFromList(catalogLabelOrder[second.product.category] || [], second.product.label);
  if (firstLabel !== secondLabel) return firstLabel - secondLabel;

  const firstProductRank = rankFromList(featuredProductOrder, first.product.name);
  const secondProductRank = rankFromList(featuredProductOrder, second.product.name);
  if (firstProductRank !== secondProductRank) return firstProductRank - secondProductRank;

  const firstPrice = productPrice(first.product) ?? 999999999;
  const secondPrice = productPrice(second.product) ?? 999999999;
  if (firstPrice !== secondPrice) return firstPrice - secondPrice;

  return first.index - second.index;
}

function productPrice(product) {
  const value = Number(product.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function variantPrice(variant, product) {
  const value = Number(variant?.price ?? product?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function productPriceText(product) {
  if (!isEnglish() && product.priceNote) return product.priceNote;
  const prices = getProductVariants(product).map((variant) => variantPrice(variant, product)).filter((price) => price !== null);
  if (!prices.length) return money(productPrice(product));

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return money(min);
  return isEnglish() ? `From ${money(min)} to ${money(max)}` : `يبدأ من ${money(min)} حتى ${money(max)}`;
}

function variantQuantity(variant) {
  const value = Number(variant?.quantity);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function getProduct(id) {
  return products.find((item) => item.id === id);
}

function getProductImages(product) {
  if (Array.isArray(product?.images) && product.images.length) return product.images;
  if (product?.image) return [product.image];
  return [];
}

function getProductVariants(product) {
  if (Array.isArray(product?.variants) && product.variants.length) return product.variants;

  return [
    {
      id: "default",
      title: "الاختيار الأساسي",
      options: {},
      price: productPrice(product),
      available: product?.stock !== "غير متاح حاليا",
      image: product?.image || null
    }
  ];
}

function isVariantAvailable(variant) {
  const quantity = variantQuantity(variant);
  if (quantity !== null) return quantity > 0;
  return variant?.available !== false;
}

function hasProductChoices(product) {
  return Array.isArray(product?.options) && product.options.length > 0;
}

function hasAvailableVariant(product) {
  return getProductVariants(product).some(isVariantAvailable);
}

function variantStockText(variant) {
  if (!isVariantAvailable(variant)) return isEnglish() ? "Currently unavailable" : "غير متاح حاليا";
  const quantity = variantQuantity(variant);
  if (quantity === null) return t("available");
  return isEnglish() ? `Available - ${formatter.format(quantity)} pcs` : `متاح - ${formatter.format(quantity)} قطعة`;
}

function clampModalQuantity(variant) {
  const requested = Math.max(1, Number(state.modal.quantity) || 1);
  const stock = variantQuantity(variant);
  if (stock === null) return requested;

  const key = cartKey(state.modal.productId, variant?.id || "default");
  const inCart = state.cart.get(key) || 0;
  const remaining = Math.max(0, stock - inCart);
  if (remaining <= 0) return 0;
  return Math.max(1, Math.min(requested, remaining));
}

function productStockText(product) {
  const availableVariants = getProductVariants(product).filter(isVariantAvailable);
  if (!availableVariants.length) return isEnglish() ? "Currently unavailable" : "غير متاح حاليا";

  const quantities = availableVariants.map(variantQuantity).filter((quantity) => quantity !== null);
  if (quantities.length === availableVariants.length && quantities.length) {
    const total = quantities.reduce((sum, quantity) => sum + quantity, 0);
    return isEnglish() ? `Available - ${formatter.format(total)} pcs` : `متاح - ${formatter.format(total)} قطعة`;
  }

  return t("available");
}

function variantOptionText(variant) {
  const options = Object.entries(variant?.options || {});
  return options.map(([name, value]) => `${localized(name)}: ${localized(value)}`).join(isEnglish() ? ", " : "، ");
}

function cartKey(productId, variantId = "default") {
  return `${productId}${cartSeparator}${variantId || "default"}`;
}

function parseCartKey(key) {
  const [productId, variantId = "default"] = String(key).split(cartSeparator);
  return { productId, variantId };
}

function currentCartStorageKey() {
  return state.auth.user?.uid ? `${userCartStoragePrefix}${state.auth.user.uid}` : guestCartStorageKey;
}

function cartPayloadFromMap(map = state.cart) {
  return [...map.entries()]
    .map(([key, qty]) => {
      const { productId, variantId } = parseCartKey(key);
      return {
        productId,
        variantId,
        qty: Number(qty) || 0
      };
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
    map.set(cartKey(productId, variantId), Math.floor(qty));
  });

  return map;
}

function mergeCartMaps(first, second) {
  const merged = new Map(first);
  second.forEach((qty, key) => {
    merged.set(key, (merged.get(key) || 0) + qty);
  });
  return clampCartMap(merged);
}

function clampCartMap(map) {
  const next = new Map();
  map.forEach((qty, key) => {
    const { productId, variantId } = parseCartKey(key);
    const product = getProduct(productId);
    if (!product && products.length) return;

    const variant = product ? findVariant(product, variantId) : null;
    if (variant && !isVariantAvailable(variant)) return;

    const max = variant ? variantQuantity(variant) : null;
    const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
    next.set(key, max === null ? safeQty : Math.min(safeQty, max));
  });
  return next;
}

function loadCartFromLocal(key = currentCartStorageKey()) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const data = JSON.parse(raw);
    return cartMapFromPayload(data.items || data);
  } catch (error) {
    console.warn("Could not load saved cart.", error);
    return new Map();
  }
}

function saveCartToLocal(key = currentCartStorageKey(), map = state.cart) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        items: cartPayloadFromMap(map),
        updatedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn("Could not save cart locally.", error);
  }
}

function loadGuestCart() {
  state.cart = loadCartFromLocal(guestCartStorageKey);
}

function findVariant(product, variantId) {
  const variants = getProductVariants(product);
  return variants.find((variant) => variant.id === variantId) || defaultVariant(product);
}

function defaultVariant(product) {
  const variants = getProductVariants(product);
  const available = variants.filter(isVariantAvailable);
  const candidates = available.length ? available : variants;
  const minPrice = productPrice(product);

  if (minPrice !== null) {
    const priced = candidates.find((variant) => variantPrice(variant, product) === minPrice);
    if (priced) return priced;
  }

  return candidates[0];
}

function cleanDescription(description = "") {
  return String(description).split("الاختيارات والأسعار:")[0].trim();
}

function getFilteredProducts() {
  const query = state.search.trim().toLowerCase();
  return products
    .map((product, index) => ({ product, index }))
    .filter(({ product }) => {
      if (!hasAvailableVariant(product)) return false;
      const matchesCategory = state.filter === "all" || product.category === state.filter;
      const tags = Array.isArray(product.tags) ? product.tags.join(" ") : "";
      const text = `${product.name} ${product.label} ${localized(product.label)} ${product.description} ${tags} ${localized(tags)}`.toLowerCase();
      return matchesCategory && (!query || text.includes(query));
    })
    .sort(compareCatalogProducts)
    .map(({ product }) => product);
}

function renderProducts() {
  const items = getFilteredProducts();

  if (!items.length) {
    productGrid.innerHTML = `<div class="empty-state">${t("emptyProducts")}</div>`;
    return;
  }

  productGrid.innerHTML = items
    .map((product) => {
      const tags = Array.isArray(product.tags) ? product.tags : [];
      const galleryImages = getProductImages(product);
      const hasImage = galleryImages.length > 0;
      const hasChoices = hasProductChoices(product);
      const isAvailable = hasAvailableVariant(product);
      const fullDescription = escapeHtml(localized(product.description || ""));
      const shortDescription = escapeHtml(compactText(localized(product.description || "")));
      const priceText = productPriceText(product);
      const stockText = productStockText(product);
      const productDisplayName = localized(product.name);
      const productName = escapeHtml(productDisplayName);
      const productId = escapeHtml(product.id);
      const actionLabel = !isAvailable ? t("unavailable") : hasChoices ? t("choose") : t("add");
      const actionAttribute = hasChoices ? `data-view-product="${productId}"` : `data-add="${productId}"`;
      const disabledAttribute = isAvailable ? "" : "disabled aria-disabled=\"true\"";
      const thumbnails = galleryImages.length > 1
        ? `
          <div class="product-thumbs" aria-label="${escapeHtml(t("galleryLabel", { name: productDisplayName }))}">
            ${galleryImages
              .map(
                (image, index) => `
                  <button
                    class="product-thumb ${index === 0 ? "active" : ""}"
                    type="button"
                    data-gallery="${productId}"
                    data-gallery-image="${escapeHtml(image)}"
                    aria-label="${escapeHtml(t("showImageLabel", { index: formatter.format(index + 1), name: productDisplayName }))}"
                    aria-pressed="${index === 0 ? "true" : "false"}"
                  >
                    <img src="${escapeHtml(image)}" alt="" loading="lazy" />
                  </button>
                `
              )
              .join("")}
          </div>
        `
        : "";
      const visual = hasImage
        ? `
          <div class="product-gallery ${galleryImages.length > 1 ? "has-thumbs" : ""}">
            <div class="product-gallery-main">
              <img class="product-photo" data-main-image="${productId}" src="${escapeHtml(galleryImages[0])}" alt="${productName}" loading="lazy" />
            </div>
            ${thumbnails}
          </div>
        `
        : `<span class="product-art product-art--${product.art || "icons"}" aria-hidden="true"></span>`;

      return `
        <article class="product-card" data-card-product="${productId}">
          <div class="product-visual ${hasImage ? "has-image" : ""}" style="--visual-bg: ${product.bg || "#efe6d6"}; --visual-bg-2: ${product.bg2 || "#d6e5dc"}; --visual-fg: ${product.fg || "#0c6b68"}">
            <span class="product-badge">${escapeHtml(localized(product.badge || product.stock || t("available")))}</span>
            ${visual}
          </div>
          <div class="product-info">
            <div class="product-meta">
              <span>${escapeHtml(localized(product.label || "منتج"))}</span>
              <span class="stock">${escapeHtml(stockText)}</span>
            </div>
            <h3>${productName}</h3>
            <p class="product-summary">${shortDescription}</p>
            <details class="product-details">
              <summary>${t("detailsAndPrices")}</summary>
              <p>${fullDescription}</p>
            </details>
            <div class="product-tags">
              ${tags.map((tag) => `<span>${escapeHtml(localized(tag))}</span>`).join("")}
              ${hasChoices ? `<span>${t("choices")}</span>` : ""}
            </div>
            <div class="product-bottom">
              <span class="price">${escapeHtml(priceText)}</span>
              <button class="button primary add-button" type="button" ${actionAttribute} ${disabledAttribute}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                ${actionLabel}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function normalizeModalSelection(product, preferredOption = "") {
  const options = Array.isArray(product.options) ? product.options : [];
  const variants = getProductVariants(product);
  const selected = { ...state.modal.selectedOptions };

  if (!options.length) {
    const variant = defaultVariant(product);
    state.modal.selectedOptions = {};
    return variant;
  }

  const exactAvailable = variants.find(
    (variant) =>
      isVariantAvailable(variant) &&
      options.every((option) => variant.options?.[option.name] === selected[option.name])
  );

  if (exactAvailable) {
    state.modal.selectedOptions = { ...exactAvailable.options };
    return exactAvailable;
  }

  const preferredValue = preferredOption ? selected[preferredOption] : "";
  const preferredAvailable = preferredValue
    ? variants.find((variant) => isVariantAvailable(variant) && variant.options?.[preferredOption] === preferredValue)
    : null;
  const fallback = preferredAvailable || defaultVariant(product);
  state.modal.selectedOptions = { ...(fallback?.options || {}) };
  return fallback;
}

function selectedModalVariant(product) {
  return normalizeModalSelection(product);
}

function isOptionValueEnabled(product, optionName, value) {
  const variants = getProductVariants(product).filter(isVariantAvailable);
  if (!variants.length) return false;

  return variants.some((variant) => variant.options?.[optionName] === value);
}

function renderProductModal() {
  const product = getProduct(state.modal.productId);
  if (!product) return;

  const variant = selectedModalVariant(product);
  const images = getProductImages(product);
  const variantImage = variant?.image || "";
  const activeImage = state.modal.image || variantImage || images[0] || "";
  const modalImages = activeImage && !images.includes(activeImage) ? [activeImage, ...images] : images;
  const optionText = variantOptionText(variant);
  const price = variantPrice(variant, product);
  const isAvailable = isVariantAvailable(variant);
  const stockQuantity = variantQuantity(variant);
  const cartQuantity = state.cart.get(cartKey(product.id, variant?.id || "default")) || 0;
  const remainingQuantity = stockQuantity === null ? null : Math.max(0, stockQuantity - cartQuantity);
  state.modal.quantity = clampModalQuantity(variant);
  const modalQuantity = state.modal.quantity;
  const canAddQuantity = isAvailable && (remainingQuantity === null || remainingQuantity > 0);
  const canIncreaseQuantity = canAddQuantity && (remainingQuantity === null || modalQuantity < remainingQuantity);
  const description = cleanDescription(localized(product.description || ""));
  const productDisplayName = localized(product.name);
  const productName = escapeHtml(productDisplayName);
  const shareUrl = productShareUrl(product.id);
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(t("productShareMessage", { name: productDisplayName, url: shareUrl }))}`;

  const media = activeImage
    ? `
      <button
        class="modal-photo-frame modal-photo-zoom"
        type="button"
        data-zoom-image="${escapeHtml(activeImage)}"
        data-zoom-alt="${productName}"
        aria-label="${escapeHtml(t("zoomImageLabel", { name: productDisplayName }))}"
      >
        <img class="modal-product-photo" src="${escapeHtml(activeImage)}" alt="${productName}" />
        <span class="zoom-hint">${t("zoomHint")}</span>
      </button>
      ${
        modalImages.length > 1
          ? `
            <div class="modal-thumbs" aria-label="${escapeHtml(t("galleryLabel", { name: productDisplayName }))}">
              ${modalImages
                .map((image, index) => {
                  const isActive = image === activeImage;
                  return `
                    <button
                      class="modal-thumb ${isActive ? "active" : ""}"
                      type="button"
                      data-modal-image="${escapeHtml(image)}"
                      data-zoom-image="${escapeHtml(image)}"
                      data-zoom-alt="${productName}"
                      aria-label="${escapeHtml(t("showImageLabel", { index: formatter.format(index + 1), name: productDisplayName }))}"
                      aria-pressed="${isActive ? "true" : "false"}"
                    >
                      <img src="${escapeHtml(image)}" alt="" loading="lazy" />
                    </button>
                  `;
                })
                .join("")}
            </div>
          `
          : ""
      }
    `
    : `<div class="modal-photo-frame empty"><span class="product-art product-art--${product.art || "icons"}" aria-hidden="true"></span></div>`;

  const optionGroups = hasProductChoices(product)
    ? product.options
        .map(
          (option) => `
            <div class="option-group">
              <h3>${escapeHtml(localized(option.name))}</h3>
              <div class="option-values">
                ${option.values
                  .map((value) => {
                    const active = state.modal.selectedOptions[option.name] === value;
                    const enabled = isOptionValueEnabled(product, option.name, value);
                    return `
                      <button
                        class="option-button ${active ? "active" : ""}"
                        type="button"
                        data-option-name="${escapeHtml(option.name)}"
                        data-option-value="${escapeHtml(value)}"
                        aria-pressed="${active ? "true" : "false"}"
                        ${enabled ? "" : "disabled"}
                      >
                        ${escapeHtml(localized(value))}
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `
        )
        .join("")
    : "";

  productModalBody.innerHTML = `
    <div class="product-modal-media">
      ${media}
    </div>
    <div class="product-modal-copy">
      <p class="eyebrow">${escapeHtml(localized(product.label || "منتج"))}</p>
      <h2 id="product-modal-title">${productName}</h2>
      <div class="product-share-actions" aria-label="${t("shareProduct")}">
        <button class="product-share-button" type="button" data-copy-product-link="${escapeHtml(product.id)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
            <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
          </svg>
          ${t("copyProductLink")}
        </button>
        <a class="product-share-button whatsapp" href="${escapeHtml(whatsappShareUrl)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z" />
            <path d="M9.5 8.5c.4 2 2 3.6 4 4" />
          </svg>
          ${t("shareOnWhatsApp")}
        </a>
      </div>
      <p class="modal-description">${escapeHtml(description)}</p>
      ${optionGroups ? `<div class="variant-options">${optionGroups}</div>` : ""}
      <div class="variant-summary">
        <span>${t("currentPrice")}</span>
        <strong>${money(price)}</strong>
        <p>${optionText ? escapeHtml(localized(optionText)) : t("basicChoice")} · ${escapeHtml(variantStockText(variant))}</p>
      </div>
      <div class="modal-quantity" aria-label="${t("modalQuantityAria")}">
        <div>
          <span>${t("modalQuantityLabel")}</span>
          <strong>${t("pieces", { count: formatter.format(modalQuantity) })}</strong>
        </div>
        <div class="quantity-stepper">
          <button
            class="quantity-step"
            type="button"
            data-modal-qty-action="decrease"
            aria-label="${t("decreaseQuantity")}"
            ${modalQuantity <= 1 ? "disabled" : ""}
          >
            -
          </button>
          <output>${formatter.format(modalQuantity)}</output>
          <button
            class="quantity-step"
            type="button"
            data-modal-qty-action="increase"
            aria-label="${t("increaseQuantity")}"
            ${canIncreaseQuantity ? "" : "disabled"}
          >
            +
          </button>
        </div>
      </div>
      <button
        class="button primary full modal-add"
        type="button"
        data-modal-add="${escapeHtml(product.id)}"
        data-modal-variant="${escapeHtml(variant?.id || "default")}"
        data-modal-quantity="${modalQuantity}"
        ${canAddQuantity ? "" : "disabled aria-disabled=\"true\""}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        ${t("addToCart", { count: formatter.format(modalQuantity) })}
      </button>
    </div>
  `;
}

function openProductModal(productId, { updateUrl = true } = {}) {
  const product = getProduct(productId);
  if (!product) return;

  const variant = defaultVariant(product);
  state.modal.productId = product.id;
  state.modal.selectedOptions = { ...(variant?.options || {}) };
  state.modal.image = variant?.image || getProductImages(product)[0] || "";
  state.modal.quantity = 1;
  renderProductModal();
  productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("product-open");
  if (updateUrl) setProductUrl(product.id);
  productModalClose.focus();
}

function openImageLightbox(src, alt = "") {
  if (!src) return;
  imageLightboxImage.src = src;
  imageLightboxImage.alt = alt;
  imageLightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("image-zoom-open");
  imageLightboxClose.focus();
}

function closeImageLightbox() {
  document.body.classList.remove("image-zoom-open");
  imageLightbox.setAttribute("aria-hidden", "true");
  imageLightboxImage.removeAttribute("src");
  imageLightboxImage.alt = "";
}

function closeProductModal({ updateUrl = true } = {}) {
  closeImageLightbox();
  document.body.classList.remove("product-open");
  productModal.setAttribute("aria-hidden", "true");
  state.modal.productId = "";
  state.modal.selectedOptions = {};
  state.modal.image = "";
  state.modal.quantity = 1;
  if (updateUrl) clearProductUrl();
}

function cartEntries() {
  return [...state.cart.entries()]
    .map(([key, qty]) => {
      const { productId, variantId } = parseCartKey(key);
      const product = getProduct(productId);
      if (!product) return null;

      const variant = findVariant(product, variantId);
      return {
        key,
        product,
        variant,
        qty,
        price: variantPrice(variant, product),
        optionText: variantOptionText(variant)
      };
    })
    .filter(Boolean);
}

function cartQuantityCount(map = state.cart) {
  return [...map.values()].reduce((sum, qty) => sum + Math.max(0, Math.floor(Number(qty) || 0)), 0);
}

function selectedPayment() {
  return paymentMethods[state.paymentMethod] || paymentMethods.instapay;
}

function checkoutCartPayload() {
  return cartEntries().map((item) => ({
    productId: item.product.id,
    variantId: item.variant?.id || "default",
    qty: item.qty
  }));
}

function normalizedPhone(value = "") {
  return String(value).replace(/[^\d+]/g, "").trim();
}

function checkoutCustomer() {
  const name = checkoutNameInput?.value.trim() || "";
  const phone = normalizedPhone(checkoutPhoneInput?.value || "");
  const email = checkoutEmailInput?.value.trim() || "";
  const governorate = checkoutGovernorateInput?.value.trim() || "";
  const city = checkoutCityInput?.value.trim() || "";
  const address = checkoutAddressInput?.value.trim() || "";
  const notes = checkoutNotesInput?.value.trim() || "";
  return {
    deliveryMethod: state.deliveryMethod,
    name,
    phone,
    email,
    governorate,
    city,
    address,
    notes
  };
}

function validateCheckoutCustomer({ requireConfirmed = false } = {}) {
  const customer = checkoutCustomer();
  const needsAddress = customer.deliveryMethod === "bosta";

  if (requireConfirmed && !state.shippingConfirmed) {
    confirmShippingButton?.focus();
    showToast(t("checkoutDetailsFirst"));
    return null;
  }
  if (!customer.name) {
    checkoutNameInput?.focus();
    showToast(t("checkoutNameRequired"));
    return null;
  }
  if (!customer.phone || customer.phone.length < 10) {
    checkoutPhoneInput?.focus();
    showToast(t("checkoutPhoneRequired"));
    return null;
  }
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    checkoutEmailInput?.focus();
    showToast(t("checkoutEmailInvalid"));
    return null;
  }
  if (needsAddress && !customer.governorate) {
    checkoutGovernorateInput?.focus();
    showToast(t("checkoutGovernorateRequired"));
    return null;
  }
  if (needsAddress && !customer.city) {
    checkoutCityInput?.focus();
    showToast(t("checkoutCityRequired"));
    return null;
  }
  if (needsAddress && !customer.address) {
    checkoutAddressInput?.focus();
    showToast(t("checkoutAddressRequired"));
    return null;
  }
  return customer;
}

function confirmShippingDetails() {
  const customer = validateCheckoutCustomer();
  if (!customer) return false;
  state.shipping = customer;
  state.shippingConfirmed = true;
  renderCart();
  showToast(customer.deliveryMethod === "pickup" ? t("pickupReadyStatus") : t("shippingReadyStatus"));
  return true;
}

function resetShippingConfirmation() {
  state.shippingConfirmed = false;
  state.shipping = null;
  state.bosta.shipment = null;
  renderCart();
}

function shippingMessageLine(customer = state.shipping) {
  if (!customer) return "";
  const emailLine = customer.email ? `\n${isEnglish() ? "Email" : "البريد الإلكتروني"}: ${customer.email}` : "";
  const notesLine = customer.notes ? `\n${isEnglish() ? "Notes" : "ملاحظات"}: ${customer.notes}` : "";
  if (customer.deliveryMethod === "pickup") {
    return `${t("deliveryPickupMessage")}\n${t("pickupAddressMessage", { ...customer, email: emailLine, notes: notesLine })}`;
  }
  return `${t("deliveryBostaMessage")}\n${t("shippingAddressMessage", { ...customer, email: emailLine, notes: notesLine })}`;
}

function bostaEndpoint() {
  const configuredEndpoint = window.POPE_KYRILLOS_API_CONFIG?.bostaDeliveryEndpoint || "";
  if (configuredEndpoint) return configuredEndpoint;
  const projectId = firebaseConfig().projectId;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/createBostaDelivery` : "";
}

function orderEndpoint() {
  const configuredEndpoint = window.POPE_KYRILLOS_API_CONFIG?.orderEndpoint || "";
  if (configuredEndpoint) return configuredEndpoint;
  const projectId = firebaseConfig().projectId;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/createOrder` : "";
}

async function authHeaders() {
  const user = state.auth.services?.auth?.currentUser || state.auth.user;
  if (!user?.getIdToken) return {};
  try {
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}

function cartTotalAmount() {
  return cartEntries().reduce((sum, item) => sum + (item.price || 0) * item.qty, 0);
}

function orderLinesFromCart() {
  return cartEntries()
    .map((item) => {
      const productName = localized(item.product.name);
      const priceText = item.price === null ? t("askPrice") : money(item.price);
      const selected = item.optionText ? ` (${item.optionText})` : "";
      return `- ${productName}${selected}: ${formatter.format(item.qty)} × ${priceText}`;
    })
    .join("\n");
}

function bostaReferenceLine(shipment) {
  const reference = shipment?.trackingNumber || shipment?.awbNumber || shipment?.trackingCode || shipment?._id || shipment?.id || shipment?.businessReference;
  return reference ? t("bostaReferenceLine", { reference }) : "";
}

function orderReferenceLine(orderResult) {
  const reference = orderResult?.orderId || orderResult?.id;
  return reference ? t("orderReferenceLine", { reference }) : "";
}

function orderMessage(extraLine = "") {
  const total = cartTotalAmount();
  const shippingNote = state.shipping?.deliveryMethod === "bosta" ? t("shippingPendingNote") : t("pickupNoShippingNote");
  const extra = extraLine ? `\n${extraLine}` : "";
  return isEnglish()
    ? `Hello, I would like to order the following products from Pope Kyrillos Store:\n${orderLinesFromCart()}\nProducts total: ${money(total)}\n${shippingNote}\n${shippingMessageLine()}${extra}\n${paymentMessageLine()}`
    : `مرحباً، أريد طلب المنتجات التالية من مكتبة البابا كيرلس:\n${orderLinesFromCart()}\nإجمالي المنتجات المسعرة: ${money(total)}\n${shippingNote}\n${shippingMessageLine()}${extra}\n${paymentMessageLine()}`;
}

function orderWhatsappUrl(extraLine = "") {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(orderMessage(extraLine))}`;
}

function bostaDeliveryPayload() {
  const entries = cartEntries();
  return {
    customer: state.shipping,
    paymentMethod: state.paymentMethod,
    order: {
      currency: "EGP",
      total: cartTotalAmount(),
      itemsCount: entries.reduce((sum, item) => sum + item.qty, 0),
      items: entries.map((item) => ({
        productId: item.product.id,
        variantId: item.variant?.id || "default",
        name: localized(item.product.name),
        option: item.optionText || "",
        quantity: item.qty,
        price: item.price
      }))
    }
  };
}

async function createSecureOrder() {
  const endpoint = orderEndpoint();
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders())
    },
    body: JSON.stringify({
      items: checkoutCartPayload(),
      customer: state.shipping,
      paymentMethod: state.paymentMethod
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.message || data.error || "Order save failed");
  }
  return data;
}

async function createBostaShipment() {
  if (state.shipping?.deliveryMethod !== "bosta") return null;
  const endpoint = bostaEndpoint();
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders())
    },
    body: JSON.stringify(bostaDeliveryPayload())
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.message || data.error || "Bosta shipment failed");
  }
  return data.delivery || data.result || data;
}

function renderPaymentDetails() {
  if (state.deliveryMethod !== "pickup" && state.paymentMethod === "pickupCash") {
    state.paymentMethod = "instapay";
  }
  const isPaymob = state.paymentMethod === "paymob";
  const isPickupCash = state.paymentMethod === "pickupCash";
  const label = isPaymob ? "Paymob" : isPickupCash ? t("pickupCashLabel") : t("instapayLabel");

  if (paymentSummary) paymentSummary.textContent = label;
  if (paymentNote) {
    if (isPaymob) {
      paymentNote.innerHTML = `${escapeHtml(t("paymobNote"))} <a href="${escapeHtml(paymobPaymentLink)}" target="_blank" rel="noopener">${escapeHtml(t("fallbackLink"))}</a>`;
    } else if (isPickupCash) {
      paymentNote.textContent = t("pickupCashNote");
    } else {
      paymentNote.textContent = t("instapayNote");
    }
  }

  paymentInputs.forEach((input) => {
    const disabled = input.value === "pickupCash" && state.deliveryMethod !== "pickup";
    const active = input.value === state.paymentMethod;
    input.disabled = disabled;
    input.checked = active;
    input.closest(".payment-option")?.classList.toggle("active", active);
    input.closest(".payment-option")?.classList.toggle("disabled", disabled);
  });
}

function renderDeliveryDetails() {
  const needsAddress = state.deliveryMethod === "bosta";
  if (shippingFields) {
    shippingFields.hidden = !needsAddress;
    shippingFields.setAttribute("aria-hidden", needsAddress ? "false" : "true");
  }
  if (shippingSummary) {
    shippingSummary.textContent = state.shippingConfirmed ? t("deliverySummaryReady") : t("deliverySummaryPending");
  }
  if (shippingStatus) {
    shippingStatus.textContent = state.shippingConfirmed
      ? needsAddress
        ? t("shippingReadyStatus")
        : t("pickupReadyStatus")
      : t("shippingPendingStatus");
  }
  if (confirmShippingButton) {
    confirmShippingButton.textContent = state.shippingConfirmed ? t("editShipping") : t("confirmShipping");
  }

  deliveryInputs.forEach((input) => {
    const active = input.value === state.deliveryMethod;
    input.checked = active;
    input.closest(".delivery-option")?.classList.toggle("active", active);
  });
}

function paymentMessageLine() {
  if (state.paymentMethod === "paymob" && paymobPaymentLink) {
    return isEnglish() ? `Payment method: Paymob\nPayment link: ${paymobPaymentLink}` : `طريقة الدفع: Paymob\nلينك الدفع: ${paymobPaymentLink}`;
  }
  if (state.paymentMethod === "pickupCash") return t("pickupCashMessage");

  return t("instapayMessage");
}

function copyPaymentDetails() {
  const text = state.paymentMethod === "paymob" && paymobPaymentLink
    ? t("paymobCopy")
    : state.paymentMethod === "pickupCash"
    ? t("pickupCashCopy")
    : t("instapayCopy");

  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(t("copiedPayment")))
      .catch(() => showToast(fallbackCopy() ? t("copiedPayment") : t("copyPaymentFallback")));
    return;
  }

  showToast(fallbackCopy() ? t("copiedPayment") : t("copyPaymentFallback"));
}

function copyProductLink(productId) {
  const text = productShareUrl(productId);

  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(t("productLinkCopied")))
      .catch(() => showToast(fallbackCopy() ? t("productLinkCopied") : t("productLinkCopyFallback")));
    return;
  }

  showToast(fallbackCopy() ? t("productLinkCopied") : t("productLinkCopyFallback"));
}

async function startPaymobCheckout() {
  const items = checkoutCartPayload();
  if (!items.length) {
    showToast(t("cartEmptyToast"));
    return;
  }

  const customer = validateCheckoutCustomer({ requireConfirmed: true });
  if (!customer) return;
  if (state.checkoutBusy) return;

  state.checkoutBusy = true;
  renderCart();

  try {
    state.shipping = customer;
    const data = await createSecureOrder();
    window.location.href = data?.checkoutUrl || data?.paymentUrl || paymobPaymentLink;
  } catch (error) {
    console.warn("Paymob checkout failed, opening fallback payment link.", error);
    showToast(t("paymobCheckoutFailed"));
    window.location.href = paymobPaymentLink;
  } finally {
    state.checkoutBusy = false;
    renderCart();
  }
}

function renderCart() {
  renderPaymentDetails();
  renderDeliveryDetails();
  const entries = cartEntries();
  const rawCount = cartQuantityCount();
  const count = entries.length ? entries.reduce((sum, item) => sum + item.qty, 0) : !products.length ? rawCount : 0;
  const total = entries.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0);
  const hasUnpriced = entries.some((item) => item.price === null);
  const detailsReady = state.shippingConfirmed && state.shipping;
  const needsBostaShipping = detailsReady && state.shipping.deliveryMethod === "bosta";

  cartCount.textContent = count;
  if (cartTotalBox) cartTotalBox.classList.remove("locked");
  if (cartTotalLabel) cartTotalLabel.textContent = t("totalReadyLabel");
  if (cartTotal) cartTotal.textContent = hasUnpriced ? `${money(total)}${t("unpricedSuffix")}` : money(total);
  if (cartTotalNote) {
    cartTotalNote.textContent = detailsReady
      ? needsBostaShipping
        ? t("shippingPendingNote")
        : t("pickupNoShippingNote")
      : state.deliveryMethod === "bosta"
      ? t("shippingPendingNote")
      : t("pickupNoShippingNote");
  }

  if (!entries.length) {
    cartItems.innerHTML = `<div class="empty-state">${rawCount && !products.length ? t("cartLoading") : t("emptyCart")}</div>`;
    whatsappLink.setAttribute("href", "#");
    if (checkoutLabel) checkoutLabel.textContent = t("sendOrder");
    return;
  }

  cartItems.innerHTML = entries
    .map((item) => {
      const productName = localized(item.product.name);
      return `
        <article class="cart-item">
          <div>
            <h3>${escapeHtml(productName)}</h3>
            ${item.optionText ? `<p class="cart-variant">${escapeHtml(item.optionText)}</p>` : ""}
            <p>${money(item.price)} × ${formatter.format(item.qty)}</p>
          </div>
          <div class="qty-control" aria-label="${escapeHtml(t("quantityAdjustAria", { name: productName }))}">
            <button type="button" data-qty="${escapeHtml(item.key)}" data-delta="-1" aria-label="${t("decreaseQuantity")}">−</button>
            <span>${formatter.format(item.qty)}</span>
            <button type="button" data-qty="${escapeHtml(item.key)}" data-delta="1" aria-label="${t("increaseQuantity")}">+</button>
          </div>
        </article>
      `;
    })
    .join("");

  const orderLines = entries
    .map((item) => {
      const productName = localized(item.product.name);
      const priceText = item.price === null ? t("askPrice") : money(item.price);
      const selected = item.optionText ? ` (${item.optionText})` : "";
      return `- ${productName}${selected}: ${formatter.format(item.qty)} × ${priceText}`;
    })
    .join("\n");
  const message = isEnglish()
    ? `Hello, I would like to order the following products from Pope Kyrillos Store:\n${orderLines}\nProducts total: ${money(total)}\n${cartTotalNote?.textContent || ""}\n${shippingMessageLine()}\n${paymentMessageLine()}`
    : `مرحباً، أريد طلب المنتجات التالية من مكتبة البابا كيرلس:\n${orderLines}\nإجمالي المنتجات المسعرة: ${money(total)}\n${cartTotalNote?.textContent || ""}\n${shippingMessageLine()}\n${paymentMessageLine()}`;
  if (!detailsReady) {
    whatsappLink.href = "#";
    if (checkoutLabel) checkoutLabel.textContent = t("checkoutDetailsFirst");
    return;
  }
  if (state.paymentMethod === "paymob") {
    whatsappLink.href = paymobPaymentLink;
    if (checkoutLabel) checkoutLabel.textContent = state.checkoutBusy ? t("checkoutBusy") : t("paymobNow");
  } else {
    whatsappLink.href = orderWhatsappUrl(bostaReferenceLine(state.bosta.shipment));
    if (checkoutLabel) checkoutLabel.textContent = state.bosta.busy ? t("bostaCreating") : t("sendOrder");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function firebaseConfig() {
  return window.POPE_KYRILLOS_FIREBASE_CONFIG || {};
}

function hasFirebaseConfig() {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

async function ensureAuthServices() {
  if (state.auth.services?.auth) return true;
  if (!hasFirebaseConfig()) return false;

  if (!authInitPromise) {
    authInitPromise = initCustomerAuth();
  }

  try {
    await authInitPromise;
  } catch {
    return false;
  }
  return Boolean(state.auth.services?.auth);
}

function renderAuthState() {
  const user = state.auth.user;
  const configured = state.auth.configured;
  const displayName = user?.displayName || user?.email || (isEnglish() ? "Customer" : "عميل");

  if (accountLabel) accountLabel.textContent = user ? displayName.split(/\s+/)[0] : t("login");
  if (accountToggle) {
    accountToggle.setAttribute("aria-label", user ? (isEnglish() ? `Account ${displayName}` : `حساب ${displayName}`) : t("accountAria"));
  }

  if (accountUser) {
    accountUser.hidden = !user;
    accountUser.textContent = user ? t("accountUser", { name: displayName }) : "";
  }

  if (authProviderList) authProviderList.hidden = Boolean(user);
  if (authSignoutButton) authSignoutButton.hidden = !user;

  authProviderButtons.forEach((button) => {
    button.disabled = !configured || state.auth.loading;
  });
  emailAuthForm?.querySelectorAll("input, button").forEach((field) => {
    field.disabled = !configured || state.auth.loading;
  });

  if (!accountStatus) return;
  if (!configured) {
    accountStatus.textContent = t("accountLocalOnly");
  } else if (state.auth.loading) {
    accountStatus.textContent = t("accountLoading");
  } else if (user) {
    accountStatus.textContent = t("accountSaved");
  } else {
    accountStatus.textContent = t("accountStatus");
  }
}

function openAccountModal() {
  renderAuthState();
  accountModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("account-open");
  accountClose?.focus();
}

function closeAccountModal() {
  accountModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("account-open");
}

function saveCartNow({ remote = true } = {}) {
  state.cart = clampCartMap(state.cart);
  saveCartToLocal(currentCartStorageKey(), state.cart);
  if (remote) queueRemoteCartSave();
}

function queueRemoteCartSave() {
  if (!state.auth.user || !state.auth.services?.db) return;
  window.clearTimeout(state.auth.saveTimer);
  state.auth.saveTimer = window.setTimeout(saveRemoteCart, 350);
}

async function saveRemoteCart() {
  const services = state.auth.services;
  const user = state.auth.user;
  if (!services?.db || !user) return;

  try {
    await services.setDoc(
      services.doc(services.db, "customerCarts", user.uid),
      {
        items: cartPayloadFromMap(),
        updatedAt: services.serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("Could not save remote cart.", error);
  }
}

async function loadRemoteCart(user) {
  const services = state.auth.services;
  if (!services?.db || !user) return new Map();

  try {
    const snapshot = await services.getDoc(services.doc(services.db, "customerCarts", user.uid));
    if (!snapshot.exists()) return new Map();
    return cartMapFromPayload(snapshot.data().items || []);
  } catch (error) {
    console.warn("Could not load remote cart.", error);
    return new Map();
  }
}

async function applySignedInCart(user) {
  const guestCart = loadCartFromLocal(guestCartStorageKey);
  const userCartKey = `${userCartStoragePrefix}${user.uid}`;
  const userLocalCart = loadCartFromLocal(userCartKey);

  state.cart = mergeCartMaps(userLocalCart, guestCart);
  saveCartToLocal(userCartKey, state.cart);
  try {
    localStorage.removeItem(guestCartStorageKey);
  } catch {
    // Local storage cleanup is best-effort.
  }
  renderCart();

  const remoteCart = await loadRemoteCart(user);
  state.cart = mergeCartMaps(remoteCart, state.cart);
  saveCartToLocal(userCartKey, state.cart);
  renderCart();
  queueRemoteCartSave();
}

async function initCustomerAuth() {
  state.auth.configured = hasFirebaseConfig();
  renderAuthState();
  if (!state.auth.configured) return;

  state.auth.loading = true;
  renderAuthState();

  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-firestore.js`)
    ]);

    const app = appModule.initializeApp(firebaseConfig());
    const auth = authModule.getAuth(app);
    await authModule.setPersistence(auth, authModule.browserLocalPersistence);

    state.auth.services = {
      auth,
      db: firestoreModule.getFirestore(app),
      GoogleAuthProvider: authModule.GoogleAuthProvider,
      createUserWithEmailAndPassword: authModule.createUserWithEmailAndPassword,
      signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
      signInWithPopup: authModule.signInWithPopup,
      signInWithRedirect: authModule.signInWithRedirect,
      signOut: authModule.signOut,
      onAuthStateChanged: authModule.onAuthStateChanged,
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      setDoc: firestoreModule.setDoc,
      serverTimestamp: firestoreModule.serverTimestamp
    };

    state.auth.services.onAuthStateChanged(auth, async (user) => {
      state.auth.user = user;
      state.auth.loading = false;
      renderAuthState();
      if (user) {
        await applySignedInCart(user);
      } else {
        loadGuestCart();
        renderCart();
      }
    });
  } catch (error) {
    state.auth.loading = false;
    state.auth.configured = false;
    console.warn("Could not initialize Firebase auth.", error);
    renderAuthState();
  }
}

function authProvider(providerName) {
  const services = state.auth.services;
  if (!services) return null;
  if (providerName === "google") return new services.GoogleAuthProvider();
  return null;
}

async function signInWithProvider(providerName) {
  const ready = await ensureAuthServices();
  const services = state.auth.services;
  const provider = authProvider(providerName);
  if (!ready || !services || !provider) {
    showToast(hasFirebaseConfig() ? t("firebaseLoading") : t("firebaseRequired"));
    return;
  }

  try {
    state.auth.loading = true;
    renderAuthState();
    await services.signInWithPopup(services.auth, provider);
    closeAccountModal();
  } catch (error) {
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request") {
      await services.signInWithRedirect(services.auth, provider);
      return;
    }
    state.auth.loading = false;
    renderAuthState();
    console.warn("Sign in failed.", error);
    showToast(t("signinFailed"));
  }
}

function emailAuthValues() {
  const email = authEmailInput?.value.trim() || "";
  const password = authPasswordInput?.value || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
    showToast(t("emailAuthInvalid"));
    if (!email) authEmailInput?.focus();
    else authPasswordInput?.focus();
    return null;
  }
  return { email, password };
}

async function signInWithEmail() {
  const ready = await ensureAuthServices();
  const services = state.auth.services;
  const credentials = emailAuthValues();
  if (!ready || !services?.auth || !credentials) {
    if (!ready || !services?.auth) showToast(hasFirebaseConfig() ? t("firebaseLoading") : t("firebaseRequired"));
    return;
  }

  try {
    state.auth.loading = true;
    renderAuthState();
    await services.signInWithEmailAndPassword(services.auth, credentials.email, credentials.password);
    showToast(t("emailSigninSuccess"));
    closeAccountModal();
  } catch (error) {
    state.auth.loading = false;
    renderAuthState();
    console.warn("Email sign in failed.", error);
    showToast(t("signinFailed"));
  }
}

async function signUpWithEmail() {
  const ready = await ensureAuthServices();
  const services = state.auth.services;
  const credentials = emailAuthValues();
  if (!ready || !services?.auth || !credentials) {
    if (!ready || !services?.auth) showToast(hasFirebaseConfig() ? t("firebaseLoading") : t("firebaseRequired"));
    return;
  }

  try {
    state.auth.loading = true;
    renderAuthState();
    await services.createUserWithEmailAndPassword(services.auth, credentials.email, credentials.password);
    showToast(t("emailSignupSuccess"));
    closeAccountModal();
  } catch (error) {
    state.auth.loading = false;
    renderAuthState();
    console.warn("Email sign up failed.", error);
    showToast(t("signupFailed"));
  }
}

async function signOutCustomer() {
  const services = state.auth.services;
  if (!services?.auth) return;
  saveCartNow();
  await saveRemoteCart();
  await services.signOut(services.auth);
  closeAccountModal();
  showToast(t("signoutToast"));
}

function addToCart(productId, variantId = "", amount = 1) {
  const product = getProduct(productId);
  if (!product) return;

  const variant = variantId ? findVariant(product, variantId) : defaultVariant(product);
  if (!isVariantAvailable(variant)) {
    showToast(t("unavailableChoiceToast"));
    return;
  }

  const key = cartKey(product.id, variant?.id || "default");
  const currentQty = state.cart.get(key) || 0;
  const quantity = variantQuantity(variant);
  const requestedAmount = Math.max(1, Number(amount) || 1);
  const nextQty = currentQty + requestedAmount;
  if (quantity !== null && nextQty > quantity) {
    showToast(t("quantityLimitToast"));
    return;
  }

  state.cart.set(key, nextQty);
  state.bosta.shipment = null;
  renderCart();
  saveCartNow();
  const selected = variantOptionText(variant);
  showToast(t("addedToast", {
    count: formatter.format(requestedAmount),
    name: localized(product.name),
    option: selected ? ` - ${selected}` : ""
  }));
}

function changeQty(key, delta) {
  if (delta > 0) {
    const { productId, variantId } = parseCartKey(key);
    const product = getProduct(productId);
    const variant = product ? findVariant(product, variantId) : null;
    const quantity = variantQuantity(variant);
    if (quantity !== null && (state.cart.get(key) || 0) >= quantity) {
      showToast(t("quantityLimitToast"));
      return;
    }
  }

  const nextQty = (state.cart.get(key) || 0) + delta;
  if (nextQty <= 0) {
    state.cart.delete(key);
  } else {
    state.cart.set(key, nextQty);
  }
  state.bosta.shipment = null;
  renderCart();
  saveCartNow();
}

function openCart() {
  document.body.classList.add("cart-open");
  cartPanel.setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  cartPanel.setAttribute("aria-hidden", "true");
}

function openProductFromUrl() {
  const productId = productIdFromUrl();
  if (!productId) return false;
  const product = getProduct(productId);
  if (!product || !hasAvailableVariant(product)) return false;
  openProductModal(productId, { updateUrl: false });
  return true;
}

async function loadProducts() {
  try {
    const response = await fetch("products.json?v=incense-chat-20260607", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    products = await response.json();
  } catch (error) {
    console.warn("Could not load products.json, using fallback products.", error);
    products = fallbackProducts;
  }
  state.cart = clampCartMap(state.cart);
  saveCartToLocal(currentCartStorageKey(), state.cart);
  renderProducts();
  renderCart();
  openProductFromUrl();
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderProducts();
  });
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const thumb = event.target.closest("[data-gallery-image]");
  if (thumb) {
    const card = thumb.closest(".product-card");
    const mainImage = card?.querySelector("[data-main-image]");
    if (!mainImage) return;
    mainImage.src = thumb.dataset.galleryImage;
    card.querySelectorAll("[data-gallery-image]").forEach((button) => {
      const active = button === thumb;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    return;
  }

  const viewButton = event.target.closest("[data-view-product]");
  if (viewButton) {
    openProductModal(viewButton.dataset.viewProduct);
    return;
  }

  const button = event.target.closest("[data-add]");
  if (button) {
    addToCart(button.dataset.add);
    return;
  }

  if (event.target.closest(".product-details")) return;

  const card = event.target.closest("[data-card-product]");
  if (card) openProductModal(card.dataset.cardProduct);
});

productModal.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-product-modal-close]");
  if (closeButton) {
    closeProductModal();
    return;
  }

  const copyProductButton = event.target.closest("[data-copy-product-link]");
  if (copyProductButton) {
    copyProductLink(copyProductButton.dataset.copyProductLink);
    return;
  }

  const zoomButton = event.target.closest("[data-zoom-image]");
  if (zoomButton) {
    const image = zoomButton.dataset.zoomImage;
    if (zoomButton.dataset.modalImage) {
      state.modal.image = image;
      renderProductModal();
    }
    openImageLightbox(image, zoomButton.dataset.zoomAlt || "");
    return;
  }

  const imageButton = event.target.closest("[data-modal-image]");
  if (imageButton) {
    state.modal.image = imageButton.dataset.modalImage;
    renderProductModal();
    return;
  }

  const optionButton = event.target.closest("[data-option-name]");
  if (optionButton) {
    const product = getProduct(state.modal.productId);
    if (!product) return;
    state.modal.selectedOptions = {
      ...state.modal.selectedOptions,
      [optionButton.dataset.optionName]: optionButton.dataset.optionValue
    };
    const variant = normalizeModalSelection(product, optionButton.dataset.optionName);
    state.modal.image = variant?.image || state.modal.image;
    state.modal.quantity = 1;
    renderProductModal();
    return;
  }

  const quantityButton = event.target.closest("[data-modal-qty-action]");
  if (quantityButton) {
    const product = getProduct(state.modal.productId);
    if (!product) return;
    const variant = selectedModalVariant(product);
    const delta = quantityButton.dataset.modalQtyAction === "increase" ? 1 : -1;
    state.modal.quantity = clampModalQuantity(variant);
    state.modal.quantity = Math.max(1, state.modal.quantity + delta);
    state.modal.quantity = clampModalQuantity(variant);
    renderProductModal();
    return;
  }

  const addButton = event.target.closest("[data-modal-add]");
  if (addButton) {
    addToCart(addButton.dataset.modalAdd, addButton.dataset.modalVariant, addButton.dataset.modalQuantity);
    state.modal.quantity = 1;
    renderProductModal();
  }
});

imageLightbox.addEventListener("click", (event) => {
  if (event.target === imageLightbox || event.target.closest("[data-image-lightbox-close]")) {
    closeImageLightbox();
  }
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-qty]");
  if (!button) return;
  changeQty(button.dataset.qty, Number(button.dataset.delta));
});

paymentInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.paymentMethod = input.value;
    renderPaymentDetails();
    renderCart();
  });
});

deliveryInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.deliveryMethod = input.value;
    resetShippingConfirmation();
  });
});

checkoutFields?.addEventListener("input", (event) => {
  if (!event.target.matches("input, textarea, select")) return;
  if (state.shippingConfirmed) resetShippingConfirmation();
});

checkoutFields?.addEventListener("change", (event) => {
  if (!event.target.matches("input, textarea, select")) return;
  if (state.shippingConfirmed) resetShippingConfirmation();
});

confirmShippingButton?.addEventListener("click", confirmShippingDetails);

copyPaymentButton?.addEventListener("click", copyPaymentDetails);

languageToggle?.addEventListener("click", () => {
  state.language = isEnglish() ? "ar" : "en";
  localStorage.setItem(languageStorageKey, state.language);
  applyLanguage();
});

accountToggle?.addEventListener("click", openAccountModal);
accountClose?.addEventListener("click", closeAccountModal);
authProviderButtons.forEach((button) => {
  button.addEventListener("click", () => signInWithProvider(button.dataset.authProvider));
});
emailAuthForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  signInWithEmail();
});
emailSignupButton?.addEventListener("click", signUpWithEmail);
authSignoutButton?.addEventListener("click", signOutCustomer);

whatsappLink.addEventListener("click", async (event) => {
  event.preventDefault();
  if (!state.shippingConfirmed) {
    validateCheckoutCustomer({ requireConfirmed: true });
    return;
  }
  if (state.paymentMethod === "paymob") {
    startPaymobCheckout();
    return;
  }

  let orderLine = "";
  try {
    orderLine = orderReferenceLine(await createSecureOrder());
  } catch (error) {
    console.warn("Order save failed.", error);
    showToast(t("orderSaveFallback"));
  }

  let bostaLine = bostaReferenceLine(state.bosta.shipment);
  if (state.shipping?.deliveryMethod === "bosta" && !state.bosta.shipment && !state.bosta.busy) {
    state.bosta.busy = true;
    renderCart();
    showToast(t("bostaCreating"));
    try {
      state.bosta.shipment = await createBostaShipment();
      bostaLine = bostaReferenceLine(state.bosta.shipment);
      showToast(t("bostaCreated"));
    } catch (error) {
      console.warn("Bosta shipment creation failed.", error);
      showToast(t("bostaFallback"));
    } finally {
      state.bosta.busy = false;
      renderCart();
    }
  }

  window.open(orderWhatsappUrl([orderLine, bostaLine].filter(Boolean).join("\n")), "_blank", "noopener");
});

document.querySelector(".cart-toggle").addEventListener("click", openCart);
document.querySelector(".cart-close").addEventListener("click", closeCart);
scrim.addEventListener("click", () => {
  closeCart();
  closeProductModal();
  closeAccountModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (document.body.classList.contains("image-zoom-open")) {
      closeImageLightbox();
      return;
    }
    closeCart();
    closeProductModal();
    closeAccountModal();
  }
});

document.querySelector("[data-contact-form]").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = form.get("name");
  const phone = form.get("phone");
  const requestType = form.get("requestType");
  const message = form.get("message") || t("contactEmpty");
  const body = t("contactMessage", { name, phone, requestType, message });
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(body)}`, "_blank", "noopener");
});

window.addEventListener("scroll", () => {
  header.dataset.elevated = window.scrollY > 24 ? "true" : "false";
});

window.addEventListener("popstate", () => {
  const productId = productIdFromUrl();
  if (productId) {
    openProductFromUrl();
    return;
  }
  if (document.body.classList.contains("product-open")) {
    closeProductModal({ updateUrl: false });
  }
});

loadGuestCart();
applyLanguage();
authInitPromise = initCustomerAuth();
loadProducts();
