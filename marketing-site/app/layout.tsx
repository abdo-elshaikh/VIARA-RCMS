import type { Metadata } from "next";
import "./globals.css";
import "./modern.css";
import "./admin.css";
import "./polish.css";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "VIARA | طريقة أفضل لإدارة الرعاية",
  description: "تعرف على حلول VIARA لإدارة مراكز الأشعة والمراكز الطبية. استكشف الأنظمة والباقات واطلب عرضًا توضيحيًا يناسب احتياجات مركزك.",
  metadataBase: new URL("https://viara-healthcare.plus-0952.chatgpt.site"),
  openGraph: {
    title: "VIARA | أنظمة الأشعة والمراكز الطبية",
    description: "من أول موعد إلى آخر تقرير. اكتشف حلول إدارة الرعاية مع VIARA.",
    locale: "ar_EG", type: "website",
    images: [{ url: "/assets/viara-brand.png", width: 1536, height: 1024 }],
  },
  icons: {
    icon: "/assets/viara-symbol.png",
    shortcut: "/assets/viara-symbol.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = (await headers()).get("x-viara-locale") === "en" ? "en" : "ar";
  return (
    <html lang={locale} dir={locale === "en" ? "ltr" : "rtl"}>
      <head><link rel="preload" href={locale === "en" ? "/fonts/manrope-variable.ttf" : "/fonts/tajawal-regular.ttf"} as="font" type="font/ttf" crossOrigin="anonymous" /></head>
      <body>{children}</body>
    </html>
  );
}
