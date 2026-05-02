import { useState } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import logo from "../../assets/double-d-brews-logo.png";
import "./LoginPage.css";
import type { UserProfile } from "../../types/UserProfile";

type LoginPageProps = {
  onLoginSuccess: (userProfile: UserProfile) => void;
};

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("clarkdesepida0154@gmail.com");
  const [password, setPassword] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function showToast(message: string) {
    setToastMessage(message);

    window.setTimeout(() => {
      setToastMessage("");
    }, 3000);
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        showToast("Login worked, but no user profile was found.");
        return;
      }

      const userData = userDoc.data();

      if (userData.isActive === false) {
        showToast("This account is disabled. Please contact the owner.");
        return;
      }

      const userProfile: UserProfile = {
            uid,
            name: userData.name || "User",
            email: userData.email || credential.user.email || "",
            role: userData.role || "staff",
            isActive: userData.isActive ?? true,
            };

            showToast(`Welcome, ${userProfile.name}!`);

            window.setTimeout(() => {
            onLoginSuccess(userProfile);
        }, 700);
    } catch (error) {
      console.error(error);
      showToast("Login failed. Please check your email and password.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForgotPassword() {
  if (!email) {
    showToast("Enter your email first, then click forgot password.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset email sent. Please check your inbox.");
  } catch (error) {
    console.error(error);
    showToast("Could not send reset email. Check the email address.");
  }
}

  return (
    <main className="login-page">
      {toastMessage && <div className="login-toast">{toastMessage}</div>}

      <section className="login-shell">
        <img src={logo} alt="Double D'Brew logo" className="login-logo" />

        <h1 className="login-title">POS &amp; Inventory System</h1>

        <section className="login-card">
          <form className="login-form" onSubmit={handleLogin}>
            <input
              className="login-input"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />

            <input
              className="login-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />

            <button className="login-button" type="submit" disabled={isLoading}>
              {isLoading ? "Logging In..." : "Log In"}
            </button>

            <button
                className="forgot-password-link"
                type="button"
                onClick={handleForgotPassword}
                >
                Forgot password?
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

export default LoginPage;