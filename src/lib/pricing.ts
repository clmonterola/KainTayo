export const DELIVERY_FEE = 59;
export const FREE_DELIVERY_THRESHOLD = 999;

export type PricedLine = { price: number; quantity: number };

export function computeTotals(lines: PricedLine[]) {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0,
  );
  const deliveryFee =
    subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  return {
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    freeDelivery: subtotal >= FREE_DELIVERY_THRESHOLD,
    remainingForFreeDelivery: Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal),
  };
}

export function lineTotal(price: number, quantity: number) {
  return price * quantity;
}
