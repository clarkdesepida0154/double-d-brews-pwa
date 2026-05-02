import { useState } from "react";
import LoginPage from "./features/auth/LoginPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import type { UserProfile } from "./types/UserProfile";

function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  if (userProfile) {
    return <DashboardPage userProfile={userProfile} />;
  }

  return <LoginPage onLoginSuccess={setUserProfile} />;
}

export default App;