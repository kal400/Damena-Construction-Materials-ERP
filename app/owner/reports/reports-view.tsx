'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  ChartNoAxesCombined,
  Receipt,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  PackageMinus,
  Printer,
  FileSpreadsheet,
  Layers,
  Wallet,
  CheckCircle2,
  X,
} from 'lucide-react';
import { formatEthiopicDate } from '@/lib/ethiopian-calendar';
import { EthiopianDatePicker } from '@/components/ethiopian-date-picker';
import { resolveProductionAlert } from '@/app/actions/resolve-production-alert';
import {
  exportReportToPrint,
  ReportExportType,
  ReportExportData,
} from '@/lib/report-exporter';
import { exportReportToExcel } from '@/lib/excel-exporter';

type Sale = {
  id: string;
  invoice_number: string;
  sale_date: string;
  customer_name: string | null;
  total_amount: number;
  paid_amount: number;
  status: string;
  recorded_by: string | null;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  sale_lines?: {
    item_name_snapshot: string;
    quantity: number;
    unit_snapshot: string;
    unit_price: number;
  }[];
};

const recordedBy = (value: Sale['profiles']) => {
  const profile = Array.isArray(value) ? value[0] : value;
  return profile?.display_name || 'ያልታወቀ ተጠቃሚ';
};

const relation = <T,>(value: T | T[] | null | undefined): T | null | undefined =>
  Array.isArray(value) ? value[0] : value;

type Service = {
  id: string;
  service_type: string;
  customer_name: string | null;
  amount: number;
  created_at: string;
};

type Payroll = {
  id: string;
  worker_name: string | null;
  pay_type: string;
  period_start: string;
  amount: number;
  status: string;
};

type Production = {
  id: string;
  production_date: string;
  output_quantity: number;
  output_product_id: string;
};

type AuditEntry = {
  id: string;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

export type BreakageReportItem = {
  id: string;
  product_id: string;
  quantity_delta: number;
  movement_type: string;
  reason: string;
  created_at: string;
  products?: {
    name: string;
    unit: string;
    selling_price: number | null;
  } | {
    name: string;
    unit: string;
    selling_price: number | null;
  }[] | null;
};

export type ExpenseReportItem = {
  id: string;
  expense_date: string;
  category: string;
  item_name: string;
  amount: number;
  notes: string | null;
  profiles?: { display_name: string | null } | { display_name: string | null }[] | null;
};

interface ReportsViewProps {
  basePath?: string;
  mode: string;
  from: string;
  to: string;
  sales: Sale[];
  services: Service[];
  payroll: Payroll[];
  production: Production[];
  products?: { id: string; name: string }[];
  audit: AuditEntry[];
  breakages?: BreakageReportItem[];
  expenses?: ExpenseReportItem[];
  cementYieldChecks: {
    date: string;
    productName: string;
    productKey: string;
    cement: number;
    blocks: number;
    minimum: number;
    maximum: number;
    flagged: boolean;
    explanation: string;
  }[];
}

const money = (n: number) =>
  `ብር ${Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;

const moneyKeys = new Set([
  'amount',
  'total_amount',
  'paid_amount',
  'selling_price',
  'unit_price',
  'rate_snapshot',
]);

const labelFor = (key: string) =>
  ({
    sale: 'የሽያጭ መዝገብ',
    service_payment: 'የአገልግሎት ክፍያ',
    payroll: 'የደመወዝ ክፍያ',
    production: 'የምርት ምዝገባ',
    stock_movement: 'የክምችት እንቅስቃሴ',
    product_price: 'የምርት ዋጋ',
    stock_threshold: 'የማስጠንቀቂያ መጠን',
  }[key] || key.replaceAll('_', ' '));

const flatten = (v: unknown, prefix = ''): Record<string, unknown> => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>).reduce(
      (o, [k, x]) => ({ ...o, ...flatten(x, prefix ? `${prefix}.${k}` : k) }),
      {}
    );
  }
  return { [prefix]: v };
};

const showValue = (key: string, value: unknown) =>
  value == null || value === ''
    ? '—'
    : moneyKeys.has(key.split('.').at(-1) || '') && Number.isFinite(Number(value))
    ? money(Number(value))
    : String(value);

export default function ReportsView({
  basePath = '/owner/reports',
  mode,
  from,
  to,
  sales,
  services,
  payroll,
  production,
  products = [],
  audit,
  breakages = [],
  expenses = [],
  cementYieldChecks,
}: ReportsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'daily' | 'sales' | 'expenses' | 'breakage' | 'payroll' | 'audit'>('daily');
  const [customOpen, setCustomOpen] = useState(mode === 'custom');
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);

  // Financial totals
  const collections = sales.reduce((n, s) => n + Number(s.paid_amount), 0);
  const serviceIncome = services.reduce((n, s) => n + Number(s.amount), 0);
  const payrollPaid = payroll.reduce((n, p) => n + Number(p.amount), 0);
  const expensesPaid = expenses.reduce((n, e) => n + Number(e.amount), 0);
  const totalInflow = collections + serviceIncome;
  const totalOutflow = payrollPaid + expensesPaid;
  const netProfit = totalInflow - totalOutflow;

  const totalBrokenPieces = breakages.reduce((n, b) => n + Math.abs(Number(b.quantity_delta)), 0);

  // Daily map
  const byDay = new Map<
    string,
    { sales: number; services: number; payroll: number; expenses: number; production: number; breakage: number }
  >();
  const daily = (date: string) => {
    if (!byDay.has(date)) byDay.set(date, { sales: 0, services: 0, payroll: 0, expenses: 0, production: 0, breakage: 0 });
    return byDay.get(date)!;
  };

  sales.forEach((s) => (daily(s.sale_date).sales += Number(s.total_amount)));
  services.forEach((s) => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(
      new Date(s.created_at)
    );
    daily(d).services += Number(s.amount);
  });
  payroll.forEach((p) => (daily(p.period_start).payroll += Number(p.amount)));
  expenses.forEach((e) => (daily(e.expense_date).expenses += Number(e.amount)));
  production.forEach((p) => (daily(p.production_date).production += Number(p.output_quantity)));
  breakages.forEach((b) => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(
      new Date(b.created_at)
    );
    daily(d).breakage += Math.abs(Number(b.quantity_delta));
  });

  const exportData: ReportExportData = {
    from,
    to,
    sales,
    services,
    expenses,
    payroll,
    production,
    products,
    breakages,
    cementYieldChecks,
  };

  const handleExportCsv = (type: ReportExportType = 'all') => {
    void exportReportToExcel(type, exportData);
  };

  const handleExportPrint = (type: ReportExportType = 'all') => {
    exportReportToPrint(type, exportData);
  };

  const dailyRows = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const PAGE_SIZE = 10;
  const [dailyPage, setDailyPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [servicePage, setServicePage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [productionPage, setProductionPage] = useState(1);
  const [breakagePage, setBreakagePage] = useState(1);
  const [payrollPage, setPayrollPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);

  const totalDailyPages = Math.max(1, Math.ceil(dailyRows.length / PAGE_SIZE));
  const pagedDailyRows = dailyRows.slice((dailyPage - 1) * PAGE_SIZE, dailyPage * PAGE_SIZE);

  const totalSalesPages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const pagedSales = sales.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE);

  const totalServicePages = Math.max(1, Math.ceil(services.length / PAGE_SIZE));
  const pagedServices = services.slice((servicePage - 1) * PAGE_SIZE, servicePage * PAGE_SIZE);

  const totalAuditPages = Math.max(1, Math.ceil(audit.length / PAGE_SIZE));
  const pagedAudit = audit.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  const totalProductionPages = Math.max(1, Math.ceil(production.length / PAGE_SIZE));
  const pagedProduction = production.slice((productionPage - 1) * PAGE_SIZE, productionPage * PAGE_SIZE);

  const totalBreakagePages = Math.max(1, Math.ceil(breakages.length / PAGE_SIZE));
  const pagedBreakages = breakages.slice((breakagePage - 1) * PAGE_SIZE, breakagePage * PAGE_SIZE);

  const totalPayrollPages = Math.max(1, Math.ceil(payroll.length / PAGE_SIZE));
  const pagedPayroll = payroll.slice((payrollPage - 1) * PAGE_SIZE, payrollPage * PAGE_SIZE);

  const totalExpensesPages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const pagedExpenses = expenses.slice((expensesPage - 1) * PAGE_SIZE, expensesPage * PAGE_SIZE);

  const applyPeriod = (newMode: string) => {
    if (newMode === 'custom') {
      setCustomOpen(true);
    } else {
      setCustomOpen(false);
      setDailyPage(1);
      setSalesPage(1);
      setBreakagePage(1);
      setAuditPage(1);
      router.push(`${basePath}?period=${newMode}`);
    }
  };

  const submitCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    setDailyPage(1);
    setSalesPage(1);
    setBreakagePage(1);
    setAuditPage(1);
    router.push(`${basePath}?period=custom&from=${fromDate}&to=${toDate}`);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* =========================================================================
          PRODUCT CERTIFICATION ALERT (RED ONLY WHEN DEFICIT FLAGGED)
      ========================================================================= */}
      {cementYieldChecks.some((c) => c.flagged) && (
        <section className="bg-red-50 border-2 border-red-500 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-red-200 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
              <h2 className="text-xs sm:text-sm font-black text-red-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>የምርት ጉድለት ማስጠንቀቂያ (ከ1 ከረጢት በላይ ጉድለት)</span>
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] sm:text-xs font-black font-mono">
              ጉድለት ተገኝቷል
            </span>
          </div>

          {/* Mobile View: Cards */}
          <div className="space-y-2.5 sm:hidden">
            {cementYieldChecks
              .filter((c) => c.flagged)
              .map((check, idx) => (
                <div
                  key={`${check.date}-${check.productKey}-${idx}`}
                  className="bg-white rounded-xl border border-red-300 p-3 space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-slate-900">{check.productName}</span>
                    <span className="text-[10px] font-mono text-slate-400">{formatEthiopicDate(check.date)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-red-50/60 p-2 rounded-lg font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 font-sans block">የወጣ ሲሚንቶ</span>
                      <span className="font-bold text-slate-900">{check.cement} ከረጢት</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-sans block">የቀኑ ምርት</span>
                      <span className="font-bold text-red-600">{check.blocks.toLocaleString()} ብሎክ</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-red-600 text-white text-[11px] font-bold">
                    ⚠ {check.explanation}
                  </div>
                  {(basePath === '/manager/reports' || basePath === '/owner/reports') && (
                    <form action={resolveProductionAlert} className="flex items-center gap-1.5 pt-1">
                      <input type="hidden" name="period_key" value={check.date} />
                      <input type="hidden" name="product_key" value={check.productKey} />
                      <input type="hidden" name="return_to" value={`${basePath}?period=${mode}`} />
                      <input
                        name="resolution_note"
                        placeholder="ማብራሪያ (አማራጭ)..."
                        className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded-lg border border-red-200 bg-red-50/40"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>ተጣርቷል (አንሳ)</span>
                      </button>
                    </form>
                  )}
                </div>
              ))}
          </div>

          {/* Desktop View: Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-red-200 text-[10px] font-black uppercase text-red-800">
                <tr>
                  <th className="px-3 py-2">ቀን</th>
                  <th className="px-3 py-2">የምርት ዓይነት</th>
                  <th className="px-3 py-2">የወጣ ሲሚንቶ</th>
                  <th className="px-3 py-2">የቀኑ ምርት</th>
                  <th className="px-3 py-2">የሚጠበቀው</th>
                  <th className="px-3 py-2">ሁኔታ</th>
                  {(basePath === '/manager/reports' || basePath === '/owner/reports') && (
                    <th className="px-3 py-2 text-right">እርምጃ</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-red-200/60 bg-white rounded-xl">
                {cementYieldChecks
                  .filter((c) => c.flagged)
                  .map((check, idx) => (
                    <tr key={`${check.date}-${check.productKey}-${idx}`} className="bg-red-50/70 font-semibold">
                      <td className="px-3 py-2.5 font-mono text-slate-900">{formatEthiopicDate(check.date)}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{check.productName}</td>
                      <td className="px-3 py-2.5 font-mono">{check.cement} ከረጢት</td>
                      <td className="px-3 py-2.5 font-mono font-black text-red-600">
                        {check.blocks.toLocaleString()} ብሎክ
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-500">
                        {check.minimum.toLocaleString()}–{check.maximum.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="bg-red-600 text-white px-2.5 py-1 rounded-md text-[10px] font-bold">
                          ⚠ {check.explanation}
                        </span>
                      </td>
                      {(basePath === '/manager/reports' || basePath === '/owner/reports') && (
                        <td className="px-3 py-2.5 text-right">
                          <form action={resolveProductionAlert} className="inline-flex items-center gap-1.5">
                            <input type="hidden" name="period_key" value={check.date} />
                            <input type="hidden" name="product_key" value={check.productKey} />
                            <input type="hidden" name="return_to" value={`${basePath}?period=${mode}`} />
                            <input
                              name="resolution_note"
                              placeholder="ማብራሪያ..."
                              className="w-28 px-2 py-1 text-[11px] rounded-lg border border-red-200 bg-white"
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>ተጣርቷል (አንሳ)</span>
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* =========================================================================
          HEADER ROW & RESPONSIVE PERIOD SELECTOR
      ========================================================================= */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-2xs space-y-4">
        {/* Top Row: Title + Date on Left, Master Export Buttons on Right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-[11px] sm:text-xs font-mono text-slate-500 uppercase font-bold tracking-wider">
                የተጣራ የሂሳብ መረጃ
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight font-sans">
              የፋይናንስ እና የስራ ሪፖርቶች
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 flex items-center gap-1.5 font-mono">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>ከ {formatEthiopicDate(from, { withYearSuffix: true })} እስከ {formatEthiopicDate(to, { withYearSuffix: true })}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleExportPrint('all')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl sm:rounded-2xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span>ሁሉንም አትም</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportCsv('all')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl sm:rounded-2xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
              <span>ሁሉንም ኤክሴል</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Full-Width Clean Segmented Period Control (Never Clips!) */}
        <nav
          aria-label="Period selector"
          className="grid grid-cols-3 sm:grid-cols-6 w-full bg-slate-100 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 gap-1"
        >
          {[
            { id: 'daily', mobileLabel: 'ዛሬ', fullLabel: 'ዛሬ' },
            { id: 'weekly', mobileLabel: '7 ቀን', fullLabel: '7 ቀናት' },
            { id: 'monthly', mobileLabel: 'ይህ ወር', fullLabel: 'ይህ ወር' },
            { id: 'half_year', mobileLabel: '6 ወር', fullLabel: '6 ወር' },
            { id: 'year', mobileLabel: '1 ዓመት', fullLabel: '1 ዓመት' },
            { id: 'custom', mobileLabel: 'ብጁ', fullLabel: 'ብጁ ቀን' },
          ].map((item) => {
            const isSelected = mode === item.id || (item.id === 'custom' && customOpen);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPeriod(item.id)}
                className={`text-center py-2 px-2 sm:px-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span className="sm:hidden">{item.mobileLabel}</span>
                <span className="hidden sm:inline">{item.fullLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Custom Date Form (Shown when custom is selected) */}
      {customOpen && (
        <form
          onSubmit={submitCustomRange}
          className="p-3.5 sm:p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2 flex-1">
            <label className="text-xs font-bold text-slate-600 shrink-0">ከ:</label>
            <EthiopianDatePicker
              value={fromDate}
              onChange={(iso) => setFromDate(iso)}
              compact
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <label className="text-xs font-bold text-slate-600 shrink-0">እስከ:</label>
            <EthiopianDatePicker
              value={toDate}
              onChange={(iso) => setToDate(iso)}
              compact
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>ሪፖርት አውጣ</span>
            </button>
            <button
              type="button"
              onClick={() => applyPeriod('monthly')}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="ዝጋ እና ወደ ወር ተመለስ"
              aria-label="Close date filter and return to monthly"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* =========================================================================
          FINANCIAL KPI SUMMARY (MONEY IN & OUT)
      ========================================================================= */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* Mobile View: Side-by-side executive stat tiles */}
        <div className="grid grid-cols-2 gap-2.5 sm:hidden">
          {/* Money In */}
          <div className="bg-gradient-to-br from-emerald-50/80 to-white rounded-2xl p-3.5 border border-emerald-200/90 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                  የገባ ገቢ
                </span>
                <span className="w-6 h-6 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-base xs:text-lg font-black font-mono text-emerald-600 tracking-tight leading-none">
                +{money(totalInflow)}
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-emerald-100/80 text-[10px] font-mono text-slate-500 space-y-0.5">
              <div className="truncate">ሽያጭ: <span className="font-semibold text-slate-700">{money(collections)}</span></div>
              <div className="truncate">አገልግሎት: <span className="font-semibold text-slate-700">{money(serviceIncome)}</span></div>
            </div>
          </div>

          {/* Money Out */}
          <div className="bg-gradient-to-br from-rose-50/80 to-white rounded-2xl p-3.5 border border-rose-200/90 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider">
                  የወጣ ወጪ
                </span>
                <span className="w-6 h-6 rounded-lg bg-rose-100/80 text-rose-700 flex items-center justify-center">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-base xs:text-lg font-black font-mono text-rose-600 tracking-tight leading-none">
                -{money(totalOutflow)}
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-rose-100/80 text-[10px] font-mono text-slate-500 space-y-0.5">
              <div className="truncate">ደመወዝ: <span className="font-semibold text-slate-700">{money(payrollPaid)}</span></div>
              <div className="truncate">ዕቃዎች/ሌላ: <span className="font-semibold text-slate-700">{money(expensesPaid)}</span></div>
              <div className="truncate font-bold">
                ትርፍ: <span className={netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{money(netProfit)}</span>
              </div>
              {totalBrokenPieces > 0 && (
                <div className="truncate text-amber-600 font-bold">
                  ስብርባሪ፦ {totalBrokenPieces} ፍሬ
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop View: Full Spacious Cards */}
        <div className="hidden sm:grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                ጠቅላላ የገባ ገቢ
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-600 tracking-tight">
                +{money(totalInflow)}
              </div>
              <p className="text-xs text-slate-500 mt-1">የምርት ሽያጭ እና የአገልግሎት ገቢዎች</p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>የምርት ሽያጭ: {money(collections)}</span>
              <span>አገልግሎት: {money(serviceIncome)}</span>
            </div>
          </div>

          <div className="rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                የወጣ ወጪ (ጠቅላላ)
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl sm:text-4xl font-black font-mono text-rose-600 tracking-tight">
                -{money(totalOutflow)}
              </div>
              <p className="text-xs text-slate-500 mt-1">የቀን ሰራተኞች ደመወዝ፣ የጥሬ ዕቃዎች ግዢ እና ሌሎች ወጪዎች</p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>ደመወዝ: {money(payrollPaid)}</span>
              <span>ዕቃዎች: {money(expensesPaid)}</span>
              <span className={`font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                የተጣራ ትርፍ: {money(netProfit)}
              </span>
              {totalBrokenPieces > 0 && (
                <span className="text-amber-600 font-bold">
                  ስብርባሪ፦ {totalBrokenPieces} ፍሬ
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          ACTIVITY SECTION TABS & LISTS
      ========================================================================= */}
      <div className="space-y-3.5 pt-1">
        {/* Modern Segmented Pill Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'daily', label: 'ዕለታዊ እንቅስቃሴ', count: dailyRows.length, icon: ChartNoAxesCombined },
            { id: 'sales', label: 'የሽያጭ ደረሰኞች', count: sales.length + services.length, icon: Receipt },
            { id: 'expenses', label: 'ወጪዎች', count: expenses.length, icon: ArrowUpRight },
            { id: 'breakage', label: 'ምርት', count: production.length + breakages.length, icon: Layers },
            { id: 'payroll', label: 'ደመወዝ', count: payroll.length, icon: Wallet },
            { id: 'audit', label: 'የለውጥ ታሪክ', count: audit.length, icon: Activity },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-black whitespace-nowrap rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* =========================================================================
            TAB 1: DAILY ACTIVITY
        ========================================================================= */}
        {activeTab === 'daily' && (
          <div className="space-y-3">
            {/* Quick Export Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="text-xs font-bold text-slate-600">
                ዕለታዊ የገቢና ወጪ ካሽፍሎው እንቅስቃሴ
              </span>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleExportPrint('daily')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>ዕለታዊ አትም</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCsv('daily')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 shadow-2xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ዕለታዊ ኤክሴል</span>
                </button>
              </div>
            </div>

            {/* Mobile View: Touch Cards */}
            <div className="space-y-2.5 sm:hidden">
              {pagedDailyRows.map(([date, values]) => {
                const dayIn = values.sales + values.services;
                const dayOut = values.payroll + values.expenses;
                const dayNet = dayIn - dayOut;
                return (
                  <div
                    key={date}
                    className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="font-black text-xs text-slate-900 font-mono">
                        {formatEthiopicDate(date, { withWeekday: true, withYearSuffix: true })}
                      </span>
                      <span
                        className={`text-xs font-black font-mono px-2 py-0.5 rounded-lg ${
                          dayNet >= 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        Net: {money(dayNet)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2 rounded-xl bg-slate-50">
                        <span className="text-slate-400 text-[10px] block font-sans font-semibold">ሽያጭ</span>
                        <span className="font-black text-slate-800">
                          {money(values.sales)}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50">
                        <span className="text-slate-400 text-[10px] block font-sans font-semibold">አገልግሎቶች</span>
                        <span className="font-black text-slate-800">
                          {money(values.services)}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50">
                        <span className="text-slate-400 text-[10px] block font-sans font-semibold">ደመወዝ</span>
                        <span className="font-black text-rose-600">
                          {money(values.payroll)}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50">
                        <span className="text-slate-400 text-[10px] block font-sans font-semibold">ዕቃዎች/ወጪ</span>
                        <span className="font-black text-amber-600">
                          {money(values.expenses)}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50">
                        <span className="text-slate-400 text-[10px] block font-sans font-semibold">የተመረተ</span>
                        <span className="font-black text-slate-900">
                          +{values.production.toLocaleString()} pcs
                        </span>
                      </div>
                      {values.breakage > 0 ? (
                        <div className="p-2 rounded-xl bg-rose-50/80 border border-rose-100 flex items-center justify-between">
                          <span className="text-rose-600 text-[10px] font-sans font-semibold">የተሰበረ እቃ</span>
                          <span className="font-black text-rose-700 font-mono">-{values.breakage.toLocaleString()} pcs</span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-slate-50">
                          <span className="text-slate-400 text-[10px] block font-sans font-semibold">የተሰበረ እቃ</span>
                          <span className="font-bold text-slate-400">0 pcs</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Clean Table */}
            <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">ቀን</th>
                    <th className="py-3 px-4">ሽያጭ</th>
                    <th className="py-3 px-4">አገልግሎቶች</th>
                    <th className="py-3 px-4">ደመወዝ</th>
                    <th className="py-3 px-4">ዕቃዎች/ወጪ</th>
                    <th className="py-3 px-4 text-right">የተመረተ</th>
                    <th className="py-3 px-4 text-right text-rose-700">የተሰበረ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {pagedDailyRows.map(([date, values]) => (
                    <tr key={date} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-black text-slate-900">
                        {formatEthiopicDate(date, { withWeekday: true, withYearSuffix: true })}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{money(values.sales)}</td>
                      <td className="py-3 px-4 text-slate-700">{money(values.services)}</td>
                      <td className="py-3 px-4 text-rose-600">{money(values.payroll)}</td>
                      <td className="py-3 px-4 text-amber-600">{money(values.expenses)}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        +{values.production.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {values.breakage > 0 ? (
                          <span className="text-rose-600">-{values.breakage.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {dailyRows.length === 0 && (
              <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                በዚህ ክፍለ-ጊዜ ምንም የተመዘገበ የስራ እንቅስቃሴ የለም።
              </div>
            )}

            {/* Pagination Controls */}
            {totalDailyPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                <button
                  type="button"
                  disabled={dailyPage <= 1}
                  onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>ቀዳሚ</span>
                </button>
                <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                  ገጽ {dailyPage} ከ {totalDailyPages}
                </span>
                <button
                  type="button"
                  disabled={dailyPage >= totalDailyPages}
                  onClick={() => setDailyPage((p) => Math.min(totalDailyPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>ቀጣይ</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 2: SALES (SOLD ITEMS)
        ========================================================================= */}
        {activeTab === 'sales' && (
          <div className="space-y-3">
            {/* Quick Export Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="text-xs font-bold text-slate-600">
                የዕቃዎች ሽያጭ ደረሰኞች እና የአገልግሎት ገቢዎች
              </span>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleExportPrint('sales')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>የሽያጭ አትም</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCsv('sales')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 shadow-2xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>የሽያጭ ኤክሴል</span>
                </button>
              </div>
            </div>
            {/* Mobile View: Touch Cards */}
            <div className="space-y-2.5 sm:hidden">
              {pagedSales.map((s) => {
                const line = s.sale_lines?.[0];
                const itemName = line?.item_name_snapshot || 'Product Sale';
                const itemQty = line ? `${line.quantity} ${line.unit_snapshot || 'pcs'}` : '';

                return (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-slate-900 truncate">
                        {itemName}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ተከፍሏል
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <div>
                        <p className="font-bold text-slate-800">
                          {itemQty ? `${itemQty} · ` : ''}{s.customer_name || 'በቀጥታ ሽያጭ'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{formatEthiopicDate(s.sale_date, { withYearSuffix: true })} · በ{recordedBy(s.profiles)} ተመዝግቧል</p>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-black text-slate-900 text-sm">
                          {money(Number(s.total_amount))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Clean Table */}
            <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">የተሸጠ እቃ</th>
                    <th className="py-3 px-4">ብዛት</th>
                    <th className="py-3 px-4">ደንበኛ</th>
                    <th className="py-3 px-4">ድምር</th>
                    <th className="py-3 px-4">የተከፈለ</th>
                    <th className="py-3 px-4 text-right">ሁኔታ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedSales.map((s) => {
                    const line = s.sale_lines?.[0];
                    const itemName = line?.item_name_snapshot || 'Product Sale';
                    const itemQty = line ? `${line.quantity} ${line.unit_snapshot || 'pcs'}` : '—';

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block">{itemName}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{formatEthiopicDate(s.sale_date, { withYearSuffix: true })}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{itemQty}</td>
                        <td className="py-3 px-4 text-slate-800">
                          {s.customer_name || 'በቀጥታ ሽያጭ'}
                          <span className="mt-0.5 block text-xs text-slate-400">በ{recordedBy(s.profiles)} ተመዝግቧል</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {money(Number(s.total_amount))}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {money(Number(s.paid_amount))}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full font-mono bg-emerald-50 text-emerald-700">
                            ተከፍሏል
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sales.length === 0 && (
              <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                በዚህ ክፍለ-ጊዜ ምንም የተመዘገበ የሽያጭ ደረሰኝ የለም።
              </div>
            )}

            {/* Pagination Controls: Product Sales */}
            {totalSalesPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                <button
                  type="button"
                  disabled={salesPage <= 1}
                  onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>ቀዳሚ</span>
                </button>
                <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                  ገጽ {salesPage} ከ {totalSalesPages}
                </span>
                <button
                  type="button"
                  disabled={salesPage >= totalSalesPages}
                  onClick={() => setSalesPage((p) => Math.min(totalSalesPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>ቀጣይ</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* SERVICE SALES SECTION (የአገልግሎት ሽያጭ) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>የአገልግሎት ሽያጭ ({services.length})</span>
                </h3>
              </div>

              {services.length > 0 ? (
                <>
                  {/* Mobile View: Service Cards */}
                  <div className="space-y-2 sm:hidden">
                    {pagedServices.map((srv) => {
                      const label =
                        {
                          battery_charging: 'ባትሪ ቻርጅ',
                          battery_acid: 'የባትሪ አሲድ መሙላት',
                          welding: 'ብየዳ',
                          door_window: 'በር እና መስኮት',
                        }[srv.service_type] || srv.service_type;

                      return (
                        <div
                          key={srv.id}
                          className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-black text-xs text-slate-900 block">{label}</span>
                            <span className="text-[11px] text-slate-500 block">
                              {srv.customer_name || 'በቀጥታ አገልግሎት'}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatEthiopicDate(srv.created_at, { withYearSuffix: true })}
                            </span>
                          </div>
                          <span className="font-mono font-black text-sm text-emerald-600">
                            +{money(Number(srv.amount))}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop View: Service Table */}
                  <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">ቀን</th>
                          <th className="py-3 px-4">የአገልግሎት ዓይነት</th>
                          <th className="py-3 px-4">ደንበኛ</th>
                          <th className="py-3 px-4 text-right">መጠን (ብር)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedServices.map((srv) => {
                          const label =
                            {
                              battery_charging: 'ባትሪ ቻርጅ',
                              battery_acid: 'የባትሪ አሲድ መሙላት',
                              welding: 'ብየዳ',
                              door_window: 'በር እና መስኮት',
                            }[srv.service_type] || srv.service_type;

                          return (
                            <tr key={srv.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4 font-mono text-xs text-slate-500">
                                {formatEthiopicDate(srv.created_at, { withYearSuffix: true })}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900">{label}</td>
                              <td className="py-3 px-4 text-slate-700">
                                {srv.customer_name || 'በቀጥታ አገልግሎት'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                                +{money(Number(srv.amount))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls: Service Sales */}
                  {totalServicePages > 1 && (
                    <div className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                      <button
                        type="button"
                        disabled={servicePage <= 1}
                        onClick={() => setServicePage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>ቀዳሚ</span>
                      </button>
                      <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                        ገጽ {servicePage} ከ {totalServicePages}
                      </span>
                      <button
                        type="button"
                        disabled={servicePage >= totalServicePages}
                        onClick={() => setServicePage((p) => Math.min(totalServicePages, p + 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <span>ቀጣይ</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                  በዚህ ክፍለ-ጊዜ ምንም የተመዘገበ የአገልግሎት ሽያጭ የለም።
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB: PRODUCTION & BREAKAGES (ምርት እና የተሰበሩ እቃዎች - SIDE BY SIDE)
        ========================================================================= */}
        {activeTab === 'breakage' && (
          <div className="space-y-4">
            {/* Quick Export Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="text-xs font-bold text-slate-600">
                የምርት እና የስብርባሪ ዕቃዎች ሪፖርት
              </span>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleExportPrint('production')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>ምርት አትም</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCsv('production')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 shadow-2xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ምርት ኤክሴል</span>
                </button>
              </div>
            </div>

            {/* Side-by-Side Grid: Production (Left) & Breakages (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {/* LEFT: PRODUCTION RUNS */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <span>የተመረቱ ምርቶች ({production.length})</span>
                  </h3>
                </div>

                {production.length > 0 ? (
                  <>
                    {/* Mobile Cards: Production */}
                    <div className="space-y-2 sm:hidden">
                      {pagedProduction.map((run) => {
                        const prodName =
                          products.find((pr) => pr.id === run.output_product_id)?.name || 'ምርት';
                        return (
                          <div key={run.id} className="p-3 rounded-2xl border border-slate-200/90 bg-white shadow-2xs flex items-center justify-between gap-2">
                            <div>
                              <span className="font-bold text-xs text-slate-900 block">{prodName}</span>
                              <span className="text-[11px] font-mono text-slate-400">
                                {formatEthiopicDate(run.production_date, { withYearSuffix: true })}
                              </span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black font-mono">
                              +{Number(run.output_quantity || 0).toLocaleString()} ፍሬ
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table: Production */}
                    <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3.5">ቀን</th>
                            <th className="py-2.5 px-3.5">የምርት ዓይነት</th>
                            <th className="py-2.5 px-3.5 text-right">የተመረተ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {pagedProduction.map((run) => {
                            const prodName =
                              products.find((pr) => pr.id === run.output_product_id)?.name || 'ምርት';
                            return (
                              <tr key={run.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2.5 px-3.5 font-mono text-xs text-slate-500 whitespace-nowrap">
                                  {formatEthiopicDate(run.production_date, { withYearSuffix: true })}
                                </td>
                                <td className="py-2.5 px-3.5 font-bold text-slate-900">{prodName}</td>
                                <td className="py-2.5 px-3.5 text-right font-mono whitespace-nowrap">
                                  <span className="inline-block px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-xs">
                                    +{Number(run.output_quantity || 0).toLocaleString()} ፍሬ
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination: Production */}
                    {totalProductionPages > 1 && (
                      <div className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                        <button
                          type="button"
                          disabled={productionPage <= 1}
                          onClick={() => setProductionPage((p) => Math.max(1, p - 1))}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>ቀዳሚ</span>
                        </button>
                        <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                          ገጽ {productionPage} ከ {totalProductionPages}
                        </span>
                        <button
                          type="button"
                          disabled={productionPage >= totalProductionPages}
                          onClick={() => setProductionPage((p) => Math.min(totalProductionPages, p + 1))}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <span>ቀጣይ</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                    በዚህ ክፍለ-ጊዜ ውስጥ ምንም የተመረተ ምርት የለም።
                  </div>
                )}
              </div>

              {/* RIGHT: BREAKAGES */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <PackageMinus className="w-3.5 h-3.5 text-rose-600" />
                    <span>የተሰበሩ እቃዎች ({breakages.length})</span>
                  </h3>
                </div>

                {breakages.length > 0 ? (
                  <>
                    {/* Mobile View: Breakage Cards */}
                    <div className="space-y-2 sm:hidden">
                      {pagedBreakages.map((item) => {
                        const prod = relation(item.products);
                        const qty = Math.abs(Number(item.quantity_delta));
                        const dateStr = formatEthiopicDate(item.created_at, { withYearSuffix: true });

                        return (
                          <div key={item.id} className="p-3 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-1.5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                              <span className="font-black text-xs text-slate-900">{prod?.name || 'ምርት'}</span>
                              <span className="px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black font-mono">
                                -{qty} {prod?.unit || 'ፍሬ'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                              <span className="truncate text-slate-700 font-sans max-w-[180px]">{item.reason}</span>
                              <span>{dateStr}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop View: Breakage Table */}
                    <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3.5">ቀን</th>
                            <th className="py-2.5 px-3.5">የምርት ዓይነት</th>
                            <th className="py-2.5 px-3.5 text-center">የተሰበረ</th>
                            <th className="py-2.5 px-3.5">ምክንያት</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {pagedBreakages.map((item) => {
                            const prod = relation(item.products);
                            const qty = Math.abs(Number(item.quantity_delta));
                            const dateStr = formatEthiopicDate(item.created_at, { withYearSuffix: true });

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2.5 px-3.5 font-mono text-xs text-slate-500 whitespace-nowrap">{dateStr}</td>
                                <td className="py-2.5 px-3.5 font-bold text-slate-900">{prod?.name || 'ምርት'}</td>
                                <td className="py-2.5 px-3.5 text-center font-mono whitespace-nowrap">
                                  <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-black text-xs">
                                    -{qty} {prod?.unit || 'ፍሬ'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3.5 text-xs text-slate-600">{item.reason}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination: Breakages */}
                    {totalBreakagePages > 1 && (
                      <div className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                        <button
                          type="button"
                          disabled={breakagePage <= 1}
                          onClick={() => setBreakagePage((p) => Math.max(1, p - 1))}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>ቀዳሚ</span>
                        </button>
                        <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                          ገጽ {breakagePage} ከ {totalBreakagePages}
                        </span>
                        <button
                          type="button"
                          disabled={breakagePage >= totalBreakagePages}
                          onClick={() => setBreakagePage((p) => Math.min(totalBreakagePages, p + 1))}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <span>ቀጣይ</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                    በዚህ ክፍለ-ጊዜ ውስጥ ምንም የተመዘገበ ስብርባሪ የለም።
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB: EXPENSES (ወጪዎች እና ግዢ - SHOWS DONE BY)
        ========================================================================= */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            {/* Quick Export Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600">የወጪዎች እና ግዢ ሪፖርት</span>
                <span className="text-xs font-mono font-black text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200">
                  ጠቅላላ፦ {money(expensesPaid)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleExportPrint('cashflow')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>ወጪ አትም</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCsv('cashflow')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 shadow-2xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ወጪ ኤክሴል</span>
                </button>
              </div>
            </div>

            {expenses.length > 0 ? (
              <>
                {/* Mobile View: Expense Cards */}
                <div className="space-y-2 sm:hidden">
                  {pagedExpenses.map((exp) => {
                    const catLabel =
                      exp.category === 'production_materials'
                        ? 'ለቴራሶ እና ብሎክ'
                        : exp.category === 'workshop_services'
                        ? 'ለአገልግሎት'
                        : 'ሌላ ወጪ';
                    return (
                      <div
                        key={exp.id}
                        className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-xs text-slate-900">{exp.item_name}</span>
                          <span className="font-mono font-black text-sm text-rose-600">
                            -{money(Number(exp.amount))}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span>{catLabel}</span>
                          <span>·</span>
                          <span className="font-mono">
                            {formatEthiopicDate(exp.expense_date, { withYearSuffix: true })}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-slate-700">
                            በ{recordedBy(exp.profiles ?? null)} ተመዝግቧል
                          </span>
                        </div>
                        {exp.notes && (
                          <p className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                            {exp.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View: Expense Table */}
                <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">ቀን</th>
                        <th className="py-3 px-4">የወጪው / እቃው ስም</th>
                        <th className="py-3 px-4">ምድብ</th>
                        <th className="py-3 px-4">የመዘገበው</th>
                        <th className="py-3 px-4">ማስታወሻ</th>
                        <th className="py-3 px-4 text-right">መጠን (ብር)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedExpenses.map((exp) => {
                        const catLabel =
                          exp.category === 'production_materials'
                            ? 'ለቴራሶ እና ብሎክ'
                            : exp.category === 'workshop_services'
                            ? 'ለአገልግሎት'
                            : 'ሌላ ወጪ';
                        return (
                          <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                              {formatEthiopicDate(exp.expense_date, { withYearSuffix: true })}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{exp.item_name}</td>
                            <td className="py-3 px-4 text-slate-600">{catLabel}</td>
                            <td className="py-3 px-4 font-semibold text-slate-800">
                              {recordedBy(exp.profiles ?? null)}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-500 max-w-xs whitespace-normal break-words">
                              {exp.notes || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                              -{money(Number(exp.amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls: Expenses */}
                {totalExpensesPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                    <button
                      type="button"
                      disabled={expensesPage <= 1}
                      onClick={() => setExpensesPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>ቀዳሚ</span>
                    </button>
                    <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                      ገጽ {expensesPage} ከ {totalExpensesPages}
                    </span>
                    <button
                      type="button"
                      disabled={expensesPage >= totalExpensesPages}
                      onClick={() => setExpensesPage((p) => Math.min(totalExpensesPages, p + 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <span>ቀጣይ</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                በዚህ ክፍለ-ጊዜ ምንም የተመዘገበ ወጪ የለም።
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB: PAYROLL (የሰራተኞች ደመወዝ)
        ========================================================================= */}
        {activeTab === 'payroll' && (
          <div className="space-y-4">
            {/* Quick Export Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600">የሰራተኞች ደመወዝ ሪፖርት</span>
                <span className="text-xs font-mono font-black text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200">
                  ጠቅላላ፦ {money(payrollPaid)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleExportPrint('payroll')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>ደመወዝ አትም</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCsv('payroll')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 shadow-2xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ደመወዝ ኤክሴል</span>
                </button>
              </div>
            </div>

            {payroll.length > 0 ? (
              <>
                {/* Mobile View: Payroll Cards */}
                <div className="space-y-2 sm:hidden">
                  {pagedPayroll.map((pay) => {
                    const typeLabel =
                      pay.pay_type === 'daily'
                        ? 'የቀን'
                        : pay.pay_type === 'weekly'
                        ? 'ሳምንታዊ'
                        : 'ወርሃዊ';
                    return (
                      <div
                        key={pay.id}
                        className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-black text-xs text-slate-900 block">
                            {pay.worker_name || 'ሰራተኛ'}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {typeLabel} · {pay.status === 'paid' ? 'ተከፍሏል' : pay.status}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {formatEthiopicDate(pay.period_start, { withYearSuffix: true })}
                          </span>
                        </div>
                        <span className="font-mono font-black text-sm text-rose-600">
                          -{money(Number(pay.amount))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View: Payroll Table */}
                <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">ቀን</th>
                        <th className="py-3 px-4">የሰራተኛ ስም</th>
                        <th className="py-3 px-4">የክፍያ ዓይነት</th>
                        <th className="py-3 px-4">ሁኔታ</th>
                        <th className="py-3 px-4 text-right">መጠን (ብር)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedPayroll.map((pay) => {
                        const typeLabel =
                          pay.pay_type === 'daily'
                            ? 'የቀን'
                            : pay.pay_type === 'weekly'
                            ? 'ሳምንታዊ'
                            : 'ወርሃዊ';
                        return (
                          <tr key={pay.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-mono text-xs text-slate-500">
                              {formatEthiopicDate(pay.period_start, { withYearSuffix: true })}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {pay.worker_name || 'ሰራተኛ'}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{typeLabel}</td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {pay.status === 'paid' ? 'ተከፍሏል' : pay.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                              -{money(Number(pay.amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls: Payroll */}
                {totalPayrollPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                    <button
                      type="button"
                      disabled={payrollPage <= 1}
                      onClick={() => setPayrollPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>ቀዳሚ</span>
                    </button>
                    <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                      ገጽ {payrollPage} ከ {totalPayrollPages}
                    </span>
                    <button
                      type="button"
                      disabled={payrollPage >= totalPayrollPages}
                      onClick={() => setPayrollPage((p) => Math.min(totalPayrollPages, p + 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <span>ቀጣይ</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                በዚህ ክፍለ-ጊዜ ምንም የተመዘገበ የደመወዝ ክፍያ የለም።
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 3: AUDIT HISTORY
        ========================================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            {pagedAudit.map((entry) => {
              const before = flatten(entry.before_data);
              const after = flatten(entry.after_data);
              const keys = [
                ...new Set([...Object.keys(before), ...Object.keys(after)]),
              ]
                .filter(
                  (key) =>
                    JSON.stringify(before[key]) !== JSON.stringify(after[key])
                )
                .filter(
                  (key) => !key.endsWith('.created_at') && !key.endsWith('.updated_at')
                )
                .slice(0, 5);

              const actor = Array.isArray(entry.profiles)
                ? entry.profiles[0]
                : entry.profiles;

              return (
                <div
                  key={entry.id}
                  className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-[11px]">
                        {labelFor(entry.entity_type)}
                      </span>
                      <span className="text-[11px] text-slate-400">በ</span>
                      <span className="text-slate-700 font-bold">
                        {actor?.display_name || 'Super Admin'}
                      </span>
                    </div>
                    <time className="text-[10px] text-slate-400 font-mono">
                      {formatEthiopicDate(entry.created_at, { withYearSuffix: true })}
                    </time>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {keys.map((key) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-mono"
                      >
                        <span className="text-slate-400 capitalize">
                          {labelFor(key.split('.').at(-1) || key)}:
                        </span>
                        <span>{showValue(key, before[key])}</span>
                        <span className="text-slate-300">→</span>
                        <span className="font-bold text-slate-900">
                          {showValue(key, after[key])}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {audit.length === 0 && (
              <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                በዚህ ክፍለ-ጊዜ ምንም የተመዘገበ የለውጥ ታሪክ የለም።
              </div>
            )}

            {/* Pagination Controls */}
            {totalAuditPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                <button
                  type="button"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>ቀዳሚ</span>
                </button>
                <span className="text-xs font-semibold font-mono text-slate-700 px-2">
                  ገጽ {auditPage} ከ {totalAuditPages}
                </span>
                <button
                  type="button"
                  disabled={auditPage >= totalAuditPages}
                  onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>ቀጣይ</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
