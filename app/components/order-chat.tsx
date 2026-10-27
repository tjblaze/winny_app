"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { API_BASE, apiRequest } from "@/lib/api";

type OrderMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; role: "CUSTOMER" | "VENDOR" };
};

type OrderChatProps = {
  orderId: string;
  participantId: string;
  participantRole: "CUSTOMER" | "VENDOR";
  otherParticipantName: string;
  unreadMessageCount: number;
  whatsappNumber: string | null;
  storeName: string;
};

const messageDate = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export default function OrderChat({
  orderId,
  participantId,
  participantRole,
  otherParticipantName,
  unreadMessageCount,
  whatsappNumber,
  storeName
}: OrderChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [readAtUnreadCount, setReadAtUnreadCount] = useState<number | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef<number | null>(null);
  const otherTypingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);

  const unread = readAtUnreadCount === unreadMessageCount ? 0 : unreadMessageCount;

  const markMessagesRead = useCallback(async () => {
    try {
      await apiRequest(`/orders/${encodeURIComponent(orderId)}/messages/read`, { method: "POST" });
      setReadAtUnreadCount(unreadMessageCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update unread messages.");
    }
  }, [orderId, unreadMessageCount]);

  const sendTypingStatus = useCallback(async (isTyping: boolean) => {
    try {
      await apiRequest(`/orders/${encodeURIComponent(orderId)}/messages/typing`, {
        method: "POST",
        body: JSON.stringify({ isTyping })
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update typing status.");
    }
  }, [orderId]);

  function updateDraft(value: string) {
    setDraft(value);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);

    if (!value.trim()) {
      if (typingActive.current) {
        typingActive.current = false;
        void sendTypingStatus(false);
      }
      return;
    }

    if (!typingActive.current) {
      typingActive.current = true;
      void sendTypingStatus(true);
    }
    typingTimer.current = window.setTimeout(() => {
      typingActive.current = false;
      void sendTypingStatus(false);
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (otherTypingTimer.current !== null) window.clearTimeout(otherTypingTimer.current);
      if (typingActive.current) void sendTypingStatus(false);
    };
  }, [sendTypingStatus]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function refreshMessages() {
      try {
        const latest = await apiRequest<OrderMessage[]>(`/orders/${encodeURIComponent(orderId)}/messages`);
        if (active) {
          setMessages(latest);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this conversation.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void refreshMessages();
    const source = new EventSource(
      `${API_BASE}/orders/${encodeURIComponent(orderId)}/messages/events`,
      { withCredentials: true }
    );
    source.onopen = () => { if (active) setLive(true); };
    source.onerror = () => { if (active) setLive(false); };
    source.addEventListener("message.created", (event) => {
      const { senderId } = JSON.parse((event as MessageEvent).data) as { senderId: string };
      void refreshMessages();
      if (senderId !== participantId) void markMessagesRead();
    });
    source.addEventListener("typing.changed", (event) => {
      const typingEvent = JSON.parse((event as MessageEvent).data) as {
        userId: string;
        isTyping: boolean;
      };
      if (typingEvent.userId === participantId) return;
      setOtherTyping(typingEvent.isTyping);
      if (otherTypingTimer.current !== null) window.clearTimeout(otherTypingTimer.current);
      if (typingEvent.isTyping) {
        otherTypingTimer.current = window.setTimeout(() => setOtherTyping(false), 3500);
      }
    });
    const fallback = window.setInterval(() => { void refreshMessages(); }, 15_000);
    return () => {
      active = false;
      source.close();
      window.clearInterval(fallback);
    };
  }, [markMessagesRead, open, orderId, participantId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await apiRequest<OrderMessage>(
        `/orders/${encodeURIComponent(orderId)}/messages`,
        { method: "POST", body: JSON.stringify({ body }) }
      );
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      updateDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${storeName}, I have a question about order ${orderId.slice(-8).toUpperCase()}.`)}`
    : null;

  return (
    <section className="order-contact">
      <div className="order-contact-actions">
        <button
          className="order-chat-toggle"
          type="button"
          aria-expanded={open}
          onClick={() => {
            const opening = !open;
            setOpen(opening);
            if (opening) void markMessagesRead();
            else {
              setOtherTyping(false);
              if (otherTypingTimer.current !== null) window.clearTimeout(otherTypingTimer.current);
            }
          }}
        >
          <span aria-hidden="true">✉</span> {open ? "Close chat" : participantRole === "CUSTOMER" ? "Message the kitchen" : "Message customer"}
          {!open && unread > 0 && <span className="order-chat-unread" aria-label={`${unread} unread messages`}>{unread > 99 ? "99+" : unread}</span>}
        </button>
        {whatsappUrl ? (
          <a className="order-whatsapp-link" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">↗</span> WhatsApp
          </a>
        ) : (
          <span className="order-whatsapp-unavailable">WhatsApp not set up</span>
        )}
      </div>
      {open && (
        <div className="order-chat-panel">
          <div className="order-chat-heading">
            <strong>Chat with {otherParticipantName}</strong>
            <span className="order-chat-connection">
              <i className={live ? "is-live" : ""} /> {live ? "LIVE" : "RECONNECTING"} · ORDER {orderId.slice(-8).toUpperCase()}
            </span>
          </div>
          <div className="order-chat-messages" aria-live="polite">
            {loading && messages.length === 0 ? (
              <p className="order-chat-empty">Loading conversation...</p>
            ) : messages.length === 0 ? (
              <p className="order-chat-empty">No messages yet. Send a note to the kitchen.</p>
            ) : messages.map((message) => (
              <article
                className={`order-chat-message${message.sender.id === participantId ? " is-mine" : ""}`}
                key={message.id}
              >
                <div><strong>{message.sender.id === participantId ? "You" : message.sender.name}</strong><time dateTime={message.createdAt}>{messageDate.format(new Date(message.createdAt))}</time></div>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
          {otherTyping && (
            <p className="order-chat-typing" role="status" aria-live="polite">
              <span><i /><i /><i /></span>
              {otherParticipantName} is typing...
            </p>
          )}
          {error && <p className="order-chat-error" role="alert">{error}</p>}
          <form className="order-chat-form" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor={`message-${orderId}`}>
              Message {participantRole === "CUSTOMER" ? "the kitchen" : "the customer"}
            </label>
            <input
              id={`message-${orderId}`}
              value={draft}
              onChange={(event) => updateDraft(event.target.value)}
              onBlur={() => {
                if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
                if (typingActive.current) {
                  typingActive.current = false;
                  void sendTypingStatus(false);
                }
              }}
              maxLength={2000}
              placeholder="Write a message..."
            />
            <button type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending..." : "Send"}</button>
          </form>
        </div>
      )}
    </section>
  );
}
