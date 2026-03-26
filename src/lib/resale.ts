import { z } from "zod";

export const paymentRailSchema = z.enum(["credits", "usdcx", "usad"]);
export type ResalePaymentRail = z.infer<typeof paymentRailSchema>;

export const resaleStatusSchema = z.enum(["open", "reserved", "cancelled"]);
export type ResaleStatus = z.infer<typeof resaleStatusSchema>;

export const resalePricesSchema = z.object({
  credits: z.number().nonnegative(),
  usdcx: z.number().nonnegative(),
  usad: z.number().nonnegative(),
});

export type ResalePrices = z.infer<typeof resalePricesSchema>;

export const resaleListingSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  ticketId: z.string().min(1),
  eventName: z.string().min(1),
  date: z.string(),
  location: z.string(),
  sellerAddress: z.string().min(1),
  sellerNote: z.string().max(240).optional(),
  reservedFor: z.string().min(1).optional(),
  status: resaleStatusSchema,
  prices: resalePricesSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ResaleListing = z.infer<typeof resaleListingSchema>;

export function createResaleListingId(eventId: string, ticketId: string): string {
  return `resale_${eventId}_${ticketId}_${Date.now()}`;
}

export function getActiveResaleRails(prices: ResalePrices): ResalePaymentRail[] {
  const rails: ResalePaymentRail[] = [];
  if (prices.credits > 0) rails.push("credits");
  if (prices.usdcx > 0) rails.push("usdcx");
  if (prices.usad > 0) rails.push("usad");
  return rails;
}

export function hasResalePrice(prices: ResalePrices): boolean {
  return getActiveResaleRails(prices).length > 0;
}

export function formatResaleRailLabel(rail: ResalePaymentRail): string {
  if (rail === "credits") return "Aleo Credits";
  if (rail === "usdcx") return "USDCx";
  return "USAD";
}

export function formatResalePrice(prices: ResalePrices, rail: ResalePaymentRail): string {
  const amount = prices[rail];
  return `${amount.toFixed(2).replace(/\.00$/, "")} ${formatResaleRailLabel(rail)}`;
}

export function sortResaleListings(listings: ResaleListing[]): ResaleListing[] {
  return [...listings].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "open" ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function dedupeLatestResaleListings(listings: ResaleListing[]): ResaleListing[] {
  const map = new Map<string, ResaleListing>();
  for (const listing of listings) {
    const current = map.get(listing.id);
    if (!current || new Date(listing.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      map.set(listing.id, listing);
    }
  }
  return sortResaleListings([...map.values()]);
}
