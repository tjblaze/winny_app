import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Sse,
  UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateOrderMessageDto } from "./dto/create-order-message.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateOrderTypingDto } from "./dto/update-order-typing.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrdersService } from "./orders.service";

@Controller("orders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  create(@CurrentUser() user: AuthUser, @Body() input: CreateOrderDto) {
    return this.ordersService.create(user, input);
  }

  @Get("vendor")
  @Roles(UserRole.VENDOR)
  listForVendor(@CurrentUser() user: AuthUser) {
    return this.ordersService.listForVendor(user);
  }

  @Get("customer")
  @Roles(UserRole.CUSTOMER)
  listForCustomer(@CurrentUser() user: AuthUser) {
    return this.ordersService.listForCustomer(user);
  }

  @Sse("vendor/events")
  @Roles(UserRole.VENDOR)
  events(@CurrentUser() user: AuthUser) {
    return this.ordersService.eventsForVendor(user.id);
  }

  @Sse("customer/events")
  @Roles(UserRole.CUSTOMER)
  customerEvents(@CurrentUser() user: AuthUser) {
    return this.ordersService.eventsForCustomer(user.id);
  }

  @Get(":orderId/messages")
  getMessages(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.ordersService.listMessages(user, orderId);
  }

  @Post(":orderId/messages")
  createMessage(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() input: CreateOrderMessageDto
  ) {
    return this.ordersService.createMessage(user, orderId, input);
  }

  @Post(":orderId/messages/read")
  markMessagesRead(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.ordersService.markMessagesRead(user, orderId);
  }

  @Post(":orderId/messages/typing")
  updateTyping(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() input: UpdateOrderTypingDto
  ) {
    return this.ordersService.updateTyping(user, orderId, input);
  }

  @Sse(":orderId/messages/events")
  messageEvents(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.ordersService.messageEvents(user, orderId);
  }

  @Post(":orderId/review")
  @Roles(UserRole.CUSTOMER)
  createReview(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() input: CreateReviewDto
  ) {
    return this.ordersService.createReview(user, orderId, input);
  }

  @Patch("vendor/:orderId/status")
  @Roles(UserRole.VENDOR)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() input: UpdateOrderStatusDto
  ) {
    return this.ordersService.updateStatus(user, orderId, input);
  }
}
