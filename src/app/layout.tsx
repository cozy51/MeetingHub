import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Meeting Hub", description: "会議とタスクをひとつの場所に" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
