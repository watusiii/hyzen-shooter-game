import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D Game",
  description: "Simple 3D game with Three.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
