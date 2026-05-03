import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import type { Ingredient } from "../../types/InventoryTypes";
import { formatIngredientStock } from "./inventoryUtils";

function LowStockPanel() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadIngredients = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

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

      setIngredients(
        loadedIngredients.sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (error) {
      console.error(error);
      setMessage("Failed to load low-stock ingredients.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  const lowStockIngredients = useMemo(() => {
    return ingredients.filter(
      (ingredient) => ingredient.currentStock <= ingredient.minThreshold
    );
  }, [ingredients]);

  return (
    <section className="low-stock-panel">
      <div className="inventory-panel-heading">
        <div>
          <h3>Low Stock</h3>
          <p>Review ingredients that need restocking soon.</p>
        </div>

        <button
          type="button"
          className="secondary-inventory-button"
          onClick={loadIngredients}
        >
          Refresh
        </button>
      </div>

      {message && <p className="inventory-form-message">{message}</p>}

      {isLoading && (
        <p className="ingredients-empty-text">Loading low-stock ingredients...</p>
      )}

      {!isLoading && lowStockIngredients.length === 0 && (
        <div className="low-stock-empty-card">
          <h4>All stocks look good.</h4>
          <p>No active ingredients are currently below their low-stock threshold.</p>
        </div>
      )}

      {!isLoading && lowStockIngredients.length > 0 && (
        <div className="low-stock-list">
          {lowStockIngredients.map((ingredient) => (
            <article className="low-stock-card" key={ingredient.id}>
              <div>
                <h4>{ingredient.name}</h4>
                <p>
                  Current stock: <strong>{formatIngredientStock(ingredient)}</strong>
                </p>
                <p>
                  Low-stock alert: below{" "}
                  <strong>
                    {ingredient.minThreshold} {ingredient.usageUnit}s
                  </strong>
                </p>
              </div>

              <span className="ingredient-status low">Low</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default LowStockPanel;