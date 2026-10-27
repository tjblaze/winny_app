import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import type { MessageEvent } from "@nestjs/common";
import { Observable, Subject, filter, map, merge } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { CreateOrderMessageDto } from "./dto/create-order-message.dto";
import type { CreateReviewDto } from "./dto/create-review.dto";
import type { UpdateOrderStatusDto } from "./dto/update-order-status.dto";

const orderInclude = {
  items: {
    select: { id: true, name: true, unitPrice: true, quantity: true }
  },
  store: {
    select: {
      id: true,
      name: true,
      whatsappNumber: true,
      reviews: {
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          customer: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" as const },
        take: 3
      }
    }
  },
  review: { select: { id: true, rating: true, comment: true, createdAt: true } }
} as const;

type OrderChangedEvent = {
  vendorId: string;
  customerId: string;
  orderId: string;
};

type MessageChangedEvent = {
  orderId: string;
  vendorId: string;
  customerId: string;
  senderId: string;
};
type TypingChangedEvent = { orderId: string; userId: string; isTyping: boolean };

const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: []
};

@Injectable()
export class OrdersService {
  private readonly changes = new Subject<OrderChangedEvent>();
  private readonly messageChanges = new Subject<MessageChangedEvent>();
  private readonly typingChanges = new Subject<TypingChangedEvent>();

  constructor(private readonly prisma: PrismaService) {}

  async create(customer: AuthUser, input: CreateOrderDto) {
    if (!input.demoPaymentConfirmed) {
      throw new BadRequestException("Confirm the demo payment before placing your order.");
    }

    const quantities = new Map<string, number>();
    for (const line of input.items) {
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...quantities.keys()] }, store: { isOpen: true } },
      select: {
        id: true,
        name: true,
        price: true,
        storeId: true,
        store: { select: { id: true, name: true, vendorId: true, isOpen: true } }
      }
    });
    if (products.length !== quantities.size) {
      throw new BadRequestException(
        "One or more menu items are unavailable. Refresh the menu and try again."
      );
    }

    const productsByStore = new Map<string, typeof products>();
    for (const product of products) {
      const storeProducts = productsByStore.get(product.storeId) ?? [];
      storeProducts.push(product);
      productsByStore.set(product.storeId, storeProducts);
    }

    const createdOrders = await this.prisma.$transaction(
      [...productsByStore.entries()].map(([storeId, storeProducts]) => {
        const subtotal = storeProducts.reduce(
          (sum, product) => sum + product.price * (quantities.get(product.id) ?? 0),
          0
        );
        const deliveryFee = 3.5;
        return this.prisma.order.create({
          data: {
            customerId: customer.id,
            storeId,
            customerName: input.customerName.trim(),
            deliveryAddress: input.deliveryAddress.trim(),
            subtotal,
            deliveryFee,
            total: subtotal + deliveryFee,
            items: {
              create: storeProducts.map((product) => ({
                productId: product.id,
                name: product.name,
                unitPrice: product.price,
                quantity: quantities.get(product.id) ?? 0
              }))
            }
          },
          include: orderInclude
        });
      })
    );

    for (const order of createdOrders) {
      const product = productsByStore.get(order.storeId)?.[0];
      if (product) {
        this.changes.next({
          vendorId: product.store.vendorId,
          customerId: customer.id,
          orderId: order.id
        });
      }
    }
    return createdOrders;
  }

  async listForVendor(vendor: AuthUser) {
    const orders = await this.prisma.order.findMany({
      where: { store: { vendorId: vendor.id } },
      include: {
        ...orderInclude,
        _count: {
          select: {
            messages: {
              where: { senderId: { not: vendor.id }, vendorReadAt: null }
            }
          }
        },
        customer: { select: { id: true, name: true, email: true } }
      },
      orderBy: [{ createdAt: "desc" }]
    });
    return orders.map(({ _count, ...order }) => ({
      ...order,
      unreadMessageCount: _count.messages
    }));
  }

  async listForCustomer(customer: AuthUser) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: customer.id },
      include: {
        ...orderInclude,
        _count: {
          select: {
            messages: {
              where: { senderId: { not: customer.id }, customerReadAt: null }
            }
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
    return orders.map(({ _count, ...order }) => ({
      ...order,
      unreadMessageCount: _count.messages
    }));
  }

  async createReview(customer: AuthUser, orderId: string, input: CreateReviewDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId: customer.id },
      select: { id: true, storeId: true, status: true, review: { select: { id: true } } }
    });
    if (!order) throw new NotFoundException("Order not found.");
    if (order.status !== OrderStatus.DELIVERED) {
      throw new ConflictException("You can review an order after it has been delivered.");
    }
    if (order.review) throw new ConflictException("You have already reviewed this order.");

    return this.prisma.review.create({
      data: {
        orderId: order.id,
        storeId: order.storeId,
        customerId: customer.id,
        rating: input.rating,
        comment: input.comment.trim()
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true
      }
    });
  }

  async listMessages(user: AuthUser, orderId: string) {
    await this.requireOrderParticipant(user, orderId);
    const messages = await this.prisma.orderMessage.findMany({
      where: { orderId },
      select: {
        id: true,
        body: true,
        createdAt: true,
        sender: { select: { id: true, name: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return messages.reverse();
  }

  async createMessage(user: AuthUser, orderId: string, input: CreateOrderMessageDto) {
    const order = await this.requireOrderParticipant(user, orderId);
    const message = await this.prisma.orderMessage.create({
      data: { orderId, senderId: user.id, body: input.body.trim() },
      select: {
        id: true,
        body: true,
        createdAt: true,
        sender: { select: { id: true, name: true, role: true } }
      }
    });
    this.messageChanges.next({
      orderId,
      vendorId: order.store.vendorId,
      customerId: order.customerId,
      senderId: user.id
    });
    return message;
  }

  async markMessagesRead(user: AuthUser, orderId: string) {
    await this.requireOrderParticipant(user, orderId);
    const readAt = new Date();
    const result = await this.prisma.orderMessage.updateMany({
      where: {
        orderId,
        senderId: { not: user.id },
        ...(user.role === "CUSTOMER" ? { customerReadAt: null } : { vendorReadAt: null })
      },
      data: user.role === "CUSTOMER" ? { customerReadAt: readAt } : { vendorReadAt: readAt }
    });
    return { markedRead: result.count };
  }

  async updateTyping(user: AuthUser, orderId: string, input: { isTyping: boolean }) {
    await this.requireOrderParticipant(user, orderId);
    this.typingChanges.next({ orderId, userId: user.id, isTyping: input.isTyping });
    return { isTyping: input.isTyping };
  }

  async messageEvents(user: AuthUser, orderId: string): Promise<Observable<MessageEvent>> {
    await this.requireOrderParticipant(user, orderId);
    const messages = this.messageChanges.pipe(
      filter((event) => event.orderId === orderId),
      map((event) => ({ type: "message.created", data: { orderId, senderId: event.senderId } }))
    );
    const typing = this.typingChanges.pipe(
      filter((event) => event.orderId === orderId),
      map((event) => ({
        type: "typing.changed",
        data: { userId: event.userId, isTyping: event.isTyping }
      }))
    );
    return merge(messages, typing);
  }

  private async requireOrderParticipant(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [
          { customerId: user.id },
          { store: { vendorId: user.id } }
        ]
      },
      select: { id: true, customerId: true, store: { select: { vendorId: true } } }
    });
    if (!order) throw new NotFoundException("Order not found.");
    return order;
  }

  async updateStatus(vendor: AuthUser, orderId: string, input: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, store: { vendorId: vendor.id } },
      include: { store: { select: { vendorId: true } } }
    });
    if (!order) throw new NotFoundException("Order not found in your store.");
    if (!validTransitions[order.status].includes(input.status)) {
      throw new ConflictException(
        `An order cannot move from ${order.status} to ${input.status}.`
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: input.status },
      include: {
        ...orderInclude,
        customer: { select: { id: true, name: true, email: true } }
      }
    });
    this.changes.next({
      vendorId: vendor.id,
      customerId: order.customerId,
      orderId: order.id
    });
    return updated;
  }

  eventsForVendor(vendorId: string): Observable<MessageEvent> {
    const orders = this.changes.pipe(
      filter((event) => event.vendorId === vendorId),
      map((event) => ({
        type: "order.updated",
        data: { orderId: event.orderId }
      }))
    );
    const messages = this.messageChanges.pipe(
      filter((event) => event.vendorId === vendorId && event.senderId !== vendorId),
      map((event) => ({ type: "message.created", data: { orderId: event.orderId } }))
    );
    return merge(orders, messages);
  }

  eventsForCustomer(customerId: string): Observable<MessageEvent> {
    const orders = this.changes.pipe(
      filter((event) => event.customerId === customerId),
      map((event) => ({
        type: "order.updated",
        data: { orderId: event.orderId }
      }))
    );
    const messages = this.messageChanges.pipe(
      filter((event) => event.customerId === customerId && event.senderId !== customerId),
      map((event) => ({ type: "message.created", data: { orderId: event.orderId } }))
    );
    return merge(orders, messages);
  }
}
