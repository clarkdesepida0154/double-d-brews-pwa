import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config.ts";

type AuditSeverity = "critical" | "warning" | "info";

type AuditCategory =
  | "Ingredients"
  | "Products"
  | "Sizes"
  | "Recipes"
  | "Single Item Setup";

type AuditIssue = {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  description: string;
  recommendation: string;
  relatedIds?: string[];
};

type FirestoreRecord = {
  id: string;
  [key: string]: unknown;
};

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getStatusText(isActive: unknown) {
  return isActive === false ? "Inactive" : "Active";
}

function getSeverityLabel(severity: AuditSeverity) {
  if (severity === "critical") {
    return "Needs Attention";
  }

  if (severity === "warning") {
    return "Check Soon";
  }

  return "Good to Review";
}

function getSeverityExplanation(severity: AuditSeverity) {
  if (severity === "critical") {
    return "This can affect sales, stock deduction, or POS accuracy.";
  }

  if (severity === "warning") {
    return "This may cause confusion later if it is not checked.";
  }

  return "This is not urgent, but cleaning it up will keep the system organized.";
}

function getCategoryFriendlyName(category: AuditCategory) {
  if (category === "Single Item Setup") {
    return "No-Size Products";
  }

  if (category === "Sizes") {
    return "Product Prices / Sizes";
  }

  return category;
}

function InventoryAuditPanel() {
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [severityFilter, setSeverityFilter] = useState<AuditSeverity | "all">(
    "all"
  );
  const [categoryFilter, setCategoryFilter] = useState<AuditCategory | "all">(
    "all"
  );

  const runAudit = useCallback(async () => {
    setIsLoading(true);
    setMessage("Scanning inventory data...");

    try {
      const [
        ingredientsSnapshot,
        productsSnapshot,
        sizesSnapshot,
        recipesSnapshot,
      ] = await Promise.all([
        getDocs(collection(db, "ingredients")),
        getDocs(collection(db, "products")),
        getDocs(collection(db, "productSizes")),
        getDocs(collection(db, "recipes")),
      ]);

      const ingredients: FirestoreRecord[] = ingredientsSnapshot.docs.map(
        (docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      );

      const products: FirestoreRecord[] = productsSnapshot.docs.map(
        (docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      );

      const productSizes: FirestoreRecord[] = sizesSnapshot.docs.map(
        (docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      );

      const recipes: FirestoreRecord[] = recipesSnapshot.docs.map(
        (docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      );

      const auditIssues: AuditIssue[] = [];

      function addIssue(issue: Omit<AuditIssue, "id">) {
        auditIssues.push({
          ...issue,
          id: `${issue.category}-${issue.title}-${auditIssues.length}`,
        });
      }

      const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
      const productIds = new Set(products.map((product) => product.id));
      const sizeIds = new Set(productSizes.map((size) => size.id));
      const completeRecipeSizeIds = new Set(
        recipes
          .filter((recipe) => {
            return (
              recipe.isComplete === true &&
              Array.isArray(recipe.ingredients) &&
              recipe.ingredients.length > 0
            );
          })
          .map((recipe) => recipe.id)
      );

      const productsById = new Map(
        products.map((product) => [product.id, product])
      );

      const sizesByProductId = productSizes.reduce<Record<string, FirestoreRecord[]>>(
        (groups, size) => {
          const productId = String(size.productId || "");

          if (!groups[productId]) {
            groups[productId] = [];
          }

          groups[productId].push(size);

          return groups;
        },
        {}
      );

      const ingredientGroups = ingredients.reduce<Record<string, FirestoreRecord[]>>(
        (groups, ingredient) => {
          const key = normalizeKey(ingredient.nameKey || ingredient.name);

          if (!key) {
            return groups;
          }

          if (!groups[key]) {
            groups[key] = [];
          }

          groups[key].push(ingredient);

          return groups;
        },
        {}
      );

      Object.entries(ingredientGroups).forEach(([key, matchingIngredients]) => {
        if (matchingIngredients.length <= 1) {
          return;
        }

        const activeMatches = matchingIngredients.filter(
          (ingredient) => ingredient.isActive !== false
        );

        addIssue({
          severity: activeMatches.length > 1 ? "critical" : "warning",
          category: "Ingredients",
          title: `Possible duplicate ingredient: ${key}`,
          description: matchingIngredients
            .map(
              (ingredient) =>
                `${String(ingredient.name || "Unnamed ingredient")} (${getStatusText(
                  ingredient.isActive
                )})`
            )
            .join(", "),
          recommendation:
            activeMatches.length > 1
              ? "Keep the correct ingredient active. Archive or rename the duplicate so staff do not accidentally use the wrong one."
              : "This looks like an old archived duplicate. Review it first. Do not delete it because old recipes or stock history may still need it.",
          relatedIds: matchingIngredients.map((ingredient) => ingredient.id),
        });
      });

      ingredients.forEach((ingredient) => {
        if (!ingredient.nameKey && ingredient.name) {
          addIssue({
            severity: "info",
            category: "Ingredients",
            title: `Ingredient needs cleanup: ${String(ingredient.name)}`,
            description:
            "This ingredient is missing a hidden search key used to prevent duplicates.",
            recommendation:
            "Open this ingredient, make a small edit if needed, then save it. This helps the system prevent duplicate names in the future.",
            relatedIds: [ingredient.id],
          });
        }
      });

      const productGroups = products.reduce<Record<string, FirestoreRecord[]>>(
        (groups, product) => {
          const key = normalizeKey(product.nameKey || product.name);

          if (!key) {
            return groups;
          }

          if (!groups[key]) {
            groups[key] = [];
          }

          groups[key].push(product);

          return groups;
        },
        {}
      );

      Object.entries(productGroups).forEach(([key, matchingProducts]) => {
        if (matchingProducts.length <= 1) {
          return;
        }

        const activeMatches = matchingProducts.filter(
          (product) => product.isActive !== false
        );

        addIssue({
          severity: activeMatches.length > 1 ? "critical" : "warning",
          category: "Products",
          title: `Possible duplicate product: ${key}`,
          description: matchingProducts
            .map(
              (product) =>
                `${String(product.name || "Unnamed product")} (${getStatusText(
                  product.isActive
                )})`
            )
            .join(", "),
          recommendation:
            activeMatches.length > 1
              ? "Keep the correct product active. Archive or rename the duplicate so cashiers do not sell the wrong item."
              : "This looks like an old archived duplicate. Review it first. Do not delete products that may have recipes or sales history.",
          relatedIds: matchingProducts.map((product) => product.id),
        });
      });

      products.forEach((product) => {
        if (!product.nameKey && product.name) {
          addIssue({
            severity: "info",
            category: "Products",
            title: `Product needs cleanup: ${String(product.name)}`,
            description: "This product is missing a hidden search key used to prevent duplicates.",
            recommendation:
            "Open this product, make a small edit if needed, then save it. This helps the system prevent duplicate product names in the future.",
            relatedIds: [product.id],
          });
        }

        if (product.isActive === false) {
          return;
        }

        const productSizesForProduct = sizesByProductId[product.id] || [];
        const activeSizes = productSizesForProduct.filter(
          (size) => size.isActive !== false
        );

        if (activeSizes.length === 0) {
          addIssue({
            severity: "warning",
            category: "Products",
            title: `Product is not ready to sell: ${String(product.name)}`,
            description:
            "This product is active, but it has no price option connected to it.",
            recommendation:
            "Open the product. For drinks, add a size and price. For snacks, rice meals, or no-size items, create it as a Single Item product.",
            relatedIds: [product.id],
          });
        }

        if (product.sellingType === "single") {
          const defaultSingleSize = productSizesForProduct.find((size) => {
            return (
              size.isActive !== false &&
              size.isDefaultSize === true &&
              normalizeKey(size.sizeName) === "regular"
            );
          });

          if (!defaultSingleSize) {
            addIssue({
              severity: "critical",
              category: "Single Item Setup",
              title: `No-size product setup is incomplete: ${String(product.name)}`,
              description:
                "This product is marked as a no-size item, but its hidden price setup is missing.",
              recommendation:
                "Do not sell this item yet. Recreate it as Single Item, or ask the developer to repair the hidden setup safely.",
              relatedIds: [product.id],
            });
          }
        }
      });

      productSizes.forEach((size) => {
        if (!size.sizeKey && size.sizeName) {
          addIssue({
            severity: "info",
            category: "Sizes",
            title: `Price option needs cleanup: ${String(size.productName || "Product")} - ${String(
            size.sizeName
            )}`,
            description: "This price option is missing a hidden search key used to prevent duplicate sizes.",
            recommendation:
            "Open this product price/size, make a small edit if needed, then save it. This helps prevent duplicate size names.",
            relatedIds: [size.id],
          });
        }

        const productId = String(size.productId || "");

        if (productId && !productIds.has(productId)) {
          addIssue({
            severity: "critical",
            category: "Sizes",
            title: `Price option is connected to a missing product: ${String(size.sizeName)}`,
            description:
            "This price option belongs to a product that can no longer be found.",
            recommendation:
            "Do not delete this manually yet. This may be old test data or a product that needs repair.",
            relatedIds: [size.id, productId],
          });
        }

        if (size.isActive !== false && !completeRecipeSizeIds.has(size.id)) {
          addIssue({
            severity: "warning",
            category: "Recipes",
            title: `Product price is missing a recipe: ${String(
            size.productName || "Product"
            )} - ${String(size.sizeName || "Price")}`,
            description:
            "This product has a price option, but the recipe is not complete yet.",
            recommendation:
            "Open the product and finish the recipe setup. It will not appear correctly in POS until the recipe is complete.",
            relatedIds: [size.id],
          });
        }
      });

      Object.entries(sizesByProductId).forEach(([productId, sizes]) => {
        const product = productsById.get(productId);
        const sizeGroups = sizes.reduce<Record<string, FirestoreRecord[]>>(
          (groups, size) => {
            const key = normalizeKey(size.sizeKey || size.sizeName);

            if (!key) {
              return groups;
            }

            if (!groups[key]) {
              groups[key] = [];
            }

            groups[key].push(size);

            return groups;
          },
          {}
        );

        Object.entries(sizeGroups).forEach(([sizeKey, matchingSizes]) => {
          if (matchingSizes.length <= 1) {
            return;
          }

          const activeMatches = matchingSizes.filter(
            (size) => size.isActive !== false
          );

          addIssue({
            severity: activeMatches.length > 1 ? "critical" : "warning",
            category: "Sizes",
            title: `Possible duplicate price/size "${sizeKey}" for ${String(
                product?.name || "Unknown product"
            )}`,
            description: matchingSizes
              .map(
                (size) =>
                  `${String(size.sizeName || "Unnamed size")} (${getStatusText(
                    size.isActive
                  )})`
              )
              .join(", "),
            recommendation:
              activeMatches.length > 1
                ? "Keep only one active price/size with this name. Archive or rename the duplicate."
                : "Review archived duplicate sizes before restoring anything.",
            relatedIds: matchingSizes.map((size) => size.id),
          });
        });
      });

      recipes.forEach((recipe) => {
        const productId = String(recipe.productId || "");
        const sizeId = String(recipe.sizeId || recipe.id || "");

        if (productId && !productIds.has(productId)) {
          addIssue({
            severity: "critical",
            category: "Recipes",
            title: `Recipe is connected to a missing product: ${String(
            recipe.productName || recipe.id
            )}`,
            description:
            "This recipe belongs to a product that can no longer be found.",
            recommendation:
            "Do not delete this manually yet. Review if this is old test data or if the product needs repair.",
            relatedIds: [recipe.id, productId],
          });
        }

        if (sizeId && !sizeIds.has(sizeId)) {
          addIssue({
            severity: "critical",
            category: "Recipes",
            title: `Recipe is connected to a missing price option: ${String(
            recipe.productName || recipe.id
            )}`,
            description:
            "This recipe belongs to a size, price, or no-size setup that can no longer be found.",
            recommendation:
            "Do not delete this manually yet. Review whether this is old test data or if it needs repair.",
            relatedIds: [recipe.id, sizeId],
          });
        }

        if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
          addIssue({
            severity: "warning",
            category: "Recipes",
            title: `Recipe is empty: ${String(recipe.productName || recipe.id)}`,
            description:
            "This recipe has no ingredients, so the system cannot deduct stock when it is sold.",
            recommendation:
            "Open the product recipe and add the correct ingredients before selling this item.",
            relatedIds: [recipe.id],
          });

          return;
        }

        recipe.ingredients.forEach((ingredient: unknown) => {
          const recipeIngredient = ingredient as {
            ingredientId?: string;
            ingredientName?: string;
          };

          const ingredientId = String(recipeIngredient.ingredientId || "");

          if (ingredientId && !ingredientIds.has(ingredientId)) {
            addIssue({
              severity: "critical",
              category: "Recipes",
              title: `Recipe uses an ingredient that is missing: ${String(
              recipeIngredient.ingredientName || "Unknown ingredient"
              )}`,
              description: `${String(
              recipe.productName || "A recipe"
              )} uses an ingredient that can no longer be found in Inventory.`,
              recommendation:
              "Open the recipe and replace the missing ingredient before selling this item.",
              relatedIds: [recipe.id, ingredientId],
            });
          }
        });
      });

      setIssues(auditIssues);
      setMessage(
        auditIssues.length === 0
          ? "Audit complete. No issues found."
          : `Audit complete. Found ${auditIssues.length} issue${
              auditIssues.length === 1 ? "" : "s"
            }.`
      );
    } catch (error) {
      console.error(error);
      setMessage("Failed to run inventory audit. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    runAudit();
  }, [runAudit]);

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const matchesSeverity =
        severityFilter === "all" || issue.severity === severityFilter;
      const matchesCategory =
        categoryFilter === "all" || issue.category === categoryFilter;

      return matchesSeverity && matchesCategory;
    });
  }, [issues, severityFilter, categoryFilter]);

  const summary = useMemo(() => {
    return {
      total: issues.length,
      critical: issues.filter((issue) => issue.severity === "critical").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length,
    };
  }, [issues]);

  return (
    <section className="inventory-audit-panel">
      <div className="inventory-panel-heading">
        <div>
          <p className="inventory-eyebrow">Inventory Health Check</p>
        <h3>Inventory Audit</h3>
        <p>
        This checks your products, ingredients, prices, and recipes for things that
        may confuse staff, hide products from POS, or make stock reports inaccurate.
        This page only checks. It will not change or delete anything.
        </p>
        </div>

        <button
          type="button"
          className="primary-inventory-button compact"
          onClick={runAudit}
          disabled={isLoading}
        >
          {isLoading ? "Scanning..." : "Run Audit"}
        </button>
      </div>

      <div className="audit-summary-grid">
        <article className="audit-summary-card">
          <span>Total Issues</span>
          <strong>{summary.total}</strong>
        </article>

        <article className="audit-summary-card critical">
        <span>Needs Attention</span>
        <strong>{summary.critical}</strong>
        </article>

        <article className="audit-summary-card warning">
        <span>Check Soon</span>
        <strong>{summary.warning}</strong>
        </article>

        <article className="audit-summary-card info">
        <span>Good to Review</span>
        <strong>{summary.info}</strong>
        </article>
      </div>

      <div className="audit-filter-row">
        <select
          value={severityFilter}
          onChange={(event) =>
            setSeverityFilter(event.target.value as AuditSeverity | "all")
          }
        >
          <option value="all">All Importance Levels</option>
          <option value="critical">Needs Attention</option>
          <option value="warning">Check Soon</option>
          <option value="info">Good to Review</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(event) =>
            setCategoryFilter(event.target.value as AuditCategory | "all")
          }
        >
          <option value="all">All Categories</option>
          <option value="Ingredients">Ingredients</option>
          <option value="Products">Products</option>
          <option value="Sizes">Product Prices / Sizes</option>
          <option value="Single Item Setup">No-Size Products</option>
          <option value="Recipes">Recipes</option>
          <option value="Single Item Setup">Single Item Setup</option>
        </select>
      </div>

      {message && <p className="inventory-form-message">{message}</p>}

      {!isLoading && issues.length === 0 && (
        <div className="audit-empty-card">
          <h4>No audit issues found.</h4>
          <p>Your inventory setup looks clean based on the current checks.</p>
        </div>
      )}

      {!isLoading && issues.length > 0 && filteredIssues.length === 0 && (
        <p className="ingredients-empty-text">
          No issues match the current audit filters.
        </p>
      )}

      <div className="audit-issue-list">
        {filteredIssues.map((issue) => (
          <article
            className={`audit-issue-card audit-issue-card-${issue.severity}`}
            key={issue.id}
          >
            <div className="audit-issue-header">
                <span>{getCategoryFriendlyName(issue.category)}</span>
                <strong>{getSeverityLabel(issue.severity)}</strong>
            </div>

            <p className="audit-severity-help">
                {getSeverityExplanation(issue.severity)}
            </p>

            <h4>{issue.title}</h4>
            <p>{issue.description}</p>

            <div className="audit-recommendation">
              <span>What to do next</span>
              <p>{issue.recommendation}</p>
            </div>

            {issue.relatedIds && issue.relatedIds.length > 0 && (
              <details className="audit-related-ids">
                <summary>Show technical details</summary>
                <p>{issue.relatedIds.join(", ")}</p>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default InventoryAuditPanel;