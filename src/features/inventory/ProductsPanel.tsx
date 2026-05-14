import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config.ts";
import type { UserProfile } from "../../types/UserProfile";
import { writeActivityLog } from "../../utils/activityLogUtils";
import type {
  Ingredient,
  Product,
  ProductCategory,
  ProductSellingType,
  ProductSize,
  RecipeIngredient,
} from "../../types/InventoryTypes";


const DEFAULT_SINGLE_ITEM_SIZE_NAME = "Regular";
const DEFAULT_SINGLE_ITEM_SIZE_KEY = "regular";

const productCategories: ProductCategory[] = [
  "Milk Tea",
  "Coffee",
  "Frappe",
  "Fruit Tea",
  "Yogurt",
  "Soda",
  "Rice Meal",
  "Snack",
  "Add On",
  "Other",
];

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function findProductDuplicateByNameKey(
  nameKey: string,
  currentProductId = ""
) {
  const productsSnapshot = await getDocs(collection(db, "products"));

  return productsSnapshot.docs.find((productDoc) => {
    if (productDoc.id === currentProductId) {
      return false;
    }

    const productData = productDoc.data();

    const existingNameKey =
      productData.nameKey || normalizeKey(productData.name || "");

    return existingNameKey === nameKey;
  });
}

async function findActiveProductDuplicateByNameKey(
  nameKey: string,
  currentProductId = ""
) {
  const productsSnapshot = await getDocs(collection(db, "products"));

  return productsSnapshot.docs.find((productDoc) => {
    if (productDoc.id === currentProductId) {
      return false;
    }

    const productData = productDoc.data();

    const existingNameKey =
      productData.nameKey || normalizeKey(productData.name || "");

    return existingNameKey === nameKey && productData.isActive !== false;
  });
}

async function findProductSizeDuplicateBySizeKey(
  productId: string,
  sizeKey: string,
  currentSizeId = ""
) {
  const sizesQuery = query(
    collection(db, "productSizes"),
    where("productId", "==", productId)
  );

  const sizesSnapshot = await getDocs(sizesQuery);

  return sizesSnapshot.docs.find((sizeDoc) => {
    if (sizeDoc.id === currentSizeId) {
      return false;
    }

    const sizeData = sizeDoc.data();

    const existingSizeKey =
      sizeData.sizeKey || normalizeKey(sizeData.sizeName || "");

    return existingSizeKey === sizeKey;
  });
}

async function findActiveProductSizeDuplicateBySizeKey(
  productId: string,
  sizeKey: string,
  currentSizeId = ""
) {
  const sizesQuery = query(
    collection(db, "productSizes"),
    where("productId", "==", productId)
  );

  const sizesSnapshot = await getDocs(sizesQuery);

  return sizesSnapshot.docs.find((sizeDoc) => {
    if (sizeDoc.id === currentSizeId) {
      return false;
    }

    const sizeData = sizeDoc.data();

    const existingSizeKey =
      sizeData.sizeKey || normalizeKey(sizeData.sizeName || "");

    return existingSizeKey === sizeKey && sizeData.isActive !== false;
  });
}

type ProductsPanelProps = {
  userProfile: UserProfile;
};

type ProductCategoryFilter = "All" | ProductCategory;

type ProductReadinessFilter =
  | "all"
  | "ready"
  | "needs-size"
  | "needs-recipe"
  | "product-off"
  | "not-sellable";

function ProductsPanel({ userProfile }: ProductsPanelProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<"active" | "inactive">("active");
  const [productCategoryFilter, setProductCategoryFilter] =
    useState<ProductCategoryFilter>("All");
  const [productReadinessFilter, setProductReadinessFilter] =
    useState<ProductReadinessFilter>("all");

  

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("Milk Tea");
  const [sellingType, setSellingType] = useState<ProductSellingType>("sized");
  const [singleItemPrice, setSingleItemPrice] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productSizes, setProductSizes] = useState<ProductSize[]>([]);
  const [isLoadingSizes, setIsLoadingSizes] = useState(false);

  const [sizeStatusFilter, setSizeStatusFilter] = useState<"active" | "inactive">(
    "active"
  );

  const [productSizeStats, setProductSizeStats] = useState<
  Record<
    string,
    {
      total: number;
      ready: number;
      needsRecipe: number;
      unavailable: number;
    }
  >
>({});

  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editProductName, setEditProductName] = useState("");
  const [editProductCategory, setEditProductCategory] =
    useState<ProductCategory>("Milk Tea");
  const [editProductAvailable, setEditProductAvailable] = useState(true);
  const [isUpdatingProduct, setIsUpdatingProduct] = useState(false);

  const [isDeactivateProductConfirmOpen, setIsDeactivateProductConfirmOpen] =
  useState(false);
  const [isDeactivatingProduct, setIsDeactivatingProduct] = useState(false);

  const [isSizeFormOpen, setIsSizeFormOpen] = useState(false);
  const [sizeName, setSizeName] = useState("");
  const [sizePrice, setSizePrice] = useState("");
  const [isSizeAvailable, setIsSizeAvailable] = useState(true);
  const [isSavingSize, setIsSavingSize] = useState(false);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);

  const [editingSize, setEditingSize] = useState<ProductSize | null>(null);
  const [editSizeName, setEditSizeName] = useState("");
  const [editSizePrice, setEditSizePrice] = useState("");
  const [editSizeAvailable, setEditSizeAvailable] = useState(true);
  const [isUpdatingSize, setIsUpdatingSize] = useState(false);

  const [sizeToDeactivate, setSizeToDeactivate] = useState<ProductSize | null>(
    null
  );
  const [isDeactivatingSize, setIsDeactivatingSize] = useState(false);

  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
  const [isLoadingRecipeIngredients, setIsLoadingRecipeIngredients] = useState(false);

  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("");
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [recipeIngredientToRemove, setRecipeIngredientToRemove] =
  useState<RecipeIngredient | null>(null);
  const [savedRecipeId, setSavedRecipeId] = useState("");
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);

  function showTemporaryMessage(message: string, duration = 2500) {
    setFormMessage(message);

    window.setTimeout(() => {
      setFormMessage("");
    }, duration);
  }

  const loadProducts = useCallback(async () => {
        setIsLoadingProducts(true);

        try {
            const productsQuery = query(
            collection(db, "products"),
            where("isActive", "==", productStatusFilter === "active")
            );

            const productsSnapshot = await getDocs(productsQuery);

            const loadedProducts: Product[] = productsSnapshot.docs.map((docSnapshot) => {
                const data = docSnapshot.data();

                return {
                  id: docSnapshot.id,
                  name: data.name,
                  category: data.category,
                  sellingType: data.sellingType === "single" ? "single" : "sized",
                  isAvailable: data.isAvailable,
                };
            });

            const productIds = new Set(loadedProducts.map((product) => product.id));

            const recipesSnapshot = await getDocs(collection(db, "recipes"));

const completedRecipeSizeIds = new Set(
  recipesSnapshot.docs
    .filter((recipeDoc) => {
      const recipeData = recipeDoc.data();
      return recipeData.isComplete === true && Array.isArray(recipeData.ingredients) && recipeData.ingredients.length > 0;
    })
    .map((recipeDoc) => recipeDoc.id)
);

const sizesSnapshot = await getDocs(collection(db, "productSizes"));

const sizeStats = sizesSnapshot.docs.reduce<
  Record<string, { total: number; ready: number; needsRecipe: number; unavailable: number }>
>((stats, sizeDoc) => {
  const sizeData = sizeDoc.data();
  const productId = sizeData.productId;

  if (!productIds.has(productId) || sizeData.isActive === false) {
    return stats;
  }

  if (!stats[productId]) {
    stats[productId] = {
      total: 0,
      ready: 0,
      needsRecipe: 0,
      unavailable: 0,
    };
  }

  stats[productId].total += 1;

  const hasCompleteRecipe = completedRecipeSizeIds.has(sizeDoc.id);

  if (sizeData.isAvailable && hasCompleteRecipe) {
    stats[productId].ready += 1;
  } else if (!hasCompleteRecipe) {
    stats[productId].needsRecipe += 1;
  } else {
    stats[productId].unavailable += 1;
  }

  return stats;
}, {});

            setProductSizeStats(sizeStats);

            setProducts(loadedProducts.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error(error);
            setFormMessage("Failed to load products.");
        } finally {
            setIsLoadingProducts(false);
        }
    }, [productStatusFilter]);

  const loadProductSizes = useCallback(
  async (
    productId: string,
    statusFilter: "active" | "inactive" = sizeStatusFilter
  ) => {
    setIsLoadingSizes(true);

    try {
      const recipesSnapshot = await getDocs(collection(db, "recipes"));

      const completedRecipeSizeIds = new Set(
        recipesSnapshot.docs
          .filter((recipeDoc) => {
            const recipeData = recipeDoc.data();

            return (
              recipeData.isComplete === true &&
              Array.isArray(recipeData.ingredients) &&
              recipeData.ingredients.length > 0
            );
          })
          .map((recipeDoc) => recipeDoc.id)
      );

      const sizesQuery = query(
        collection(db, "productSizes"),
        where("productId", "==", productId)
      );

      const querySnapshot = await getDocs(sizesQuery);

      const allSizes: ProductSize[] = querySnapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();

        return {
          id: docSnapshot.id,
          productId: data.productId,
          productName: data.productName,
          sizeName: data.sizeName,
          price: data.price,
          isAvailable: data.isAvailable,
          isActive: data.isActive ?? true,
          isDefaultSize: data.isDefaultSize === true,
          hasCompleteRecipe: completedRecipeSizeIds.has(docSnapshot.id),
        };
      });

      const activeSizeKeys = new Set(
        allSizes
          .filter((size) => size.isActive !== false)
          .map((size) => normalizeKey(size.sizeName))
      );

      const loadedSizes = allSizes.filter((size) => {
        const sizeKey = normalizeKey(size.sizeName);

        if (!size.sizeName || size.price <= 0) {
          return false;
        }

        if (statusFilter === "active") {
          return size.isActive !== false;
        }

        return size.isActive === false && !activeSizeKeys.has(sizeKey);
      });

      const uniqueSizes = loadedSizes.reduce<ProductSize[]>((uniqueList, size) => {
        const sizeKey = normalizeKey(size.sizeName);

        const alreadyExists = uniqueList.some(
          (existingSize) => normalizeKey(existingSize.sizeName) === sizeKey
        );

        if (!alreadyExists) {
          uniqueList.push(size);
        }

        return uniqueList;
      }, []);

      setProductSizes(uniqueSizes.sort((a, b) => a.price - b.price));
    } catch (error) {
      console.error(error);
      setFormMessage("Failed to load product sizes.");
    } finally {
      setIsLoadingSizes(false);
    }
  },
  [sizeStatusFilter]
);

    const loadActiveIngredientsForRecipe = useCallback(async () => {
        setIsLoadingRecipeIngredients(true);

        try {
            const ingredientsQuery = query(
            collection(db, "ingredients"),
            where("isActive", "==", true)
            );

            const querySnapshot = await getDocs(ingredientsQuery);

            const loadedIngredients: Ingredient[] = querySnapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();

            return {
                id: docSnapshot.id,
                name: data.name,
                purchaseUnit: data.purchaseUnit,
                usageUnit: data.usageUnit,
                usagePerPurchaseUnit: data.usagePerPurchaseUnit,
                purchaseCost: data.purchaseCost,
                currentStock: data.currentStock,
                minThreshold: data.minThreshold,
                costPerUsageUnit: data.costPerUsageUnit,
                isActive: data.isActive,
            };
            });

            setAvailableIngredients(
            loadedIngredients.sort((a, b) => a.name.localeCompare(b.name))
            );
        } catch (error) {
            console.error(error);
            setFormMessage("Failed to load ingredients for recipe setup.");
        } finally {
            setIsLoadingRecipeIngredients(false);
        }
        }, []);


    const loadExistingRecipe = useCallback(async (sizeId: string) => {
        setIsLoadingRecipe(true);

        try {
            const recipeRef = doc(db, "recipes", sizeId);
            const recipeSnapshot = await getDoc(recipeRef);

            if (!recipeSnapshot.exists()) {
            setSavedRecipeId("");
            setRecipeIngredients([]);
            return;
            }

            const recipeData = recipeSnapshot.data();

            setSavedRecipeId(recipeSnapshot.id);
            setRecipeIngredients(recipeData.ingredients || []);
        } catch (error) {
            console.error(error);
            setFormMessage("Failed to load saved recipe.");
        } finally {
            setIsLoadingRecipe(false);
        }
    }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const totalRecipeCost = useMemo(() => {
    return recipeIngredients.reduce((total, ingredient) => {
        return total + ingredient.requiredAmount * ingredient.costPerUsageUnit;
    }, 0);
    }, [recipeIngredients]);

    const estimatedProfit = selectedSize ? selectedSize.price - totalRecipeCost : 0;

  const filteredProducts = useMemo(() => {
  const search = searchTerm.trim().toLowerCase();

  return products.filter((product) => {
    const matchesSearch =
      !search ||
      product.name.toLowerCase().includes(search) ||
      product.category.toLowerCase().includes(search);

    const matchesCategory =
      productCategoryFilter === "All" ||
      product.category === productCategoryFilter;

    const matchesReadiness =
      productStatusFilter === "inactive" ||
      productReadinessFilter === "all" ||
      getProductReadinessKey(product) === productReadinessFilter;

    return matchesSearch && matchesCategory && matchesReadiness;
  });
}, [
  products,
  searchTerm,
  productCategoryFilter,
  productReadinessFilter,
  productStatusFilter,
]);

const productCategorySummary = useMemo(() => {
  const productsInSelectedCategory = products.filter((product) => {
    return (
      productCategoryFilter === "All" ||
      product.category === productCategoryFilter
    );
  });

  return {
    total: productsInSelectedCategory.length,
    ready: productsInSelectedCategory.filter(
      (product) => getProductReadinessKey(product) === "ready"
    ).length,
    needsSize: productsInSelectedCategory.filter(
      (product) => getProductReadinessKey(product) === "needs-size"
    ).length,
    needsRecipe: productsInSelectedCategory.filter(
      (product) => getProductReadinessKey(product) === "needs-recipe"
    ).length,
    productOff: productsInSelectedCategory.filter(
      (product) => getProductReadinessKey(product) === "product-off"
    ).length,
  };
}, [products, productCategoryFilter, productSizeStats]);

  function resetForm() {
    setName("");
    setCategory("Milk Tea");
    setSellingType("sized");
    setSingleItemPrice("");
    setIsAvailable(true);
    setFormMessage("");
  }

  function resetSizeForm() {
    setSizeName("");
    setSizePrice("");
    setIsSizeAvailable(false);
  }

    async function openProductDetails(product: Product) {
        setSelectedProduct(product);
        setProductSizes([]);
        setIsSizeFormOpen(false);
        setSizeStatusFilter("active");
        resetSizeForm();
        setFormMessage("");

        await loadProductSizes(product.id, "active");
    }

    function openEditProductModal() {
        if (!selectedProduct) {
            return;
        }

        setEditProductName(selectedProduct.name);
        setEditProductCategory(selectedProduct.category);
        setEditProductAvailable(selectedProduct.isAvailable);
        setFormMessage("");
        setIsEditProductModalOpen(true);
    }

    async function handleUpdateProduct(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedProduct || isUpdatingProduct) {
            return;
        }

        const trimmedName = editProductName.trim();
        const nameKey = normalizeKey(trimmedName);

        if (!trimmedName) {
            setFormMessage("Product name is required.");
            return;
        }

        setIsUpdatingProduct(true);
        setFormMessage("Checking product...");

        try {
            const duplicateProduct = await findProductDuplicateByNameKey(
              nameKey,
              selectedProduct.id
            );

            if (duplicateProduct) {
              const duplicateData = duplicateProduct.data();
              const duplicateStatus =
                duplicateData.isActive === false ? "inactive" : "active";

              setFormMessage(
                `${trimmedName} already exists as an ${duplicateStatus} product. Use the existing product instead of creating a duplicate.`
              );
              return;
            }

            setFormMessage("Saving changes...");

            await updateDoc(doc(db, "products", selectedProduct.id), {
            name: trimmedName,
            nameKey,
            category: editProductCategory,
            isAvailable: editProductAvailable,
            updatedAt: serverTimestamp(),
            });

            await writeActivityLog({
              actor: userProfile,
              actionType: "inventory.product.updated",
              targetId: selectedProduct.id,
              targetName: trimmedName,
              description: `${userProfile.name || "A user"} updated product ${
                selectedProduct.name
              }.`,
              metadata: {
                previousProductName: selectedProduct.name,
                newProductName: trimmedName,
                previousCategory: selectedProduct.category,
                newCategory: editProductCategory,
                sellingType: selectedProduct.sellingType || "sized",
                productAvailable: editProductAvailable,
                actionSource: "Products tab",
              },
            });

            const updatedProduct = {
            ...selectedProduct,
            name: trimmedName,
            category: editProductCategory,
            isAvailable: editProductAvailable,
            };

            setSelectedProduct(updatedProduct);
            setIsEditProductModalOpen(false);
            showTemporaryMessage("Product updated successfully.");
            await loadProducts();
        } catch (error) {
            console.error(error);
            setFormMessage("Failed to update product. Please try again.");
        } finally {
            setIsUpdatingProduct(false);
        }
    }

    function closeProductDetails() {
        setSelectedProduct(null);
        setProductSizes([]);
        setIsSizeFormOpen(false);
        setSelectedSize(null);
        setIsRecipeFormOpen(false);
        resetSizeForm();
        setFormMessage("");
    }

    async function openRecipeSetup(size: ProductSize) {
        setSelectedSize(size);
        setIsRecipeFormOpen(true);
        setSelectedIngredientId("");
        setRecipeQuantity("");
        setRecipeIngredients([]);
        setSavedRecipeId("");
        setFormMessage("");

        await loadActiveIngredientsForRecipe();
        await loadExistingRecipe(size.id);
    }

    function closeRecipeSetup() {
        setSelectedSize(null);
        setIsRecipeFormOpen(false);
        setSelectedIngredientId("");
        setRecipeQuantity("");
        setRecipeIngredients([]);
        setSavedRecipeId("");
        setFormMessage("");
    }

  function validateProductForm() {
    if (!name.trim()) {
      return "Product name is required.";
    }

    if (sellingType === "single" && Number(singleItemPrice) <= 0) {
      return "Single item price must be greater than 0.";
    }

    return "";
  }

  async function handleAddProduct(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const validationError = validateProductForm();

        if (validationError) {
            setFormMessage(validationError);
            return;
        }

        const trimmedName = name.trim();
        const nameKey = normalizeKey(trimmedName);

        setIsSaving(true);
        setFormMessage("Checking product...");

        try {
            const allProductsSnapshot = await getDocs(collection(db, "products"));

            const matchingProducts = allProductsSnapshot.docs.filter((productDoc) => {
            const productData = productDoc.data();

            const existingNameKey =
                productData.nameKey || normalizeKey(productData.name || "");

            return existingNameKey === nameKey;
            });

            const activeDuplicate = matchingProducts.find((productDoc) => {
            const productData = productDoc.data();
            return productData.isActive !== false;
            });

            const inactiveDuplicate = matchingProducts.find((productDoc) => {
            const productData = productDoc.data();
            return productData.isActive === false;
            });

            if (activeDuplicate) {
            setFormMessage(`${trimmedName} already exists in your active products.`);
            return;
            }

            if (inactiveDuplicate) {
            setFormMessage(
                `${trimmedName} already exists but is inactive. Go to Inactive products and restore it instead.`
            );
            return;
            }

            setFormMessage("Saving product...");

            const productDocRef = await addDoc(collection(db, "products"), {
              name: trimmedName,
              nameKey,
              category,
              sellingType,
              isAvailable,
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            let defaultSingleItemSizeId = "";

            if (sellingType === "single") {
              const defaultSizeDocRef = await addDoc(collection(db, "productSizes"), {
                productId: productDocRef.id,
                productName: trimmedName,
                sizeName: DEFAULT_SINGLE_ITEM_SIZE_NAME,
                sizeKey: DEFAULT_SINGLE_ITEM_SIZE_KEY,
                price: Number(singleItemPrice),
                isDefaultSize: true,
                isAvailable: false,
                isActive: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              defaultSingleItemSizeId = defaultSizeDocRef.id;
            }

            await writeActivityLog({
              actor: userProfile,
              actionType: "inventory.product.added",
              targetId: productDocRef.id,
              targetName: trimmedName,
              description: `${userProfile.name || "A user"} added product ${trimmedName}.`,
              metadata: {
                productName: trimmedName,
                productCategory: category,
                sellingType,
                productStatus: "Active",
                productAvailable: isAvailable,
                singleItemPrice:
                  sellingType === "single" ? Number(singleItemPrice) : null,
                defaultSingleItemSizeId,
                actionSource: "Products tab",
              },
            });

            resetForm();
            setIsFormOpen(false);
            showTemporaryMessage("Product saved successfully.");
            await loadProducts();
        } catch (error) {
            console.error(error);
            setFormMessage("Failed to save product. Please try again.");
        } finally {
            setIsSaving(false);
        }
    }

  async function handleRestoreProduct(product: Product) {
      setFormMessage("Checking product...");

      try {
        const nameKey = normalizeKey(product.name);

        const activeDuplicate = await findActiveProductDuplicateByNameKey(
          nameKey,
          product.id
        );

        if (activeDuplicate) {
          const activeDuplicateData = activeDuplicate.data();

          setFormMessage(
            `Cannot restore ${product.name}. Active product "${activeDuplicateData.name}" already exists. Deactivate or rename the active duplicate first.`
          );
          return;
        }

        setFormMessage("Restoring product...");

        await updateDoc(doc(db, "products", product.id), {
          isActive: true,
          isAvailable: true,
          nameKey,
          updatedAt: serverTimestamp(),
        });

        await writeActivityLog({
          actor: userProfile,
          actionType: "inventory.product.restored",
          targetId: product.id,
          targetName: product.name,
          description: `${userProfile.name || "A user"} restored product ${
            product.name
          }.`,
          metadata: {
            productName: product.name,
            productCategory: product.category,
            sellingType: product.sellingType || "sized",
            productStatus: "Active",
            productAvailable: true,
            actionSource: "Products tab",
          },
        });

        closeProductDetails();
        showTemporaryMessage("Product restored successfully.");
        await loadProducts();
      } catch (error) {
        console.error(error);
        setFormMessage("Failed to restore product. Please try again.");
      }
    }

  async function handleAddProductSize(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedProduct || isSavingSize) {
            return;
        }

        const trimmedSizeName = sizeName.trim();
        const sizeKey = normalizeKey(trimmedSizeName);
        const price = Number(sizePrice);

        if (!trimmedSizeName) {
            setFormMessage("Size name is required.");
            return;
        }

        if (price <= 0) {
            setFormMessage("Price must be greater than 0.");
            return;
        }

        setIsSavingSize(true);
        setFormMessage("Checking size...");

        try {
            const duplicateSize = await findProductSizeDuplicateBySizeKey(
              selectedProduct.id,
              sizeKey
            );

            if (duplicateSize) {
              const duplicateData = duplicateSize.data();
              const duplicateStatus = duplicateData.isActive === false ? "inactive" : "active";

              setFormMessage(
                `${trimmedSizeName} already exists as an ${duplicateStatus} size for ${selectedProduct.name}. Use the existing size instead of creating a duplicate.`
              );
              return;
            }

            setFormMessage("Saving size...");

            const sizeDocRef = await addDoc(collection(db, "productSizes"), {
              productId: selectedProduct.id,
              productName: selectedProduct.name,
              sizeName: trimmedSizeName,
              sizeKey,
              price,
              isAvailable: false,
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            await writeActivityLog({
              actor: userProfile,
              actionType: "inventory.product_size.added",
              targetId: sizeDocRef.id,
              targetName: `${selectedProduct.name} - ${trimmedSizeName}`,
              description: `${userProfile.name || "A user"} added size ${trimmedSizeName} for ${
                selectedProduct.name
              }.`,
              metadata: {
                productName: selectedProduct.name,
                sizeName: trimmedSizeName,
                sellingType: selectedProduct.sellingType || "sized",
                price,
                sizeStatus: "Active",
                sizeAvailable: false,
                actionSource: "Products tab",
              },
            });

            resetSizeForm();
            setIsSizeFormOpen(false);
            showTemporaryMessage("Size saved successfully.");
            await loadProductSizes(selectedProduct.id);
            await loadProducts();
        } catch (error) {
            console.error(error);
            setFormMessage("Failed to save size. Please try again.");
        } finally {
            setIsSavingSize(false);
        }
    }

    function handleAddIngredientToRecipe() {
        const selectedIngredient = availableIngredients.find(
            (ingredient) => ingredient.id === selectedIngredientId
        );

        const quantity = Number(recipeQuantity);

        if (!selectedIngredient) {
            setFormMessage("Select an ingredient first.");
            return;
        }

        if (quantity <= 0) {
            setFormMessage("Enter a quantity greater than 0.");
            return;
        }

        const alreadyAdded = recipeIngredients.some(
            (ingredient) => ingredient.ingredientId === selectedIngredient.id
        );

        if (alreadyAdded) {
            setFormMessage("This ingredient is already added to the recipe.");
            return;
        }

        setRecipeIngredients((currentIngredients) => [
            ...currentIngredients,
            {
            ingredientId: selectedIngredient.id,
            ingredientName: selectedIngredient.name,
            requiredAmount: quantity,
            usageUnit: selectedIngredient.usageUnit,
            costPerUsageUnit: selectedIngredient.costPerUsageUnit,
            },
        ]);

        setSelectedIngredientId("");
        setRecipeQuantity("");
        setFormMessage("");
    }

    function requestRemoveRecipeIngredient(ingredient: RecipeIngredient) {
        setRecipeIngredientToRemove(ingredient);
        }

        function confirmRemoveRecipeIngredient() {
        if (!recipeIngredientToRemove) {
            return;
        }

        setRecipeIngredients((currentIngredients) =>
            currentIngredients.filter(
            (ingredient) =>
                ingredient.ingredientId !== recipeIngredientToRemove.ingredientId
            )
        );

        setRecipeIngredientToRemove(null);
        setFormMessage("");
    }

        async function handleSaveRecipe() {
            if (!selectedProduct || !selectedSize) {
                return;
            }

            if (recipeIngredients.length === 0) {
                setFormMessage("Add at least one ingredient before saving the recipe.");
                return;
            }

            setIsSavingRecipe(true);
            setFormMessage("Saving recipe...");

            const recipeRef = doc(db, "recipes", selectedSize.id);
            const existingRecipeSnapshot = await getDoc(recipeRef);

            const recipePayload = {
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                sizeId: selectedSize.id,
                sizeName: selectedSize.sizeName,
                price: selectedSize.price,
                ingredients: recipeIngredients,
                totalRecipeCost,
                estimatedProfit,
                isComplete: true,
                updatedAt: serverTimestamp(),
                ...(existingRecipeSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
            };

            try {
                await setDoc(recipeRef, recipePayload, { merge: true });

                await updateDoc(doc(db, "productSizes", selectedSize.id), {
                    isAvailable: true,
                    updatedAt: serverTimestamp(),
                });

                await writeActivityLog({
                  actor: userProfile,
                  actionType: existingRecipeSnapshot.exists()
                    ? "inventory.recipe.updated"
                    : "inventory.recipe.added",
                  targetId: selectedSize.id,
                  targetName:
                    selectedProduct.sellingType === "single"
                      ? selectedProduct.name
                      : `${selectedProduct.name} - ${selectedSize.sizeName}`,
                  description: existingRecipeSnapshot.exists()
                    ? `${userProfile.name || "A user"} updated recipe for ${
                        selectedProduct.sellingType === "single"
                          ? selectedProduct.name
                          : `${selectedProduct.name} ${selectedSize.sizeName}`
                      }.`
                    : `${userProfile.name || "A user"} saved recipe for ${
                        selectedProduct.sellingType === "single"
                          ? selectedProduct.name
                          : `${selectedProduct.name} ${selectedSize.sizeName}`
                      }.`,
                  metadata: {
                    productName: selectedProduct.name,
                    sizeName:
                      selectedProduct.sellingType === "single" && selectedSize.isDefaultSize
                        ? "Single Item"
                        : selectedSize.sizeName,
                    sellingType: selectedProduct.sellingType || "sized",
                    price: selectedSize.price,
                    ingredientCount: recipeIngredients.length,
                    totalRecipeCost,
                    estimatedProfit,
                    actionSource: "Recipe setup",
                  },
                });

                setSavedRecipeId(selectedSize.id);

                showTemporaryMessage(
                existingRecipeSnapshot.exists()
                    ? "Recipe updated successfully."
                    : "Recipe saved successfully."
                );

                await loadProductSizes(selectedProduct.id, "active");
                await loadProducts();
                closeRecipeSetup();
            } catch (error) {
                console.error(error);
                setFormMessage("Failed to save recipe. Please try again.");
            } finally {
                setIsSavingRecipe(false);
            }
        }


        async function handleDeactivateProduct() {
            if (!selectedProduct || isDeactivatingProduct) {
                return;
            }

            setIsDeactivatingProduct(true);
            setFormMessage("Deactivating product...");

            try {
                await updateDoc(doc(db, "products", selectedProduct.id), {
                isActive: false,
                isAvailable: false,
                updatedAt: serverTimestamp(),
                });

                await writeActivityLog({
                  actor: userProfile,
                  actionType: "inventory.product.deactivated",
                  targetId: selectedProduct.id,
                  targetName: selectedProduct.name,
                  description: `${userProfile.name || "A user"} deactivated product ${
                    selectedProduct.name
                  }.`,
                  metadata: {
                    productName: selectedProduct.name,
                    productCategory: selectedProduct.category,
                    sellingType: selectedProduct.sellingType || "sized",
                    productStatus: "Inactive",
                    productAvailable: false,
                    actionSource: "Products tab",
                  },
                });

                setIsDeactivateProductConfirmOpen(false);
                closeProductDetails();
                showTemporaryMessage("Product deactivated successfully.");
                await loadProducts();
            } catch (error) {
                console.error(error);
                setFormMessage("Failed to deactivate product. Please try again.");
            } finally {
                setIsDeactivatingProduct(false);
            }
        }

        function openEditSizeModal(size: ProductSize) {
            setEditingSize(size);
            setEditSizeName(size.sizeName);
            setEditSizePrice(String(size.price));
            setEditSizeAvailable(size.isAvailable);
            setFormMessage("");
        }

        async function handleUpdateSize(event: React.FormEvent<HTMLFormElement>) {
            event.preventDefault();

            if (!selectedProduct || !editingSize || isUpdatingSize) {
                return;
            }

            const isSingleDefaultItem =
              selectedProduct.sellingType === "single" && editingSize.isDefaultSize === true;

            const trimmedSizeName = isSingleDefaultItem
              ? DEFAULT_SINGLE_ITEM_SIZE_NAME
              : editSizeName.trim();

            const sizeKey = normalizeKey(trimmedSizeName);
            const price = Number(editSizePrice);

            if (!trimmedSizeName) {
              setFormMessage(
                selectedProduct.sellingType === "single"
                  ? "Single item setup is missing. Please recreate this product."
                  : "Size name is required."
              );
              return;
            }

            if (price <= 0) {
                setFormMessage("Price must be greater than 0.");
                return;
            }

            setIsUpdatingSize(true);
            setFormMessage("Checking size...");

            try {
                const duplicateSize = await findProductSizeDuplicateBySizeKey(
                  selectedProduct.id,
                  sizeKey,
                  editingSize.id
                );

                if (duplicateSize) {
                  const duplicateData = duplicateSize.data();
                  const duplicateStatus = duplicateData.isActive === false ? "inactive" : "active";

                  setFormMessage(
                    `${trimmedSizeName} already exists as an ${duplicateStatus} size for ${selectedProduct.name}. Use the existing size instead of creating a duplicate.`
                  );
                  return;
                }

                setFormMessage("Saving size changes...");

                const recipeRef = doc(db, "recipes", editingSize.id);
                const recipeSnapshot = await getDoc(recipeRef);

                const hasCompleteRecipe =
                recipeSnapshot.exists() &&
                recipeSnapshot.data().isComplete === true &&
                Array.isArray(recipeSnapshot.data().ingredients) &&
                recipeSnapshot.data().ingredients.length > 0;

                await updateDoc(doc(db, "productSizes", editingSize.id), {
                sizeName: trimmedSizeName,
                sizeKey,
                price,
                isAvailable: hasCompleteRecipe ? editSizeAvailable : false,
                productName: selectedProduct.name,
                updatedAt: serverTimestamp(),
                });

                await writeActivityLog({
                  actor: userProfile,
                  actionType:
                    selectedProduct.sellingType === "single"
                      ? "inventory.single_item.price_updated"
                      : "inventory.product_size.updated",
                  targetId: editingSize.id,
                  targetName:
                    selectedProduct.sellingType === "single"
                      ? selectedProduct.name
                      : `${selectedProduct.name} - ${trimmedSizeName}`,
                  description:
                    selectedProduct.sellingType === "single"
                      ? `${userProfile.name || "A user"} updated single item price for ${
                          selectedProduct.name
                        }.`
                      : `${userProfile.name || "A user"} updated size ${trimmedSizeName} for ${
                          selectedProduct.name
                        }.`,
                  metadata: {
                    productName: selectedProduct.name,
                    previousSizeName: editingSize.sizeName,
                    newSizeName: trimmedSizeName,
                    sellingType: selectedProduct.sellingType || "sized",
                    previousPrice: editingSize.price,
                    newPrice: price,
                    hasCompleteRecipe,
                    sizeAvailable: hasCompleteRecipe ? editSizeAvailable : false,
                    actionSource: "Products tab",
                  },
                });

                if (recipeSnapshot.exists()) {
                await updateDoc(recipeRef, {
                    productName: selectedProduct.name,
                    sizeName: trimmedSizeName,
                    price,
                    updatedAt: serverTimestamp(),
                });
                }

                setEditingSize(null);
                showTemporaryMessage("Size updated successfully.");
                await loadProductSizes(selectedProduct.id, "active");
                await loadProducts();
            } catch (error) {
                console.error(error);
                setFormMessage("Failed to update size. Please try again.");
            } finally {
                setIsUpdatingSize(false);
            }
        }

        async function handleDeactivateSize() {
            if (!selectedProduct || !sizeToDeactivate || isDeactivatingSize) {
                return;
            }

            setIsDeactivatingSize(true);
            setFormMessage("Deactivating size...");

            try {
                await updateDoc(doc(db, "productSizes", sizeToDeactivate.id), {
                isActive: false,
                isAvailable: false,
                updatedAt: serverTimestamp(),
                });

                await writeActivityLog({
                  actor: userProfile,
                  actionType:
                    selectedProduct.sellingType === "single"
                      ? "inventory.single_item.deactivated"
                      : "inventory.product_size.deactivated",
                  targetId: sizeToDeactivate.id,
                  targetName:
                    selectedProduct.sellingType === "single"
                      ? selectedProduct.name
                      : `${selectedProduct.name} - ${sizeToDeactivate.sizeName}`,
                  description:
                    selectedProduct.sellingType === "single"
                      ? `${userProfile.name || "A user"} deactivated single item setup for ${
                          selectedProduct.name
                        }.`
                      : `${userProfile.name || "A user"} deactivated size ${
                          sizeToDeactivate.sizeName
                        } for ${selectedProduct.name}.`,
                  metadata: {
                    productName: selectedProduct.name,
                    sizeName: sizeToDeactivate.sizeName,
                    sellingType: selectedProduct.sellingType || "sized",
                    price: sizeToDeactivate.price,
                    sizeStatus: "Inactive",
                    sizeAvailable: false,
                    actionSource: "Products tab",
                  },
                });

                setSizeToDeactivate(null);
                showTemporaryMessage("Size deactivated successfully.");
                await loadProductSizes(selectedProduct.id);
                await loadProducts();
            } catch (error) {
                console.error(error);
                setFormMessage("Failed to deactivate size. Please try again.");
            } finally {
                setIsDeactivatingSize(false);
            }
        }

        async function handleRestoreSize(size: ProductSize) {
            if (!selectedProduct || isDeactivatingSize) {
                return;
            }

            setIsDeactivatingSize(true);
            setFormMessage("Checking size...");

            try {
                const sizeKey = normalizeKey(size.sizeName);

                const activeDuplicate = await findActiveProductSizeDuplicateBySizeKey(
                  selectedProduct.id,
                  sizeKey,
                  size.id
                );

                if (activeDuplicate) {
                  const activeDuplicateData = activeDuplicate.data();

                  setFormMessage(
                    `Cannot restore ${size.sizeName}. Active size "${activeDuplicateData.sizeName}" already exists for ${selectedProduct.name}. Deactivate or rename the active duplicate first.`
                  );
                  return;
                }

                setFormMessage("Restoring size...");

                const recipeRef = doc(db, "recipes", size.id);
                const recipeSnapshot = await getDoc(recipeRef);

                const hasCompleteRecipe =
                  recipeSnapshot.exists() &&
                  recipeSnapshot.data().isComplete === true &&
                  Array.isArray(recipeSnapshot.data().ingredients) &&
                  recipeSnapshot.data().ingredients.length > 0;

                await updateDoc(doc(db, "productSizes", size.id), {
                  isActive: true,
                  isAvailable: hasCompleteRecipe,
                  sizeKey,
                  updatedAt: serverTimestamp(),
                });

                await writeActivityLog({
                  actor: userProfile,
                  actionType:
                    selectedProduct.sellingType === "single"
                      ? "inventory.single_item.restored"
                      : "inventory.product_size.restored",
                  targetId: size.id,
                  targetName:
                    selectedProduct.sellingType === "single"
                      ? selectedProduct.name
                      : `${selectedProduct.name} - ${size.sizeName}`,
                  description:
                    selectedProduct.sellingType === "single"
                      ? `${userProfile.name || "A user"} restored single item setup for ${
                          selectedProduct.name
                        }.`
                      : `${userProfile.name || "A user"} restored size ${size.sizeName} for ${
                          selectedProduct.name
                        }.`,
                  metadata: {
                    productName: selectedProduct.name,
                    sizeName: size.sizeName,
                    sellingType: selectedProduct.sellingType || "sized",
                    price: size.price,
                    sizeStatus: "Active",
                    sizeAvailable: hasCompleteRecipe,
                    hasCompleteRecipe,
                    actionSource: "Products tab",
                  },
                });

                setSizeStatusFilter("active");

                await loadProductSizes(selectedProduct.id, "active");
                await loadProducts();

                showTemporaryMessage(
                  hasCompleteRecipe
                    ? "Size restored and ready for POS."
                    : "Size restored. Set up its recipe before selling."
                );
                            } catch (error) {
                                console.error(error);
                                setFormMessage("Failed to restore size. Please try again.");
                            } finally {
                                setIsDeactivatingSize(false);
                            }
                        }


                        function getSizeStatus(size: ProductSize) {
                  if (size.isActive === false) {
                    return {
                      label: "Archived",
                      className: "unavailable",
                    };
                  }

                  if (!size.hasCompleteRecipe) {
                    return {
                      label: "Needs Recipe",
                      className: "unavailable",
                    };
                  }

                  if (!size.isAvailable) {
                    return {
                      label: "Turned Off",
                      className: "unavailable",
                    };
                  }

                  return {
                    label: "Ready for POS",
                    className: "available",
                  };
                }

        function getProductListStatus(product: Product) {
  const sizeStats = productSizeStats[product.id] || {
    total: 0,
    ready: 0,
    needsRecipe: 0,
    unavailable: 0,
  };

  if (!product.isAvailable) {
    return {
      label: "Product Off",
      className: "low",
    };
  }

  if (sizeStats.total === 0) {
    return {
      label: "Needs Size",
      className: "low",
    };
  }

  if (sizeStats.ready > 0) {
    return {
      label: "Ready for POS",
      className: "ok",
    };
  }

  if (sizeStats.needsRecipe > 0) {
    return {
      label: "Needs Recipe",
      className: "low",
    };
  }

  return {
    label: "No Sellable Size",
    className: "low",
  };
}

function getProductReadinessKey(product: Product): ProductReadinessFilter {
  const productStatus = getProductListStatus(product);

  if (productStatus.label === "Ready for POS") {
    return "ready";
  }

  if (productStatus.label === "Needs Size") {
    return "needs-size";
  }

  if (productStatus.label === "Needs Recipe") {
    return "needs-recipe";
  }

  if (productStatus.label === "Product Off") {
    return "product-off";
  }

  return "not-sellable";
}
  if (isFormOpen) {
    return (
      <section className="products-panel">
        <div className="inventory-panel-heading inventory-panel-heading--compact">
          <div>
            <p className="inventory-eyebrow">New Product</p>
            <h3 className="inventory-section-title">Add Product</h3>
            <p className="inventory-section-subtext">
              Add a menu item first. Choose Has Sizes for drinks, or Single Item for rice meals, snacks, add-ons, and items without sizes.
            </p>
          </div>

          <button
            type="button"
            className="secondary-inventory-button"
            onClick={() => {
              resetForm();
              setIsFormOpen(false);
            }}
          >
            ← Back
          </button>
        </div>

        <form className="product-form" onSubmit={handleAddProduct}>
          <div className="form-group">
            <label>Product name</label>
            <input
              type="text"
              placeholder="Example: Wintermelon Milk Tea"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ProductCategory)}
            >
              {productCategories.map((productCategory) => (
                <option value={productCategory} key={productCategory}>
                  {productCategory}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Selling type</label>
            <select
              value={sellingType}
              onChange={(event) =>
                setSellingType(event.target.value as ProductSellingType)
              }
            >
              <option value="sized">Has Sizes</option>
              <option value="single">Single Item</option>
            </select>
          </div>

          {sellingType === "single" && (
            <div className="form-group">
              <label>Single item price</label>
              <input
                type="number"
                min="1"
                step="0.01"
                placeholder="Example: 49"
                value={singleItemPrice}
                onChange={(event) => setSingleItemPrice(event.target.value)}
              />
              <small>
                Use this for rice meals, snacks, hot coffee, add-ons, and other products
                that do not need sizes.
              </small>
            </div>
          )}

          <label className="inventory-toggle-row">
            <input
                type="checkbox"
                checked={isAvailable}
                onChange={(event) => setIsAvailable(event.target.checked)}
            />
            <span>
                <strong>Product is turned on</strong>
                <small>
                Keep this on if the product should be allowed for POS after sizes and recipes are completed.
                </small>
            </span>
          </label>

          <button
            className="primary-inventory-button"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Product"}
          </button>

          {formMessage && <p className="inventory-form-message">{formMessage}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="products-panel">
      <div className="inventory-panel-heading">
        <div>
          <h3>Products</h3>
          <p>Search, view, and manage menu items sold in the POS.</p>
        </div>
      </div>

      <div className="ingredient-status-filter">
        <button
          type="button"
          className={productStatusFilter === "active" ? "active" : ""}
          onClick={() => {
            setProductStatusFilter("active");
            setFormMessage("");
          }}
        >
          Active
        </button>

        <button
          type="button"
          className={productStatusFilter === "inactive" ? "active" : ""}
          onClick={() => {
            setProductStatusFilter("inactive");
            setProductReadinessFilter("all");
            setFormMessage("");
          }}
        >
          Inactive
        </button>
      </div>

      <div className="inventory-list-toolbar product-filter-toolbar">
        <div className="inventory-search-wrap">
          <input
            type="search"
            placeholder="Search products or categories..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <select
          className="product-filter-select"
          value={productCategoryFilter}
          onChange={(event) =>
            setProductCategoryFilter(event.target.value as ProductCategoryFilter)
          }
        >
          <option value="All">All Categories</option>
          {productCategories.map((productCategory) => (
            <option value={productCategory} key={productCategory}>
              {productCategory}
            </option>
          ))}
        </select>

        {productStatusFilter === "active" && (
          <select
            className="product-filter-select"
            value={productReadinessFilter}
            onChange={(event) =>
              setProductReadinessFilter(
                event.target.value as ProductReadinessFilter
              )
            }
          >
            <option value="all">All Product Statuses</option>
            <option value="ready">Ready for POS</option>
            <option value="needs-size">Needs Size</option>
            <option value="needs-recipe">Needs Recipe</option>
            <option value="product-off">Product Off</option>
            <option value="not-sellable">No Sellable Size</option>
          </select>
        )}

        <button
          className="primary-inventory-button compact"
          type="button"
          onClick={() => {
            resetForm();
            setIsFormOpen(true);
          }}
        >
          + Add Product
        </button>
      </div>

      {productStatusFilter === "active" && (
  <div className="product-category-summary-grid">
    <article className="product-category-summary-card">
      <span>
        {productCategoryFilter === "All"
          ? "All Categories"
          : productCategoryFilter}
      </span>
      <strong>{productCategorySummary.total}</strong>
      <p>Total active products</p>
    </article>

    <article className="product-category-summary-card good">
      <span>Ready</span>
      <strong>{productCategorySummary.ready}</strong>
      <p>Can be sold in POS</p>
    </article>

    <article className="product-category-summary-card warning">
      <span>Needs Size</span>
      <strong>{productCategorySummary.needsSize}</strong>
      <p>Missing selling option</p>
    </article>

    <article className="product-category-summary-card warning">
      <span>Needs Recipe</span>
      <strong>{productCategorySummary.needsRecipe}</strong>
      <p>Missing recipe setup</p>
    </article>

    <article className="product-category-summary-card muted">
      <span>Product Off</span>
      <strong>{productCategorySummary.productOff}</strong>
      <p>Not available for POS</p>
    </article>
  </div>
)}

      {formMessage && <p className="inventory-form-message">{formMessage}</p>}

      <div className="products-list-section">
        <div className="ingredients-list-header">
          <h4>Product List</h4>

          <button type="button" onClick={loadProducts}>
            Refresh
          </button>
        </div>

        {isLoadingProducts && (
          <p className="ingredients-empty-text">Loading products...</p>
        )}

        {!isLoadingProducts && products.length === 0 && (
          <p className="ingredients-empty-text">
            No {productStatusFilter} products found.
          </p>
        )}

        {!isLoadingProducts &&
          products.length > 0 &&
          filteredProducts.length === 0 && (
            <p className="ingredients-empty-text">
              No products match the current search, category, or status filter.
            </p>
          )}

        {!isLoadingProducts && filteredProducts.length > 0 && (
          <div className="products-list">
            {filteredProducts.map((product) => (
              <article
                className="product-card"
                key={product.id}
                onClick={() => openProductDetails(product)}
                >
                <div>
                  <h5>{product.name}</h5>
                  <p>{product.category}</p>
                </div>

                <div className="product-card-right">
                  <span
                        className={`ingredient-status ${
                            getProductListStatus(product).className
                        }`}
                        >
                        {getProductListStatus(product).label}
                    </span>

                  {productStatusFilter === "inactive" && (
                    <button
                        type="button"
                        className="secondary-inventory-button product-restore-button"
                        onClick={(event) => {
                            event.stopPropagation();
                            handleRestoreProduct(product);
                        }}
                        >
                        Restore
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selectedProduct && (
            <div className="product-modal-overlay" onClick={closeProductDetails}>
                <section
                className="product-modal"
                onClick={(event) => event.stopPropagation()}
                >
                <div className="product-modal-header">
                    <div>
                    <p className="inventory-eyebrow">Product Details</p>
                    <h3>{selectedProduct.name}</h3>
                    <p>{selectedProduct.category}</p>
                    </div>

                    <button
                    className="ingredient-modal-close"
                    type="button"
                    onClick={closeProductDetails}
                    >
                    ×
                    </button>
                </div>

                <div className="product-modal-status-card">
                  <span>Status</span>
                  <strong>
                    {productStatusFilter === "inactive"
                      ? "Inactive Product"
                      : selectedProduct.isAvailable
                        ? "Available for POS"
                        : "Unavailable"}
                  </strong>
                </div>

                <div className="product-modal-status-card">
                  <span>Selling Type</span>
                  <strong>
                    {selectedProduct.sellingType === "single" ? "Single Item" : "Has Sizes"}
                  </strong>
                </div>

            {productStatusFilter === "active" && (
                <div className="product-sizes-section">
                    <div className="product-sizes-header">
                        <div>
                            <h4>
                              {selectedProduct.sellingType === "single"
                                ? "Single Item Price & Recipe"
                                : "Sizes & Prices"}
                            </h4>
                            <p>
                              {selectedProduct.sellingType === "single"
                                ? "Manage this item’s price and recipe. No size will be shown in POS."
                                : "Manage active sizes for POS, or restore archived sizes when needed."}
                            </p>
                        </div>

                        {selectedProduct.sellingType !== "single" && sizeStatusFilter === "active" && (
                          <button
                            type="button"
                            className="primary-inventory-button compact"
                            onClick={() => {
                              resetSizeForm();
                              setIsSizeFormOpen(true);
                            }}
                          >
                            + Add Size
                          </button>
                        )}
                        </div>

                        {selectedProduct.sellingType !== "single" && (
                          <div className="ingredient-status-filter">
                            <button
                              type="button"
                              className={sizeStatusFilter === "active" ? "active" : ""}
                              onClick={async () => {
                                if (!selectedProduct) {
                                  return;
                                }

                                setSizeStatusFilter("active");
                                setFormMessage("");
                                await loadProductSizes(selectedProduct.id, "active");
                              }}
                            >
                              Active Sizes
                            </button>

                            <button
                              type="button"
                              className={sizeStatusFilter === "inactive" ? "active" : ""}
                              onClick={async () => {
                                if (!selectedProduct) {
                                  return;
                                }

                                setSizeStatusFilter("inactive");
                                setFormMessage("");
                                await loadProductSizes(selectedProduct.id, "inactive");
                              }}
                            >
                              Inactive Sizes
                            </button>
                          </div>
                        )}

                    {isLoadingSizes && (
                    <p className="ingredients-empty-text">Loading sizes...</p>
                    )}

                    {!isLoadingSizes && productSizes.length === 0 && (
                        <p className="ingredients-empty-text">
                            {selectedProduct.sellingType === "single"
                            ? "No single item setup found. This product may need to be recreated or repaired."
                            : sizeStatusFilter === "active"
                              ? "No active sizes added yet. Add at least one size before recipe setup."
                              : "No inactive sizes found for this product."}
                        </p>
                    )}

                    {!isLoadingSizes && productSizes.length > 0 && (
                    <div className="product-size-list">
                        {productSizes.map((size) => (
                        <article className="product-size-card" key={size.id}>
                            <div className="product-size-info">
                                <div>
                                    <h5>
                                       {selectedProduct.sellingType === "single" && size.isDefaultSize
                                        ? "Single Item"
                                        : size.sizeName}
                                    </h5>
                                    <p>
                                    <span className={`size-status-pill ${getSizeStatus(size).className}`}>
                                        {getSizeStatus(size).label}
                                    </span>
                                    </p>
                                </div>

                                <strong>₱{size.price.toFixed(2)}</strong>
                            </div>

                            {sizeStatusFilter === "active" ? (
                            <>
                            <button
                                className="secondary-inventory-button setup-recipe-button"
                                type="button"
                                onClick={() => openRecipeSetup(size)}
                                >
                                {size.hasCompleteRecipe
                                ? "Update Recipe"
                                : selectedProduct.sellingType === "single"
                                  ? "Setup Item Recipe"
                                  : "Setup Recipe"}
                            </button>

                            <button
                            className="secondary-inventory-button setup-recipe-button"
                            type="button"
                            onClick={() => openEditSizeModal(size)}
                            >
                            {selectedProduct.sellingType === "single" ? "Edit Price" : "Edit Size"}
                            </button>

                            <button
                            className="danger-inventory-button setup-recipe-button"
                            type="button"
                            onClick={() => setSizeToDeactivate(size)}
                            >
                            {selectedProduct.sellingType === "single" ? "Deactivate Item" : "Deactivate Size"}
                            </button>
                        </>
                        ) : (
                        <button
                            className="primary-inventory-button setup-recipe-button"
                            type="button"
                            onClick={() => handleRestoreSize(size)}
                            disabled={isDeactivatingSize}
                        >
                            {isDeactivatingSize ? "Restoring..." : "Restore Size"}
                        </button>
                        )}
                        </article>
                        ))}
                    </div>
                    )}
                </div>

                )}

                <div className="product-modal-actions">
                    {productStatusFilter === "active" ? (
                        <>
                        <button
                            type="button"
                            className="secondary-inventory-button"
                            onClick={openEditProductModal}
                        >
                            Edit Product
                        </button>

                        <button
                            type="button"
                            className="danger-inventory-button"
                            onClick={() => setIsDeactivateProductConfirmOpen(true)}
                        >
                            Deactivate
                        </button>
                        </>
                    ) : (
                        <>
                        <button
                            type="button"
                            className="primary-inventory-button"
                            onClick={() => handleRestoreProduct(selectedProduct)}
                        >
                            Restore Product
                        </button>

                        <button
                            type="button"
                            className="secondary-inventory-button"
                            onClick={closeProductDetails}
                        >
                            Close
                        </button>
                        </>
                    )}
                </div>
            </section>
        </div>
    )}

        {isEditProductModalOpen && selectedProduct && (
          <div
            className="edit-modal-overlay"
            onClick={() => {
              if (!isUpdatingProduct) {
                setIsEditProductModalOpen(false);
                setFormMessage("");
              }
            }}
          >
            <form
              className="edit-modal"
              onSubmit={handleUpdateProduct}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="edit-modal-header">
                <div>
                  <p className="inventory-eyebrow">Edit Product</p>
                  <h3>{selectedProduct.name}</h3>
                  <p>Update this product’s name, category, and POS availability.</p>
                </div>

                <button
                  className="ingredient-modal-close"
                  type="button"
                  onClick={() => {
                    if (!isUpdatingProduct) {
                      setIsEditProductModalOpen(false);
                      setFormMessage("");
                    }
                  }}
                >
                  ×
                </button>
              </div>

              <div className="form-group">
                <label htmlFor="editProductName">Product name</label>
                <input
                  id="editProductName"
                  value={editProductName}
                  onChange={(event) => setEditProductName(event.target.value)}
                  placeholder="Example: Wintermelon Milk Tea"
                />
              </div>

              <div className="form-group">
                <label htmlFor="editProductCategory">Category</label>
                <select
                  id="editProductCategory"
                  value={editProductCategory}
                  onChange={(event) =>
                    setEditProductCategory(event.target.value as ProductCategory)
                  }
                >
                  {productCategories.map((productCategory) => (
                    <option key={productCategory} value={productCategory}>
                      {productCategory}
                    </option>
                  ))}
                </select>
              </div>

              <label className="inventory-toggle-row">
                <input
                  type="checkbox"
                  checked={editProductAvailable}
                  onChange={(event) =>
                    setEditProductAvailable(event.target.checked)
                  }
                />
                <span>
                  <strong>Available for POS</strong>
                  <small>Turn this off if the item should not appear in POS.</small>
                </span>
              </label>

              {formMessage && <p className="inventory-form-message">{formMessage}</p>}

              <div className="edit-modal-actions">
                <button
                  className="primary-inventory-button"
                  type="submit"
                  disabled={isUpdatingProduct}
                >
                  {isUpdatingProduct ? "Saving..." : "Save Changes"}
                </button>

                <button
                  className="secondary-inventory-button"
                  type="button"
                  disabled={isUpdatingProduct}
                  onClick={() => {
                    setIsEditProductModalOpen(false);
                    setFormMessage("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {isDeactivateProductConfirmOpen && selectedProduct && (
            <div
                className="confirm-modal-overlay"
                onClick={() => {
                if (!isDeactivatingProduct) {
                    setIsDeactivateProductConfirmOpen(false);
                }
                }}
            >
                <section
                className="confirm-modal"
                onClick={(event) => event.stopPropagation()}
                >
                <div className="confirm-modal-icon">!</div>

                <div>
                    <p className="inventory-eyebrow">Confirm Action</p>
                    <h3>Deactivate {selectedProduct.name}?</h3>
                    <p>
                    This will hide the product from active lists and POS, but keep its
                    record safe for recipe and transaction history.
                    </p>
                </div>

                {formMessage && <p className="inventory-form-message">{formMessage}</p>}

                <div className="confirm-modal-actions">
                    <button
                    type="button"
                    className="danger-inventory-button"
                    onClick={handleDeactivateProduct}
                    disabled={isDeactivatingProduct}
                    >
                    {isDeactivatingProduct ? "Deactivating..." : "Yes, Deactivate"}
                    </button>

                    <button
                    type="button"
                    className="secondary-inventory-button"
                    onClick={() => setIsDeactivateProductConfirmOpen(false)}
                    disabled={isDeactivatingProduct}
                    >
                    Cancel
                    </button>
                </div>
                </section>
            </div>
        )}

        {sizeToDeactivate && selectedProduct && (
            <div
                className="confirm-modal-overlay"
                onClick={() => {
                if (!isDeactivatingSize) {
                    setSizeToDeactivate(null);
                    setFormMessage("");
                }
                }}
            >
                <section
                className="confirm-modal"
                onClick={(event) => event.stopPropagation()}
                >
                <div className="confirm-modal-icon">!</div>

                <div>
                    <p className="inventory-eyebrow">Confirm Action</p>
                    <h3>Deactivate {sizeToDeactivate.sizeName}?</h3>
                    <p>
                    This will archive this size and hide it from the product size list and
                    POS. Existing recipe records stay safe for history.
                    </p>
                </div>

                {formMessage && <p className="inventory-form-message">{formMessage}</p>}

                <div className="confirm-modal-actions">
                    <button
                    type="button"
                    className="danger-inventory-button"
                    onClick={handleDeactivateSize}
                    disabled={isDeactivatingSize}
                    >
                    {isDeactivatingSize ? "Deactivating..." : "Yes, Deactivate"}
                    </button>

                    <button
                    type="button"
                    className="secondary-inventory-button"
                    onClick={() => {
                        setSizeToDeactivate(null);
                        setFormMessage("");
                    }}
                    disabled={isDeactivatingSize}
                    >
                    Cancel
                    </button>
                </div>
                </section>
            </div>
        )}

        {editingSize && selectedProduct && (
            <div
                className="size-modal-overlay"
                onClick={() => {
                if (!isUpdatingSize) {
                    setEditingSize(null);
                    setFormMessage("");
                }
                }}
            >
                <form
                className="size-modal"
                onSubmit={handleUpdateSize}
                onClick={(event) => event.stopPropagation()}
                >
                <div className="size-modal-header">
                    <div>
                    <p className="inventory-eyebrow">
                      {selectedProduct.sellingType === "single" ? "Edit Single Item" : "Edit Size"}
                    </p>
                    <h3>{selectedProduct.name}</h3>
                    <p>
                      {selectedProduct.sellingType === "single"
                        ? "Update this item’s selling price. No size will be shown in POS."
                        : "Update this size name, selling price, and POS availability."}
                    </p>
                    </div>

                    <button
                    className="ingredient-modal-close"
                    type="button"
                    onClick={() => {
                        if (!isUpdatingSize) {
                        setEditingSize(null);
                        setFormMessage("");
                        }
                    }}
                    >
                    ×
                    </button>
                </div>

                {selectedProduct.sellingType === "single" && editingSize.isDefaultSize ? (
                  <div className="inventory-toggle-row">
                    <span>
                      <strong>Single item</strong>
                      <small>
                        This product does not use sizes. Only the price and recipe are managed.
                      </small>
                    </span>
                  </div>
                ) : (
                  <div className="form-group">
                    <label htmlFor="editSizeName">Size name</label>
                    <input
                      id="editSizeName"
                      value={editSizeName}
                      onChange={(event) => setEditSizeName(event.target.value)}
                      placeholder="Example: Solo, Double, Large"
                    />
                  </div>
                )}

                <div className="form-group">
                    <label htmlFor="editSizePrice">Selling price</label>
                    <input
                    id="editSizePrice"
                    type="number"
                    min="1"
                    step="0.01"
                    value={editSizePrice}
                    onChange={(event) => setEditSizePrice(event.target.value)}
                    placeholder="Example: 39"
                    />
                </div>

                <div className="inventory-toggle-row">
                    <span>
                        <strong>Needs recipe before selling</strong>
                        <small>
                        After saving this size, tap Setup Recipe. It will only become ready for POS after the recipe is complete.
                        </small>
                    </span>
                </div>

                {formMessage && <p className="inventory-form-message">{formMessage}</p>}

                <div className="size-modal-actions">
                    <button
                    className="primary-inventory-button"
                    type="submit"
                    disabled={isUpdatingSize}
                    >
                    {isUpdatingSize ? "Saving..." : "Save Changes"}
                    </button>

                    <button
                    className="secondary-inventory-button"
                    type="button"
                    disabled={isUpdatingSize}
                    onClick={() => {
                        setEditingSize(null);
                        setFormMessage("");
                    }}
                    >
                    Cancel
                    </button>
                </div>
                </form>
            </div>
        )}

        {isSizeFormOpen && selectedProduct && (
            <div
                className="size-modal-overlay"
                onClick={() => {
                if (!isSavingSize) {
                    setIsSizeFormOpen(false);
                    resetSizeForm();
                    setFormMessage("");
                }
                }}
            >
                <form
                className="size-modal"
                onSubmit={handleAddProductSize}
                onClick={(event) => event.stopPropagation()}
                >
                <div className="size-modal-header">
                    <div>
                    <p className="inventory-eyebrow">New Size</p>
                    <h3>{selectedProduct.name}</h3>
                    <p>Add a selling size and price for this product.</p>
                    </div>

                    <button
                    className="ingredient-modal-close"
                    type="button"
                    onClick={() => {
                        if (!isSavingSize) {
                        setIsSizeFormOpen(false);
                        resetSizeForm();
                        setFormMessage("");
                        }
                    }}
                    >
                    ×
                    </button>
                </div>

                <div className="form-group">
                    <label>Size name</label>
                    <input
                    type="text"
                    placeholder="Example: Solo, Double, Triple"
                    value={sizeName}
                    onChange={(event) => setSizeName(event.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label>Price</label>
                    <input
                    type="number"
                    min="0"
                    placeholder="Example: 39"
                    value={sizePrice}
                    onChange={(event) => setSizePrice(event.target.value)}
                    />
                </div>

                <label className="inventory-toggle-row">
                    <input
                    type="checkbox"
                    checked={isSizeAvailable}
                    onChange={(event) => setIsSizeAvailable(event.target.checked)}
                    />
                    <span>
                    <strong>Available for POS</strong>
                    <small>This size can be sold once the recipe is complete.</small>
                    </span>
                </label>

                {formMessage && <p className="inventory-form-message">{formMessage}</p>}

                <div className="size-modal-actions">
                    <button
                    type="submit"
                    className="primary-inventory-button"
                    disabled={isSavingSize}
                    >
                    {isSavingSize ? "Saving..." : "Save Size"}
                    </button>

                    <button
                    type="button"
                    className="secondary-inventory-button"
                    disabled={isSavingSize}
                    onClick={() => {
                        setIsSizeFormOpen(false);
                        resetSizeForm();
                        setFormMessage("");
                    }}
                    >
                    Cancel
                    </button>
                </div>
                </form>
            </div>
            )}

            {isRecipeFormOpen && selectedProduct && selectedSize && (
                <div className="recipe-modal-overlay" onClick={closeRecipeSetup}>
                    <section
                    className="recipe-modal"
                    onClick={(event) => event.stopPropagation()}
                    >
                    <div className="recipe-modal-header">
                        <div>
                        <p className="inventory-eyebrow">Recipe Setup</p>
                        <h3>{selectedProduct.name}</h3>
                        <p>
                            {selectedProduct.sellingType === "single" && selectedSize.isDefaultSize ? (
                              <>
                                Single item price: <strong>₱{selectedSize.price.toFixed(2)}</strong>
                              </>
                            ) : (
                              <>
                                Size: <strong>{selectedSize.sizeName}</strong> · Selling price:{" "}
                                <strong>₱{selectedSize.price.toFixed(2)}</strong>
                              </>
                            )}
                        </p>
                        {isLoadingRecipe && (
                        <p className="recipe-status-text">Loading saved recipe...</p>
                        )}

                        {!isLoadingRecipe && savedRecipeId && (
                        <p className="recipe-status-text">Saved recipe loaded. You can update it below.</p>
                        )}

                        {!isLoadingRecipe && !savedRecipeId && (
                        <p className="recipe-status-text">No saved recipe yet.</p>
                        )}
                        </div>

                        <button
                        className="ingredient-modal-close"
                        type="button"
                        onClick={closeRecipeSetup}
                        >
                        ×
                        </button>
                    </div>

                    <div className="recipe-builder-card">
                        <div className="form-group">
                            <label>Ingredient</label>
                            <select
                            value={selectedIngredientId}
                            onChange={(event) => setSelectedIngredientId(event.target.value)}
                            disabled={isLoadingRecipeIngredients}
                            >
                            <option value="">
                                {isLoadingRecipeIngredients ? "Loading ingredients..." : "Select ingredient"}
                            </option>

                            {availableIngredients.map((ingredient) => (
                                <option value={ingredient.id} key={ingredient.id}>
                                {ingredient.name} ({ingredient.usageUnit})
                                </option>
                            ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Quantity used</label>
                            <input
                            type="number"
                            min="0"
                            placeholder="Example: 2"
                            value={recipeQuantity}
                            onChange={(event) => setRecipeQuantity(event.target.value)}
                            />
                        </div>
                        
                        <button
                            type="button"
                            className="primary-inventory-button"
                            onClick={handleAddIngredientToRecipe}
                        >
                            Add to Recipe
                        </button>
                        </div>

                        <div className="recipe-items-card">
                        <h4>Recipe Ingredients</h4>

                        {recipeIngredients.length === 0 && (
                            <p>No ingredients added yet.</p>
                        )}

                        {recipeIngredients.length > 0 && (
                            <div className="recipe-item-list">
                            {recipeIngredients.map((ingredient) => (
                                <article className="recipe-item-card" key={ingredient.ingredientId}>
                                <div>
                                    <h5>{ingredient.ingredientName}</h5>
                                    <p>
                                    {ingredient.requiredAmount} {ingredient.usageUnit}s × ₱
                                    {ingredient.costPerUsageUnit.toFixed(2)}
                                    </p>
                                </div>

                                <div className="recipe-item-right">
                                    <strong>
                                    ₱
                                    {(ingredient.requiredAmount * ingredient.costPerUsageUnit).toFixed(2)}
                                    </strong>

                                    <button
                                        type="button"
                                        onClick={() => requestRemoveRecipeIngredient(ingredient)}
                                        >
                                        Remove
                                    </button>
                                </div>
                                </article>
                            ))}
                            </div>
                        )}
                        </div>

                        <div className="recipe-summary-card">
                        <div>
                            <span>Selling Price</span>
                            <strong>₱{selectedSize.price.toFixed(2)}</strong>
                        </div>

                        <div>
                            <span>Recipe Cost</span>
                            <strong>₱{totalRecipeCost.toFixed(2)}</strong>
                        </div>

                        <div>
                            <span>Estimated Profit</span>
                            <strong>₱{estimatedProfit.toFixed(2)}</strong>
                        </div>
                        </div>

                        {formMessage && <p className="inventory-form-message">{formMessage}</p>}

                        <div className="recipe-modal-actions">
                        <button
                            type="button"
                            className="primary-inventory-button"
                            disabled={recipeIngredients.length === 0 || isSavingRecipe}
                            onClick={handleSaveRecipe}
                            >
                            {isSavingRecipe ? "Saving..." : "Save Recipe"}
                        </button>

                        <button
                            type="button"
                            className="secondary-inventory-button"
                            onClick={closeRecipeSetup}
                        >
                            Close
                        </button>
                        </div>
                    </section>
                </div>
                )}

                {recipeIngredientToRemove && (
                    <div
                        className="confirm-modal-overlay"
                        onClick={() => setRecipeIngredientToRemove(null)}
                    >
                        <section
                        className="confirm-modal"
                        onClick={(event) => event.stopPropagation()}
                        >
                        <div className="confirm-modal-icon">!</div>

                        <div>
                            <p className="inventory-eyebrow">Confirm Removal</p>
                            <h3>Remove {recipeIngredientToRemove.ingredientName}?</h3>
                            <p>
                            This will remove the ingredient from the recipe builder. You still need
                            to save the recipe to apply the change.
                            </p>
                        </div>

                        <div className="confirm-modal-actions">
                            <button
                            type="button"
                            className="danger-inventory-button"
                            onClick={confirmRemoveRecipeIngredient}
                            >
                            Yes, Remove
                            </button>

                            <button
                            type="button"
                            className="secondary-inventory-button"
                            onClick={() => setRecipeIngredientToRemove(null)}
                            >
                            Cancel
                            </button>
                        </div>
                        </section>
                    </div>
                    )}

    </section>
  );
}

export default ProductsPanel;