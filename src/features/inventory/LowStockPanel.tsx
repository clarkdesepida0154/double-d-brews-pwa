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
import type { Ingredient } from "../../types/InventoryTypes";
import {
  calculateStockFromPurchaseQuantity,
  formatIngredientStock,
} from "./inventoryUtils";

type StockMovement = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  movementType: "restock" | "sale deduction" | "manual adjustment" | string;
  purchaseQuantity?: number;
  purchaseUnit?: string;
  usageAmountAdded?: number;
  usageUnit?: string;
  previousStock?: number;
  newStock?: number;
  note?: string;
  createdAt?: {
    toDate?: () => Date;
  };
};

function getStockStatus(ingredient: Ingredient) {
  if (ingredient.currentStock <= 0) {
    return {
      label: "Critical",
      className: "critical",
      helperText: "This ingredient may already be out of stock.",
    };
  }

  if (ingredient.currentStock <= ingredient.minThreshold) {
    return {
      label: "Low Stock",
      className: "low",
      helperText: "This ingredient needs restocking soon.",
    };
  }

  return {
    label: "Enough Stock",
    className: "ok",
    helperText: "This ingredient is above the low-stock alert level.",
  };
}

function LowStockPanel() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);

const loadStockMovements = useCallback(async () => {
  setIsLoadingMovements(true);

  try {
    const movementsQuery = query(
      collection(db, "stockMovements"),
      where("movementType", "==", "restock")
    );

    const querySnapshot = await getDocs(movementsQuery);

    const loadedMovements: StockMovement[] = querySnapshot.docs.map(
      (docSnapshot) => {
        const data = docSnapshot.data();

        return {
          id: docSnapshot.id,
          ingredientId: data.ingredientId,
          ingredientName: data.ingredientName,
          movementType: data.movementType,
          purchaseQuantity: data.purchaseQuantity,
          purchaseUnit: data.purchaseUnit,
          usageAmountAdded: data.usageAmountAdded,
          usageUnit: data.usageUnit,
          previousStock: data.previousStock,
          newStock: data.newStock,
          note: data.note,
          createdAt: data.createdAt,
        };
      }
    );

    const sortedMovements = loadedMovements
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate?.()?.getTime() || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime() || 0;

        return dateB - dateA;
      })
      .slice(0, 10);

    setStockMovements(sortedMovements);
  } catch (error) {
    console.error(error);
    setMessage("Failed to load restock history.");
  } finally {
    setIsLoadingMovements(false);
  }
}, []);

  const [ingredientToRestock, setIngredientToRestock] =
    useState<Ingredient | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockNote, setRestockNote] = useState("");
  const [isRestocking, setIsRestocking] = useState(false);

  const loadIngredients = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    try {
      const ingredientsQuery = query(
        collection(db, "ingredients"),
        where("isActive", "==", true)
      );

      const querySnapshot = await getDocs(ingredientsQuery);

      const loadedIngredients: Ingredient[] = querySnapshot.docs.map(
        (docSnapshot) => {
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
        }
      );

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
  loadStockMovements();
}, [loadIngredients, loadStockMovements]);

  const lowStockIngredients = useMemo(() => {
    return ingredients.filter(
      (ingredient) => ingredient.currentStock <= ingredient.minThreshold
    );
  }, [ingredients]);

  const criticalCount = useMemo(() => {
    return lowStockIngredients.filter(
      (ingredient) => ingredient.currentStock <= 0
    ).length;
  }, [lowStockIngredients]);

  const lowCount = lowStockIngredients.length - criticalCount;

  function openRestockModal(ingredient: Ingredient) {
    setIngredientToRestock(ingredient);
    setRestockQuantity("");
    setRestockNote("");
    setMessage("");
  }

  function closeRestockModal() {
    if (isRestocking) {
      return;
    }

    setIngredientToRestock(null);
    setRestockQuantity("");
    setRestockNote("");
    setMessage("");
  }

  async function handleRestockIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ingredientToRestock || isRestocking) {
      return;
    }

    const purchaseQuantity = Number(restockQuantity);

    if (purchaseQuantity <= 0) {
      setMessage("Enter how many purchase units you added.");
      return;
    }

    const stockToAdd = calculateStockFromPurchaseQuantity(
      purchaseQuantity,
      ingredientToRestock.usagePerPurchaseUnit
    );

    if (stockToAdd <= 0) {
      setMessage("This ingredient has an invalid stock conversion setup.");
      return;
    }

    const previousStock = ingredientToRestock.currentStock;
    const newStock = previousStock + stockToAdd;

    setIsRestocking(true);
    setMessage("Saving restock...");

    try {
      await updateDoc(doc(db, "ingredients", ingredientToRestock.id), {
        currentStock: newStock,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "stockMovements"), {
        ingredientId: ingredientToRestock.id,
        ingredientName: ingredientToRestock.name,
        movementType: "restock",
        purchaseQuantity,
        purchaseUnit: ingredientToRestock.purchaseUnit,
        usageAmountAdded: stockToAdd,
        usageUnit: ingredientToRestock.usageUnit,
        previousStock,
        newStock,
        note: restockNote.trim(),
        createdAt: serverTimestamp(),
      });

      setIngredientToRestock(null);
      setRestockQuantity("");
      setRestockNote("");
      setMessage("Ingredient restocked successfully.");
      await loadIngredients();
      await loadStockMovements();
    } catch (error) {
      console.error(error);
      setMessage("Failed to restock ingredient. Please try again.");
    } finally {
      setIsRestocking(false);
    }
  }


function formatMovementDate(movement: StockMovement) {
  const movementDate = movement.createdAt?.toDate?.();

  if (!movementDate) {
    return "Just now";
  }

  return movementDate.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

  return (
    <section className="low-stock-panel">
      <div className="inventory-panel-heading">
        <div>
          <h3>Low Stock</h3>
          <p>
            Review ingredients that need restocking before they affect POS sales.
          </p>
        </div>

        <button
          type="button"
          className="secondary-inventory-button"
          onClick={loadIngredients}
        >
          Refresh
        </button>
      </div>

      <div className="low-stock-summary-grid">
        <article className="low-stock-summary-card">
          <span>Critical</span>
          <strong>{criticalCount}</strong>
          <p>Ingredients with zero or negative stock.</p>
        </article>

        <article className="low-stock-summary-card">
          <span>Low Stock</span>
          <strong>{lowCount}</strong>
          <p>Ingredients at or below their alert level.</p>
        </article>

        <article className="low-stock-summary-card">
          <span>Total Alerts</span>
          <strong>{lowStockIngredients.length}</strong>
          <p>Ingredients that need attention.</p>
        </article>
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
          {lowStockIngredients.map((ingredient) => {
            const stockStatus = getStockStatus(ingredient);

            return (
              <article className="low-stock-card" key={ingredient.id}>
                <div>
                  <h4>{ingredient.name}</h4>

                  <p>
                    Current stock:{" "}
                    <strong>{formatIngredientStock(ingredient)}</strong>
                  </p>

                  <p>
                    Minimum needed:{" "}
                    <strong>
                      {ingredient.minThreshold} {ingredient.usageUnit}
                      {ingredient.minThreshold === 1 ? "" : "s"}
                    </strong>
                  </p>

                  <p className="low-stock-helper-text">
                    {stockStatus.helperText}
                  </p>
                </div>

                <div className="low-stock-card-actions">
                  <span className={`ingredient-status ${stockStatus.className}`}>
                    {stockStatus.label}
                  </span>

                  <button
                    type="button"
                    className="primary-inventory-button compact"
                    onClick={() => openRestockModal(ingredient)}
                  >
                    Restock
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}


      <div className="stock-movement-history">
            <div className="inventory-panel-heading inventory-panel-heading--compact">
                <div>
                <h3>Recent Restock History</h3>
                <p>
                View recent restocks and notes added during restock. Sales deductions are kept
                for sales reports.
                </p>
                </div>

                <button
                type="button"
                className="secondary-inventory-button"
                onClick={loadStockMovements}
                >
                Refresh History
                </button>
            </div>

            {isLoadingMovements && (
                <p className="ingredients-empty-text">Loading stock history...</p>
            )}

            {!isLoadingMovements && stockMovements.length === 0 && (
                <div className="low-stock-empty-card">
                <h4>No stock history yet.</h4>
                <p>Restock an ingredient first, then the record will appear here.</p>
                </div>
            )}

            {!isLoadingMovements && stockMovements.length > 0 && (
                <div className="stock-movement-list">
                {stockMovements.map((movement) => (
                    <article className="stock-movement-card" key={movement.id}>
                    <div>
                        <div className="stock-movement-card-header">
                        <h4>{movement.ingredientName}</h4>
                        <span className="ingredient-status ok">
                            {movement.movementType}
                        </span>
                        </div>

                        <p>
                        Restocked:{" "}
                        <strong>
                            {movement.purchaseQuantity || 0} {movement.purchaseUnit || ""}
                        </strong>
                        </p>

                        <p>
                        Added stock:{" "}
                        <strong>
                            {movement.usageAmountAdded || 0} {movement.usageUnit || ""}
                        </strong>
                        </p>

                        <p>
                        Stock changed from{" "}
                        <strong>
                            {movement.previousStock || 0} {movement.usageUnit || ""}
                        </strong>{" "}
                        to{" "}
                        <strong>
                            {movement.newStock || 0} {movement.usageUnit || ""}
                        </strong>
                        </p>

                        {movement.note && (
                        <p className="stock-movement-note">
                            Note: {movement.note}
                        </p>
                        )}
                    </div>

                    <small>{formatMovementDate(movement)}</small>
                    </article>
                ))}
                </div>
            )}
        </div>


      {ingredientToRestock && (
        <div className="size-modal-overlay" onClick={closeRestockModal}>
          <form
            className="size-modal"
            onSubmit={handleRestockIngredient}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="size-modal-header">
              <div>
                <p className="inventory-eyebrow">Restock Ingredient</p>
                <h3>{ingredientToRestock.name}</h3>
                <p>
                  Add stock using the purchase unit you normally buy, like packs,
                  bottles, cans, or boxes.
                </p>
              </div>

              <button
                className="ingredient-modal-close"
                type="button"
                onClick={closeRestockModal}
                disabled={isRestocking}
              >
                ×
              </button>
            </div>

            <div className="low-stock-restock-preview">
              <p>
                Current stock:{" "}
                <strong>{formatIngredientStock(ingredientToRestock)}</strong>
              </p>

              <p>
                1 {ingredientToRestock.purchaseUnit} ={" "}
                <strong>
                  {ingredientToRestock.usagePerPurchaseUnit}{" "}
                  {ingredientToRestock.usageUnit}
                  {ingredientToRestock.usagePerPurchaseUnit === 1 ? "" : "s"}
                </strong>
              </p>
            </div>

            <div className="form-group">
              <label>
                How many {ingredientToRestock.purchaseUnit}
                {ingredientToRestock.purchaseUnit === "other" ? "" : "s"} did you add?
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Example: 3"
                value={restockQuantity}
                onChange={(event) => setRestockQuantity(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Optional note</label>
              <input
                type="text"
                placeholder="Example: Bought from supplier today"
                value={restockNote}
                onChange={(event) => setRestockNote(event.target.value)}
              />
            </div>

            {restockQuantity && Number(restockQuantity) > 0 && (
              <div className="low-stock-restock-preview">
                <p>
                  Stock to add:{" "}
                  <strong>
                    {calculateStockFromPurchaseQuantity(
                      Number(restockQuantity),
                      ingredientToRestock.usagePerPurchaseUnit
                    )}{" "}
                    {ingredientToRestock.usageUnit}
                    {calculateStockFromPurchaseQuantity(
                      Number(restockQuantity),
                      ingredientToRestock.usagePerPurchaseUnit
                    ) === 1
                      ? ""
                      : "s"}
                  </strong>
                </p>

                <p>
                  New stock after saving:{" "}
                  <strong>
                    {ingredientToRestock.currentStock +
                      calculateStockFromPurchaseQuantity(
                        Number(restockQuantity),
                        ingredientToRestock.usagePerPurchaseUnit
                      )}{" "}
                    {ingredientToRestock.usageUnit}
                    {ingredientToRestock.currentStock +
                      calculateStockFromPurchaseQuantity(
                        Number(restockQuantity),
                        ingredientToRestock.usagePerPurchaseUnit
                      ) ===
                    1
                      ? ""
                      : "s"}
                  </strong>
                </p>
              </div>
            )}

            {message && <p className="inventory-form-message">{message}</p>}

            <div className="size-modal-actions">
              <button
                type="submit"
                className="primary-inventory-button"
                disabled={isRestocking}
              >
                {isRestocking ? "Saving..." : "Save Restock"}
              </button>

              <button
                type="button"
                className="secondary-inventory-button"
                onClick={closeRestockModal}
                disabled={isRestocking}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default LowStockPanel;