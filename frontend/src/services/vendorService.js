import { api } from "./api";

export const getVendors = async (filters = {}, options = {}) => {
  const response = await api.get("/vendors", { params: filters, signal: options.signal });
  return response.data;
};

export const getVendorSearchMeta = async (q = "") => (await api.get("/vendors/search/meta", { params: { q } })).data;

export const getVendorById = async (id) => {
  const response = await api.get(`/vendors/${id}`);
  return response.data.vendor;
};

export const getMyVendorProfile = async () => {
  const response = await api.get("/vendors/me");
  return response.data.vendor;
};

export const createVendorProfile = async (data) => {
  const response = await api.post("/vendors/profile", data);
  return response.data.vendor;
};

export const updateVendorProfile = async (data) => {
  const response = await api.patch("/vendors/profile", data);
  return response.data.vendor;
};
