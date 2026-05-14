import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import LoginPage from "./features/auth/LoginPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import { auth, db } from "./firebase/config";
import type { UserProfile } from "./types/UserProfile";

function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsCheckingSession(true);
      setSessionMessage("");

      try {
        if (!firebaseUser) {
          setUserProfile(null);
          return;
        }

        const userSnapshot = await getDoc(doc(db, "users", firebaseUser.uid));

        if (!userSnapshot.exists()) {
          await signOut(auth);
          setUserProfile(null);
          setSessionMessage(
            "Your account profile was not found. Please contact the owner."
          );
          return;
        }

        const userData = userSnapshot.data();

        if (
          userData.isActive === false ||
          String(userData.status || "").toLowerCase() === "inactive"
        ) {
          await signOut(auth);
          setUserProfile(null);
          setSessionMessage("This account is inactive. Please contact the owner.");
          return;
        }

        setUserProfile({
          uid: firebaseUser.uid,
          name: String(
            userData.name ||
              userData.displayName ||
              firebaseUser.displayName ||
              firebaseUser.email ||
              "User"
          ),
          email: String(userData.email || firebaseUser.email || ""),
          role: userData.role === "staff" ? "staff" : "owner",
          isActive: userData.isActive === false ? false : true,
        });
      } catch (error) {
        console.error(error);
        setUserProfile(null);
        setSessionMessage("Unable to restore your session. Please log in again.");
      } finally {
        setIsCheckingSession(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (isCheckingSession) {
    return (
      <main className="app-loading-screen">
        <section className="app-loading-card">
          <h1>Double D&apos;Brews</h1>
          <p>Checking your session...</p>
        </section>
      </main>
    );
  }

  if (userProfile) {
    return (
      <DashboardPage
        userProfile={userProfile}
        onLogout={() => setUserProfile(null)}
      />
    );
  }

  return (
    <>
      {sessionMessage && (
        <div className="app-session-message">{sessionMessage}</div>
      )}

      <LoginPage onLoginSuccess={setUserProfile} />
    </>
  );
}

export default App;