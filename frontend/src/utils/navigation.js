export function getDashboardPath(role) {
  if (role === "admin") return "/admin";
  if (role === "vendor") return "/vendor/dashboard";
  return "/customer/dashboard";
}

// Return destinations come from router state, never from an arbitrary URL.
// Only known application pathnames are accepted; queries/escapes are not needed.
export function getSafeReturnPath(value, fallback = "/customer/dashboard") {
  if (typeof value !== "string" || /[%\\?#\s]/.test(value)) return fallback;
  const routes = /^(?:\/(?:booking|vendors)\/[A-Za-z0-9-]+|\/bookings\/[a-fA-F0-9]{24}\/messages|\/(?:vendors|services|settings|customer\/dashboard|vendor\/(?:dashboard|profile-setup|availability|packages|settings)|admin(?:\/(?:users|bookings|settings|vendors\/unverified))?)|\/)$/;
  return routes.test(value) ? value : fallback;
}

export function getPackageIntent(value) {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value) ? { packageId: value.toLowerCase() } : undefined;
}
