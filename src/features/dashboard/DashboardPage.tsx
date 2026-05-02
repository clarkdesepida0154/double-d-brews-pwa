import { useState } from "react";
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
};

const modules: {
  title: string;
  description: string;
  icon: string;
  page: AppPage;
}[] = [
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
    description: "Review sales, profit, transactions, and best-selling items.",
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

function DashboardPage({ userProfile }: DashboardPageProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<AppPage>("dashboard");

  function closeSidebar() {
    setIsSidebarOpen(false);
  }

  function openPage(page: AppPage) {
    setCurrentPage(page);
    setIsSidebarOpen(false);
    }

  return (
    <main className="dashboard-page">
      {isSidebarOpen && (
        <div className="dashboard-overlay" onClick={closeSidebar}></div>
      )}

      <aside className={`dashboard-sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="dashboard-sidebar-top">
          <img src={logo} alt="Double D'Brews logo" className="dashboard-sidebar-logo" />

          <div>
            <p className="dashboard-sidebar-title">Double D'Brews</p>
            <p className="dashboard-sidebar-subtitle">{userProfile.role}</p>
          </div>
        </div>

        <nav className="dashboard-nav">
            <button
                className={`dashboard-nav-button ${currentPage === "dashboard" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("dashboard")}
            >
                Dashboard
            </button>

            <button
                className={`dashboard-nav-button ${currentPage === "pos" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("pos")}
            >
                POS Terminal
            </button>

            <button
                className={`dashboard-nav-button ${currentPage === "inventory" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("inventory")}
            >
                Inventory & Recipes
            </button>

            <button
                className={`dashboard-nav-button ${currentPage === "sales-reports" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("sales-reports")}
            >
                Sales Reports
            </button>

            <button
                className={`dashboard-nav-button ${currentPage === "user-management" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("user-management")}
            >
                User Management
            </button>

            <button
                className={`dashboard-nav-button ${currentPage === "settings" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("settings")}
            >
                Settings
            </button>
        </nav>

        <div className="dashboard-sidebar-footer">
          <button className="dashboard-logout-button" type="button">
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

          <img src={logo} alt="Double D'Brews logo" className="dashboard-logo" />

          <span className="dashboard-app-name">Double D'Brews</span>
          <nav className="dashboard-desktop-nav">
            <button
                className={`dashboard-desktop-nav-button ${currentPage === "dashboard" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("dashboard")}
            >
                Dashboard
            </button>

            <button
                className={`dashboard-desktop-nav-button ${currentPage === "pos" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("pos")}
            >
                POS
            </button>

            <button
                className={`dashboard-desktop-nav-button ${currentPage === "inventory" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("inventory")}
            >
                Inventory
            </button>

            <button
                className={`dashboard-desktop-nav-button ${currentPage === "sales-reports" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("sales-reports")}
            >
                Reports
            </button>

            <button
                className={`dashboard-desktop-nav-button ${currentPage === "user-management" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("user-management")}
            >
                Users
            </button>

            <button
                className={`dashboard-desktop-nav-button ${currentPage === "settings" ? "active" : ""}`}
                type="button"
                onClick={() => openPage("settings")}
            >
                Settings
            </button>
            </nav>
        </div>

        <span className="dashboard-user-name">{userProfile.name}</span>
      </header>

      <section className="dashboard-content">
    {currentPage === "dashboard" && (
        <>
        <section className="dashboard-hero">
            <p className="dashboard-kicker">Owner Dashboard</p>
            <h1 className="dashboard-title">Welcome back, {userProfile.name}.</h1>
            <p className="dashboard-description">
            Choose a module or review today&apos;s store activity.
            </p>

            <div className="dashboard-stats-grid">
            <article className="dashboard-stat-card">
                <p className="dashboard-stat-label">Today&apos;s Sales</p>
                <p className="dashboard-stat-value">₱0.00</p>
            </article>

            <article className="dashboard-stat-card">
                <p className="dashboard-stat-label">Transactions</p>
                <p className="dashboard-stat-value">0</p>
            </article>

            <article className="dashboard-stat-card">
                <p className="dashboard-stat-label">Low Stock</p>
                <p className="dashboard-stat-value">0</p>
            </article>

            <article className="dashboard-stat-card">
                <p className="dashboard-stat-label">Profit</p>
                <p className="dashboard-stat-value">₱0.00</p>
            </article>
            </div>
        </section>

      <h2 className="dashboard-section-title">Modules</h2>

            <section className="dashboard-modules-grid">
            {modules.map((module) => (
                <button
                className="dashboard-module-card"
                type="button"
                key={module.title}
                onClick={() => openPage(module.page)}
                >
                <span className="dashboard-module-icon">{module.icon}</span>

                <span>
                    <h3 className="dashboard-module-title">{module.title}</h3>
                    <p className="dashboard-module-description">{module.description}</p>
                </span>
                </button>
            ))}
            </section>

            <section className="dashboard-placeholder">
            Low-stock alerts and recent transactions will appear here once the POS and inventory modules are connected.
            </section>
        </>
        )}

        {currentPage === "pos" && <PosPage />}
        {currentPage === "inventory" && <InventoryPage />}
        {currentPage === "sales-reports" && <SalesReportsPage />}
        {currentPage === "user-management" && <UserManagementPage />}
        {currentPage === "settings" && <SettingsPage />}
      </section>
    </main>
  );
}

export default DashboardPage;