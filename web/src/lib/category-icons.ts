import {
  Baby, Beer, Bike, BookOpen, Briefcase, Bus, Car, Cat, Coffee, CreditCard, Dog, Dumbbell, Film, Fuel, Gamepad2, Gift,
  GraduationCap, Hammer, HeartPulse, Home, Landmark, Laptop, Music, Package, Percent, PiggyBank, Pill, Plane, Plus, Receipt,
  Repeat, Scissors, Shirt, ShoppingBag, ShoppingCart, Smartphone, Tag, Utensils, Wifi, Zap, type LucideIcon,
} from "lucide-react";

const entries: Array<[string, LucideIcon, string]> = [
  ["utensils", Utensils, "food"], ["coffee", Coffee, "coffee"], ["beer", Beer, "drinks"], ["shopping-cart", ShoppingCart, "groceries"],
  ["car", Car, "car"], ["fuel", Fuel, "fuel"], ["bus", Bus, "transit"], ["bike", Bike, "bike"], ["plane", Plane, "travel"],
  ["home", Home, "home"], ["zap", Zap, "utilities"], ["wifi", Wifi, "internet"], ["smartphone", Smartphone, "phone"], ["hammer", Hammer, "repairs"],
  ["heart-pulse", HeartPulse, "health"], ["pill", Pill, "pharmacy"], ["dumbbell", Dumbbell, "gym"], ["scissors", Scissors, "personalCare"],
  ["film", Film, "entertainment"], ["music", Music, "music"], ["gamepad-2", Gamepad2, "games"], ["book-open", BookOpen, "books"],
  ["graduation-cap", GraduationCap, "education"], ["baby", Baby, "kids"], ["dog", Dog, "pets"], ["cat", Cat, "cat"],
  ["shirt", Shirt, "clothing"], ["shopping-bag", ShoppingBag, "shopping"], ["gift", Gift, "gifts"], ["laptop", Laptop, "tech"],
  ["repeat", Repeat, "subscriptions"], ["percent", Percent, "fees"], ["credit-card", CreditCard, "card"], ["receipt", Receipt, "bills"],
  ["landmark", Landmark, "taxes"], ["piggy-bank", PiggyBank, "savings"], ["package", Package, "delivery"], ["briefcase", Briefcase, "salary"],
  ["plus", Plus, "otherIncome"], ["tag", Tag, "other"],
];

export const CATEGORY_ICONS = entries.map(([key, Icon, label]) => ({ key, Icon, labelKey: `icons.${label}` })) as ReadonlyArray<{
  key: string; Icon: LucideIcon; labelKey: string;
}>;

const byKey = new Map(CATEGORY_ICONS.map((i) => [i.key, i.Icon]));

export function iconFor(key: string | undefined): LucideIcon {
  return (key && byKey.get(key)) || Tag;
}
