import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import MobileNavigation from "../components/MobileNavigation";
import { useAuth } from "../context/AuthContext";

export default function MainLayout() {
  const { pathname, hash } = useLocation();
  const { user } = useAuth();
  const hasCustomerNav = (!user || user.role === "customer") && !pathname.startsWith("/booking/");
  useEffect(() => {
    if (hash) requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    else window.scrollTo?.(0, 0);
  }, [pathname, hash]);
  return <div className={hasCustomerNav ? "mobile-nav-space" : ""} style={{ "--mobile-nav-offset": hasCustomerNav ? "calc(72px + env(safe-area-inset-bottom, 0px))" : "0px" }}>
    <a href="#main-content" className="skip-link">Skip to content</a><Navbar /><main id="main-content" tabIndex={-1} className="outline-none"><Outlet /></main><Footer /><MobileNavigation />
  </div>;
}
