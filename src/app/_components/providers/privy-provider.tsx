"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { env } from "~/env";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <BasePrivyProvider
      appId={env.NEXT_PUBLIC_PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "apple", "email"],
        appearance: {
          theme: "light",
          accentColor: "#6366f1",
          logo: "/favicon.ico",
        },
        embeddedWallets: {
          createOnLogin: "all-users",
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
