import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import "./UserManagementPage.css";

type ManagedUserRole = "developer" | "owner" | "staff";

type UserStatusFilter = "all" | "active" | "inactive";
type UserRoleFilter = "all" | ManagedUserRole;

type ManagedUser = {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: ManagedUserRole;
  isActive: boolean;
  createdAtText: string;
  createdAt?: {
    toDate?: () => Date;
  };
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

function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    loadUsers();
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

  return (
    <section className="user-management-page">
      <header className="user-management-header">
        <div>
          <p className="user-management-kicker">Access Control</p>
          <h2>User Management</h2>
          <p>
            Review developer, owner, and staff operator accounts. Account
            creation, role editing, and activity logs will be added after this
            read-only foundation is stable.
          </p>
        </div>

        <button
          className="user-management-refresh-button"
          type="button"
          onClick={loadUsers}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh Users"}
        </button>
      </header>

      {message && <p className="user-management-message">{message}</p>}

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
            onChange={(event) => setRoleFilter(event.target.value as UserRoleFilter)}
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

      <section className="user-management-next-card">
        <strong>Next safe upgrade</strong>
        <p>
          After this users list is confirmed working, we can add Activity Logs.
          Account creation and role editing should come after that because those
          actions affect Firebase Auth and access permissions.
        </p>
      </section>
    </section>
  );
}

export default UserManagementPage;