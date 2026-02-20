import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peckham Coatings",
  description: "Field project management for Peckham Coatings crews",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
