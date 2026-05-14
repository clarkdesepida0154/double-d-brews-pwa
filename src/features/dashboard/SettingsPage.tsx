import { useEffect, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase/config.ts";
import type { UserProfile } from "../../types/UserProfile";
import "./SettingsPage.css";
import { writeActivityLog } from "../../utils/activityLogUtils";

type SettingsPageProps = {
  userRole?: "developer" | "owner" | "staff";
  userProfile: UserProfile;
};

type PrinterPaperSize = "58mm" | "80mm";

type PrinterSettings = {
  paperSize: PrinterPaperSize;
  receiptCopies: number;
  autoPrintAfterSale: boolean;
  printerMode: "browser-preview" | "android-bluetooth";
};

const PRINTER_SETTINGS_KEY = "double-d-brews-printer-settings";

const defaultPrinterSettings: PrinterSettings = {
  paperSize: "58mm",
  receiptCopies: 1,
  autoPrintAfterSale: false,
  printerMode: "browser-preview",
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

function loadSavedPrinterSettings(): PrinterSettings {
  try {
    const savedSettings = window.localStorage.getItem(PRINTER_SETTINGS_KEY);

    if (!savedSettings) {
      return defaultPrinterSettings;
    }

    const parsedSettings = JSON.parse(savedSettings) as Partial<PrinterSettings>;

    return {
      paperSize:
        parsedSettings.paperSize === "80mm" || parsedSettings.paperSize === "58mm"
          ? parsedSettings.paperSize
          : defaultPrinterSettings.paperSize,
      receiptCopies:
        parsedSettings.receiptCopies === 2 ? 2 : defaultPrinterSettings.receiptCopies,
      autoPrintAfterSale: Boolean(parsedSettings.autoPrintAfterSale),
      printerMode:
        parsedSettings.printerMode === "android-bluetooth"
          ? "android-bluetooth"
          : "browser-preview",
    };
  } catch (error) {
    console.error(error);
    return defaultPrinterSettings;
  }
}

function SettingsPage({ userRole = "owner", userProfile }: SettingsPageProps) {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);

  const [accountMessage, setAccountMessage] = useState("");
  const [accountMessageType, setAccountMessageType] = useState<"success" | "error">(
    "success"
  );
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(
    defaultPrinterSettings
  );
  const [printerMessage, setPrinterMessage] = useState("");
  const [printerMessageType, setPrinterMessageType] = useState<"success" | "error">(
    "success"
  );
  const [isTestReceiptVisible, setIsTestReceiptVisible] = useState(false);

  const isStaffMode = userRole === "staff";
  const roleLabel = getSettingsRoleLabel(userRole);

  useEffect(() => {
    setPrinterSettings(loadSavedPrinterSettings());
  }, []);

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

      await writeActivityLog({
        actor: userProfile,
        actionType: "settings.account.password_reset_email_sent",
        targetId: userProfile.uid,
        targetName: userProfile.email,
        description: `Password reset email was sent to ${userProfile.email}.`,
        metadata: {
          email: userProfile.email,
        },
      });

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

  function openPrinterModal() {
    setPrinterSettings(loadSavedPrinterSettings());
    setPrinterMessage("");
    setIsTestReceiptVisible(false);
    setIsPrinterModalOpen(true);
  }

  function closePrinterModal() {
    setIsPrinterModalOpen(false);
    setPrinterMessage("");
    setIsTestReceiptVisible(false);
  }

  function handleSavePrinterSettings() {
    try {
      window.localStorage.setItem(
        PRINTER_SETTINGS_KEY,
        JSON.stringify(printerSettings)
      );

      writeActivityLog({
        actor: userProfile,
        actionType: "settings.printer.updated",
        targetId: userProfile.uid,
        targetName: "Thermal Receipt Printer",
        description: `Printer settings were updated to ${printerSettings.paperSize}, ${printerSettings.receiptCopies} ${
          printerSettings.receiptCopies === 1 ? "copy" : "copies"
        }, auto-print ${
          printerSettings.autoPrintAfterSale ? "enabled" : "disabled"
        }.`,
        metadata: {
          paperSize: printerSettings.paperSize,
          receiptCopies: printerSettings.receiptCopies,
          autoPrintAfterSale: printerSettings.autoPrintAfterSale,
          printerMode: printerSettings.printerMode,
        },
      });

      setPrinterMessageType("success");
      setPrinterMessage("Printer preferences saved successfully on this device.");
    } catch (error) {
      console.error(error);

      setPrinterMessageType("error");
      setPrinterMessage(
        "Unable to save printer preferences on this device. Please try again."
      );
    }
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
              Save receipt printer preferences for this device. Android Bluetooth
              printing will use this setup later during the APK phase.
            </p>
          </div>

          <button
            className="settings-card-button active"
            type="button"
            onClick={openPrinterModal}
          >
            Open Printer Settings
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

      {isPrinterModalOpen && (
        <div className="settings-modal-overlay" onClick={closePrinterModal}>
          <div
            className="settings-modal printer-settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <p className="settings-kicker">Printer Setup</p>
                <h3>Thermal Receipt Printer</h3>
                <p>
                  Set receipt paper and print behavior for this device. Bluetooth
                  connection will be added during the Android APK phase.
                </p>
              </div>

              <button
                className="settings-modal-close"
                type="button"
                onClick={closePrinterModal}
                aria-label="Close printer settings"
              >
                ×
              </button>
            </div>

            <section className="printer-settings-grid">
              <label className="printer-setting-field">
                <span>Receipt Paper Size</span>
                <select
                  value={printerSettings.paperSize}
                  onChange={(event) =>
                    setPrinterSettings((currentSettings) => ({
                      ...currentSettings,
                      paperSize: event.target.value as PrinterPaperSize,
                    }))
                  }
                >
                  <option value="58mm">58mm Thermal Paper</option>
                  <option value="80mm">80mm Thermal Paper</option>
                </select>
              </label>

              <label className="printer-setting-field">
                <span>Receipt Copies</span>
                <select
                  value={printerSettings.receiptCopies}
                  onChange={(event) =>
                    setPrinterSettings((currentSettings) => ({
                      ...currentSettings,
                      receiptCopies: Number(event.target.value),
                    }))
                  }
                >
                  <option value={1}>1 Copy</option>
                  <option value={2}>2 Copies</option>
                </select>
              </label>

              <label className="printer-toggle-card">
                <input
                  type="checkbox"
                  checked={printerSettings.autoPrintAfterSale}
                  onChange={(event) =>
                    setPrinterSettings((currentSettings) => ({
                      ...currentSettings,
                      autoPrintAfterSale: event.target.checked,
                    }))
                  }
                />

                <span>
                  <strong>Auto-print after sale</strong>
                  <small>
                    After POS is connected to printer settings, completed sales can
                    automatically trigger receipt printing.
                  </small>
                </span>
              </label>

              <div className="printer-mode-card">
                <span>Printer Mode</span>
                <strong>
                  {printerSettings.printerMode === "browser-preview"
                    ? "Browser Preview"
                    : "Android Bluetooth"}
                </strong>
                <p>
                  Browser Preview is active during development. Android Bluetooth
                  mode will be enabled after Capacitor APK setup and real printer
                  testing.
                </p>
              </div>
            </section>

            <section className="printer-apk-note">
              <strong>APK-ready plan</strong>
              <p>
                For the Android app, the printer should use native ESC/POS Bluetooth
                printing. That will print only the receipt content, feed a small
                ending space, then stop for tearing or cutting.
              </p>
            </section>

            {printerMessage && (
              <p className={`settings-account-message ${printerMessageType}`}>
                {printerMessage}
              </p>
            )}

            {isTestReceiptVisible && (
              <section className="printer-test-receipt-card">
                <div className="printer-test-receipt">
                  <h4>DOUBLE D&apos;BREWS</h4>
                  <p>Printer Test Receipt</p>
                  <div className="printer-test-line"></div>
                  <p>Paper: {printerSettings.paperSize}</p>
                  <p>Copies: {printerSettings.receiptCopies}</p>
                  <p>
                    Auto Print:{" "}
                    {printerSettings.autoPrintAfterSale ? "Enabled" : "Disabled"}
                  </p>
                  <div className="printer-test-line"></div>
                  <strong>Printer settings are ready.</strong>
                  <p>Please test real Bluetooth printing during APK setup.</p>
                </div>
              </section>
            )}

            <div className="settings-modal-actions">
              <button
                className="settings-primary-button"
                type="button"
                onClick={handleSavePrinterSettings}
              >
                Save Printer Settings
              </button>

              <button
                className="settings-secondary-button"
                type="button"
                onClick={() => setIsTestReceiptVisible((isVisible) => !isVisible)}
              >
                {isTestReceiptVisible ? "Hide Test Receipt" : "Show Test Receipt"}
              </button>

              <button
                className="settings-secondary-button"
                type="button"
                onClick={closePrinterModal}
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