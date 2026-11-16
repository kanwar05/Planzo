import { useEffect, useState } from "react";
import { getUnreadCounts } from "../services/messagingService";

export function useUnreadMessages(bookings, user) {
  const ids = [...new Set(bookings.map(booking => booking._id).filter(id => /^[a-f0-9]{24}$/i.test(id || "")))].sort().join(",");
  const [counts, setCounts] = useState({}), [error, setError] = useState("");
  useEffect(() => {
    let active = true, loading = false;
    setCounts({}); setError("");
    if (!user?._id || !ids) return;
    const list = ids.split(",");
    const load = async () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const result = {};
        for (let offset = 0; offset < list.length; offset += 100) {
          const response = await getUnreadCounts(list.slice(offset, offset + 100));
          Object.assign(result, response.unreadCounts);
          if (!active) return;
        }
        if (active) { setCounts(result); setError(""); }
      } catch { if (active) setError("Unread message counts are temporarily unavailable."); }
      finally { loading = false; }
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("focus", load);
    window.addEventListener("planzo:messages-updated", load);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("planzo:messages-updated", load); document.removeEventListener("visibilitychange", load); };
  }, [ids, user?._id]);
  return { counts, total: Object.values(counts).reduce((sum, count) => sum + (Number.isSafeInteger(count) && count > 0 ? count : 0), 0), error };
}
