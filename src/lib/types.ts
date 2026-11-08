/**
 * Category names are data-driven. They are read from product records through
 * the API, so adding a new category never requires a frontend code change.
 */
export type Category = string;

export type Product = {
  id: string;
  name: string;
  description: string;
  category: Category;
  /** Whole pesos, e.g. 189 = ₱189. */
  price: number;
  image: string;
  available: boolean;
  /** Optional badge such as "Bestseller" or "New". */
  tag?: string;
  prepMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  available: boolean;
};

export type PaymentMethod = "gcash" | "paymaya" | "card";

export const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  blurb: string;
  accent: string;
}> = [
  {
    id: "gcash",
    label: "GCash",
    blurb: "Pay with your GCash wallet",
    accent: "#0070e0",
  },
  {
    id: "paymaya",
    label: "Maya",
    blurb: "Pay with your Maya wallet",
    accent: "#19b36b",
  },
  {
    id: "card",
    label: "Card",
    blurb: "Visa, Mastercard, JCB",
    accent: "#1d1b16",
  },
];

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
};

export type Customer = {
  name: string;
  email: string;
  phone: string;
  address: string;
  barangay: string;
  city: string;
  postalCode: string;
  notes: string;
};

export type OrderItem = {
  productId: string;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type PaymentEvent = {
  at: string;
  type: string;
  message: string;
};

export type PaymentSummary = {
  provider: "xendit" | "demo";
  method: PaymentMethod;
  /** Xendit invoice id, or the built-in gateway reference. */
  sessionId?: string;
  /** Provider-side payment/transaction id. */
  paymentId?: string;
  checkoutUrl?: string;
  providerStatus?: string;
  paidAt?: string;
  failureReason?: string;
};

export type Order = {
  reference: string;
  createdAt: string;
  updatedAt: string;
  /** Account that placed the order — used for ownership checks. */
  userId?: string;
  customer: Customer;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  payment: PaymentSummary;
  events: PaymentEvent[];
};

export type UserRole = "customer" | "seller" | "admin";

export type ApiError = {
  error: string;
  fields?: Record<string, string>;
};

export type SessionUser = {
  name: string;
  email: string;
};
