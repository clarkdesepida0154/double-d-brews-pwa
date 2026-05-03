import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
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

  const [isSizeFormOpen, setIsSizeFormOpen] = useState(false);
  const [sizeName, setSizeName] = useState("");
  const [sizePrice, setSizePrice] = useState("");
  const [isSizeAvailable, setIsSizeAvailable] = useState(true);
  const [isSavingSize, setIsSavingSize] = useState(false);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);

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

      const querySnapshot = await getDocs(productsQuery);

      const loadedProducts: Product[] = querySnapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();

        return {
          id: docSnapshot.id,
          name: data.name,
          category: data.category,
          isAvailable: data.isAvailable,
        };
      });

      setProducts(
        loadedProducts.sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (error) {
      console.error(error);
      setFormMessage("Failed to load products.");
    } finally {
      setIsLoadingProducts(false);
    }
  }, [productStatusFilter]);

  const loadProductSizes = useCallback(async (productId: string) => {
    setIsLoadingSizes(true);

    try {
        const sizesQuery = query(
        collection(db, "productSizes"),
        where("productId", "==", productId)
        );

        const querySnapshot = await getDocs(sizesQuery);

        const loadedSizes: ProductSize[] = querySnapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();

        return {
            id: docSnapshot.id,
            productId: data.productId,
            sizeName: data.sizeName,
            price: data.price,
            isAvailable: data.isAvailable,
        };
        });

        setProductSizes(
        loadedSizes.sort((a, b) => a.price - b.price)
        );
    } catch (error) {
        console.error(error);
        setFormMessage("Failed to load product sizes.");
    } finally {
        setIsLoadingSizes(false);
    }
    }, []);

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
            const recipesQuery = query(
            collection(db, "recipes"),
            where("sizeId", "==", sizeId)
            );

            const querySnapshot = await getDocs(recipesQuery);

            if (querySnapshot.empty) {
            setSavedRecipeId("");
            setRecipeIngredients([]);
            return;
            }

            const recipeDoc = querySnapshot.docs[0];
            const recipeData = recipeDoc.data();

            setSavedRecipeId(recipeDoc.id);
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
    setIsSizeAvailable(true);
    }

    async function openProductDetails(product: Product) {
    setSelectedProduct(product);
    setProductSizes([]);
    setIsSizeFormOpen(false);
    resetSizeForm();
    setFormMessage("");

    await loadProductSizes(product.id);
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

    setIsSaving(true);
    setFormMessage("Saving product...");

    try {
      await addDoc(collection(db, "products"), {
        name: name.trim(),
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
    setFormMessage("Restoring product...");

    try {
      const productRef = doc(db, "products", product.id);

      await updateDoc(productRef, {
        isActive: true,
        updatedAt: serverTimestamp(),
      });

      showTemporaryMessage("Product restored successfully.");
      await loadProducts();
    } catch (error) {
      console.error(error);
      setFormMessage("Failed to restore product. Please try again.");
    }
  }

  async function handleAddProductSize(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedProduct) {
            return;
        }

        const trimmedSizeName = sizeName.trim();
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
        setFormMessage("Saving size...");

        try {
            await addDoc(collection(db, "productSizes"), {
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            sizeName: trimmedSizeName,
            price,
            isAvailable: isSizeAvailable,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            });

            resetSizeForm();
            setIsSizeFormOpen(false);
            showTemporaryMessage("Size saved successfully.");
            await loadProductSizes(selectedProduct.id);
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
            };

            try {
                if (savedRecipeId) {
                const recipeRef = doc(db, "recipes", savedRecipeId);

                await updateDoc(recipeRef, recipePayload);

                showTemporaryMessage("Recipe updated successfully.");
                } else {
                const newRecipeRef = await addDoc(collection(db, "recipes"), {
                    ...recipePayload,
                    createdAt: serverTimestamp(),
                });

                setSavedRecipeId(newRecipeRef.id);

                showTemporaryMessage("Recipe saved successfully.");
                }

                closeRecipeSetup();
            } catch (error) {
                console.error(error);
                setFormMessage("Failed to save recipe. Please try again.");
            } finally {
                setIsSavingRecipe(false);
            }
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
              <strong>Available for POS</strong>
              <small>This product can appear in POS once recipe setup is complete.</small>
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
                  <span className={`ingredient-status ${product.isAvailable ? "ok" : "low"}`}>
                    {product.isAvailable ? "Available" : "Unavailable"}
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
                    <strong>{selectedProduct.isAvailable ? "Available for POS" : "Unavailable"}</strong>
                </div>

                <div className="product-sizes-section">
                    <div className="product-sizes-header">
                    <div>
                        <h4>Sizes & Prices</h4>
                        <p>Set the selling sizes before creating recipes.</p>
                    </div>

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
                    </div>

                    {isLoadingSizes && (
                    <p className="ingredients-empty-text">Loading sizes...</p>
                    )}

                    {!isLoadingSizes && productSizes.length === 0 && (
                    <p className="ingredients-empty-text">
                        No sizes added yet. Add at least one size before recipe setup.
                    </p>
                    )}

                    {!isLoadingSizes && productSizes.length > 0 && (
                    <div className="product-size-list">
                        {productSizes.map((size) => (
                        <article className="product-size-card" key={size.id}>
                            <div className="product-size-info">
                                <div>
                                <h5>{size.sizeName}</h5>
                                <p>{size.isAvailable ? "Available" : "Unavailable"}</p>
                                </div>

                                <strong>₱{size.price.toFixed(2)}</strong>
                            </div>

                            <button
                                type="button"
                                className="secondary-inventory-button setup-recipe-button"
                                onClick={() => openRecipeSetup(size)}
                            >
                                Setup Recipe
                            </button>
                        </article>
                        ))}
                    </div>
                    )}
                </div>

                <div className="product-modal-actions">
                    <button type="button" className="secondary-inventory-button">
                    Edit Product
                    </button>

                    <button type="button" className="danger-inventory-button">
                    Deactivate
                    </button>
                </div>
                </section>
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