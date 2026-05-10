import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase/config";
import type { UserProfile } from "../../types/UserProfile";
import "./SettingsPage.css";

type SettingsPageProps = {
  userRole?: "developer" | "owner" | "staff";
  userProfile: UserProfile;
};

function getSettingsRoleLabel(userRole: SettingsPageProps["userRole"]) {
  if (userRole === "developer") {
    return "Developer";
  }

  if (userRole === "staff") {
    return "Staff Operator";
  }

  return "Owner";
}

function SettingsPage({ userRole = "owner", userProfile }: SettingsPageProps) {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountMessageType, setAccountMessageType] = useState<"success" | "error">(
    "success"
  );
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  const isStaffMode = userRole === "staff";
  const roleLabel = getSettingsRoleLabel(userRole);

  async function handleSendPasswordResetEmail() {
    setAccountMessage("");

    if (!userProfile.email) {
      setAccountMessageType("error");
      setAccountMessage("No email address was found for this account.");
      return;
    }

    setIsSendingResetEmail(true);

    try {
      await sendPasswordResetEmail(auth, userProfile.email);

      setAccountMessageType("success");
      setAccountMessage(
        `Password reset email sent to ${userProfile.email}. Please check the inbox or spam folder.`
      );
    } catch (error) {
      console.error(error);

      setAccountMessageType("error");
      setAccountMessage(
        "Unable to send the password reset email right now. Please try again."
      );
    } finally {
      setIsSendingResetEmail(false);
    }
  }

  function closeAccountModal() {
    setIsAccountModalOpen(false);
    setAccountMessage("");
  }

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <p className="settings-kicker">System Settings</p>
          <h2>Settings</h2>
          <p>
            {isStaffMode
              ? "Manage your account and receipt printer connection for daily operations."
              : "Manage account, store, receipt, printer, and system preferences."}
          </p>
        </div>

        <span className="settings-role-pill">{roleLabel}</span>
      </header>

      {isStaffMode && (
        <section className="settings-access-note">
          <strong>Limited staff settings</strong>
          <p>
            Staff operators can only access account and printer settings. Store,
            receipt, and system controls are reserved for owners and developers.
          </p>
        </section>
      )}

      <section className="settings-grid">
        <article className="settings-card">
          <div className="settings-card-icon">👤</div>

          <div>
            <p className="settings-card-label">My Account</p>
            <h3>Account Settings</h3>
            <p>
              View profile information and send a secure Firebase password reset
              email to the account email address.
            </p>
          </div>

          <button
            className="settings-card-button active"
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
          >
            Open Account Settings
          </button>
        </article>

        <article className="settings-card">
          <div className="settings-card-icon">🖨️</div>

          <div>
            <p className="settings-card-label">Printer</p>
            <h3>Thermal Receipt Printer</h3>
            <p>
              Connect and manage the Bluetooth thermal receipt printer used by
              the POS terminal.
            </p>
          </div>

          <button className="settings-card-button" type="button" disabled>
            Coming Soon
          </button>
        </article>

        {!isStaffMode && (
          <>
            <article className="settings-card">
              <div className="settings-card-icon">🏪</div>

              <div>
                <p className="settings-card-label">Store</p>
                <h3>Store Settings</h3>
                <p>
                  Manage store identity, branch details, and business-level
                  configuration.
                </p>
              </div>

              <button className="settings-card-button" type="button" disabled>
                Coming Soon
              </button>
            </article>

            <article className="settings-card">
              <div className="settings-card-icon">🧾</div>

              <div>
                <p className="settings-card-label">Receipts</p>
                <h3>Receipt Settings</h3>
                <p>
                  Configure receipt header, footer, business details, and print
                  formatting.
                </p>
              </div>

              <button className="settings-card-button" type="button" disabled>
                Coming Soon
              </button>
            </article>

            <article className="settings-card">
              <div className="settings-card-icon">⚙️</div>

              <div>
                <p className="settings-card-label">System</p>
                <h3>System Preferences</h3>
                <p>
                  Manage owner-level preferences, security behavior, and system
                  controls.
                </p>
              </div>

              <button className="settings-card-button" type="button" disabled>
                Coming Soon
              </button>
            </article>
          </>
        )}
      </section>

      {isAccountModalOpen && (
        <div className="settings-modal-overlay" onClick={closeAccountModal}>
          <div
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <p className="settings-kicker">My Account</p>
                <h3>Account Settings</h3>
                <p>Review the current signed-in account details.</p>
              </div>

              <button
                className="settings-modal-close"
                type="button"
                onClick={closeAccountModal}
                aria-label="Close account settings"
              >
                ×
              </button>
            </div>

            <div className="settings-account-details">
              <div>
                <span>Name</span>
                <strong>{userProfile.name || "No name saved"}</strong>
              </div>

              <div>
                <span>Email</span>
                <strong>{userProfile.email || "No email saved"}</strong>
              </div>

              <div>
                <span>Role</span>
                <strong>{roleLabel}</strong>
              </div>

              <div>
                <span>Account Status</span>
                <strong>{userProfile.isActive ? "Active" : "Inactive"}</strong>
              </div>
            </div>

            {accountMessage && (
              <p className={`settings-account-message ${accountMessageType}`}>
                {accountMessage}
              </p>
            )}

            <div className="settings-modal-actions">
              <button
                className="settings-primary-button"
                type="button"
                onClick={handleSendPasswordResetEmail}
                disabled={isSendingResetEmail}
              >
                {isSendingResetEmail
                  ? "Sending..."
                  : "Send Password Reset Email"}
              </button>

              <button
                className="settings-secondary-button"
                type="button"
                onClick={closeAccountModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SettingsPage;