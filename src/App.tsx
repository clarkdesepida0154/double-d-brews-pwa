import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import LoginPage from "./features/auth/LoginPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import { auth, db } from "./firebase/config";
import type { UserProfile } from "./types/UserProfile";

const CACHED_USER_PROFILE_KEY = "double-d-brews-cached-user-profile";

function loadCachedUserProfile(): UserProfile | null {
  try {
    const cachedUserProfile = window.localStorage.getItem(CACHED_USER_PROFILE_KEY);

    if (!cachedUserProfile) {
      return null;
    }

    const parsedUserProfile = JSON.parse(cachedUserProfile) as UserProfile;

    if (!parsedUserProfile.uid || !parsedUserProfile.email || !parsedUserProfile.role) {
      return null;
    }

    if (parsedUserProfile.isActive === false) {
      return null;
    }

    return parsedUserProfile;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function saveCachedUserProfile(userProfile: UserProfile) {
  try {
    window.localStorage.setItem(
      CACHED_USER_PROFILE_KEY,
      JSON.stringify(userProfile)
    );
  } catch (error) {
    console.error(error);
  }
}

function clearCachedUserProfile() {
  try {
    window.localStorage.removeItem(CACHED_USER_PROFILE_KEY);
  } catch (error) {
    console.error(error);
  }
}

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
          const cachedUserProfile = loadCachedUserProfile();

          if (!navigator.onLine && cachedUserProfile) {
            setUserProfile(cachedUserProfile);
            setSessionMessage(
              "Offline mode: using the last saved account on this device."
            );
            return;
          }

          setUserProfile(null);
          clearCachedUserProfile();
          return;
        }

        try {
          const userSnapshot = await getDoc(doc(db, "users", firebaseUser.uid));

          if (!userSnapshot.exists()) {
            if (!navigator.onLine) {
              const cachedUserProfile = loadCachedUserProfile();

              if (cachedUserProfile?.uid === firebaseUser.uid) {
                setUserProfile(cachedUserProfile);
                setSessionMessage(
                  "Offline mode: using saved account details until internet returns."
                );
                return;
              }
            }

            await signOut(auth);
            setUserProfile(null);
            clearCachedUserProfile();
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
            clearCachedUserProfile();
            setSessionMessage("This account is inactive. Please contact the owner.");
            return;
          }

          const restoredUserProfile: UserProfile = {
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
          };

          setUserProfile(restoredUserProfile);
          saveCachedUserProfile(restoredUserProfile);
        } catch (firestoreError) {
          console.error(firestoreError);

          const cachedUserProfile = loadCachedUserProfile();

          if (!navigator.onLine && cachedUserProfile?.uid === firebaseUser.uid) {
            setUserProfile(cachedUserProfile);
            setSessionMessage(
              "Offline mode: using saved account details until internet returns."
            );
            return;
          }

          setUserProfile(null);
          setSessionMessage("Unable to restore your session. Please log in again.");
        }
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

  function handleLoginSuccess(nextUserProfile: UserProfile) {
    setUserProfile(nextUserProfile);
    saveCachedUserProfile(nextUserProfile);
  }

  function handleLogout() {
    clearCachedUserProfile();
    setUserProfile(null);
  }

  if (isCheckingSession) {
    return (
      <main className="app-loading-screen">
        <section className="app-loading-card">
          <img
            className="app-loading-logo"
            src="/double-d-brews-logo.png"
            alt="Double D'Brews logo"
          />

          <h1>Double D&apos;Brews</h1>
          <p>Checking your session...</p>
        </section>
      </main>
    );
  }

  if (userProfile) {
    return <DashboardPage userProfile={userProfile} onLogout={handleLogout} />;
  }

  return (
    <>
      {sessionMessage && (
        <div className="app-session-message">{sessionMessage}</div>
      )}

      <LoginPage onLoginSuccess={handleLoginSuccess} />
    </>
  );
}

export default App;