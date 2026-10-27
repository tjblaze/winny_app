export type Cart = Record<string, number>;

export type CartDish = {
  id: number | string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  tag: string;
  storeName?: string;
  storeId?: string;
  distanceMiles?: number | null;
};

export type SavedCart = {
  cart: Cart;
  dishes: Record<string, CartDish>;
};

function isCartRecord(value: unknown): value is Cart {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(([id, quantity]) =>
      id.length > 0 &&
      typeof quantity === "number" &&
      Number.isInteger(quantity) &&
      quantity > 0
    );
}

function isCartDish(value: unknown): value is CartDish {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const dish = value as Partial<CartDish>;
  return (
    (typeof dish.id === "string" || typeof dish.id === "number") &&
    typeof dish.name === "string" &&
    typeof dish.description === "string" &&
    typeof dish.price === "number" &&
    typeof dish.category === "string" &&
    typeof dish.image === "string" &&
    typeof dish.tag === "string" &&
    (dish.storeName === undefined || typeof dish.storeName === "string") &&
    (dish.storeId === undefined || typeof dish.storeId === "string") &&
    (dish.distanceMiles === undefined || dish.distanceMiles === null || typeof dish.distanceMiles === "number")
  );
}

export function parseSavedCart(serialized: string): SavedCart | null {
  const parsed: unknown = JSON.parse(serialized);
  if (isCartRecord(parsed)) return { cart: parsed, dishes: {} };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const saved = parsed as { cart?: unknown; dishes?: unknown };
  if (
    !isCartRecord(saved.cart) ||
    !saved.dishes ||
    typeof saved.dishes !== "object" ||
    Array.isArray(saved.dishes)
  ) {
    return null;
  }

  return {
    cart: saved.cart,
    dishes: Object.fromEntries(
      Object.entries(saved.dishes).filter((entry): entry is [string, CartDish] => isCartDish(entry[1]))
    )
  };
}

export function serializeSavedCart(cart: Cart, dishes: CartDish[]): string {
  return JSON.stringify({
    cart,
    dishes: Object.fromEntries(
      dishes.map((dish) => [String(dish.id), dish])
    )
  } satisfies SavedCart);
}
