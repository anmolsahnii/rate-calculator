import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rate Calculator",
  description:
    "Professional pallet freight rate calculator for warehouse and custom pickup lanes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
