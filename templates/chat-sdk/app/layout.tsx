import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arcade Chat Bot",
  description: "Multi-platform chat bot powered by Arcade",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
