// Only VITE_API_URL is allowed in the public frontend environment.
export function validatePublicBuildEnvironment(environment) {
  const invalidKeys = Object.keys(environment).filter(
    (name) => name.startsWith("VITE_") && name !== "VITE_API_URL",
  );

  if (invalidKeys.length > 0) {
    throw new Error(
      `Unapproved public frontend variables: ${invalidKeys.join(", ")}`,
    );
  }

  let api;

  try {
    api = new URL(environment.VITE_API_URL);
  } catch {
    throw new Error(
      "Production builds require an explicit HTTPS VITE_API_URL.",
    );
  }

  if (
    api.protocol !== "https:" ||
    api.username ||
    api.password ||
    api.search ||
    api.hash
  ) {
    throw new Error(
      "Production VITE_API_URL must use HTTPS without credentials, query parameters or fragments.",
    );
  }

  return api.toString();
}
