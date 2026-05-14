import { useEffect, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase/config";
import type { UserProfile } from "../../types/UserProfile";
import { writeActivityLog } from "../../utils/activityLogUtils";
import "./SettingsPage.css";

type SettingsPageProps = {
  userRole?: "developer" | "owner" | "staff";
  userProfile?: UserProfile;
};

type PrinterPaperSize = "58mm" | "80mm";

type PrinterSettings = {
  paperSize: PrinterPaperSize;
  receiptCopies: number;
  autoPrintAfterSale: boolean;
  printerMode: "browser-preview" | "android-bluetooth";
};

type StoreReceiptSettings = {
  storeName: string;
  receiptSubtitle: string;
  storeInfoLine: string;
  thankYouMessage: string;
  footerNote: string;
};

const PRINTER_SETTINGS_KEY = "double-d-brews-printer-settings";
const STORE_RECEIPT_SETTINGS_KEY = "double-d-brews-store-receipt-settings";

const defaultPrinterSettings: PrinterSettings = {
  paperSize: "58mm",
  receiptCopies: 1,
  autoPrintAfterSale: false,
  printerMode: "browser-preview",
};

const defaultStoreReceiptSettings: StoreReceiptSettings = {
  storeName: "DOUBLE D'BREWS",
  receiptSubtitle: "POS Sales Receipt",
  storeInfoLine: "Thank you for supporting us",
  thankYouMessage: "Thank you for ordering!",
  footerNote: "Please come again.",
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

function loadSavedStoreReceiptSettings(): StoreReceiptSettings {
  try {
    const savedSettings = window.localStorage.getItem(STORE_RECEIPT_SETTINGS_KEY);

    if (!savedSettings) {
      return defaultStoreReceiptSettings;
    }

    const parsedSettings = JSON.parse(savedSettings) as Partial<StoreReceiptSettings>;

    return {
      storeName: parsedSettings.storeName?.trim() || defaultStoreReceiptSettings.storeName,
      receiptSubtitle:
        parsedSettings.receiptSubtitle?.trim() ||
        defaultStoreReceiptSettings.receiptSubtitle,
      storeInfoLine:
        parsedSettings.storeInfoLine?.trim() ||
        defaultStoreReceiptSettings.storeInfoLine,
      thankYouMessage:
        parsedSettings.thankYouMessage?.trim() ||
        defaultStoreReceiptSettings.thankYouMessage,
      footerNote:
        parsedSettings.footerNote?.trim() || defaultStoreReceiptSettings.footerNote,
    };
  } catch (error) {
    console.error(error);
    return defaultStoreReceiptSettings;
  }
}

function notifySettingsChanged() {
  window.dispatchEvent(new Event("double-d-brews-settings-updated"));
}

function SettingsPage({ userRole = "owner", userProfile }: SettingsPageProps) {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);

  const [accountMessage, setAccountMessage] = useState("");
  const [accountMessageType, setAccountMessageType] = useState<"success" | "error">(
    "success"
  );
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  const [storeSettings, setStoreSettings] = useState<StoreReceiptSettings>(
    defaultStoreReceiptSettings
  );
  const [storeMessage, setStoreMessage] = useState("");
  const [storeMessageType, setStoreMessageType] = useState<"success" | "error">(
    "success"
  );

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

  const accountEmail = userProfile?.email || auth.currentUser?.email || "";
  const accountName =
    userProfile?.name || auth.currentUser?.displayName || accountEmail || "Current User";

  useEffect(() => {
    setPrinterSettings(loadSavedPrinterSettings());
    setStoreSettings(loadSavedStoreReceiptSettings());
  }, []);

  async function logSettingsAction(input: {
    actionType: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
  }) {
    if (!userProfile) {
      return;
    }

    await writeActivityLog({
      actor: userProfile,
      actionType: input.actionType,
      targetId: userProfile.uid,
      targetName: input.targetName,
      description: input.description,
      metadata: input.metadata,
    });
  }

  async function handleSendPasswordResetEmail() {
    setAccountMessage("");

    if (!accountEmail) {
      setAccountMessageType("error");
      setAccountMessage("No email address was found for this account.");
      return;
    }

    setIsSendingResetEmail(true);

    try {
      await sendPasswordResetEmail(auth, accountEmail);

      await logSettingsAction({
        actionType: "settings.account.password_reset_email_sent",
        targetName: accountEmail,
        description: `Password reset email was sent to ${accountEmail}.`,
        metadata: {
          email: accountEmail,
          actionSource: "Settings",
        },
      });

      setAccountMessageType("success");
      setAccountMessage(
        `Password reset email sent to ${accountEmail}. Please check the inbox or spam folder.`
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

  function openStoreModal() {
    setStoreSettings(loadSavedStoreReceiptSettings());
    setStoreMessage("");
    setIsStoreModalOpen(true);
  }

  function openPrinterModal() {
    setPrinterSettings(loadSavedPrinterSettings());
    setPrinterMessage("");
    setIsTestReceiptVisible(false);
    setIsPrinterModalOpen(true);
  }

  async function handleSaveStoreSettings() {
    const cleanedSettings: StoreReceiptSettings = {
      storeName: storeSettings.storeName.trim() || defaultStoreReceiptSettings.storeName,
      receiptSubtitle:
        storeSettings.receiptSubtitle.trim() ||
        defaultStoreReceiptSettings.receiptSubtitle,
      storeInfoLine:
        storeSettings.storeInfoLine.trim() || defaultStoreReceiptSettings.storeInfoLine,
      thankYouMessage:
        storeSettings.thankYouMessage.trim() ||
        defaultStoreReceiptSettings.thankYouMessage,
      footerNote: storeSettings.footerNote.trim() || defaultStoreReceiptSettings.footerNote,
    };

    try {
      window.localStorage.setItem(
        STORE_RECEIPT_SETTINGS_KEY,
        JSON.stringify(cleanedSettings)
      );

      setStoreSettings(cleanedSettings);
      notifySettingsChanged();

      await logSettingsAction({
        actionType: "settings.store_receipt.updated",
        targetName: "Store Receipt Details",
        description: "Store receipt details were updated.",
        metadata: {
          storeName: cleanedSettings.storeName,
          receiptSubtitle: cleanedSettings.receiptSubtitle,
          storeInfoLine: cleanedSettings.storeInfoLine,
          thankYouMessage: cleanedSettings.thankYouMessage,
          footerNote: cleanedSettings.footerNote,
          actionSource: "Settings",
        },
      });

      setStoreMessageType("success");
      setStoreMessage("Store receipt details saved successfully.");
    } catch (error) {
      console.error(error);
      setStoreMessageType("error");
      setStoreMessage("Unable to save store receipt details. Please try again.");
    }
  }

  async function handleSavePrinterSettings() {
    try {
      window.localStorage.setItem(
        PRINTER_SETTINGS_KEY,
        JSON.stringify(printerSettings)
      );

      notifySettingsChanged();

      await logSettingsAction({
        actionType: "settings.printer.updated",
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
          actionSource: "Settings",
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
              ? "Manage your account and receipt printer setup for daily operations."
              : "Manage account access, receipt details, printer behavior, and system readiness."}
          </p>
        </div>

        <span className="settings-role-pill">{roleLabel}</span>
      </header>

      {isStaffMode && (
        <section className="settings-access-note">
          <strong>Limited staff settings</strong>
          <p>
            Staff operators can access account and printer settings. Store and
            system controls are reserved for owners.
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
              View account details and send a password reset email to the account email.
            </p>
          </div>

          <button
            className="settings-card-button active"
            type="button"
            onClick={() => {
              setAccountMessage("");
              setIsAccountModalOpen(true);
            }}
          >
            Open Account Settings
          </button>
        </article>

        <article className="settings-card">
          <div className="settings-card-icon">🖨️</div>

          <div>
            <p className="settings-card-label">Printer</p>
            <h3>Receipt Printer</h3>
            <p>
              Save paper size, receipt copies, auto-print, and Android printer mode.
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
                <h3>Store Receipt Details</h3>
                <p>
                  Set the store name, receipt subtitle, contact line, and footer message.
                </p>
              </div>

              <button
                className="settings-card-button active"
                type="button"
                onClick={openStoreModal}
              >
                Open Store Settings
              </button>
            </article>

            <article className="settings-card">
              <div className="settings-card-icon">⚙️</div>

              <div>
                <p className="settings-card-label">System</p>
                <h3>System Readiness</h3>
                <p>
                  Check what is ready for Firebase Hosting, APK testing, and operation.
                </p>
              </div>

              <button
                className="settings-card-button active"
                type="button"
                onClick={() => setIsSystemModalOpen(true)}
              >
                View Readiness
              </button>
            </article>
          </>
        )}
      </section>

      {isAccountModalOpen && (
        <div
          className="settings-modal-overlay"
          onClick={() => setIsAccountModalOpen(false)}
        >
          <section
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <p className="settings-kicker">My Account</p>
                <h3>Account Settings</h3>
                <p>View your account information and send a password reset email.</p>
              </div>

              <button
                className="settings-modal-close"
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="settings-account-details">
              <div>
                <span>Name</span>
                <strong>{accountName}</strong>
              </div>

              <div>
                <span>Email</span>
                <strong>{accountEmail || "No email saved"}</strong>
              </div>

              <div>
                <span>Role</span>
                <strong>{roleLabel}</strong>
              </div>

              <div>
                <span>Account Status</span>
                <strong>{userProfile?.isActive === false ? "Inactive" : "Active"}</strong>
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
                {isSendingResetEmail ? "Sending..." : "Send Password Reset Email"}
              </button>

              <button
                className="settings-secondary-button"
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {isStoreModalOpen && (
        <div
          className="settings-modal-overlay"
          onClick={() => setIsStoreModalOpen(false)}
        >
          <section
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <p className="settings-kicker">Store Receipt Details</p>
                <h3>Store Settings</h3>
                <p>These details will be used on printed receipts.</p>
              </div>

              <button
                className="settings-modal-close"
                type="button"
                onClick={() => setIsStoreModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="settings-form-grid">
              <label>
                <span>Store name</span>
                <input
                  value={storeSettings.storeName}
                  onChange={(event) =>
                    setStoreSettings((currentSettings) => ({
                      ...currentSettings,
                      storeName: event.target.value,
                    }))
                  }
                  placeholder="DOUBLE D'BREWS"
                />
              </label>

              <label>
                <span>Receipt subtitle</span>
                <input
                  value={storeSettings.receiptSubtitle}
                  onChange={(event) =>
                    setStoreSettings((currentSettings) => ({
                      ...currentSettings,
                      receiptSubtitle: event.target.value,
                    }))
                  }
                  placeholder="POS Sales Receipt"
                />
              </label>

              <label>
                <span>Store info / contact line</span>
                <input
                  value={storeSettings.storeInfoLine}
                  onChange={(event) =>
                    setStoreSettings((currentSettings) => ({
                      ...currentSettings,
                      storeInfoLine: event.target.value,
                    }))
                  }
                  placeholder="Address, contact number, or short note"
                />
              </label>

              <label>
                <span>Thank-you message</span>
                <input
                  value={storeSettings.thankYouMessage}
                  onChange={(event) =>
                    setStoreSettings((currentSettings) => ({
                      ...currentSettings,
                      thankYouMessage: event.target.value,
                    }))
                  }
                  placeholder="Thank you for ordering!"
                />
              </label>

              <label>
                <span>Footer note</span>
                <input
                  value={storeSettings.footerNote}
                  onChange={(event) =>
                    setStoreSettings((currentSettings) => ({
                      ...currentSettings,
                      footerNote: event.target.value,
                    }))
                  }
                  placeholder="Please come again."
                />
              </label>
            </div>

            <section className="settings-preview-card">
              <span>Receipt Preview</span>
              <strong>{storeSettings.storeName || defaultStoreReceiptSettings.storeName}</strong>
              <p>{storeSettings.receiptSubtitle || defaultStoreReceiptSettings.receiptSubtitle}</p>
              <p>{storeSettings.storeInfoLine || defaultStoreReceiptSettings.storeInfoLine}</p>
              <div className="settings-preview-line" />
              <p>{storeSettings.thankYouMessage || defaultStoreReceiptSettings.thankYouMessage}</p>
              <p>{storeSettings.footerNote || defaultStoreReceiptSettings.footerNote}</p>
            </section>

            {storeMessage && (
              <p className={`settings-account-message ${storeMessageType}`}>
                {storeMessage}
              </p>
            )}

            <div className="settings-modal-actions">
              <button
                className="settings-primary-button"
                type="button"
                onClick={handleSaveStoreSettings}
              >
                Save Store Settings
              </button>

              <button
                className="settings-secondary-button"
                type="button"
                onClick={() => setIsStoreModalOpen(false)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {isPrinterModalOpen && (
        <div
          className="settings-modal-overlay"
          onClick={() => setIsPrinterModalOpen(false)}
        >
          <section
            className="settings-modal printer-settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <p className="settings-kicker">Printer Setup</p>
                <h3>Receipt Printer Settings</h3>
                <p>
                  Save receipt paper and print behavior for this device. Real Bluetooth
                  printing will still need APK + printer testing.
                </p>
              </div>

              <button
                className="settings-modal-close"
                type="button"
                onClick={() => setIsPrinterModalOpen(false)}
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

              <label className="printer-setting-field">
                <span>Printer Mode</span>
                <select
                  value={printerSettings.printerMode}
                  onChange={(event) =>
                    setPrinterSettings((currentSettings) => ({
                      ...currentSettings,
                      printerMode: event.target.value as PrinterSettings["printerMode"],
                    }))
                  }
                >
                  <option value="browser-preview">Browser Print Preview</option>
                  <option value="android-bluetooth">Android Bluetooth Ready</option>
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
                    After completing a sale, the receipt print flow will start automatically.
                  </small>
                </span>
              </label>
            </section>

            <section className="printer-apk-note">
              <strong>Mobile thermal printer note</strong>
              <p>
                Browser print preview can work on web/PWA. Direct Bluetooth thermal
                printing on APK needs real Android testing with the actual printer.
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
                  <strong>{storeSettings.storeName}</strong>
                  <p>{storeSettings.receiptSubtitle}</p>
                  <div className="printer-test-line" />
                  <p>Paper: {printerSettings.paperSize}</p>
                  <p>Copies: {printerSettings.receiptCopies}</p>
                  <p>
                    Auto-print:{" "}
                    {printerSettings.autoPrintAfterSale ? "Enabled" : "Disabled"}
                  </p>
                  <p>
                    Mode:{" "}
                    {printerSettings.printerMode === "android-bluetooth"
                      ? "Android Bluetooth Ready"
                      : "Browser Print Preview"}
                  </p>
                  <div className="printer-test-line" />
                  <strong>Printer settings are ready.</strong>
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
                onClick={() => setIsPrinterModalOpen(false)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {isSystemModalOpen && (
        <div
          className="settings-modal-overlay"
          onClick={() => setIsSystemModalOpen(false)}
        >
          <section
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <p className="settings-kicker">System Readiness</p>
                <h3>Deployment Checklist</h3>
                <p>This keeps the owner aware of what is ready before operation.</p>
              </div>

              <button
                className="settings-modal-close"
                type="button"
                onClick={() => setIsSystemModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="settings-readiness-list">
              <article>
                <strong>Firebase Hosting</strong>
                <span>Ready after final build test</span>
              </article>

              <article>
                <strong>User Management</strong>
                <span>Owner/Staff creation works on the no-cost setup</span>
              </article>

              <article>
                <strong>Receipt Printing</strong>
                <span>Browser print ready; APK Bluetooth needs real printer test</span>
              </article>

              <article>
                <strong>Capacitor APK</strong>
                <span>Prepare after web deployment works</span>
              </article>
            </div>

            <div className="settings-modal-actions">
              <button
                className="settings-secondary-button"
                type="button"
                onClick={() => setIsSystemModalOpen(false)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default SettingsPage;