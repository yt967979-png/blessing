// Product data and types for Blessing Power Guide
export interface Product {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  cls: string;
  category: 'guide' | 'combo' | 'question-bank';
  subject: string;
  price: number;
  mrp: number;
  discount: number;
  rating: number;
  reviews: number;
  badge: string;
  badgeColor: string;
  image: string;
  hoverImage?: string;
  description: string;
  features: string[];
  inStock: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
}

// Initial products array - starts empty until products are fetched dynamically from DB or added via Admin Portal
export const PRODUCTS: Product[] = [];

export const CLASSES = ['6th', '7th', '8th', '9th', '10th', '11th', '12th'] as const;
export type ClassType = typeof CLASSES[number];

export const CLASS_COLORS: Record<string, string> = {
  '6th': 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:border-emerald-400',
  '7th': 'text-blue-600 border-blue-200 bg-blue-50 hover:border-blue-400',
  '8th': 'text-purple-600 border-purple-200 bg-purple-50 hover:border-purple-400',
  '9th': 'text-orange-600 border-orange-200 bg-orange-50 hover:border-orange-400',
  '10th': 'text-amber-600 border-amber-200 bg-amber-50 hover:border-amber-400',
  '11th': 'text-teal-600 border-teal-200 bg-teal-50 hover:border-teal-400',
  '12th': 'text-rose-600 border-rose-200 bg-rose-50 hover:border-rose-400',
};

export interface CartItem extends Product {
  qty: number;
}

export interface UserData {
  id: number;
  name: string;
  email: string;
  phone: string;
}
