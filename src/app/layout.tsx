import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Epoxy PM",
  description: "Field project management for epoxy contracting crews",
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
