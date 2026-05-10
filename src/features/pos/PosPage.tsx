import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import "./PosPage.css";

type PosProductSize = {
  id: string;
  productId: string;
  productName: string;
  category: string;
  sizeName: string;
  price: number;
};

type CartItem = {
  sizeId: string;
  productId: string;
  productName: string;
  sizeName: string;
  price: number;
  quantity: number;
  itemNote?: string;
};

type PosRecipeIngredient = {
  ingredientId: string;
  ingredientName: string;
  requiredAmount: number;
  usageUnit: string;
  costPerUsageUnit: number;
};

type CompletedSaleReceipt = {
  saleNumber: string;
  receiptDateText: string;
  totalAmount: number;
  totalItems: number;
  paymentMethod: string;
  cashReceived?: number;
  changeAmount?: number;
  orderNote?: string;
  items: CartItem[];
};

type PosTab = "new-order" | "sales-history";
type ToastType = "success" | "error" | "info";

type SaleHistoryItem = {
  id: string;
  saleNumber: string;
  totalAmount: number;
  totalItems: number;
  paymentMethod: string;
  cashReceived?: number | null;
  changeAmount?: number | null;
  orderNote?: string;
  status: string;
  voidReason?: string;
  voidNote?: string;
  voidedAtText?: string;
  items: CartItem[];
  createdAtText?: string;
  createdAt?: {
    toDate?: () => Date;
  };
};

type VoidReason =
  | "Customer cancelled after checkout"
  | "Wrong product entered"
  | "Wrong size entered"
  | "Wrong payment method"
  | "Duplicate sale"
  | "Cashier mistake"
  | "Test sale"
  | "Other";

const VOID_REASONS: VoidReason[] = [
  "Customer cancelled after checkout",
  "Wrong product entered",
  "Wrong size entered",
  "Wrong payment method",
  "Duplicate sale",
  "Cashier mistake",
  "Test sale",
  "Other",
];

function PosPage() {
  const [sellableSizes, setSellableSizes] = useState<PosProductSize[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<ToastType>("info");
  const toastTimeoutRef = useRef<number | null>(null);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [completedSaleReceipt, setCompletedSaleReceipt] =
  useState<CompletedSaleReceipt | null>(null);
  const [isCheckoutConfirmOpen, setIsCheckoutConfirmOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [cashReceived, setCashReceived] = useState("");
  
  const [activePosTab, setActivePosTab] = useState<PosTab>("new-order");
  const [salesHistory, setSalesHistory] = useState<SaleHistoryItem[]>([]);
  const [isLoadingSalesHistory, setIsLoadingSalesHistory] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleHistoryItem | null>(null);
  const [isClearCartConfirmOpen, setIsClearCartConfirmOpen] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [editCartSizeId, setEditCartSizeId] = useState("");
  const [editCartQuantity, setEditCartQuantity] = useState("1");
  const [editCartItemNote, setEditCartItemNote] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [saleToReprint, setSaleToReprint] = useState<SaleHistoryItem | null>(null);
  const [printableReceipt, setPrintableReceipt] =
  useState<CompletedSaleReceipt | null>(null);

  const [saleToVoid, setSaleToVoid] = useState<SaleHistoryItem | null>(null);
  const [voidReason, setVoidReason] = useState<VoidReason | "">("")
  const [voidNote, setVoidNote] = useState("");
  const [isVoidingSale, setIsVoidingSale] = useState(false);

const loadSellableProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setMessage("");

    try {
      const activeProductsQuery = query(
        collection(db, "products"),
        where("isActive", "==", true)
      );

      const activeSizesQuery = query(
        collection(db, "productSizes"),
        where("isActive", "==", true)
      );

      const [productsSnapshot, sizesSnapshot, recipesSnapshot] =
        await Promise.all([
          getDocs(activeProductsQuery),
          getDocs(activeSizesQuery),
          getDocs(collection(db, "recipes")),
        ]);

      const activeProducts = new Map<
        string,
        { name: string; category: string }
      >();

      productsSnapshot.docs.forEach((productDoc) => {
        const data = productDoc.data();

        if (data.isAvailable !== false) {
          activeProducts.set(productDoc.id, {
            name: data.name,
            category: data.category,
          });
        }
      });

      const completeRecipeSizeIds = new Set(
        recipesSnapshot.docs
          .filter((recipeDoc) => {
            const recipeData = recipeDoc.data();

            return (
              recipeData.isComplete === true &&
              Array.isArray(recipeData.ingredients) &&
              recipeData.ingredients.length > 0
            );
          })
          .map((recipeDoc) => recipeDoc.id)
      );

      const loadedSellableSizes: PosProductSize[] = sizesSnapshot.docs
        .map((sizeDoc) => {
          const sizeData = sizeDoc.data();
          const product = activeProducts.get(sizeData.productId);

          if (!product) {
            return null;
          }

          if (sizeData.isAvailable === false) {
            return null;
          }

          if (!completeRecipeSizeIds.has(sizeDoc.id)) {
            return null;
          }

          return {
            id: sizeDoc.id,
            productId: sizeData.productId,
            productName: product.name,
            category: product.category,
            sizeName: sizeData.sizeName,
            price: sizeData.price,
          };
        })
        .filter((size): size is PosProductSize => size !== null)
        .sort((a, b) =>
          `${a.category} ${a.productName} ${a.price}`.localeCompare(
            `${b.category} ${b.productName} ${b.price}`
          )
        );

      setSellableSizes(loadedSellableSizes);
    } catch (error) {
      console.error(error);
      setMessage("Failed to load POS products.");
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);


  const loadSalesHistory = useCallback(async () => {
  setIsLoadingSalesHistory(true);
  setMessage("");

  try {
    const salesQuery = query(
      collection(db, "sales"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    const querySnapshot = await getDocs(salesQuery);

    const loadedSales: SaleHistoryItem[] = querySnapshot.docs.map(
      (docSnapshot) => {
        const data = docSnapshot.data();

        return {
          id: docSnapshot.id,
          saleNumber: data.saleNumber,
          totalAmount: data.totalAmount || 0,
          totalItems: data.totalItems || 0,
          paymentMethod: data.paymentMethod || "Unknown",
          cashReceived: data.cashReceived,
          changeAmount: data.changeAmount,
          orderNote: data.orderNote || "",
          status: data.status || "completed",
          voidReason: data.voidReason || "",
          voidNote: data.voidNote || "",
          voidedAtText: data.voidedAtText || "",
          items: data.items || [],
          createdAtText: data.createdAtText || "",
          createdAt: data.createdAt,
        };
      }
    );
    setSalesHistory(loadedSales);
  } catch (error) {
    console.error(error);
    setMessage("Failed to load sales history.");
  } finally {
    setIsLoadingSalesHistory(false);
  }
}, []);

  useEffect(() => {
    loadSellableProducts();
    loadSalesHistory();
  }, [loadSellableProducts, loadSalesHistory]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const categories = useMemo(() => {
    const categorySet = new Set(sellableSizes.map((size) => size.category));
    return ["All", ...Array.from(categorySet).sort()];
  }, [sellableSizes]);

  const filteredSellableSizes = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return sellableSizes.filter((size) => {
      const matchesCategory =
        selectedCategory === "All" || size.category === selectedCategory;

      const matchesSearch =
        !search ||
        size.productName.toLowerCase().includes(search) ||
        size.sizeName.toLowerCase().includes(search) ||
        size.category.toLowerCase().includes(search);

      return matchesCategory && matchesSearch;
    });
  }, [sellableSizes, selectedCategory, searchTerm]);

  const groupedProducts = useMemo(() => {
    return filteredSellableSizes.reduce<Record<string, PosProductSize[]>>(
      (groups, size) => {
        const key = `${size.productId}-${size.productName}`;

        if (!groups[key]) {
          groups[key] = [];
        }

        groups[key].push(size);

        return groups;
      },
      {}
    );
  }, [filteredSellableSizes]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      return total + item.price * item.quantity;
    }, 0);
  }, [cartItems]);

  const cartQuantity = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const cashReceivedAmount = useMemo(() => {
  return Number(cashReceived);
}, [cashReceived]);

const changeAmount = useMemo(() => {
  if (paymentMethod !== "Cash") {
    return 0;
  }

  return cashReceivedAmount - cartTotal;
}, [cashReceivedAmount, cartTotal, paymentMethod]);

const canConfirmSale = useMemo(() => {
  if (cartItems.length === 0 || isCompletingSale) {
    return false;
  }

  if (paymentMethod !== "Cash") {
    return true;
  }

  return cashReceivedAmount >= cartTotal;
}, [cartItems.length, isCompletingSale, paymentMethod, cashReceivedAmount, cartTotal]);

const availableSizesForEditing = useMemo(() => {
  if (!editingCartItem) {
    return [];
  }

  return sellableSizes
    .filter((size) => size.productId === editingCartItem.productId)
    .sort((a, b) => a.price - b.price);
}, [editingCartItem, sellableSizes]);

const receiptForPrinting = printableReceipt || completedSaleReceipt;

  function addToCart(size: PosProductSize) {
    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.sizeId === size.id);

      if (existingItem) {
        return currentItems.map((item) =>
          item.sizeId === size.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...currentItems,
        {
          sizeId: size.id,
          productId: size.productId,
          productName: size.productName,
          sizeName: size.sizeName,
          price: size.price,
          quantity: 1,
        },
      ];
    });

    setMessage("");
  }

  function decreaseCartItem(sizeId: string) {
    setCartItems((currentItems) =>
      currentItems
        .map((item) =>
          item.sizeId === sizeId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function increaseCartItem(sizeId: string) {
    setCartItems((currentItems) =>
      currentItems.map((item) =>
        item.sizeId === sizeId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }

  function removeCartItem(sizeId: string) {
    setCartItems((currentItems) =>
      currentItems.filter((item) => item.sizeId !== sizeId)
    );
  }

  function requestClearCart() {
  if (cartItems.length === 0) {
    return;
  }

  setIsClearCartConfirmOpen(true);
  setMessage("");
}

function cancelClearCart() {
  setIsClearCartConfirmOpen(false);
}

function confirmClearCart() {
  setCartItems([]);
  setOrderNote("");
  setIsClearCartConfirmOpen(false);
  setMessage("");
}

function openEditCartItem(item: CartItem) {
  setEditingCartItem(item);
  setEditCartSizeId(item.sizeId);
  setEditCartQuantity(String(item.quantity));
  setEditCartItemNote(item.itemNote || "");
  setMessage("");
}

function closeEditCartItem() {
  setEditingCartItem(null);
  setEditCartSizeId("");
  setEditCartQuantity("1");
  setEditCartItemNote("");
  setMessage("");
}

function saveCartItemChanges(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!editingCartItem) {
    return;
  }

  const quantity = Number(editCartQuantity);
  const selectedSize = sellableSizes.find((size) => size.id === editCartSizeId);

  if (!selectedSize) {
    setMessage("Select a valid size.");
    return;
  }

  if (quantity <= 0) {
    setMessage("Quantity must be at least 1.");
    return;
  }

  const cleanedNote = editCartItemNote.trim();

  setCartItems((currentItems) => {
    const isChangingToExistingLine = currentItems.some(
      (item) =>
        item.sizeId === selectedSize.id &&
        item.sizeId !== editingCartItem.sizeId
    );

    if (isChangingToExistingLine) {
      return currentItems
        .filter((item) => item.sizeId !== editingCartItem.sizeId)
        .map((item) =>
          item.sizeId === selectedSize.id
            ? {
                ...item,
                quantity: item.quantity + quantity,
                itemNote: cleanedNote || item.itemNote,
              }
            : item
        );
    }

    return currentItems.map((item) =>
      item.sizeId === editingCartItem.sizeId
        ? {
            ...item,
            sizeId: selectedSize.id,
            productId: selectedSize.productId,
            productName: selectedSize.productName,
            sizeName: selectedSize.sizeName,
            price: selectedSize.price,
            quantity,
            itemNote: cleanedNote,
          }
        : item
    );
  });

  closeEditCartItem();
}

function removeEditingCartItem() {
  if (!editingCartItem) {
    return;
  }

  removeCartItem(editingCartItem.sizeId);
  closeEditCartItem();
}

  function closeReceiptModal() {
    setCompletedSaleReceipt(null);
    setMessage("");
  }

  function openCheckoutConfirmModal() {
    if (cartItems.length === 0 || isCompletingSale) {
      return;
    }

    setPaymentMethod("Cash");
    setCashReceived("");
    setMessage("");
    setIsCheckoutConfirmOpen(true);
  }

function closeCheckoutConfirmModal() {
  if (isCompletingSale) {
    return;
  }

  setIsCheckoutConfirmOpen(false);
}

function buildReceiptFromSale(sale: SaleHistoryItem): CompletedSaleReceipt {
  return {
    saleNumber: sale.saleNumber,
    receiptDateText: formatSaleDate(sale),
    totalAmount: sale.totalAmount,
    totalItems: sale.totalItems,
    paymentMethod: sale.paymentMethod,
    cashReceived:
      sale.paymentMethod === "Cash" ? Number(sale.cashReceived || 0) : undefined,
    changeAmount:
    sale.paymentMethod === "Cash" ? Number(sale.changeAmount || 0) : undefined,
    orderNote: sale.orderNote || "",
    items: sale.items,
  };
}

function printReceipt() {
  if (!completedSaleReceipt) {
    return;
  }

  setPrintableReceipt(completedSaleReceipt);

  window.setTimeout(() => {
    window.print();
  }, 150);
}

function requestVoidSale(sale: SaleHistoryItem) {
  if (sale.status === "voided") {
    showToast("This sale has already been voided.", "info");
    return;
  }

  setSelectedSale(null);
  setSaleToReprint(null);
  setSaleToVoid(sale);
  setVoidReason("");
  setVoidNote("");
  setMessage("");
}

function cancelVoidSale() {
  if (isVoidingSale) {
    showToast("Please wait. The void transaction is still processing.", "info");
    return;
  }

  setSaleToVoid(null);
  setVoidReason("");
  setVoidNote("");
  setMessage("");
}

async function handleVoidSaleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!saleToVoid || isVoidingSale) {
    return;
  }

  if (!voidReason) {
    showToast("Select a void reason before continuing.", "error");
    return;
  }

  const saleBeingVoided = saleToVoid;
  const selectedVoidReason = voidReason;
  const cleanedVoidNote = voidNote.trim();
  const voidedAtText = formatCurrentReceiptDate();

  setIsVoidingSale(true);

  try {
    const stockMovementQuery = query(
      collection(db, "stockMovements"),
      where("saleId", "==", saleBeingVoided.id)
    );

    const stockMovementSnapshot = await getDocs(stockMovementQuery);

    const saleDeductionMovements = stockMovementSnapshot.docs
      .map((movementDoc) => {
        const data = movementDoc.data();

        return {
          id: movementDoc.id,
          ingredientId: String(data.ingredientId || ""),
          ingredientName: String(data.ingredientName || "Ingredient"),
          movementType: String(data.movementType || ""),
          usageAmountDeducted: Number(data.usageAmountDeducted || 0),
          usageUnit: String(data.usageUnit || ""),
        };
      })
      .filter((movement) => movement.movementType === "sale deduction");

    if (saleDeductionMovements.length === 0) {
      throw new Error(
        "Cannot void this sale because no stock deduction records were found."
      );
    }

    await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, "sales", saleBeingVoided.id);
      const saleSnapshot = await transaction.get(saleRef);

      if (!saleSnapshot.exists()) {
        throw new Error("This sale no longer exists.");
      }

      const saleData = saleSnapshot.data();

      if (saleData.status === "voided") {
        throw new Error("This sale has already been voided.");
      }

      const ingredientRefs = saleDeductionMovements.map((movement) =>
        doc(db, "ingredients", movement.ingredientId)
      );

      const ingredientSnapshots = await Promise.all(
        ingredientRefs.map((ingredientRef) => transaction.get(ingredientRef))
      );

      ingredientSnapshots.forEach((ingredientSnapshot, index) => {
        const movement = saleDeductionMovements[index];

        if (!ingredientSnapshot.exists()) {
          throw new Error(
            `Cannot restore stock because ${movement.ingredientName} no longer exists.`
          );
        }

        if (movement.usageAmountDeducted <= 0) {
          throw new Error(
            `Invalid stock deduction amount found for ${movement.ingredientName}.`
          );
        }
      });

      transaction.update(saleRef, {
        status: "voided",
        voidReason: selectedVoidReason,
        voidNote: cleanedVoidNote,
        voidedAt: serverTimestamp(),
        voidedAtText,
        updatedAt: serverTimestamp(),
      });

      ingredientSnapshots.forEach((ingredientSnapshot, index) => {
  const movement = saleDeductionMovements[index];
  const ingredientData = ingredientSnapshot.data();

  if (!ingredientData) {
    throw new Error(
      `Cannot restore stock because ${movement.ingredientName} data is missing.`
    );
  }

  const previousStock = Number(ingredientData.currentStock || 0);
  const newStock = previousStock + movement.usageAmountDeducted;

  transaction.update(ingredientRefs[index], {
    currentStock: newStock,
    updatedAt: serverTimestamp(),
  });

  const reversalMovementRef = doc(collection(db, "stockMovements"));

  transaction.set(reversalMovementRef, {
    ingredientId: ingredientSnapshot.id,
    ingredientName:
      movement.ingredientName || ingredientData.name || "Ingredient",
    movementType: "void reversal",
    saleId: saleBeingVoided.id,
    saleNumber: saleBeingVoided.saleNumber,
    originalMovementId: movement.id,
    usageAmountRestored: movement.usageAmountDeducted,
    usageUnit: movement.usageUnit || ingredientData.usageUnit || "",
    previousStock,
    newStock,
    voidReason: selectedVoidReason,
    voidNote: cleanedVoidNote,
    note: `Restored from voided POS sale ${saleBeingVoided.saleNumber}`,
    createdAt: serverTimestamp(),
    createdAtText: voidedAtText,
  });
});
    });

    setSaleToVoid(null);
    setVoidReason("");
    setVoidNote("");
    setSelectedSale(null);

    showToast("Sale voided successfully. Stock has been restored.", "success");

    await loadSellableProducts();
    await loadSalesHistory();
  } catch (error) {
    console.error(error);

    if (error instanceof Error) {
      showToast(error.message, "error");
    } else {
      showToast("Failed to void sale. Please try again.", "error");
    }
  } finally {
    setIsVoidingSale(false);
  }
}



function confirmReprintSale() {
  if (!saleToReprint) {
    return;
  }

  setPrintableReceipt(buildReceiptFromSale(saleToReprint));
  setSelectedSale(null);
  setSaleToReprint(null);

  window.setTimeout(() => {
    window.print();
  }, 200);

  window.setTimeout(() => {
    setPrintableReceipt(null);
  }, 1200);
}

function requestReprintSale(sale: SaleHistoryItem) {
  setSelectedSale(null);
  setSaleToVoid(null);
  setSaleToReprint(sale);
  setMessage("");
}

function cancelReprintSale() {
  setSaleToReprint(null);
  setMessage("");
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCurrentReceiptDate() {
  return formatDateTime(new Date());
}

function formatSaleDate(sale: SaleHistoryItem) {
  const saleDate = sale.createdAt?.toDate?.();

  if (saleDate) {
    return formatDateTime(saleDate);
  }

  if (sale.createdAtText) {
    return sale.createdAtText;
  }

  return "Date unavailable";
}

function showToast(messageText: string, type: ToastType = "info") {
  setToastMessage(messageText);
  setToastType(type);

  if (toastTimeoutRef.current) {
    window.clearTimeout(toastTimeoutRef.current);
  }

  toastTimeoutRef.current = window.setTimeout(() => {
    setToastMessage("");
    toastTimeoutRef.current = null;
  }, 3000);
}

  async function handleCompleteSale() {
  if (cartItems.length === 0 || isCompletingSale) {
    return;
  }

  if (paymentMethod === "Cash" && cashReceivedAmount < cartTotal) {
    setMessage("Cash received is not enough for this order.");
    return;
  }

  setIsCompletingSale(true);
  setMessage("Checking inventory...");
  setIsCheckoutConfirmOpen(false);

  const saleNumber = `SALE-${Date.now()}`;
  const saleDateText = formatCurrentReceiptDate();

  try {
    await runTransaction(db, async (transaction) => {
      const recipeRefs = cartItems.map((item) => doc(db, "recipes", item.sizeId));
      const recipeSnapshots = await Promise.all(
        recipeRefs.map((recipeRef) => transaction.get(recipeRef))
      );

      const ingredientRequirements = new Map<
        string,
        {
          ingredientId: string;
          ingredientName: string;
          requiredAmount: number;
          usageUnit: string;
        }
      >();

      recipeSnapshots.forEach((recipeSnapshot, index) => {
        const cartItem = cartItems[index];

        if (!recipeSnapshot.exists()) {
          throw new Error(`${cartItem.productName} ${cartItem.sizeName} has no recipe.`);
        }

        const recipeData = recipeSnapshot.data();

        if (
          recipeData.isComplete !== true ||
          !Array.isArray(recipeData.ingredients) ||
          recipeData.ingredients.length === 0
        ) {
          throw new Error(
            `${cartItem.productName} ${cartItem.sizeName} has an incomplete recipe.`
          );
        }

        recipeData.ingredients.forEach((ingredient: PosRecipeIngredient) => {
          const totalRequiredAmount = ingredient.requiredAmount * cartItem.quantity;
          const existingRequirement = ingredientRequirements.get(
            ingredient.ingredientId
          );

          if (existingRequirement) {
            existingRequirement.requiredAmount += totalRequiredAmount;
          } else {
            ingredientRequirements.set(ingredient.ingredientId, {
              ingredientId: ingredient.ingredientId,
              ingredientName: ingredient.ingredientName,
              requiredAmount: totalRequiredAmount,
              usageUnit: ingredient.usageUnit,
            });
          }
        });
      });

      const ingredientRefs = Array.from(ingredientRequirements.values()).map(
        (requirement) => doc(db, "ingredients", requirement.ingredientId)
      );

      const ingredientSnapshots = await Promise.all(
        ingredientRefs.map((ingredientRef) => transaction.get(ingredientRef))
      );

      ingredientSnapshots.forEach((ingredientSnapshot) => {
        if (!ingredientSnapshot.exists()) {
          throw new Error("One recipe ingredient no longer exists.");
        }

        const ingredientData = ingredientSnapshot.data();
        const requirement = ingredientRequirements.get(ingredientSnapshot.id);

        if (!requirement) {
          return;
        }

        const currentStock = Number(ingredientData.currentStock || 0);

        if (currentStock < requirement.requiredAmount) {
          throw new Error(
            `Not enough ${requirement.ingredientName}. Needed ${requirement.requiredAmount} ${requirement.usageUnit}, but only ${currentStock} ${requirement.usageUnit} left.`
          );
        }
      });

      const saleRef = doc(collection(db, "sales"));

      transaction.set(saleRef, {
        saleNumber,
        items: cartItems.map((item) => ({
          sizeId: item.sizeId,
          productId: item.productId,
          productName: item.productName,
          sizeName: item.sizeName,
          price: item.price,
          quantity: item.quantity,
          itemNote: item.itemNote || "",
          lineTotal: item.price * item.quantity,
        })),
        totalAmount: cartTotal,
        totalItems: cartItems.reduce((total, item) => total + item.quantity, 0),
        paymentMethod,
        orderNote: orderNote.trim(),
        cashReceived: paymentMethod === "Cash" ? cashReceivedAmount : null,
        changeAmount: paymentMethod === "Cash" ? changeAmount : null,
        status: "completed",
        createdAt: serverTimestamp(),
        createdAtText: saleDateText,
      });

      ingredientSnapshots.forEach((ingredientSnapshot) => {
        const requirement = ingredientRequirements.get(ingredientSnapshot.id);

        if (!requirement) {
          return;
        }

        const ingredientData = ingredientSnapshot.data();

if (!ingredientData) {
  throw new Error("One recipe ingredient no longer exists.");
}

const previousStock = Number(ingredientData.currentStock || 0);
const newStock = previousStock - requirement.requiredAmount;

        transaction.update(doc(db, "ingredients", ingredientSnapshot.id), {
          currentStock: newStock,
          updatedAt: serverTimestamp(),
        });

        const movementRef = doc(collection(db, "stockMovements"));

        transaction.set(movementRef, {
          ingredientId: ingredientSnapshot.id,
          ingredientName: requirement.ingredientName,
          movementType: "sale deduction",
          saleId: saleRef.id,
          saleNumber,
          usageAmountDeducted: requirement.requiredAmount,
          usageUnit: requirement.usageUnit,
          previousStock,
          newStock,
          note: `Deducted from POS sale ${saleNumber}`,
          createdAt: serverTimestamp(),
        });
      });
    });

    setCompletedSaleReceipt({
  saleNumber,
  receiptDateText: saleDateText,
  totalAmount: cartTotal,
  totalItems: cartItems.reduce((total, item) => total + item.quantity, 0),
  paymentMethod,
  cashReceived: paymentMethod === "Cash" ? cashReceivedAmount : undefined,
  changeAmount: paymentMethod === "Cash" ? changeAmount : undefined,
  orderNote: orderNote.trim(),
  items: cartItems,
});

    setCartItems([]);
    setOrderNote("");
    setMessage("");
    await loadSellableProducts();
    await loadSalesHistory();
  } catch (error) {
    console.error(error);

    if (error instanceof Error) {
      setMessage(error.message);
    } else {
      setMessage("Failed to complete sale. Please try again.");
    }
  } finally {
    setIsCompletingSale(false);
  }
}

  return (
    <section className="pos-page">
      <div className="pos-header">
        <div>
          <p className="pos-kicker">Point of Sale</p>
          <h2>New Order</h2>
          <p>Select products, add them to cart, then complete the sale.</p>
        </div>

        <button
          type="button"
          className="pos-secondary-button"
          onClick={loadSellableProducts}
          disabled={isLoadingProducts}
        >
          {isLoadingProducts ? "Refreshing..." : "Refresh Menu"}
        </button>
      </div>

      <div className="pos-tabs">
        <button
          type="button"
          className={activePosTab === "new-order" ? "active" : ""}
          onClick={() => {
            setActivePosTab("new-order");
            setMessage("");
          }}
        >
          New Order
        </button>

        <button
          type="button"
          className={activePosTab === "sales-history" ? "active" : ""}
          onClick={() => {
            setActivePosTab("sales-history");
            setMessage("");
            loadSalesHistory();
          }}
        >
          Sales History
        </button>
      </div>

      {activePosTab === "new-order" && (
  <div className="pos-layout">
        <div className="pos-menu-section">
          <div className="pos-toolbar">
            <input
              type="search"
              placeholder="Search product..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />

            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              {categories.map((category) => (
                <option value={category} key={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {isLoadingProducts && (
            <p className="pos-empty-text">Loading POS menu...</p>
          )}

          {!isLoadingProducts && sellableSizes.length === 0 && (
            <div className="pos-empty-card">
              <h3>No sellable products yet.</h3>
              <p>
                Go to Inventory and make sure a product has an active size with
                a completed recipe.
              </p>
            </div>
          )}

          {!isLoadingProducts &&
            sellableSizes.length > 0 &&
            filteredSellableSizes.length === 0 && (
              <p className="pos-empty-text">No product matches your search.</p>
            )}

          {!isLoadingProducts && filteredSellableSizes.length > 0 && (
            <div className="pos-product-grid">
              {Object.entries(groupedProducts).map(([groupKey, sizes]) => {
                const firstSize = sizes[0];

                return (
                  <article className="pos-product-card" key={groupKey}>
                    <div>
                      <span>{firstSize.category}</span>
                      <h3>{firstSize.productName}</h3>
                    </div>

                    <div className="pos-size-buttons">
                      {sizes.map((size) => (
                        <button
                          type="button"
                          key={size.id}
                          onClick={() => addToCart(size)}
                        >
                          <strong>{size.sizeName}</strong>
                          <small>₱{size.price.toFixed(2)}</small>
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="pos-cart-section">
          <div className="pos-cart-header">
            <div>
              <p className="pos-kicker">Current Cart</p>
              <h3>
                {cartQuantity} item{cartQuantity === 1 ? "" : "s"}
              </h3>
            </div>

            {cartItems.length > 0 && (
              <button type="button" onClick={requestClearCart}>
                Clear
              </button>
            )}
          </div>

          {cartItems.length === 0 && (
            <div className="pos-cart-empty">
              <h4>No items yet.</h4>
              <p>Tap a product size to add it here.</p>
            </div>
          )}

          {cartItems.length > 0 && (
            <div className="pos-cart-list">
              {cartItems.map((item) => (
                <article className="pos-cart-item" key={item.sizeId}>
                  <div>
                    <h4>{item.productName}</h4>
                    <p>
                      {item.sizeName} · ₱{item.price.toFixed(2)}
                    </p>
                  </div>

                  <div className="pos-cart-item-actions">
                    <div className="pos-quantity-control">
                      <button
                        type="button"
                        onClick={() => decreaseCartItem(item.sizeId)}
                      >
                        -
                      </button>

                      <strong>{item.quantity}</strong>

                      <button
                        type="button"
                        onClick={() => increaseCartItem(item.sizeId)}
                      >
                        +
                      </button>
                    </div>

                    <strong>₱{(item.price * item.quantity).toFixed(2)}</strong>

                    <button
                      type="button"
                      className="pos-remove-button"
                      onClick={() => openEditCartItem(item)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="pos-remove-button"
                      onClick={() => removeCartItem(item.sizeId)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="pos-cart-total">
            <span>Total</span>
            <strong>₱{cartTotal.toFixed(2)}</strong>
          </div>

          <button
            type="button"
            className="pos-checkout-button"
            disabled={cartItems.length === 0 || isCompletingSale}
            onClick={openCheckoutConfirmModal}
          >
            {isCompletingSale ? "Completing Sale..." : "Review Order"}
          </button>
        </aside>
      </div>
    )}

    {activePosTab === "sales-history" && (
  <section className="pos-history-section">
    <div className="pos-history-header">
      <div>
        <p className="pos-kicker">Sales History</p>
        <h3>Recent Sales</h3>
        <p>View completed transactions and receipt details.</p>
      </div>

      <button
        type="button"
        className="pos-secondary-button"
        onClick={loadSalesHistory}
        disabled={isLoadingSalesHistory}
      >
        {isLoadingSalesHistory ? "Loading..." : "Refresh Sales"}
      </button>
    </div>

    {isLoadingSalesHistory && (
      <p className="pos-empty-text">Loading sales history...</p>
    )}

    {!isLoadingSalesHistory && salesHistory.length === 0 && (
      <div className="pos-empty-card">
        <h3>No sales yet.</h3>
        <p>Completed sales will appear here after checkout.</p>
      </div>
    )}

    {!isLoadingSalesHistory && salesHistory.length > 0 && (
      <div className="pos-history-list">
        {salesHistory.map((sale) => (
          <article className="pos-history-card" key={sale.id}>
            <div>
              <div className="pos-history-card-title">
                <h4>{sale.saleNumber}</h4>
                <span className={`pos-sale-status ${sale.status}`}>
                  {sale.status}
                </span>
              </div>

              <p>{formatSaleDate(sale)}</p>
              <p>
                {sale.totalItems} item{sale.totalItems === 1 ? "" : "s"} ·{" "}
                {sale.paymentMethod}
              </p>
            </div>

            <div className="pos-history-card-right">
              <strong>₱{sale.totalAmount.toFixed(2)}</strong>

              <button
  type="button"
  className="pos-secondary-button"
  onClick={() => setSelectedSale(sale)}
>
  View Details
</button>

<button
  type="button"
  className="pos-secondary-button"
  onClick={() => requestReprintSale(sale)}
>
  Reprint
</button>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
)}

{selectedSale && (
  <div
    className="pos-receipt-overlay"
    onClick={() => setSelectedSale(null)}
  >
    <section
      className="pos-receipt-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pos-receipt-header">
        <div>
          <p className="pos-kicker">Sale Details</p>
          <h3>{selectedSale.saleNumber}</h3>
          <p>{formatSaleDate(selectedSale)}</p>
        </div>

        <button
          type="button"
          className="pos-receipt-close"
          onClick={() => setSelectedSale(null)}
          aria-label="Close sale details"
        >
          ×
        </button>
      </div>

      <div className="pos-receipt-summary">
        <div>
          <span>Status</span>
          <strong>{selectedSale.status}</strong>
        </div>

        <div>
          <span>Total Items</span>
          <strong>{selectedSale.totalItems}</strong>
        </div>

        <div>
          <span>Payment</span>
          <strong>{selectedSale.paymentMethod}</strong>
        </div>

        <div>
          <span>Total Amount</span>
          <strong>₱{selectedSale.totalAmount.toFixed(2)}</strong>
        </div>

        {selectedSale.paymentMethod === "Cash" && (
          <>
            <div>
              <span>Cash Received</span>
              <strong>₱{Number(selectedSale.cashReceived || 0).toFixed(2)}</strong>
            </div>

            <div>
              <span>Change</span>
              <strong>₱{Number(selectedSale.changeAmount || 0).toFixed(2)}</strong>
            </div>
          </>
        )}
      </div>

      {selectedSale.orderNote && (
        <div className="pos-order-note-card">
          <span>Order Note</span>
          <strong>{selectedSale.orderNote}</strong>
        </div>
      )}

      {selectedSale.status === "voided" && (
  <div className="pos-voided-card">
    <span>Voided Sale</span>
    <strong>{selectedSale.voidReason || "No reason recorded"}</strong>

    {selectedSale.voidNote && <p>{selectedSale.voidNote}</p>}

    {selectedSale.voidedAtText && (
      <small>Voided on {selectedSale.voidedAtText}</small>
    )}
  </div>
)}

      <div className="pos-receipt-items">
        <h4>Items Sold</h4>

        {selectedSale.items.map((item) => (
          <article className="pos-receipt-item" key={item.sizeId}>
            <div>
              <strong>{item.productName}</strong>
              <p>
                {item.sizeName} · ₱{item.price.toFixed(2)}
              </p>

              {item.itemNote && (
                <p className="pos-item-note">Note: {item.itemNote}</p>
              )}
            </div>

            <strong>₱{(item.price * item.quantity).toFixed(2)}</strong>
          </article>
        ))}
      </div>

      <div className="pos-receipt-actions">
  <button
    type="button"
    className="pos-secondary-button"
    onClick={() => requestReprintSale(selectedSale)}
  >
    Reprint Receipt
  </button>

  {selectedSale.status !== "voided" && (
    <button
      type="button"
      className="pos-danger-button"
      onClick={() => requestVoidSale(selectedSale)}
    >
      Void Sale
    </button>
  )}

  <button
    type="button"
    className="pos-checkout-button"
    onClick={() => setSelectedSale(null)}
  >
    Close
  </button>
</div>
    </section>
  </div>
)}

{isClearCartConfirmOpen && (
  <div className="pos-confirm-overlay" onClick={cancelClearCart}>
    <section
      className="pos-confirm-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pos-confirm-header">
        <div>
          <p className="pos-kicker">Clear Order</p>
          <h3>Remove all items?</h3>
          <p>
            This only clears the current cart. No sale record or stock movement
            will be created.
          </p>
        </div>

        <button
          type="button"
          className="pos-receipt-close"
          onClick={cancelClearCart}
          aria-label="Close clear order confirmation"
        >
          ×
        </button>
      </div>

      <div className="pos-confirm-actions">
        <button
          type="button"
          className="pos-checkout-button"
          onClick={confirmClearCart}
        >
          Yes, Clear Order
        </button>

        <button
          type="button"
          className="pos-secondary-button"
          onClick={cancelClearCart}
        >
          Cancel
        </button>
      </div>
    </section>
  </div>
)}

{editingCartItem && (
  <div className="pos-confirm-overlay" onClick={closeEditCartItem}>
    <form
      className="pos-confirm-modal"
      onSubmit={saveCartItemChanges}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pos-confirm-header">
        <div>
          <p className="pos-kicker">Edit Item</p>
          <h3>{editingCartItem.productName}</h3>
          <p>Change size, quantity, or add customer request notes.</p>
        </div>

        <button
          type="button"
          className="pos-receipt-close"
          onClick={closeEditCartItem}
          aria-label="Close edit item"
        >
          ×
        </button>
      </div>

      <div className="pos-payment-card">
        <label htmlFor="editCartSize">Size</label>
        <select
          id="editCartSize"
          value={editCartSizeId}
          onChange={(event) => setEditCartSizeId(event.target.value)}
        >
          {availableSizesForEditing.map((size) => (
            <option value={size.id} key={size.id}>
              {size.sizeName} - ₱{size.price.toFixed(2)}
            </option>
          ))}
        </select>
      </div>

      <div className="pos-payment-card">
        <label htmlFor="editCartQuantity">Quantity</label>
        <input
          id="editCartQuantity"
          type="number"
          min="1"
          step="1"
          value={editCartQuantity}
          onChange={(event) => setEditCartQuantity(event.target.value)}
        />
      </div>

      <div className="pos-payment-card">
        <label htmlFor="editCartItemNote">Item note</label>
        <textarea
          id="editCartItemNote"
          rows={3}
          maxLength={120}
          placeholder="Example: less sweet, no ice, takeout"
          value={editCartItemNote}
          onChange={(event) => setEditCartItemNote(event.target.value)}
        />
      </div>

      {message && <p className="pos-message">{message}</p>}

      <div className="pos-confirm-actions">
        <button type="submit" className="pos-checkout-button">
          Save Item Changes
        </button>

        <button
          type="button"
          className="pos-secondary-button"
          onClick={removeEditingCartItem}
        >
          Remove Item
        </button>

        <button
          type="button"
          className="pos-secondary-button"
          onClick={closeEditCartItem}
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
)}


      {isCheckoutConfirmOpen && (
  <div className="pos-confirm-overlay" onClick={closeCheckoutConfirmModal}>
    <section
      className="pos-confirm-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pos-confirm-header">
        <div>
          <p className="pos-kicker">Review Order</p>
          <h3>Confirm before checkout</h3>
          <p>
            Check the items, quantities, payment method, and total before saving
            the sale.
          </p>
        </div>

        <button
          type="button"
          className="pos-receipt-close"
          onClick={closeCheckoutConfirmModal}
          disabled={isCompletingSale}
          aria-label="Close order review"
        >
          ×
        </button>
      </div>

      <div className="pos-confirm-items">
        {cartItems.map((item) => (
          <article className="pos-confirm-item" key={item.sizeId}>
            <div>
              <strong>{item.productName}</strong>
              <p>
                {item.sizeName} · ₱{item.price.toFixed(2)} × {item.quantity}
              </p>

              {item.itemNote && (
                <p className="pos-item-note">Note: {item.itemNote}</p>
              )}
            </div>

            <strong>₱{(item.price * item.quantity).toFixed(2)}</strong>
          </article>
        ))}
      </div>

      <div className="pos-payment-card">
        <label htmlFor="paymentMethod">Payment method</label>
        <select
          id="paymentMethod"
          value={paymentMethod}
          onChange={(event) => {
            setPaymentMethod(event.target.value);
            setCashReceived("");
            setMessage("");
          }}
          disabled={isCompletingSale}
        >
          <option value="Cash">Cash</option>
          <option value="GCash">GCash</option>
          <option value="Maya">Maya</option>
          <option value="Card">Card</option>
          <option value="Other">Other</option>
        </select>

        {paymentMethod === "Cash" && (
          <div className="pos-cash-calculator">
            <div className="form-group">
              <label htmlFor="cashReceived">Cash received</label>
              <input
                id="cashReceived"
                type="number"
                min="0"
                step="0.01"
                placeholder="Example: 500"
                value={cashReceived}
                onChange={(event) => {
                  setCashReceived(event.target.value);
                  setMessage("");
                }}
                disabled={isCompletingSale}
              />
            </div>

            <div className="pos-change-preview">
              <span>Change</span>
              <strong className={changeAmount < 0 ? "negative" : ""}>
                {cashReceived ? `₱${Math.max(changeAmount, 0).toFixed(2)}` : "₱0.00"}
              </strong>
            </div>

            {cashReceived && changeAmount < 0 && (
              <p className="pos-cash-warning">
                Cash received is not enough. Add at least ₱{Math.abs(changeAmount).toFixed(2)} more.
              </p>
            )}
          </div>
        )}
      </div>

        <div className="pos-payment-card">
          <label htmlFor="orderNote">Order note</label>
          <textarea
            id="orderNote"
            rows={3}
            maxLength={160}
            placeholder="Example: Takeout, less sweet, customer waiting outside"
            value={orderNote}
            onChange={(event) => setOrderNote(event.target.value)}
            disabled={isCompletingSale}
          />
        </div>


      <div className="pos-confirm-total">
        <span>Total Amount</span>
        <strong>₱{cartTotal.toFixed(2)}</strong>
      </div>

      {message && <p className="pos-message">{message}</p>}

      <div className="pos-confirm-actions">
        <button
          type="button"
          className="pos-checkout-button"
          onClick={handleCompleteSale}
          disabled={!canConfirmSale}
        >
          {isCompletingSale ? "Completing Sale..." : "Confirm Sale"}
        </button>

        <button
          type="button"
          className="pos-secondary-button"
          onClick={closeCheckoutConfirmModal}
          disabled={isCompletingSale}
        >
          Go Back / Edit Order
        </button>
      </div>
    </section>
  </div>
)}

{saleToReprint && (
  <div className="pos-confirm-overlay" onClick={cancelReprintSale}>
    <section
      className="pos-confirm-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pos-confirm-header">
        <div>
          <p className="pos-kicker">Confirm Reprint</p>
          <h3>Reprint this receipt?</h3>
          <p>
            This will print a copy of the original receipt. No sale or stock
            changes will be made.
          </p>
        </div>

        <button
          type="button"
          className="pos-receipt-close"
          onClick={cancelReprintSale}
          aria-label="Close reprint confirmation"
        >
          ×
        </button>
      </div>

      <div className="pos-reprint-summary">
        <div>
          <span>Sale No.</span>
          <strong>{saleToReprint.saleNumber}</strong>
        </div>

        <div>
          <span>Date</span>
          <strong>{formatSaleDate(saleToReprint)}</strong>
        </div>

        <div>
          <span>Payment</span>
          <strong>{saleToReprint.paymentMethod}</strong>
        </div>

        <div>
          <span>Total</span>
          <strong>₱{saleToReprint.totalAmount.toFixed(2)}</strong>
        </div>
      </div>

      <div className="pos-confirm-actions">
        <button
          type="button"
          className="pos-checkout-button"
          onClick={confirmReprintSale}
        >
          Yes, Reprint Receipt
        </button>

        <button
          type="button"
          className="pos-secondary-button"
          onClick={cancelReprintSale}
        >
          Cancel
        </button>
      </div>
    </section>
  </div>
)}

{saleToVoid && (
  <div className="pos-confirm-overlay" onClick={cancelVoidSale}>
    <form
      className="pos-confirm-modal"
      onSubmit={handleVoidSaleSubmit}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pos-confirm-header">
        <div>
          <p className="pos-kicker">Void Sale</p>
          <h3>Void this transaction?</h3>
          <p>
            This will cancel the completed sale, restore deducted ingredients, and save
            an audit log.
          </p>
        </div>

        <button
          type="button"
          className="pos-receipt-close"
          onClick={cancelVoidSale}
          disabled={isVoidingSale}
          aria-label="Close void sale confirmation"
        >
          ×
        </button>
      </div>

      <div className="pos-void-warning">
        <strong>This action is not a delete.</strong>
        <p>
          The sale will remain in Sales History, but it will be locked and marked as
          voided for accountability.
        </p>
      </div>

      <div className="pos-reprint-summary">
        <div>
          <span>Sale No.</span>
          <strong>{saleToVoid.saleNumber}</strong>
        </div>

        <div>
          <span>Date</span>
          <strong>{formatSaleDate(saleToVoid)}</strong>
        </div>

        <div>
          <span>Payment</span>
          <strong>{saleToVoid.paymentMethod}</strong>
        </div>

        <div>
          <span>Total</span>
          <strong>₱{saleToVoid.totalAmount.toFixed(2)}</strong>
        </div>
      </div>

      <div className="pos-payment-card">
        <label htmlFor="voidReason">Void reason</label>
        <select
          id="voidReason"
          value={voidReason}
          onChange={(event) => setVoidReason(event.target.value as VoidReason)}
          disabled={isVoidingSale}
        >
          <option value="">Select reason</option>
          {VOID_REASONS.map((reason) => (
            <option value={reason} key={reason}>
              {reason}
            </option>
          ))}
        </select>
      </div>

      <div className="pos-payment-card">
        <label htmlFor="voidNote">Cashier note</label>
        <textarea
          id="voidNote"
          rows={3}
          maxLength={180}
          placeholder="Example: Customer changed order after payment"
          value={voidNote}
          onChange={(event) => setVoidNote(event.target.value)}
          disabled={isVoidingSale}
        />
      </div>

      {message && <p className="pos-message">{message}</p>}

      <div className="pos-confirm-actions">
        <button
          type="submit"
          className="pos-danger-button"
          disabled={isVoidingSale || !voidReason}
        >
          {isVoidingSale ? "Voiding Sale..." : "Yes, Void Sale"}
        </button>

        <button
          type="button"
          className="pos-secondary-button"
          onClick={cancelVoidSale}
          disabled={isVoidingSale}
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
)}

      
      {completedSaleReceipt && (
        <div className="pos-receipt-overlay" onClick={closeReceiptModal}>
          <section
            className="pos-receipt-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pos-receipt-header">
              <div>
                <p className="pos-kicker">Sale Completed</p>
                <h3>Order saved successfully</h3>
                <p>{completedSaleReceipt.saleNumber}</p>
              </div>

              <button
                type="button"
                className="pos-receipt-close"
                onClick={closeReceiptModal}
                aria-label="Close receipt"
              >
                ×
              </button>
            </div>

            <div className="pos-receipt-summary">
              <div>
                <span>Total Items</span>
                <strong>{completedSaleReceipt.totalItems}</strong>
              </div>

              <div>
                  <span>Payment</span>
                  <strong>{completedSaleReceipt.paymentMethod}</strong>
                </div>

                <div>
                  <span>Total Amount</span>
                  <strong>₱{completedSaleReceipt.totalAmount.toFixed(2)}</strong>
                </div>

                {completedSaleReceipt.paymentMethod === "Cash" && (
                  <>
                    <div>
                      <span>Cash Received</span>
                      <strong>₱{(completedSaleReceipt.cashReceived || 0).toFixed(2)}</strong>
                    </div>

                    <div>
                      <span>Change</span>
                      <strong>₱{(completedSaleReceipt.changeAmount || 0).toFixed(2)}</strong>
                    </div>
                  </>
                )}
            </div>

            {completedSaleReceipt.orderNote && (
              <div className="pos-order-note-card">
                <span>Order Note</span>
                <strong>{completedSaleReceipt.orderNote}</strong>
              </div>
            )}

            <div className="pos-receipt-items">
              <h4>Items Sold</h4>

              {completedSaleReceipt.items.map((item) => (
                <article className="pos-receipt-item" key={item.sizeId}>
                  <div>
                    <strong>{item.productName}</strong>
                    <p>
                      {item.sizeName} · ₱{item.price.toFixed(2)} × {item.quantity}
                    </p>

                    {item.itemNote && (
                      <p className="pos-item-note">Note: {item.itemNote}</p>
                    )}
                  </div>

                  <strong>₱{(item.price * item.quantity).toFixed(2)}</strong>
                </article>
              ))}
            </div>

            <div className="pos-receipt-actions">
              <button
                type="button"
                className="pos-secondary-button"
                onClick={printReceipt}
              >
                Print Receipt
              </button>

              <button
                type="button"
                className="pos-checkout-button"
                onClick={closeReceiptModal}
              >
                New Order
              </button>
            </div>
          </section>
        </div>
      )}

      {toastMessage && (
        <div className={`pos-toast pos-toast-${toastType}`} role="status">
          <span>{toastMessage}</span>
        </div>
      )}

{receiptForPrinting && (
  <div className="pos-thermal-receipt-print" aria-hidden="true">
    <div className="thermal-store-name">DOUBLE D'BREWS</div>
    <div className="thermal-store-subtitle">POS Sales Receipt</div>
    <div className="thermal-store-info">Thank you for supporting us</div>

    <div className="thermal-line" />

    <div className="thermal-copy-label">CUSTOMER COPY</div>

    <div className="thermal-line" />

    <div className="thermal-meta-row">
      <span>Sale No:</span>
      <strong>{receiptForPrinting.saleNumber}</strong>
    </div>

    <div className="thermal-meta-row">
      <span>Date:</span>
      <strong>{receiptForPrinting.receiptDateText}</strong>
    </div>

    <div className="thermal-meta-row">
      <span>Cashier:</span>
      <strong>Clark</strong>
    </div>

    <div className="thermal-line" />

    <div className="thermal-table-head">
      <span>ITEM</span>
      <span>AMOUNT</span>
    </div>

    <div className="thermal-line compact" />

    {receiptForPrinting.items.length === 0 ? (
      <div className="thermal-empty-warning">
        No item details found for this sale.
      </div>
    ) : (
      receiptForPrinting.items.map((item) => (
        <div className="thermal-item" key={item.sizeId}>
          <div className="thermal-item-name">{item.productName}</div>

          <div className="thermal-item-details">
            <span>
              {item.sizeName} x {item.quantity}
            </span>
            <span>₱{(item.price * item.quantity).toFixed(2)}</span>
          </div>

          <div className="thermal-item-unit">
            ₱{item.price.toFixed(2)} each
          </div>

          {item.itemNote && (
            <div className="thermal-item-note">Note: {item.itemNote}</div>
          )}
        </div>
      ))
    )}

    <div className="thermal-line" />

    <div className="thermal-total-row">
      <span>Total Items</span>
      <strong>{receiptForPrinting.totalItems}</strong>
    </div>

    <div className="thermal-total-row">
      <span>Subtotal</span>
      <strong>₱{receiptForPrinting.totalAmount.toFixed(2)}</strong>
    </div>

    <div className="thermal-total-row thermal-grand-total">
      <span>TOTAL</span>
      <strong>₱{receiptForPrinting.totalAmount.toFixed(2)}</strong>
    </div>

    <div className="thermal-line compact" />

    <div className="thermal-total-row">
      <span>Payment Method</span>
      <strong>{receiptForPrinting.paymentMethod}</strong>
    </div>

    {receiptForPrinting.paymentMethod === "Cash" && (
      <>
        <div className="thermal-total-row">
          <span>Cash Received</span>
          <strong>₱{(receiptForPrinting.cashReceived || 0).toFixed(2)}</strong>
        </div>

        <div className="thermal-total-row">
          <span>Change</span>
          <strong>₱{(receiptForPrinting.changeAmount || 0).toFixed(2)}</strong>
        </div>
      </>
    )}

    {receiptForPrinting.orderNote && (
      <>
        <div className="thermal-line" />
        <div className="thermal-note-title">ORDER NOTE</div>
        <div className="thermal-item-note">
          {receiptForPrinting.orderNote}
        </div>
      </>
    )}

    <div className="thermal-line" />

    <div className="thermal-policy">
      Please keep this receipt for reference.
      Reprinted copies do not create a new sale or stock movement.
    </div>

    <div className="thermal-line" />

    <div className="thermal-footer">
      <p>Thank you for ordering!</p>
      <p>Please come again.</p>
    </div>
  </div>
)}
    </section>
  );
}

export default PosPage;