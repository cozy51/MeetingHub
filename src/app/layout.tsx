import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Meeting Hub", description: "会議とタスクをひとつの場所に", applicationName: "Meeting Hub" };
export const viewport: Viewport = { themeColor: "#2359d6" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
