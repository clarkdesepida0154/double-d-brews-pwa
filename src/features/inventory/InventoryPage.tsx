import { useState } from "react";
import "./InventoryPage.css";
import IngredientsPanel from "./IngredientsPanel";
import InventoryHealthSummary from "./InventoryHealthSummary";
import LowStockPanel from "./LowStockPanel";
import ProductsPanel from "./ProductsPanel";
import RecipesPanel from "./RecipesPanel";

type InventoryTab = "ingredients" | "products" | "recipes" | "low-stock";

function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>("ingredients");
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  return (
    <section className="inventory-page">
      <div className="inventory-page-header">
        <p className="inventory-kicker">Inventory & Recipes</p>
        <h2>Manage store items</h2>
        <p>
          Add ingredients first, then create products and recipe mappings for POS deduction.
        </p>
      </div>

      <div className="inventory-health-desktop">
        <InventoryHealthSummary />
      </div>

      <div className="inventory-mobile-actions">
        <button
          type="button"
          className="primary-inventory-button inventory-health-mobile-trigger"
          onClick={() => setIsHealthModalOpen(true)}
        >
          View Inventory Health
        </button>
      </div>

      <div className="inventory-tabs">
        <button
          className={`inventory-tab-button ${activeTab === "ingredients" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("ingredients")}
        >
          Ingredients
        </button>

        <button
          className={`inventory-tab-button ${activeTab === "products" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("products")}
        >
          Products
        </button>

        <button
          className={`inventory-tab-button ${activeTab === "recipes" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("recipes")}
        >
          Recipes
        </button>

        <button
          className={`inventory-tab-button ${activeTab === "low-stock" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("low-stock")}
        >
          Low Stock
        </button>
      </div>

      <div className="inventory-panel">
        {activeTab === "ingredients" && <IngredientsPanel />}
        {activeTab === "products" && <ProductsPanel />}
        {activeTab === "recipes" && <RecipesPanel />}
        {activeTab === "low-stock" && <LowStockPanel />}
      </div>

      {isHealthModalOpen && (
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