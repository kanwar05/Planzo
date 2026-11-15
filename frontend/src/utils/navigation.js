export function getDashboardPath(role) {
  if (role === "admin") return "/admin";
  if (role === "vendor") return "/vendor/dashboard";
  return "/customer/dashboard";
}
