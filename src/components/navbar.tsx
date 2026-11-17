"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavProps {
  user: {
    name: string;
    role: "owner" | "employee";
    job_title: string | null;
    department: string | null;
  };
  logoutAction: () => Promise<void>;
}

const navItems = [
  { href: "/my-work", label: "My Work", icon: "briefcase" },
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/clients", label: "Clients", icon: "building-2" },
  { href: "/tasks", label: "Tasks", icon: "check-square" },
  { href: "/posts", label: "Social Posts", icon: "instagram" },
  { href: "/feedback", label: "Feedback", icon: "message-square-quote" },
  { href: "/communications", label: "Communications", icon: "messages-square" },
  { href: "/bloggers", label: "Bloggers", icon: "users" },
  { href: "/meetings", label: "Meetings", icon: "calendar" },
  { href: "/users", label: "Team", icon: "shield-alert", ownerOnly: true },
];

export default function Navbar({ user, logoutAction }: NavProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roleLabel =
    user.job_title || (user.role === "owner" ? "Agency Owner" : "Team Member");
  const filteredNav = navItems.filter(
    (item) => !item.ownerOnly || user.role === "owner"
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-xs">
      {/* Top Bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-2.5">
        {/* Brand / Logo */}
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-90">
          <div className="relative h-9 w-32 sm:h-10 sm:w-40 flex items-center">
            <Image
              src="/logo.png"
              alt="Winkk Media"
              width={160}
              height={44}
              priority
              className="object-contain"
            />
          </div>
          <span className="hidden sm:inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#12143d] border border-slate-200">
            TRACKER
          </span>
        </Link>

        {/* User Identity & Mobile Toggle */}
        <div className="flex items-center gap-3">
          {/* User badge */}
          <div className="hidden sm:flex items-center gap-2.5 rounded-full bg-slate-50 border border-slate-200/80 px-3 py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#12143d] text-white text-xs font-bold uppercase">
              {user.name.charAt(0)}
            </div>
            <div className="text-left text-xs leading-tight">
              <div className="font-semibold text-slate-800">{user.name}</div>
              <div className="text-slate-500 font-medium">{roleLabel}</div>
            </div>
          </div>

          {/* Logout button */}
          <form action={logoutAction} className="hidden sm:block">
            <button
              type="submit"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
            >
              Sign out
            </button>
          </form>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 lg:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Desktop Secondary Navigation Bar */}
      <div className="hidden lg:block border-t border-slate-100 bg-slate-50/50">
        <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6 py-1.5 text-sm scrollbar-none">
          {filteredNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-[#12143d] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#12143d]"
                }`}
              >
                <span>{item.label}</span>
                {item.href === "/tasks" && (
                  <span
                    className={`ml-1 h-1.5 w-1.5 rounded-full ${
                      isActive ? "bg-[#ed8527]" : "bg-slate-300"
                    }`}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12143d] text-white text-xs font-bold uppercase">
              {user.name.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-500">{roleLabel}</div>
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-1 py-1">
            {filteredNav.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname?.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold ${
                    isActive
                      ? "bg-[#12143d] text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-[#ed8527]" />}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 border-t border-slate-100 pt-2">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 text-center text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Sign out of Winkk Media
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
