import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
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
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminUsers({
        role,
        page,
        limit: 12
      });
      setUsers(data.users || []);
      setPagination(data.pagination || {});
    } catch (err) {
      setError(getApiError(err, "Unable to load users."));
    } finally {
      setLoading(false);
    }
  }, [role, page]);
  useEffect(() => {
    load();
  }, [load]);
  const suspend = async account => {
    const suspended = !account.suspendedAt;
    if (suspended && !reasons[account._id]?.trim()) {
      setError("Provide a reason for suspending this account.");
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
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-coral">Account administration</p>
      <h1 className="mt-2 text-3xl font-extrabold">Registered users</h1>
    </header>
    <label className="block max-w-xs">
      <span className="label">Account role</span>
      <select className="field" value={role} onChange={event => {
        setRole(event.target.value);
        setPage(1);
      }}>
        <option value="customer">Customers</option>
        <option value="vendor">Vendors</option>
      </select>
    </label>
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {error}
    </p>}
    {loading ? <LoadingSkeleton /> : <>
      <div className="space-y-4">
        {users.length ? users.map(account => <article key={account._id} className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border bg-white p-5 shadow-soft">
          <div className="min-w-0">
            <h2 className="font-extrabold">
              {account.name}
            </h2>
            <p className="mt-2 break-all text-sm text-ink/55">
              {account.email}
            </p>
            <p className="mt-2 text-xs font-bold capitalize text-ink/55">
              {account.accountStatus || "active"}
              {account.suspendedAt ? " · Suspended" : ""}
            </p>
          </div>
          {!account.suspendedAt && <label className="min-w-0 flex-1 sm:max-w-xs">
            <span className="label">Suspension reason</span>
            <input className="field" maxLength={1000} value={reasons[account._id] || ""} onChange={event => setReasons(current => ({
              ...current,
              [account._id]: event.target.value
            }))} />
          </label>}
          <Button variant="outline" disabled={Boolean(busy) || account.accountStatus === "deactivated" || account.accountStatus === "deleted"} loading={busy === account._id} onClick={() => suspend(account)}>
            {account.suspendedAt ? "Restore account" : "Suspend account"}
          </Button>
        </article>) : <EmptyState title="No users found" description="Registered accounts will appear here." />}
      </div>
      <Pagination pagination={pagination} page={page} onPage={setPage} />
    </>}
  </div>;
}
