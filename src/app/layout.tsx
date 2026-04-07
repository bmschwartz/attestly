import "~/styles/globals.css";
import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";
import { PrivyProvider } from "~/app/_components/providers/privy-provider";
import { Navbar } from "~/app/_components/navbar";

export const metadata: Metadata = {
  title: "Attestly",
  description: "Create, share, and verify surveys on-chain",
  metadataBase: new URL("https://attest.ly"),
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    title: "Attestly",
    description: "Create, share, and verify surveys on-chain",
    url: "https://attest.ly",
    siteName: "Attestly",
    type: "website",
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="min-h-screen bg-gray-50">
        <PrivyProvider>
          <TRPCReactProvider>
            <Navbar />
            <main>{children}</main>
          </TRPCReactProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
