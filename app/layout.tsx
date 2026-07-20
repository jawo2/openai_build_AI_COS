import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Otto | AI Chief of Staff for Creators",
  description:
    "Otto understands a creator's content, audience, sponsorships, and business, then recommends what to do next."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
