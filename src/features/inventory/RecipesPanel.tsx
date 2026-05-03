import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { ProductSize, Recipe } from "../../types/InventoryTypes";

function RecipesPanel() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);
  const [message, setMessage] = useState("");
  const [missingRecipeSizes, setMissingRecipeSizes] = useState<ProductSize[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const loadRecipes = useCallback(async () => {
        setIsLoadingRecipes(true);
        setMessage("");

        try {
            const recipesQuery = query(collection(db, "recipes"));
            const recipesSnapshot = await getDocs(recipesQuery);

            const loadedRecipes: Recipe[] = recipesSnapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();

            return {
                id: docSnapshot.id,
                productId: data.productId,
                productName: data.productName,
                sizeId: data.sizeId,
                sizeName: data.sizeName,
                price: data.price,
                ingredients: data.ingredients || [],
                totalRecipeCost: data.totalRecipeCost || 0,
                isComplete: data.isComplete ?? false,
            };
            });

            const sizesQuery = query(
            collection(db, "productSizes"),
            where("isActive", "==", true)
            );

            const sizesSnapshot = await getDocs(sizesQuery);

            const loadedSizes: ProductSize[] = sizesSnapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();

            return {
                id: docSnapshot.id,
                productId: data.productId,
                sizeName: data.sizeName,
                price: data.price,
                isAvailable: data.isAvailable,
            };
            });

            const recipeSizeIds = new Set(
            loadedRecipes.map((recipe) => recipe.sizeId)
            );

            const sizesWithoutRecipes = loadedSizes.filter(
            (size) => !recipeSizeIds.has(size.id)
            );

            const uniqueRecipes = loadedRecipes.reduce<Recipe[]>((uniqueList, recipe) => {
                const alreadyExists = uniqueList.some(
                    (existingRecipe) => existingRecipe.sizeId === recipe.sizeId
                );

                if (!alreadyExists) {
                    uniqueList.push(recipe);
                }

                return uniqueList;
                }, []);

                setRecipes(
                uniqueRecipes.sort((a, b) =>
                    `${a.productName} ${a.sizeName}`.localeCompare(
                    `${b.productName} ${b.sizeName}`
                    )
                )
            );

            setMissingRecipeSizes(
            sizesWithoutRecipes.sort((a, b) =>
                `${a.productId} ${a.sizeName}`.localeCompare(
                `${b.productId} ${b.sizeName}`
                )
            )
            );
        } catch (error) {
            console.error(error);
            setMessage("Failed to load recipes.");
        } finally {
            setIsLoadingRecipes(false);
        }
    }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  return (
    <section className="recipes-panel">
      <div className="inventory-panel-heading">
        <div>
          <h3>Recipes</h3>
          <p>Review saved product recipes, costs, and estimated profit.</p>
        </div>

        <button
          type="button"
          className="secondary-inventory-button"
          onClick={loadRecipes}
        >
          Refresh
        </button>
      </div>

      {message && <p className="inventory-form-message">{message}</p>}

      {isLoadingRecipes && (
        <p className="ingredients-empty-text">Loading recipes...</p>
      )}

      {!isLoadingRecipes && recipes.length === 0 && (
        <div className="low-stock-empty-card">
          <h4>No recipes saved yet.</h4>
          <p>
            Create recipes from Products → Product Details → Setup Recipe.
          </p>
        </div>
      )}

      {!isLoadingRecipes && missingRecipeSizes.length > 0 && (
            <div className="missing-recipes-section">
                <div>
                <h4>Missing Recipes</h4>
                <p>
                    These product sizes do not have recipes yet and should not be used in POS
                    until setup is complete.
                </p>
                </div>

                <div className="missing-recipes-list">
                {missingRecipeSizes.map((size) => (
                    <article className="missing-recipe-card" key={size.id}>
                    <div>
                        <h5>{size.sizeName}</h5>
                        <p>Product ID: {size.productId}</p>
                        <p>Selling price: ₱{size.price.toFixed(2)}</p>
                    </div>

                    <span className="ingredient-status low">Missing</span>
                    </article>
                ))}
                </div>
            </div>
        )}

      {!isLoadingRecipes && recipes.length > 0 && (
        <div className="recipes-list">
          {recipes.map((recipe) => {
            const estimatedProfit = recipe.price - recipe.totalRecipeCost;

            return (
              <article className="recipe-card" key={recipe.id}>
                <div className="recipe-card-header">
                  <div>
                    <h4>{recipe.productName}</h4>
                    <p>{recipe.sizeName}</p>
                  </div>

                  <span
                    className={`ingredient-status ${
                      recipe.isComplete ? "ok" : "low"
                    }`}
                  >
                    {recipe.isComplete ? "Complete" : "Missing"}
                  </span>
                </div>

                <div className="recipe-card-summary">
                  <div>
                    <span>Selling Price</span>
                    <strong>₱{recipe.price.toFixed(2)}</strong>
                  </div>

                  <div>
                    <span>Recipe Cost</span>
                    <strong>₱{recipe.totalRecipeCost.toFixed(2)}</strong>
                  </div>

                  <div>
                    <span>Estimated Profit</span>
                    <strong>₱{estimatedProfit.toFixed(2)}</strong>
                  </div>
                </div>

                <button
                    type="button"
                    className="recipe-card-ingredients recipe-card-ingredients-button"
                    onClick={() => setSelectedRecipe(recipe)}
                    >
                    <span>Ingredients</span>

                    {recipe.ingredients.length === 0 ? (
                        <p>No ingredients added.</p>
                    ) : (
                        <p>
                        {recipe.ingredients.length} ingredient
                        {recipe.ingredients.length === 1 ? "" : "s"} added. Tap to view full list.
                        </p>
                    )}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selectedRecipe && (
            <div
                className="recipe-ingredients-modal-overlay"
                onClick={() => setSelectedRecipe(null)}
            >
                <section
                className="recipe-ingredients-modal"
                onClick={(event) => event.stopPropagation()}
                >
                <div className="recipe-modal-header">
                    <div>
                    <p className="inventory-eyebrow">Recipe Ingredients</p>
                    <h3>{selectedRecipe.productName}</h3>
                    <p>
                        {selectedRecipe.sizeName} · ₱{selectedRecipe.price.toFixed(2)}
                    </p>
                    </div>

                    <button
                    className="ingredient-modal-close"
                    type="button"
                    onClick={() => setSelectedRecipe(null)}
                    >
                    ×
                    </button>
                </div>

                <div className="recipe-summary-card">
                    <div>
                    <span>Recipe Cost</span>
                    <strong>₱{selectedRecipe.totalRecipeCost.toFixed(2)}</strong>
                    </div>

                    <div>
                    <span>Estimated Profit</span>
                    <strong>
                        ₱{(selectedRecipe.price - selectedRecipe.totalRecipeCost).toFixed(2)}
                    </strong>
                    </div>
                </div>

                <div className="recipe-full-ingredient-list">
                    {selectedRecipe.ingredients.map((ingredient) => (
                    <article
                        className="recipe-full-ingredient-card"
                        key={ingredient.ingredientId}
                    >
                        <div>
                        <h4>{ingredient.ingredientName}</h4>
                        <p>
                            {ingredient.requiredAmount} {ingredient.usageUnit}s × ₱
                            {ingredient.costPerUsageUnit.toFixed(2)}
                        </p>
                        </div>

                        <strong>
                        ₱
                        {(ingredient.requiredAmount * ingredient.costPerUsageUnit).toFixed(2)}
                        </strong>
                    </article>
                    ))}
                </div>
                </section>
            </div>
        )}
    </section>
  );
}

export default RecipesPanel;