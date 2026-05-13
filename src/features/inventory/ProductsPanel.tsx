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
import { db } from "../../firebase/config";
import type {
  Ingredient,
  Product,
  ProductCategory,
  ProductSize,
  RecipeIngredient,
} from "../../types/InventoryTypes";

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

function ProductsPanel() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<"active" | "inactive">("active");

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("Milk Tea");
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

    if (!search) {
      return products;
    }

    return products.filter((product) =>
      product.name.toLowerCase().includes(search)
    );
  }, [products, searchTerm]);

  function resetForm() {
    setName("");
    setCategory("Milk Tea");
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

            await addDoc(collection(db, "products"), {
            name: trimmedName,
            nameKey,
            category,
            isAvailable,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
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

            await addDoc(collection(db, "productSizes"), {
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

            const trimmedSizeName = editSizeName.trim();
            const sizeKey = normalizeKey(trimmedSizeName);
            const price = Number(editSizePrice);

            if (!trimmedSizeName) {
                setFormMessage("Size name is required.");
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

  if (isFormOpen) {
    return (
      <section className="products-panel">
        <div className="inventory-panel-heading inventory-panel-heading--compact">
          <div>
            <p className="inventory-eyebrow">New Product</p>
            <h3 className="inventory-section-title">Add Product</h3>
            <p className="inventory-section-subtext">
              Add a menu item first. Sizes and recipes will be configured next.
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
            setFormMessage("");
          }}
        >
          Inactive
        </button>
      </div>

      <div className="inventory-list-toolbar">
        <div className="inventory-search-wrap">
          <input
            type="search"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

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
            <p className="ingredients-empty-text">No products match your search.</p>
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

            {productStatusFilter === "active" && (
                <div className="product-sizes-section">
                    <div className="product-sizes-header">
                        <div>
                            <h4>Sizes & Prices</h4>
                            <p>
                            Manage active sizes for POS, or restore archived sizes when needed.
                            </p>
                        </div>

                        {sizeStatusFilter === "active" && (
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

                    {isLoadingSizes && (
                    <p className="ingredients-empty-text">Loading sizes...</p>
                    )}

                    {!isLoadingSizes && productSizes.length === 0 && (
                        <p className="ingredients-empty-text">
                            {sizeStatusFilter === "active"
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
                                    <h5>{size.sizeName}</h5>
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
                                {size.hasCompleteRecipe ? "Update Recipe" : "Setup Recipe"}
                            </button>

                            <button
                            className="secondary-inventory-button setup-recipe-button"
                            type="button"
                            onClick={() => openEditSizeModal(size)}
                            >
                            Edit Size
                            </button>

                            <button
                            className="danger-inventory-button setup-recipe-button"
                            type="button"
                            onClick={() => setSizeToDeactivate(size)}
                            >
                            Deactivate Size
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
                    <p className="inventory-eyebrow">Edit Size</p>
                    <h3>{selectedProduct.name}</h3>
                    <p>Update this size name, selling price, and POS availability.</p>
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

                <div className="form-group">
                    <label htmlFor="editSizeName">Size name</label>
                    <input
                    id="editSizeName"
                    value={editSizeName}
                    onChange={(event) => setEditSizeName(event.target.value)}
                    placeholder="Example: Solo, Double, Large"
                    />
                </div>

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
                            Size: <strong>{selectedSize.sizeName}</strong> · Selling price:{" "}
                            <strong>₱{selectedSize.price.toFixed(2)}</strong>
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