import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import type { UserProfile } from "../types/UserProfile";

type ActivityLogInput = {
  actor: UserProfile;
  actionType: string;
  description: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
};

function getSafeActorName(actor: UserProfile) {
  return actor.name || actor.email || "Unknown user";
}

export async function writeActivityLog({
  actor,
  actionType,
  description,
  targetId = "",
  targetName = "",
  metadata = {},
}: ActivityLogInput) {
  try {
    await addDoc(collection(db, "activityLogs"), {
      actionType,
      actorId: actor.uid,
      actorName: getSafeActorName(actor),
      actorRole: actor.role,
      targetId,
      targetName,
      description,
      metadata,
      createdAt: serverTimestamp(),
      createdAtText: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to write activity log:", error);
  }
}