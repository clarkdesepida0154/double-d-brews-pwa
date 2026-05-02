import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";

function LoginPage() {
  const [email, setEmail] = useState("clarkdesepida0154@gmail.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Logging in...");

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        setMessage("Login worked, but no user profile was found in Firestore.");
        return;
      }

      const userData = userDoc.data();
      setMessage(`Login success. Role: ${userData.role}`);
    } catch (error) {
      console.error(error);
      setMessage("Login failed. Check your email and password.");
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", fontFamily: "Arial" }}>
      <h1>Double D&apos;Brews POS</h1>
      <p>Owner / Staff Login</p>

      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            style={{ width: "100%", padding: 10, marginTop: 4 }}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input
            style={{ width: "100%", padding: 10, marginTop: 4 }}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
          />
        </div>

        <button type="submit" style={{ padding: "10px 16px" }}>
          Login
        </button>
      </form>

      {message && <p style={{ marginTop: 16 }}>{message}</p>}
    </main>
  );
}

export default LoginPage;