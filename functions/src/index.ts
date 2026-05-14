import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

type ManagedRole = "owner" | "staff";

type AdminActor = {
  uid: string;
  name: string;
  email: string;
  role: string;
};

const db = getFirestore();
const auth = getAuth();

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizeManagedRole(value: unknown): ManagedRole {
  const role = cleanText(value).toLowerCase();

  if (role === "owner") {
    return "owner";
  }

  if (role === "staff") {
    return "staff";
  }

  throw new HttpsError(
    "invalid-argument",
    "Role must be either Owner or Staff."
  );
}

function createTemporaryPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

async function getAdminActor(uid: string): Promise<AdminActor> {
  const userSnapshot = await db.collection("users").doc(uid).get();

  if (!userSnapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "Your user profile was not found. Please contact the system developer."
    );
  }

  const userData = userSnapshot.data() || {};
  const role = cleanText(userData.role).toLowerCase();
  const isActive = userData.isActive !== false && userData.status !== "inactive";

  if (!isActive) {
    throw new HttpsError(
      "permission-denied",
      "Your account is inactive. You cannot manage users."
    );
  }

  if (role !== "owner" && role !== "developer") {
    throw new HttpsError(
      "permission-denied",
      "Only an owner account can manage users."
    );
  }

  return {
    uid,
    name: cleanText(userData.name || userData.displayName || userData.email),
    email: cleanText(userData.email),
    role,
  };
}

async function getTargetUserProfile(uid: string) {
  const userSnapshot = await db.collection("users").doc(uid).get();

  if (!userSnapshot.exists) {
    throw new HttpsError("not-found", "User profile was not found.");
  }

  return {
    id: userSnapshot.id,
    data: userSnapshot.data() || {},
  };
}

function assertTargetIsManageable(targetData: FirebaseFirestore.DocumentData) {
  const targetRole = cleanText(targetData.role).toLowerCase();

  if (targetRole === "developer") {
    throw new HttpsError(
      "permission-denied",
      "The developer account is protected and cannot be changed here."
    );
  }
}

async function writeUserManagementLog(input: {
  actor: AdminActor;
  actionType: string;
  targetId: string;
  targetName: string;
  description: string;
  metadata: Record<string, unknown>;
}) {
  await db.collection("activityLogs").add({
    actionType: input.actionType,
    actorId: input.actor.uid,
    actorName: input.actor.name || input.actor.email || "Unknown owner",
    actorRole: input.actor.role,
    targetId: input.targetId,
    targetName: input.targetName,
    description: input.description,
    metadata: input.metadata,
    createdAt: FieldValue.serverTimestamp(),
    createdAtText: new Date().toISOString(),
  });
}

export const createManagedUser = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Please log in first.");
  }

  const actor = await getAdminActor(request.auth.uid);

  const name = cleanText(request.data?.name);
  const email = normalizeEmail(request.data?.email);
  const role = normalizeManagedRole(request.data?.role);

  if (!name) {
    throw new HttpsError("invalid-argument", "Name is required.");
  }

  if (!email || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid email is required.");
  }

  const temporaryPassword = createTemporaryPassword();

  let createdUid = "";

  try {
    const createdUser = await auth.createUser({
      email,
      password: temporaryPassword,
      displayName: name,
      disabled: false,
      emailVerified: false,
    });

    createdUid = createdUser.uid;

    await db.collection("users").doc(createdUser.uid).set({
      uid: createdUser.uid,
      name,
      displayName: name,
      email,
      role,
      isActive: true,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      createdAtText: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtText: new Date().toISOString(),
      createdBy: actor.uid,
      createdByName: actor.name || actor.email,
    });

    await writeUserManagementLog({
      actor,
      actionType: "user.created",
      targetId: createdUser.uid,
      targetName: name,
      description: `${actor.name || "An owner"} created account for ${name}.`,
      metadata: {
        userName: name,
        email,
        newRole: role,
        accountStatus: "Active",
        passwordSetupRequired: true,
        actionSource: "User Management",
      },
    });

    return {
      uid: createdUser.uid,
      name,
      email,
      role,
      isActive: true,
    };
  } catch (error) {
    if (createdUid) {
      await auth.deleteUser(createdUid).catch(() => undefined);
      await db.collection("users").doc(createdUid).delete().catch(() => undefined);
    }

    const firebaseError = error as { code?: string; message?: string };

    if (firebaseError.code === "auth/email-already-exists") {
      throw new HttpsError(
        "already-exists",
        "This email already has an account."
      );
    }

    throw new HttpsError(
      "internal",
      firebaseError.message || "Unable to create account."
    );
  }
});

export const updateManagedUserRole = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Please log in first.");
  }

  const actor = await getAdminActor(request.auth.uid);

  const targetUid = cleanText(request.data?.uid);
  const newRole = normalizeManagedRole(request.data?.role);

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "User ID is required.");
  }

  if (targetUid === actor.uid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot change your own role."
    );
  }

  const target = await getTargetUserProfile(targetUid);
  assertTargetIsManageable(target.data);

  const previousRole = cleanText(target.data.role || "staff").toLowerCase();
  const targetName = cleanText(target.data.name || target.data.email || targetUid);

  await db.collection("users").doc(targetUid).update({
    role: newRole,
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtText: new Date().toISOString(),
    updatedBy: actor.uid,
    updatedByName: actor.name || actor.email,
  });

  await writeUserManagementLog({
    actor,
    actionType: "user.role_updated",
    targetId: targetUid,
    targetName,
    description: `${actor.name || "An owner"} changed ${targetName}'s role.`,
    metadata: {
      userName: targetName,
      email: cleanText(target.data.email),
      previousRole,
      newRole,
      actionSource: "User Management",
    },
  });

  return {
    uid: targetUid,
    role: newRole,
  };
});

export const setManagedUserActive = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Please log in first.");
  }

  const actor = await getAdminActor(request.auth.uid);

  const targetUid = cleanText(request.data?.uid);
  const isActive = request.data?.isActive === true;

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "User ID is required.");
  }

  if (targetUid === actor.uid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot deactivate your own account."
    );
  }

  const target = await getTargetUserProfile(targetUid);
  assertTargetIsManageable(target.data);

  const targetName = cleanText(target.data.name || target.data.email || targetUid);

  await auth.updateUser(targetUid, {
    disabled: !isActive,
  });

  await db.collection("users").doc(targetUid).update({
    isActive,
    status: isActive ? "active" : "inactive",
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtText: new Date().toISOString(),
    updatedBy: actor.uid,
    updatedByName: actor.name || actor.email,
  });

  await writeUserManagementLog({
    actor,
    actionType: isActive ? "user.activated" : "user.deactivated",
    targetId: targetUid,
    targetName,
    description: `${actor.name || "An owner"} ${
      isActive ? "activated" : "deactivated"
    } ${targetName}.`,
    metadata: {
      userName: targetName,
      email: cleanText(target.data.email),
      accountStatus: isActive ? "Active" : "Inactive",
      actionSource: "User Management",
    },
  });

  return {
    uid: targetUid,
    isActive,
  };
});