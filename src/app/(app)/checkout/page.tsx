import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getSession } from "@/server/auth";
import { xenditEnabled } from "@/server/xendit";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await getSession();

  return (
    <CheckoutForm
      mode={xenditEnabled() ? "xendit" : "demo"}
      defaultName={user?.name ?? ""}
      defaultEmail={user?.email ?? ""}
    />
  );
}
