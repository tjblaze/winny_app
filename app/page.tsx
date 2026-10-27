"use client";

import { useMemo, useRef, useState } from "react";
import { useEffect, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, apiRequest } from "@/lib/api";
import { parseSavedCart, serializeSavedCart, type Cart } from "@/lib/cart-storage";
import { getCurrentCoordinates, type Coordinates } from "@/lib/geolocation";
import { productImageUrl } from "@/lib/product-image";
import type { VendorStore, VendorStoreReview } from "@/lib/vendor-store";

const categories = ["All", "Bowls", "Burgers", "Pizza", "Salads", "Desserts", "Drinks", "Sides"];
type Dish = {
  id: number | string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  tag: string;
  storeName?: string;
  storeId?: string;
  whatsappNumber?: string | null;
  reviews?: VendorStoreReview[];
  reviewCount?: number;
  distanceMiles?: number | null;
};

const dishes: Dish[] = [
  {
    id: 1,
    name: "Crispy chicken bowl",
    description: "Golden chicken, avocado, pickled cabbage & herby ranch",
    price: 14.5,
    category: "Bowls",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85",
    tag: "BESTSELLER"
  },
  {
    id: 2,
    name: "The big green bowl",
    description: "Market greens, quinoa, cucumber & lemon tahini",
    price: 12,
    category: "Salads",
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85",
    tag: "PLANT POWER"
  },
  {
    id: 3,
    name: "Double smash burger",
    description: "Two beef patties, melty cheddar, secret house sauce",
    price: 16,
    category: "Burgers",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
    tag: "A HOUSE FAVE"
  },
  {
    id: 4,
    name: "Burrata garden pizza",
    description: "Slow tomato, creamy burrata, basil & olive oil",
    price: 18,
    category: "Pizza",
    image:
      "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=85",
    tag: ""
  },
  {
    id: 5,
    name: "Miso-glazed salmon",
    description: "Sticky rice, edamame, sesame & a little chilli crunch",
    price: 17.5,
    category: "Bowls",
    image:
      "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=85",
    tag: "HIGH PROTEIN"
  },
  {
    id: 6,
    name: "Strawberry cloud cake",
    description: "Vanilla sponge, whipped cream & fresh strawberries",
    price: 8,
    category: "Desserts",
    image:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=85",
    tag: "A SWEET THING"
  }
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

type SignedInAccount = {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "VENDOR";
};

export default function Home() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Cart>({});
  const [cartRestored, setCartRestored] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [cartSaveMessage, setCartSaveMessage] = useState("");
  const [checkoutName, setCheckoutName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const orderSubmissionActive = useRef(false);
  const [vendorStores, setVendorStores] = useState<VendorStore[]>([]);
  const [knownVendorDishes, setKnownVendorDishes] = useState<Record<string, Dish>>({});
  const [vendorStoreError, setVendorStoreError] = useState("");
  const [account, setAccount] = useState<SignedInAccount | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [customerCoordinates, setCustomerCoordinates] = useState<Coordinates | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    let active = true;
    const query = customerCoordinates
      ? `?latitude=${customerCoordinates.latitude}&longitude=${customerCoordinates.longitude}`
      : "";
    async function refreshStores() {
      try {
        const stores = await apiRequest<VendorStore[]>(`/stores${query}`);
        if (active) {
          setVendorStores(stores);
          setKnownVendorDishes((current) => ({
            ...current,
            ...Object.fromEntries(stores.flatMap((store) => store.products.map((product) => [
              product.id,
              {
                id: product.id,
                name: product.name,
                description: product.description,
                price: product.price,
                category: product.category,
                image: product.image,
                tag: "LOCAL KITCHEN",
                storeName: store.name,
                storeId: store.id,
                whatsappNumber: store.whatsappNumber,
                reviews: store.reviews,
                reviewCount: store._count?.reviews ?? 0
              } satisfies Dish
            ])))
          }));
          setVendorStoreError("");
        }
      } catch (cause) {
        if (active) {
          setVendorStoreError(cause instanceof Error
            ? cause.message
            : "Neighborhood kitchens are temporarily unavailable.");
        }
      }
    }
    void refreshStores();
    const refreshInterval = window.setInterval(() => { void refreshStores(); }, 20_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [customerCoordinates]);

  useEffect(() => {
    let restoredCart: Cart | undefined;
    let restoredDishes: Record<string, Dish> = {};
    try {
      const savedCart = localStorage.getItem("savor-cart");
      if (savedCart) {
        const parsed = parseSavedCart(savedCart);
        if (parsed) {
          restoredCart = parsed.cart;
          restoredDishes = parsed.dishes;
        }
      }
    } catch (cause) {
      console.error("Could not restore the shopping bag.", cause);
    }
    const restoreTimer = window.setTimeout(() => {
      if (restoredCart) setCart((current) => Object.keys(current).length ? { ...restoredCart, ...current } : restoredCart);
      if (Object.keys(restoredDishes).length) setKnownVendorDishes((current) => ({ ...restoredDishes, ...current }));
      setCartRestored(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "1") return;
    window.history.replaceState(null, "", window.location.pathname);
    const openCartTimer = window.setTimeout(() => setCartOpen(true), 0);
    return () => window.clearTimeout(openCartTimer);
  }, []);

  useEffect(() => {
    if (!cartRestored) return;
    try {
      const savedDishes = [...dishes, ...Object.values(knownVendorDishes)]
        .filter((dish) => cart[String(dish.id)]);
      localStorage.setItem("savor-cart", serializeSavedCart(cart, savedDishes));
    } catch (cause) {
      console.error("Could not save the shopping bag for checkout.", cause);
    }
  }, [cart, cartRestored, knownVendorDishes]);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: SignedInAccount }>("/auth/me")
      .then(({ user }) => {
        if (active) {
          setAccount(user);
          if (user.role === "CUSTOMER") {
            setCheckoutName((current) => current || user.name);
          }
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (!(cause instanceof ApiError && cause.status === 401)) {
          console.error("Could not check the signed-in account.", cause);
        }
      })
      .finally(() => { if (active) setAccountChecked(true); });
    return () => { active = false; };
  }, []);

  const marketplaceDishes = useMemo(() => {
    const vendorDishes: Dish[] = vendorStores.flatMap((store) =>
      store.products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        image: product.image,
        tag: "LOCAL KITCHEN",
        storeName: store.name,
        storeId: store.id,
        whatsappNumber: store.whatsappNumber,
        reviews: store.reviews,
        reviewCount: store._count?.reviews ?? 0,
        distanceMiles: store.distanceMiles
      }))
    );
    return [...vendorDishes, ...dishes];
  }, [vendorStores]);

  async function findNearbyKitchens() {
    setLocationBusy(true);
    setLocationMessage("");
    try {
      setCustomerCoordinates(await getCurrentCoordinates());
      setLocationMessage("Nearby open kitchens are now shown first.");
    } catch (cause) {
      setLocationMessage(cause instanceof Error ? cause.message : "Could not determine your location.");
    } finally {
      setLocationBusy(false);
    }
  }

  const filteredDishes = useMemo(() => {
    const search = query.trim().toLowerCase();
    return marketplaceDishes.filter((dish) => {
      const matchesCategory = category === "All" || dish.category === category;
      const matchesSearch =
        !search ||
        dish.name.toLowerCase().includes(search) ||
        dish.description.toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [category, marketplaceDishes, query]);

  const cartCatalog = new Map(
    [...Object.values(knownVendorDishes), ...marketplaceDishes].map((dish) => [dish.id, dish])
  );
  const cartItems = [...cartCatalog.values()].filter((dish) => cart[dish.id]);
  const count = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  const subtotal = cartItems.reduce(
    (total, dish) => total + dish.price * cart[dish.id],
    0
  );
  const orderableItems = cartItems.filter((dish) => dish.storeId);
  const unavailableCartItems = orderableItems.filter(
    (dish) => !vendorStores.some(
      (store) => store.id === dish.storeId && store.products.some((product) => product.id === dish.id)
    )
  );
  const canPlaceOrder =
    orderableItems.length > 0 &&
    orderableItems.length === cartItems.length &&
    unavailableCartItems.length === 0;
  const deliveryFee = new Set(orderableItems.map((dish) => dish.storeId)).size * 3.5;

  function updateCart(id: number | string, amount: number) {
    setOrderPlaced(false);
    setCheckoutError("");
    setOrderMessage("");
    setCartSaveMessage("");
    if (amount > 0) setCartOpen(true);
    setCart((current) => {
      const next = { ...current, [id]: (current[id] ?? 0) + amount };
      if (next[id] <= 0) delete next[id];
      return next;
    });
  }

  function saveCartForLater() {
    try {
      localStorage.setItem("savor-cart", serializeSavedCart(cart, cartItems));
      setCartSaveMessage("Your bag is saved on this browser. Come back anytime to check out.");
    } catch (cause) {
      console.error("Could not save your bag for later.", cause);
      setCartSaveMessage("Your bag could not be saved. Check your browser storage settings and try again.");
    }
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (orderSubmissionActive.current) return;
    setCheckoutError("");
    if (account?.role === "VENDOR") {
      setCheckoutError("Sign in with a customer account to place an order. ");
      return;
    }
    if (!canPlaceOrder) {
      setCheckoutError("Orders can only be placed for dishes from open vendor stores.");
      return;
    }
    orderSubmissionActive.current = true;
    setPlacingOrder(true);
    try {
      const orders = await apiRequest<Array<{ id: string; store: { name: string } }>>("/orders", {
        method: "POST",
        body: JSON.stringify({
          customerName: checkoutName.trim(),
          deliveryAddress: deliveryAddress.trim(),
          items: orderableItems.map((dish) => ({
            productId: dish.id,
            quantity: cart[dish.id]
          }))
        })
      });
      if (orders.length === 0) {
        throw new Error("The order was not confirmed. Please check your bag and try again.");
      }
      setCart({});
      setOrderPlaced(true);
      setOrderMessage(
        `Order${orders.length === 1 ? "" : "s"} ${orders.map((order) => order.id).join(", ")} ${orders.length === 1 ? "is" : "are"} placed! The vendor will confirm and update its progress.`
      );
      setCheckoutName("");
      setDeliveryAddress("");
    } catch (cause) {
      setCheckoutError(
        cause instanceof ApiError && cause.status === 401
          ? "Sign in to place an order. "
          : cause instanceof ApiError && cause.status === 403
            ? "Sign in with a customer account to place an order. "
          : cause instanceof Error
            ? cause.message
            : "We couldn't place your order. Please try again."
      );
    } finally {
      orderSubmissionActive.current = false;
      setPlacingOrder(false);
    }
  }

  return (
    <main>
      <div className="topline">
        <span>GOOD FOOD, GOOD MOOD.</span>
        <span>Free delivery on your first order over $25 <span className="topline-star">✳</span></span>
        <span className="topline-location">{customerCoordinates ? "NEAR YOU" : "Brooklyn, NY"} <span aria-hidden="true">⌄</span></span>
      </div>

      <header className="header">
        <a className="wordmark" href="#" aria-label="Savor home">
          savor<span className="wordmark-dot">.</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a className="nav-current" href="#menu">Order</a>
          <Link href="/fitness-guide">Food guide</Link>
          <a href="#about">Our story</a>
          <a href="#footer">Contact</a>
        </nav>
        <Link
          className="vendor-nav-link"
          href={account?.role === "VENDOR" ? "/vendor/dashboard" : "/vendor"}
        >
          {account?.role === "VENDOR" ? "Dashboard" : "Open a store"} <span>↗</span>
        </Link>
        <Link
          className="customer-nav-link"
          href="/account"
          title={account?.name}
          aria-label={account ? `Account for ${account.name}` : "Sign in"}
        >
          {account ? account.name : accountChecked ? "Sign in" : "Account"}
        </Link>
        <Link className="bag-button" href="/cart" aria-label={`Open your bag, ${count} items`}>
          <span className="bag-icon" aria-hidden="true">♧</span>
          <span>Your bag</span>
          <span className="bag-count">{count}</span>
        </Link>
      </header>

      <section className="hero" id="about">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR NEIGHBORHOOD KITCHEN</div>
          <h1>Eating well<br />should feel <em>this good.</em></h1>
          <p>Seasonal, feel-good food made from scratch and brought to your door. A little more joy in every meal.</p>
          <a href="#menu" className="hero-cta">Find your new favorite <span aria-hidden="true">↗</span></a>
          <div className="social-proof">
            <div className="avatar-row" aria-hidden="true">
              <span>J</span><span>M</span><span>A</span><span>K</span>
            </div>
            <span><strong>4.9 out of 5</strong><br />from 2,000+ happy neighbors</span>
          </div>
        </div>
        <div className="hero-photo">
          <div className="hero-image" role="img" aria-label="Fresh colorful meal with vegetables" />
          <div className="hero-image-stamp"><span>✳</span><br />MADE FRESH<br />WITH LOVE</div>
          <div className="hero-note">A LITTLE<br /><em>delicious</em><br />GOES A LONG WAY</div>
        </div>
        <span className="hero-side-note">FRESHLY MADE · NEVER BORING</span>
      </section>

      <section className="menu-section" id="menu">
        <div className="menu-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> THE GOOD STUFF</div>
            <h2>Made for your <em>kind of hungry.</em></h2>
          </div>
          <p>Good ingredients, no shortcuts.<br />Just really, really good food.</p>
        </div>

        <div className="menu-controls">
          <div className="category-tabs" aria-label="Filter dishes by category">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? "category-tab selected" : "category-tab"}
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What sounds good?"
              aria-label="Search dishes"
            />
          </label>
        </div>

        <div className="marketplace-location">
          <div>
            <strong>{customerCoordinates ? "Nearby kitchens" : "Looking for something close by?"}</strong>
            <span>{locationMessage || (customerCoordinates
              ? "Open stores are sorted by distance from your location."
              : "Share your location to see the nearest open vendor stores first.")}</span>
          </div>
          <button type="button" onClick={() => void findNearbyKitchens()} disabled={locationBusy}>
            {locationBusy ? "Finding you..." : customerCoordinates ? "Refresh location" : "Find nearby stores"} <span>↗</span>
          </button>
        </div>
        {vendorStoreError && <p className="vendor-marketplace-note" role="status">{vendorStoreError}</p>}
        {vendorStores.length > 0 && (
          <div className="storefront-notice">
            <span className="storefront-notice-icon">✳</span>
            <span><strong>{vendorStores.length} neighborhood {vendorStores.length === 1 ? "kitchen is" : "kitchens are"} open.</strong> {customerCoordinates ? "Closest kitchens are listed first." : "Closed kitchens are hidden; discover fresh food from local vendors."}</span>
            <span className="storefront-open"><i /> OPEN</span>
          </div>
        )}
        {vendorStores.length === 0 && !vendorStoreError && (
          <div className="storefront-notice">
            <span className="storefront-notice-icon">✳</span>
            <span><strong>No vendor kitchens are open right now.</strong> Check back soon for new neighborhood menus.</span>
          </div>
        )}
        {filteredDishes.length ? (
          <div className="dish-grid">
            {filteredDishes.map((dish) => {
              const whatsappDigits = dish.whatsappNumber?.replace(/\D/g, "");
              return (
                <article className="dish-card" key={dish.id}>
                  <div
                    className="dish-image"
                    style={{ backgroundImage: `url("${productImageUrl(dish.image)}")` }}
                    role="img"
                    aria-label={dish.name}
                  >
                    {dish.tag && <span className="dish-tag">{dish.tag}</span>}
                    <button
                      className="quick-add"
                      onClick={() => updateCart(dish.id, 1)}
                      aria-label={`Add ${dish.name} to your bag`}
                    >+</button>
                  </div>
                  <div className="dish-details">
                    <div className="dish-title-row">
                      <h3>{dish.name}</h3>
                      <span className="dish-price">{money.format(dish.price)}</span>
                    </div>
                    {dish.storeName && (
                      <span className="dish-store-name">
                        From {dish.storeName}
                        {dish.distanceMiles !== undefined && dish.distanceMiles !== null
                          ? ` · ${dish.distanceMiles} mi away`
                          : ""}
                      </span>
                    )}
                    <p>{dish.description}</p>
                    {dish.storeName && (
                      <div className="dish-review-summary">
                        <strong>
                          {dish.reviewCount
                            ? `${dish.reviewCount} ${dish.reviewCount === 1 ? "review" : "reviews"}`
                            : "No reviews yet"}
                        </strong>
                        {dish.reviews?.map((review) => (
                          <p key={review.id}>
                            <span aria-label={`${review.rating} out of 5 stars`}>
                              {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                            </span>
                            <span>{review.customer.name}: {review.comment}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {whatsappDigits && (
                      <a
                        className="dish-whatsapp-link"
                        href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(`Hi ${dish.storeName}, I'm interested in ${dish.name}.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        WhatsApp vendor <span aria-hidden="true">↗</span>
                      </a>
                    )}
                    <button className="add-link" onClick={() => updateCart(dish.id, 1)}>
                      <span>+</span> Add to bag
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="no-results">
            <span aria-hidden="true">🥑</span>
            <h3>Nothing on the menu by that name.</h3>
            <p>Try another search or take a look at all the good stuff.</p>
            <button onClick={() => { setCategory("All"); setQuery(""); }}>See everything</button>
          </div>
        )}
      </section>

      <section className="bottom-banner">
        <span className="banner-spark" aria-hidden="true">✳</span>
        <p>We believe dinner<br />should be the <em>easy part.</em></p>
        <span className="banner-caption">SOMETHING GOOD<br />IS ALWAYS COOKING</span>
      </section>

      <footer id="footer">
        <a className="wordmark" href="#">savor<span className="wordmark-dot">.</span></a>
        <span>Made with care in Brooklyn, NY.</span>
        <span>© 2026 Savor Kitchen</span>
      </footer>

      {cartOpen && (
        <div className="drawer-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCartOpen(false);
        }}>
          <section className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="drawer-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> YOUR GOOD STUFF</div>
                <h2 id="cart-title">Your bag <span>({count})</span></h2>
              </div>
              <button className="drawer-close" onClick={() => setCartOpen(false)} aria-label="Close your bag">×</button>
            </div>
            {orderPlaced ? (
              <div className="cart-empty order-success">
                <span aria-hidden="true">✳</span>
                <h3>Order sent to the kitchen!</h3>
                <p>{orderMessage}</p>
                <Link className="checkout-button" href="/account">Track your order <span aria-hidden="true">→</span></Link>
                <button className="checkout-button" onClick={() => { setOrderPlaced(false); setCartOpen(false); }}>Keep browsing</button>
              </div>
            ) : cartItems.length ? (
              <>
                <div className="cart-lines">
                  {cartItems.map((dish) => (
                    <div className="cart-line" key={dish.id}>
                      <div className="cart-thumb" style={{ backgroundImage: `url("${productImageUrl(dish.image)}")` }} />
                      <div className="cart-line-copy">
                        <strong>{dish.name}</strong>
                        <span>{money.format(dish.price)}</span>
                        {unavailableCartItems.some((item) => item.id === dish.id) && (
                          <span className="unavailable-cart-note">Unavailable · remove to continue</span>
                        )}
                      </div>
                      <div className="quantity-stepper">
                        <button onClick={() => updateCart(dish.id, -1)} aria-label={`Remove one ${dish.name}`}>−</button>
                        <span>{cart[dish.id]}</span>
                        <button onClick={() => updateCart(dish.id, 1)} aria-label={`Add one ${dish.name}`}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div><span>Subtotal</span><span>{money.format(subtotal)}</span></div>
                  <div><span>Delivery</span><span>{deliveryFee ? money.format(deliveryFee) : "—"}</span></div>
                  <div className="cart-total"><strong>Total</strong><strong>{money.format(subtotal + deliveryFee)}</strong></div>
                </div>
                <div className="cart-save-for-later">
                  <button type="button" onClick={saveCartForLater}>Save bag for later</button>
                  {cartSaveMessage && <p role="status">{cartSaveMessage}</p>}
                  {!cartSaveMessage && <p>Your bag is also saved in this browser automatically.</p>}
                </div>
                {canPlaceOrder ? (
                  <form className="marketplace-checkout" onSubmit={placeOrder}>
                    <label>Your name<input required minLength={2} maxLength={80} value={checkoutName} onChange={(event) => setCheckoutName(event.target.value)} placeholder="Alex Morgan" /></label>
                    <label>Delivery address<input required minLength={5} maxLength={300} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="12 Market Street" /></label>
                    {checkoutError && <p className="vendor-alert checkout-error" role="alert">{checkoutError}{checkoutError.startsWith("Sign in") && <Link href="/account?returnTo=checkout">Sign in ↗</Link>}</p>}
                    {!accountChecked ? (
                      <p className="checkout-account-note">Checking your account before checkout…</p>
                    ) : account?.role === "VENDOR" ? (
                      <p className="checkout-account-note">You are signed in as a vendor. <Link href="/account">Sign out and switch to a customer account</Link> to place this order.</p>
                    ) : account ? (
                      <button className="checkout-button" type="submit" disabled={placingOrder}>
                        {placingOrder ? "Sending to the kitchen..." : "Place order"} <span aria-hidden="true">→</span>
                      </button>
                    ) : (
                      <Link className="checkout-button checkout-sign-in" href="/account?returnTo=checkout">
                        Sign in or create an account to order <span aria-hidden="true">→</span>
                      </Link>
                    )}
                    <p className="checkout-note">Your order status will update in the vendor dashboard.</p>
                  </form>
                ) : (
                  <p className="checkout-note">
                    {unavailableCartItems.length
                      ? "A store may have closed or a menu item is no longer available. Remove unavailable items to continue."
                      : "Live ordering is available for dishes from open vendor stores. Remove sample menu dishes to continue."}
                  </p>
                )}
              </>
            ) : (
              <div className="cart-empty">
                <span aria-hidden="true">🥡</span>
                <h3>Your bag is looking hungry.</h3>
                <p>Find something delicious and we&apos;ll take it from here.</p>
                <button className="checkout-button" onClick={() => setCartOpen(false)}>Explore the menu</button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
