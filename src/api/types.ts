// Shapes exactly as the MedEx API sends them. Nothing outside src/api, src/mocks
// and src/domain/normalize.ts should depend on these.

export type ApiServiceType = 'package' | 'lab_test' | 'wellness' | 'service' | 'insurance';
export type ApiAdjustmentType = 'percent' | 'amount';

export interface ApiSubcategory {
  id: string;
  title: string;
  slug: string;
  type: ApiServiceType;
  position: number;
  status: boolean;
  parentId: string;
}

export interface ApiCategory extends Omit<ApiSubcategory, 'parentId'> {
  parentId: null;
  children: ApiSubcategory[];
}

export interface ApiProvider {
  id: number;
  name: string;
  username: string;
  status: string;
  providerInformation: {
    companyName: string;
    slug: string;
    types: ApiServiceType[];
    currency: string;
    city: { id: string; name: string; slug: string };
    country: { id: number; name: string; alphaCode: string };
    rating: number | null;
    reviewCount: number;
  };
}

/** Money fields are decimal strings, e.g. "6200.00". */
export interface ApiPriceFields {
  price: string | null;
  discount: string | null;
  discountType: ApiAdjustmentType | null;
  serviceCharge: string | null;
  serviceChargeType: ApiAdjustmentType | null;
}

export interface ApiWellnessOption extends ApiPriceFields {
  id: string;
  durationInMinutes: number;
}

export interface ApiService extends ApiPriceFields {
  id: string;
  title: string;
  slug: string;
  type: ApiServiceType;
  /** The provider id. */
  userId: number;
  categoryId: string | null;
  subCategoryId: string | null;
  status: boolean;
  testAtHome: boolean;
  homeTestCharge: string | null;
  wellnessPricing: ApiWellnessOption[];
  createdAt: string;
}
