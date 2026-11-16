import { api } from "./api";

export const getVendorPackages = async vendorId => (await api.get(`/vendors/${vendorId}/packages`)).data.packages;
export const getMyPackages = async () => (await api.get("/vendors/packages/mine")).data.packages;
export const createPackage = async (data, idempotencyKey) => (await api.post("/vendors/packages", data, { headers: { "Idempotency-Key": idempotencyKey } })).data.package;
export const updatePackage = async (id, data) => (await api.patch(`/vendors/packages/${id}`, data)).data.package;
export const deactivatePackage = async (id, revision) => (await api.delete(`/vendors/packages/${id}`, { data: { revision } })).data.package;
