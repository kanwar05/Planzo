// Vite exposes every VITE_* variable to browser bundles. Keep this allowlist
// explicit so a misnamed server secret fails the build instead of shipping.
export function validatePublicBuildEnvironment(environment) {
  if (Object.keys(environment).some((name) => name.startsWith("VITE_") && name !== "VITE_API_URL"))
    throw new Error("Only VITE_API_URL is approved for public frontend configuration.");
  let api;
  try { api = new URL(environment.VITE_API_URL); } catch {
    throw new Error("Production builds require an explicit HTTPS VITE_API_URL.");
  }
  if (api.protocol !== "https:" || api.username || api.password || api.search || api.hash)
    throw new Error("Production VITE_API_URL must use HTTPS without credentials, query parameters or fragments.");
  return api.toString();
}
