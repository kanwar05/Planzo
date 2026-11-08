// Missing/null status remains compatible with legacy active accounts. Unknown
// non-active states are not an invitation to create a public listing.
export const activeAccountFilter = () => ({
  accountStatus: { $in: ["active", null] },
  suspendedAt: null,
});

export const isActiveAccount = (user) => Boolean(user &&
  [undefined, null, "active"].includes(user.accountStatus) && !user.suspendedAt);
