import type { Metadata } from "next";
import { PaymentResult } from "@/components/payment/payment-result";

export const metadata: Metadata = { title: "Payment result" };

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  return <PaymentResult reference={ref ?? ""} />;
}
