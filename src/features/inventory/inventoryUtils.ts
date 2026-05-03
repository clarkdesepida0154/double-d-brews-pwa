import type { Ingredient } from "../../types/InventoryTypes";

function pluralizeUnit(count: number, unit: string) {
  if (count === 1) {
    return unit;
  }

  return `${unit}s`;
}

export function formatIngredientStock(ingredient: Ingredient) {
  const stock = ingredient.currentStock;
  const conversion = ingredient.usagePerPurchaseUnit;

  if (conversion <= 0) {
    return `${stock} ${pluralizeUnit(stock, ingredient.usageUnit)}`;
  }

  const wholePurchaseUnits = Math.floor(stock / conversion);
  const remainingUsageUnits = stock % conversion;

  if (wholePurchaseUnits > 0 && remainingUsageUnits > 0) {
    return `${wholePurchaseUnits} ${pluralizeUnit(
      wholePurchaseUnits,
      ingredient.purchaseUnit
    )} & ${remainingUsageUnits} ${pluralizeUnit(
      remainingUsageUnits,
      ingredient.usageUnit
    )}`;
  }

  if (wholePurchaseUnits > 0 && remainingUsageUnits === 0) {
    return `${wholePurchaseUnits} ${pluralizeUnit(
      wholePurchaseUnits,
      ingredient.purchaseUnit
    )}`;
  }

  return `${remainingUsageUnits} ${pluralizeUnit(
    remainingUsageUnits,
    ingredient.usageUnit
  )}`;
}

export function calculateStockFromPurchaseQuantity(
  purchaseQuantity: number,
  usagePerPurchaseUnit: number
) {
  return purchaseQuantity * usagePerPurchaseUnit;
}

export function calculateCostPerUsageUnit(
  purchaseCost: number,
  usagePerPurchaseUnit: number
) {
  if (usagePerPurchaseUnit <= 0) {
    return 0;
  }

  return purchaseCost / usagePerPurchaseUnit;
}