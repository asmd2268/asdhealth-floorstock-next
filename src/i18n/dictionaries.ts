import type { RoleId } from "@/domain/access/types";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export type Direction = "ltr" | "rtl";

export interface Dictionary {
  metadata: { title: string; description: string };
  brand: { productName: string; ownerText: string; clientDisplayName: string };
  shell: {
    openNavigation: string;
    closeNavigation: string;
    navigation: string;
    language: string;
    role: string;
    demoMode: string;
    hospitalContext: string;
  };
  languages: Record<Locale, string>;
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
  roles: Record<RoleId, string>;
}

const en: Dictionary = {
  metadata: {
    title: "ASDHealth Floor Stock",
    description: "A secure, multilingual foundation for hospital floor stock.",
  },
  brand: {
    productName: "ASDHealth Floor Stock",
    ownerText: "By Ali Abudahash",
    clientDisplayName: "ASDHealth",
  },
  shell: {
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
    navigation: "Main navigation",
    language: "Language",
    role: "Demo role",
    demoMode: "Foundation demo",
    hospitalContext: "Central Hospital",
  },
  languages: { en: "English", ar: "Arabic" },
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
  brand: {
    productName: "ASDHealth Floor Stock",
    ownerText: "By Ali Abudahash",
    clientDisplayName: "ASDHealth",
  },
  shell: {
    openNavigation: "فتح قائمة التنقل",
    closeNavigation: "إغلاق قائمة التنقل",
    navigation: "التنقل الرئيسي",
    language: "اللغة",
    role: "الدور التجريبي",
    demoMode: "نسخة تأسيسية تجريبية",
    hospitalContext: "المستشفى المركزي",
  },
  languages: { en: "الإنجليزية", ar: "العربية" },
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
