import "server-only";
import { listProductIdsBySeller } from "./product-store";
import { requireServerAccess, throwIfError } from "./supabase";
import type {
  Customer,
  Order,
  OrderItem,
  OrderStatus,
  PaymentEvent,
  UserRole,
} from "@/lib/types";

/**
 * Order data-access layer backed by Supabase.
 *
 * Tables: `orders`, `order_items`, `payments`, `payment_events`.
 * There is exactly one `payments` row per order (unique FK), so a webhook
 * retry can only ever update it — it can never create a duplicate record.
 * Terminal order states are never downgraded, so a late redirect cannot
 * overwrite a verified webhook result.
 */

const ORDER_SELECT = "*, order_items(*), payments(*), payment_events(*)";

type ItemRow = {
  product_id: string | null;
  name: string;
  image: string;
  unit_price: number | string;
  quantity: number;
  line_total: number | string;
};

type PaymentRow = {
  provider: "xendit" | "demo";
  method: Order["payment"]["method"];
  status: OrderStatus;
  provider_reference: string | null;
  payment_reference: string | null;
  provider_status: string | null;
  checkout_url: string | null;
  paid_at: string | null;
  failure_reason: string | null;
};

type EventRow = {
  type: string;
  message: string;
  created_at: string;
};

type OrderRow = {
  id: string;
  reference: string;
  user_id: string | null;
  status: OrderStatus;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  customer_barangay: string;
  customer_city: string;
  customer_postal_code: string;
  customer_notes: string;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  created_at: string;
  updated_at: string;
  order_items?: ItemRow[];
  payments?: PaymentRow | PaymentRow[] | null;
  payment_events?: EventRow[];
};

function first<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function mapOrder(row: OrderRow): Order {
  const payment = first(row.payments);

  const customer: Customer = {
    name: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone,
    address: row.customer_address,
    barangay: row.customer_barangay,
    city: row.customer_city,
    postalCode: row.customer_postal_code,
    notes: row.customer_notes,
  };

  const items: OrderItem[] = (row.order_items ?? []).map((item) => ({
    productId: item.product_id ?? "",
    name: item.name,
    image: item.image,
    unitPrice: Number(item.unit_price),
    quantity: item.quantity,
    lineTotal: Number(item.line_total),
  }));

  const events: PaymentEvent[] = [...(row.payment_events ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((event) => ({
      at: event.created_at,
      type: event.type,
      message: event.message,
    }));

  return {
    reference: row.reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id ?? undefined,
    customer,
    items,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    status: row.status,
    payment: {
      provider: payment?.provider ?? "demo",
      method: payment?.method ?? "gcash",
      sessionId: payment?.provider_reference ?? undefined,
      paymentId: payment?.payment_reference ?? undefined,
      checkoutUrl: payment?.checkout_url ?? undefined,
      providerStatus: payment?.provider_status ?? undefined,
      paidAt: payment?.paid_at ?? undefined,
      failureReason: payment?.failure_reason ?? undefined,
    },
    events,
  };
}

/**
 * Who is asking for orders:
 *   admin    → every order
 *   seller   → their own orders plus orders containing one of their dishes
 *   customer → only their own orders
 */
export type OrderScope = {
  /** Role of the requesting account (`users.role`). */
  role: UserRole;
  /** Id of the requesting account (`users.id`). */
  userId: string;
};

export async function listOrders(scope: OrderScope): Promise<Order[]> {
  const sb = requireServerAccess();
  let query = sb
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (scope.role === "admin") {
    // no filter — admins see everything
  } else if (scope.role === "customer") {
    query = query.eq("user_id", scope.userId);
  } else {
    const productIds = await listProductIdsBySeller(scope.userId);
    let orderIds: string[] = [];

    if (productIds.length > 0) {
      const { data, error } = await sb
        .from("order_items")
        .select("order_id")
        .in("product_id", productIds);
      throwIfError(error, "We couldn't load your orders.");
      orderIds = [...new Set((data ?? []).map((row) => row.order_id as string))];
    }

    const filters = [`user_id.eq.${scope.userId}`];
    if (orderIds.length > 0) filters.push(`id.in.(${orderIds.join(",")})`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  throwIfError(error, "We couldn't load your orders.");
  return ((data ?? []) as OrderRow[]).map(mapOrder);
}

export async function getOrder(reference: string): Promise<Order | undefined> {
  const sb = requireServerAccess();
  const { data, error } = await sb
    .from("orders")
    .select(ORDER_SELECT)
    .eq("reference", reference)
    .maybeSingle();

  throwIfError(error, "We couldn't load that order.");
  return data ? mapOrder(data as OrderRow) : undefined;
}

/**
 * Best-effort variant for server-rendered pages: a missing key or an
 * unapplied migration degrades to "no order" (404/cancel copy) instead of a
 * 500 error page. API routes use `getOrder` + `guard()` so the real reason
 * still reaches the client as JSON.
 */
export async function getOrderSafe(
  reference: string,
): Promise<Order | undefined> {
  try {
    return await getOrder(reference);
  } catch (error) {
    console.error(
      "[orders] could not read order:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}

export async function saveOrder(
  order: Order,
  options: { userId?: string } = {},
): Promise<Order> {
  const sb = requireServerAccess();

  const { data: orderRow, error: orderError } = await sb
    .from("orders")
    .insert({
      reference: order.reference,
      user_id: options.userId ?? null,
      status: order.status,
      customer_name: order.customer.name,
      customer_email: order.customer.email,
      customer_phone: order.customer.phone,
      customer_address: order.customer.address,
      customer_barangay: order.customer.barangay,
      customer_city: order.customer.city,
      customer_postal_code: order.customer.postalCode,
      customer_notes: order.customer.notes,
      subtotal: order.subtotal,
      delivery_fee: order.deliveryFee,
      total: order.total,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
    })
    .select("id")
    .single();

  throwIfError(orderError, "We couldn't save your order.");
  const orderId = (orderRow as { id: string }).id;

  const { error: itemsError } = await sb.from("order_items").insert(
    order.items.map((item) => ({
      order_id: orderId,
      product_id: item.productId || null,
      name: item.name,
      image: item.image,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      line_total: item.lineTotal,
    })),
  );
  throwIfError(itemsError, "We couldn't save your order items.");

  const { error: paymentError } = await sb.from("payments").insert({
    order_id: orderId,
    provider: order.payment.provider,
    method: order.payment.method,
    amount: order.total,
    status: order.status,
    provider_reference: order.payment.sessionId ?? null,
    payment_reference: order.payment.paymentId ?? null,
    provider_status: order.payment.providerStatus ?? null,
    checkout_url: order.payment.checkoutUrl ?? null,
    paid_at: order.payment.paidAt ?? null,
    failure_reason: order.payment.failureReason ?? null,
  });
  throwIfError(paymentError, "We couldn't save the payment record.");

  if (order.events.length > 0) {
    const { error: eventsError } = await sb.from("payment_events").insert(
      order.events.map((event) => ({
        order_id: orderId,
        type: event.type,
        message: event.message,
        created_at: event.at,
      })),
    );
    throwIfError(eventsError, "We couldn't save the payment audit trail.");
  }

  return { ...order, userId: options.userId };
}

export type OrderTransition = {
  status: OrderStatus;
  type: string;
  message: string;
  payment?: Partial<Order["payment"]>;
  failureReason?: string;
};

/**
 * Applies a status change. Terminal states (paid, failed, cancelled) are never
 * downgraded, so a late redirect cannot overwrite a verified webhook result —
 * and repeated webhook deliveries only update the single payment row.
 */
export async function transitionOrder(
  reference: string,
  transition: OrderTransition,
): Promise<Order | null> {
  const sb = requireServerAccess();

  const current = await getOrder(reference);
  if (!current) return null;

  const terminal =
    current.status === "paid" ||
    current.status === "failed" ||
    current.status === "cancelled";
  const at = new Date().toISOString();
  const nextStatus = terminal ? current.status : transition.status;

  const nextPayment: Order["payment"] = {
    ...current.payment,
    ...transition.payment,
    ...(transition.failureReason
      ? { failureReason: transition.failureReason }
      : {}),
  };

  const { data: orderRow, error: orderError } = await sb
    .from("orders")
    .update({ status: nextStatus, updated_at: at })
    .eq("reference", reference)
    .select("id")
    .maybeSingle();

  throwIfError(orderError, "We couldn't update the order.");
  if (!orderRow) return null;
  const orderId = (orderRow as { id: string }).id;

  // Only overwrite the payment columns the transition actually carries.
  const paymentPatch: Record<string, unknown> = { status: nextStatus };
  if (nextPayment.sessionId !== undefined) {
    paymentPatch.provider_reference = nextPayment.sessionId;
  }
  if (nextPayment.paymentId !== undefined) {
    paymentPatch.payment_reference = nextPayment.paymentId;
  }
  if (nextPayment.providerStatus !== undefined) {
    paymentPatch.provider_status = nextPayment.providerStatus;
  }
  if (nextPayment.checkoutUrl !== undefined) {
    paymentPatch.checkout_url = nextPayment.checkoutUrl;
  }
  if (nextPayment.paidAt !== undefined) paymentPatch.paid_at = nextPayment.paidAt;
  if (nextPayment.failureReason !== undefined) {
    paymentPatch.failure_reason = nextPayment.failureReason;
  }

  const { error: paymentError } = await sb
    .from("payments")
    .update(paymentPatch)
    .eq("order_id", orderId);
  throwIfError(paymentError, "We couldn't update the payment record.");

  const { error: eventError } = await sb.from("payment_events").insert({
    order_id: orderId,
    type: transition.type,
    message: terminal
      ? `${transition.message} (ignored: already ${current.status})`
      : transition.message,
    created_at: at,
  });
  throwIfError(eventError, "We couldn't save the payment event.");

  return (await getOrder(reference)) ?? null;
}
