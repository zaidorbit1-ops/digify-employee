import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth/auth-provider";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Super Admin | Employee Management",
  description: "Employee attendance dashboard for ZKTeco K60 devices",
  applicationName: "Digify Employee Management",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.png?v=2", type: "image/png" }],
    apple: [{ url: "/favicon.png?v=2", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Digify",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#241b19",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <PwaRegister />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
