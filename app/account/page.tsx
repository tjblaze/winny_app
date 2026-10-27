"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { API_BASE, ApiError, apiRequest } from "@/lib/api";
import OrderChat from "@/app/components/order-chat";
import EmailVerificationDialog from "@/app/components/email-verification-dialog";

type Account = {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "VENDOR";
};

type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

type CustomerOrder = {
  id: string;
  unreadMessageCount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  store: {
    id: string;
    name: string;
    whatsappNumber: string | null;
    reviews: Array<{
      id: string;
      rating: number;
      comment: string;
      createdAt: string;
      customer: { name: string };
    }>;
  };
  items: Array<{ id: string; name: string; unitPrice: number; quantity: number }>;
  total: number;
  review: CustomerReview | null;
};

type CustomerReview = { id: string; rating: number; comment: string; createdAt: string };

const orderProgress: OrderStatus[] = [
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  PREPARING: "Being prepared",
  READY: "Ready for delivery",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled"
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const orderDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function returnToCheckoutIfRequested(account: Account) {
  const params = new URLSearchParams(window.location.search);
  if (account.role === "CUSTOMER" && params.get("returnTo") === "checkout") {
    window.location.replace("/cart?checkout=1");
  }
}

export default function AccountPage() {
  const [user, setUser] = useState<Account | null>(null);
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersLive, setOrdersLive] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [reviewSubmitting, setReviewSubmitting] = useState("");
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    if (user?.role !== "CUSTOMER") return;

    let active = true;
    async function refreshOrders() {
      try {
        const latest = await apiRequest<CustomerOrder[]>("/orders/customer");
        if (active) {
          setOrders(latest);
          setOrdersError("");
        }
      } catch (cause) {
        if (active) {
          setOrdersError(cause instanceof Error ? cause.message : "Could not load your order updates.");
        }
      } finally {
        if (active) setOrdersLoading(false);
      }
    }

    void refreshOrders();
    const source = new EventSource(`${API_BASE}/orders/customer/events`, { withCredentials: true });
    source.onopen = () => { if (active) setOrdersLive(true); };
    source.onerror = () => { if (active) setOrdersLive(false); };
    source.addEventListener("order.updated", () => { void refreshOrders(); });
    source.addEventListener("message.created", () => { void refreshOrders(); });
    const fallback = window.setInterval(() => { void refreshOrders(); }, 15_000);

    return () => {
      active = false;
      source.close();
      window.clearInterval(fallback);
    };
  }, [user?.role]);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: Account }>("/auth/me")
      .then(({ user: account }) => {
        if (!active) return;
        setUser(account);
        returnToCheckoutIfRequested(account);
      })
      .catch((cause: unknown) => {
        if (active && !(cause instanceof ApiError && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not check your account.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setVerificationNotice("");
    const register = mode === "register";
    try {
      if (register) {
        const { message } = await apiRequest<{ message: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password })
        });
        setVerificationNotice(message);
        setVerificationOpen(true);
        setPassword("");
        return;
      }
      const { user: account } = await apiRequest<{ user: Account }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setUser(account);
      setPassword("");
      returnToCheckoutIfRequested(account);
    } catch (cause) {
      if (!register && cause instanceof ApiError && cause.status === 403) {
        setVerificationOpen(true);
        setVerificationNotice("Enter the 6-digit code sent to your email, or request a new code below.");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not sign in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setError("");
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      setUser(null);
      setPassword("");
      setOrders([]);
      setOrdersLoading(true);
      setOrdersLive(false);
      setOrdersError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>, order: CustomerOrder) {
    event.preventDefault();
    const draft = reviewDrafts[order.id] ?? { rating: 5, comment: "" };
    setReviewSubmitting(order.id);
    setReviewError("");
    try {
      const review = await apiRequest<CustomerReview>(`/orders/${encodeURIComponent(order.id)}/review`, {
        method: "POST",
        body: JSON.stringify({ rating: draft.rating, comment: draft.comment.trim() })
      });
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, review } : item));
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : "Could not save your review.");
    } finally {
      setReviewSubmitting("");
    }
  }

  return (
    <main className="account-page">
      <header className="vendor-header">
        <Link className="wordmark" href="/">savor<span className="wordmark-dot">.</span></Link>
        <Link className="back-to-market" href="/">← Back to the marketplace</Link>
      </header>
      <section className="account-layout">
        <div className="account-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR SEAT AT THE TABLE</div>
          <h1>Good things<br />are better <em>together.</em></h1>
          <p>Order something delicious, then follow every kitchen update from confirmation to delivery.</p>
          <Link className="account-vendor-link" href="/vendor">Want to sell your food? Open a vendor store ↗</Link>
        </div>
        <section className="account-card">
          {loading ? (
            <p className="vendor-loading">Checking your account...</p>
          ) : user ? (
            <div className="account-profile">
              <span className="vendor-panel-icon">✳</span>
              <span className="eyebrow">YOU&apos;RE SIGNED IN</span>
              <h2>Welcome, {user.name}.</h2>
              <p>{user.email}</p>
              <span className="account-role">{user.role === "VENDOR" ? "Vendor account" : "Customer account"}</span>
              {user.role === "CUSTOMER" && <a className="account-orders-link" href="#customer-orders-title">Track my orders <span>↓</span></a>}
              <Link href={user.role === "VENDOR" ? "/vendor" : "/"} className="vendor-primary account-action">
                {user.role === "VENDOR" ? "Go to your store" : "Find something delicious"} <span>→</span>
              </Link>
              <button className="account-switch" onClick={() => void signOut()}>Sign out</button>
            </div>
          ) : (
            <>
              <div className="eyebrow"><span className="eyebrow-line" /> {mode === "register" ? "COME ON IN" : "GOOD TO HAVE YOU BACK"}</div>
              <h2>{mode === "register" ? "Create your account" : "Sign in to Savor"}</h2>
              <p className="account-card-intro">Your next favorite meal is just around the corner.</p>
              {verificationNotice && <p className="vendor-storage-note" role="status">{verificationNotice}</p>}
              <form className="vendor-form account-form" onSubmit={submit}>
                {mode === "register" && <label className="vendor-field-wide">Your name<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" /></label>}
                <label className="vendor-field-wide">Email address<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
                <label className="vendor-field-wide">Password<input required type="password" minLength={mode === "register" ? 10 : 1} maxLength={72} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>
                {error && <p className="vendor-alert account-error" role="alert">{error}</p>}
                <button className="vendor-primary vendor-field-wide" type="submit" disabled={submitting}>{submitting ? "Please wait..." : mode === "register" ? "Create my account" : "Sign in"} <span>→</span></button>
              </form>
              <p className="account-switch">
                {mode === "register" ? "Already have an account?" : "New to Savor?"}{" "}
                <button onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); setVerificationNotice(""); }}>
                  {mode === "register" ? "Sign in" : "Create an account"}
                </button>
              </p>
            </>
          )}
          {error && user && <p className="vendor-alert account-error" role="alert">{error}</p>}
        </section>
      </section>
      <EmailVerificationDialog
        email={email}
        open={verificationOpen}
        onClose={() => setVerificationOpen(false)}
        onVerified={(message) => {
          setVerificationOpen(false);
          setMode("login");
          setVerificationNotice(message);
        }}
      />
      {user?.role === "CUSTOMER" && (
        <section className="customer-orders" aria-labelledby="customer-orders-title">
          <div className="customer-orders-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> FROM KITCHEN TO YOUR DOOR</div>
              <h2 id="customer-orders-title">Your <em>orders.</em></h2>
              <p>Follow each order as the kitchen confirms, prepares, and sends it your way.</p>
            </div>
            <span className={`customer-orders-live${ordersLive ? " is-live" : ""}`} role="status">
              <i /> {ordersLive ? "LIVE UPDATES" : "RECONNECTING"}
            </span>
          </div>
          {ordersError && <p className="vendor-alert customer-orders-alert" role="alert">{ordersError}</p>}
          {ordersLoading && orders.length === 0 ? (
            <div className="customer-orders-empty"><p>Loading your latest orders...</p></div>
          ) : orders.length === 0 ? (
            <div className="customer-orders-empty">
              <span aria-hidden="true">🥡</span>
              <strong>No orders yet</strong>
              <p>Your orders and kitchen updates will show up here.</p>
              <Link className="vendor-primary customer-orders-browse" href="/">Explore the menu <span>→</span></Link>
            </div>
          ) : (
            <div className="customer-order-list">
              {orders.map((order) => {
                const currentStep = orderProgress.indexOf(order.status);
                const cancelled = order.status === "CANCELLED";
                const otherReviews = order.store.reviews.filter((review) => review.id !== order.review?.id);
                return (
                  <article className="customer-order-card" key={order.id}>
                    <div className="customer-order-top">
                      <div>
                        <span className="customer-order-id">ORDER {order.id.slice(-8).toUpperCase()}</span>
                        <h3>{order.store.name}</h3>
                        <time dateTime={order.createdAt}>{orderDate.format(new Date(order.createdAt))}</time>
                      </div>
                      <span className={`customer-order-status status-${order.status.toLowerCase().replaceAll("_", "-")}`}>
                        <i /> {orderStatusLabels[order.status]}
                      </span>
                    </div>
                    <p className="customer-order-updated">
                      Updated {orderDate.format(new Date(order.updatedAt))}
                    </p>
                    {cancelled ? (
                      <p className="customer-order-cancelled">This order was cancelled. Contact the kitchen if you need more information.</p>
                    ) : (
                      <ol className="customer-order-progress" aria-label={`Order progress: ${orderStatusLabels[order.status]}`}>
                        {orderProgress.map((step, index) => {
                          const complete = order.status === "DELIVERED" || (currentStep >= 0 && index < currentStep);
                          const current = step === order.status || (order.status === "PENDING" && index === 0);
                          return (
                            <li className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} key={step}>
                              <span className="customer-order-step-dot">{complete ? "✓" : index + 1}</span>
                              <span>{order.status === "PENDING" && step === "CONFIRMED" ? "Awaiting confirm" : orderStatusLabels[step]}</span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    <div className="customer-order-items">
                      {order.items.map((item) => (
                        <div key={item.id}>
                          <span>{item.quantity} × {item.name}</span>
                          <span>{money.format(item.unitPrice * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="customer-order-bottom">
                      <span>Order total</span>
                      <strong>{money.format(order.total)}</strong>
                    </div>
                    <OrderChat
                      orderId={order.id}
                      participantId={user.id}
                      participantRole="CUSTOMER"
                      otherParticipantName={order.store.name}
                      unreadMessageCount={order.unreadMessageCount}
                      whatsappNumber={order.store.whatsappNumber}
                      storeName={order.store.name}
                    />
                    {order.review ? (
                      <div className="customer-order-own-review">
                        <span className="customer-review-stars" aria-label={`${order.review.rating} out of 5 stars`}>
                          {"★".repeat(order.review.rating)}{"☆".repeat(5 - order.review.rating)}
                        </span>
                        <strong>Your review</strong>
                        <p>{order.review.comment}</p>
                      </div>
                    ) : order.status === "DELIVERED" ? (
                      <form className="customer-review-form" onSubmit={(event) => void submitReview(event, order)}>
                        <h4>How was your order?</h4>
                        <fieldset>
                          <legend>Your rating</legend>
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              aria-label={`Rate ${rating} out of 5`}
                              aria-pressed={(reviewDrafts[order.id]?.rating ?? 5) === rating}
                              className={(reviewDrafts[order.id]?.rating ?? 5) >= rating ? "is-selected" : ""}
                              key={rating}
                              onClick={() => setReviewDrafts((current) => ({
                                ...current,
                                [order.id]: { rating, comment: current[order.id]?.comment ?? "" }
                              }))}
                              type="button"
                            >★</button>
                          ))}
                        </fieldset>
                        <label htmlFor={`review-${order.id}`}>Share a few words
                          <textarea
                            id={`review-${order.id}`}
                            required
                            minLength={5}
                            maxLength={1000}
                            value={reviewDrafts[order.id]?.comment ?? ""}
                            onChange={(event) => setReviewDrafts((current) => ({
                              ...current,
                              [order.id]: { rating: current[order.id]?.rating ?? 5, comment: event.target.value }
                            }))}
                            placeholder="What did you enjoy?"
                          />
                        </label>
                        {reviewError && <p className="customer-review-error" role="alert">{reviewError}</p>}
                        <button className="customer-review-submit" disabled={reviewSubmitting === order.id}>
                          {reviewSubmitting === order.id ? "Saving review..." : "Share review"}
                        </button>
                      </form>
                    ) : null}
                    {otherReviews.length > 0 && (
                      <div className="customer-store-reviews">
                        <h4>More from {order.store.name}</h4>
                        {otherReviews.map((review) => (
                          <article key={review.id}>
                            <div>
                              <strong>{review.customer.name}</strong>
                              <span className="customer-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                                {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                              </span>
                            </div>
                            <p>{review.comment}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <p className="customer-orders-note">
            {ordersLive
              ? "This page updates automatically when the kitchen changes your order status."
              : "Live updates are reconnecting. Your orders will refresh automatically in the meantime."}
          </p>
        </section>
      )}
      <footer className="vendor-footer"><span>Made with care in Brooklyn, NY.</span><Link href="/">Back to Savor</Link></footer>
    </main>
  );
}
