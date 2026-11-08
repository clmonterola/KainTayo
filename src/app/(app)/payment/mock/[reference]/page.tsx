import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MockGateway } from "@/components/payment/mock-gateway";
import { getOrder } from "@/server/order-store";

export const metadata: Metadata = { title: "Checkout" };

export default async function MockPaymentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const order = await getOrder(reference);

  if (!order) notFound();
  if (order.payment.provider !== "demo") {
    redirect(`/payment/success?ref=${encodeURIComponent(reference)}`);
  }
  if (order.status !== "pending") {
    redirect(`/payment/success?ref=${encodeURIComponent(reference)}`);
  }

  return (
    <MockGateway
      reference={order.reference}
      method={order.payment.method}
      total={order.total}
      subtotal={order.subtotal}
      deliveryFee={order.deliveryFee}
      customerName={order.customer.name}
      itemCount={order.items.reduce((sum, item) => sum + item.quantity, 0)}
    />
  );
}
