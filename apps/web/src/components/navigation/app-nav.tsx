"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LockOpen, Settings, Compass, LayoutGrid, Hammer, Globe, PanelLeftClose, PanelLeft, Menu, MessageSquare, Search } from "lucide-react";
import { useSidebarWidth, MOBILE_DRAWER_WIDTH } from "@/contexts/sidebar-width-context";
import { useProfileSchema } from "@/hooks/use-profile-schema";
import { useProfilePhoto } from "@/hooks/use-profile-photo";
import { cn } from "@/lib/utils";
import { apiAssetUrl } from "@/lib/constants";
import { CreditsBadge } from "@/components/common";
import { preloadVapiWeb } from "@/lib/vapi-client";

export function AppNav() {
  const logoSrc = apiAssetUrl("/img/kana_icon_512.png");

  const pathname = usePathname();
  const {
    sidebarWidth,
    collapsed,
    toggleCollapsed,
    isMobile,
    mobileSidebarOpen,
    closeMobileSidebar,
    toggleMobileSidebar,
  } = useSidebarWidth();

  const { data: profile } = useProfileSchema();
  const { blobUrl: profilePhotoBlob } = useProfilePhoto(profile?.photo_url ?? null);
  const accountName = (profile?.display_name || profile?.username || "Account").trim();
  const accountInitial = accountName ? accountName[0]?.toUpperCase() : "U";

  const sidebarItems = [
    { href: "/home", label: "Home", icon: Compass },
    { href: "/searches", label: "Searches", icon: Search },
    { href: "/explore", label: "Explore", icon: Globe },
    { href: "/cards", label: "Your Cards", icon: LayoutGrid },
    { href: "/builder", label: "Builder", icon: Hammer },
    { href: "/inbox", label: "Inbox", icon: MessageSquare },
    { href: "/unlocked", label: "Unlocked", icon: LockOpen },
  ];

  const navLinkClass = (isActive: boolean) =>
    cn(
      "flex items-center rounded-lg text-sm font-medium transition-colors min-h-[44px] min-w-[44px]",
      collapsed && !isMobile ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
      isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
    );

  const handleNavClick = () => {
    if (isMobile) closeMobileSidebar();
  };

  // Start downloading the Vapi web SDK as early as possible so Builder voice starts instantly.
  // This is safe due to internal caching/guards in `preloadVapiWeb()`.
  useEffect(() => {
    void preloadVapiWeb().catch(() => {
      // Ignore preload failures; BuilderChat will still attempt to start normally.
    });
  }, []);

  return (
    <>
      {/* Mobile backdrop - close drawer when tapping outside */}
      {isMobile && mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      {/* Left sidebar - overlay on mobile, permanent on desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex-shrink-0 bg-background border-r border-border/60 overflow-x-hidden min-w-0 transition-[transform] duration-200 ease-out",
          isMobile && "shadow-xl md:shadow-none",
          isMobile && !mobileSidebarOpen && "-translate-x-full"
        )}
        style={{
          width: isMobile ? MOBILE_DRAWER_WIDTH : sidebarWidth,
        }}
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full min-w-0 overflow-hidden">
          {/* Logo at top + collapse toggle (desktop) / menu close (mobile) */}
          <div
            className={cn(
              "flex-shrink-0 flex border-b border-border/60",
              collapsed && !isMobile ? "items-center justify-center py-2 min-h-[2.5rem]" : "flex-row items-center gap-1 px-2 py-4 min-h-[3.5rem]"
            )}
          >
            {(!collapsed || isMobile) && (
              <Link
                href="/home"
                onClick={handleNavClick}
                className="flex flex-1 items-center text-foreground hover:opacity-90 transition-opacity min-w-0 min-h-[44px]"
              >
                <span className="inline-block h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                  <img src={logoSrc} alt="CONXA" className="block h-full w-full object-cover" style={{ borderRadius: '50%', transform: 'scale(1.25)' }} />
                </span>
                <span className="font-semibold text-sm truncate ml-2.5">CONXA</span>
              </Link>
            )}
            {isMobile ? (
              <button
                type="button"
                onClick={closeMobileSidebar}
                className="p-2.5 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close menu"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="p-2 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <PanelLeft className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
            )}
          </div>

          {/* Nav links - fixed, not scrollable */}
          <nav className="flex-shrink-0 px-2 py-3 space-y-0.5">
            {sidebarItems.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href ||
                (href === "/home" && (pathname === "/" || pathname === "/home")) ||
                (href === "/explore" && (pathname.startsWith("/explore") || pathname.startsWith("/people/"))) ||
                (href === "/searches" && pathname.startsWith("/searches")) ||
                (href === "/cards" && pathname.startsWith("/cards")) ||
                (href === "/builder" && pathname.startsWith("/builder")) ||
                (href === "/inbox" && pathname.startsWith("/inbox")) ||
                (href === "/unlocked" && pathname.startsWith("/unlocked"));

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => {
                    if (href === "/builder") {
                      void preloadVapiWeb().catch(() => {});
                    }
                    handleNavClick();
                  }}
                  onPointerEnter={() => {
                    if (href !== "/builder") return;
                    void preloadVapiWeb().catch(() => {});
                  }}
                  onFocus={() => {
                    if (href !== "/builder") return;
                    void preloadVapiWeb().catch(() => {});
                  }}
                  className={navLinkClass(isActive)}
                  title={collapsed && !isMobile ? label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {(!collapsed || isMobile) && <span>{label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1 min-h-0" />

          {/* Account + Settings at bottom */}
          <div className="flex-shrink-0 border-t border-border/60 px-2 py-3 space-y-0.5">
            <Link
              href="/profile"
              onClick={handleNavClick}
              className={navLinkClass(pathname === "/profile" || pathname.startsWith("/profile"))}
              title={accountName}
              aria-label="Account"
            >
              {profilePhotoBlob ? (
                <img
                  src={profilePhotoBlob}
                  alt={accountName}
                  className="h-7 w-7 shrink-0 rounded-full object-cover bg-muted"
                />
              ) : (
                <span className="h-7 w-7 shrink-0 rounded-full bg-muted text-foreground/80 flex items-center justify-center text-xs font-semibold">
                  {accountInitial}
                </span>
              )}
              {(!collapsed || isMobile) && <span className="truncate">{accountName}</span>}
            </Link>

            <Link
              href="/settings"
              onClick={handleNavClick}
              className={navLinkClass(pathname === "/settings" || pathname.startsWith("/settings"))}
              title={collapsed && !isMobile ? "Settings" : undefined}
            >
              <Settings className="h-5 w-5 shrink-0" />
              {(!collapsed || isMobile) && <span>Settings</span>}
            </Link>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header
        className="sticky top-0 z-40 flex h-14 min-h-[44px] items-center border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingLeft: sidebarWidth }}
      >
        <div className="flex h-full w-full items-center justify-between px-3 sm:px-4 gap-2">
          <div className="flex items-center min-w-0">
            {isMobile && (
              <button
                type="button"
                onClick={toggleMobileSidebar}
                className="p-2.5 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            {isMobile && (
              <Link
                href="/home"
                className="font-semibold text-sm text-foreground hover:text-foreground/90 transition-colors min-h-[44px] flex items-center ml-1"
              >
                CONXA
              </Link>
            )}
          </div>
          <div className="flex items-center min-h-[44px]">
            <CreditsBadge />
          </div>
        </div>
      </header>
    </>
  );
}
