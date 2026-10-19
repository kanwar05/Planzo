import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
import { WorkspaceError, WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminUsers, setUserSuspension } from "../services/adminService";
import { getApiError } from "../utils/apiError";
export default function AdminUsersPage() {
  useDocumentTitle("Manage users");
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState("customer");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorAccount, setErrorAccount] = useState("");
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState({});
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    setErrorAccount("");
    try {
      const data = await getAdminUsers({
        role,
        page,
        limit: 12
      });
      if (version === loadVersion.current) {
        setUsers(data.users || []);
        setPagination(data.pagination || {});
      }
    } catch (err) {
      if (version === loadVersion.current) setError(getApiError(err, "Unable to load users."));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [role, page]);
  useEffect(() => {
    load();
    return () => { loadVersion.current += 1; };
  }, [load]);
  const suspend = async account => {
    if (busy) return;
    setErrorAccount(account._id);
    const suspended = !account.suspendedAt;
    if (suspended && !reasons[account._id]?.trim()) {
      setError("Provide a reason for suspending this account.");
      document.getElementById(`suspension-reason-${account._id}`)?.focus();
      return;
    }
    setBusy(account._id);
    setError("");
    try {
      await setUserSuspension(account._id, suspended, reasons[account._id]?.trim());
      await load();
      setMessage(suspended ? "Account suspended." : "Account restored.");
    } catch (err) {
      setError(getApiError(err, "Unable to update account."));
    } finally {
      setBusy("");
    }
  };
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <WorkspaceHeader eyebrow="Account administration" title="Registered users" description="Manage the people behind every celebration, with care and clear account controls." />
    <div className="flex flex-col gap-4 rounded-2xl bg-sand p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex items-start gap-3">
        <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-coral" aria-hidden="true" />
        <div><p className="font-bold">Account directory</p><p className="mt-1 text-sm leading-6 text-ink/65">Browse customers or vendors and review account access.</p></div>
      </div>
      <label className="block w-full sm:w-52">
        <span className="label">Account role</span>
        <select className="field !bg-white" disabled={Boolean(busy)} value={role} onChange={event => {
          setRole(event.target.value);
          setPage(1);
        }}>
          <option value="customer">Customers</option>
          <option value="vendor">Vendors</option>
        </select>
      </label>
    </div>
    <WorkspaceError message={!errorAccount ? error : ""} onRetry={load} />
    {loading ? <LoadingSkeleton /> : <>
      <div className="space-y-4">
        {users.length ? users.map(account => <Card as="article" key={account._id} className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sand font-editorial text-xl text-coral">{account.name?.trim().charAt(0).toUpperCase() || "P"}</span>
              <div className="min-w-0">
                <h2 className="break-words font-extrabold">{account.name}</h2>
                <p className="mt-1 break-all text-sm leading-6 text-ink/65">{account.email}</p>
                <p className="mt-1 text-xs font-semibold capitalize text-ink/65">{account.role || role}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${account.suspendedAt ? "bg-amber-50 text-amber-900" : account.accountStatus === "deactivated" || account.accountStatus === "deleted" ? "bg-sand text-ink/70" : "bg-sage text-ink"}`}>{account.suspendedAt ? "Suspended" : account.accountStatus || "Active"}</span>
          </div>
          {account.suspendedAt && account.suspensionReason && <p className="mt-4 break-words rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Suspension reason: </strong>{account.suspensionReason}</p>}
          <div className="mt-5 grid items-end gap-4 border-t border-ink/10 pt-5 lg:grid-cols-[minmax(0,1fr)_auto]">
            {!account.suspendedAt ? <label className="block min-w-0">
              <span className="label">Suspension reason</span>
              <input id={`suspension-reason-${account._id}`} className="field" maxLength={1000} placeholder="Explain why access should be suspended" value={reasons[account._id] || ""} aria-invalid={errorAccount === account._id && Boolean(error)} aria-describedby={errorAccount === account._id && error ? `account-error-${account._id}` : undefined} disabled={Boolean(busy) || ["deactivated", "deleted"].includes(account.accountStatus)} onChange={event => setReasons(current => ({
                ...current,
                [account._id]: event.target.value
              }))} />
            </label> : <p className="flex items-start gap-2 text-sm leading-6 text-ink/65"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-coral" aria-hidden="true" />Restore access when this account is ready to use Planzo again.</p>}
            <Button className={`w-full lg:w-auto ${account.suspendedAt ? "" : "!text-red-800"}`} variant="outline" disabled={Boolean(busy) || account.accountStatus === "deactivated" || account.accountStatus === "deleted"} loading={busy === account._id} onClick={() => suspend(account)}>
              {account.suspendedAt ? "Restore account" : "Suspend account"}
            </Button>
          </div>
          {errorAccount === account._id && error && <div id={`account-error-${account._id}`} className="mt-4"><WorkspaceError message={error} /></div>}
          {["deactivated", "deleted"].includes(account.accountStatus) && <p className="mt-3 text-xs leading-5 text-ink/65">Access cannot be changed for a {account.accountStatus} account.</p>}
        </Card>) : <EmptyState title={error ? "Users unavailable" : "No users found"} description={error ? "Try again to load the account directory." : "Registered accounts will appear here."} />}
      </div>
      <Pagination pagination={pagination} page={page} onPage={setPage} disabled={Boolean(busy)} />
    </>}
  </div>;
}
