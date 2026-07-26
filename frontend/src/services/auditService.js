import { api } from "./api";

export const getAuditLogs = async (params = {}) =>
  (await api.get("/admin/audit-logs", { params })).data;

const csvCell = (value) => {
  const text = typeof value === "object" ? JSON.stringify(value ?? "") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
};

export const exportAuditLogsCsv = async (filters = {}) => {
  let page = 1;
  let pages = 1;
  const logs = [];
  do {
    const result = await getAuditLogs({ ...filters, page, limit: 500 });
    logs.push(...result.logs);
    pages = result.pagination.pages;
    page += 1;
  } while (page <= pages);

  const columns = ["Timestamp", "Action", "Admin", "Actor", "Target", "IP", "Browser", "Old value", "New value", "Reason"];
  const rows = logs.map((log) => [
    log.createdAt, log.action, log.admin?.email || "", log.actor?.email || "",
    `${log.targetType}: ${log.targetLabel}`, log.ip, log.browser,
    log.oldValue, log.newValue, log.reason,
  ]);
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `planzo-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
