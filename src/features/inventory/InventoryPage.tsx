import { useState } from "react";
import "./InventoryPage.css";
import IngredientsPanel from "./IngredientsPanel";
import InventoryHealthSummary from "./InventoryHealthSummary";
import LowStockPanel from "./LowStockPanel";
import ProductsPanel from "./ProductsPanel";
import RecipesPanel from "./RecipesPanel";

type InventoryTab = "ingredients" | "products" | "recipes" | "low-stock";

type InventoryPageProps = {
  userRole?: "developer" | "owner" | "staff";
};

function InventoryPage({ userRole = "owner" }: InventoryPageProps) {
  const [activeTab, setActiveTab] = useState<InventoryTab>("ingredients");
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  const isStaffMode = userRole === "staff";

  function openInventoryTab(tab: InventoryTab) {
    if (isStaffMode && (tab === "products" || tab === "recipes")) {
      setActiveTab("ingredients");
      return;
    }

    setActiveTab(tab);
  }

  return (
    <section className="inventory-page">
      <div className="inventory-page-header">
        <p className="inventory-kicker">Inventory & Recipes</p>
        <h2>Manage store items</h2>
        <p>
          {isStaffMode
            ? "View ingredients, track low stock, and record restocks for daily operations."
            : "Add ingredients first, then create products and recipe mappings for POS deduction."}
        </p>
      </div>

      {!isStaffMode && (
        <div className="inventory-health-desktop">
          <InventoryHealthSummary />
        </div>
      )}

      {!isStaffMode && (
        <div className="inventory-mobile-actions">
          <button
            type="button"
            className="primary-inventory-button inventory-health-mobile-trigger"
            onClick={() => setIsHealthModalOpen(true)}
          >
            View Inventory Health
          </button>
        </div>
      )}

      <div className="inventory-tabs">
        <button
          className={`inventory-tab-button ${activeTab === "ingredients" ? "active" : ""}`}
          type="button"
          onClick={() => openInventoryTab("ingredients")}
        >
          Ingredients
        </button>

        {!isStaffMode && (
          <button
            className={`inventory-tab-button ${activeTab === "products" ? "active" : ""}`}
            type="button"
            onClick={() => openInventoryTab("products")}
          >
            Products
          </button>
        )}

        {!isStaffMode && (
          <button
            className={`inventory-tab-button ${activeTab === "recipes" ? "active" : ""}`}
            type="button"
            onClick={() => openInventoryTab("recipes")}
          >
            Recipes
          </button>
        )}

        <button
          className={`inventory-tab-button ${activeTab === "low-stock" ? "active" : ""}`}
          type="button"
          onClick={() => openInventoryTab("low-stock")}
        >
          Low Stock
        </button>
      </div>

      <div className="inventory-panel">
        {activeTab === "ingredients" && <IngredientsPanel isStaffMode={isStaffMode} />}
        {activeTab === "products" && !isStaffMode && <ProductsPanel />}
        {activeTab === "recipes" && !isStaffMode && <RecipesPanel />}
        {activeTab === "low-stock" && <LowStockPanel />}
      </div>

      {!isStaffMode && isHealthModalOpen && (
        <div
          className="inventory-health-modal-overlay"
          onClick={() => setIsHealthModalOpen(false)}
        >
          <div
            className="inventory-health-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-health-modal-header">
              <div>
                <p className="inventory-eyebrow">Inventory Health</p>
                <h3>Store readiness overview</h3>
                <p>
                  Review products ready for POS, missing recipes, and ingredient stock alerts.
                </p>
              </div>

              <button
                className="inventory-health-modal-close"
                type="button"
                onClick={() => setIsHealthModalOpen(false)}
                aria-label="Close inventory health summary"
              >
                ×
              </button>
            </div>

            <InventoryHealthSummary />

            <div className="inventory-health-modal-footer">
              <button
                type="button"
                className="secondary-inventory-button"
                onClick={() => setIsHealthModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default InventoryPage;