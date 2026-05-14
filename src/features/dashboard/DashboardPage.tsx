import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../../firebase/config.ts";
import type { UserProfile } from "../../types/UserProfile";
import type { AppPage } from "../../types/AppPage";
import PosPage from "../pos/PosPage";
import InventoryPage from "../inventory/InventoryPage";
import SalesReportsPage from "../reports/SalesReportsPage";
import UserManagementPage from "./UserManagementPage";
import SettingsPage from "./SettingsPage";
import logo from "../../assets/double-d-brews-logo.png";
import "./DashboardPage.css";

type DashboardPageProps = {
  userProfile: UserProfile;
  onLogout: () => void;
};

type DashboardRole = "developer" | "owner" | "staff";

type DashboardModule = {
  title: string;
  description: string;
  icon: string;
  page: AppPage;
};

type DashboardNavItem = {
  label: string;
  shortLabel: string;
  page: AppPage;
};

type DashboardSale = {
  id: string;
  totalAmount: number;
  totalItems: number;
  paymentMethod: string;
  status: string;
  createdAtText?: string;
  createdAt?: {
    toDate?: () => Date;
  };
};

type DashboardIngredient = {
  id: string;
  name: string;
  currentStock: number;
  minThreshold: number;
  status?: string;
  isActive?: boolean;
};

const modules: DashboardModule[] = [
  {
    title: "POS Terminal",
    description: "Process customer orders, payments, and receipts.",
    icon: "🧾",
    page: "pos",
  },
  {
    title: "Inventory & Recipes",
    description: "Manage products, ingredients, recipes, and stock levels.",
    icon: "📦",
    page: "inventory",
  },
  {
    title: "Sales Reports",
    description: "Review sales, transactions, voids, and best-selling items.",
    icon: "📊",
    page: "sales-reports",
  },
  {
    title: "User Management",
    description: "Manage owner and staff access permissions.",
    icon: "👥",
    page: "user-management",
  },
  {
    title: "Settings",
    description: "Configure printer, account, receipts, and system preferences.",
    icon: "⚙️",
    page: "settings",
  },
];

const navItems: DashboardNavItem[] = [
  {
    label: "Dashboard",
    shortLabel: "Dashboard",
    page: "dashboard",
  },
  {
    label: "POS Terminal",
    shortLabel: "POS",
    page: "pos",
  },
  {
    label: "Inventory & Recipes",
    shortLabel: "Inventory",
    page: "inventory",
  },
  {
    label: "Sales Reports",
    shortLabel: "Reports",
    page: "sales-reports",
  },
  {
    label: "User Management",
    shortLabel: "Users",
    page: "user-management",
  },
  {
    label: "Settings",
    shortLabel: "Settings",
    page: "settings",
  },
];

const roleAccess: Record<DashboardRole, AppPage[]> = {
  developer: [
    "dashboard",
    "pos",
    "inventory",
    "sales-reports",
    "user-management",
    "settings",
  ],
  owner: [
    "dashboard",
    "pos",
    "inventory",
    "sales-reports",
    "user-management",
    "settings",
  ],
  staff: ["pos", "inventory", "settings"],
};

function normalizeDashboardRole(role: string): DashboardRole {
  const normalizedRole = role.trim().toLowerCase();

  if (normalizedRole === "developer") {
    return "developer";
  }

  if (
    normalizedRole === "staff" ||
    normalizedRole === "employee" ||
    normalizedRole === "cashier" ||
    normalizedRole === "operator" ||
    normalizedRole === "staff operator"
  ) {
    return "staff";
  }

  return "owner";
}

function getRoleLabel(role: DashboardRole) {
  if (role === "developer") {
    return "Developer";
  }

  if (role === "staff") {
    return "Staff Operator";
  }

  return "Owner";
}

function getDefaultPage(role: DashboardRole): AppPage {
  if (role === "staff") {
    return "pos";
  }

  return "dashboard";
}

function formatDashboardCurrency(amount: number) {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function getDashboardSaleDate(sale: DashboardSale) {
  const firestoreDate = sale.createdAt?.toDate?.();

  if (firestoreDate instanceof Date && !Number.isNaN(firestoreDate.getTime())) {
    return firestoreDate;
  }

  if (sale.createdAtText) {
    const cleanedDateText = sale.createdAtText.replace(" at ", " ");
    const parsedDate = new Date(cleanedDateText);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
}

function DashboardPage({ userProfile, onLogout }: DashboardPageProps) {
  const userRole = normalizeDashboardRole(String(userProfile.role || "owner"));
  const allowedPages = roleAccess[userRole];

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<AppPage>(() =>
    getDefaultPage(userRole)
  );
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState("");
  const [dashboardSales, setDashboardSales] = useState<DashboardSale[]>([]);
  const [dashboardIngredients, setDashboardIngredients] = useState<DashboardIngredient[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardMessage, setDashboardMessage] = useState("");

  const isOwnerLevelUser = userRole === "developer" || userRole === "owner";

  const visibleNavItems = useMemo(() => {
    return navItems.filter((item) => allowedPages.includes(item.page));
  }, [allowedPages]);

  const visibleModules = useMemo(() => {
    return modules.filter((module) => allowedPages.includes(module.page));
  }, [allowedPages]);

  async function loadDashboardInsights() {
    if (!isOwnerLevelUser) {
      return;
    }

    setIsDashboardLoading(true);
    setDashboardMessage("");

    try {
      const salesQuery = query(collection(db, "sales"), orderBy("createdAt", "desc"));

      const [salesSnapshot, ingredientsSnapshot] = await Promise.all([
        getDocs(salesQuery),
        getDocs(collection(db, "ingredients")),
      ]);

      const loadedSales = salesSnapshot.docs.map((saleDoc) => {
        const data = saleDoc.data();

        return {
          id: saleDoc.id,
          totalAmount: Number(data.totalAmount || 0),
          totalItems: Number(data.totalItems || 0),
          paymentMethod: String(data.paymentMethod || "Other"),
          status: String(data.status || "completed"),
          createdAtText: String(data.createdAtText || ""),
          createdAt: data.createdAt,
        };
      });

      const loadedIngredients = ingredientsSnapshot.docs.map((ingredientDoc) => {
        const data = ingredientDoc.data();

        return {
          id: ingredientDoc.id,
          name: String(data.name || "Ingredient"),
          currentStock: Number(data.currentStock || 0),
          minThreshold: Number(data.minThreshold || 0),
          status: String(data.status || "active"),
          isActive: data.isActive,
        };
      });

      setDashboardSales(loadedSales);
      setDashboardIngredients(loadedIngredients);
    } catch (error) {
      console.error(error);
      setDashboardMessage("Unable to load dashboard insights right now.");
    } finally {
      setIsDashboardLoading(false);
    }
  }

  useEffect(() => {
    if (!allowedPages.includes(currentPage)) {
      setCurrentPage(getDefaultPage(userRole));
    }
  }, [allowedPages, currentPage, userRole]);

  useEffect(() => {
    loadDashboardInsights();
  }, []);

  const dashboardStats = useMemo(() => {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    const todaysSales = dashboardSales.filter((sale) => {
      const saleDate = getDashboardSaleDate(sale);

      if (!saleDate) {
        return false;
      }

      return saleDate >= todayStart && saleDate <= todayEnd;
    });

    const completedSales = todaysSales.filter((sale) => sale.status !== "voided");
    const voidedSales = todaysSales.filter((sale) => sale.status === "voided");

    const netSales = completedSales.reduce(
      (total, sale) => total + sale.totalAmount,
      0
    );

    const voidedAmount = voidedSales.reduce(
      (total, sale) => total + sale.totalAmount,
      0
    );

    const lowStockIngredients = dashboardIngredients.filter((ingredient) => {
      const isActiveIngredient =
        ingredient.status !== "inactive" && ingredient.isActive !== false;

      return (
        isActiveIngredient &&
        ingredient.minThreshold > 0 &&
        ingredient.currentStock <= ingredient.minThreshold
      );
    });

    const totalItemsSold = completedSales.reduce(
      (total, sale) => total + sale.totalItems,
      0
    );

    return {
      netSales,
      transactions: completedSales.length,
      lowStockCount: lowStockIngredients.length,
      voidedAmount,
      voidedCount: voidedSales.length,
      totalItemsSold,
    };
  }, [dashboardSales, dashboardIngredients]);

  function closeSidebar() {
    setIsSidebarOpen(false);
  }

  function requestLogout() {
  setIsSidebarOpen(false);
  setLogoutMessage("");
  setIsLogoutConfirmOpen(true);
}

async function handleConfirmLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setLogoutMessage("Logging out...");

    try {
      await signOut(auth);
      onLogout();
    } catch (error) {
      console.error(error);
      setLogoutMessage("Logout failed. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  function openPage(page: AppPage) {
    if (!allowedPages.includes(page)) {
      setCurrentPage(getDefaultPage(userRole));
      setIsSidebarOpen(false);
      return;
    }

    setCurrentPage(page);
    setIsSidebarOpen(false);
  }

  return (
    <main className="dashboard-page">
      {isSidebarOpen && (
        <div
          className="dashboard-overlay"
          onClick={closeSidebar}
          role="presentation"
        ></div>
      )}

      <aside className={`dashboard-sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="dashboard-sidebar-top">
          <img
            src={logo}
            alt="Double D'Brews logo"
            className="dashboard-sidebar-logo"
          />

          <div>
            <p className="dashboard-sidebar-title">Double D'Brews</p>
            <p className="dashboard-sidebar-subtitle">{getRoleLabel(userRole)}</p>
          </div>
        </div>

        <nav className="dashboard-nav">
          {visibleNavItems.map((item) => (
            <button
              className={`dashboard-nav-button ${
                currentPage === item.page ? "active" : ""
              }`}
              type="button"
              key={item.page}
              onClick={() => openPage(item.page)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="dashboard-sidebar-footer">
          <button
            className="dashboard-logout-button"
            type="button"
            onClick={requestLogout}
          >
            Logout
          </button>
        </div>
      </aside>

      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button
            className="dashboard-menu-button"
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <img
            src={logo}
            alt="Double D'Brews logo"
            className="dashboard-logo"
          />

          <span className="dashboard-app-name">Double D'Brews</span>

          <nav className="dashboard-desktop-nav">
            {visibleNavItems.map((item) => (
              <button
                className={`dashboard-desktop-nav-button ${
                  currentPage === item.page ? "active" : ""
                }`}
                type="button"
                key={item.page}
                onClick={() => openPage(item.page)}
              >
                {item.shortLabel}
              </button>
            ))}
          </nav>
        </div>

        <div className="dashboard-header-user-actions">
  <span className="dashboard-user-name">{userProfile.name}</span>

  <button
    className="dashboard-header-logout-button"
    type="button"
    onClick={requestLogout}
  >
    Logout
  </button>
</div>
      </header>

      <section className="dashboard-content">
        {currentPage === "dashboard" && isOwnerLevelUser && (
          <>
            <section className="dashboard-hero">
              <p className="dashboard-kicker">{getRoleLabel(userRole)} Dashboard</p>
              <h1 className="dashboard-title">
                Welcome back, {userProfile.name}.
              </h1>
              <p className="dashboard-description">
                Choose a module or review today&apos;s store activity.
              </p>

              <div className="dashboard-stats-grid">
                <article className="dashboard-stat-card">
                  <p className="dashboard-stat-label">Today&apos;s Net Sales</p>
                  <p className="dashboard-stat-value">
                    {isDashboardLoading
                      ? "Loading..."
                      : formatDashboardCurrency(dashboardStats.netSales)}
                  </p>
                </article>

                <article className="dashboard-stat-card">
                  <p className="dashboard-stat-label">Transactions</p>
                  <p className="dashboard-stat-value">
                    {isDashboardLoading ? "..." : dashboardStats.transactions}
                  </p>
                </article>

                <article className="dashboard-stat-card">
                  <p className="dashboard-stat-label">Low Stock</p>
                  <p className="dashboard-stat-value">
                    {isDashboardLoading ? "..." : dashboardStats.lowStockCount}
                  </p>
                </article>

                <article className="dashboard-stat-card">
                  <p className="dashboard-stat-label">Voided Sales</p>
                  <p className="dashboard-stat-value">
                    {isDashboardLoading
                      ? "Loading..."
                      : formatDashboardCurrency(dashboardStats.voidedAmount)}
                  </p>
                </article>
              </div>

              {dashboardMessage && (
                <p className="dashboard-insight-message">{dashboardMessage}</p>
              )}
            </section>

            <section className="dashboard-insights-panel">
              <div>
                <p className="dashboard-kicker">Today&apos;s Store Pulse</p>
                <h2 className="dashboard-section-title">Owner Insights</h2>
              </div>

              <div className="dashboard-insights-grid">
                <article className="dashboard-insight-card">
                  <strong>Sales Activity</strong>
                  <p>
                    {dashboardStats.transactions > 0
                      ? `${dashboardStats.transactions} completed transaction/s today with ${dashboardStats.totalItemsSold} item/s sold.`
                      : "No completed sales recorded today yet."}
                  </p>
                </article>

                <article
                  className={`dashboard-insight-card ${
                    dashboardStats.lowStockCount > 0 ? "warning" : "good"
                  }`}
                >
                  <strong>Inventory Attention</strong>
                  <p>
                    {dashboardStats.lowStockCount > 0
                      ? `${dashboardStats.lowStockCount} ingredient/s need restocking. Check Inventory before peak hours.`
                      : "No low-stock ingredient alerts right now."}
                  </p>
                </article>

                <article
                  className={`dashboard-insight-card ${
                    dashboardStats.voidedCount > 0 ? "warning" : "good"
                  }`}
                >
                  <strong>Transaction Cleanliness</strong>
                  <p>
                    {dashboardStats.voidedCount > 0
                      ? `${dashboardStats.voidedCount} voided sale/s today. Review Sales Reports for accountability.`
                      : "No voided sales recorded today."}
                  </p>
                </article>
              </div>

              <button
                className="dashboard-refresh-insights-button"
                type="button"
                onClick={loadDashboardInsights}
                disabled={isDashboardLoading}
              >
                {isDashboardLoading ? "Refreshing..." : "Refresh Dashboard Insights"}
              </button>
            </section>

            <h2 className="dashboard-section-title">Modules</h2>

            <section className="dashboard-modules-grid">
              {visibleModules.map((module) => (
                <button
                  className="dashboard-module-card"
                  type="button"
                  key={module.title}
                  onClick={() => openPage(module.page)}
                >
                  <span className="dashboard-module-icon">{module.icon}</span>

                  <span>
                    <h3 className="dashboard-module-title">{module.title}</h3>
                    <p className="dashboard-module-description">
                      {module.description}
                    </p>
                  </span>
                </button>
              ))}
            </section>
          </>
        )}

        {currentPage === "pos" && <PosPage userProfile={userProfile} />}
        {currentPage === "inventory" && allowedPages.includes("inventory") && (
          <InventoryPage userRole={userRole} userProfile={userProfile} />
        )}
        {currentPage === "sales-reports" && isOwnerLevelUser && <SalesReportsPage />}
        {currentPage === "user-management" && isOwnerLevelUser && <UserManagementPage />}
        {currentPage === "settings" && (
          <SettingsPage userRole={userRole} userProfile={userProfile} />
        )}

        {!allowedPages.includes(currentPage) && (
          <section className="dashboard-access-card">
            <p className="dashboard-kicker">Access Restricted</p>
            <h2 className="dashboard-section-title">This area is not available.</h2>
            <p>
              Your current role does not have permission to open this module.
            </p>

            <button
              className="dashboard-refresh-insights-button"
              type="button"
              onClick={() => openPage(getDefaultPage(userRole))}
            >
              Go Back
            </button>
          </section>
        )}
            </section>

      {isLogoutConfirmOpen && (
        <div
          className="dashboard-logout-modal-overlay"
          onClick={() => {
            if (!isLoggingOut) {
              setIsLogoutConfirmOpen(false);
              setLogoutMessage("");
            }
          }}
        >
          <section
            className="dashboard-logout-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dashboard-logout-modal-icon">↪</div>

            <div>
              <p className="dashboard-kicker">Confirm Logout</p>
              <h3>Log out of Double D&apos;Brews?</h3>
              <p>
                You will return to the login screen. Any unfinished POS transaction
                should be completed or cleared before logging out.
              </p>
            </div>

            {logoutMessage && (
              <p className="dashboard-logout-message">{logoutMessage}</p>
            )}

            <div className="dashboard-logout-modal-actions">
              <button
                type="button"
                className="dashboard-logout-confirm-button"
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Logging out..." : "Yes, Log Out"}
              </button>

              <button
                type="button"
                className="dashboard-logout-cancel-button"
                onClick={() => {
                  setIsLogoutConfirmOpen(false);
                  setLogoutMessage("");
                }}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default DashboardPage;