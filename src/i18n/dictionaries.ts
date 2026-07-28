import type { RoleId } from "@/domain/access/types";
import type {
  AdministrativeAction,
  ProvisioningAuditEvent,
} from "@/domain/provisioning/types";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export type Direction = "ltr" | "rtl";

export interface Dictionary {
  metadata: { title: string; description: string };
  shell: {
    openNavigation: string;
    closeNavigation: string;
    navigation: string;
    language: string;
    role: string;
    demoMode: string;
    authenticatedSession: string;
    facilityContext: string;
  };
  languages: Record<Locale, string>;
  facilitySwitcher: {
    label: string;
    switchAction: string;
    switching: string;
    error: string;
  };
  auth: {
    loadingTitle: string;
    loadingDescription: string;
    signedOutTitle: string;
    signedOutDescription: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    signIn: string;
    signingIn: string;
    signInUnavailable: string;
    emailInvalid: string;
    passwordRequired: string;
    invalidCredentials: string;
    tooManyAttempts: string;
    signInError: string;
    signOut: string;
    signingOut: string;
    signOutError: string;
    accessDeniedTitle: string;
    accessDeniedDescription: string;
    errorTitle: string;
    errorDescription: string;
  };
  dashboard: {
    eyebrow: string;
    title: string;
    description: string;
    availableModules: string;
    availableModulesDescription: string;
    emptyTitle: string;
    emptyDescription: string;
    foundationTitle: string;
    foundationDescription: string;
    secureTitle: string;
    secureDescription: string;
    multilingualTitle: string;
    multilingualDescription: string;
    scopedTitle: string;
    scopedDescription: string;
    openModule: string;
  };
  navigation: {
    dashboard: string;
    announcements: string;
    zebraLabels: string;
    newRequest: string;
    controlledMedicines: string;
  };
  modules: {
    announcementsDescription: string;
    zebraLabelsDescription: string;
    newRequestDescription: string;
    controlledMedicinesDescription: string;
  };
  administration: {
    title: string;
    subtitle: string;
    backToApp: string;
    language: string;
    overview: string;
    users: string;
    facilities: string;
    features: string;
    audit: string;
    accessDenied: string;
    unavailable: string;
    empty: string;
    tenant: string;
    scope: string;
    uid: string;
    organization: string;
    facility: string;
    facilitiesLabel: string;
    activeFacility: string;
    accountStatus: string;
    active: string;
    disabled: string;
    pending: string;
    suspended: string;
    details: string;
    roles: string;
    role: string;
    assignmentScope: string;
    assign: string;
    revoke: string;
    membership: string;
    save: string;
    saving: string;
    activate: string;
    deactivate: string;
    confirmDeactivate: string;
    cancel: string;
    facilityId: string;
    displayName: string;
    createOrUpdate: string;
    enabled: string;
    disabledFlag: string;
    replaceFeatures: string;
    event: string;
    actor: string;
    target: string;
    timestamp: string;
    next: string;
    success: string;
    mutationError: string;
    dashboardDescription: string;
    usersDescription: string;
    facilitiesDescription: string;
    featuresDescription: string;
    auditDescription: string;
    platformOwner: string;
    unrestrictedAdmin: string;
    restrictedAdmin: string;
    actions: Record<AdministrativeAction, string>;
    targetTypes: Record<ProvisioningAuditEvent["targetType"], string>;
  };
  roles: Record<RoleId, string>;
}

const en: Dictionary = {
  metadata: {
    title: "ASDHealth Floor Stock",
    description: "A secure, multilingual foundation for hospital floor stock.",
  },
  shell: {
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
    navigation: "Main navigation",
    language: "Language",
    role: "Demo role",
    demoMode: "Foundation demo",
    authenticatedSession: "Authenticated session",
    facilityContext: "Active facility",
  },
  languages: { en: "English", ar: "Arabic" },
  facilitySwitcher: {
    label: "Facility",
    switchAction: "Switch",
    switching: "Switching…",
    error:
      "The change could not be confirmed. Refresh the page before trying again.",
  },
  auth: {
    loadingTitle: "Preparing your secure workspace",
    loadingDescription: "Your identity and access scope are being verified.",
    signedOutTitle: "Sign in to continue",
    signedOutDescription: "Use your organization account to continue.",
    emailLabel: "Email address",
    emailPlaceholder: "name@organization.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signInUnavailable: "Authentication connection is not enabled yet.",
    emailInvalid: "Enter a valid email address.",
    passwordRequired: "Enter your password.",
    invalidCredentials: "Email or password is incorrect.",
    tooManyAttempts: "Too many attempts. Please try again later.",
    signInError: "Sign-in is unavailable. Please try again later.",
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutError: "Sign-out failed. Please try again.",
    accessDeniedTitle: "Access denied",
    accessDeniedDescription:
      "Your account does not have a valid tenant, facility, or role assignment.",
    errorTitle: "Authentication unavailable",
    errorDescription:
      "The authentication service could not be reached. Please try again later.",
  },
  dashboard: {
    eyebrow: "Platform foundation",
    title: "Welcome to your floor stock workspace",
    description:
      "A focused starting point for safe, role-aware hospital inventory operations.",
    availableModules: "Available modules",
    availableModulesDescription:
      "Visibility is resolved centrally from role, scope, and feature settings.",
    emptyTitle: "No modules are available for this role",
    emptyDescription:
      "This is expected when the selected role has no default feature access.",
    foundationTitle: "Built for modular growth",
    foundationDescription:
      "Tenant, facility, identity, and service boundaries are ready for future workflows.",
    secureTitle: "Deny by default",
    secureDescription:
      "Every module is checked against permissions, facility scope, and feature flags.",
    multilingualTitle: "Arabic and English",
    multilingualDescription:
      "The interface changes language, reading direction, and alignment together.",
    scopedTitle: "Facility aware",
    scopedDescription:
      "The demo uses one hospital while preserving multi-hospital architecture.",
    openModule: "Open module",
  },
  navigation: {
    dashboard: "Dashboard",
    announcements: "Announcements",
    zebraLabels: "Zebra labels",
    newRequest: "New request",
    controlledMedicines: "Controlled medicines",
  },
  modules: {
    announcementsDescription:
      "View pharmacy announcements and operational notices.",
    zebraLabelsDescription: "Access the Zebra label printing workspace.",
    newRequestDescription: "Create a new department floor stock request.",
    controlledMedicinesDescription:
      "Controlled medicines permission foundation.",
  },
  administration: {
    title: "Trusted administration",
    subtitle: "Tenant-scoped operations with server-verified authority",
    backToApp: "Back to application",
    language: "Language",
    overview: "Overview",
    users: "Users",
    facilities: "Facilities",
    features: "Feature flags",
    audit: "Audit",
    accessDenied: "Administration access is not available for this account.",
    unavailable: "Trusted administration data is temporarily unavailable.",
    empty: "No records are available in your permitted scope.",
    tenant: "Tenant",
    scope: "Administrative scope",
    uid: "User ID",
    organization: "Organization",
    facility: "Facility",
    facilitiesLabel: "Facility memberships",
    activeFacility: "Active facility",
    accountStatus: "Account status",
    active: "Active",
    disabled: "Disabled",
    pending: "Pending",
    suspended: "Suspended",
    details: "View details",
    roles: "Role assignments",
    role: "Role",
    assignmentScope: "Assignment scope",
    assign: "Assign role",
    revoke: "Revoke",
    membership: "Membership scope",
    save: "Save changes",
    saving: "Saving…",
    activate: "Activate account",
    deactivate: "Deactivate account",
    confirmDeactivate: "Confirm account deactivation",
    cancel: "Cancel",
    facilityId: "Facility ID",
    displayName: "Display name",
    createOrUpdate: "Create or update facility",
    enabled: "Enabled",
    disabledFlag: "Disabled",
    replaceFeatures: "Replace feature flags",
    event: "Action",
    actor: "Actor",
    target: "Target",
    timestamp: "Timestamp",
    next: "Next page",
    success: "The trusted change was confirmed.",
    mutationError: "The change could not be completed.",
    dashboardDescription:
      "Manage users, facilities, tenant features, and review audited changes.",
    usersDescription:
      "A bounded directory filtered to your trusted administrative scope.",
    facilitiesDescription:
      "Manage facilities only within your current trusted scope.",
    featuresDescription: "Replace the complete tenant feature configuration.",
    auditDescription:
      "Read-only, bounded provisioning activity in your permitted scope.",
    platformOwner: "Platform owner",
    unrestrictedAdmin: "Unrestricted tenant administrator",
    restrictedAdmin: "Restricted tenant administrator",
    actions: {
      create_tenant: "Create tenant",
      upsert_facility: "Create or update facility",
      upsert_user_profile: "Update user profile",
      set_account_status: "Change account status",
      assign_role: "Assign role",
      revoke_role_assignment: "Revoke role assignment",
      replace_feature_flags: "Replace feature flags",
    },
    targetTypes: {
      tenant: "Tenant",
      facility: "Facility",
      user_profile: "User profile",
      account: "Account",
      role_assignment: "Role assignment",
      feature_flags: "Feature flags",
    },
  },
  roles: {
    master: "Master",
    pharmacy_manager: "Pharmacy Manager",
    pharmacy_supervisor: "Internal Pharmacy Supervisor",
    pharmacy_staff: "Pharmacy Staff",
    controlled_drugs_officer: "Pharmacy Controlled Drugs Officer",
    warehouse_manager: "Warehouse Manager",
    department_user: "Department User",
    external_pharmacy_supervisor: "External Pharmacy Supervisor",
  },
};

const ar: Dictionary = {
  metadata: {
    title: "ASDHealth Floor Stock",
    description: "أساس آمن ومتعدد اللغات لمخزون أقسام المستشفى.",
  },
  shell: {
    openNavigation: "فتح قائمة التنقل",
    closeNavigation: "إغلاق قائمة التنقل",
    navigation: "التنقل الرئيسي",
    language: "اللغة",
    role: "الدور التجريبي",
    demoMode: "نسخة تأسيسية تجريبية",
    authenticatedSession: "جلسة موثقة",
    facilityContext: "المنشأة النشطة",
  },
  languages: { en: "الإنجليزية", ar: "العربية" },
  facilitySwitcher: {
    label: "المنشأة",
    switchAction: "تبديل",
    switching: "جارٍ التبديل…",
    error: "تعذر تأكيد تغيير المنشأة. حدّث الصفحة قبل المحاولة مرة أخرى.",
  },
  auth: {
    loadingTitle: "جارٍ تجهيز مساحة العمل الآمنة",
    loadingDescription: "يتم التحقق من هويتك ونطاق صلاحياتك.",
    signedOutTitle: "سجّل الدخول للمتابعة",
    signedOutDescription: "استخدم حساب منشأتك للمتابعة.",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "name@organization.com",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول…",
    signInUnavailable: "ربط خدمة المصادقة غير مفعّل حاليًا.",
    emailInvalid: "أدخل بريدًا إلكترونيًا صالحًا.",
    passwordRequired: "أدخل كلمة المرور.",
    invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    tooManyAttempts: "محاولات كثيرة جدًا. يرجى المحاولة لاحقًا.",
    signInError: "تسجيل الدخول غير متاح. يرجى المحاولة لاحقًا.",
    signOut: "تسجيل الخروج",
    signingOut: "جارٍ تسجيل الخروج…",
    signOutError: "تعذر تسجيل الخروج. يرجى المحاولة مرة أخرى.",
    accessDeniedTitle: "تم رفض الوصول",
    accessDeniedDescription:
      "لا يملك حسابك ارتباطًا صالحًا بالمستأجر أو المنشأة أو الدور.",
    errorTitle: "خدمة المصادقة غير متاحة",
    errorDescription:
      "تعذر الوصول إلى خدمة المصادقة. يرجى المحاولة مرة أخرى لاحقًا.",
  },
  dashboard: {
    eyebrow: "أساس المنصة",
    title: "مرحبًا بك في مساحة عمل مخزون الأقسام",
    description:
      "نقطة انطلاق مركزة لعمليات مخزون المستشفى الآمنة والمبنية على الصلاحيات.",
    availableModules: "الوحدات المتاحة",
    availableModulesDescription:
      "يتم تحديد الظهور مركزيًا بناءً على الدور والنطاق وإعدادات الميزات.",
    emptyTitle: "لا توجد وحدات متاحة لهذا الدور",
    emptyDescription:
      "هذا متوقع عندما لا يملك الدور المحدد صلاحية افتراضية لأي ميزة.",
    foundationTitle: "مصمم للنمو المعياري",
    foundationDescription:
      "حدود المستأجر والمنشأة والهوية والخدمات جاهزة لمسارات العمل المستقبلية.",
    secureTitle: "المنع هو الإعداد الافتراضي",
    secureDescription:
      "تُفحص كل وحدة وفق الصلاحيات ونطاق المنشأة وعلامات الميزات.",
    multilingualTitle: "العربية والإنجليزية",
    multilingualDescription: "تتغير لغة الواجهة واتجاه القراءة والمحاذاة معًا.",
    scopedTitle: "مدرك لنطاق المنشأة",
    scopedDescription:
      "يستخدم العرض مستشفى واحدًا مع الحفاظ على بنية متعددة المستشفيات.",
    openModule: "فتح الوحدة",
  },
  navigation: {
    dashboard: "لوحة المعلومات",
    announcements: "الإعلانات",
    zebraLabels: "ملصقات زيبرا",
    newRequest: "طلب جديد",
    controlledMedicines: "الأدوية المخدرة والمقيدة",
  },
  modules: {
    announcementsDescription: "عرض إعلانات الصيدلية والتنبيهات التشغيلية.",
    zebraLabelsDescription: "الوصول إلى مساحة طباعة ملصقات زيبرا.",
    newRequestDescription: "إنشاء طلب جديد لمخزون القسم.",
    controlledMedicinesDescription: "أساس صلاحيات الأدوية المخدرة والمقيدة.",
  },
  administration: {
    title: "الإدارة الموثوقة",
    subtitle: "عمليات ضمن نطاق المستأجر بصلاحيات متحقق منها على الخادم",
    backToApp: "العودة إلى التطبيق",
    language: "اللغة",
    overview: "نظرة عامة",
    users: "المستخدمون",
    facilities: "المنشآت",
    features: "علامات الميزات",
    audit: "سجل التدقيق",
    accessDenied: "الوصول إلى الإدارة غير متاح لهذا الحساب.",
    unavailable: "بيانات الإدارة الموثوقة غير متاحة مؤقتًا.",
    empty: "لا توجد سجلات متاحة ضمن نطاقك المسموح.",
    tenant: "المستأجر",
    scope: "نطاق الإدارة",
    uid: "معرف المستخدم",
    organization: "المنظمة",
    facility: "المنشأة",
    facilitiesLabel: "عضويات المنشآت",
    activeFacility: "المنشأة النشطة",
    accountStatus: "حالة الحساب",
    active: "نشط",
    disabled: "معطل",
    pending: "قيد الانتظار",
    suspended: "موقوف",
    details: "عرض التفاصيل",
    roles: "تعيينات الأدوار",
    role: "الدور",
    assignmentScope: "نطاق التعيين",
    assign: "تعيين دور",
    revoke: "إلغاء التعيين",
    membership: "نطاق العضوية",
    save: "حفظ التغييرات",
    saving: "جارٍ الحفظ…",
    activate: "تنشيط الحساب",
    deactivate: "تعطيل الحساب",
    confirmDeactivate: "تأكيد تعطيل الحساب",
    cancel: "إلغاء",
    facilityId: "معرف المنشأة",
    displayName: "اسم العرض",
    createOrUpdate: "إنشاء المنشأة أو تحديثها",
    enabled: "مفعلة",
    disabledFlag: "معطلة",
    replaceFeatures: "استبدال علامات الميزات",
    event: "الإجراء",
    actor: "المنفذ",
    target: "الهدف",
    timestamp: "الوقت",
    next: "الصفحة التالية",
    success: "تم تأكيد التغيير الموثوق.",
    mutationError: "تعذر إتمام التغيير.",
    dashboardDescription:
      "إدارة المستخدمين والمنشآت وميزات المستأجر ومراجعة التغييرات المدققة.",
    usersDescription: "دليل محدود ومصفّى حسب نطاقك الإداري الموثوق.",
    facilitiesDescription: "إدارة المنشآت ضمن نطاقك الموثوق الحالي فقط.",
    featuresDescription: "استبدال إعداد ميزات المستأجر بالكامل.",
    auditDescription: "نشاط تزويد للقراءة فقط ومحدود ضمن نطاقك المسموح.",
    platformOwner: "مالك المنصة",
    unrestrictedAdmin: "مسؤول مستأجر غير مقيد",
    restrictedAdmin: "مسؤول مستأجر مقيد",
    actions: {
      create_tenant: "إنشاء مستأجر",
      upsert_facility: "إنشاء منشأة أو تحديثها",
      upsert_user_profile: "تحديث ملف المستخدم",
      set_account_status: "تغيير حالة الحساب",
      assign_role: "تعيين دور",
      revoke_role_assignment: "إلغاء تعيين دور",
      replace_feature_flags: "استبدال علامات الميزات",
    },
    targetTypes: {
      tenant: "المستأجر",
      facility: "المنشأة",
      user_profile: "ملف المستخدم",
      account: "الحساب",
      role_assignment: "تعيين الدور",
      feature_flags: "علامات الميزات",
    },
  },
  roles: {
    master: "Master",
    pharmacy_manager: "مدير الصيدلية",
    pharmacy_supervisor: "مشرف الصيدلية الداخلية",
    pharmacy_staff: "موظف الصيدلية",
    controlled_drugs_officer: "مسؤول الأدوية المخدرة/المقيدة بالصيدلية",
    warehouse_manager: "مسؤول المستودع",
    department_user: "مستخدم القسم",
    external_pharmacy_supervisor: "مشرف الصيدلية الخارجية",
  },
};

export const dictionaries: Readonly<Record<Locale, Dictionary>> = { en, ar };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function getDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}
