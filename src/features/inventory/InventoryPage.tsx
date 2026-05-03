import { useState } from "react";
import "./InventoryPage.css";
import IngredientsPanel from "./IngredientsPanel";
import LowStockPanel from "./LowStockPanel";
import ProductsPanel from "./ProductsPanel";
import RecipesPanel from "./RecipesPanel";

type InventoryTab = "ingredients" | "products" | "recipes" | "low-stock";

function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>("ingredients");

  return (
    <section className="inventory-page">
      <div className="inventory-page-header">
        <p className="inventory-kicker">Inventory & Recipes</p>
        <h2>Manage store items</h2>
        <p>
          Add ingredients first, then create products and recipe mappings for POS deduction.
        </p>
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
    </section>
  );
}

export default InventoryPage;