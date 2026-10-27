"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { parseSavedCart, serializeSavedCart, type Cart, type CartDish } from "@/lib/cart-storage";
import { productImageUrl } from "@/lib/product-image";
import type { VendorStore } from "@/lib/vendor-store";

type Account = {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "VENDOR";
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CartPage() {
  const [cart, setCart] = useState<Cart>({});
  const [savedDishes, setSavedDishes] = useState<Record<string, CartDish>>({});
  const [cartLoaded, setCartLoaded] = useState(false);
  const [stores, setStores] = useState<VendorStore[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [storeError, setStoreError] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [error, setError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const submitActive = useRef(false);

  useEffect(() => {
    let restored: ReturnType<typeof parseSavedCart> = null;
    try {
      const serialized = localStorage.getItem("savor-cart");
      if (serialized) restored = parseSavedCart(serialized);
    } catch (cause) {
      console.error("Could not restore the saved bag.", cause);
      window.setTimeout(() => setError("Your saved bag could not be read from this browser."), 0);
    }

    const timer = window.setTimeout(() => {
      if (restored) {
        setCart(restored.cart);
        setSavedDishes(restored.dishes);
      }
      setCartLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "1") return;
    window.history.replaceState(null, "", window.location.pathname);
    const checkoutTimer = window.setTimeout(() => setCheckoutStarted(true), 0);
    return () => window.clearTimeout(checkoutTimer);
  }, []);

  useEffect(() => {
    if (!cartLoaded) return;
    try {
      const currentDishes = stores.flatMap((store) =>
        store.products.map((product) => ({
          ...product,
          tag: "LOCAL KITCHEN",
          storeName: store.name,
          storeId: store.id
        }))
      );
      const dishes = { ...savedDishes };
      for (const dish of currentDishes) dishes[String(dish.id)] = dish;
      localStorage.setItem(
        "savor-cart",
        serializeSavedCart(cart, Object.values(dishes).filter((dish) => cart[String(dish.id)]))
      );
    } catch (cause) {
      console.error("Could not save your bag in this browser.", cause);
      window.setTimeout(() => setError("Your bag could not be saved. Check your browser storage settings."), 0);
    }
  }, [cart, cartLoaded, savedDishes, stores]);

  useEffect(() => {
    let active = true;
    apiRequest<VendorStore[]>("/stores")
      .then((result) => {
        if (active) {
          setStores(result);
          setStoreError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setStoreError(cause instanceof Error ? cause.message : "Could not load open store menus.");
        }
      })
      .finally(() => {
        if (active) setStoresLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: Account }>("/auth/me")
      .then(({ user }) => {
        if (!active) return;
        setAccount(user);
        if (user.role === "CUSTOMER") setCustomerName((current) => current || user.name);
      })
      .catch((cause: unknown) => {
        if (active && !(cause instanceof ApiError && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not check your account.");
        }
      })
      .finally(() => { if (active) setAccountChecked(true); });
    return () => { active = false; };
  }, []);

  const catalog = useMemo(() => {
    const items = new Map<string, CartDish>(Object.entries(savedDishes));
    for (const store of stores) {
      for (const product of store.products) {
        items.set(product.id, {
          ...product,
          tag: "LOCAL KITCHEN",
          storeName: store.name,
          storeId: store.id
        });
      }
    }
    return items;
  }, [savedDishes, stores]);

  const cartItems = Object.entries(cart).map(([id, quantity]) => ({
    dish: catalog.get(id) ?? {
      id,
      name: "Unavailable menu item",
      description: "This item is no longer in the saved menu.",
      price: 0,
      category: "",
      image: "",
      tag: ""
    },
    quantity
  }));
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.dish.price * item.quantity, 0);
  const unavailableItems = cartItems.filter(({ dish }) =>
    !dish.storeId ||
    !stores.some((store) => store.id === dish.storeId && store.products.some((product) => product.id === dish.id))
  );
  const deliveryFee = new Set(
    cartItems
      .filter(({ dish }) => dish.storeId && !unavailableItems.some((item) => item.dish.id === dish.id))
      .map(({ dish }) => dish.storeId)
  ).size * 3.5;
  const canPlaceOrder =
    storesLoaded &&
    !storeError &&
    cartItems.length > 0 &&
    unavailableItems.length === 0;

  function updateQuantity(id: string, delta: number) {
    setError("");
    setOrderMessage("");
    setCart((current) => {
      const next = { ...current, [id]: (current[id] ?? 0) + delta };
      if (next[id] <= 0) delete next[id];
      return next;
    });
  }

  function clearCart() {
    setCart({});
    setError("");
    setOrderMessage("");
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitActive.current) return;
    setError("");
    if (account?.role !== "CUSTOMER") {
      setError(account?.role === "VENDOR"
        ? "Sign out and sign in with a customer account to place an order."
        : "Sign in with a customer account to place an order.");
      return;
    }
    if (!canPlaceOrder) {
      setError("Remove unavailable dishes before placing your order.");
      return;
    }

    submitActive.current = true;
    setPlacingOrder(true);
    try {
      const orders = await apiRequest<Array<{ id: string }>>("/orders", {
        method: "POST",
        body: JSON.stringify({
          customerName: customerName.trim(),
          deliveryAddress: deliveryAddress.trim(),
          items: cartItems.map(({ dish, quantity }) => ({
            productId: dish.id,
            quantity
          }))
        })
      });
      if (!orders.length) throw new Error("The server did not confirm the order. Please try again.");
      setCart({});
      setOrderMessage(
        `Order${orders.length === 1 ? "" : "s"} ${orders.map(({ id }) => id).join(", ")} placed successfully. The vendor will confirm and update the order status.`
      );
      setDeliveryAddress("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not place your order. Please try again.");
    } finally {
      submitActive.current = false;
      setPlacingOrder(false);
    }
  }

  return (
    <main className="cart-page">
      <header className="vendor-header cart-page-header">
        <Link className="wordmark" href="/">savor<span className="wordmark-dot">.</span></Link>
        <Link className="back-to-market" href="/">← Continue shopping</Link>
      </header>

      <section className="cart-page-content">
        <div className="cart-page-title">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR GOOD STUFF</div>
          <h1>Your <em>bag.</em></h1>
          <p>Review your food, save your bag for later, or head to checkout when you’re ready.</p>
        </div>

        {error && <p className="vendor-alert cart-page-alert" role="alert">{error}</p>}
        {storeError && <p className="vendor-alert cart-page-alert" role="alert">{storeError} Refresh the page to try again.</p>}

        {orderMessage ? (
          <section className="cart-page-success" role="status">
            <span aria-hidden="true">✳</span>
            <h2>Order sent to the kitchen!</h2>
            <p>{orderMessage}</p>
            <Link className="checkout-button cart-page-continue" href="/account">Track your order <span>→</span></Link>
            <Link className="cart-page-back-link" href="/">Continue shopping</Link>
          </section>
        ) : !cartLoaded ? (
          <div className="cart-page-empty"><p>Loading your saved bag...</p></div>
        ) : cartItems.length === 0 ? (
          <div className="cart-page-empty">
            <span aria-hidden="true">🥡</span>
            <h2>Your bag is empty</h2>
            <p>Add a dish from a local kitchen and it’ll be ready here whenever you are.</p>
            <Link className="checkout-button cart-page-continue" href="/">Explore the menu <span>→</span></Link>
          </div>
        ) : (
          <div className="cart-page-layout">
            <section className="cart-page-items" aria-label="Items in your bag">
              <div className="cart-page-items-heading">
                <h2>Your items</h2>
                <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
                <button type="button" onClick={clearCart}>Clear bag</button>
              </div>
              {cartItems.map(({ dish, quantity }) => {
                const unavailable = unavailableItems.some((item) => item.dish.id === dish.id);
                return (
                  <article className="cart-page-item" key={dish.id}>
                    <div className="cart-page-item-image" style={dish.image ? { backgroundImage: `url("${productImageUrl(dish.image)}")` } : undefined} />
                    <div className="cart-page-item-copy">
                      <span>{dish.storeName || "Saved menu item"}</span>
                      <h3>{dish.name}</h3>
                      <p>{dish.description}</p>
                      {unavailable && <strong className="cart-page-unavailable">Currently unavailable · remove this item to check out</strong>}
                    </div>
                    <strong className="cart-page-item-price">{money.format(dish.price * quantity)}</strong>
                    <div className="quantity-stepper" aria-label={`Quantity for ${dish.name}`}>
                      <button type="button" onClick={() => updateQuantity(String(dish.id), -1)} aria-label={`Remove one ${dish.name}`}>−</button>
                      <span>{quantity}</span>
                      <button type="button" onClick={() => updateQuantity(String(dish.id), 1)} aria-label={`Add one ${dish.name}`}>+</button>
                    </div>
                  </article>
                );
              })}
              <p className="cart-page-saved-note">Your bag is saved in this browser and will be here when you return.</p>
              <Link className="cart-page-back-link" href="/">← Add more dishes</Link>
            </section>

            <aside className="cart-page-summary">
              <div className="eyebrow">ORDER SUMMARY</div>
              <h2>Almost <em>yours.</em></h2>
              <div className="cart-page-totals">
                <div><span>Subtotal</span><span>{money.format(subtotal)}</span></div>
                <div><span>Delivery</span><span>{deliveryFee ? money.format(deliveryFee) : "—"}</span></div>
                <div className="cart-page-total"><strong>Total</strong><strong>{money.format(subtotal + deliveryFee)}</strong></div>
              </div>
              {!canPlaceOrder && cartItems.length > 0 && (
                <p className="cart-page-checkout-note">
                  {!storesLoaded
                    ? "Checking kitchen availability..."
                    : unavailableItems.length
                      ? "Some items are from sample menus or kitchens that are closed. Remove them to continue."
                      : "Open kitchen menus could not be verified. Refresh the page to try again."}
                </p>
              )}
              {canPlaceOrder && !checkoutStarted && accountChecked && account?.role === "CUSTOMER" && (
                <button className="checkout-button cart-page-checkout-start" type="button" onClick={() => setCheckoutStarted(true)}>
                  Checkout <span>→</span>
                </button>
              )}
              {canPlaceOrder && !checkoutStarted && !accountChecked && (
                <button className="checkout-button cart-page-checkout-start" type="button" disabled>
                  Checking account... <span>→</span>
                </button>
              )}
              {canPlaceOrder && !checkoutStarted && accountChecked && !account && (
                <Link className="checkout-button checkout-sign-in" href="/account?returnTo=checkout">
                  Sign in to checkout <span>→</span>
                </Link>
              )}
              {canPlaceOrder && !checkoutStarted && accountChecked && account?.role === "VENDOR" && (
                <p className="cart-page-checkout-note">You are signed in as a vendor. <Link href="/account">Switch to a customer account</Link> to order.</p>
              )}
              {canPlaceOrder && checkoutStarted && (
                <form id="cart-checkout-form" className="cart-page-checkout" onSubmit={placeOrder}>
                  <h3>Delivery details</h3>
                  <label>Your name
                    <input required minLength={2} maxLength={80} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Alex Morgan" />
                  </label>
                  <label>Delivery address
                    <input required minLength={5} maxLength={300} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="12 Market Street" />
                  </label>
                  {!accountChecked ? (
                    <p className="cart-page-checkout-note">Checking your account...</p>
                  ) : account?.role === "CUSTOMER" ? (
                    <button className="checkout-button" type="submit" disabled={placingOrder}>
                      {placingOrder ? "Sending to the kitchen..." : "Place order"} <span>→</span>
                    </button>
                  ) : account?.role !== "VENDOR" ? (
                    <Link className="checkout-button checkout-sign-in" href="/account?returnTo=checkout">
                      Sign in or create an account <span>→</span>
                    </Link>
                  ) : (
                    <p className="cart-page-checkout-note">Sign in with a customer account to place an order.</p>
                  )}
                  <button className="cart-page-checkout-back" type="button" onClick={() => setCheckoutStarted(false)}>← Back to order summary</button>
                </form>
              )}
              {!canPlaceOrder && cartItems.length > 0 && (
                <button className="checkout-button cart-page-checkout-start" type="button" disabled>
                  {!storesLoaded ? "Checking availability..." : "Checkout unavailable"} <span>→</span>
                </button>
              )}
              <p className="cart-page-footer-note">You can come back to this saved bag whenever you’re ready.</p>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
