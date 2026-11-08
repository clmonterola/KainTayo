import "server-only";
import type { Order, OrderStatus } from "@/lib/types";
import { dataFile, readJson, withLock, writeJson } from "./json-store";

const FILE = dataFile("orders.json");
const LOCK = "orders";

function isOrderArray(value: unknown): value is Order[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as Order).reference === "string",
    )
  );
}

export async function listOrders(): Promise<Order[]> {
  const orders = await readJson<Order[]>(FILE, () => [], isOrderArray);
  return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrder(reference: string): Promise<Order | undefined> {
  const orders = await listOrders();
  return orders.find((order) => order.reference === reference);
}

export async function saveOrder(order: Order): Promise<Order> {
  return withLock(LOCK, async () => {
    const orders = await readJson<Order[]>(FILE, () => [], isOrderArray);
    const index = orders.findIndex((item) => item.reference === order.reference);
    const now = new Date().toISOString();
    const next = { ...order, updatedAt: now };
    if (index === -1) orders.push(next);
    else orders[index] = next;
    await writeJson(FILE, orders);
    return next;
  });
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
 * downgraded, so a late redirect cannot overwrite a verified webhook result.
 */
export async function transitionOrder(
  reference: string,
  transition: OrderTransition,
): Promise<Order | null> {
  return withLock(LOCK, async () => {
    const orders = await readJson<Order[]>(FILE, () => [], isOrderArray);
    const index = orders.findIndex((order) => order.reference === reference);
    if (index === -1) return null;

    const current = orders[index];
    const terminal = current.status === "paid" || current.status === "failed" || current.status === "cancelled";
    const at = new Date().toISOString();

    const next: Order = {
      ...current,
      status: terminal ? current.status : transition.status,
      updatedAt: at,
      payment: {
        ...current.payment,
        ...transition.payment,
        ...(transition.failureReason
          ? { failureReason: transition.failureReason }
          : {}),
      },
      events: [
        ...current.events,
        {
          at,
          type: transition.type,
          message: terminal
            ? `${transition.message} (ignored: already ${current.status})`
            : transition.message,
        },
      ],
    };

    orders[index] = next;
    await writeJson(FILE, orders);
    return next;
  });
}
