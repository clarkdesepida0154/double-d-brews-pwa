import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase/config.ts";
import "./SalesReportsPage.css";

type RangePreset =
  | "today"
  | "this-week"
  | "this-month"
  | "last-3-months"
  | "this-year"
  | "modified";

type ReportSaleItem = {
  sizeId: string;
  productId: string;
  productName: string;
  sizeName: string;
  price: number;
  quantity: number;
  lineTotal?: number;
  itemNote?: string;
};

type ReportSale = {
  id: string;
  saleNumber: string;
  totalAmount: number;
  totalItems: number;
  paymentMethod: string;
  status: string;
  items: ReportSaleItem[];
  voidReason?: string;
  voidNote?: string;
  voidedAtText?: string;
  createdAtText?: string;
  createdAt?: {
    toDate?: () => Date;
  };
};

type ProductPerformanceItem = {
  key: string;
  productName: string;
  sizeName: string;
  quantity: number;
  revenue: number;
  transactionCount: number;
  averageRevenuePerUnit: number;
};

type TrendRow = {
  label: string;
  amount: number;
  transactions: number;
};

type DecisionInsight = {
  title: string;
  text: string;
  tone: "good" | "warning" | "danger";
};

const PAYMENT_METHODS = ["Cash", "GCash", "Maya", "Card", "Other"];

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "last-3-months", label: "Last 3 Months" },
  { value: "this-year", label: "This Year" },
  { value: "modified", label: "Modified Range" },
];

function formatCurrency(amount: number) {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getSaleDate(sale: ReportSale) {
  const firestoreDate = sale.createdAt?.toDate?.();

  if (firestoreDate instanceof Date && !Number.isNaN(firestoreDate.getTime())) {
    return firestoreDate;
  }

  if (sale.createdAtText) {
    const cleanedDateText = sale.createdAtText.replace(" at ", " ");
    const parsedDate = new Date(cleanedDateText);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
}

function formatFriendlyDate(sale: ReportSale) {
  if (sale.createdAtText) {
    return sale.createdAtText;
  }

  const saleDate = getSaleDate(sale);

  if (!saleDate) {
    return "No date";
  }

  return saleDate.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRangeDates(
  preset: RangePreset,
  customStartDate: string,
  customEndDate: string
) {
  const today = new Date();

  if (preset === "today") {
    return {
      start: startOfDay(today),
      end: endOfDay(today),
      label: "Today",
    };
  }

  if (preset === "this-week") {
    const start = startOfDay(today);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);

    return {
      start,
      end: endOfDay(today),
      label: "This Week",
    };
  }

  if (preset === "this-month") {
    return {
      start: startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: endOfDay(today),
      label: "This Month",
    };
  }

  if (preset === "last-3-months") {
    const start = startOfDay(today);
    start.setMonth(start.getMonth() - 3);

    return {
      start,
      end: endOfDay(today),
      label: "Last 3 Months",
    };
  }

  if (preset === "this-year") {
    return {
      start: startOfDay(new Date(today.getFullYear(), 0, 1)),
      end: endOfDay(today),
      label: "This Year",
    };
  }

  return {
    start: startOfDay(parseDateInput(customStartDate)),
    end: endOfDay(parseDateInput(customEndDate)),
    label: "Modified Range",
  };
}

function getPreviousRange(start: Date, end: Date) {
  const rangeLength = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - rangeLength);

  return {
    previousStart,
    previousEnd,
  };
}

function calculateChange(current: number, previous: number) {
  if (previous === 0 && current === 0) {
    return 0;
  }

  if (previous === 0) {
    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function normalizePaymentMethod(paymentMethod: string) {
  const cleanPaymentMethod = paymentMethod.trim().toLowerCase();

  if (cleanPaymentMethod === "cash") {
    return "Cash";
  }

  if (cleanPaymentMethod === "gcash") {
    return "GCash";
  }

  if (cleanPaymentMethod === "maya") {
    return "Maya";
  }

  if (cleanPaymentMethod === "card") {
    return "Card";
  }

  return "Other";
}

function buildTrendRows(sales: ReportSale[], startDate: Date, endDate: Date): TrendRow[] {
  const dayCount =
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const shouldGroupMonthly = dayCount > 45;
  const trendMap = new Map<string, TrendRow>();

  sales.forEach((sale) => {
    const saleDate = getSaleDate(sale);

    if (!saleDate) {
      return;
    }

    const label = shouldGroupMonthly
      ? saleDate.toLocaleString("en-PH", { month: "short", year: "numeric" })
      : saleDate.toLocaleString("en-PH", { month: "short", day: "numeric" });

    const existingRow = trendMap.get(label);

    if (existingRow) {
      existingRow.amount += sale.totalAmount;
      existingRow.transactions += 1;
    } else {
      trendMap.set(label, {
        label,
        amount: sale.totalAmount,
        transactions: 1,
      });
    }
  });

  return Array.from(trendMap.values()).slice(-12);
}

function SalesReportsPage() {
  const todayInput = formatDateInput(new Date());

  const [sales, setSales] = useState<ReportSale[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  const [customStartDate, setCustomStartDate] = useState(todayInput);
  const [customEndDate, setCustomEndDate] = useState(todayInput);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadSales() {
    setIsLoading(true);
    setMessage("");

    try {
      const salesQuery = query(collection(db, "sales"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(salesQuery);

      const loadedSales = snapshot.docs.map((saleDoc) => {
        const data = saleDoc.data();

        return {
          id: saleDoc.id,
          saleNumber: data.saleNumber || "Unknown Sale",
          totalAmount: Number(data.totalAmount || 0),
          totalItems: Number(data.totalItems || 0),
          paymentMethod: normalizePaymentMethod(String(data.paymentMethod || "Other")),
          status: String(data.status || "completed"),
          items: Array.isArray(data.items) ? data.items : [],
          voidReason: String(data.voidReason || ""),
          voidNote: String(data.voidNote || ""),
          voidedAtText: String(data.voidedAtText || ""),
          createdAtText: String(data.createdAtText || ""),
          createdAt: data.createdAt,
        };
      });

      setSales(loadedSales);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load sales reports right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, []);

  const selectedRange = useMemo(() => {
    return getRangeDates(rangePreset, customStartDate, customEndDate);
  }, [rangePreset, customStartDate, customEndDate]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = getSaleDate(sale);

      if (!saleDate) {
        return false;
      }

      return saleDate >= selectedRange.start && saleDate <= selectedRange.end;
    });
  }, [sales, selectedRange]);

  const { previousStart, previousEnd } = useMemo(() => {
    return getPreviousRange(selectedRange.start, selectedRange.end);
  }, [selectedRange]);

  const previousPeriodSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = getSaleDate(sale);

      if (!saleDate || sale.status === "voided") {
        return false;
      }

      return saleDate >= previousStart && saleDate <= previousEnd;
    });
  }, [sales, previousStart, previousEnd]);

  const completedSales = useMemo(() => {
    return filteredSales.filter((sale) => sale.status !== "voided");
  }, [filteredSales]);

  const voidedSales = useMemo(() => {
    return filteredSales.filter((sale) => sale.status === "voided");
  }, [filteredSales]);

  const grossSales = useMemo(() => {
    return filteredSales.reduce((total, sale) => total + sale.totalAmount, 0);
  }, [filteredSales]);

  const voidedAmount = useMemo(() => {
    return voidedSales.reduce((total, sale) => total + sale.totalAmount, 0);
  }, [voidedSales]);

  const netSales = useMemo(() => {
    return completedSales.reduce((total, sale) => total + sale.totalAmount, 0);
  }, [completedSales]);

  const previousNetSales = useMemo(() => {
    return previousPeriodSales.reduce((total, sale) => total + sale.totalAmount, 0);
  }, [previousPeriodSales]);

  const netSalesChange = calculateChange(netSales, previousNetSales);
  const completedTransactionCount = completedSales.length;
  const totalItemsSold = completedSales.reduce((total, sale) => total + sale.totalItems, 0);
  const averageOrderValue =
    completedTransactionCount > 0 ? netSales / completedTransactionCount : 0;
  const itemsPerTransaction =
    completedTransactionCount > 0 ? totalItemsSold / completedTransactionCount : 0;
  const revenuePerItem = totalItemsSold > 0 ? netSales / totalItemsSold : 0;
  const voidRate =
    filteredSales.length > 0 ? (voidedSales.length / filteredSales.length) * 100 : 0;

  const paymentBreakdown = useMemo(() => {
    return PAYMENT_METHODS.map((method) => {
      const methodSales = completedSales.filter((sale) => sale.paymentMethod === method);
      const amount = methodSales.reduce((total, sale) => total + sale.totalAmount, 0);

      return {
        method,
        amount,
        count: methodSales.length,
        share: netSales > 0 ? (amount / netSales) * 100 : 0,
      };
    });
  }, [completedSales, netSales]);

  const productPerformance = useMemo(() => {
    const itemMap = new Map<string, ProductPerformanceItem>();

    completedSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const key = `${item.productId}-${item.sizeId}`;
        const quantity = Number(item.quantity || 0);
        const revenue = Number(item.lineTotal || item.price * item.quantity || 0);
        const existingItem = itemMap.get(key);

        if (existingItem) {
          existingItem.quantity += quantity;
          existingItem.revenue += revenue;
          existingItem.transactionCount += 1;
          existingItem.averageRevenuePerUnit =
            existingItem.quantity > 0 ? existingItem.revenue / existingItem.quantity : 0;
        } else {
          itemMap.set(key, {
            key,
            productName: item.productName || "Unknown Product",
            sizeName: item.sizeName || "Size",
            quantity,
            revenue,
            transactionCount: 1,
            averageRevenuePerUnit: quantity > 0 ? revenue / quantity : 0,
          });
        }
      });
    });

    return Array.from(itemMap.values());
  }, [completedSales]);

  const bestByRevenue = useMemo(() => {
    return [...productPerformance].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [productPerformance]);

  const bestByQuantity = useMemo(() => {
    return [...productPerformance].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [productPerformance]);

  const lowPerformerWatchlist = useMemo(() => {
    return [...productPerformance]
      .filter((item) => item.quantity <= 1)
      .sort((a, b) => a.revenue - b.revenue)
      .slice(0, 5);
  }, [productPerformance]);

  const topRevenueProduct = bestByRevenue[0];
  const topQuantityProduct = bestByQuantity[0];

  const topProductShare =
    topRevenueProduct && netSales > 0 ? (topRevenueProduct.revenue / netSales) * 100 : 0;

  const highestPayment = paymentBreakdown
    .filter((payment) => payment.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0];

  const trendRows = useMemo(() => {
    return buildTrendRows(completedSales, selectedRange.start, selectedRange.end);
  }, [completedSales, selectedRange]);

  const maxTrendAmount = Math.max(...trendRows.map((row) => row.amount), 1);

  const executiveInsights = useMemo(() => {
    const insights: DecisionInsight[] = [];

    if (netSales === 0) {
      insights.push({
        title: "No completed sales yet",
        text: "There are no completed sales in this selected period. Once sales are recorded, this report will show business recommendations.",
        tone: "warning",
      });

      insights.push({
        title: "Action needed",
        text: "Use POS transactions first, then return here to evaluate products, payment behavior, and sales quality.",
        tone: "warning",
      });

      return insights;
    }

    insights.push({
      title: netSalesChange >= 0 ? "Sales momentum is positive" : "Sales momentum is down",
      text: `Net sales are ${formatPercent(Math.abs(netSalesChange))} ${
        netSalesChange >= 0 ? "higher" : "lower"
      } than the previous comparable period.`,
      tone: netSalesChange >= 0 ? "good" : "warning",
    });

    if (topRevenueProduct) {
      insights.push({
        title: "Best revenue driver",
        text: `${topRevenueProduct.productName} (${topRevenueProduct.sizeName}) generated ${formatCurrency(
          topRevenueProduct.revenue
        )}, contributing ${formatPercent(topProductShare)} of net sales.`,
        tone: topProductShare >= 45 ? "warning" : "good",
      });
    }

    if (topQuantityProduct) {
      insights.push({
        title: "Most demanded item",
        text: `${topQuantityProduct.productName} (${topQuantityProduct.sizeName}) sold ${topQuantityProduct.quantity} unit/s. Keep ingredients ready before peak hours.`,
        tone: "good",
      });
    }

    if (voidRate >= 10) {
      insights.push({
        title: "Void rate needs review",
        text: `${formatPercent(voidRate)} of transactions were voided. Review cashier errors, wrong product entries, or duplicate sales.`,
        tone: "danger",
      });
    } else {
      insights.push({
        title: "Void control is healthy",
        text: `${formatPercent(voidRate)} void rate means transactions are mostly clean for this selected period.`,
        tone: "good",
      });
    }

    if (averageOrderValue < 150 && completedTransactionCount > 0) {
      insights.push({
        title: "Increase basket size",
        text: `Average order value is ${formatCurrency(
          averageOrderValue
        )}. Consider bundles, add-ons, or upsell prompts at checkout.`,
        tone: "warning",
      });
    } else {
      insights.push({
        title: "Order value looks healthy",
        text: `Average order value is ${formatCurrency(
          averageOrderValue
        )}. Continue monitoring if this improves during promos or peak hours.`,
        tone: "good",
      });
    }

    if (highestPayment) {
      insights.push({
        title: "Payment behavior",
        text: `${highestPayment.method} is the strongest payment channel with ${formatCurrency(
          highestPayment.amount
        )}, equal to ${formatPercent(highestPayment.share)} of net sales.`,
        tone: "good",
      });
    }

    return insights.slice(0, 6);
  }, [
    netSales,
    netSalesChange,
    topRevenueProduct,
    topQuantityProduct,
    topProductShare,
    voidRate,
    averageOrderValue,
    completedTransactionCount,
    highestPayment,
  ]);

  return (
    <section className="sales-reports-page">
      <header className="sales-reports-header executive">
        <div>
          <p className="sales-reports-kicker">Executive Sales Reports</p>
          <h2>Business Performance Dashboard</h2>
          <p>
            Track revenue, voids, payment behavior, product performance, and decision
            insights for owners.
          </p>
        </div>

        <button
          className="reports-secondary-button"
          type="button"
          onClick={loadSales}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh Data"}
        </button>
      </header>

      <section className="reports-filter-card executive">
        <div>
          <label htmlFor="rangePreset">Report coverage</label>
          <select
            id="rangePreset"
            value={rangePreset}
            onChange={(event) => setRangePreset(event.target.value as RangePreset)}
          >
            {RANGE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {rangePreset === "modified" && (
          <>
            <div>
              <label htmlFor="customStartDate">Start date</label>
              <input
                id="customStartDate"
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="customEndDate">End date</label>
              <input
                id="customEndDate"
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
              />
            </div>
          </>
        )}

        <div className="reports-range-label">
          <span>{selectedRange.label}</span>
          <strong>
            {selectedRange.start.toLocaleDateString("en-PH")} -{" "}
            {selectedRange.end.toLocaleDateString("en-PH")}
          </strong>
        </div>
      </section>

      {message && <p className="reports-message">{message}</p>}

      <section className="reports-summary-grid executive">
        <article className="reports-summary-card hero good">
          <span>Net Sales</span>
          <strong>{formatCurrency(netSales)}</strong>
          <p>
            {netSalesChange >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(netSalesChange))} vs
            previous period
          </p>
        </article>

        <article className="reports-summary-card">
          <span>Gross Sales</span>
          <strong>{formatCurrency(grossSales)}</strong>
          <p>Completed + voided sales</p>
        </article>

        <article className="reports-summary-card danger">
          <span>Voided Sales</span>
          <strong>{formatCurrency(voidedAmount)}</strong>
          <p>
            {voidedSales.length} voided • {formatPercent(voidRate)} void rate
          </p>
        </article>

        <article className="reports-summary-card">
          <span>Average Order</span>
          <strong>{formatCurrency(averageOrderValue)}</strong>
          <p>Average customer transaction value</p>
        </article>

        <article className="reports-summary-card">
          <span>Transactions</span>
          <strong>{completedTransactionCount}</strong>
          <p>Completed sales count</p>
        </article>

        <article className="reports-summary-card">
          <span>Items Sold</span>
          <strong>{totalItemsSold}</strong>
          <p>Total product sizes sold</p>
        </article>
      </section>

      <section className="reports-panel executive-decision-panel">
        <div className="reports-panel-header">
          <div>
            <p className="sales-reports-kicker">Executive Decision Summary</p>
            <h3>What Owners Should Notice</h3>
          </div>
        </div>

        <div className="decision-summary-grid">
          {executiveInsights.map((insight) => (
            <article
              className={`decision-summary-card ${insight.tone}`}
              key={insight.title}
            >
              <strong>{insight.title}</strong>
              <p>{insight.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reports-panel">
        <div className="reports-panel-header">
          <div>
            <p className="sales-reports-kicker">Sales Quality</p>
            <h3>Customer Value Metrics</h3>
          </div>
        </div>

        <div className="quality-metrics-grid">
          <article className="quality-metric-card">
            <span>Average Order Value</span>
            <strong>{formatCurrency(averageOrderValue)}</strong>
            <p>How much customers spend per transaction.</p>
          </article>

          <article className="quality-metric-card">
            <span>Items Per Transaction</span>
            <strong>{itemsPerTransaction.toFixed(2)}</strong>
            <p>Higher means better bundling or add-on sales.</p>
          </article>

          <article className="quality-metric-card">
            <span>Revenue Per Item</span>
            <strong>{formatCurrency(revenuePerItem)}</strong>
            <p>Helps judge pricing and product mix quality.</p>
          </article>

          <article className={`quality-metric-card ${voidRate >= 10 ? "danger" : "good"}`}>
            <span>Void Rate</span>
            <strong>{formatPercent(voidRate)}</strong>
            <p>Use this to monitor transaction accuracy.</p>
          </article>
        </div>
      </section>

      <section className="reports-grid-two">
        <article className="reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="sales-reports-kicker">Revenue Trend</p>
              <h3>Sales Movement</h3>
            </div>
          </div>

          <div className="trend-list">
            {trendRows.length === 0 ? (
              <div className="reports-empty-card">
                <h4>No trend yet</h4>
                <p>Completed sales will appear here once available.</p>
              </div>
            ) : (
              trendRows.map((row) => (
                <div className="trend-row" key={row.label}>
                  <div className="trend-row-header">
                    <strong>{row.label}</strong>
                    <span>{formatCurrency(row.amount)}</span>
                  </div>

                  <div className="trend-bar-track">
                    <div
                      className="trend-bar-fill"
                      style={{ width: `${Math.max((row.amount / maxTrendAmount) * 100, 6)}%` }}
                    />
                  </div>

                  <p>{row.transactions} transaction/s</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="sales-reports-kicker">Payments</p>
              <h3>Payment Breakdown</h3>
            </div>
          </div>

          <div className="payment-breakdown-list">
            {paymentBreakdown.map((payment) => (
              <div className="payment-breakdown-row" key={payment.method}>
                <div>
                  <strong>{payment.method}</strong>
                  <p>
                    {payment.count} transaction/s • {formatPercent(payment.share)}
                  </p>
                </div>

                <span>{formatCurrency(payment.amount)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="reports-grid-two">
        <article className="reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="sales-reports-kicker">Product Performance</p>
              <h3>Best by Revenue</h3>
            </div>
          </div>

          <div className="best-seller-list">
            {bestByRevenue.length === 0 ? (
              <div className="reports-empty-card">
                <h4>No product sales yet</h4>
                <p>Completed product sales for this period will appear here.</p>
              </div>
            ) : (
              bestByRevenue.map((item, index) => (
                <div className="best-seller-row" key={item.key}>
                  <span className="best-seller-rank">#{index + 1}</span>

                  <div>
                    <strong>{item.productName}</strong>
                    <p>
                      {item.sizeName} • {item.quantity} sold •{" "}
                      {formatCurrency(item.averageRevenuePerUnit)} per item
                    </p>
                  </div>

                  <span>{formatCurrency(item.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="sales-reports-kicker">Product Demand</p>
              <h3>Best by Quantity</h3>
            </div>
          </div>

          <div className="best-seller-list">
            {bestByQuantity.length === 0 ? (
              <div className="reports-empty-card">
                <h4>No product demand yet</h4>
                <p>Items sold by quantity will appear here.</p>
              </div>
            ) : (
              bestByQuantity.map((item, index) => (
                <div className="best-seller-row" key={item.key}>
                  <span className="best-seller-rank">#{index + 1}</span>

                  <div>
                    <strong>{item.productName}</strong>
                    <p>
                      {item.sizeName} • {item.quantity} sold •{" "}
                      {formatCurrency(item.revenue)} revenue
                    </p>
                  </div>

                  <span>{item.quantity} sold</span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="reports-grid-two">
        <article className="reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="sales-reports-kicker">Watchlist</p>
              <h3>Low Performer Review</h3>
            </div>
          </div>

          <div className="best-seller-list">
            {lowPerformerWatchlist.length === 0 ? (
              <div className="reports-empty-card">
                <h4>No low performers yet</h4>
                <p>This will show products with very low movement in the selected period.</p>
              </div>
            ) : (
              lowPerformerWatchlist.map((item) => (
                <div className="best-seller-row watchlist" key={item.key}>
                  <div>
                    <strong>{item.productName}</strong>
                    <p>
                      {item.sizeName} • only {item.quantity} sold • review pricing,
                      placement, or demand.
                    </p>
                  </div>

                  <span>{formatCurrency(item.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="sales-reports-kicker">Accountability</p>
              <h3>Void Analysis</h3>
            </div>

            <span className="reports-count-pill">{voidedSales.length} void/s</span>
          </div>

          <div className="void-analysis-summary">
            <article>
              <span>Voided Amount</span>
              <strong>{formatCurrency(voidedAmount)}</strong>
            </article>

            <article>
              <span>Void Rate</span>
              <strong>{formatPercent(voidRate)}</strong>
            </article>
          </div>

          <div className="reports-transaction-list">
            {voidedSales.length === 0 ? (
              <div className="reports-empty-card">
                <h4>No voided sales</h4>
                <p>No voided transactions found for this period.</p>
              </div>
            ) : (
              voidedSales.slice(0, 5).map((sale) => (
                <article className="reports-transaction-card voided-card" key={sale.id}>
                  <div>
                    <div className="reports-transaction-title">
                      <h4>{sale.saleNumber}</h4>
                      <span className="reports-status-pill voided">Voided</span>
                    </div>

                    <p>
                      {formatFriendlyDate(sale)} • {sale.paymentMethod} • {sale.totalItems} item/s
                    </p>

                    {sale.voidReason && (
                      <p className="void-reason-text">Reason: {sale.voidReason}</p>
                    )}
                  </div>

                  <strong>{formatCurrency(sale.totalAmount)}</strong>
                </article>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="reports-panel">
        <div className="reports-panel-header">
          <div>
            <p className="sales-reports-kicker">History</p>
            <h3>Recent Transactions</h3>
          </div>

          <span className="reports-count-pill">{filteredSales.length} sale/s</span>
        </div>

        <div className="reports-transaction-list">
          {isLoading ? (
            <div className="reports-empty-card">
              <h4>Loading reports...</h4>
              <p>Please wait while sales data is being prepared.</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="reports-empty-card">
              <h4>No sales found</h4>
              <p>No sales were recorded for the selected coverage.</p>
            </div>
          ) : (
            filteredSales.slice(0, 20).map((sale) => (
              <article className="reports-transaction-card" key={sale.id}>
                <div>
                  <div className="reports-transaction-title">
                    <h4>{sale.saleNumber}</h4>
                    <span className={`reports-status-pill ${sale.status}`}>
                      {sale.status}
                    </span>
                  </div>

                  <p>
                    {formatFriendlyDate(sale)} • {sale.paymentMethod} • {sale.totalItems} item/s
                  </p>
                </div>

                <strong>{formatCurrency(sale.totalAmount)}</strong>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

export default SalesReportsPage;