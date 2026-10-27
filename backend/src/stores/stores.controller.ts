import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  ParseBoolPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateStoreDto } from "./dto/create-store.dto";
import { ListStoresQueryDto } from "./dto/list-stores-query.dto";
import { UpdateStoreLocationDto } from "./dto/update-store-location.dto";
import { UpdateStoreContactDto } from "./dto/update-store-contact.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { StoresService } from "./stores.service";

@Controller("stores")
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  listOpen(@Query() query: ListStoresQueryDto) {
    return this.storesService.listOpen(query.latitude, query.longitude);
  }

  @Get(":storeId/reviews")
  listReviews(@Param("storeId") storeId: string) {
    return this.storesService.listReviews(storeId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  create(@CurrentUser() user: AuthUser, @Body() input: CreateStoreDto) {
    return this.storesService.create(user, input);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  findMine(@CurrentUser() user: AuthUser) {
    return this.storesService.findMyStore(user);
  }

  @Patch("me/location")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  updateLocation(@CurrentUser() user: AuthUser, @Body() input: UpdateStoreLocationDto) {
    return this.storesService.updateLocation(user, input);
  }

  @Patch("me/contact")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  updateContact(@CurrentUser() user: AuthUser, @Body() input: UpdateStoreContactDto) {
    return this.storesService.updateContact(user, input);
  }

  @Post("me/products")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  addProduct(@CurrentUser() user: AuthUser, @Body() input: CreateProductDto) {
    return this.storesService.addProduct(user, input);
  }

  @Post("me/products/image")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @UseInterceptors(FileInterceptor("image", {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
        callback(new BadRequestException("Upload a JPEG, PNG, or WebP image."), false);
        return;
      }
      callback(null, true);
    }
  }))
  uploadProductImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    if (!file) throw new BadRequestException("Choose an image to upload.");
    return this.storesService.uploadProductImage(user, file);
  }

  @Patch("me/products/:productId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param("productId") productId: string,
    @Body() input: UpdateProductDto
  ) {
    return this.storesService.updateProduct(user, productId, input);
  }

  @Delete("me/products/:productId")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  removeProduct(
    @CurrentUser() user: AuthUser,
    @Param("productId") productId: string
  ) {
    return this.storesService.removeProduct(user, productId);
  }

  @Post("me/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  setOpen(
    @CurrentUser() user: AuthUser,
    @Query("open", ParseBoolPipe) isOpen: boolean
  ) {
    return this.storesService.setOpen(user, isOpen);
  }
}
