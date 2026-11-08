import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CancelView } from "@/components/payment/cancel-view";
import { getOrderSafe } from "@/server/order-store";

export const metadata: Metadata = { title: "Payment cancelled" };

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const order = ref ? await getOrderSafe(ref) : undefined;

  if (order?.status === "paid") {
    redirect(`/payment/success?ref=${encodeURIComponent(order.reference)}`);
  }

  return <CancelView reference={order?.reference} />;
}
