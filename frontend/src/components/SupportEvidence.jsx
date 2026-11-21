import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import { getSupportEvidence, uploadSupportEvidence } from "../services/supportService";
import { getApiError } from "../utils/apiError";

const formats = new Set(["image/jpeg", "image/png", "image/webp"]);
export default function SupportEvidence({ caseId, record, canUpload, busy, perform }) {
  const [files, setFiles] = useState([]), [unresolved, setUnresolved] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState(null), [previewBusy, setPreviewBusy] = useState(false);
  const attempt = useRef(null), previewVersion = useRef(0), active = useRef(true), fileInput = useRef(null);
  useEffect(() => { active.current = true; return () => { active.current = false; previewVersion.current += 1; }; }, []);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview?.url]);
  const choose = event => {
    const selected = [...event.target.files]; setError("");
    if (selected.length > 3 || (record.evidence?.length || 0) + selected.length > 20 || selected.some(file => !formats.has(file.type) || !file.size || file.size > 5 * 1024 * 1024)) {
      setFiles([]); event.target.value = ""; setError("Choose up to three JPEG, PNG or WEBP images, each at most 5 MB; a case holds at most 20 images."); return;
    }
    setFiles(selected);
  };
  const upload = async event => {
    event.preventDefault(); if (busy || !files.length) return;
    const retrying = Boolean(attempt.current);
    attempt.current ||= { key: crypto.randomUUID(), files, revision: record.revision };
    setUnresolved(true); setError("");
    try {
      const value = attempt.current;
      await perform("evidence", () => uploadSupportEvidence(caseId, value.files, value.revision, value.key));
      if (active.current) { attempt.current = null; setFiles([]); setUnresolved(false); if (fileInput.current) fileInput.current.value = ""; }
    } catch (err) {
      if (!active.current) return;
      if (!retrying && [400, 401, 403, 404, 409, 413, 422, 429].includes(err.response?.status)) { attempt.current = null; setUnresolved(false); }
      setError(getApiError(err, "Upload could not be confirmed. Retry these same files before selecting new evidence."));
    }
  };
  const show = async item => {
    const version = ++previewVersion.current; setPreview(null); setPreviewBusy(true); setError("");
    try {
      const blob = await getSupportEvidence(caseId, item.evidenceId);
      if (!active.current || version !== previewVersion.current) return;
      if (!(blob instanceof Blob) || !formats.has(blob.type)) throw new Error("The evidence response was not a supported image.");
      setPreview({ url: URL.createObjectURL(blob), format: ["jpg", "jpeg", "png", "webp"].includes(item.format) ? item.format : "png" });
    } catch (err) { if (active.current && version === previewVersion.current) setError(getApiError(err, "Evidence could not be opened.")); }
    finally { if (active.current && version === previewVersion.current) setPreviewBusy(false); }
  };
  return <section aria-label="Case evidence" className="space-y-4 rounded-2xl border bg-white p-5 sm:p-7">
    <h2 className="font-editorial text-2xl">Evidence</h2><p className="text-xs leading-6 text-ink/65">Evidence is shared with both booking participants and administrators. Images are downloaded through your authorized support session.</p>
    {error && <p role="alert" className="text-sm leading-6 text-red-800">{error}</p>}
    {previewBusy && <p role="status" className="text-xs">Loading private evidence…</p>}
    {record.evidence?.length ? <ul className="space-y-2">{record.evidence.map((item, index) => <li key={item.evidenceId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sand p-3 text-xs"><span>Image {index + 1} · {item.uploaderRole} · {Math.ceil(item.bytes / 1024)} KB</span><Button variant="outline" disabled={previewBusy} onClick={() => show(item)}>View evidence {index + 1}</Button></li>)}</ul> : <p className="text-sm text-ink/65">No evidence has been added.</p>}
    {canUpload && <form onSubmit={upload} className="space-y-3 border-t pt-4">
      <label className="block"><span className="label">Evidence images</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || unresolved} onChange={choose} className="field min-w-0 !text-xs" /></label>
      <p className="text-xs leading-6 text-ink/65">Up to three JPEG, PNG or WEBP images per upload, 5 MB each. PDFs, SVGs and other files are not accepted.</p>
      {unresolved && <p role="status" className="rounded-xl bg-sand p-3 text-xs leading-6">This upload is unconfirmed. Retry the original images or refresh the case to check what was saved.</p>}
      <Button type="submit" loading={busy === "evidence"} disabled={Boolean(busy) || !files.length}>Upload evidence</Button>
    </form>}
    <Dialog open={Boolean(preview)} title="Private support evidence" onClose={() => setPreview(null)} footer={preview && <a className="text-sm font-bold underline" href={preview.url} download={`support-evidence.${preview.format}`}>Download image</a>}>
      {preview && <img src={preview.url} alt="Support case evidence" className="max-h-[65vh] w-full rounded-xl object-contain" />}
    </Dialog>
  </section>;
}
