/**
 * AppShell — authenticated application frame.
 *
 * Desktop (lg+): fixed left sidebar + sticky header with breadcrumbs.
 * Mobile (<lg): compact top header + fixed bottom nav (5 items) +
 * slide-over drawer with the full navigation. Dark mode via the `dark`
 * class on <html>, persisted in localStorage ('cg_theme').
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { PageTransition } from '../PageTransition';
import CommandPalette from '../CommandPalette';
import logoUrl from '../../assets/logo.svg';
import {
  fadeOnly,
  springDefault,
  surfaceVariants,
  usePrefersReducedMotion,
} from '../../lib/motion';

function svgIcon(className: string | undefined, children: ReactNode) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: (className?: string) => ReactNode;
}

const MAIN_NAV: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>,
      ),
  },
  {
    to: '/evaluate/models',
    label: 'Evaluate',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <path d="M9 3h6" />
          <path d="M10 3v5.3L4.7 17a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 8.3V3" />
          <path d="M7.5 14h9" />
        </>,
      ),
  },
  {
    to: '/compare',
    label: 'Compare',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <path d="M8 3 4 7l4 4" />
          <path d="M4 7h16" />
          <path d="m16 21 4-4-4-4" />
          <path d="M20 17H4" />
        </>,
      ),
  },
  {
    to: '/benchmarks',
    label: 'Benchmarks',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <path d="M3 3v18h18" />
          <path d="M8 17v-5" />
          <path d="M13 17V8" />
          <path d="M18 17v-8" />
        </>,
      ),
  },
  {
    to: '/history',
    label: 'History',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>,
      ),
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5z" />
          <path d="M14 2v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h6" />
        </>,
      ),
  },
];

const WORKSPACE_NAV: NavItem[] = [
  {
    to: '/setup/providers',
    label: 'Providers',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <rect x="3" y="4" width="18" height="7" rx="2" />
          <rect x="3" y="13" width="18" height="7" rx="2" />
          <path d="M7 7.5h.01" />
          <path d="M7 16.5h.01" />
        </>,
      ),
  },
  {
    to: '/evaluate/question',
    label: 'Prompt Lab',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8-5.8-1.9 5.8-1.9L12 3z" />
          <path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9L19 15z" />
        </>,
      ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (c) =>
      svgIcon(
        c,
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </>,
      ),
  },
];

const MOBILE_NAV: NavItem[] = [MAIN_NAV[0], MAIN_NAV[1], MAIN_NAV[2], MAIN_NAV[4]];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5" aria-label="Consistency Guard home">
      <img
        src={logoUrl}
        alt="Consistency Guard logo"
        className="h-9 w-9 shrink-0 rounded-lg object-cover shadow-sm"
      />
      {!compact && (
        <span className="text-[15px] font-bold tracking-tight text-stone-900 dark:text-white">
          Consistency Guard
        </span>
      )}
    </Link>
  );
}

function NavLinks({
  items,
  onNavigate,
  layout = 'sidebar',
}: {
  items: NavItem[];
  onNavigate?: () => void;
  layout?: 'sidebar' | 'bottom';
}) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'cg-press flex items-center transition-colors',
              layout === 'sidebar'
                ? 'gap-3 rounded-lg px-3 py-2 text-sm font-medium'
                : 'flex-col gap-1 px-1 py-2 text-[10px] font-medium',
              isActive
                ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100',
            )
          }
        >
          {item.icon(layout === 'sidebar' ? 'h-5 w-5 shrink-0' : 'h-5 w-5')}
          <span className={layout === 'bottom' ? 'leading-none' : undefined}>{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

function humanize(segment: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();
  if (/^[0-9a-f-]{16,}$/i.test(decoded)) return 'Details';
  return decoded
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let initial = false;
    try {
      const stored = localStorage.getItem('cg_theme');
      initial = stored
        ? stored === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      initial = false;
    }
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('cg_theme', next ? 'dark' : 'light');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  return { dark, toggle };
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { dark, toggle: toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Cmd/Ctrl+K toggles the palette; Escape closes menus/drawer/palette.
  // Click-outside closes the profile menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setDrawerOpen(false);
        setPaletteOpen(false);
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, []);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    key: `${seg}-${i}`,
    label: humanize(seg),
    to: `/${segments.slice(0, i + 1).join('/')}`,
    isLast: i === segments.length - 1,
  }));

  const initial = (user?.name?.trim()?.charAt(0) ?? user?.email?.charAt(0) ?? '?').toUpperCase();

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background font-sans text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* Desktop sidebar — heavier translucent material (structural region).
          Content never slides under it, so no translucency stacking. */}
      <aside className="material-heavy fixed inset-y-0 left-0 z-40 hidden w-64 flex-col lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
          <NavLinks items={MAIN_NAV} />
          <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Workspace
          </p>
          <NavLinks items={WORKSPACE_NAV} />
        </nav>
        <div className="p-4">
          <p className="text-xs text-stone-400 dark:text-stone-500">Consistency Guard v0.1.0</p>
        </div>
        {/* Scroll edge fade replaces the hard 1px divider. */}
        <div aria-hidden="true" className="edge-fade-r pointer-events-none absolute inset-y-0 left-full w-6" />
      </aside>

      <div className="lg:pl-64">
        {/* Header — translucent material, page content scrolls underneath.
            Edge fade replaces the hard divider. */}
        <header className="material-chrome sticky top-0 z-30">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Logo compact />
              </div>
              <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
                {crumbs.map((crumb) => (
                  <span key={crumb.key} className="flex min-w-0 items-center gap-1.5">
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-stone-300 dark:text-stone-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                    {crumb.isLast ? (
                      <span aria-current="page" className="truncate font-medium text-stone-900 dark:text-stone-100">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        to={crumb.to}
                        className="truncate text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
                className="cg-press hidden h-9 items-center gap-2 rounded-lg px-3 text-sm text-stone-500 ring-1 ring-inset ring-stone-200 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:ring-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-100 md:flex"
              >
                {svgIcon(
                  'h-4 w-4',
                  <>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </>,
                )}
                <span className="text-stone-400 dark:text-stone-500">Search…</span>
                <kbd className="rounded border border-stone-200 bg-stone-50 px-1 text-[10px] font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500">
                  ⌘K
                </kbd>
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-pressed={dark}
                className="cg-press flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              >
                {dark
                  ? svgIcon(
                      'h-5 w-5',
                      <>
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                      </>,
                    )
                  : svgIcon('h-5 w-5', <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)}
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="cg-press flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden="true">{initial}</span>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {menuOpen && (
                    <motion.div
                      role="menu"
                      aria-label="Account"
                      className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-white p-1.5 shadow-lg dark:bg-stone-900"
                      style={{ transformOrigin: '100% 0%' }}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={surfaceVariants(reducedMotion)}
                    >
                      <div className="px-3 py-2">
                        <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {user?.name ?? 'Account'}
                        </p>
                        <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                          {user?.email ?? ''}
                        </p>
                      </div>
                      <Link
                        to="/settings"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="cg-press block rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        Settings
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        className="cg-press block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          {/* Scroll edge fade where floating chrome meets content — no hard divider. */}
          <div aria-hidden="true" className="edge-fade-b pointer-events-none absolute inset-x-0 top-full h-8" />
        </header>

        {/* Page content — interruptible route transitions, mirrored enter/exit. */}
        <main className="relative mx-auto w-full max-w-7xl overflow-x-hidden px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <PageTransition routeKey={pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      {/* Mobile bottom nav — translucent material, edge fade, no hard divider. */}
      <nav
        className="material-chrome fixed inset-x-0 bottom-0 z-40 lg:hidden"
        aria-label="Primary"
      >
        <div aria-hidden="true" className="edge-fade-t pointer-events-none absolute inset-x-0 bottom-full h-8" />
        <div className="grid grid-cols-5">
          <NavLinks items={MOBILE_NAV} layout="bottom" />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="cg-press flex flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            {svgIcon(
              'h-5 w-5',
              <>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </>,
            )}
            <span className="leading-none">Menu</span>
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" aria-hidden="true" />
      </nav>

      {/* Mobile slide-over drawer — spring from the right, dimming scrim. */}
      <AnimatePresence initial={false}>
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-stone-950/50"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: reducedMotion ? fadeOnly : springDefault }}
              exit={{ opacity: 0, transition: reducedMotion ? fadeOnly : springDefault }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-stone-900"
              initial={reducedMotion ? { opacity: 0 } : { x: '100%', opacity: 0.6 }}
              animate={
                reducedMotion ? { opacity: 1, transition: fadeOnly } : { x: '0%', opacity: 1, transition: springDefault }
              }
              exit={
                reducedMotion ? { opacity: 0, transition: fadeOnly } : { x: '100%', opacity: 0.6, transition: springDefault }
              }
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <Logo />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="cg-press hit-pad relative flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                >
                  {svgIcon(
                    'h-5 w-5',
                    <>
                      <path d="M6 6l12 12" />
                      <path d="M18 6L6 18" />
                    </>,
                  )}
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4" aria-label="Mobile">
                <NavLinks items={MAIN_NAV} onNavigate={() => setDrawerOpen(false)} />
                <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  Workspace
                </p>
                <NavLinks items={WORKSPACE_NAV} onNavigate={() => setDrawerOpen(false)} />
              </nav>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onToggleTheme={toggleTheme}
      />
    </div>
  );
}
