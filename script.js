const whatsappNumber = "201016125589";
const paymobIntentionEndpointPath = "/api/create-paymob-intention";
const firebaseSdkVersion = "10.14.1";
const productBatchSize = 12;
const catalogVersion = Date.now().toString(36);
const guestCartStorageKey = "pope-kyrillos-cart:guest";
const userCartStoragePrefix = "pope-kyrillos-cart:user:";
const activeCartStorageKey = "pope-kyrillos-cart:active";
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
    copyText: "Paymob Checkout\nالدفع يتم من زر Paymob داخل السلة."
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
let productsAssetVersion = "";

const state = {
  filter: "all",
  labelFilter: "",
  search: "",
  priceFilter: "all",
  choicesOnly: false,
  sortFilter: "default",
  visibleProductCount: productBatchSize,
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
const loadMoreButton = document.querySelector("[data-load-more]");
const filterButtons = document.querySelectorAll("[data-filter]");
const searchInput = document.querySelector("#product-search");
const priceFilterSelect = document.querySelector("[data-price-filter]");
const choiceFilterInput = document.querySelector("[data-choice-filter]");
const sortFilterSelect = document.querySelector("[data-sort-filter]");
const resetCatalogFilters = document.querySelector("[data-reset-catalog-filters]");
const headerSearch = document.querySelector("[data-header-search]");
const searchToggle = document.querySelector("[data-search-toggle]");
const header = document.querySelector(".site-header");
const languageToggle = document.querySelector("[data-language-toggle]");
const languageLabel = document.querySelector("[data-language-label]");
const shopMenuToggle = document.querySelector("[data-shop-menu-toggle]");
const headerShopMenuToggle = document.querySelector("[data-header-shop-menu-toggle]");
const shopMenu = document.querySelector("[data-shop-menu]");
const shopMenuList = document.querySelector("[data-shop-menu-list]");
const shopMenuClose = document.querySelector("[data-shop-menu-close]");
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
const emailResetButton = document.querySelector("[data-email-reset]");
const cartPanel = document.querySelector("[data-cart-panel]");
const cartItems = document.querySelector("[data-cart-items]");
const cartCount = document.querySelector("[data-cart-count]");
const cartHover = document.querySelector("[data-cart-hover]");
const cartPreviewToggle = document.querySelector("[data-cart-preview-toggle]");
const miniCart = document.querySelector("[data-mini-cart]");
const miniCartItems = document.querySelector("[data-mini-cart-items]");
const miniCartTotal = document.querySelector("[data-mini-cart-total]");
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
    heroEyebrow: "أدوات كنسية، بخور وشموع، أيقونات، كتب طقسية، وهدايا خدمة",
    heroTitle: "مكتبة البابا كيرلس",
    heroLead: "أسسها الشماس الدياكون بولس ملاك عام 2001 م\nاطلب منتجاتك الكنسية أونلاين والدفع عند الاستلام متاح",
    shopNow: "تسوق الآن",
    shopMenuTitle: "اختار القسم",
    shopMenuSubtitle: "الأقسام الرئيسية والفرعية",
    shopMenuAll: "كل المنتجات",
    metricProducts: "منتج للخدمة",
    metricTime: "تجهيز الطلب",
    metricChurch: "كميات وأسعار خاصة",
    trustPaymentTitle: "طرق دفع مرنة",
    trustPaymentText: "دفع عند الاستلام أو أونلاين",
    trustChosenTitle: "منتجات مختارة",
    trustChosenText: "أدوات كنسية وكتب بأعلي جودة",
    trustGiftTitle: "تغليف مضمون",
    trustGiftText: "جاهز للهدايا والخدمة",
    trustShippingTitle: "استلام أو شحن",
    trustShippingText: "استلم من الفرع أو أطلبه أونلاين",
    categoriesEyebrow: "الأقسام",
    categoriesTitle: "لدينا كل ما تحتاج إليه الكنيسة",
    catalogEyebrow: "الكتالوج",
    catalogTitle: "منتجات مختارة للطلب",
    searchPlaceholder: "ابحث عن منتج",
    filterPriceLabel: "السعر",
    filterSortLabel: "الترتيب",
    choiceFilterLabel: "فيه اختيارات",
    resetFilters: "مسح الفلاتر",
    priceAll: "كل الأسعار",
    priceUnder1000: "أقل من 1000 ج.م",
    price1000to5000: "من 1000 لـ 5000 ج.م",
    priceOver5000: "أكثر من 5000 ج.م",
    sortDefault: "الأنسب",
    sortPriceAsc: "الأرخص أولاً",
    sortPriceDesc: "الأعلى سعراً",
    servicesEyebrow: "خدمات الكنائس",
    servicesTitle: "طلبات الكنائس والخدام",
    servicesText: "محتاج كمية كبيرة، هدايا اجتماع، كتب لمكتبة الكنيسة أو منتج بمواصفات خاصة؟ ابعت لنا التفاصيل وسنتواصل معك بعرض سعر وموعد التجهيز.",
    service1Number: "١",
    service1Title: "أرسل تفاصيل الطلب",
    service1Text: "حدد المنتجات والكميات والمناسبة والميزانية.",
    service2Number: "٢",
    service2Title: "استلم عرض السعر",
    service2Text: "نرسل لك السعر ومدة التجهيز وخيارات التوصيل.",
    service3Number: "٣",
    service3Title: "نجهز ونوصل",
    service3Text: "نبدأ تجهيز الطلب بعد التأكيد ونبلغك عند الشحن.",
    servicesQuoteCta: "اطلب عرض سعر الآن",
    servicesWhatsappCta: "تواصل معنا على واتساب",
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
    policiesTitle: "سياسات الاسترجاع والشحن والخصوصية",
    policiesIntro: "هذه السياسات متاحة بالعربية والإنجليزية لتوضيح شروط الاسترجاع والاستبدال، الشحن، الخصوصية، والتواصل.",
    policiesLinkText: "تقدر تراجع سياسات الاسترجاع والاستبدال والشحن والخصوصية والتواصل من هنا.",
    policiesLink: "عرض السياسات",
    policiesNavLabel: "روابط السياسات",
    policyReturns: "سياسة الاسترجاع والاستبدال",
    policyPrivacy: "سياسة الخصوصية",
    policyContact: "سياسة التواصل",
    policyShipping: "سياسة الشحن",
    cartEyebrow: "طلبك",
    cartTitle: "سلة المنتجات",
    miniCartEyebrow: "ملخص السلة",
    miniCartTitle: "اختيارات العميل",
    miniCartGoToCart: "اذهب للسلة",
    miniCartTotal: "الإجمالي",
    miniCartMore: "+ {count} منتج آخر",
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
    imageProtected: "الصور محمية من التحميل المباشر",
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
    emailReset: "تعيين أو استرجاع كلمة المرور",
    signOut: "تسجيل الخروج",
    checkoutBusy: "جاري فتح Paymob...",
    paymobNow: "ادفع Paymob الآن",
    unpricedSuffix: " + منتجات بسعر عند التواصل",
    instapayNote: "حوّل على رقم 01223515989 باسم مايكل نبيل ميلاد، وبعد التحويل ابعت صورة الإيصال على الواتساب.",
    instapayMessage: "طريقة الدفع: إنستاباي / تحويل بنكي على رقم 01223515989 باسم مايكل نبيل ميلاد. بعد التحويل سأرسل صورة الإيصال.",
    instapayCopy: "إنستاباي / تحويل بنكي\nرقم التحويل: 01223515989\nاسم الحساب: مايكل نبيل ميلاد",
    paymobNote: "سيتم فتح صفحة Paymob الرسمية لإتمام الدفع ببطاقة بنكية.",
    paymobCopy: "Paymob Checkout\nالدفع يتم من زر Paymob داخل السلة.",
    pickupCashNote: "سيتم تجهيز الأوردر أولا، وبعد التأكيد يمكنك الاستلام من الفرع والدفع كاش.",
    pickupCashMessage: "طريقة الاستلام والدفع: استلام من الفرع، والدفع كاش بعد تجهيز الأوردر والتأكيد.",
    pickupCashCopy: "استلام من الفرع\nالدفع: كاش بعد تجهيز الأوردر والتأكيد",
    copiedPayment: "تم نسخ بيانات الدفع",
    copyPaymentFallback: "انسخ بيانات الدفع من السلة",
    cartEmptyToast: "السلة فارغة حاليا",
    checkoutNameRequired: "اكتب اسم العميل قبل الدفع",
    checkoutPhoneRequired: "اكتب رقم موبايل صحيح قبل الدفع",
    checkoutEmailInvalid: "اكتب بريد إلكتروني صحيح أو سيبه فاضي",
    paymobCheckoutFailed: "تعذر فتح Paymob الآن. راجع بيانات الطلب وحاول مرة أخرى.",
    firebaseRequired: "تسجيل الدخول يحتاج إعداد Firebase أولا",
    firebaseLoading: "جاري تجهيز تسجيل الدخول، حاول مرة أخرى بعد لحظة",
    signinFailed: "تعذر تسجيل الدخول، راجع إعدادات Firebase",
    signupFailed: "تعذر إنشاء الحساب، تأكد من تفعيل Email/Password في Firebase",
    emailAuthInvalid: "اكتب بريد إلكتروني صحيح وكلمة مرور 6 أحرف على الأقل",
    authUserNotFound: "بيانات الدخول غير صحيحة. لو أول مرة اضغط إنشاء حساب، ولو الحساب موجود استخدم استرجاع كلمة المرور.",
    authWrongPassword: "كلمة المرور غير صحيحة.",
    authEmailInUse: "الإيميل ده عليه حساب بالفعل. اضغط دخول بدل إنشاء حساب.",
    authWeakPassword: "كلمة المرور ضعيفة. اكتب 6 أحرف على الأقل.",
    authUnauthorizedDomain: "دومين الموقع غير مضاف في Firebase Authorized domains.",
    authProviderDisabled: "فعّل Email/Password من Firebase Authentication.",
    emailSigninSuccess: "تم تسجيل الدخول",
    emailSignupSuccess: "تم إنشاء الحساب وتسجيل الدخول",
    emailResetSent: "تم إرسال رابط تعيين كلمة المرور على الإيميل",
    emailResetFailed: "تعذر إرسال رابط كلمة المرور. تأكد من كتابة الإيميل صح.",
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
    heroEyebrow: "Church tools, incense and candles, icons, liturgical books, and ministry gifts",
    heroTitle: "Pope Kyrillos Store",
    heroLead: "Founded by Deacon Boulos Malak in 2001\nOrder your church supplies online with cash on delivery available",
    shopNow: "Shop now",
    shopMenuTitle: "Choose a category",
    shopMenuSubtitle: "Main and subcategories",
    shopMenuAll: "All products",
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
    categoriesTitle: "Everything your church needs",
    catalogEyebrow: "Catalog",
    catalogTitle: "Selected products to order",
    searchPlaceholder: "Search products",
    filterPriceLabel: "Price",
    filterSortLabel: "Sort",
    choiceFilterLabel: "Has options",
    resetFilters: "Clear filters",
    priceAll: "All prices",
    priceUnder1000: "Under EGP 1,000",
    price1000to5000: "EGP 1,000 to 5,000",
    priceOver5000: "Over EGP 5,000",
    sortDefault: "Recommended",
    sortPriceAsc: "Lowest price first",
    sortPriceDesc: "Highest price first",
    servicesEyebrow: "Church services",
    servicesTitle: "Church and ministry requests",
    servicesText: "Need a large quantity, meeting gifts, books for a church library, or a custom product? Send us the details and we will reply with a quote and preparation time.",
    service1Number: "1",
    service1Title: "Send request details",
    service1Text: "Share products, quantities, occasion, and budget.",
    service2Number: "2",
    service2Title: "Receive a quote",
    service2Text: "We send price, preparation time, and delivery options.",
    service3Number: "3",
    service3Title: "Prepare and deliver",
    service3Text: "We start after confirmation and update you on shipping.",
    servicesQuoteCta: "Request a quote now",
    servicesWhatsappCta: "Contact us on WhatsApp",
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
    policiesTitle: "Return, shipping and privacy policies",
    policiesIntro: "These policies are available in Arabic and English for returns, exchanges, shipping, privacy, and contact information.",
    policiesLinkText: "Review return, exchange, shipping, privacy, and contact policies from here.",
    policiesLink: "View policies",
    policiesNavLabel: "Policy links",
    policyReturns: "Return and exchange policy",
    policyPrivacy: "Privacy policy",
    policyContact: "Contact policy",
    policyShipping: "Shipping policy",
    cartEyebrow: "Your order",
    cartTitle: "Product cart",
    miniCartEyebrow: "Cart summary",
    miniCartTitle: "Customer picks",
    miniCartGoToCart: "Go to cart",
    miniCartTotal: "Total",
    miniCartMore: "+ {count} more item(s)",
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
    imageProtected: "Images are protected from direct download",
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
    emailReset: "Set or reset password",
    signOut: "Sign out",
    checkoutBusy: "Opening Paymob...",
    paymobNow: "Pay with Paymob",
    unpricedSuffix: " + products priced on request",
    instapayNote: "Transfer to 01223515989 under the name Michael Nabil Milad, then send the receipt photo on WhatsApp.",
    instapayMessage: "Payment method: Instapay / bank transfer to 01223515989 under the name Michael Nabil Milad. I will send the receipt photo after transfer.",
    instapayCopy: "Instapay / bank transfer\nTransfer number: 01223515989\nAccount name: Michael Nabil Milad",
    paymobNote: "The official Paymob page will open to complete card payment.",
    paymobCopy: "Paymob Checkout\nUse the Paymob button inside the cart to pay securely.",
    pickupCashNote: "Your order will be prepared first. After confirmation, you can pick it up from the branch and pay cash.",
    pickupCashMessage: "Pickup and payment method: pickup from branch and cash payment after the order is prepared and confirmed.",
    pickupCashCopy: "Pickup from branch\nPayment: cash after the order is prepared and confirmed",
    copiedPayment: "Payment details copied",
    copyPaymentFallback: "Copy payment details from the cart",
    cartEmptyToast: "Your cart is empty",
    checkoutNameRequired: "Enter the customer name before payment",
    checkoutPhoneRequired: "Enter a valid mobile number before payment",
    checkoutEmailInvalid: "Enter a valid email or leave it empty",
    paymobCheckoutFailed: "Paymob checkout could not open. Check the order details and try again.",
    firebaseRequired: "Login needs Firebase setup first",
    firebaseLoading: "Preparing login. Try again in a moment",
    signinFailed: "Sign-in failed. Check Firebase settings",
    signupFailed: "Could not create the account. Make sure Email/Password is enabled in Firebase",
    emailAuthInvalid: "Enter a valid email and a password of at least 6 characters",
    authUserNotFound: "The sign-in details are not correct. Create an account first or reset the password.",
    authWrongPassword: "Incorrect password.",
    authEmailInUse: "This email already has an account. Sign in instead.",
    authWeakPassword: "Password is too weak. Use at least 6 characters.",
    authUnauthorizedDomain: "This domain is not added to Firebase Authorized domains.",
    authProviderDisabled: "Enable Email/Password in Firebase Authentication.",
    emailSigninSuccess: "Signed in",
    emailSignupSuccess: "Account created and signed in",
    emailResetSent: "Password reset link sent to your email",
    emailResetFailed: "Could not send the password reset link. Check the email address.",
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
  candles: { ar: ["شمع وبخور وأباركة", "شمع، فحم، أباركة، بخور"], en: ["Candles & incense", "Candles, charcoal, censers"] },
  vestments: { ar: ["تواني وأقمشة", "تواني، بطرشيلات، مفارش،"], en: ["Fabrics & altar cloths", "Stoles, altar cloths, embroidery"] },
  icons: { ar: ["صلبان وهدايا", "براويز، صلبان، تذكارات"], en: ["Icons & gifts", "Frames, crosses, keepsakes"] },
  brass: { ar: ["مستلزمات المذبح", "صلبان، شمعدانات، ذخائر"], en: ["Brassware", "Crosses, candlesticks, reliquaries"] }
};

const catalogCategoryOrder = ["brass", "candles", "vestments", "icons", "books"];
const catalogLabelOrder = {
  brass: ["صلبان زفة", "إبريق نحاس", "حُق ذخيرة", "مستلزمات المذبح", "نحاسيات", "دفوف وتريانتو", "شغل شحن"],
  candles: ["شمع وبخور وأباركة", "شموع وبخور"],
  vestments: ["بطرشيلات", "تواني وأقمشة", "أقمشة ومفارش"],
  icons: ["صلبان وهدايا", "أيقونات وهدايا"],
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
  "شمع وبخور وأباركة": "Candles, incense & ewers",
  "شموع وبخور": "Candles & incense",
  "صلبان وهدايا": "Crosses & gifts",
  "أيقونات وهدايا": "Icons & gifts",
  "مستلزمات المذبح": "Altar supplies",
  "نحاسيات": "Brassware",
  "بطرشيلات": "Stoles",
  "تواني وأقمشة": "Patens & fabrics",
  "أقمشة ومفارش": "Fabrics & altar cloths",
  "بطرشيل كنسي أحمر ذهبي - موديل 1": "Red and gold church stole - Model 1",
  "بطرشيل كنسي أحمر ذهبي - موديل 2": "Red and gold church stole - Model 2",
  "بطرشيل كنسي أحمر ذهبي - موديل 3": "Red and gold church stole - Model 3",
  "بطرشيل كنسي أحمر ذهبي - موديل 4": "Red and gold church stole - Model 4",
  "بطرشيل كنسي أحمر ذهبي بتصميم مطرز أنيق مناسب للخدمة والشمامسة. متاح بأطوال من 3.5 متر حتى 5 متر، ويمكن اختياره بزاوية أو بدون زاوية بنفس السعر.": "A red and gold embroidered church stole suitable for service and deacons. Available from 3.5 m to 5 m, with or without an angled finish at the same price.",
  "الحجم": "Size",
  "المقاس": "Size",
  "اللون": "Color",
  "الوزن": "Weight",
  "الطول": "Length",
  "التفصيل": "Finish",
  "3.5 متر": "3.5 m",
  "3.75 متر": "3.75 m",
  "4 متر": "4 m",
  "4.25 متر": "4.25 m",
  "4.5 متر": "4.5 m",
  "4.75 متر": "4.75 m",
  "5 متر": "5 m",
  "بزاوية": "Angled",
  "بدون زاوية": "Straight",
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

const arabicDigitMap = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9"
};

function toLatinDigits(value = "") {
  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => arabicDigitMap[digit] || digit);
}

function displayText(value = "") {
  const text = String(value);
  return isEnglish() ? toLatinDigits(text) : text;
}

function descriptionLines(description = "") {
  const normalized = displayText(description).replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const dimensionPattern = /(متاح\s+بأطوال|بأطوال|الأطوال|اطوال|أطوال|الطول|طول|المقاس|مقاس|الحجم|حجم|الأبعاد|ابعاد|عرض|ارتفاع|قطر|سم|متر|length|size|dimensions?|height|width|diameter|cm|meter|metre)/i;
  const sentences = normalized.match(/[^.!؟]+[.!؟]?/g) || [normalized];
  const lines = [];

  sentences.forEach((sentence) => {
    const clean = sentence.trim();
    if (!clean) return;

    const dimensionMatch = clean.match(dimensionPattern);
    if (dimensionMatch && dimensionMatch.index > 20) {
      const before = clean.slice(0, dimensionMatch.index).trim().replace(/[،,;:]+$/, "");
      const after = clean.slice(dimensionMatch.index).trim();
      if (before) {
        if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]} ${before}`.trim();
        else lines.push(before);
      }
      if (after) lines.push(after);
      return;
    }

    if (lines.length && dimensionPattern.test(clean)) {
      lines.push(clean);
    } else if (lines.length) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${clean}`.trim();
    } else {
      lines.push(clean);
    }
  });

  return lines;
}

function formatDescriptionHtml(description = "") {
  return descriptionLines(description)
    .map((line) => `<span>${escapeHtml(line)}</span>`)
    .join("");
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
  const label = document.createElement("span");
  label.className = "button-label";
  label.textContent = text;
  element.textContent = "";
  if (icon) element.append(icon);
  element.append(label);
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

function availableProducts() {
  return products.filter(hasAvailableVariant);
}

function orderedLabelsForCategory(category) {
  const labels = [...new Set(availableProducts().filter((product) => product.category === category).map((product) => product.label).filter(Boolean))];
  const preferred = catalogLabelOrder[category] || [];
  return labels.sort((first, second) => {
    const firstRank = rankFromList(preferred, first);
    const secondRank = rankFromList(preferred, second);
    if (firstRank !== secondRank) return firstRank - secondRank;
    return localized(first).localeCompare(localized(second), isEnglish() ? "en" : "ar");
  });
}

function updateFilterButtons() {
  filterButtons.forEach((item) => {
    const active = state.filter === "all"
      ? item.dataset.filter === "all" && !state.labelFilter
      : item.dataset.filter === state.filter;
    item.classList.toggle("active", active);
  });
}

function updateCatalogFilterText() {
  const textMap = {
    "[data-filter-price-label]": "filterPriceLabel",
    "[data-filter-sort-label]": "filterSortLabel",
    "[data-choice-filter-label]": "choiceFilterLabel",
    "[data-reset-catalog-filters]": "resetFilters",
    "[data-price-option='all']": "priceAll",
    "[data-price-option='under1000']": "priceUnder1000",
    "[data-price-option='1000to5000']": "price1000to5000",
    "[data-price-option='over5000']": "priceOver5000",
    "[data-sort-option='default']": "sortDefault",
    "[data-sort-option='priceAsc']": "sortPriceAsc",
    "[data-sort-option='priceDesc']": "sortPriceDesc"
  };

  Object.entries(textMap).forEach(([selector, key]) => {
    setText(selector, t(key));
  });
}

function renderShopMenu() {
  if (!shopMenuList) return;
  const categories = catalogCategoryOrder.filter((category) => availableProducts().some((product) => product.category === category));
  const allCount = availableProducts().length;
  const groups = categories
    .map((category) => {
      const copy = categoryCopy[category]?.[state.language] || [category, ""];
      const labels = orderedLabelsForCategory(category);
      const categoryCount = availableProducts().filter((product) => product.category === category).length;
      const labelButtons = labels
        .map((label) => {
          const labelCount = availableProducts().filter((product) => product.category === category && product.label === label).length;
          const active = state.filter === category && state.labelFilter === label;
          return `
            <button class="shop-subcategory ${active ? "active" : ""}" type="button" data-shop-category="${escapeHtml(category)}" data-shop-label="${escapeHtml(label)}">
              <span>${escapeHtml(localized(label))}</span>
              <small>${displayText(formatter.format(labelCount))}</small>
            </button>
          `;
        })
        .join("");
      const activeCategory = state.filter === category && !state.labelFilter;
      return `
        <section class="shop-menu-group">
          <button class="shop-category ${activeCategory ? "active" : ""}" type="button" data-shop-category="${escapeHtml(category)}">
            <span>
              <strong>${escapeHtml(copy[0])}</strong>
              <small>${escapeHtml(copy[1])}</small>
            </span>
            <em>${displayText(formatter.format(categoryCount))}</em>
          </button>
          ${labelButtons ? `<div class="shop-subcategories">${labelButtons}</div>` : ""}
        </section>
      `;
    })
    .join("");

  shopMenuList.innerHTML = `
    <button class="shop-category shop-category-all ${state.filter === "all" && !state.labelFilter ? "active" : ""}" type="button" data-shop-category="all">
      <span>
        <strong>${escapeHtml(t("shopMenuAll"))}</strong>
        <small>${escapeHtml(categoryCopy.all[state.language][1])}</small>
      </span>
      <em>${displayText(formatter.format(allCount))}</em>
    </button>
    ${groups}
  `;
}

function applyLanguage({ render = true } = {}) {
  document.documentElement.lang = t("htmlLang");
  document.documentElement.dir = t("dir");
  document.body.dir = t("dir");
  document.body.dataset.lang = state.language;
  formatter = new Intl.NumberFormat(isEnglish() ? "en-US-u-nu-latn" : "ar-EG");
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
  setText("[data-shop-menu-eyebrow]", t("navCategories"));
  setText("[data-shop-menu-title]", t("shopMenuTitle"));
  setText("[data-shop-menu-subtitle]", t("shopMenuSubtitle"));
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
  renderShopMenu();

  if (searchInput) searchInput.placeholder = t("searchPlaceholder");
  searchToggle?.setAttribute("aria-label", t("searchPlaceholder"));
  if (loadMoreButton) loadMoreButton.textContent = isEnglish() ? "Load more" : "عرض المزيد";
  updateCatalogFilterText();

  setText("#services .eyebrow", t("servicesEyebrow"));
  setText("#services-title", t("servicesTitle"));
  setText(".services-copy p:not(.eyebrow)", t("servicesText"));
  const serviceArticles = document.querySelectorAll(".service-list article");
  [
    ["service1Number", "service1Title", "service1Text"],
    ["service2Number", "service2Title", "service2Text"],
    ["service3Number", "service3Title", "service3Text"]
  ].forEach(([numberKey, titleKey, textKey], index) => {
    const article = serviceArticles[index];
    if (!article) return;
    const number = article.querySelector(".service-number");
    const title = article.querySelector("h3");
    const text = article.querySelector("p");
    if (number) number.textContent = t(numberKey);
    if (title) title.textContent = t(titleKey);
    if (text) text.textContent = t(textKey);
  });
  setText("[data-services-quote]", t("servicesQuoteCta"));
  setText("[data-services-whatsapp]", t("servicesWhatsappCta"));

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
  setText("[data-policies-link-text]", t("policiesLinkText"));
  setText("[data-policies-link]", t("policiesLink"));
  const policyFooterNav = document.querySelector("[data-policy-footer-nav-label]");
  if (policyFooterNav) policyFooterNav.setAttribute("aria-label", t("policiesNavLabel"));
  setText("[data-policy-footer-returns]", t("policyReturns"));
  setText("[data-policy-footer-privacy]", t("policyPrivacy"));
  setText("[data-policy-footer-contact]", t("policyContact"));
  setText("[data-policy-footer-shipping]", t("policyShipping"));

  setText(".cart-panel-head .eyebrow", t("cartEyebrow"));
  setText(".cart-panel-head h2", t("cartTitle"));
  setText("[data-mini-cart-eyebrow]", t("miniCartEyebrow"));
  setText("[data-mini-cart-title]", t("miniCartTitle"));
  setText("[data-mini-cart-page]", t("miniCartGoToCart"));
  setText("[data-mini-cart-total-label]", t("miniCartTotal"));
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
  if (emailResetButton) emailResetButton.textContent = t("emailReset");
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
  const formattedAmount = displayText(formatter.format(Number(amount)));
  return isEnglish() ? `EGP ${formattedAmount}` : `${formattedAmount} ج.م`;
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

function catalogFilterFromUrl() {
  const url = new URL(window.location.href);
  const category = url.searchParams.get("category") || "all";
  const validCategory = category === "all" || catalogCategoryOrder.includes(category) ? category : "all";
  return {
    category: validCategory,
    label: url.searchParams.get("label") || ""
  };
}

function categoryShareUrl(category = "all", label = "") {
  const url = new URL(window.location.href);
  url.searchParams.delete("product");
  url.searchParams.set("category", category || "all");
  if (label) url.searchParams.set("label", label);
  else url.searchParams.delete("label");
  url.hash = "catalog";
  return url.toString();
}

function setCatalogUrl(category = "all", label = "", { replace = false } = {}) {
  const nextUrl = categoryShareUrl(category, label);
  if (nextUrl === window.location.href) return;
  const stateData = { category, label };
  if (replace) window.history.replaceState(stateData, "", nextUrl);
  else window.history.pushState(stateData, "", nextUrl);
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

function compareFilteredProducts(first, second) {
  if (state.sortFilter === "price-asc" || state.sortFilter === "price-desc") {
    const firstPrice = productPriceRange(first.product).min ?? 999999999;
    const secondPrice = productPriceRange(second.product).min ?? 999999999;
    if (firstPrice !== secondPrice) {
      return state.sortFilter === "price-desc" ? secondPrice - firstPrice : firstPrice - secondPrice;
    }
  }

  return compareCatalogProducts(first, second);
}

function productPrice(product) {
  const value = Number(product.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function productPriceRange(product) {
  const prices = getProductVariants(product).map((variant) => variantPrice(variant, product)).filter((price) => price !== null);
  if (!prices.length) {
    const price = productPrice(product);
    return price === null ? { min: null, max: null } : { min: price, max: price };
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices)
  };
}

function matchesPriceFilter(product) {
  if (state.priceFilter === "all") return true;
  const { min, max } = productPriceRange(product);
  if (min === null || max === null) return false;

  if (state.priceFilter === "under-1000") return min < 1000;
  if (state.priceFilter === "1000-5000") return max >= 1000 && min <= 5000;
  if (state.priceFilter === "over-5000") return max > 5000;
  return true;
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

function uniqueImages(images = []) {
  return [...new Set(images.filter(Boolean))];
}

function getVariantImages(variant) {
  if (Array.isArray(variant?.images) && variant.images.length) return variant.images;
  if (variant?.image) return [variant.image];
  return [];
}

function productAssetVersion(product) {
  return product?.assetVersion || product?.updatedAt || productsAssetVersion;
}

function versionedAssetUrl(src = "", version = "") {
  const value = String(src || "");
  if (!value || /^(?:data|blob):/i.test(value) || !version) return value;
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.set("v", version);
  return `${path}?${params.toString()}${hash}`;
}

function productImageUrl(image, product) {
  return versionedAssetUrl(image, productAssetVersion(product));
}

function productDetailImageUrl(image, product) {
  return productImageUrl(productDetailImage(image), product);
}

function productDetailImage(image = "") {
  const value = String(image || "");
  if (!value) return "";
  if (value.startsWith("assets/optimized/products/")) {
    return value.replace(/^assets\/optimized\/products\//, "assets/detail/products/");
  }
  return value;
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
  if (quantity > 3) return t("available");
  return isEnglish() ? `Available - ${displayText(formatter.format(quantity))} pcs` : `متاح - ${formatter.format(quantity)} قطعة`;
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
    if (total > 3) return t("available");
    return isEnglish() ? `Available - ${displayText(formatter.format(total))} pcs` : `متاح - ${formatter.format(total)} قطعة`;
  }

  return t("available");
}

function variantOptionText(variant) {
  const options = Object.entries(variant?.options || {});
  return displayText(options.map(([name, value]) => `${localized(name)}: ${localized(value)}`).join(isEnglish() ? ", " : "، "));
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

function setActiveCartStorageKey(key = currentCartStorageKey()) {
  try {
    localStorage.setItem(activeCartStorageKey, key);
  } catch {
    // Local storage availability varies in private browsing.
  }
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
    setActiveCartStorageKey(key);
  } catch (error) {
    console.warn("Could not save cart locally.", error);
  }
}

function loadGuestCart() {
  state.cart = loadCartFromLocal(guestCartStorageKey);
  setActiveCartStorageKey(guestCartStorageKey);
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
      const matchesLabel = !state.labelFilter || product.label === state.labelFilter;
      const matchesChoices = !state.choicesOnly || hasProductChoices(product);
      const tags = Array.isArray(product.tags) ? product.tags.join(" ") : "";
      const text = `${product.name} ${product.label} ${localized(product.label)} ${product.description} ${tags} ${localized(tags)}`.toLowerCase();
      return matchesCategory && matchesLabel && matchesChoices && matchesPriceFilter(product) && (!query || text.includes(query));
    })
    .sort(compareFilteredProducts)
    .map(({ product }) => product);
}

function syncCatalogFilterControls() {
  if (priceFilterSelect) priceFilterSelect.value = state.priceFilter;
  if (choiceFilterInput) choiceFilterInput.checked = state.choicesOnly;
  if (sortFilterSelect) sortFilterSelect.value = state.sortFilter;
}

function renderProducts() {
  syncCatalogFilterControls();
  const filteredItems = getFilteredProducts();
  const items = filteredItems.slice(0, state.visibleProductCount);

  if (!items.length) {
    productGrid.innerHTML = `<div class="empty-state">${t("emptyProducts")}</div>`;
    if (loadMoreButton) loadMoreButton.hidden = true;
    return;
  }

  productGrid.innerHTML = items
    .map((product, cardIndex) => {
      const galleryImages = getProductImages(product);
      const hasImage = galleryImages.length > 0;
      const hasChoices = hasProductChoices(product);
      const isAvailable = hasAvailableVariant(product);
      const priceText = productPriceText(product);
      const stockText = productStockText(product);
      const productDisplayName = displayText(localized(product.name));
      const productName = escapeHtml(productDisplayName);
      const productId = escapeHtml(product.id);
      const actionLabel = !isAvailable ? t("unavailable") : hasChoices ? t("choose") : t("add");
      const actionAttribute = hasChoices ? `data-view-product="${productId}"` : `data-add="${productId}"`;
      const disabledAttribute = isAvailable ? "" : "disabled aria-disabled=\"true\"";
      const imageLoading = cardIndex === 0 ? "eager" : "lazy";
      const imagePriority = cardIndex === 0 ? " fetchpriority=\"high\"" : "";
      const thumbnails = galleryImages.length > 1
        ? `
          <div class="product-thumbs" aria-label="${escapeHtml(t("galleryLabel", { name: productDisplayName }))}">
            ${galleryImages
              .map(
                (image, index) => {
                  const displayImage = productImageUrl(image, product);
                  return `
                  <button
                    class="product-thumb ${index === 0 ? "active" : ""}"
                    type="button"
                    data-gallery="${productId}"
                    data-gallery-image="${escapeHtml(displayImage)}"
                    aria-label="${escapeHtml(t("showImageLabel", { index: displayText(formatter.format(index + 1)), name: productDisplayName }))}"
                    aria-pressed="${index === 0 ? "true" : "false"}"
                  >
                    <img src="${escapeHtml(displayImage)}" alt="" width="72" height="72" loading="lazy" decoding="async" draggable="false" />
                  </button>
                `;
                }
              )
              .join("")}
          </div>
        `
        : "";
      const visual = hasImage
        ? `
          <div class="product-gallery ${galleryImages.length > 1 ? "has-thumbs" : ""}">
            <div class="product-gallery-main">
              <img class="product-photo" data-main-image="${productId}" src="${escapeHtml(productImageUrl(galleryImages[0], product))}" alt="${productName}" width="800" height="800" loading="${imageLoading}" decoding="async"${imagePriority} draggable="false" />
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
            <button class="product-details" type="button" data-view-product="${productId}">
              <span>${t("detailsAndPrices")}</span>
            </button>
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

  if (loadMoreButton) {
    loadMoreButton.hidden = filteredItems.length <= state.visibleProductCount;
  }
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
  const variantImages = getVariantImages(variant);
  const variantImage = variant?.image || "";
  const activeImage = state.modal.image || variantImage || variantImages[0] || images[0] || "";
  const modalImages = uniqueImages([activeImage, ...variantImages, ...images]);
  const activeDetailImage = productDetailImageUrl(activeImage, product);
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
  const description = cleanDescription(displayText(localized(product.description || "")));
  const productDisplayName = displayText(localized(product.name));
  const productName = escapeHtml(productDisplayName);
  const shareUrl = productShareUrl(product.id);
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(t("productShareMessage", { name: productDisplayName, url: shareUrl }))}`;

  const media = activeImage
    ? `
      <button
        class="modal-photo-frame modal-photo-zoom"
        type="button"
        data-zoom-image="${escapeHtml(activeDetailImage)}"
        data-zoom-alt="${productName}"
        aria-label="${escapeHtml(t("zoomImageLabel", { name: productDisplayName }))}"
      >
        <img class="modal-product-photo" src="${escapeHtml(activeDetailImage)}" alt="${productName}" width="1400" height="1400" decoding="async" draggable="false" />
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
                      data-zoom-image="${escapeHtml(productDetailImageUrl(image, product))}"
                      data-zoom-alt="${productName}"
                      aria-label="${escapeHtml(t("showImageLabel", { index: displayText(formatter.format(index + 1)), name: productDisplayName }))}"
                      aria-pressed="${isActive ? "true" : "false"}"
                    >
                      <img src="${escapeHtml(productImageUrl(image, product))}" alt="" width="72" height="72" loading="lazy" decoding="async" draggable="false" />
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
      <p class="modal-description">${formatDescriptionHtml(description)}</p>
      ${optionGroups ? `<div class="variant-options">${optionGroups}</div>` : ""}
      <div class="variant-summary">
        <span>${t("currentPrice")}</span>
        <strong>${money(price)}</strong>
        <p>${optionText ? escapeHtml(displayText(localized(optionText))) : t("basicChoice")} · ${escapeHtml(displayText(variantStockText(variant)))}</p>
      </div>
      <div class="modal-quantity" aria-label="${t("modalQuantityAria")}">
        <div>
          <span>${t("modalQuantityLabel")}</span>
          <strong>${t("pieces", { count: displayText(formatter.format(modalQuantity)) })}</strong>
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
          <output>${displayText(formatter.format(modalQuantity))}</output>
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
        ${t("addToCart", { count: displayText(formatter.format(modalQuantity)) })}
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
  imageLightboxImage.src = productDetailImage(src);
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

function paymobIntentionEndpoint() {
  return window.POPE_KYRILLOS_API_CONFIG?.paymobIntentionEndpoint || paymobIntentionEndpointPath;
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
      const productName = displayText(localized(item.product.name));
      const priceText = item.price === null ? t("askPrice") : money(item.price);
      const selected = item.optionText ? ` (${item.optionText})` : "";
      return `- ${productName}${selected}: ${displayText(formatter.format(item.qty))} × ${priceText}`;
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

async function createPaymobIntention() {
  const endpoint = paymobIntentionEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders())
    },
    body: JSON.stringify({
      items: checkoutCartPayload(),
      customer: state.shipping,
      language: state.language
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error || !data.checkoutUrl) {
    throw new Error(data.error || data.message || "Paymob checkout failed");
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
      paymentNote.textContent = t("paymobNote");
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
  if (state.paymentMethod === "paymob") {
    return isEnglish() ? "Payment method: Paymob Checkout" : "طريقة الدفع: Paymob Checkout";
  }
  if (state.paymentMethod === "pickupCash") return t("pickupCashMessage");

  return t("instapayMessage");
}

function copyPaymentDetails() {
  const text = state.paymentMethod === "paymob"
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
    const data = await createPaymobIntention();
    window.location.href = data.checkoutUrl;
  } catch (error) {
    console.warn("Paymob checkout failed.", error);
    showToast(error.message || t("paymobCheckoutFailed"));
  } finally {
    state.checkoutBusy = false;
    renderCart();
  }
}

function setMiniCartOpen(open) {
  if (!miniCart) return;
  miniCart.setAttribute("aria-hidden", open ? "false" : "true");
  cartPreviewToggle?.setAttribute("aria-expanded", open ? "true" : "false");
}

function renderMiniCart(entries, total, rawCount, hasUnpriced) {
  if (!miniCartItems) return;

  if (miniCartTotal) {
    miniCartTotal.textContent = hasUnpriced ? `${money(total)}${t("unpricedSuffix")}` : money(total);
  }

  if (!entries.length) {
    miniCartItems.innerHTML = `<div class="mini-cart-empty">${rawCount && !products.length ? t("cartLoading") : t("emptyCart")}</div>`;
    return;
  }

  const previewItems = entries.slice(0, 4);
  const moreCount = Math.max(0, entries.length - previewItems.length);
  miniCartItems.innerHTML = `${previewItems
    .map((item) => {
      const productName = displayText(localized(item.product.name));
      const image = item.variant?.image || getVariantImages(item.variant)[0] || getProductImages(item.product)[0] || "";
      const imageUrl = image ? productImageUrl(image, item.product) : "";
      const thumb = imageUrl
        ? `<img class="mini-cart-thumb" src="${escapeHtml(imageUrl)}" alt="" width="108" height="108" loading="lazy" decoding="async" />`
        : `<span class="mini-cart-thumb mini-cart-thumb-empty" aria-hidden="true"></span>`;
      const qtyText = displayText(formatter.format(item.qty));
      const priceText = item.price === null ? t("askPrice") : money(item.price);
      return `
        <article class="mini-cart-item">
          ${thumb}
          <div>
            <strong>${escapeHtml(productName)}</strong>
            <small>${item.optionText ? `${escapeHtml(item.optionText)} · ` : ""}${qtyText} × ${priceText}</small>
          </div>
          <span class="mini-cart-price">${item.price === null ? t("askPrice") : money(item.price * item.qty)}</span>
        </article>
      `;
    })
    .join("")}${moreCount ? `<div class="mini-cart-more">${t("miniCartMore", { count: displayText(formatter.format(moreCount)) })}</div>` : ""}`;
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
  renderMiniCart(entries, total, rawCount, hasUnpriced);
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
      const productName = displayText(localized(item.product.name));
      return `
        <article class="cart-item">
          <div>
            <h3>${escapeHtml(productName)}</h3>
            ${item.optionText ? `<p class="cart-variant">${escapeHtml(item.optionText)}</p>` : ""}
            <p>${money(item.price)} × ${displayText(formatter.format(item.qty))}</p>
          </div>
          <div class="qty-control" aria-label="${escapeHtml(t("quantityAdjustAria", { name: productName }))}">
            <button type="button" data-qty="${escapeHtml(item.key)}" data-delta="-1" aria-label="${t("decreaseQuantity")}">−</button>
            <span>${displayText(formatter.format(item.qty))}</span>
            <button type="button" data-qty="${escapeHtml(item.key)}" data-delta="1" aria-label="${t("increaseQuantity")}">+</button>
          </div>
        </article>
      `;
    })
    .join("");

  const orderLines = entries
    .map((item) => {
      const productName = displayText(localized(item.product.name));
      const priceText = item.price === null ? t("askPrice") : money(item.price);
      const selected = item.optionText ? ` (${item.optionText})` : "";
      return `- ${productName}${selected}: ${displayText(formatter.format(item.qty))} × ${priceText}`;
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
    whatsappLink.href = "#";
    whatsappLink.classList.toggle("is-busy", state.checkoutBusy);
    whatsappLink.setAttribute("aria-busy", state.checkoutBusy ? "true" : "false");
    whatsappLink.setAttribute("aria-disabled", state.checkoutBusy ? "true" : "false");
    if (checkoutLabel) checkoutLabel.textContent = state.checkoutBusy ? t("checkoutBusy") : t("paymobNow");
  } else {
    whatsappLink.classList.remove("is-busy");
    whatsappLink.removeAttribute("aria-busy");
    whatsappLink.removeAttribute("aria-disabled");
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
  state.auth.configured = hasFirebaseConfig();
  renderAuthState();
  accountModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("account-open");
  accountClose?.focus();
  ensureAuthServices();
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
      sendPasswordResetEmail: authModule.sendPasswordResetEmail,
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

function authErrorMessage(error, fallbackKey = "signinFailed") {
  const code = error?.code || "";
  const messages = {
    "auth/user-not-found": "authUserNotFound",
    "auth/invalid-credential": "authUserNotFound",
    "auth/wrong-password": "authWrongPassword",
    "auth/email-already-in-use": "authEmailInUse",
    "auth/weak-password": "authWeakPassword",
    "auth/unauthorized-domain": "authUnauthorizedDomain",
    "auth/operation-not-allowed": "authProviderDisabled"
  };
  return t(messages[code] || fallbackKey);
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
    showToast(authErrorMessage(error, "signinFailed"));
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
    showToast(authErrorMessage(error, "signupFailed"));
  }
}

async function resetEmailPassword() {
  const ready = await ensureAuthServices();
  const services = state.auth.services;
  const email = authEmailInput?.value.trim() || "";

  if (!ready || !services?.auth) {
    showToast(hasFirebaseConfig() ? t("firebaseLoading") : t("firebaseRequired"));
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    authEmailInput?.focus();
    showToast(t("emailAuthInvalid"));
    return;
  }

  try {
    state.auth.loading = true;
    renderAuthState();
    await services.sendPasswordResetEmail(services.auth, email);
    showToast(t("emailResetSent"));
  } catch (error) {
    console.warn("Password reset failed.", error);
    showToast(authErrorMessage(error, "emailResetFailed"));
  } finally {
    state.auth.loading = false;
    renderAuthState();
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
    count: displayText(formatter.format(requestedAmount)),
    name: displayText(localized(product.name)),
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
  closeShopMenu();
  document.body.classList.add("cart-open");
  cartPanel.setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  cartPanel.setAttribute("aria-hidden", "true");
}

function setShopMenuExpanded(isExpanded) {
  const expandedValue = isExpanded ? "true" : "false";
  shopMenuToggle?.setAttribute("aria-expanded", expandedValue);
  headerShopMenuToggle?.setAttribute("aria-expanded", expandedValue);
}

function openShopMenu() {
  closeCart();
  closeProductModal();
  closeAccountModal();
  renderShopMenu();
  document.body.classList.add("shop-menu-open");
  shopMenu?.setAttribute("aria-hidden", "false");
  setShopMenuExpanded(true);
}

function closeShopMenu() {
  document.body.classList.remove("shop-menu-open");
  shopMenu?.setAttribute("aria-hidden", "true");
  setShopMenuExpanded(false);
}

function updateFloatingShopButton() {
  const shouldFloat = window.scrollY > 140;
  document.body.classList.toggle("shop-toggle-floating", shouldFloat);
}

function applyCatalogFilter(category = "all", label = "", { updateUrl = true, scroll = true, replaceUrl = false } = {}) {
  state.filter = category;
  state.labelFilter = label;
  state.visibleProductCount = productBatchSize;
  updateFilterButtons();
  renderProducts();
  renderShopMenu();
  closeShopMenu();
  if (updateUrl) setCatalogUrl(category, label, { replace: replaceUrl });
  if (scroll) document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyCatalogFilterFromUrl({ render = true, scroll = false } = {}) {
  const { category, label } = catalogFilterFromUrl();
  state.filter = category;
  state.labelFilter = label;
  state.visibleProductCount = productBatchSize;
  updateFilterButtons();
  if (render) {
    renderProducts();
    renderShopMenu();
  }
  if (scroll && window.location.hash === "#catalog") {
    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
  productsAssetVersion = String(Date.now());
  try {
    const response = await fetch(`products.json?v=${productsAssetVersion}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    products = await response.json();
  } catch (error) {
    console.warn("Could not load products.json, using fallback products.", error);
    products = fallbackProducts;
  }
  state.cart = clampCartMap(state.cart);
  saveCartToLocal(currentCartStorageKey(), state.cart);
  applyCatalogFilterFromUrl({ render: false });
  renderProducts();
  renderShopMenu();
  renderCart();
  openProductFromUrl();
}

function openHeaderSearch(focusInput = true) {
  headerSearch?.classList.add("is-open");
  searchToggle?.setAttribute("aria-expanded", "true");
  if (focusInput) searchInput?.focus();
}

function closeHeaderSearch(force = false) {
  if (!force && (searchInput?.value.trim() || document.activeElement === searchInput || document.activeElement === searchToggle)) return;
  headerSearch?.classList.remove("is-open");
  searchToggle?.setAttribute("aria-expanded", "false");
}

function isProtectedImageTarget(target) {
  return Boolean(
    target?.closest?.(
      ".product-gallery, .product-modal-media, .image-lightbox-stage, .product-photo, .modal-product-photo, .product-thumb img, .modal-thumb img"
    )
  );
}

document.addEventListener("contextmenu", (event) => {
  if (!isProtectedImageTarget(event.target)) return;
  event.preventDefault();
  showToast(t("imageProtected"));
});

document.addEventListener("dragstart", (event) => {
  if (!event.target.closest?.("img")) return;
  event.preventDefault();
});

document.addEventListener("copy", (event) => {
  if (!isProtectedImageTarget(event.target)) return;
  event.preventDefault();
  showToast(t("imageProtected"));
});

filterButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    applyCatalogFilter(button.dataset.filter || "all", "");
  });
});

searchToggle?.addEventListener("click", (event) => {
  event.preventDefault();
  openHeaderSearch(false);
  window.setTimeout(() => searchInput?.focus(), 0);
});

searchInput?.addEventListener("focus", () => openHeaderSearch(false));

searchInput?.addEventListener("input", (event) => {
  state.search = event.target.value;
  state.visibleProductCount = productBatchSize;
  renderProducts();
  if (state.search.trim()) openHeaderSearch(false);
});

priceFilterSelect?.addEventListener("change", (event) => {
  state.priceFilter = event.target.value || "all";
  state.visibleProductCount = productBatchSize;
  renderProducts();
});

choiceFilterInput?.addEventListener("change", (event) => {
  state.choicesOnly = event.target.checked;
  state.visibleProductCount = productBatchSize;
  renderProducts();
});

sortFilterSelect?.addEventListener("change", (event) => {
  state.sortFilter = event.target.value || "default";
  state.visibleProductCount = productBatchSize;
  renderProducts();
});

resetCatalogFilters?.addEventListener("click", () => {
  const currentCategory = state.filter || "all";
  const currentLabel = state.labelFilter || "";
  state.search = "";
  state.priceFilter = "all";
  state.choicesOnly = false;
  state.sortFilter = "default";
  state.visibleProductCount = productBatchSize;
  if (searchInput) searchInput.value = "";
  if (priceFilterSelect) priceFilterSelect.value = "all";
  if (choiceFilterInput) choiceFilterInput.checked = false;
  if (sortFilterSelect) sortFilterSelect.value = "default";
  closeHeaderSearch(true);
  renderProducts();
  renderShopMenu();
  setCatalogUrl(currentCategory, currentLabel, { replace: true });
});

loadMoreButton?.addEventListener("click", () => {
  state.visibleProductCount += productBatchSize;
  renderProducts();
});

document.addEventListener("click", (event) => {
  if (!headerSearch?.classList.contains("is-open")) return;
  if (headerSearch.contains(event.target)) return;
  closeHeaderSearch();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !headerSearch?.classList.contains("is-open")) return;
  searchInput?.blur();
  closeHeaderSearch(true);
});

shopMenuToggle?.addEventListener("click", openShopMenu);
headerShopMenuToggle?.addEventListener("click", openShopMenu);
shopMenuClose?.addEventListener("click", closeShopMenu);
shopMenuList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shop-category]");
  if (!button) return;
  applyCatalogFilter(button.dataset.shopCategory || "all", button.dataset.shopLabel || "");
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
  if (event.target === productModal) {
    closeProductModal();
    return;
  }

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
      state.modal.image = zoomButton.dataset.modalImage;
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
emailResetButton?.addEventListener("click", resetEmailPassword);
authSignoutButton?.addEventListener("click", signOutCustomer);

cartHover?.addEventListener("mouseenter", () => setMiniCartOpen(true));
cartHover?.addEventListener("mouseleave", () => setMiniCartOpen(false));
cartHover?.addEventListener("focusin", () => setMiniCartOpen(true));
cartHover?.addEventListener("focusout", (event) => {
  if (cartHover.contains(event.relatedTarget)) return;
  setMiniCartOpen(false);
});

whatsappLink.addEventListener("click", async (event) => {
  event.preventDefault();
  if (state.checkoutBusy || state.bosta.busy) return;
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

document.querySelector(".cart-toggle")?.addEventListener("click", openCart);
document.querySelector(".cart-close")?.addEventListener("click", closeCart);
scrim.addEventListener("click", () => {
  closeShopMenu();
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
    closeShopMenu();
    closeProductModal();
    closeAccountModal();
    setMiniCartOpen(false);
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
  updateFloatingShopButton();
});

window.addEventListener("popstate", () => {
  const productId = productIdFromUrl();
  if (productId) {
    openProductFromUrl();
    return;
  }
  applyCatalogFilterFromUrl({ render: true, scroll: true });
  if (document.body.classList.contains("product-open")) {
    closeProductModal({ updateUrl: false });
  }
});

loadGuestCart();
applyLanguage();
updateFloatingShopButton();
state.auth.configured = hasFirebaseConfig();
renderAuthState();
loadProducts();
