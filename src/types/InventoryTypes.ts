export type ProductSellingType = "sized" | "single";
export type ProductCategory =
  | "Milk Tea"
  | "Coffee"
  | "Frappe"
  | "Fruit Tea"
  | "Yogurt"
  | "Soda"
  | "Rice Meal"
  | "Snack"
  | "Add On"
  | "Other";

export type PurchaseUnit =
  | "bag"
  | "bottle"
  | "can"
  | "box"
  | "pack"
  | "container"
  | "kg"
  | "liter"
  | "piece"
  | "other";

export type UsageUnit =
  | "gram"
  | "ml"
  | "pump"
  | "scoop"
  | "piece"
  | "serving"
  | "oz"
  | "other";

export type Ingredient = {
  id: string;
  name: string;

  purchaseUnit: PurchaseUnit;
  usageUnit: UsageUnit;

  /**
   * Example:
   * 1 bottle = 100 pumps
   * 1 can = 30 scoops
   * 1 bag = 1000 grams
   */
  usagePerPurchaseUnit: number;

  /**
   * Cost of 1 purchase unit.
   * Example: 1 bottle costs ₱180.
   */
  purchaseCost: number;

  /**
   * Current stock is stored in usage units.
   * Example: 2 bottles x 100 pumps = 200 pumps.
   */
  currentStock: number;

  /**
   * Minimum stock threshold in usage units.
   * Example: alert when vanilla syrup is below 20 pumps.
   */
  minThreshold: number;

  /**
   * Auto-computed:
   * purchaseCost / usagePerPurchaseUnit
   */
  costPerUsageUnit: number;

  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  sellingType?: ProductSellingType;
  isAvailable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ProductSize = {
  id: string;
  productId: string;
  productName?: string;
  sizeName: string;
  price: number;
  isAvailable: boolean;
  isActive?: boolean;
  isDefaultSize?: boolean;
  hasCompleteRecipe?: boolean;
};

export type RecipeIngredient = {
  ingredientId: string;
  ingredientName: string;
  requiredAmount: number;
  usageUnit: UsageUnit;
  costPerUsageUnit: number;
};

export type Recipe = {
  id: string;
  productId: string;
  productName: string;
  sizeId: string;
  sizeName: string;
  price: number;
  ingredients: RecipeIngredient[];
  totalRecipeCost: number;
  isComplete: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};