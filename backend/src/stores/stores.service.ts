import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import type { CreateProductDto } from "./dto/create-product.dto";
import type { CreateStoreDto } from "./dto/create-store.dto";
import type { UpdateProductDto } from "./dto/update-product.dto";
import type { UpdateStoreLocationDto } from "./dto/update-store-location.dto";
import type { UpdateStoreContactDto } from "./dto/update-store-contact.dto";

const productSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  category: true,
  image: true
} as const;

const publicStoreSelect = {
  id: true,
  name: true,
  tagline: true,
  cuisine: true,
  description: true,
  location: true,
  whatsappNumber: true,
  isOpen: true,
  reviews: {
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      customer: { select: { name: true } }
    },
    orderBy: { createdAt: "desc" as const },
    take: 2
  },
  _count: { select: { reviews: true } },
  products: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      category: true,
      image: true
    }
  }
} as const;

const vendorStoreSelect = {
  ...publicStoreSelect,
  latitude: true,
  longitude: true
} as const;

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listOpen(latitude?: number, longitude?: number) {
    if (latitude === undefined || longitude === undefined) {
      return this.prisma.store.findMany({
        where: { isOpen: true },
        select: publicStoreSelect,
        orderBy: { createdAt: "desc" }
      });
    }

    const stores = await this.prisma.store.findMany({
      where: { isOpen: true },
      select: vendorStoreSelect,
      orderBy: { createdAt: "desc" }
    });

    const distanceMiles = (storeLatitude: number, storeLongitude: number) => {
      const toRadians = (degrees: number) => degrees * Math.PI / 180;
      const latitudeDelta = toRadians(storeLatitude - latitude);
      const longitudeDelta = toRadians(storeLongitude - longitude);
      const a =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(toRadians(latitude)) *
          Math.cos(toRadians(storeLatitude)) *
          Math.sin(longitudeDelta / 2) ** 2;
      return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    return stores
      .map(({ latitude: storeLatitude, longitude: storeLongitude, ...store }) => ({
        ...store,
        distanceMiles:
          storeLatitude === null || storeLongitude === null
            ? null
            : Math.round(distanceMiles(storeLatitude, storeLongitude) * 10) / 10
      }))
      .sort((first, second) => {
        if (first.distanceMiles === null) return second.distanceMiles === null ? 0 : 1;
        if (second.distanceMiles === null) return -1;
        return first.distanceMiles - second.distanceMiles;
      });
  }

  async findMyStore(user: AuthUser) {
    const store = await this.prisma.store.findUnique({
      where: { vendorId: user.id },
      select: vendorStoreSelect
    });
    if (!store) throw new NotFoundException("Create your store to continue.");
    return store;
  }

  async listReviews(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        reviews: {
          where: { storeId },
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            customer: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 50
        }
      }
    });
    if (!store) throw new NotFoundException("Store not found.");
    return store.reviews;
  }

  async create(user: AuthUser, input: CreateStoreDto) {
    const existing = await this.prisma.store.findUnique({
      where: { vendorId: user.id },
      select: { id: true }
    });
    if (existing) throw new ConflictException("Your account already has a store.");
    return this.prisma.store.create({
      data: {
        ...input,
        vendorId: user.id
      },
      select: vendorStoreSelect
    });
  }

  async setOpen(user: AuthUser, isOpen: boolean) {
    const store = await this.findMyStore(user);
    return this.prisma.store.update({
      where: { id: store.id },
      data: { isOpen },
      select: vendorStoreSelect
    });
  }

  async updateLocation(user: AuthUser, input: UpdateStoreLocationDto) {
    const store = await this.findMyStore(user);
    return this.prisma.store.update({
      where: { id: store.id },
      data: { latitude: input.latitude, longitude: input.longitude },
      select: vendorStoreSelect
    });
  }

  async updateContact(user: AuthUser, input: UpdateStoreContactDto) {
    const store = await this.findMyStore(user);
    return this.prisma.store.update({
      where: { id: store.id },
      data: { whatsappNumber: input.whatsappNumber?.trim() || null },
      select: vendorStoreSelect
    });
  }

  async addProduct(user: AuthUser, input: CreateProductDto) {
    const store = await this.findMyStore(user);
    return this.prisma.product.create({
      data: {
        ...input,
        storeId: store.id
      },
      select: productSelect
    });
  }

  async updateProduct(user: AuthUser, productId: string, input: UpdateProductDto) {
    const store = await this.findMyStore(user);
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, storeId: store.id },
      select: { id: true }
    });
    if (!existing) throw new NotFoundException("Menu item not found in your store.");
    return this.prisma.product.update({
      where: { id: existing.id },
      data: input,
      select: productSelect
    });
  }

  async uploadProductImage(user: AuthUser, file: Express.Multer.File) {
    await this.findMyStore(user);
    const buffer = file.buffer;
    let extension: string;
    let expectedMimeType: string;

    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      extension = "png";
      expectedMimeType = "image/png";
    } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      extension = "jpg";
      expectedMimeType = "image/jpeg";
    } else if (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      extension = "webp";
      expectedMimeType = "image/webp";
    } else {
      throw new BadRequestException("Upload a valid JPEG, PNG, or WebP image.");
    }

    if (file.mimetype !== expectedMimeType) {
      throw new BadRequestException("The selected image file type could not be verified.");
    }

    const filename = `${randomUUID()}.${extension}`;
    const directory = resolve(__dirname, "../../uploads/product-images");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, filename), buffer, { flag: "wx" });
    return { image: `/uploads/product-images/${filename}` };
  }

  async removeProduct(user: AuthUser, productId: string) {
    const store = await this.findMyStore(user);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId: store.id },
      select: { id: true }
    });
    if (!product) throw new NotFoundException("Menu item not found in your store.");
    await this.prisma.product.delete({ where: { id: product.id } });
    return { message: "Menu item removed." };
  }
}
