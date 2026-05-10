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
import type { UserProfile } from "../../types/UserProfile";
import { writeActivityLog } from "../../utils/activityLogUtils";
import type {
  Ingredient,
  PurchaseUnit,
  UsageUnit,
} from "../../types/InventoryTypes";
import {
  calculateCostPerUsageUnit,
  calculateStockFromPurchaseQuantity,
  formatIngredientStock,
} from "./inventoryUtils";

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function findIngredientDuplicateByNameKey(
  nameKey: string,
  currentIngredientId = ""
) {
  const allIngredientsSnapshot = await getDocs(collection(db, "ingredients"));

  return allIngredientsSnapshot.docs.find((ingredientDoc) => {
    if (ingredientDoc.id === currentIngredientId) {
      return false;
    }

    const ingredientData = ingredientDoc.data();

    const existingNameKey =
      ingredientData.nameKey || normalizeKey(ingredientData.name || "");

    return existingNameKey === nameKey;
  });
}

async function findActiveIngredientDuplicateByNameKey(
  nameKey: string,
  currentIngredientId = ""
) {
  const allIngredientsSnapshot = await getDocs(collection(db, "ingredients"));

  return allIngredientsSnapshot.docs.find((ingredientDoc) => {
    if (ingredientDoc.id === currentIngredientId) {
      return false;
    }

    const ingredientData = ingredientDoc.data();

    const existingNameKey =
      ingredientData.nameKey || normalizeKey(ingredientData.name || "");

    return existingNameKey === nameKey && ingredientData.isActive !== false;
  });
}

const purchaseUnits: PurchaseUnit[] = [
  "bag",
  "bottle",
  "can",
  "box",
  "pack",
  "container",
  "kg",
  "liter",
  "piece",
];

const usageUnits: UsageUnit[] = [
  "gram",
  "ml",
  "pump",
  "scoop",
  "piece",
  "serving",
  "oz",
];

type IngredientsPanelProps = {
  isStaffMode?: boolean;
  userProfile: UserProfile;
};

function IngredientsPanel({
  isStaffMode = false,
  userProfile,
}: IngredientsPanelProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [ingredientStatusFilter, setIngredientStatusFilter] = useState<"active" | "inactive">("active");

  const [name, setName] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState<PurchaseUnit>("bottle");
  const [usageUnit, setUsageUnit] = useState<UsageUnit>("pump");
  const [usagePerPurchaseUnit, setUsagePerPurchaseUnit] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [currentStockQuantity, setCurrentStockQuantity] = useState("");
  const [minThreshold, setMinThreshold] = useState("");

  const [formMessage, setFormMessage] = useState("");
  function showTemporaryMessage(message: string, duration = 2500) {
  setFormMessage(message);

  window.setTimeout(() => {
    setFormMessage("");
  }, duration);
}
  const [isSaving, setIsSaving] = useState(false);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [isRestocking, setIsRestocking] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdatingIngredient, setIsUpdatingIngredient] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const loadIngredients = useCallback(async () => {
    setIsLoadingIngredients(true);

    try {
      const ingredientsQuery = query(
        collection(db, "ingredients"),
        where("isActive", "==", ingredientStatusFilter === "active")
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
      setFormMessage("Failed to load ingredients.");
    } finally {
      setIsLoadingIngredients(false);
    }
  }, [ingredientStatusFilter]);

    useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  useEffect(() => {
    if (isStaffMode && ingredientStatusFilter === "inactive") {
      setIngredientStatusFilter("active");
    }
  }, [isStaffMode, ingredientStatusFilter]);

  const filteredIngredients = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return ingredients;
    }

    return ingredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(search)
    );
  }, [ingredients, searchTerm]);

  const preview = useMemo(() => {
    const conversion = Number(usagePerPurchaseUnit);
    const stockQuantity = Number(currentStockQuantity);
    const cost = Number(purchaseCost);

    const totalUsageStock = calculateStockFromPurchaseQuantity(
      stockQuantity || 0,
      conversion || 0
    );

    const costPerUsageUnit = calculateCostPerUsageUnit(cost || 0, conversion || 0);

    const wholePurchaseUnits =
      conversion > 0 ? Math.floor(totalUsageStock / conversion) : 0;

    const remainingUsageUnits =
      conversion > 0 ? totalUsageStock % conversion : 0;

    return {
      totalUsageStock,
      costPerUsageUnit,
      wholePurchaseUnits,
      remainingUsageUnits,
    };
  }, [usagePerPurchaseUnit, currentStockQuantity, purchaseCost]);

  function resetForm() {
    setName("");
    setPurchaseUnit("bottle");
    setUsageUnit("pump");
    setUsagePerPurchaseUnit("");
    setPurchaseCost("");
    setCurrentStockQuantity("");
    setMinThreshold("");
    setFormMessage("");
  }

  function handleBackToList() {
    resetForm();
    setIsFormOpen(false);
  }

  function closeIngredientModal() {
    setSelectedIngredient(null);
    setIsRestockOpen(false);
    setRestockQuantity("");
    setIsEditOpen(false);
    setIsDeactivateConfirmOpen(false);
  }

  function openRestockForm() {
    setIsRestockOpen(true);
    setRestockQuantity("");
    setFormMessage("");
  }

  function openEditForm() {
    if (isStaffMode) {
      setFormMessage("Staff operators can restock ingredients, but cannot edit setup details.");
      return;
    }

    if (!selectedIngredient) {
      return;
    }

    setName(selectedIngredient.name);
    setPurchaseUnit(selectedIngredient.purchaseUnit);
    setUsageUnit(selectedIngredient.usageUnit);
    setUsagePerPurchaseUnit(String(selectedIngredient.usagePerPurchaseUnit));
    setPurchaseCost(String(selectedIngredient.purchaseCost));
    setMinThreshold(String(selectedIngredient.minThreshold));

    setIsEditOpen(true);
    setIsRestockOpen(false);
    setFormMessage("");
  }

  async function handleRestockIngredient() {
    if (!selectedIngredient) {
      return;
    }

    const quantity = Number(restockQuantity);

    if (quantity <= 0) {
      setFormMessage("Enter a restock quantity greater than 0.");
      return;
    }

    setIsRestocking(true);
    setFormMessage("Updating stock...");

    try {
      const addedStock = calculateStockFromPurchaseQuantity(
        quantity,
        selectedIngredient.usagePerPurchaseUnit
      );
      const previousStock = selectedIngredient.currentStock;
      const newStock = previousStock + addedStock;

      const nameKey = normalizeKey(selectedIngredient.name);

      const activeDuplicate = await findActiveIngredientDuplicateByNameKey(
        nameKey,
        selectedIngredient.id
      );

      if (activeDuplicate) {
        const activeDuplicateData = activeDuplicate.data();

        setFormMessage(
          `Cannot restore ${selectedIngredient.name}. Active ingredient "${activeDuplicateData.name}" already exists. Deactivate or rename the active duplicate first.`
        );
        return;
      }

      const ingredientRef = doc(db, "ingredients", selectedIngredient.id);

      await updateDoc(ingredientRef, {
        isActive: true,
        nameKey,
        updatedAt: serverTimestamp(),
      });

      await writeActivityLog({
        actor: userProfile,
        actionType: "inventory.ingredient.restored",
        targetId: selectedIngredient.id,
        targetName: selectedIngredient.name,
        description: `${userProfile.name || "A user"} restored ingredient ${
          selectedIngredient.name
        }.`,
        metadata: {
          ingredientName: selectedIngredient.name,
          ingredientStatus: "Active",
          purchaseUnit: selectedIngredient.purchaseUnit,
          usageUnit: selectedIngredient.usageUnit,
          usagePerPurchaseUnit: selectedIngredient.usagePerPurchaseUnit,
          purchaseCost: selectedIngredient.purchaseCost,
          currentStock: selectedIngredient.currentStock,
          minThreshold: selectedIngredient.minThreshold,
          actionSource: "Ingredients tab",
        },
      });
      await writeActivityLog({
        actor: userProfile,
        actionType: "inventory.ingredient.deactivated",
        targetId: selectedIngredient.id,
        targetName: selectedIngredient.name,
        description: `${userProfile.name || "A user"} deactivated ingredient ${
          selectedIngredient.name
        }.`,
        metadata: {
          ingredientName: selectedIngredient.name,
          ingredientStatus: "Inactive",
          purchaseUnit: selectedIngredient.purchaseUnit,
          usageUnit: selectedIngredient.usageUnit,
          usagePerPurchaseUnit: selectedIngredient.usagePerPurchaseUnit,
          purchaseCost: selectedIngredient.purchaseCost,
          currentStock: selectedIngredient.currentStock,
          minThreshold: selectedIngredient.minThreshold,
          actionSource: "Ingredients tab",
        },
      });

      await writeActivityLog({
        actor: userProfile,
        actionType: "inventory.ingredient.restocked",
        targetId: selectedIngredient.id,
        targetName: selectedIngredient.name,
        description: `${userProfile.name || "A user"} restocked ${
          selectedIngredient.name
        } from the Ingredients tab.`,
        metadata: {
          ingredientName: selectedIngredient.name,
          purchaseQuantity: quantity,
          purchaseUnit: selectedIngredient.purchaseUnit,
          usageAmountAdded: addedStock,
          usageUnit: selectedIngredient.usageUnit,
          previousStock,
          newStock,
          restockSource: "Ingredients tab",
        },
      });

      showTemporaryMessage("Stock updated successfully.");
      setIsRestockOpen(false);
      setRestockQuantity("");
      setSelectedIngredient(null);

      await loadIngredients();
    } catch (error) {
      console.error(error);
      setFormMessage("Failed to update stock. Please try again.");
    } finally {
      setIsRestocking(false);
    }
  }

  async function handleDeactivateIngredient() {
    if (isStaffMode) {
      setFormMessage("Staff operators cannot deactivate ingredients.");
      return;
    }

    if (!selectedIngredient) {
      return;
    }

    setIsDeactivating(true);
    setFormMessage("Deactivating ingredient...");

    try {
      const ingredientBeingDeactivated = selectedIngredient;
      const ingredientRef = doc(db, "ingredients", ingredientBeingDeactivated.id);

      await updateDoc(ingredientRef, {
        isActive: false,
        nameKey: normalizeKey(ingredientBeingDeactivated.name),
        updatedAt: serverTimestamp(),
      });

      await writeActivityLog({
        actor: userProfile,
        actionType: "inventory.ingredient.deactivated",
        targetId: ingredientBeingDeactivated.id,
        targetName: ingredientBeingDeactivated.name,
        description: `${userProfile.name || "A user"} deactivated ingredient ${
          ingredientBeingDeactivated.name
        }.`,
        metadata: {
          ingredientName: ingredientBeingDeactivated.name,
          ingredientStatus: "Inactive",
          purchaseUnit: ingredientBeingDeactivated.purchaseUnit,
          usageUnit: ingredientBeingDeactivated.usageUnit,
          usagePerPurchaseUnit: ingredientBeingDeactivated.usagePerPurchaseUnit,
          purchaseCost: ingredientBeingDeactivated.purchaseCost,
          currentStock: ingredientBeingDeactivated.currentStock,
          minThreshold: ingredientBeingDeactivated.minThreshold,
          actionSource: "Ingredients tab",
        },
      });

      showTemporaryMessage("Ingredient deactivated successfully.");
      setIsDeactivateConfirmOpen(false);
      closeIngredientModal();

      await loadIngredients();
    } catch (error) {
      console.error(error);
      setFormMessage("Failed to deactivate ingredient. Please try again.");
    } finally {
      setIsDeactivating(false);
    }
  }

  async function handleRestoreIngredient() {
    if (isStaffMode) {
      setFormMessage("Staff operators cannot restore inactive ingredients.");
      return;
    }

    if (!selectedIngredient) {
      return;
    }

    setFormMessage("Restoring ingredient...");

    try {
      const ingredientRef = doc(db, "ingredients", selectedIngredient.id);

      await updateDoc(ingredientRef, {
        isActive: true,
        updatedAt: serverTimestamp(),
      });

      await writeActivityLog({
        actor: userProfile,
        actionType: "inventory.ingredient.restored",
        targetId: selectedIngredient.id,
        targetName: selectedIngredient.name,
        description: `${userProfile.name || "A user"} restored ingredient ${
          selectedIngredient.name
        }.`,
        metadata: {
          ingredientName: selectedIngredient.name,
          ingredientStatus: "Active",
          purchaseUnit: selectedIngredient.purchaseUnit,
          usageUnit: selectedIngredient.usageUnit,
          usagePerPurchaseUnit: selectedIngredient.usagePerPurchaseUnit,
          purchaseCost: selectedIngredient.purchaseCost,
          currentStock: selectedIngredient.currentStock,
          minThreshold: selectedIngredient.minThreshold,
          actionSource: "Ingredients tab",
        },
      });

      showTemporaryMessage("Ingredient restored successfully.");
      closeIngredientModal();

      await loadIngredients();
    } catch (error) {
      console.error(error);
      setFormMessage("Failed to restore ingredient. Please try again.");
    }
  }

  async function handleUpdateIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isStaffMode) {
      setFormMessage("Staff operators cannot edit ingredient setup details.");
      return;
    }

    if (!selectedIngredient) {
      return;
    }

    const validationError = validateIngredientForm();

    if (validationError) {
      setFormMessage(validationError);
      return;
    }

    setIsUpdatingIngredient(true);
    setFormMessage("Updating ingredient...");

    try {
      const trimmedName = name.trim();
      const nameKey = normalizeKey(trimmedName);

      setFormMessage("Checking duplicate ingredient...");

      const duplicateIngredient = await findIngredientDuplicateByNameKey(
        nameKey,
        selectedIngredient.id
      );

      if (duplicateIngredient) {
        const duplicateData = duplicateIngredient.data();
        const duplicateStatus =
          duplicateData.isActive === false ? "inactive" : "active";

        setFormMessage(
          `${trimmedName} already exists as an ${duplicateStatus} ingredient. Use the existing ingredient instead of creating a duplicate.`
        );
        return;
      }

      const conversion = Number(usagePerPurchaseUnit);
      const cost = Number(purchaseCost);
      const threshold = Number(minThreshold);
      const costPerUsageUnit = calculateCostPerUsageUnit(cost, conversion);

      const ingredientRef = doc(db, "ingredients", selectedIngredient.id);

      await updateDoc(ingredientRef, {
        name: trimmedName,
        nameKey,
        purchaseUnit,
        usageUnit,
        usagePerPurchaseUnit: conversion,
        purchaseCost: cost,
        minThreshold: threshold,
        costPerUsageUnit,
        updatedAt: serverTimestamp(),
      });

      await writeActivityLog({
        actor: userProfile,
        actionType: "inventory.ingredient.updated",
        targetId: selectedIngredient.id,
        targetName: trimmedName,
        description: `${userProfile.name || "A user"} updated ingredient ${
          selectedIngredient.name
        }.`,
        metadata: {
          previousIngredientName: selectedIngredient.name,
          newIngredientName: trimmedName,
          purchaseUnit,
          usageUnit,
          usagePerPurchaseUnit: conversion,
          purchaseCost: cost,
          costPerUsageUnit,
          minThreshold: threshold,
          currentStock: selectedIngredient.currentStock,
          actionSource: "Ingredients tab",
        },
      });

      await writeActivityLog({
        actor: userProfile,
        actionType: "inventory.ingredient.updated",
        targetId: selectedIngredient.id,
        targetName: name.trim(),
        description: `${userProfile.name || "A user"} updated ingredient ${
          selectedIngredient.name
        }.`,
        metadata: {
          previousIngredientName: selectedIngredient.name,
          newIngredientName: name.trim(),
          purchaseUnit,
          usageUnit,
          usagePerPurchaseUnit: conversion,
          purchaseCost: cost,
          costPerUsageUnit,
          minThreshold: threshold,
          currentStock: selectedIngredient.currentStock,
          actionSource: "Ingredients tab",
        },
      });

      showTemporaryMessage("Ingredient updated successfully.");
      setIsEditOpen(false);
      closeIngredientModal();

      await loadIngredients();
    } catch (error) {
      console.error(error);
      setFormMessage("Failed to update ingredient. Please try again.");
    } finally {
      setIsUpdatingIngredient(false);
    }
  }



  function validateIngredientForm() {
    const trimmedName = name.trim();
    const conversion = Number(usagePerPurchaseUnit);
    const cost = Number(purchaseCost);
    const stockQuantity = Number(currentStockQuantity);
    const threshold = Number(minThreshold);

    if (!trimmedName) {
      return "Ingredient name is required.";
    }

    if (conversion <= 0) {
      return `Enter how many ${usageUnit}s are in 1 ${purchaseUnit}.`;
    }

    if (cost <= 0) {
      return "Purchase cost must be greater than 0.";
    }

    if (stockQuantity < 0) {
      return "Current stock cannot be negative.";
    }

    if (threshold < 0) {
      return "Low-stock threshold cannot be negative.";
    }

    return "";
  }

  async function handleAddIngredient(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();

      if (isStaffMode) {
        setFormMessage("Staff operators cannot add new ingredients.");
        return;
      }

      const validationError = validateIngredientForm();

      if (validationError) {
        setFormMessage(validationError);
        return;
      }

      const trimmedName = name.trim();
      const nameKey = normalizeKey(trimmedName);

      setIsSaving(true);
      setFormMessage("Checking ingredient...");

      try {
        const allIngredientsSnapshot = await getDocs(collection(db, "ingredients"));

        const matchingIngredients = allIngredientsSnapshot.docs.filter((ingredientDoc) => {
          const ingredientData = ingredientDoc.data();

          const existingNameKey =
            ingredientData.nameKey || normalizeKey(ingredientData.name || "");

          return existingNameKey === nameKey;
        });

        const activeDuplicate = matchingIngredients.find((ingredientDoc) => {
          const ingredientData = ingredientDoc.data();
          return ingredientData.isActive !== false;
        });

        const inactiveDuplicate = matchingIngredients.find((ingredientDoc) => {
          const ingredientData = ingredientDoc.data();
          return ingredientData.isActive === false;
        });

        if (activeDuplicate) {
          setFormMessage(`${trimmedName} already exists in your active ingredients.`);
          return;
        }

        if (inactiveDuplicate) {
          setFormMessage(
            `${trimmedName} already exists but is inactive. Go to Inactive ingredients and restore it instead.`
          );
          return;
        }

        setFormMessage("Saving ingredient...");

        const conversion = Number(usagePerPurchaseUnit);
        const cost = Number(purchaseCost);
        const stockQuantity = Number(currentStockQuantity);
        const threshold = Number(minThreshold);

        const currentStock = calculateStockFromPurchaseQuantity(
          stockQuantity,
          conversion
        );

        const costPerUsageUnit = calculateCostPerUsageUnit(cost, conversion);

        const ingredientDocRef = await addDoc(collection(db, "ingredients"), {
          name: trimmedName,
          nameKey,
          purchaseUnit,
          usageUnit,
          usagePerPurchaseUnit: conversion,
          purchaseCost: cost,
          currentStock,
          minThreshold: threshold,
          costPerUsageUnit,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await writeActivityLog({
          actor: userProfile,
          actionType: "inventory.ingredient.added",
          targetId: ingredientDocRef.id,
          targetName: trimmedName,
          description: `${userProfile.name || "A user"} added ingredient ${trimmedName}.`,
          metadata: {
            ingredientName: trimmedName,
            ingredientStatus: "Active",
            purchaseUnit,
            usageUnit,
            usagePerPurchaseUnit: conversion,
            purchaseCost: cost,
            costPerUsageUnit,
            currentStock,
            minThreshold: threshold,
            actionSource: "Ingredients tab",
          },
        });

        resetForm();
        setIsFormOpen(false);
        showTemporaryMessage("Ingredient saved successfully.");
        await loadIngredients();
      } catch (error) {
        console.error(error);
        setFormMessage("Failed to save ingredient. Please try again.");
      } finally {
        setIsSaving(false);
      }
    }

  if (isFormOpen && !isStaffMode) {
    return (
      <section className="ingredients-panel">
        <div className="inventory-panel-heading inventory-panel-heading--compact">
          <div>
            <p className="inventory-eyebrow">NEW INGREDIENT</p>
            <h3 className="inventory-section-title">Add Ingredient</h3>
            <p className="inventory-section-subtext">
              Add the basic stock details for one ingredient.
            </p>
          </div>

          <button
            type="button"
            className="secondary-inventory-button"
            onClick={handleBackToList}
          >
            ← Back
          </button>
        </div>

        <form className="ingredient-form" onSubmit={handleAddIngredient}>
          <div className="form-group">
            <label>Ingredient name</label>
            <input
              type="text"
              placeholder="Example: Vanilla Syrup"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Purchase unit</label>
              <select
                value={purchaseUnit}
                onChange={(event) => setPurchaseUnit(event.target.value as PurchaseUnit)}
              >
                {purchaseUnits.map((unit) => (
                  <option value={unit} key={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Usage unit</label>
              <select
                value={usageUnit}
                onChange={(event) => setUsageUnit(event.target.value as UsageUnit)}
              >
                {usageUnits.map((unit) => (
                  <option value={unit} key={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>
              How many {usageUnit}s per 1 {purchaseUnit}?
            </label>
            <input
              type="number"
              min="0"
              placeholder={`Example: 100 ${usageUnit}s per ${purchaseUnit}`}
              value={usagePerPurchaseUnit}
              onChange={(event) => setUsagePerPurchaseUnit(event.target.value)}
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Purchase cost</label>
              <input
                type="number"
                min="0"
                placeholder="Example: 180"
                value={purchaseCost}
                onChange={(event) => setPurchaseCost(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Current stock quantity in {purchaseUnit}s</label>
              <input
                type="number"
                min="0"
                placeholder={`Example: 2 ${purchaseUnit}s`}
                value={currentStockQuantity}
                onChange={(event) => setCurrentStockQuantity(event.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Low-stock threshold in {usageUnit}s</label>
            <input
              type="number"
              min="0"
              placeholder={`Example: 20 ${usageUnit}s`}
              value={minThreshold}
              onChange={(event) => setMinThreshold(event.target.value)}
            />
          </div>

          <div className="ingredient-preview-card">
            <h4>Stock preview</h4>

            <p>
              <strong>{name || "Ingredient"}</strong>
            </p>

            <p>
              1 {purchaseUnit} ={" "}
              <strong>
                {usagePerPurchaseUnit || 0} {usageUnit}s
              </strong>
            </p>

            <p>
              Current stock:{" "}
              <strong>
                {preview.wholePurchaseUnits} {purchaseUnit}
                {preview.wholePurchaseUnits === 1 ? "" : "s"}
                {preview.remainingUsageUnits > 0
                  ? ` & ${preview.remainingUsageUnits} ${usageUnit}s`
                  : ""}
              </strong>
            </p>

            <p>
              Stored internally as:{" "}
              <strong>
                {preview.totalUsageStock} {usageUnit}s
              </strong>
            </p>

            <p>
              Cost per {usageUnit}:{" "}
              <strong>₱{preview.costPerUsageUnit.toFixed(2)}</strong>
            </p>
          </div>

          <button
            className="primary-inventory-button"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Ingredient"}
          </button>

          {formMessage && <p className="inventory-form-message">{formMessage}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="ingredients-panel">
      <div className="inventory-panel-heading">
        <div>
          <h3>Ingredients</h3>
            <p>
              {isStaffMode
                ? "View ingredient stock and record restocks for daily operations."
                : "Search, view, and manage raw materials used in recipes."}
          </p>
        </div>
      </div>

            {!isStaffMode && (
        <div className="ingredient-status-filter">
          <button
            type="button"
            className={ingredientStatusFilter === "active" ? "active" : ""}
            onClick={() => {
              setIngredientStatusFilter("active");
              setSelectedIngredient(null);
              setFormMessage("");
            }}
          >
            Active
          </button>

          <button
            type="button"
            className={ingredientStatusFilter === "inactive" ? "active" : ""}
            onClick={() => {
              setIngredientStatusFilter("inactive");
              setSelectedIngredient(null);
              setFormMessage("");
            }}
          >
            Inactive
          </button>
        </div>
      )}

      <div className="inventory-list-toolbar">
        <div className="inventory-search-wrap">
          <input
            type="search"
            placeholder="Search ingredients..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        {!isStaffMode && (
          <button
            className="primary-inventory-button compact"
            type="button"
            onClick={() => {
              resetForm();
              setIsFormOpen(true);
            }}
          >
            + Add Ingredient
          </button>
        )}
      </div>

      {formMessage && <p className="inventory-form-message">{formMessage}</p>}

      <div className="ingredients-list-section">
        <div className="ingredients-list-header">
          <h4>Ingredient List</h4>

          <button type="button" onClick={loadIngredients}>
            Refresh
          </button>
        </div>

        {isLoadingIngredients && (
          <p className="ingredients-empty-text">Loading ingredients...</p>
        )}

        {!isLoadingIngredients && ingredients.length === 0 && (
          <p className="ingredients-empty-text">
            No {ingredientStatusFilter} ingredients found.
          </p>
        )}

        {!isLoadingIngredients &&
          ingredients.length > 0 &&
          filteredIngredients.length === 0 && (
            <p className="ingredients-empty-text">No ingredients match your search.</p>
          )}

        {!isLoadingIngredients && filteredIngredients.length > 0 && (
          <div className="ingredients-list">
            {filteredIngredients.map((ingredient) => (
              <article
                className="ingredient-card ingredient-card--compact"
                key={ingredient.id}
                onClick={() => setSelectedIngredient(ingredient)}
              >
                <div className="ingredient-card-main">
                  <div>
                    <h5>{ingredient.name}</h5>
                    <p className="ingredient-card-stock-line">
                      {formatIngredientStock(ingredient)}
                    </p>
                  </div>

                  <span
                    className={`ingredient-status ${
                      ingredient.currentStock <= ingredient.minThreshold ? "low" : "ok"
                    }`}
                  >
                    {ingredient.currentStock <= ingredient.minThreshold ? "Low" : "OK"}
                  </span>
                </div>

                <div className="ingredient-card-footer">
                  <span>
                    {isStaffMode ? (
                      <>
                        Low alert: <strong>{ingredient.minThreshold} {ingredient.usageUnit}s</strong>
                      </>
                    ) : (
                      <>
                        Cost per {ingredient.usageUnit}:{" "}
                        <strong>₱{ingredient.costPerUsageUnit.toFixed(2)}</strong>
                      </>
                    )}
                  </span>

                  <span className="ingredient-card-tap-hint">Tap to view</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selectedIngredient && (
            <div className="ingredient-modal-overlay" onClick={closeIngredientModal}>
              <section
                className="ingredient-modal"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="ingredient-modal-header">
                  <div>
                    <p className="inventory-eyebrow">Ingredient Details</p>
                    <h3>{selectedIngredient.name}</h3>
                  </div>

                  <button
                    className="ingredient-modal-close"
                    type="button"
                    onClick={closeIngredientModal}
                  >
                    ×
                  </button>
                </div>

                <div className="ingredient-modal-stock">
                  <p>Current Stock</p>
                  <strong>{formatIngredientStock(selectedIngredient)}</strong>
                </div>

                <div className="ingredient-modal-details">
                  <div>
                    <span>Conversion</span>
                    <strong>
                      1 {selectedIngredient.purchaseUnit} ={" "}
                      {selectedIngredient.usagePerPurchaseUnit} {selectedIngredient.usageUnit}s
                    </strong>
                  </div>

                   {!isStaffMode && (
                    <>
                      <div>
                        <span>Purchase Cost</span>
                        <strong>
                          ₱{selectedIngredient.purchaseCost.toFixed(2)} /{" "}
                          {selectedIngredient.purchaseUnit}
                        </strong>
                      </div>

                      <div>
                        <span>Usage Cost</span>
                        <strong>
                          ₱{selectedIngredient.costPerUsageUnit.toFixed(2)} /{" "}
                          {selectedIngredient.usageUnit}
                        </strong>
                      </div>
                    </>
                  )}

                  <div>
                    <span>Low Stock Alert</span>
                    <strong>
                      Below {selectedIngredient.minThreshold} {selectedIngredient.usageUnit}s
                    </strong>
                  </div>

                  <div>
                    <span>Status</span>
                    <strong>
                      {!selectedIngredient.isActive
                        ? "Inactive"
                        : selectedIngredient.currentStock <= selectedIngredient.minThreshold
                          ? "Low Stock"
                          : "OK"}
                    </strong>
                  </div>

                  <div>
                    <span>Stored Internally</span>
                    <strong>
                      {selectedIngredient.currentStock} {selectedIngredient.usageUnit}s
                    </strong>
                  </div>
                </div>

                                {!isRestockOpen && !isEditOpen && selectedIngredient.isActive && (
                  <div className="ingredient-modal-actions">
                    <button
                      type="button"
                      className="primary-inventory-button"
                      onClick={openRestockForm}
                    >
                      Restock
                    </button>

                    {!isStaffMode && (
                      <>
                        <button
                          type="button"
                          className="secondary-inventory-button"
                          onClick={openEditForm}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="danger-inventory-button"
                          onClick={() => setIsDeactivateConfirmOpen(true)}
                        >
                          Deactivate
                        </button>
                      </>
                    )}
                  </div>
                )}

                {!isStaffMode && !isRestockOpen && !selectedIngredient.isActive && (
                  <div className="ingredient-modal-actions ingredient-modal-actions--restore">
                    <button
                      type="button"
                      className="primary-inventory-button"
                      onClick={handleRestoreIngredient}
                    >
                      Restore Ingredient
                    </button>
                  </div>
                )}

                {formMessage && <p className="inventory-form-message">{formMessage}</p>}
        
              </section>
            </div>
          )}

          {!isStaffMode && isEditOpen && selectedIngredient && (
            <div
              className="edit-modal-overlay"
              onClick={() => {
                if (!isUpdatingIngredient) {
                  setIsEditOpen(false);
                  resetForm();
                }
              }}
            >
              <form
                className="edit-modal"
                onSubmit={handleUpdateIngredient}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="edit-modal-header">
                  <div>
                    <p className="inventory-eyebrow">Edit Ingredient</p>
                    <h3>{selectedIngredient.name}</h3>
                    <p>Update ingredient details. Current stock will not change here.</p>
                  </div>

                  <button
                    className="ingredient-modal-close"
                    type="button"
                    onClick={() => {
                      if (!isUpdatingIngredient) {
                        setIsEditOpen(false);
                        resetForm();
                      }
                    }}
                  >
                    ×
                  </button>
                </div>

                <div className="form-group">
                  <label>Ingredient name</label>
                  <input
                    type="text"
                    placeholder="Example: Vanilla Syrup"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Purchase unit</label>
                    <select
                      value={purchaseUnit}
                      onChange={(event) => setPurchaseUnit(event.target.value as PurchaseUnit)}
                    >
                      {purchaseUnits.map((unit) => (
                        <option value={unit} key={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Usage unit</label>
                    <select
                      value={usageUnit}
                      onChange={(event) => setUsageUnit(event.target.value as UsageUnit)}
                    >
                      {usageUnits.map((unit) => (
                        <option value={unit} key={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    How many {usageUnit}s per 1 {purchaseUnit}?
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder={`Example: 100 ${usageUnit}s per ${purchaseUnit}`}
                    value={usagePerPurchaseUnit}
                    onChange={(event) => setUsagePerPurchaseUnit(event.target.value)}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Purchase cost</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Example: 180"
                      value={purchaseCost}
                      onChange={(event) => setPurchaseCost(event.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Low-stock threshold in {usageUnit}s</label>
                    <input
                      type="number"
                      min="0"
                      placeholder={`Example: 20 ${usageUnit}s`}
                      value={minThreshold}
                      onChange={(event) => setMinThreshold(event.target.value)}
                    />
                  </div>
                </div>

                {formMessage && <p className="inventory-form-message">{formMessage}</p>}

                <div className="edit-modal-actions">
                  <button
                    type="submit"
                    className="primary-inventory-button"
                    disabled={isUpdatingIngredient}
                  >
                    {isUpdatingIngredient ? "Updating..." : "Save Changes"}
                  </button>

                  <button
                    type="button"
                    className="secondary-inventory-button"
                    disabled={isUpdatingIngredient}
                    onClick={() => {
                      setIsEditOpen(false);
                      resetForm();
                      setFormMessage("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {isRestockOpen && selectedIngredient && (
            <div
              className="restock-modal-overlay"
              onClick={() => {
                if (!isRestocking) {
                  setIsRestockOpen(false);
                  setRestockQuantity("");
                  setFormMessage("");
                }
              }}
            >
              <section
                className="restock-modal"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="restock-modal-header">
                  <div>
                    <p className="inventory-eyebrow">Restock Ingredient</p>
                    <h3>{selectedIngredient.name}</h3>
                    <p>
                      Enter how many {selectedIngredient.purchaseUnit}s were added to inventory.
                    </p>
                  </div>

                  <button
                    className="ingredient-modal-close"
                    type="button"
                    onClick={() => {
                      if (!isRestocking) {
                        setIsRestockOpen(false);
                        setRestockQuantity("");
                        setFormMessage("");
                      }
                    }}
                  >
                    ×
                  </button>
                </div>

                <div className="ingredient-modal-stock">
                  <p>Current Stock</p>
                  <strong>{formatIngredientStock(selectedIngredient)}</strong>
                </div>

                <div className="form-group">
                  <label>Restock quantity in {selectedIngredient.purchaseUnit}s</label>
                  <input
                    type="number"
                    min="0"
                    placeholder={`Example: 1 ${selectedIngredient.purchaseUnit}`}
                    value={restockQuantity}
                    onChange={(event) => setRestockQuantity(event.target.value)}
                  />
                </div>

                <p className="ingredient-restock-preview">
                  This will add{" "}
                  <strong>
                    {Number(restockQuantity || 0) * selectedIngredient.usagePerPurchaseUnit}{" "}
                    {selectedIngredient.usageUnit}s
                  </strong>{" "}
                  to current stock.
                </p>

                {formMessage && <p className="inventory-form-message">{formMessage}</p>}

                <div className="restock-modal-actions">
                  <button
                    type="button"
                    className="primary-inventory-button"
                    onClick={handleRestockIngredient}
                    disabled={isRestocking}
                  >
                    {isRestocking ? "Updating..." : "Save Restock"}
                  </button>

                  <button
                    type="button"
                    className="secondary-inventory-button"
                    disabled={isRestocking}
                    onClick={() => {
                      setIsRestockOpen(false);
                      setRestockQuantity("");
                      setFormMessage("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            </div>
          )}

          {!isStaffMode && isDeactivateConfirmOpen && selectedIngredient && (
            <div
              className="confirm-modal-overlay"
              onClick={() => {
                if (!isDeactivating) {
                  setIsDeactivateConfirmOpen(false);
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
                  <h3>Deactivate {selectedIngredient.name}?</h3>
                  <p>
                    This will hide the ingredient from active lists, but keep its record safe
                    for recipes and transaction history.
                  </p>
                </div>

                <div className="confirm-modal-actions">
                  <button
                    type="button"
                    className="danger-inventory-button"
                    onClick={handleDeactivateIngredient}
                    disabled={isDeactivating}
                  >
                    {isDeactivating ? "Deactivating..." : "Yes, Deactivate"}
                  </button>

                  <button
                    type="button"
                    className="secondary-inventory-button"
                    onClick={() => setIsDeactivateConfirmOpen(false)}
                    disabled={isDeactivating}
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

export default IngredientsPanel;