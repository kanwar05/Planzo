import { api } from "./api";

export const getMyVerification = async () => (await api.get("/vendor/verification/me")).data.verification;

export const submitVerification = async (documents) => {
  const form = new FormData();
  Object.entries(documents).forEach(([type, file]) => file && form.append(type, file));
  return (await api.post("/vendor/verification/submit", form, { timeout: 120000 })).data.verification;
};

export const getVerifications = async (params) => (await api.get("/admin/verifications", { params })).data;

export const reviewVerification = async (id, status, reason = "") =>
  (await api.patch(`/admin/verifications/${id}/review`, { status, reason })).data.verification;
