# Local Codebase Graph Map (Auto-generated fallback)

The following is a structural symbol map of the workspace files to assist in understanding dependencies and file connections:

- File: `.gitignore` (50 lines, Type: ignore)
- File: `AGENTS.md` (6 lines, Type: markdown)
### File: `eslint.config.mjs` (javascript)
```javascript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { defineConfig, globalIgnores } from "eslint/config";
//   import nextVitals from "eslint-config-next/core-web-vitals";
//   import nextTs from "eslint-config-next/typescript";
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

- File: `package-lock.json` (8810 lines, Type: json)
### File: `postcss.config.mjs` (javascript)
```javascript
// [Graphify Token-Saving Structure Map]
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

- File: `package.json` (41 lines, Type: json)
- File: `tsconfig.tsbuildinfo` (1 lines, Type: json)
- File: `tsconfig.json` (35 lines, Type: jsonc)
- File: `README.md` (37 lines, Type: markdown)
### File: `scripts\init-db.js` (javascript)
```javascript
// [Graphify Token-Saving Structure Map]
// Imports:
//   const { Client } = require('pg');
//   require('dotenv').config();
//   const crypto = require('crypto');
// Structure Definitions:
  async function migrateDatabase(connStr, dbName)
  function hashPassword(password)
  async function seedAdmin(connStr, dbName)
  async function main()
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `scripts\clear-all-books.js` (javascript)
```javascript
// [Graphify Token-Saving Structure Map]
// Imports:
//   const { Client } = require('pg');
//   require('dotenv').config();
// Structure Definitions:
  async function clearBooks(connStr, dbName)
  async function main()
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\deliveryEstimator.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Structure Definitions:
  export function getSTCourierDeliveryEstimate(stateOrCity: string = 'Tamil Nadu'):
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\invoiceGenerator.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Structure Definitions:
  export function generateTaxInvoiceHtml(orderData:
  export function downloadTaxInvoice(orderData: any)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\db.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { Client } from 'pg';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\authValidation.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Structure Definitions:
  export function isDisposableEmail(email: string): boolean
  export function isValidEmailFormat(email: string): boolean
  export interface PasswordCriteria
  export function checkPasswordCriteria(password: string): PasswordCriteria
  export function isStrongPassword(password: string): boolean
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\api.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `scripts\whatsapp-service.js` (javascript)
```javascript
// [Graphify Token-Saving Structure Map]
// Imports:
//   const http = require('http');
//   const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
//   const qrcodeTerminal = require('qrcode-terminal');
//   const QRCode = require('qrcode');
//   const path = require('path');
//   const fs = require('fs');
//   const { Client } = require('pg');
// Structure Definitions:
  async function backupSessionToDb()
  async function restoreSessionFromDb()
  async function saveToDatabase(data)
  function updateStateFile(data)
  async function connectToWhatsApp()
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\whatsapp.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
//   import QRCode from 'qrcode';
//   import path from 'path';
//   import fs from 'fs';
//   import { getDbClient } from '@/lib/db';
// Structure Definitions:
  async function updateSessionStatus(data:
  async function backupSessionToDb()
  async function restoreSessionFromDb()
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\serverSecurity.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
//   import { getDbClient } from '@/lib/db';
// Structure Definitions:
  interface RateLimitEntry
  export function applyRateLimit(ip: string, limit: number = 30, windowMs: number = 60000):
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\lib\products.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Structure Definitions:
  export interface Product
  export const PRODUCTS: Product[] = []
  export const CLASSES = ['6th', '7th', '8th', '9th', '10th', '11th', '12th'] as const
  export const CLASS_COLORS: Record<string, string> =
  export interface CartItem extends Product
  export interface UserData
// ... [Detailed implementation body automatically hidden to save tokens]
```

- File: `public\window.svg` (1 lines, Type: xml)
- File: `public\whatsapp_status.json` (7 lines, Type: json)
### File: `src\context\StoreContext.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import React, { createContext, useContext, useState, useEffect } from 'react';
// Structure Definitions:
  export interface Product
  export interface CartItem extends Product
  export interface UserData
  interface StoreContextType
  export const StoreProvider: React.FC<
  export const useStore = () =>
// ... [Detailed implementation body automatically hidden to save tokens]
```

- File: `public\vercel.svg` (1 lines, Type: xml)
- File: `public\next.svg` (1 lines, Type: xml)
- File: `public\globe.svg` (1 lines, Type: xml)
- File: `public\file.svg` (1 lines, Type: xml)
### File: `next.config.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import type { NextConfig } from "next";
// Structure Definitions:
  async headers()
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `next-env.d.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import "./.next/types/routes.d.ts";
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

- File: `CLAUDE.md` (2 lines, Type: markdown)
- File: `.env.local` (9 lines, Type: dotenv)
### File: `src\app\layout.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import type { Metadata } from 'next';
//   import Script from 'next/script';
//   import './globals.css';
//   import { StoreProvider } from '@/context/StoreContext';
// Structure Definitions:
  export const metadata: Metadata =
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\components\ui\Toast.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import React from 'react';
//   import { motion, AnimatePresence } from 'framer-motion';
//   import { Sparkles } from 'lucide-react';
//   import { useStore } from '@/context/StoreContext';
// Structure Definitions:
  export const Toast = () =>
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\components\ui\ProductCard.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import React, { useState } from 'react';
//   import Link from 'next/link';
//   import { motion } from 'framer-motion';
//   import { Heart, Star, ShoppingBag, Eye, ShieldCheck, Truck, Zap } from 'lucide-react';
//   import { Product } from '@/lib/products';
//   import { useStore } from '@/context/StoreContext';
// Structure Definitions:
  export const ProductCard = (
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\sitemap.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { MetadataRoute } from 'next';
//   import { getDbClient } from '@/lib/db';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\robots.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { MetadataRoute } from 'next';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\orders\page.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { useState, useEffect, Suspense } from 'react';
//   import { useSearchParams } from 'next/navigation';
//   import { Header } from '@/components/layout/Header';
//   import { Footer } from '@/components/layout/Footer';
//   import { CartDrawer } from '@/components/cart/CartDrawer';
//   import { Modals } from '@/components/modals/Modals';
//   import { useStore } from '@/context/StoreContext';
//   import {
//   import { downloadTaxInvoice } from '@/lib/invoiceGenerator';
//   import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
// Structure Definitions:
  function OrdersContent()
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\page.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import React, { useEffect } from 'react';
//   import { useRouter } from 'next/navigation';
//   import { useStore } from '@/context/StoreContext';
//   import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
//   import { Header } from '@/components/layout/Header';
//   import { NavBar } from '@/components/layout/NavBar';
//   import { HeroSection } from '@/components/home/HeroSection';
//   import { ClassPicker } from '@/components/home/ClassPicker';
//   import { ProductGrid } from '@/components/home/ProductGrid';
//   import { WhyChoose } from '@/components/home/WhyChoose';
//   import { FAQSection } from '@/components/home/FAQSection';
//   import { TrustBar } from '@/components/home/TrustBar';
//   import { Footer } from '@/components/layout/Footer';
//   import { FloatingActions } from '@/components/layout/FloatingActions';
//   import { CartDrawer } from '@/components/cart/CartDrawer';
//   import { Modals } from '@/components/modals/Modals';
//   import { Toast } from '@/components/ui/Toast';
//   import { ContactSection } from '@/components/home/ContactSection';
//   import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

- File: `src\app\globals.css` (61 lines, Type: css)
### File: `src\app\profile\page.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import React, { useState, useEffect } from 'react';
//   import Link from 'next/link';
//   import { useRouter } from 'next/navigation';
//   import {
//   import { useStore } from '@/context/StoreContext';
//   import { Header } from '@/components/layout/Header';
//   import { NavBar } from '@/components/layout/NavBar';
//   import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
//   import { Footer } from '@/components/layout/Footer';
//   import { CartDrawer } from '@/components/cart/CartDrawer';
//   import { Modals } from '@/components/modals/Modals';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\cart\page.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import React, { useState } from 'react';
//   import Link from 'next/link';
//   import { ShoppingBag, ArrowLeft, Trash2, Plus, Minus, ShieldCheck, Truck, MapPin, Tag, Check } from 'lucide-react';
//   import { useStore } from '@/context/StoreContext';
//   import { Header } from '@/components/layout/Header';
//   import { NavBar } from '@/components/layout/NavBar';
//   import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
//   import { Footer } from '@/components/layout/Footer';
//   import { CartDrawer } from '@/components/cart/CartDrawer';
//   import { Modals } from '@/components/modals/Modals';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\admin\page.tsx` (typescriptreact)
```typescriptreact
// [Graphify Token-Saving Structure Map]
// Imports:
//   import React, { useState, useEffect } from 'react';
//   import { useRouter } from 'next/navigation';
//   import {
//   import { useStore } from '@/context/StoreContext';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\api\contact\route.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
//   import { getDbClient } from '@/lib/db';
//   import { applyRateLimit } from '@/lib/serverSecurity';
//   import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\api\whatsapp\route.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\api\user\sync\route.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
//   import { getDbClient } from '@/lib/db';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\api\whatsapp\qr\route.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
//   import fs from 'fs';
//   import path from 'path';
//   import { initWhatsAppInProcess } from '@/lib/whatsapp';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\api\upload\route.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\api\reviews\route.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
//   import { getDbClient } from '@/lib/db';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

### File: `src\app\api\products\route.ts` (typescript)
```typescript
// [Graphify Token-Saving Structure Map]
// Imports:
//   import { NextResponse } from 'next/server';
//   import { getDbClient } from '@/lib/db';
// (No primary class/function signatures detected, structure is simplified)
// ... [Detailed implementation body automatically hidden to save tokens]
```

