import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeProvider from "@/components/theme/ThemeProvider";

// Inline script that runs before React hydrates so the correct theme
// class is on <html> and there is no flash of light mode for users who
// have selected dark mode.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Peckham Coatings",
  description: "Field project management for Peckham Coatings crews",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Peckham Coatings",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-startup-image" href="/icon-512.png" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased h-full overflow-hidden">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
