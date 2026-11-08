"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, Product } from "@/lib/types";
import { useToast } from "./toast-provider";

const STORAGE_KEY = "kaintayo.cart.v1";
const MAX_QUANTITY = 20;

type CartContextValue = {
  items: CartItem[];
  count: number;
  hydrated: boolean;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  quantityOf: (productId: string) => number;
};

const CartContext = createContext<CartContextValue | null>(null);

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CartItem;
  return (
    typeof item.productId === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    typeof item.image === "string" &&
    typeof item.quantity === "number" &&
    item.quantity > 0
  );
}

function readStoredCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isCartItem)
      .map((item) => ({
        ...item,
        quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(item.quantity))),
      }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    setItems(readStoredCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setItems(readStoredCart());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback(
    (product: Product, quantity = 1) => {
      if (!product.available) {
        push({
          title: `${product.name} is sold out`,
          description: "Check back later — the kitchen restocks often.",
          variant: "error",
        });
        return;
      }

      const existing = items.find((item) => item.productId === product.id);
      const nextQuantity = Math.min(MAX_QUANTITY, (existing?.quantity ?? 0) + quantity);

      if (existing && nextQuantity === existing.quantity) {
        push({
          title: "That's the limit",
          description: `You can order up to ${MAX_QUANTITY} of one dish per order.`,
          variant: "info",
        });
        return;
      }

      setItems((current) => {
        const found = current.find((item) => item.productId === product.id);
        if (found) {
          return current.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + quantity) }
              : item,
          );
        }
        return [
          ...current,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: Math.min(MAX_QUANTITY, quantity),
            available: product.available,
          },
        ];
      });

      push({
        title: "Added to your bag",
        description: `${quantity} × ${product.name}`,
        variant: "success",
      });
    },
    [items, push],
  );

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.min(MAX_QUANTITY, Math.max(0, Math.round(quantity))) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const quantityOf = useCallback(
    (productId: string) => items.find((item) => item.productId === productId)?.quantity ?? 0,
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      hydrated,
      add,
      setQuantity,
      remove,
      clear,
      quantityOf,
    }),
    [items, hydrated, add, setQuantity, remove, clear, quantityOf],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
