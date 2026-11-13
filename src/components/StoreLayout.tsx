import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingBag,
  User,
  Menu,
  X,
  ShieldCheck,
  Bell,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

export function StoreLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isAdmin } = useAuth();
  const {
    publicSettings,
    categories,
    cartCount,
    unreadNotificationsCount,
    toasts,
    dismissToast,
  } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const navigate = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    setSearchOpen(false);
    setMobileMenuOpen(false);
    navigate(trimmed ? `/shop?search=${encodeURIComponent(trimmed)}` : '/shop');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9] text-zinc-900">
      {/* Slim Announcement Bar (<= 36px) */}
      {publicSettings.announcementEnabled &&
        publicSettings.announcementText &&
        !announcementDismissed && (
          <div className="bg-[#065F46] text-white text-xs py-2 px-4 flex items-center justify-center relative">
            <p className="font-medium tracking-wide truncate pr-6 text-center">
              {publicSettings.announcementText}
            </p>
            <button
              type="button"
              onClick={() => setAnnouncementDismissed(true)}
              aria-label="Dismiss announcement"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      {/* Clean Three-Zone Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 -ml-2 text-zinc-700 hover:text-zinc-900 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link
              to="/"
              className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
            >
              {publicSettings.logoUrl ? (
                <img
                  src={publicSettings.logoUrl}
                  alt={publicSettings.storeName}
                  className="h-7 w-auto object-contain"
                />
              ) : null}
              <span>{publicSettings.storeName}</span>
            </Link>
          </div>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600"
          >
            <Link
              to="/shop"
              className="hover:text-zinc-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Shop All
            </Link>
            {categories.slice(0, 3).map((cat) => (
              <Link
                key={cat.categoryId}
                to={`/category/${cat.slug}`}
                className="hover:text-zinc-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
              >
                {cat.name}
              </Link>
            ))}
            <Link
              to="/about"
              className="hover:text-zinc-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              About
            </Link>
          </nav>

          {/* Zone 3: Search, Account & Cart Primary Action */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search products"
              className="p-2 text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            {isAdmin && (
              <Link
                to="/admin"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#065F46] border border-[#065F46]/30 rounded-lg hover:bg-[#065F46]/5 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </Link>
            )}

            <Link
              to={firebaseUser ? '/account' : '/login'}
              aria-label={firebaseUser ? 'Customer account' : 'Sign in'}
              className="relative p-2 text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <User className="w-4 h-4" />
              {firebaseUser && unreadNotificationsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#065F46] text-white text-[10px] font-mono flex items-center justify-center">
                  {unreadNotificationsCount}
                </span>
              )}
            </Link>

            <Link
              to="/cart"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-[#065F46] transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Cart</span>
              <span className="font-mono tabular-nums bg-white/15 px-1.5 py-0.5 rounded text-[11px]">
                {cartCount}
              </span>
            </Link>
          </div>
        </div>

        {/* Expandable Search Bar */}
        {searchOpen && (
          <div className="border-t border-zinc-100 bg-white px-4 py-3">
            <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by name, SKU, or description..."
                autoFocus
                className="flex-1 px-3.5 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#065F46]"
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-[#065F46] cursor-pointer"
              >
                Search
              </button>
            </form>
          </div>
        )}

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-zinc-200 bg-white px-4 py-4 space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="flex-1 px-3 py-2 text-sm border border-zinc-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-3.5 py-2 text-sm font-medium bg-zinc-900 text-white rounded-lg"
              >
                Go
              </button>
            </form>
            <nav className="flex flex-col space-y-2 text-sm font-medium text-zinc-700">
              <Link to="/shop" onClick={() => setMobileMenuOpen(false)} className="py-2">
                Shop All Products
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.categoryId}
                  to={`/category/${cat.slug}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2"
                >
                  {cat.name}
                </Link>
              ))}
              <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="py-2">
                About Us
              </Link>
              <Link to="/contact" onClick={() => setMobileMenuOpen(false)} className="py-2">
                Contact
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-[#065F46] font-semibold"
                >
                  Admin Dashboard
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Toast Feedback Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-zinc-900 text-white shadow-lg border border-zinc-700 text-sm"
            >
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
              {t.type === 'info' && <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              <span className="flex-1">{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Close message"
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Comprehensive Footer */}
      <footer className="bg-zinc-950 text-zinc-300 border-t border-zinc-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="space-y-3">
            <p className="font-display text-lg font-bold text-white">{publicSettings.storeName}</p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {publicSettings.storeDescription}
            </p>
            <p className="text-xs text-zinc-500 pt-1">
              Currency: Nigerian Naira (NGN) · Bank Transfer Checkout
            </p>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-white mb-4">Shop</h3>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              <li>
                <Link to="/shop" className="hover:text-white transition-colors">
                  All Products
                </Link>
              </li>
              {categories.slice(0, 5).map((cat) => (
                <li key={cat.categoryId}>
                  <Link to={`/category/${cat.slug}`} className="hover:text-white transition-colors">
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-white mb-4">Customer Care & Policies</h3>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              <li>
                <Link to="/about" className="hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/faq" className="hover:text-white transition-colors">
                  Frequently Asked Questions
                </Link>
              </li>
              <li>
                <Link to="/shipping-policy" className="hover:text-white transition-colors">
                  Shipping & Delivery Policy
                </Link>
              </li>
              <li>
                <Link to="/returns-policy" className="hover:text-white transition-colors">
                  Returns & Refund Policy
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-white transition-colors">
                  Terms & Conditions
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 text-sm text-zinc-400">
            <h3 className="font-display text-sm font-semibold text-white mb-4">Store Contact</h3>
            <p>{publicSettings.businessAddress}</p>
            <p>Email: {publicSettings.contactEmail}</p>
            <p>Phone: {publicSettings.phoneNumber}</p>
            <p>WhatsApp: {publicSettings.whatsappNumber}</p>
            <div className="flex items-center gap-4 pt-2 text-xs">
              {publicSettings.socialLinks?.instagram && (
                <a
                  href={publicSettings.socialLinks.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white underline underline-offset-4"
                >
                  Instagram
                </a>
              )}
              {publicSettings.socialLinks?.twitter && (
                <a
                  href={publicSettings.socialLinks.twitter}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white underline underline-offset-4"
                >
                  X / Twitter
                </a>
              )}
              {publicSettings.socialLinks?.facebook && (
                <a
                  href={publicSettings.socialLinks.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white underline underline-offset-4"
                >
                  Facebook
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-800/80 py-5 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>
            © {new Date().getFullYear()} {publicSettings.storeName}. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            <Link to="/account/orders" className="hover:text-zinc-300">
              Track Orders
            </Link>
            <Link to="/admin" className="hover:text-zinc-300 inline-flex items-center gap-1">
              <Bell className="w-3 h-3" />
              <span>Admin Portal</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
