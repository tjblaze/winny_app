"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { API_BASE, ApiError, apiRequest } from "@/lib/api";
import OrderChat from "@/app/components/order-chat";
import { getCurrentCoordinates, type Coordinates } from "@/lib/geolocation";
import { productImageUrl, uploadProductImage } from "@/lib/product-image";
import type { VendorProduct, VendorStore } from "@/lib/vendor-store";

const cuisines = ["American", "Bakery", "Bowls", "Desserts", "Healthy", "Italian", "Mexican", "Other"];
const categories = ["Bowls", "Burgers", "Pizza", "Salads", "Desserts", "Drinks", "Sides"];
const fallbackImage =
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type Account = { id: string; name: string; email: string; role: "CUSTOMER" | "VENDOR" };
type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";
type VendorOrder = {
  id: string;
  unreadMessageCount: number;
  status: OrderStatus;
  customerName: string;
  deliveryAddress: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
  customer: { id: string; name: string; email: string };
  items: Array<{ id: string; name: string; unitPrice: number; quantity: number }>;
};
const activeStatuses: OrderStatus[] = [
  "PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"
];
const statusLabels: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready for pickup",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled"
};
const allowedNextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED"
};

export default function VendorPage() {
  const [user, setUser] = useState<Account | null>(null);
  const [store, setStore] = useState<VendorStore | null>(null);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState("");
  const [storeName, setStoreName] = useState("");
  const [tagline, setTagline] = useState("");
  const [cuisine, setCuisine] = useState(cuisines[0]);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [storeCoordinates, setStoreCoordinates] = useState<Coordinates | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState(categories[0]);
  const [productImage, setProductImage] = useState("");
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const activeOrderCount = useMemo(
    () => orders.filter((order) => activeStatuses.includes(order.status)).length,
    [orders]
  );
  const pendingOrderCount = useMemo(
    () => orders.filter((order) => order.status === "PENDING").length,
    [orders]
  );
  const totalRevenue = useMemo(() => {
    return orders
      .filter((order) => order.status !== "CANCELLED")
      .reduce((total, order) => total + order.subtotal, 0);
  }, [orders]);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const { user: account } = await apiRequest<{ user: Account }>("/auth/me");
        if (!active) return;
        if (account.role !== "VENDOR") {
          setUser(account);
          return;
        }
        setUser(account);
        try {
          const ownedStore = await apiRequest<VendorStore>("/stores/me");
          if (active) setStore(ownedStore);
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 404) return;
          throw cause;
        }
      } catch (cause) {
        if (!active) return;
        if (!(cause instanceof ApiError && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not load your vendor dashboard.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDashboard();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("verify");
    if (!token) return;

    url.searchParams.delete("verify");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    let active = true;
    apiRequest<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token })
    })
      .then(({ message }) => {
        if (!active) return;
        setAuthMode("login");
        setVerificationNotice(message);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not verify your email.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const storeId = store?.id;
    if (user?.role !== "VENDOR" || !storeId) return;
    let active = true;
    async function refreshOrders() {
      try {
        const latest = await apiRequest<VendorOrder[]>("/orders/vendor");
        if (active) setOrders(latest);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not refresh your orders.");
      }
    }
    void refreshOrders().finally(() => { if (active) setOrdersLoading(false); });

    const source = new EventSource(`${API_BASE}/orders/vendor/events`, { withCredentials: true });
    source.onopen = () => { if (active) setLiveConnected(true); };
    source.onerror = () => { if (active) setLiveConnected(false); };
    source.addEventListener("order.updated", () => { void refreshOrders(); });
    source.addEventListener("message.created", () => { void refreshOrders(); });
    const fallback = window.setInterval(() => { void refreshOrders(); }, 15_000);

    return () => {
      active = false;
      source.close();
      window.clearInterval(fallback);
    };
  }, [user?.role, store?.id]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError("");
    setVerificationNotice("");
    try {
      if (authMode === "register") {
        const { message } = await apiRequest<{ message: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name: authName, email: authEmail, password: authPassword })
        });
        setVerificationNotice(message);
        setAuthPassword("");
        return;
      }
      const { user: account } = await apiRequest<{ user: Account }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      setUser(account);
      setError("");
      if (account.role === "VENDOR") {
        try {
          setStore(await apiRequest<VendorStore>("/stores/me"));
        } catch (cause) {
          if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
          setStore(null);
        }
      } else {
        setStore(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resendVerification() {
    setAuthBusy(true);
    setError("");
    try {
      const { message } = await apiRequest<{ message: string }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: authEmail })
      });
      setVerificationNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend the verification email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function becomeVendor() {
    setAuthBusy(true);
    setError("");
    try {
      const { user: account } = await apiRequest<{ user: Account }>("/auth/become-vendor", {
        method: "POST"
      });
      setUser(account);
      setStore(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not activate vendor access.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      setStore(await apiRequest<VendorStore>("/stores", {
        method: "POST",
        body: JSON.stringify({
          name: storeName.trim(),
          tagline: tagline.trim(),
          cuisine,
          description: description.trim(),
          location: location.trim(),
          ...(whatsappNumber.trim() ? { whatsappNumber: whatsappNumber.trim() } : {}),
          ...(storeCoordinates ?? {})
        })
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create your store.");
    }
  }

  async function setStoreLocation() {
    setLocationBusy(true);
    setLocationNotice("");
    try {
      const coordinates = await getCurrentCoordinates();
      setStoreCoordinates(coordinates);
      if (store) {
        const updated = await apiRequest<VendorStore>("/stores/me/location", {
          method: "PATCH",
          body: JSON.stringify(coordinates)
        });
        setStore(updated);
        setLocationNotice("Store location updated. Nearby customers can now find you.");
      } else {
        setLocationNotice("Location added. Nearby customers can now find your store.");
      }
    } catch (cause) {
      setLocationNotice(cause instanceof Error ? cause.message : "Could not update your store location.");
    } finally {
      setLocationBusy(false);
    }
  }

  function resetProductForm() {
    setEditingProductId(null);
    setProductName("");
    setProductDescription("");
    setProductPrice("");
    setProductCategory(categories[0]);
    setProductImage("");
    setProductImageFile(null);
    setImageInputKey((key) => key + 1);
  }

  function editProduct(product: VendorProduct) {
    setEditingProductId(product.id);
    setProductName(product.name);
    setProductDescription(product.description);
    setProductPrice(String(product.price));
    setProductCategory(product.category);
    setProductImage(product.image.startsWith("/uploads/") ? "" : product.image);
    setProductImageFile(null);
    setImageInputKey((key) => key + 1);
    setError("");
    document.getElementById("vendor-product-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function selectProductImage(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Food photos must be 5 MB or smaller.");
      return;
    }
    setError("");
    setProductImageFile(file);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    const price = Number(productPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid price greater than zero.");
      return;
    }
    setSavingProduct(true);
    setError("");
    try {
      const image = productImageFile
        ? await uploadProductImage(productImageFile)
        : productImage.trim() || (editingProductId ? undefined : fallbackImage);
      const payload = {
        name: productName.trim(),
        description: productDescription.trim(),
        price,
        category: productCategory,
        ...(image ? { image } : {})
      };
      const product = await apiRequest<VendorProduct>(
        editingProductId
          ? `/stores/me/products/${encodeURIComponent(editingProductId)}`
          : "/stores/me/products",
        {
          method: editingProductId ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        }
      );
      setStore((current) => current ? {
        ...current,
        products: editingProductId
          ? current.products.map((item) => item.id === product.id ? product : item)
          : [product, ...current.products]
      } : current);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      resetProductForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this menu item.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function removeProduct(productId: string) {
    if (!store) return;
    setError("");
    try {
      await apiRequest(`/stores/me/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
      setStore({ ...store, products: store.products.filter((product) => product.id !== productId) });
      if (editingProductId === productId) resetProductForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this menu item.");
    }
  }

  async function toggleStore() {
    if (!store) return;
    setError("");
    try {
      const updated = await apiRequest<VendorStore>(
        `/stores/me/status?open=${String(!store.isOpen)}`,
        { method: "POST" }
      );
      setStore(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your store status.");
    }
  }

  async function updateOrderStatus(order: VendorOrder, status: OrderStatus) {
    setUpdatingOrderId(order.id);
    setError("");
    try {
      const updated = await apiRequest<VendorOrder>(
        `/orders/vendor/${encodeURIComponent(order.id)}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) }
      );
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the order status.");
    } finally {
      setUpdatingOrderId("");
    }
  }

  async function signOut() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      setUser(null);
      setStore(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  if (loading) {
    return <main className="vendor-page"><p className="vendor-loading">Loading your kitchen...</p></main>;
  }

  return (
    <main className="vendor-page">
      <header className="vendor-header">
        <Link className="wordmark" href="/">savor<span className="wordmark-dot">.</span></Link>
        {user && <button className="vendor-signout" onClick={() => void signOut()}>Sign out</button>}
        <Link className="back-to-market" href="/">← Back to the marketplace</Link>
      </header>

      <section className="vendor-intro">
        <div className="eyebrow"><span className="eyebrow-line" /> THE SAVOUR SIDE OF SELLING</div>
        <h1>Your kitchen.<br />Your <em>little corner</em> of Savor.</h1>
        <p>Start with a customer account, then activate vendor access to set up your storefront and share your menu with neighbors.</p>
        <div className="vendor-steps">
          <span><i>01</i> Create your account</span>
          <span><i>02</i> Activate vendor access</span>
          <span><i>03</i> Create your store</span>
        </div>
      </section>

      {error && <p className="vendor-alert" role="alert">{error}</p>}

      {user?.role === "CUSTOMER" ? (
        <section className="vendor-panel create-store-panel">
          <div className="vendor-panel-heading">
            <span className="vendor-panel-icon">☺</span>
            <div><span className="eyebrow">STEP 1 COMPLETE</span><h2>Your customer account is ready</h2></div>
          </div>
          <p className="vendor-panel-copy">You&apos;re signed in as {user.name}. Continue to activate vendor access on this account, then you can create your store.</p>
          <button className="vendor-primary" disabled={authBusy} onClick={() => void becomeVendor()}>
            {authBusy ? "Setting up vendor access..." : "Continue as a vendor"} <span>→</span>
          </button>
          <button className="account-switch" onClick={() => void signOut()}>Sign out instead</button>
        </section>
      ) : !user ? (
        <section className="vendor-panel create-store-panel">
          <div className="vendor-panel-heading">
            <span className="vendor-panel-icon">↗</span>
            <div><span className="eyebrow">YOUR KITCHEN STARTS HERE</span><h2>{authMode === "register" ? "Create your account first" : "Welcome back"}</h2></div>
          </div>
          <p className="vendor-panel-copy">Create a customer account first. Once you&apos;re signed in, you can activate vendor access and set up your store.</p>
          {verificationNotice && <p className="vendor-storage-note" role="status">{verificationNotice}</p>}
          <form className="vendor-form" onSubmit={submitAuth}>
            {authMode === "register" && <label className="vendor-field-wide">Your name<input required minLength={2} maxLength={80} value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Alex Morgan" /></label>}
            <label className="vendor-field-wide">Email address<input required type="email" maxLength={254} autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label className="vendor-field-wide">Password<input required type="password" minLength={authMode === "register" ? 10 : 1} maxLength={72} autoComplete={authMode === "register" ? "new-password" : "current-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder={authMode === "register" ? "At least 10 characters" : "Your password"} /></label>
            <button className="vendor-primary vendor-field-wide" type="submit" disabled={authBusy}>{authBusy ? "Please wait..." : authMode === "register" ? "Create account" : "Sign in"} <span>→</span></button>
          </form>
          {verificationNotice && (
            <button className="account-switch" disabled={authBusy} onClick={() => void resendVerification()}>
              Resend verification email
            </button>
          )}
          <p className="vendor-auth-switch">
            {authMode === "register" ? "Already have a vendor account?" : "New to Savor?"}{" "}
            <button onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setError(""); setVerificationNotice(""); }}>
              {authMode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <p className="vendor-storage-note">Account credentials are secured by the Savor API. Storefronts and menus are saved in the database.</p>
        </section>
      ) : !store ? (
        <section className="vendor-panel create-store-panel">
          <div className="vendor-panel-heading">
            <span className="vendor-panel-icon">✳</span>
            <div><span className="eyebrow">LET&apos;S GET YOU SET UP</span><h2>Create your store</h2></div>
          </div>
          <p className="vendor-panel-copy">Tell your neighborhood a little about your kitchen. You can add your menu as soon as your store is ready.</p>
          <form className="vendor-form" onSubmit={createStore}>
            <label>Store name<input required minLength={2} maxLength={50} value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="e.g. Sunday Kitchen" /></label>
            <label>Short tagline<input required maxLength={70} value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="The little things, made from scratch" /></label>
            <label>Cuisine<select value={cuisine} onChange={(event) => setCuisine(event.target.value)}>{cuisines.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Your neighborhood<input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Brooklyn, NY" /></label>
            <label className="vendor-field-wide">WhatsApp number <span className="optional-label">(optional · international format)</span><input type="tel" inputMode="tel" autoComplete="tel" pattern="\+[1-9][0-9]{7,14}" maxLength={16} value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} placeholder="+14155552671" /></label>
            <div className="vendor-location-entry vendor-field-wide">
              <button type="button" className="vendor-location-button" onClick={() => void setStoreLocation()} disabled={locationBusy}>
                {locationBusy ? "Getting location..." : storeCoordinates ? "✓ Location added" : "＋ Add map location"}
              </button>
              <span>Optional. Lets nearby customers find your store first.</span>
              {locationNotice && <span role="status">{locationNotice}</span>}
            </div>
            <label className="vendor-field-wide">About your kitchen<textarea required minLength={10} maxLength={350} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What do you make, and what makes your kitchen special?" /></label>
            <button className="vendor-primary vendor-field-wide" type="submit">Create my store <span>→</span></button>
          </form>
          <p className="vendor-storage-note">Your store is tied to your vendor account and saved in the Savor database.</p>
        </section>
      ) : (
        <div className="vendor-dashboard">
          <section className="vendor-store-card">
            <div className="store-card-top">
              <div className="store-avatar">{store.name.charAt(0).toUpperCase()}</div>
              <div className="store-card-title"><span className="eyebrow">YOUR STORE · {store.cuisine.toUpperCase()}</span><h2>{store.name}</h2><p>{store.tagline}</p></div>
              <span className={store.isOpen ? "store-status status-open" : "store-status status-closed"}><i />{store.isOpen ? "OPEN" : "CLOSED"}</span>
            </div>
            <div className="store-card-meta"><span>⌖ &nbsp;{store.location}</span><span>{store.products.length} menu {store.products.length === 1 ? "item" : "items"}</span></div>
            <p className="store-about">{store.description}</p>
            <div className="vendor-location-entry">
              <button type="button" className="vendor-location-button" onClick={() => void setStoreLocation()} disabled={locationBusy}>
                {locationBusy ? "Getting location..." : store.latitude !== null && store.longitude !== null ? "Update map location" : "＋ Add map location"}
              </button>
              <span>{store.latitude !== null && store.longitude !== null ? "Your store can be sorted by distance." : "Add your map location to help nearby customers find you."}</span>
              {locationNotice && <span role="status">{locationNotice}</span>}
            </div>
            <button
              className="store-toggle"
              onClick={() => void toggleStore()}
              aria-pressed={store.isOpen}
            >
              {store.isOpen ? "Pause orders" : "Open your store"}
              <span className={store.isOpen ? "toggle-switch toggle-on" : "toggle-switch"}><i /></span>
            </button>
            <Link className="vendor-dashboard-link" href="/vendor/dashboard">
              Open full store dashboard <span>↗</span>
            </Link>
          </section>

          <section className="orders-dashboard" aria-labelledby="orders-heading">
            <div className="orders-heading">
              <div>
                <span className="eyebrow">YOUR KITCHEN, IN REAL TIME</span>
                <h2 id="orders-heading">Orders &amp; prep board</h2>
              </div>
              <span className={liveConnected ? "live-indicator live-on" : "live-indicator"}>
                <i />{liveConnected ? "LIVE UPDATES" : "RECONNECTING"}
              </span>
            </div>
            <div className="order-metrics">
              <div><span>Active orders</span><strong>{activeOrderCount}</strong></div>
              <div><span>Need your attention</span><strong>{pendingOrderCount}</strong></div>
              <div><span>Total sales</span><strong>{money.format(totalRevenue)}</strong></div>
              <div><span>Menu items</span><strong>{store.products.length}</strong></div>
            </div>
            <div className="order-board-heading">
              <strong>Incoming orders</strong>
              <span>{orders.length} total</span>
            </div>
            {ordersLoading && orders.length === 0 ? (
              <div className="orders-empty">Checking for new orders...</div>
            ) : orders.length === 0 ? (
              <div className="orders-empty"><span>🥡</span><strong>No orders yet.</strong><p>New customer orders will show up here as soon as they come in.</p></div>
            ) : (
              <div className="order-board">
                {orders.map((order) => {
                  const nextStatus = allowedNextStatus[order.status];
                  return (
                    <article className="vendor-order-card" key={order.id}>
                      <div className="vendor-order-top">
                        <div>
                          <span className="vendor-order-id">ORDER {order.id.slice(-8).toUpperCase()}</span>
                          <h3>{order.customerName}</h3>
                          <span className="vendor-order-time">{new Date(order.createdAt).toLocaleString()}</span>
                        </div>
                        <span className={`order-status status-${order.status.toLowerCase().replaceAll("_", "-")}`}>
                          <i />{statusLabels[order.status]}
                        </span>
                      </div>
                      <div className="vendor-order-items">
                        {order.items.map((item) => (
                          <div key={item.id}>
                            <span><strong>{item.quantity}×</strong> {item.name}</span>
                            <span>{money.format(item.unitPrice * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="vendor-order-bottom">
                        <span className="vendor-order-address">⌖ &nbsp;{order.deliveryAddress}</span>
                        <strong>{money.format(order.total)}</strong>
                      </div>
                      <OrderChat
                        orderId={order.id}
                        participantId={user.id}
                        participantRole="VENDOR"
                        otherParticipantName={order.customer.name}
                        unreadMessageCount={order.unreadMessageCount}
                        whatsappNumber={store.whatsappNumber ?? null}
                        storeName={store.name}
                      />
                      {nextStatus ? (
                        <div className="order-actions">
                          <button
                            className="advance-order-button"
                            disabled={updatingOrderId === order.id}
                            onClick={() => void updateOrderStatus(order, nextStatus)}
                          >
                            {updatingOrderId === order.id ? "Saving..." : `Mark ${statusLabels[nextStatus]}`}
                            <span>→</span>
                          </button>
                          {["PENDING", "CONFIRMED", "PREPARING"].includes(order.status) && (
                            <button
                              className="cancel-order-button"
                              disabled={updatingOrderId === order.id}
                              onClick={() => void updateOrderStatus(order, "CANCELLED")}
                            >Cancel</button>
                          )}
                        </div>
                      ) : (
                        <div className="order-complete-note">
                          {order.status === "DELIVERED" ? "Order delivered successfully" : "Order was cancelled"}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className={editingProductId ? "vendor-panel add-product-panel is-editing" : "vendor-panel add-product-panel"}>
            <div className="vendor-panel-heading">
              <span className="vendor-panel-icon">{editingProductId ? "✎" : "＋"}</span>
              <div><span className="eyebrow">{editingProductId ? "UPDATE YOUR MENU" : "YOUR CUSTOMERS ARE HUNGRY"}</span><h2>{editingProductId ? "Edit menu item" : "Add to your menu"}</h2></div>
            </div>
            {editingProductId && (
              <div className="vendor-edit-banner">
                <span>EDITING</span>
                <strong>{store.products.find((product) => product.id === editingProductId)?.name}</strong>
                <button type="button" onClick={resetProductForm}>Cancel</button>
              </div>
            )}
            <form id="vendor-product-form" className="vendor-form" onSubmit={saveProduct}>
              <label>Dish name<input required minLength={2} maxLength={60} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Sunday roast bowl" /></label>
              <label>Price (USD)<input required type="number" min="0.01" step="0.01" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="12.00" /></label>
              <label>Category<select value={productCategory} onChange={(event) => setProductCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Photo URL <span className="optional-label">optional</span><input type="url" value={productImage} onChange={(event) => setProductImage(event.target.value)} placeholder="https://..." /></label>
              <label className="vendor-field-wide">Upload food photo<input key={imageInputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectProductImage(event.target.files?.[0])} /></label>
              <span className="vendor-image-hint vendor-field-wide">{productImageFile ? `Selected: ${productImageFile.name}` : "JPEG, PNG, or WebP · up to 5 MB. Uploaded photo replaces the image URL."}</span>
              {(productImageFile || productImage || (editingProductId && store.products.some((product) => product.id === editingProductId))) && (
                <div className="vendor-image-preview vendor-field-wide">
                  <span>{productImageFile ? "NEW PHOTO SELECTED" : "CURRENT PHOTO"}</span>
                  {productImageFile
                    ? <strong>{productImageFile.name}</strong>
                    : <div style={{ backgroundImage: `url("${productImageUrl(productImage || store.products.find((product) => product.id === editingProductId)?.image || "")}")` }} />}
                </div>
              )}
              <label className="vendor-field-wide">Description<input required minLength={5} maxLength={120} value={productDescription} onChange={(event) => setProductDescription(event.target.value)} placeholder="A little about what's in this dish" /></label>
              <button className={editingProductId ? "vendor-primary vendor-field-wide vendor-save-edit" : "vendor-primary vendor-field-wide"} type="submit" disabled={savingProduct}>{savingProduct ? "Saving item..." : editingProductId ? "Save changes" : "Add dish to my store"} <span>{savingProduct ? "…" : "→"}</span></button>
            </form>
            {saved && <p className="vendor-saved" role="status">Changes saved — your storefront is up to date.</p>}
          </section>

          <section className="vendor-menu-panel">
            <div className="vendor-menu-heading"><div><span className="eyebrow">LIVE ON THE MARKETPLACE</span><h2>Your menu <span>({store.products.length})</span></h2></div><Link href="/">View store <span>↗</span></Link></div>
            {store.products.length ? (
              <div className="vendor-product-list">
                {store.products.map((product) => (
                  <article className="vendor-product" key={product.id}>
                    <div className="vendor-product-image" style={{ backgroundImage: `url("${productImageUrl(product.image)}")` }} />
                    <div className="vendor-product-info"><strong>{product.name}</strong><span>{product.category} · {money.format(product.price)}</span><p>{product.description}</p></div>
                    <button className="edit-product" onClick={() => editProduct(product)} aria-label={`Edit ${product.name}`} title="Edit dish">Edit</button>
                    <button className="remove-product" onClick={() => removeProduct(product.id)} aria-label={`Remove ${product.name}`} title="Remove dish">×</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="vendor-empty-menu"><span>🍽️</span><strong>Your menu is a blank plate.</strong><p>Add your first dish above and it can show up in the marketplace.</p></div>
            )}
          </section>
          <p className="vendor-storage-note">This demo saves your store on this device only. Add an API and database for accounts, shared listings, and real orders.</p>
        </div>
      )}
      <footer className="vendor-footer"><span>Made with care in Brooklyn, NY.</span><Link href="/">Back to Savor</Link></footer>
    </main>
  );
}
