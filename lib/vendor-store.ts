export type VendorProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
};

export type VendorStoreReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  customer: { name: string };
};

export type VendorStore = {
  id: string;
  name: string;
  tagline: string;
  cuisine: string;
  description: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  whatsappNumber?: string | null;
  reviews?: VendorStoreReview[];
  _count?: { reviews: number };
  distanceMiles?: number | null;
  isOpen: boolean;
  products: VendorProduct[];
};
