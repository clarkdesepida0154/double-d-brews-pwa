import { initializeApp, deleteApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db, firebaseConfig } from "../../firebase/config";
import "./UserManagementPage.css";

type ManagedUserRole = "developer" | "owner" | "staff";
type EditableUserRole = "owner" | "staff";

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

type CurrentActor = {
  uid: string;
  name: string;
  email: string;
  role: ManagedUserRole;
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

function getEditableRoleLabel(role: EditableUserRole) {
  return role === "owner" ? "Owner" : "Staff Operator";
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

    userName: "User",
    previousRole: "Previous Role",
    newRole: "New Role",
    accountStatus: "Account Status",
    passwordSetupRequired: "Password Setup Required",

    saleNumber: "Sale Number",
    totalAmount: "Total Amount",
    paymentMethod: "Payment Method",
    itemCount: "Total Items",
    totalItems: "Total Items",
    cashReceived: "Cash Received",
    changeAmount: "Change",
    voidReason: "Void Reason",
    voidNote: "Void Note",
    stockRestored: "Stock Restored",
    stockMovement: "Stock Movement",

    ingredientName: "Ingredient",
    previousIngredientName: "Previous Name",
    newIngredientName: "New Name",
    ingredientStatus: "Ingredient Status",
    purchaseQuantity: "Quantity Added",
    quantityAdded: "Quantity Added",
    purchaseUnit: "Purchase Unit",
    usageUnit: "Stock Unit",
    usagePerPurchaseUnit: "Usage Per Purchase Unit",
    usageAmountAdded: "Stock Added",
    purchaseCost: "Purchase Cost",
    costPerUsageUnit: "Cost Per Usage Unit",
    currentStock: "Current Stock",
    previousStock: "Previous Stock",
    newStock: "New Stock",
    minThreshold: "Low Stock Level",
    restockSource: "Restock Source",
    restockNote: "Restock Note",
    actionSource: "Action Source",

    productName: "Product",
    previousProductName: "Previous Product Name",
    newProductName: "New Product Name",
    productCategory: "Category",
    previousCategory: "Previous Category",
    newCategory: "New Category",
    sellingType: "Selling Type",
    productStatus: "Product Status",
    productAvailable: "Product Available",
    singleItemPrice: "Single Item Price",
    defaultSingleItemSizeId: "Single Item Setup ID",

    sizeName: "Size",
    previousSizeName: "Previous Size",
    newSizeName: "New Size",
    price: "Price",
    previousPrice: "Previous Price",
    newPrice: "New Price",
    sizeStatus: "Size Status",
    sizeAvailable: "Size Available",
    hasCompleteRecipe: "Recipe Completed",

    ingredientCount: "Ingredient Count",
    totalRecipeCost: "Recipe Cost",
    estimatedProfit: "Estimated Profit",

    unit: "Unit",
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

    if (
      key === "productAvailable" ||
      key === "sizeAvailable" ||
      key === "hasCompleteRecipe" ||
      key === "passwordSetupRequired"
    ) {
      return value ? "Yes" : "No";
    }

    return value ? "Enabled" : "Disabled";
  }

  if (
    (key === "previousRole" || key === "newRole") &&
    typeof value === "string"
  ) {
    return getRoleLabel(normalizeUserRole(value));
  }

  if (key === "sellingType" && typeof value === "string") {
    return value === "single" ? "Single Item" : "Has Sizes";
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
      key === "changeAmount" ||
      key === "purchaseCost" ||
      key === "costPerUsageUnit" ||
      key === "singleItemPrice" ||
      key === "price" ||
      key === "previousPrice" ||
      key === "newPrice" ||
      key === "totalRecipeCost" ||
      key === "estimatedProfit") &&
    typeof value === "number"
  ) {
    return `₱${value.toFixed(2)}`;
  }

  if (
    (key === "currentStock" ||
      key === "minThreshold" ||
      key === "previousStock" ||
      key === "newStock" ||
      key === "usageAmountAdded" ||
      key === "usagePerPurchaseUnit") &&
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

function createTemporaryPassword() {
  const randomPart = crypto.randomUUID().replace(/-/g, "");
  return `${randomPart}Aa1!`;
}

function getFriendlyAuthError(error: unknown) {
  const errorCode = String((error as { code?: string })?.code || "");

  if (errorCode.includes("email-already-in-use")) {
    return "This email already has an account.";
  }

  if (errorCode.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }

  if (errorCode.includes("weak-password")) {
    return "The temporary password was rejected. Please try again.";
  }

  if (errorCode.includes("permission-denied")) {
    return "Permission denied. Check Firestore rules or use an owner account.";
  }

  return "Something went wrong. Please try again.";
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

  const [currentActor, setCurrentActor] = useState<CurrentActor | null>(null);
  const [message, setMessage] = useState("");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<EditableUserRole>("staff");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [selectedUserRole, setSelectedUserRole] =
    useState<EditableUserRole>("staff");
  const [isSavingUserAction, setIsSavingUserAction] = useState(false);

  async function loadCurrentActor() {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setCurrentActor(null);
      return;
    }

    const actorSnapshot = await getDoc(doc(db, "users", currentUser.uid));

    if (!actorSnapshot.exists()) {
      setCurrentActor({
        uid: currentUser.uid,
        name: currentUser.email || "Current user",
        email: currentUser.email || "",
        role: "staff",
      });
      return;
    }

    const actorData = actorSnapshot.data();

    setCurrentActor({
      uid: currentUser.uid,
      name: String(actorData.name || actorData.displayName || currentUser.email || "User"),
      email: String(actorData.email || currentUser.email || ""),
      role: normalizeUserRole(String(actorData.role || "staff")),
    });
  }

  function resetCreateForm() {
    setNewUserName("");
    setNewUserEmail("");
    setNewUserRole("staff");
  }

  function openCreateModal() {
    resetCreateForm();
    setMessage("");
    setIsCreateModalOpen(true);
  }

  function openUserActionModal(user: ManagedUser) {
    setSelectedUser(user);
    setSelectedUserRole(user.role === "owner" ? "owner" : "staff");
    setMessage("");
  }

  function closeUserActionModal() {
    setSelectedUser(null);
    setSelectedUserRole("staff");
    setMessage("");
  }

  function canManageUsers() {
    return currentActor?.role === "owner" || currentActor?.role === "developer";
  }

  function isProtectedUser(user: ManagedUser) {
    return user.role === "developer" || user.uid === currentActor?.uid;
  }

  async function writeUserManagementLog(input: {
    actionType: string;
    targetId: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
  }) {
    if (!currentActor) {
      return;
    }

    await addDoc(collection(db, "activityLogs"), {
      actionType: input.actionType,
      actorId: currentActor.uid,
      actorName: currentActor.name || currentActor.email || "Unknown user",
      actorRole: currentActor.role,
      targetId: input.targetId,
      targetName: input.targetName,
      description: input.description,
      metadata: input.metadata,
      createdAt: serverTimestamp(),
      createdAtText: new Date().toISOString(),
    });
  }

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
        if (firstUser.role === "developer") {
          return -1;
        }

        if (secondUser.role === "developer") {
          return 1;
        }

        return firstUser.name.toLowerCase().localeCompare(secondUser.name.toLowerCase());
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

  async function refreshEverything() {
    await Promise.all([loadCurrentActor(), loadUsers(), loadActivityLogs()]);
  }

  useEffect(() => {
    refreshEverything();
  }, []);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageUsers() || isCreatingUser) {
      setMessage("Only an owner can create user accounts.");
      return;
    }

    const cleanName = newUserName.trim();
    const cleanEmail = newUserEmail.trim().toLowerCase();

    if (!cleanName) {
      setMessage("Enter the user's name.");
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage("Enter a valid email address.");
      return;
    }

    setIsCreatingUser(true);
    setMessage("Creating account...");

    const secondaryAppName = `secondary-user-creation-${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);
    const temporaryPassword = createTemporaryPassword();

    try {
      const createdCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        cleanEmail,
        temporaryPassword
      );

      const createdUser = createdCredential.user;

      await setDoc(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid,
        name: cleanName,
        displayName: cleanName,
        email: cleanEmail,
        role: newUserRole,
        isActive: true,
        status: "active",
        createdAt: serverTimestamp(),
        createdAtText: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        updatedAtText: new Date().toISOString(),
        createdBy: currentActor?.uid || "",
        createdByName: currentActor?.name || currentActor?.email || "",
      });

      await sendPasswordResetEmail(secondaryAuth, cleanEmail);

      await writeUserManagementLog({
        actionType: "user.created",
        targetId: createdUser.uid,
        targetName: cleanName,
        description: `${currentActor?.name || "An owner"} created account for ${cleanName}.`,
        metadata: {
          userName: cleanName,
          email: cleanEmail,
          newRole: newUserRole,
          accountStatus: "Active",
          passwordSetupRequired: true,
          actionSource: "User Management",
        },
      });

      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      resetCreateForm();
      setIsCreateModalOpen(false);
      setMessage(
        `Account created for ${cleanName}. Password setup email was sent.`
      );

      await refreshEverything();
    } catch (error) {
      console.error(error);
      await signOut(secondaryAuth).catch(() => undefined);
      await deleteApp(secondaryApp).catch(() => undefined);
      setMessage(getFriendlyAuthError(error));
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handleUpdateSelectedUserRole() {
    if (!selectedUser || !canManageUsers() || isSavingUserAction) {
      return;
    }

    if (isProtectedUser(selectedUser)) {
      setMessage("This account is protected and cannot be changed here.");
      return;
    }

    if (selectedUser.role === selectedUserRole) {
      setMessage("No role change needed.");
      return;
    }

    setIsSavingUserAction(true);
    setMessage("Updating role...");

    try {
      await updateDoc(doc(db, "users", selectedUser.uid), {
        role: selectedUserRole,
        updatedAt: serverTimestamp(),
        updatedAtText: new Date().toISOString(),
        updatedBy: currentActor?.uid || "",
        updatedByName: currentActor?.name || currentActor?.email || "",
      });

      await writeUserManagementLog({
        actionType: "user.role_updated",
        targetId: selectedUser.uid,
        targetName: selectedUser.name,
        description: `${currentActor?.name || "An owner"} changed ${selectedUser.name}'s role.`,
        metadata: {
          userName: selectedUser.name,
          email: selectedUser.email,
          previousRole: selectedUser.role,
          newRole: selectedUserRole,
          actionSource: "User Management",
        },
      });

      setMessage("User role updated successfully.");
      closeUserActionModal();
      await refreshEverything();
    } catch (error) {
      console.error(error);
      setMessage("Unable to update user role. Please try again.");
    } finally {
      setIsSavingUserAction(false);
    }
  }

  async function handleToggleSelectedUserStatus() {
    if (!selectedUser || !canManageUsers() || isSavingUserAction) {
      return;
    }

    if (isProtectedUser(selectedUser)) {
      setMessage("This account is protected and cannot be deactivated here.");
      return;
    }

    const nextStatus = !selectedUser.isActive;

    setIsSavingUserAction(true);
    setMessage(nextStatus ? "Activating user..." : "Deactivating user...");

    try {
      await updateDoc(doc(db, "users", selectedUser.uid), {
        isActive: nextStatus,
        status: nextStatus ? "active" : "inactive",
        updatedAt: serverTimestamp(),
        updatedAtText: new Date().toISOString(),
        updatedBy: currentActor?.uid || "",
        updatedByName: currentActor?.name || currentActor?.email || "",
      });

      await writeUserManagementLog({
        actionType: nextStatus ? "user.activated" : "user.deactivated",
        targetId: selectedUser.uid,
        targetName: selectedUser.name,
        description: `${currentActor?.name || "An owner"} ${
          nextStatus ? "activated" : "deactivated"
        } ${selectedUser.name}.`,
        metadata: {
          userName: selectedUser.name,
          email: selectedUser.email,
          accountStatus: nextStatus ? "Active" : "Inactive",
          actionSource: "User Management",
        },
      });

      setMessage(
        nextStatus
          ? "User activated successfully."
          : "User deactivated successfully. This user will be blocked on next login."
      );
      closeUserActionModal();
      await refreshEverything();
    } catch (error) {
      console.error(error);
      setMessage("Unable to update user status. Please try again.");
    } finally {
      setIsSavingUserAction(false);
    }
  }

  async function handleSendPasswordReset(user: ManagedUser) {
    if (!canManageUsers() || isSavingUserAction) {
      return;
    }

    if (user.role === "developer" && currentActor?.role !== "developer") {
      setMessage("Developer account password reset is protected.");
      return;
    }

    setIsSavingUserAction(true);
    setMessage("Sending password reset email...");

    try {
      await sendPasswordResetEmail(auth, user.email);

      await writeUserManagementLog({
        actionType: "user.password_reset_sent",
        targetId: user.uid,
        targetName: user.name,
        description: `${currentActor?.name || "An owner"} sent a password reset email to ${user.name}.`,
        metadata: {
          userName: user.name,
          email: user.email,
          actionSource: "User Management",
        },
      });

      setMessage(`Password reset email sent to ${user.email}.`);
      await loadActivityLogs();
    } catch (error) {
      console.error(error);
      setMessage("Could not send password reset email. Check the email address.");
    } finally {
      setIsSavingUserAction(false);
    }
  }

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
    const owners = users.filter((user) => user.role === "owner");
    const staffUsers = users.filter((user) => user.role === "staff");

    return {
      total: users.length,
      active: activeUsers.length,
      inactive: inactiveUsers.length,
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
            Create owner/staff accounts, manage access, send password setup emails,
            and review system activity.
          </p>
        </div>

        <div className="user-management-header-actions">
          {activeTab === "users" && canManageUsers() && (
            <button
              className="user-management-create-button"
              type="button"
              onClick={openCreateModal}
            >
              + Create Account
            </button>
          )}

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
        </div>
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
              <p>Blocked inside the app</p>
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

                      {canManageUsers() && (
                        <div className="user-card-actions">
                          <button
                            type="button"
                            className="user-secondary-action"
                            onClick={() => openUserActionModal(user)}
                          >
                            Manage
                          </button>

                          <button
                            type="button"
                            className="user-secondary-action"
                            onClick={() => handleSendPasswordReset(user)}
                            disabled={isSavingUserAction}
                          >
                            Send Reset Email
                          </button>
                        </div>
                      )}
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
                  <p>User actions, POS actions, settings changes, and inventory changes will appear here.</p>
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

      {isCreateModalOpen && (
        <div
          className="user-modal-overlay"
          onClick={() => {
            if (!isCreatingUser) {
              setIsCreateModalOpen(false);
              resetCreateForm();
            }
          }}
        >
          <form
            className="user-modal-card"
            onSubmit={handleCreateUser}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="user-modal-header">
              <div>
                <p className="user-management-kicker">New Account</p>
                <h3>Create Owner / Staff Account</h3>
                <p>
                  The user will receive a password setup email after the account is created.
                </p>
              </div>

              <button
                type="button"
                className="user-modal-close"
                onClick={() => {
                  if (!isCreatingUser) {
                    setIsCreateModalOpen(false);
                    resetCreateForm();
                  }
                }}
              >
                ×
              </button>
            </div>

            <div className="user-form-grid">
              <label>
                <span>Full name</span>
                <input
                  value={newUserName}
                  onChange={(event) => setNewUserName(event.target.value)}
                  placeholder="Example: Juan Dela Cruz"
                />
              </label>

              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  placeholder="staff@email.com"
                />
              </label>

              <label>
                <span>Role</span>
                <select
                  value={newUserRole}
                  onChange={(event) =>
                    setNewUserRole(event.target.value as EditableUserRole)
                  }
                >
                  <option value="staff">Staff Operator</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
            </div>

            <div className="user-modal-note">
              <strong>No developer role here.</strong>
              <p>
                Developer access is protected and cannot be created from this page.
              </p>
            </div>

            <div className="user-modal-actions">
              <button
                type="submit"
                className="user-primary-action"
                disabled={isCreatingUser}
              >
                {isCreatingUser ? "Creating..." : "Create Account"}
              </button>

              <button
                type="button"
                className="user-secondary-action"
                disabled={isCreatingUser}
                onClick={() => {
                  setIsCreateModalOpen(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedUser && (
        <div
          className="user-modal-overlay"
          onClick={() => {
            if (!isSavingUserAction) {
              closeUserActionModal();
            }
          }}
        >
          <section
            className="user-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="user-modal-header">
              <div>
                <p className="user-management-kicker">Manage Account</p>
                <h3>{selectedUser.name}</h3>
                <p>{selectedUser.email}</p>
              </div>

              <button
                type="button"
                className="user-modal-close"
                onClick={() => {
                  if (!isSavingUserAction) {
                    closeUserActionModal();
                  }
                }}
              >
                ×
              </button>
            </div>

            {isProtectedUser(selectedUser) ? (
              <div className="user-modal-note warning">
                <strong>Protected account</strong>
                <p>
                  Developer and your own account are protected from role changes or deactivation here.
                </p>
              </div>
            ) : (
              <>
                <div className="user-form-grid">
                  <label>
                    <span>Role</span>
                    <select
                      value={selectedUserRole}
                      onChange={(event) =>
                        setSelectedUserRole(event.target.value as EditableUserRole)
                      }
                    >
                      <option value="staff">Staff Operator</option>
                      <option value="owner">Owner</option>
                    </select>
                  </label>
                </div>

                <div className="user-modal-note">
                  <strong>Account status</strong>
                  <p>
                    Current status:{" "}
                    <b>{selectedUser.isActive ? "Active" : "Inactive"}</b>.
                    Inactive users are blocked on login.
                  </p>
                </div>

                <div className="user-modal-actions">
                  <button
                    type="button"
                    className="user-primary-action"
                    disabled={isSavingUserAction}
                    onClick={handleUpdateSelectedUserRole}
                  >
                    {isSavingUserAction
                      ? "Saving..."
                      : `Save Role as ${getEditableRoleLabel(selectedUserRole)}`}
                  </button>

                  <button
                    type="button"
                    className={
                      selectedUser.isActive
                        ? "user-danger-action"
                        : "user-primary-action"
                    }
                    disabled={isSavingUserAction}
                    onClick={handleToggleSelectedUserStatus}
                  >
                    {selectedUser.isActive ? "Deactivate User" : "Activate User"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default UserManagementPage;