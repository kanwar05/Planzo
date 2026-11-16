export function safeDocumentId(value) {
  const id = value?._bsontype === "ObjectId" && typeof value.toHexString === "function" ? value.toHexString() : typeof value === "string" ? value : "";
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}

export function safeDiagnosticDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}
