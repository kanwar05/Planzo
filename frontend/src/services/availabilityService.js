import { api } from "./api";

export const getVendorAvailability = async (vendorId, params = {}) => {
  const response = await api.get(`/vendors/${vendorId}/availability`, {
    params,
  });
  return response.data;
};

export const createAvailability = async (data) => {
  const response = await api.post("/vendors/availability", data);
  return response.data.availability;
};

export const updateAvailability = async (data) => {
  const response = await api.put("/vendors/availability", data);
  return response.data.availability;
};

export const deleteAvailabilityItem = async (data) => {
  const response = await api.delete("/vendors/availability", { data });
  return response.data.availability;
};
