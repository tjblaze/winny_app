"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { API_BASE, ApiError, apiRequest } from "@/lib/api";
import { getCurrentCoordinates } from "@/lib/geolocation";
import { productImageUrl, uploadProductImage } from "@/lib/product-image";
import type { VendorProduct, VendorStore } from "@/lib/vendor-store";
import OrderChat from "@/app/components/order-chat";

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
  total: number;
  createdAt: string;
  items: Array<{ id: string; name: string; unitPrice: number; quantity: number }>;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const categories = ["Bowls", "Burgers", "Pizza", "Salads", "Desserts", "Drinks", "Sides"];
const fallbackImage = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85";
const activeStatuses: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED"
};
const statusLabels: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled"
};

export default function VendorDashboardPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [store, setStore] = useState<VendorStore | null>(null);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [updatingOrder, setUpdatingOrder] = useState("");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState(categories[0]);
  const [productImage, setProductImage] = useState("");
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const pendingCount = useMemo(() => orders.filter((order) => order.status === "PENDING").length, [orders]);
  const activeCount = useMemo(() => orders.filter((order) => activeStatuses.includes(order.status)).length, [orders]);
  const sales = useMemo(
    () => orders.filter((order) => order.status !== "CANCELLED").reduce((sum, order) => sum + order.subtotal, 0),
    [orders]
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await apiRequest<{ user: Account }>("/auth/me");
        if (!active) return;
        setAccount(response.user);
        if (response.user.role !== "VENDOR") return;
        const ownedStore = await apiRequest<VendorStore>("/stores/me");
        if (active) {
          setStore(ownedStore);
          setWhatsappNumber(ownedStore.whatsappNumber ?? "");
        }
      } catch (cause) {
        if (!active) return;
        if (!(cause instanceof ApiError && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not load your store dashboard.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!store?.id || account?.role !== "VENDOR") return;
    let active = true;
    async function refreshOrders() {
      try {
        const latest = await apiRequest<VendorOrder[]>("/orders/vendor");
        if (active) setOrders(latest);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not refresh your orders.");
      } finally {
        if (active) setOrdersLoading(false);
      }
    }
    void refreshOrders();
    const source = new EventSource(`${API_BASE}/orders/vendor/events`, { withCredentials: true });
    source.onopen = () => { if (active) setLive(true); };
    source.onerror = () => { if (active) setLive(false); };
    source.addEventListener("order.updated", () => { void refreshOrders(); });
    source.addEventListener("message.created", () => { void refreshOrders(); });
    const fallback = window.setInterval(() => { void refreshOrders(); }, 15_000);
    return () => {
      active = false;
      source.close();
      window.clearInterval(fallback);
    };
  }, [account?.role, store?.id]);

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

  async function updateStoreLocation() {
    setSavingLocation(true);
    setLocationMessage("");
    setError("");
    try {
      const coordinates = await getCurrentCoordinates();
      const updated = await apiRequest<VendorStore>("/stores/me/location", {
        method: "PATCH",
        body: JSON.stringify(coordinates)
      });
      setStore(updated);
      setLocationMessage("Store location updated for nearby customer searches.");
    } catch (cause) {
      setLocationMessage(cause instanceof Error ? cause.message : "Could not update your store location.");
    } finally {
      setSavingLocation(false);
    }
  }

  async function saveStoreContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingContact(true);
    setContactMessage("");
    setError("");
    try {
      const updated = await apiRequest<VendorStore>("/stores/me/contact", {
        method: "PATCH",
        body: JSON.stringify({ whatsappNumber: whatsappNumber.trim() || null })
      });
      setStore(updated);
      setWhatsappNumber(updated.whatsappNumber ?? "");
      setContactMessage(updated.whatsappNumber
        ? "WhatsApp contact saved. Customers can now reach your kitchen."
        : "WhatsApp contact removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your WhatsApp contact.");
    } finally {
      setSavingContact(false);
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
      });
      setStore((current) => current ? {
        ...current,
        products: editingProductId
          ? current.products.map((item) => item.id === product.id ? product : item)
          : [product, ...current.products]
      } : current);
      resetProductForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this menu item.");
    } finally {
      setSavingProduct(false);
    }
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

  async function removeProduct(productId: string) {
    setError("");
    try {
      await apiRequest(`/stores/me/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
      setStore((current) => current
        ? { ...current, products: current.products.filter((product) => product.id !== productId) }
        : current);
      if (editingProductId === productId) resetProductForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this menu item.");
    }
  }

  async function changeOrderStatus(order: VendorOrder, status: OrderStatus) {
    setUpdatingOrder(order.id);
    setError("");
    try {
      const updated = await apiRequest<VendorOrder>(
        `/orders/vendor/${encodeURIComponent(order.id)}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) }
      );
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this order.");
    } finally {
      setUpdatingOrder("");
    }
  }

  async function signOut() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      setAccount(null);
      setStore(null);
      setOrders([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  if (loading) {
    return <main className="vendor-hub"><p className="vendor-hub-loading">Opening your store dashboard...</p></main>;
  }

  return (
    <main className="vendor-hub">
      <header className="vendor-hub-header">
        <Link className="wordmark" href="/">savor<span className="wordmark-dot">.</span></Link>
        <nav aria-label="Vendor navigation">
          <Link className="vendor-hub-nav-active" href="/vendor/dashboard">Dashboard</Link>
          <Link href="/vendor">Store setup</Link>
          <Link href="/">Marketplace</Link>
        </nav>
        {account && <button onClick={() => void signOut()}>Sign out</button>}
      </header>

      <div className="vendor-hub-content">
        {error && <p className="vendor-alert vendor-hub-alert" role="alert">{error}</p>}
        {!account ? (
          <section className="vendor-hub-gate">
            <span className="vendor-hub-mark">✳</span>
            <span className="eyebrow">VENDOR WORKSPACE</span>
            <h1>Your kitchen, <em>all in one place.</em></h1>
            <p>Sign in with your vendor account to see your store, menu inventory, and incoming orders.</p>
            <Link className="vendor-hub-primary" href="/vendor">Sign in or create a store <span>→</span></Link>
          </section>
        ) : account.role !== "VENDOR" ? (
          <section className="vendor-hub-gate">
            <span className="vendor-hub-mark">☺</span>
            <span className="eyebrow">CUSTOMER ACCOUNT</span>
            <h1>This dashboard is for <em>store owners.</em></h1>
            <p>Sign out and open or create a vendor account to manage a Savor store.</p>
            <button className="vendor-hub-primary" onClick={() => void signOut()}>Sign out <span>→</span></button>
          </section>
        ) : !store ? (
          <section className="vendor-hub-gate">
            <span className="vendor-hub-mark">✳</span>
            <span className="eyebrow">YOUR STORE STARTS HERE</span>
            <h1>Set up your <em>kitchen.</em></h1>
            <p>Create your store profile before managing menu items and orders.</p>
            <Link className="vendor-hub-primary" href="/vendor">Create your store <span>→</span></Link>
          </section>
        ) : (
          <>
            <section className="vendor-hub-welcome">
              <div>
                <span className="eyebrow"><span className="eyebrow-line" /> VENDOR WORKSPACE</span>
                <h1>Good to see you, <em>{account.name.split(" ")[0]}.</em></h1>
                <p>Here&apos;s what&apos;s happening at your kitchen today.</p>
              </div>
              <span className={live ? "vendor-hub-live is-live" : "vendor-hub-live"}><i />{live ? "LIVE ORDER UPDATES" : "CONNECTING TO LIVE UPDATES"}</span>
            </section>

            <section className="vendor-hub-store">
              <div className="vendor-hub-store-main">
                <div className="vendor-hub-store-avatar">{store.name.charAt(0).toUpperCase()}</div>
                <div className="vendor-hub-store-copy">
                  <span className="eyebrow">YOUR STORE · {store.cuisine.toUpperCase()}</span>
                  <h2>{store.name}</h2>
                  <p>{store.tagline}</p>
                </div>
                <span className={store.isOpen ? "vendor-hub-store-state is-open" : "vendor-hub-store-state"}>
                  <i />{store.isOpen ? "OPEN FOR ORDERS" : "PAUSED"}
                </span>
              </div>
              <div className="vendor-hub-store-details">
                <span>⌖ &nbsp;{store.location}</span>
                <span>{store.products.length} menu {store.products.length === 1 ? "item" : "items"}</span>
                <p>{store.description}</p>
                <div className="vendor-hub-location">
                  <button type="button" onClick={() => void updateStoreLocation()} disabled={savingLocation}>
                    {savingLocation ? "Getting location..." : store.latitude !== null && store.longitude !== null ? "Update map location" : "Add map location"}
                  </button>
                  <span>{locationMessage || (store.latitude !== null && store.longitude !== null
                    ? "Customers can find you by distance."
                    : "Add your location so nearby customers can find your store.")}</span>
                </div>
                <form className="vendor-hub-contact-form" onSubmit={saveStoreContact}>
                    <label htmlFor="vendor-whatsapp">WhatsApp number</label>
                    <div>
                      <input
                        id="vendor-whatsapp"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        pattern="\+[1-9][0-9]{7,14}"
                        maxLength={16}
                        value={whatsappNumber}
                        onChange={(event) => setWhatsappNumber(event.target.value)}
                        placeholder="+14155552671"
                      />
                      <button type="submit" disabled={savingContact}>
                        {savingContact ? "Saving..." : "Save contact"}
                      </button>
                    </div>
                    <span>Optional. Use international format; customers can contact you from their order.</span>
                    {contactMessage && <span role="status">{contactMessage}</span>}
                </form>
                <button onClick={() => void toggleStore()}>{store.isOpen ? "Pause incoming orders" : "Open your store"} <span>→</span></button>
              </div>
            </section>

            <section className="vendor-hub-stats" aria-label="Store overview">
              <article><span>Active orders</span><strong>{activeCount}</strong><small>Currently in progress</small></article>
              <article><span>New orders</span><strong>{pendingCount}</strong><small>Waiting for confirmation</small></article>
              <article><span>Sales to date</span><strong>{money.format(sales)}</strong><small>Excludes cancelled orders</small></article>
              <article><span>Menu inventory</span><strong>{store.products.length}</strong><small>Items in your store</small></article>
            </section>

            <section className="vendor-hub-orders">
              <div className="vendor-hub-section-heading">
                <div><span className="eyebrow">THE PREP BOARD</span><h2>Incoming orders</h2></div>
                <span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span>
              </div>
              {ordersLoading && orders.length === 0 ? (
                <div className="vendor-hub-empty">Loading your orders...</div>
              ) : orders.length === 0 ? (
                <div className="vendor-hub-empty"><span>🥡</span><strong>No orders just yet</strong><p>New orders from customers will appear here.</p></div>
              ) : (
                <div className="vendor-hub-order-grid">
                  {orders.map((order) => {
                    const advanceTo = nextStatus[order.status];
                    return (
                      <article className="vendor-hub-order" key={order.id}>
                        <div className="vendor-hub-order-top">
                          <div><span>ORDER {order.id.slice(-8).toUpperCase()}</span><h3>{order.customerName}</h3><small>{new Date(order.createdAt).toLocaleString()}</small></div>
                          <span className={`vendor-hub-order-status status-${order.status.toLowerCase().replaceAll("_", "-")}`}>{statusLabels[order.status]}</span>
                        </div>
                        <div className="vendor-hub-order-lines">
                          {order.items.map((item) => <div key={item.id}><span><b>{item.quantity}×</b> {item.name}</span><span>{money.format(item.unitPrice * item.quantity)}</span></div>)}
                        </div>
                        <p className="vendor-hub-address">⌖ &nbsp;{order.deliveryAddress}</p>
                        <OrderChat
                          orderId={order.id}
                          participantId={account.id}
                          participantRole="VENDOR"
                          otherParticipantName={order.customerName}
                          unreadMessageCount={order.unreadMessageCount}
                          whatsappNumber={store.whatsappNumber ?? null}
                          storeName={store.name}
                        />
                        <div className="vendor-hub-order-bottom">
                          <strong>{money.format(order.total)}</strong>
                          {advanceTo ? (
                            <button disabled={updatingOrder === order.id} onClick={() => void changeOrderStatus(order, advanceTo)}>
                              {updatingOrder === order.id ? "Saving..." : `Mark ${statusLabels[advanceTo]}`} <span>→</span>
                            </button>
                          ) : <span className="vendor-hub-finished">{statusLabels[order.status]}</span>}
                        </div>
                        {["PENDING", "CONFIRMED", "PREPARING", "READY"].includes(order.status) && (
                          <button className="vendor-hub-cancel" disabled={updatingOrder === order.id} onClick={() => void changeOrderStatus(order, "CANCELLED")}>Cancel order</button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="vendor-hub-inventory">
              <div className="vendor-hub-section-heading">
                <div><span className="eyebrow">FRESH FROM YOUR KITCHEN</span><h2>Store &amp; menu</h2></div>
                <span>{store.products.length} {store.products.length === 1 ? "item" : "items"}</span>
              </div>
              <div className="vendor-hub-inventory-layout">
                <form id="vendor-product-form" className={editingProductId ? "vendor-hub-add-form is-editing" : "vendor-hub-add-form"} onSubmit={saveProduct}>
                  <div className="vendor-hub-form-heading">
                    <span className="vendor-hub-form-icon">{editingProductId ? "✎" : "+"}</span>
                    <div>
                      <span className="eyebrow">{editingProductId ? "UPDATE YOUR MENU" : "GROW YOUR MENU"}</span>
                      <h3>{editingProductId ? "Edit menu item" : "Add to your menu"}</h3>
                    </div>
                  </div>
                  {editingProductId && (
                    <div className="vendor-hub-edit-banner">
                      <span>Editing</span>
                      <strong>{store.products.find((product) => product.id === editingProductId)?.name}</strong>
                      <button type="button" onClick={resetProductForm}>Cancel</button>
                    </div>
                  )}
                  <label>Dish name<input required minLength={2} maxLength={70} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Sunday roast bowl" /></label>
                  <label>Description<input required minLength={5} maxLength={180} value={productDescription} onChange={(event) => setProductDescription(event.target.value)} placeholder="What makes it special?" /></label>
                  <div className="vendor-hub-form-row">
                    <label>Price<input required type="number" min="0.01" step="0.01" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="12.00" /></label>
                    <label>Category<select value={productCategory} onChange={(event) => setProductCategory(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                  </div>
                  <label>Image URL <span className="vendor-hub-optional">(optional)</span><input type="url" value={productImage} onChange={(event) => setProductImage(event.target.value)} placeholder="https://..." /></label>
                  <label>Upload food photo<input key={imageInputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectProductImage(event.target.files?.[0])} /></label>
                  <span className="vendor-hub-file-hint">{productImageFile ? `Selected: ${productImageFile.name}` : "JPEG, PNG, or WebP · up to 5 MB. Uploaded photo replaces the image URL."}</span>
                  {(productImageFile || productImage || (editingProductId && store.products.some((product) => product.id === editingProductId))) && (
                    <div className="vendor-hub-image-preview">
                      <span>{productImageFile ? "NEW PHOTO" : "CURRENT PHOTO"}</span>
                      {productImageFile
                        ? <strong>{productImageFile.name}</strong>
                        : <div style={{ backgroundImage: `url("${productImageUrl(productImage || store.products.find((product) => product.id === editingProductId)?.image || "")}")` }} />}
                    </div>
                  )}
                  <button className={editingProductId ? "vendor-hub-primary vendor-hub-save-edit" : "vendor-hub-primary"} disabled={savingProduct}>{savingProduct ? "Saving item..." : editingProductId ? "Save changes" : "Add menu item"} <span>{editingProductId ? "✓" : "+"}</span></button>
                </form>
                <div className="vendor-hub-product-list">
                  {store.products.length === 0 ? (
                    <div className="vendor-hub-empty"><span>🍽️</span><strong>Your menu is ready for its first dish</strong><p>Add a menu item to start taking orders.</p></div>
                  ) : store.products.map((product) => (
                    <article className="vendor-hub-product" key={product.id}>
                      <div className="vendor-hub-product-image" style={{ backgroundImage: `url("${productImageUrl(product.image)}")` }} />
                      <div className="vendor-hub-product-copy"><span>{product.category}</span><h3>{product.name}</h3><p>{product.description}</p></div>
                      <strong>{money.format(product.price)}</strong>
                      <div className="vendor-hub-product-actions">
                        <button className="vendor-hub-edit-product" aria-label={`Edit ${product.name}`} onClick={() => editProduct(product)}>Edit</button>
                        <button aria-label={`Remove ${product.name} from menu`} onClick={() => void removeProduct(product.id)}>×</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
        {account && <p className="vendor-hub-account">Signed in as {account.email}</p>}
      </div>
    </main>
  );
}
