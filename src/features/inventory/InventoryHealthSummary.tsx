import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config.ts";

type HealthStats = {
  readyForPos: number;
  needsRecipe: number;
  lowStock: number;
  criticalStock: number;
};

function InventoryHealthSummary() {
  const [stats, setStats] = useState<HealthStats>({
    readyForPos: 0,
    needsRecipe: 0,
    lowStock: 0,
    criticalStock: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadHealthSummary = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    try {
      const activeProductsQuery = query(
        collection(db, "products"),
        where("isActive", "==", true)
      );

      const activeSizesQuery = query(
        collection(db, "productSizes"),
        where("isActive", "==", true)
      );

      const activeIngredientsQuery = query(
        collection(db, "ingredients"),
        where("isActive", "==", true)
      );

      const [
        productsSnapshot,
        sizesSnapshot,
        recipesSnapshot,
        ingredientsSnapshot,
      ] = await Promise.all([
        getDocs(activeProductsQuery),
        getDocs(activeSizesQuery),
        getDocs(collection(db, "recipes")),
        getDocs(activeIngredientsQuery),
      ]);

      const activeProductIds = new Set(
        productsSnapshot.docs
          .filter((productDoc) => productDoc.data().isAvailable !== false)
          .map((productDoc) => productDoc.id)
      );

      const completeRecipeSizeIds = new Set(
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

      const activeSellableSizes = sizesSnapshot.docs.filter((sizeDoc) => {
        const sizeData = sizeDoc.data();

        return (
          activeProductIds.has(sizeData.productId) &&
          sizeData.isAvailable !== false
        );
      });

      const readyForPos = activeSellableSizes.filter((sizeDoc) =>
        completeRecipeSizeIds.has(sizeDoc.id)
      ).length;

      const needsRecipe = activeSellableSizes.filter(
        (sizeDoc) => !completeRecipeSizeIds.has(sizeDoc.id)
      ).length;

      const lowStockIngredients = ingredientsSnapshot.docs.filter((ingredientDoc) => {
        const ingredientData = ingredientDoc.data();

        return ingredientData.currentStock <= ingredientData.minThreshold;
      });

      const criticalStock = lowStockIngredients.filter((ingredientDoc) => {
        const ingredientData = ingredientDoc.data();

        return ingredientData.currentStock <= 0;
      }).length;

      setStats({
        readyForPos,
        needsRecipe,
        lowStock: lowStockIngredients.length,
        criticalStock,
      });
    } catch (error) {
      console.error(error);
      setMessage("Failed to load inventory health summary.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealthSummary();
  }, [loadHealthSummary]);

  const overallStatus = useMemo(() => {
    if (stats.criticalStock > 0) {
      return {
        title: "Action needed",
        text: "Some ingredients are critically low. Restock before selling.",
        className: "danger",
      };
    }

    if (stats.needsRecipe > 0 || stats.lowStock > 0) {
      return {
        title: "Almost ready",
        text: "Some products or ingredients still need attention.",
        className: "warning",
      };
    }

    if (stats.readyForPos > 0) {
      return {
        title: "Ready to sell",
        text: "Inventory looks ready for POS sales.",
        className: "good",
      };
    }

    return {
      title: "Setup needed",
      text: "Add products, sizes, recipes, and ingredients to prepare POS.",
      className: "warning",
    };
  }, [stats]);

  return (
    <section className="inventory-health-summary">
      <div className={`inventory-health-main-card ${overallStatus.className}`}>
        <div>
          <p className="inventory-eyebrow">Inventory Health</p>
          <h3>{overallStatus.title}</h3>
          <p>{overallStatus.text}</p>
        </div>

        <button
          type="button"
          className="secondary-inventory-button"
          onClick={loadHealthSummary}
          disabled={isLoading}
        >
          {isLoading ? "Checking..." : "Refresh"}
        </button>
      </div>

      {message && <p className="inventory-form-message">{message}</p>}

      <div className="inventory-health-grid">
        <article className="inventory-health-card good">
          <span>Ready for POS</span>
          <strong>{stats.readyForPos}</strong>
          <p>Product sizes that can be sold now.</p>
        </article>

        <article className="inventory-health-card warning">
          <span>Needs Recipe</span>
          <strong>{stats.needsRecipe}</strong>
          <p>Active sizes missing recipe setup.</p>
        </article>

        <article className="inventory-health-card warning">
          <span>Low Stock</span>
          <strong>{stats.lowStock}</strong>
          <p>Ingredients at or below alert level.</p>
        </article>

        <article className="inventory-health-card danger">
          <span>Critical Stock</span>
          <strong>{stats.criticalStock}</strong>
          <p>Ingredients with zero or negative stock.</p>
        </article>
      </div>
    </section>
  );
}

export default InventoryHealthSummary;