import { CircleCheckBig, CircleX } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import Button from "../components/Button";
export default function PaymentResultPage({ failed = false }) {
  const query = new URLSearchParams(useLocation().search);
  const booking = query.get("booking");
  const pending = query.get("pending");
  const Icon = failed ? CircleX : CircleCheckBig;
  return (
    <main className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-4 text-center">
      <div>
        <Icon
          className={`mx-auto h-16 w-16 ${failed ? "text-red-500" : "text-emerald-500"}`}
        />
        <h1 className="mt-5 text-3xl font-black">
          {failed
            ? "Payment unsuccessful"
            : pending
              ? "Payment is being confirmed"
              : "Payment confirmed"}
        </h1>
        <p className="mt-2 text-ink/55">
          {failed
            ? "No successful payment progress was lost. You can retry when ready."
            : pending
              ? "Razorpay will confirm the final status securely."
              : "Your payment timeline and invoice are now updated."}
        </p>
        {booking && (
          <Link to={`/bookings/${booking}/payment`}>
            <Button className="mt-6">View booking payments</Button>
          </Link>
        )}
      </div>
    </main>
  );
}
