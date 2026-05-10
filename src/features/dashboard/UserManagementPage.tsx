import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import "./UserManagementPage.css";

type ManagedUserRole = "developer" | "owner" | "staff";

type UserStatusFilter = "all" | "active" | "inactive";
type UserRoleFilter = "all" | ManagedUserRole;
type UserManagementTab = "users" | "activity";

type ActivityActionFilter =
  | "all"
  | "sale"
  | "void"
  | "inventory"
  | "settings"
  | "user"
  | "system";

type FirestoreDateValue = {
  toDate?: () => Date;
};

type ManagedUser = {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: ManagedUserRole;
  isActive: boolean;
  createdAtText: string;
  createdAt?: FirestoreDateValue;
};

type ActivityMetadata = Record<string, unknown>;

type ActivityLog = {
  id: string;
  actionType: string;
  actorId: string;
  actorName: string;
  actorRole: ManagedUserRole;
  targetId: string;
  targetName: string;
  description: string;
  metadata: ActivityMetadata;
  createdAtText: string;
  createdAt?: FirestoreDateValue;
};

function normalizeUserRole(role: string): ManagedUserRole {
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

function getRoleLabel(role: ManagedUserRole) {
  if (role === "developer") {
    return "Developer";
  }

  if (role === "staff") {
    return "Staff Operator";
  }

  return "Owner";
}

function getUserCreatedDate(user: ManagedUser) {
  const firestoreDate = user.createdAt?.toDate?.();

  if (firestoreDate instanceof Date && !Number.isNaN(firestoreDate.getTime())) {
    return firestoreDate;
  }

  if (user.createdAtText) {
    const parsedDate = new Date(user.createdAtText);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
}

function getActivityCreatedDate(activityLog: ActivityLog) {
  const firestoreDate = activityLog.createdAt?.toDate?.();

  if (firestoreDate instanceof Date && !Number.isNaN(firestoreDate.getTime())) {
    return firestoreDate;
  }

  if (activityLog.createdAtText) {
    const parsedDate = new Date(activityLog.createdAtText);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
}

function formatUserCreatedDate(user: ManagedUser) {
  const createdDate = getUserCreatedDate(user);

  if (!createdDate) {
    return "No date saved";
  }

  return createdDate.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatActivityDate(activityLog: ActivityLog) {
  const createdDate = getActivityCreatedDate(activityLog);

  if (!createdDate) {
    return "No date saved";
  }

  return createdDate.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeActionType(actionType: string) {
  const normalizedAction = actionType.trim().toLowerCase();

  if (
    normalizedAction.includes("sale") ||
    normalizedAction.includes("order") ||
    normalizedAction.includes("payment")
  ) {
    return "sale";
  }

  if (normalizedAction.includes("void") || normalizedAction.includes("refund")) {
    return "void";
  }

  if (
    normalizedAction.includes("stock") ||
    normalizedAction.includes("inventory") ||
    normalizedAction.includes("ingredient") ||
    normalizedAction.includes("restock")
  ) {
    return "inventory";
  }

  if (
    normalizedAction.includes("setting") ||
    normalizedAction.includes("printer") ||
    normalizedAction.includes("account")
  ) {
    return "settings";
  }

  if (
    normalizedAction.includes("user") ||
    normalizedAction.includes("role") ||
    normalizedAction.includes("staff")
  ) {
    return "user";
  }

  return "system";
}

function getActionLabel(actionType: string) {
  const normalizedAction = normalizeActionType(actionType);

  if (normalizedAction === "sale") {
    return "Sale";
  }

  if (normalizedAction === "void") {
    return "Void";
  }

  if (normalizedAction === "inventory") {
    return "Inventory";
  }

  if (normalizedAction === "settings") {
    return "Settings";
  }

  if (normalizedAction === "user") {
    return "User";
  }

  return "System";
}

function formatMetadataLabel(key: string) {
  const labels: Record<string, string> = {
    paperSize: "Paper Size",
    receiptCopies: "Receipt Copies",
    autoPrintAfterSale: "Auto Print",
    printerMode: "Printer Mode",
    email: "Email",
    saleNumber: "Sale Number",
    totalAmount: "Total Amount",
    paymentMethod: "Payment Method",
    itemCount: "Total Items",
    ingredientName: "Ingredient",
    quantityAdded: "Quantity Added",
    unit: "Unit",
    totalItems: "Total Items",
    cashReceived: "Cash Received",
    changeAmount: "Change",
    voidReason: "Void Reason",
    voidNote: "Void Note",
    stockRestored: "Stock Restored",
    stockMovement: "Stock Movement",
    previousStock: "Previous Stock",
    newStock: "New Stock",
    purchaseQuantity: "Quantity Added",
    purchaseUnit: "Purchase Unit",
    usageAmountAdded: "Stock Added",
    usageUnit: "Stock Unit",
    restockSource: "Restock Source",
    restockNote: "Restock Note",
  };

  return labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) =>
    letter.toUpperCase()
  );
}

function formatMetadataValue(key: string, value: unknown) {
  if (typeof value === "boolean") {
    if (key === "stockRestored") {
      return value ? "Yes, stock was restored" : "No";
    }

    return value ? "Enabled" : "Disabled";
  }

  if (key === "receiptCopies" && typeof value === "number") {
    return `${value} ${value === 1 ? "copy" : "copies"}`;
  }

  if (key === "printerMode" && typeof value === "string") {
    if (value === "browser-preview") {
      return "Browser Preview";
    }

    if (value === "android-bluetooth") {
      return "Android Bluetooth";
    }
  }

  if (
    (key === "totalAmount" ||
      key === "cashReceived" ||
      key === "changeAmount") &&
    typeof value === "number"
  ) {
    return `₱${value.toFixed(2)}`;
  }

  if (
    (key === "previousStock" ||
      key === "newStock" ||
      key === "usageAmountAdded") &&
    typeof value === "number"
  ) {
    return String(value);
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}

function getReadableActivityDetails(activityLog: ActivityLog) {
  return Object.entries(activityLog.metadata)
    .map(([key, value]) => ({
      label: formatMetadataLabel(key),
      value: formatMetadataValue(key, value),
    }))
    .filter((detail) => detail.value.trim().length > 0);
}

function UserManagementPage() {
  const [activeTab, setActiveTab] = useState<UserManagementTab>("users");

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [isLoading, setIsLoading] = useState(false);

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activitySearchText, setActivitySearchText] = useState("");
  const [activityActionFilter, setActivityActionFilter] =
    useState<ActivityActionFilter>("all");
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  const [message, setMessage] = useState("");

  async function loadUsers() {
    setIsLoading(true);
    setMessage("");

    try {
      const usersSnapshot = await getDocs(collection(db, "users"));

      const loadedUsers = usersSnapshot.docs.map((userDoc) => {
        const data = userDoc.data();
        const rawStatus = String(data.status || "").toLowerCase();

        const isActive =
          data.isActive === false || rawStatus === "inactive" ? false : true;

        return {
          id: userDoc.id,
          uid: String(data.uid || userDoc.id),
          name: String(data.name || data.displayName || "Unnamed User"),
          email: String(data.email || "No email saved"),
          role: normalizeUserRole(String(data.role || "owner")),
          isActive,
          createdAtText: String(data.createdAtText || ""),
          createdAt: data.createdAt,
        };
      });

      loadedUsers.sort((firstUser, secondUser) => {
        const firstName = firstUser.name.toLowerCase();
        const secondName = secondUser.name.toLowerCase();

        return firstName.localeCompare(secondName);
      });

      setUsers(loadedUsers);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load users right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadActivityLogs() {
    setIsLoadingActivity(true);
    setMessage("");

    try {
      const activityLogsQuery = query(
        collection(db, "activityLogs"),
        orderBy("createdAt", "desc"),
        limit(75)
      );

      const activityLogsSnapshot = await getDocs(activityLogsQuery);

      const loadedActivityLogs = activityLogsSnapshot.docs.map((activityDoc) => {
        const data = activityDoc.data();

        return {
          id: activityDoc.id,
          actionType: String(data.actionType || "system"),
          actorId: String(data.actorId || ""),
          actorName: String(data.actorName || "Unknown user"),
          actorRole: normalizeUserRole(String(data.actorRole || "owner")),
          targetId: String(data.targetId || ""),
          targetName: String(data.targetName || ""),
          description: String(data.description || "No description saved."),
          metadata:
            data.metadata && typeof data.metadata === "object"
              ? (data.metadata as ActivityMetadata)
              : {},
          createdAtText: String(data.createdAtText || ""),
          createdAt: data.createdAt,
        };
      });

      loadedActivityLogs.sort((firstLog, secondLog) => {
        const firstDate = getActivityCreatedDate(firstLog)?.getTime() || 0;
        const secondDate = getActivityCreatedDate(secondLog)?.getTime() || 0;

        return secondDate - firstDate;
      });

      setActivityLogs(loadedActivityLogs);
    } catch (error) {
      console.error(error);
      setMessage(
        "Unable to load activity logs right now. If this is the first setup, the activityLogs collection may not exist yet."
      );
    } finally {
      setIsLoadingActivity(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadActivityLogs();
  }, []);

  const filteredUsers = useMemo(() => {
    const cleanSearchText = searchText.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !cleanSearchText ||
        user.name.toLowerCase().includes(cleanSearchText) ||
        user.email.toLowerCase().includes(cleanSearchText) ||
        getRoleLabel(user.role).toLowerCase().includes(cleanSearchText);

      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.isActive) ||
        (statusFilter === "inactive" && !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchText, roleFilter, statusFilter]);

  const filteredActivityLogs = useMemo(() => {
    const cleanSearchText = activitySearchText.trim().toLowerCase();

    return activityLogs.filter((activityLog) => {
      const normalizedAction = normalizeActionType(activityLog.actionType);
      const readableDetails = getReadableActivityDetails(activityLog)
        .map((detail) => `${detail.label} ${detail.value}`)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
      !cleanSearchText ||
      activityLog.actorName.toLowerCase().includes(cleanSearchText) ||
      activityLog.description.toLowerCase().includes(cleanSearchText) ||
      activityLog.targetName.toLowerCase().includes(cleanSearchText) ||
      activityLog.actionType.toLowerCase().includes(cleanSearchText) ||
      getRoleLabel(activityLog.actorRole).toLowerCase().includes(cleanSearchText) ||
      readableDetails.includes(cleanSearchText);

      const matchesAction =
        activityActionFilter === "all" ||
        normalizedAction === activityActionFilter;

      return matchesSearch && matchesAction;
    });
  }, [activityLogs, activitySearchText, activityActionFilter]);

  const userSummary = useMemo(() => {
    const activeUsers = users.filter((user) => user.isActive);
    const inactiveUsers = users.filter((user) => !user.isActive);
    const developers = users.filter((user) => user.role === "developer");
    const owners = users.filter((user) => user.role === "owner");
    const staffUsers = users.filter((user) => user.role === "staff");

    return {
      total: users.length,
      active: activeUsers.length,
      inactive: inactiveUsers.length,
      developers: developers.length,
      owners: owners.length,
      staff: staffUsers.length,
    };
  }, [users]);

  const activitySummary = useMemo(() => {
    return {
      total: activityLogs.length,
      sales: activityLogs.filter(
        (activityLog) => normalizeActionType(activityLog.actionType) === "sale"
      ).length,
      voids: activityLogs.filter(
        (activityLog) => normalizeActionType(activityLog.actionType) === "void"
      ).length,
      inventory: activityLogs.filter(
        (activityLog) =>
          normalizeActionType(activityLog.actionType) === "inventory"
      ).length,
      settings: activityLogs.filter(
        (activityLog) =>
          normalizeActionType(activityLog.actionType) === "settings"
      ).length,
    };
  }, [activityLogs]);

  return (
    <section className="user-management-page">
      <header className="user-management-header">
        <div>
          <p className="user-management-kicker">Access Control</p>
          <h2>User Management</h2>
          <p>
            Review user accounts and system activity. Logs will become more useful
            as POS, inventory, settings, and role changes are connected to the
            activity log helper.
          </p>
        </div>

        <button
          className="user-management-refresh-button"
          type="button"
          onClick={() => {
            if (activeTab === "users") {
              loadUsers();
              return;
            }

            loadActivityLogs();
          }}
          disabled={isLoading || isLoadingActivity}
        >
          {isLoading || isLoadingActivity ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {message && <p className="user-management-message">{message}</p>}

      <div className="user-management-tabs">
        <button
          className={activeTab === "users" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>

        <button
          className={activeTab === "activity" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("activity")}
        >
          Activity Logs
        </button>
      </div>

      {activeTab === "users" && (
        <>
          <section className="user-summary-grid">
            <article className="user-summary-card">
              <span>Total Users</span>
              <strong>{userSummary.total}</strong>
              <p>All saved system accounts</p>
            </article>

            <article className="user-summary-card good">
              <span>Active</span>
              <strong>{userSummary.active}</strong>
              <p>Can use the system</p>
            </article>

            <article className="user-summary-card warning">
              <span>Inactive</span>
              <strong>{userSummary.inactive}</strong>
              <p>Blocked or disabled accounts</p>
            </article>

            <article className="user-summary-card">
              <span>Owners</span>
              <strong>{userSummary.owners}</strong>
              <p>Business-level access</p>
            </article>

            <article className="user-summary-card">
              <span>Staff Operators</span>
              <strong>{userSummary.staff}</strong>
              <p>Limited operational access</p>
            </article>
          </section>

          <section className="user-management-panel">
            <div className="user-management-panel-header">
              <div>
                <p className="user-management-kicker">Saved Accounts</p>
                <h3>Users List</h3>
              </div>

              <span className="user-count-pill">{filteredUsers.length} shown</span>
            </div>

            <div className="user-management-toolbar">
              <input
                type="search"
                placeholder="Search by name, email, or role..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />

              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as UserRoleFilter)
                }
              >
                <option value="all">All Roles</option>
                <option value="developer">Developer</option>
                <option value="owner">Owner</option>
                <option value="staff">Staff Operator</option>
              </select>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as UserStatusFilter)
                }
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <div className="user-list">
              {isLoading ? (
                <div className="user-empty-card">
                  <h4>Loading users...</h4>
                  <p>Please wait while user accounts are being prepared.</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="user-empty-card">
                  <h4>No users found</h4>
                  <p>No account matched the current search or filters.</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <article className="user-card" key={user.id}>
                    <div className="user-avatar">
                      {user.name.trim().charAt(0).toUpperCase() || "U"}
                    </div>

                    <div className="user-card-main">
                      <div className="user-card-title">
                        <div>
                          <h4>{user.name}</h4>
                          <p>{user.email}</p>
                        </div>

                        <div className="user-card-badges">
                          <span className={`user-role-badge ${user.role}`}>
                            {getRoleLabel(user.role)}
                          </span>

                          <span
                            className={`user-status-badge ${
                              user.isActive ? "active" : "inactive"
                            }`}
                          >
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>

                      <div className="user-card-meta">
                        <span>UID: {user.uid}</span>
                        <span>Created: {formatUserCreatedDate(user)}</span>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === "activity" && (
        <>
          <section className="user-summary-grid activity-summary-grid">
            <article className="user-summary-card">
              <span>Total Logs</span>
              <strong>{activitySummary.total}</strong>
              <p>Recent activity records</p>
            </article>

            <article className="user-summary-card good">
              <span>Sales</span>
              <strong>{activitySummary.sales}</strong>
              <p>Completed sale activity</p>
            </article>

            <article className="user-summary-card warning">
              <span>Voids</span>
              <strong>{activitySummary.voids}</strong>
              <p>Voided sale activity</p>
            </article>

            <article className="user-summary-card">
              <span>Inventory</span>
              <strong>{activitySummary.inventory}</strong>
              <p>Stock and ingredient actions</p>
            </article>

            <article className="user-summary-card">
              <span>Settings</span>
              <strong>{activitySummary.settings}</strong>
              <p>Settings and account actions</p>
            </article>
          </section>

          <section className="user-management-panel">
            <div className="user-management-panel-header">
              <div>
                <p className="user-management-kicker">Audit Trail</p>
                <h3>Activity Logs</h3>
              </div>

              <span className="user-count-pill">
                {filteredActivityLogs.length} shown
              </span>
            </div>

            <div className="user-management-toolbar activity-toolbar">
              <input
                type="search"
                placeholder="Search actor, action, target, or description..."
                value={activitySearchText}
                onChange={(event) => setActivitySearchText(event.target.value)}
              />

              <select
                value={activityActionFilter}
                onChange={(event) =>
                  setActivityActionFilter(
                    event.target.value as ActivityActionFilter
                  )
                }
              >
                <option value="all">All Actions</option>
                <option value="sale">Sales</option>
                <option value="void">Voids</option>
                <option value="inventory">Inventory</option>
                <option value="settings">Settings</option>
                <option value="user">Users</option>
                <option value="system">System</option>
              </select>
            </div>

            <div className="activity-list">
              {isLoadingActivity ? (
                <div className="user-empty-card">
                  <h4>Loading activity logs...</h4>
                  <p>Please wait while recent activity is being prepared.</p>
                </div>
              ) : filteredActivityLogs.length === 0 ? (
                <div className="user-empty-card">
                  <h4>No activity logs yet</h4>
                  <p>
                    This is normal for the first setup. Next, we will add a
                    reusable activity log helper, then connect POS sales, voids,
                    restocks, and settings changes.
                  </p>
                </div>
              ) : (
                filteredActivityLogs.map((activityLog) => (
                  <article className="activity-card" key={activityLog.id}>
                    <div className="activity-card-top">
                      <div>
                        <span
                          className={`activity-action-badge ${normalizeActionType(
                            activityLog.actionType
                          )}`}
                        >
                          {getActionLabel(activityLog.actionType)}
                        </span>

                        <h4>{activityLog.description}</h4>
                      </div>

                      <strong>{formatActivityDate(activityLog)}</strong>
                    </div>

                    <div className="activity-card-details">
                      <span>
                        Actor: <strong>{activityLog.actorName}</strong>
                      </span>

                      <span>
                        Role: <strong>{getRoleLabel(activityLog.actorRole)}</strong>
                      </span>

                      {activityLog.targetName && (
                        <span>
                          Target: <strong>{activityLog.targetName}</strong>
                        </span>
                      )}
                    </div>

                    {getReadableActivityDetails(activityLog).length > 0 && (
                      <div className="activity-readable-details">
                        <strong>Activity Details</strong>

                        <div>
                          {getReadableActivityDetails(activityLog).map((detail) => (
                            <span key={`${activityLog.id}-${detail.label}`}>
                              <small>{detail.label}</small>
                              <b>{detail.value}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}

      <section className="user-management-next-card">
        <strong>Next safe upgrade</strong>
        <p>
          After this Activity Logs viewer is confirmed working, we will create a
          reusable activity log helper. Then we connect real actions like completed
          sales, voided sales, inventory restocks, printer settings updates, and
          user role changes.
        </p>
      </section>
    </section>
  );
}

export default UserManagementPage;