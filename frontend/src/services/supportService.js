import { api } from "./api";

export const getBookingSupportCases = async bookingId => (await api.get(`/bookings/${bookingId}/support-cases`)).data.cases;
export const createSupportCase = async (bookingId, data, key) => (await api.post(`/bookings/${bookingId}/support-cases`, data, { headers: { "Idempotency-Key": key } })).data;
export const getSupportCase = async caseId => (await api.get(`/support/cases/${caseId}`)).data;
export const getSupportEvents = async (caseId, params) => (await api.get(`/support/cases/${caseId}/events`, { params })).data;
export const addSupportUpdate = async (caseId, data) => (await api.post(`/support/cases/${caseId}/updates`, data)).data;
export const getAdminSupportCases = async params => (await api.get("/admin/support/cases", { params })).data;
export const manageSupportCase = async (caseId, data) => (await api.patch(`/admin/support/cases/${caseId}`, data)).data;
export const addPrivateSupportNote = async (caseId, data) => (await api.post(`/admin/support/cases/${caseId}/notes`, data)).data;
export async function uploadSupportEvidence(caseId, files, revision, key) {
  const data = new FormData();
  data.append("revision", String(revision));
  for (const file of files) data.append("evidence", file);
  return (await api.post(`/support/cases/${caseId}/evidence`, data, { headers: { "Idempotency-Key": key } })).data;
}
export const getSupportEvidence = async (caseId, evidenceId) =>
  (await api.get(`/support/cases/${caseId}/evidence/${evidenceId}`, { responseType: "blob" })).data;
