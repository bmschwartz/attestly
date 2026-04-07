"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function getUserInitial(user: ReturnType<typeof usePrivy>["user"]): string {
  if (!user) return "?";

  // Try to get from linked accounts
  const googleAccount = user.linkedAccounts?.find(
    (a) => a.type === "google_oauth",
  );
  if (googleAccount && "name" in googleAccount && googleAccount.name) {
    return (googleAccount.name).charAt(0).toUpperCase();
  }

  const emailAccount = user.linkedAccounts?.find((a) => a.type === "email");
  if (emailAccount && "address" in emailAccount && emailAccount.address) {
    return (emailAccount.address).charAt(0).toUpperCase();
  }

  if (user.email?.address) {
    return user.email.address.charAt(0).toUpperCase();
  }

  return "U";
}

function getDisplayName(user: ReturnType<typeof usePrivy>["user"]): string {
  if (!user) return "User";

  const googleAccount = user.linkedAccounts?.find(
    (a) => a.type === "google_oauth",
  );
  if (googleAccount && "name" in googleAccount && googleAccount.name) {
    return googleAccount.name;
  }

  const emailAccount = user.linkedAccounts?.find((a) => a.type === "email");
  if (emailAccount && "address" in emailAccount && emailAccount.address) {
    return emailAccount.address;
  }

  if (user.email?.address) {
    return user.email.address;
  }

  return "User";
}

function getEmail(user: ReturnType<typeof usePrivy>["user"]): string | null {
  if (!user) return null;

  const googleAccount = user.linkedAccounts?.find(
    (a) => a.type === "google_oauth",
  );
  if (googleAccount && "email" in googleAccount && googleAccount.email) {
    return googleAccount.email;
  }

  const emailAccount = user.linkedAccounts?.find((a) => a.type === "email");
  if (emailAccount && "address" in emailAccount && emailAccount.address) {
    return emailAccount.address;
  }

  if (user.email?.address) {
    return user.email.address;
  }

  return null;
}

export function Navbar() {
  const { ready, authenticated, user, logout } = usePrivy();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Minimal navbar for survey respond route
  const isRespondRoute = /^\/s\/[^/]+\/respond(\/|$)/.test(pathname);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navLinkClass = (href: string) =>
    `text-sm font-medium transition-colors ${
      isActive(href)
        ? "text-gray-900"
        : "text-gray-500 hover:text-gray-900"
    }`;

  if (isRespondRoute) {
    return (
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center">
            <Link href="/" className="text-lg font-bold text-gray-900">
              Attestly
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Left side */}
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-gray-900">
              Attestly
            </Link>
            <Link href="/explore" className={navLinkClass("/explore")}>
              Explore
            </Link>
            {ready && authenticated && (
              <>
                <Link
                  href="/dashboard"
                  className={navLinkClass("/dashboard")}
                >
                  Dashboard
                </Link>
                <Link
                  href="/my-responses"
                  className={navLinkClass("/my-responses")}
                >
                  My Responses
                </Link>
              </>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center">
            {!ready ? null : authenticated && user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  aria-label="Open user menu"
                >
                  {getUserInitial(user)}
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                    {/* User info */}
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getDisplayName(user)}
                      </p>
                      {getEmail(user) && (
                        <p className="text-xs text-gray-500 truncate">
                          {getEmail(user)}
                        </p>
                      )}
                    </div>

                    <Link
                      href="/settings/profile"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Settings
                    </Link>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        void logout();
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  // Will be handled by Privy — no direct import of login here
                  // since unauthenticated users can click Sign In from any page
                  window.location.href = "/dashboard";
                }}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
