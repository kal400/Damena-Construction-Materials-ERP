'use client';

import React, { useState, useRef, useEffect } from 'react';
import { addExpense, updateExpense, deleteExpense } from './actions';
import {
  AlertCircle,
  CheckCircle2,
  Receipt,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  Calendar,
  MessageSquareText,
} from 'lucide-react';
import {
  ETHIOPIAN_MONTHS,
  getTodayEthiopic,
  gregorianToEthiopic,
  ethiopicToGregorian,
  formatEthiopicDate,
  getDaysInEthMonth,
  isSameEthMonth,
} from '@/lib/ethiopian-calendar';

export type ExpenseCategory = 'production_materials' | 'workshop_services' | 'other';

export interface ExpenseRecord {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  item_name: string;
  amount: number;
  quantity?: number | null;
  delivery_status?: 'pending' | 'delivered' | 'not_applicable' | null;
  verified_quantity?: number | null;
  notes: string | null;
  created_at: string;
  profiles?: { display_name: string | null } | { display_name: string | null }[] | null;
}

const CATEGORY_META: Record<
  ExpenseCategory,
  {
    label: string;
    shortLabel: string;
    dot: string;
    presets: string[];
  }
> = {
  production_materials: {
    label: 'ለቴራሶ እና ብሎክ',
    shortLabel: 'ለምርት',
    dot: 'bg-blue-500',
    presets: ['ሲሚንቶ', 'አሸዋ', 'ኮሚቼ', 'ጠጠር'],
  },
  workshop_services: {
    label: 'ለአገልግሎት',
    shortLabel: 'ለአገልግሎት',
    dot: 'bg-amber-500',
    presets: ['የባትሪ አሲድ', 'ብረት', 'ሌላ ወጪ'],
  },
  other: {
    label: 'ሌላ ወጪ',
    shortLabel: 'ሌላ',
    dot: 'bg-purple-500',
    presets: ['ሌላ ወጪ'],
  },
};

const formatCurrency = (val: number) =>
  `${Number(val || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ብር`;

export default function ExpensesPage({
  expenses,
  returnTo,
  title,
  description,
  searchParams,
  tableMissing = false,
  hideCementPreset = false,
}: {
  expenses: ExpenseRecord[];
  returnTo: '/app/expenses' | '/manager/expenses' | '/owner/expenses';
  title: string;
  description: string;
  searchParams: { error?: string; success?: string };
  tableMissing?: boolean;
  hideCementPreset?: boolean;
}) {
  const todayEth = getTodayEthiopic();

  // Create Form State - 2 Sections only: 'production_materials' & 'workshop_services'
  const [category, setCategory] = useState<'production_materials' | 'workshop_services'>('production_materials');
  const [selectedPreset, setSelectedPreset] = useState<string>(hideCementPreset ? 'አሸዋ' : 'ሲሚንቶ');
  const [customItemName, setCustomItemName] = useState<string>('');
  const [cementQuantity, setCementQuantity] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Ethiopian Date State for New Expense
  const [ethYear, setEthYear] = useState<number>(todayEth.year);
  const [ethMonth, setEthMonth] = useState<number>(todayEth.month);
  const [ethDay, setEthDay] = useState<number>(todayEth.day);

  // List & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'production_materials' | 'workshop_services'>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  // Edit / Delete Modal State
  const [editingItem, setEditingItem] = useState<ExpenseRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<ExpenseRecord | null>(null);

  // Ethiopian Date State for Edit Modal
  const [editEthYear, setEditEthYear] = useState<number>(todayEth.year);
  const [editEthMonth, setEditEthMonth] = useState<number>(todayEth.month);
  const [editEthDay, setEditEthDay] = useState<number>(todayEth.day);

  useEffect(() => {
    if (editingItem) {
      const eth = gregorianToEthiopic(editingItem.expense_date);
      setEditEthYear(eth.year);
      setEditEthMonth(eth.month);
      setEditEthDay(eth.day);
    }
  }, [editingItem]);

  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = amountInputRef.current;
    if (!el) return;
    const preventWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', preventWheel, { passive: false });
    return () => el.removeEventListener('wheel', preventWheel);
  }, []);

  // Clamp days if month changes (e.g. Pagume has 5/6 days)
  const maxDays = getDaysInEthMonth(ethYear, ethMonth);
  useEffect(() => {
    if (ethDay > maxDays) setEthDay(maxDays);
  }, [maxDays, ethDay]);

  const editMaxDays = getDaysInEthMonth(editEthYear, editEthMonth);
  useEffect(() => {
    if (editEthDay > editMaxDays) setEditEthDay(editMaxDays);
  }, [editMaxDays, editEthDay]);

  const handleSetToday = () => {
    const t = getTodayEthiopic();
    setEthYear(t.year);
    setEthMonth(t.month);
    setEthDay(t.day);
  };

  const handleCategoryChange = (nextCategory: 'production_materials' | 'workshop_services') => {
    setCategory(nextCategory);
    const defaultPreset = CATEGORY_META[nextCategory].presets[0];
    setSelectedPreset(defaultPreset);
    setCustomItemName('');
  };

  const handlePresetSelect = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'ሌላ ወጪ') {
      setCustomItemName('');
    }
  };

  // Summary Stats based on Ethiopian Calendar
  const todayTotal = expenses
    .filter((e) => e.expense_date === todayEth.isoDate)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const monthTotal = expenses
    .filter((e) => isSameEthMonth(e.expense_date, todayEth.isoDate))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Filtered List
  const filteredExpenses = expenses.filter((e) => {
    const matchesCat =
      categoryFilter === 'all'
        ? true
        : categoryFilter === 'production_materials'
        ? e.category === 'production_materials'
        : e.category === 'workshop_services' || e.category === 'other';
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      e.item_name.toLowerCase().includes(q) ||
      (e.notes && e.notes.toLowerCase().includes(q)) ||
      formatEthiopicDate(e.expense_date).toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const pagedExpenses = filteredExpenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activePresets = hideCementPreset
    ? CATEGORY_META[category].presets.filter((p) => p !== 'ሲሚንቶ')
    : CATEGORY_META[category].presets;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 1. MINIMAL HEADER + CLEAN KPI CARDS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{description}</p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <div className="bg-white border border-slate-200/80 rounded-2xl px-3.5 sm:px-4 py-2.5 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">የዛሬ ወጪ</span>
            <span className="text-sm sm:text-base font-black font-mono text-slate-900">
              {formatCurrency(todayTotal)}
            </span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl px-3.5 sm:px-4 py-2.5 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">
              የ{todayEth.monthName} ወር ወጪ
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-rose-600">
              {formatCurrency(monthTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Table Missing Notice */}
      {tableMissing && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs sm:text-sm text-amber-900 font-medium">
          የወጪ ዳታቤዝ ሰንጠረዥ (`public.expenses`) ገና አልተፈጠረም። እባክዎ `supabase/expenses_setup.sql` ን በSupabase SQL Editor ውስጥ ያስኪዱ።
        </div>
      )}

      {/* Alerts */}
      {searchParams.success && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs sm:text-sm font-semibold text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{searchParams.success}</span>
        </div>
      )}
      {searchParams.error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-900"
        >
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{searchParams.error}</span>
        </div>
      )}

      {/* 2. CLEAN DUAL-PANE WORKSPACE */}
      <div className="xl:grid xl:grid-cols-12 xl:gap-6 items-start space-y-6 xl:space-y-0">
        {/* LEFT: MINIMAL ENTRY CARD (5 cols) */}
        <form
          action={addExpense}
          className="xl:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-5"
        >
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="category" value={category} />

          <h2 className="text-sm font-bold text-slate-900">አዲስ ወጪ መዝግብ</h2>

          {/* 2-Pill Category Segmented Control */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100">
            {(['production_materials', 'workshop_services'] as const).map((cat) => {
              const meta = CATEGORY_META[cat];
              const isSelected = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Item Selection (Presets) + Conditional "ሌላ ወጪ" Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600 block">የእቃው / ወጪው ዓይነት</label>
              {selectedPreset !== 'ሌላ ወጪ' && (
                <span className="text-[11px] font-medium text-slate-400">
                  የተመረጠ፦ <strong className="text-slate-800 font-bold">{selectedPreset}</strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {activePresets.map((preset) => {
                const isSelected = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    <span className="truncate">{preset}</span>
                  </button>
                );
              })}
            </div>

            {/* If "ሌላ ወጪ" is chosen, prompt the user for the item name. Otherwise, no visible text input is needed */}
            {selectedPreset === 'ሌላ ወጪ' ? (
              <div className="pt-1.5 space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  የወጪው ዓይነት ወይም ስም ምንድን ነው? <span className="text-rose-500">*</span>
                </label>
                <input
                  name="item_name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  autoFocus
                  className="erp-input h-11 px-3.5 text-sm font-semibold text-slate-900 w-full placeholder:text-slate-400 placeholder:font-normal"
                  placeholder="የወጪውን ዓይነት ወይም ስም እዚህ ያስገቡ..."
                />
              </div>
            ) : (
              <input type="hidden" name="item_name" value={selectedPreset} />
            )}
          </div>

          {/* Cement Bag Quantity Field (Shows only when 'ሲሚንቶ' is selected) */}
          {category === 'production_materials' && selectedPreset === 'ሲሚንቶ' && (
            <div className="space-y-1.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 animate-in fade-in">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <span>የተገዛው ሲሚንቶ ብዛት (ከረጢት)</span>
                  <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-blue-700 font-semibold">
                  ለመጋዘን ቆጠራ የሚላክ
                </span>
              </div>
              <input
                name="quantity"
                type="number"
                min="1"
                step="1"
                required
                value={cementQuantity}
                onChange={(e) => setCementQuantity(e.target.value)}
                placeholder="ለምሳሌ፦ 100"
                className="erp-input h-11 px-3.5 text-sm font-mono font-bold text-slate-900 w-full bg-white"
              />
              <p className="text-[11px] text-blue-700/80">
                ማስታወሻ፦ ይህ የከረጢት ብዛት በመጋዘን ገጽ ላይ ለአድሚኑ በቆጠራ ማረጋገጫ ዝርዝር ውስጥ ይታያል።
              </p>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">መጠን (ብር)</label>
            <input
              ref={amountInputRef}
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onWheel={(e) => {
                e.currentTarget.blur();
                e.preventDefault();
              }}
              className="erp-input h-11 px-3 font-mono font-bold text-base text-slate-900 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0.00"
            />
          </div>

          {/* Ethiopian Date Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>ቀን (የኢትዮጵያ ዘመን አቆጣጠር)</span>
              </label>
              <button
                type="button"
                onClick={handleSetToday}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                title="ወደ ዛሬ ቀን መልስ"
              >
                ዛሬ
              </button>
            </div>

            <div className="grid grid-cols-12 gap-1.5">
              <select
                value={ethDay}
                onChange={(e) => setEthDay(Number(e.target.value))}
                className="col-span-3 erp-input h-11 px-2 font-mono font-bold text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl"
              >
                {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={ethMonth}
                onChange={(e) => setEthMonth(Number(e.target.value))}
                className="col-span-5 erp-input h-11 px-2 font-semibold text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl"
              >
                {ETHIOPIAN_MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={ethYear}
                onChange={(e) => setEthYear(Number(e.target.value))}
                className="col-span-4 erp-input h-11 px-2 font-mono font-bold text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl"
              >
                {[todayEth.year - 3, todayEth.year - 2, todayEth.year - 1, todayEth.year, todayEth.year + 1, todayEth.year + 2].map(
                  (y) => (
                    <option key={y} value={y}>
                      {y} ዓ.ም
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Hidden ISO date for backend persistence */}
            <input
              type="hidden"
              name="expense_date"
              value={ethiopicToGregorian(ethYear, ethMonth, ethDay)}
            />
          </div>

          {/* Optional Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">
              ማስታወሻ <span className="text-slate-400 font-normal">(አማራጭ)</span>
            </label>
            <input
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="erp-input h-10 px-3 text-xs text-slate-900 w-full placeholder:text-slate-400"
              placeholder="ለምሳሌ፦ 50 ከረጢት፣ 1 ሲኖ..."
            />
          </div>

          <button
            type="submit"
            disabled={tableMissing}
            className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>ወጪውን መዝግብ</span>
          </button>
        </form>

        {/* RIGHT: CLEAN HISTORY LIST (7 cols) */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">የወጪ ታሪክ</h2>
              <span className="text-xs font-mono font-semibold text-slate-400">
                ({filteredExpenses.length})
              </span>
            </div>

            <div className="relative w-full sm:w-52">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="ፈልግ..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          {/* Minimal Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'all', label: 'ሁሉም' },
              { id: 'production_materials', label: 'ለቴራሶ እና ብሎክ' },
              { id: 'workshop_services', label: 'ለአገልግሎት' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(tab.id as 'all' | 'production_materials' | 'workshop_services');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-lg font-semibold text-xs transition-colors shrink-0 cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Clean Structured Cards (Clear Hierarchy on Mobile & Desktop) */}
          {filteredExpenses.length > 0 ? (
            <div className="space-y-3">
              {pagedExpenses.map((exp) => {
                const meta = CATEGORY_META[exp.category] || CATEGORY_META.other;
                const orderedQty = exp.quantity != null ? Number(exp.quantity) : null;
                const verifiedQty = exp.verified_quantity != null ? Number(exp.verified_quantity) : null;
                const isShortage = orderedQty !== null && verifiedQty !== null && verifiedQty < orderedQty;
                const isSurplus = orderedQty !== null && verifiedQty !== null && verifiedQty > orderedQty;
                const missingQty = isShortage ? (orderedQty ?? 0) - (verifiedQty ?? 0) : 0;

                // Separate manager's original notes from admin store audit notes ([ቆጠራ፦ ...] / [ተጨማሪ ቆጠራ፦ ...])
                const rawNotes = exp.notes || '';
                const auditMatches = rawNotes.match(/\[(?:ተጨማሪ\s+)?ቆጠራ፦[^\]]*\]/g) || [];
                const cleanManagerNote = rawNotes
                  .replace(/\[(?:ተጨማሪ\s+)?ቆጠራ፦[^\]]*\]/g, '')
                  .replace(/(?:^\s*·\s*|\s*·\s*$)/g, '')
                  .replace(/\s*·\s*·\s*/g, ' · ')
                  .trim();

                return (
                  <div
                    key={exp.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border bg-white shadow-2xs transition-all space-y-3 ${
                      isShortage
                        ? 'border-rose-300 bg-rose-50/20'
                        : exp.delivery_status === 'pending'
                        ? 'border-amber-200 bg-amber-50/15'
                        : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    {/* 1. Card Header: Item + Category Badge on Left, Amount on Right */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-sm sm:text-base text-slate-900">
                            {exp.item_name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              exp.category === 'production_materials'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {meta.shortLabel}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono font-semibold text-slate-400">
                          {formatEthiopicDate(exp.expense_date, { withYearSuffix: true })}
                          {exp.profiles && (
                            <span className="font-sans font-medium text-slate-500">
                              {' '}
                              · በ
                              {Array.isArray(exp.profiles)
                                ? exp.profiles[0]?.display_name || '—'
                                : exp.profiles.display_name || '—'}{' '}
                              ተመዝግቧል
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                        <span className="font-mono font-black text-sm sm:text-base text-slate-900">
                          -{formatCurrency(exp.amount)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingItem(exp)}
                            className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            title="አስተካክል"
                          >
                            <Pencil className="w-3 h-3" />
                            <span className="hidden sm:inline">አስተካክል</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(exp)}
                            className="p-1.5 rounded-lg bg-rose-50/60 border border-rose-200/80 text-rose-500 hover:bg-rose-100 cursor-pointer"
                            title="ሰርዝ"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 2. Structured Cement Delivery / Stock Breakdown (Only if quantity or delivery workflow exists) */}
                    {(orderedQty !== null || exp.delivery_status) && (
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">የተገዛ ብዛት</span>
                          <span className="font-mono font-bold text-xs sm:text-sm text-slate-900">
                            {orderedQty ?? '-'} <span className="text-[10px] font-normal text-slate-500">ከረጢት</span>
                          </span>
                        </div>

                        <div className="border-x border-slate-200/80 px-1">
                          <span className="text-[10px] text-slate-400 font-semibold block">መጋዘን የገባ</span>
                          <span
                            className={`font-mono font-bold text-xs sm:text-sm ${
                              exp.delivery_status === 'pending'
                                ? 'text-amber-600'
                                : isShortage
                                ? 'text-rose-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {exp.delivery_status === 'pending'
                              ? 'በመጠባበቅ'
                              : `${verifiedQty ?? orderedQty ?? 0} ከረጢት`}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">ሁኔታ</span>
                          {exp.delivery_status === 'pending' ? (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 mt-0.5">
                              ቆጠራ ይጠብቃል
                            </span>
                          ) : isShortage ? (
                            <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 mt-0.5">
                              ⚠️ {missingQty} ጎድሏል
                            </span>
                          ) : isSurplus ? (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 mt-0.5">
                              +{(verifiedQty ?? 0) - (orderedQty ?? 0)} ትርፍ
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 mt-0.5">
                              ✓ ሙሉ ገብቷል
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3. Manager Notes & Store Admin Audit Reason (Clearly Separated!) */}
                    {(cleanManagerNote || auditMatches.length > 0) && (
                      <div className="space-y-1.5">
                        {cleanManagerNote && (
                          <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-600 flex items-start gap-2">
                            <MessageSquareText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <span className="font-bold text-slate-700 mr-1">ማስታወሻ፦</span>
                              <span className="whitespace-normal break-words">{cleanManagerNote}</span>
                            </div>
                          </div>
                        )}

                        {auditMatches.map((auditNote, idx) => {
                          const cleaned = auditNote.replace(/^\[|\]$/g, '');
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 rounded-xl border text-xs flex items-start gap-2 ${
                                isShortage
                                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                              }`}
                            >
                              <AlertCircle
                                className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                  isShortage ? 'text-rose-600' : 'text-emerald-600'
                                }`}
                              />
                              <span className="font-semibold whitespace-normal break-words">{cleaned}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>ቀዳሚ</span>
                  </button>
                  <span className="text-xs font-mono text-slate-500 px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <span>ቀጣይ</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center space-y-2">
              <Receipt className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">
                {searchQuery || categoryFilter !== 'all'
                  ? 'የተፈለገው ወጪ አልተገኘም።'
                  : 'እስካሁን ምንም ወጪ አልተመዘገበም።'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* EDIT EXPENSE MODAL */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">ወጪ አስተካክል</h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={updateExpense} className="space-y-4">
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="id" value={editingItem.id} />

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">ምድብ</label>
                <select
                  name="category"
                  defaultValue={editingItem.category === 'other' ? 'workshop_services' : editingItem.category}
                  className="erp-input h-10 px-3 text-xs font-semibold text-slate-900 w-full bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="production_materials">ለቴራሶ እና ብሎክ</option>
                  <option value="workshop_services">ለአገልግሎት</option>
                  {editingItem.category === 'other' && <option value="other">ሌላ ወጪ</option>}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">የእቃው / ወጪው ስም</label>
                <input
                  name="item_name"
                  defaultValue={editingItem.item_name}
                  required
                  className="erp-input h-10 px-3 text-sm font-semibold text-slate-900 w-full"
                />
              </div>

              {(editingItem.item_name.includes('ሲሚንቶ') || editingItem.quantity != null) && (
                <div className="space-y-1 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-950 block">
                      የሲሚንቶ ብዛት (ከረጢት)
                    </label>
                    {editingItem.verified_quantity != null && (
                      <span className="text-[10px] font-bold text-blue-700">
                        መጋዘን የገባው፦ {editingItem.verified_quantity} ከረጢት
                      </span>
                    )}
                  </div>
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={editingItem.quantity ?? ''}
                    required
                    className="erp-input h-10 px-3 font-mono font-bold text-sm text-slate-900 w-full bg-white"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">መጠን (ብር)</label>
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={editingItem.amount}
                  required
                  className="erp-input h-10 px-3 font-mono font-bold text-sm text-slate-900 w-full"
                />
              </div>

              {/* Ethiopian Date Selector for Edit Modal */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>ቀን (የኢትዮጵያ ዘመን አቆጣጠር)</span>
                </label>
                <div className="grid grid-cols-12 gap-1.5">
                  <select
                    value={editEthDay}
                    onChange={(e) => setEditEthDay(Number(e.target.value))}
                    className="col-span-3 erp-input h-10 px-2 font-mono font-bold text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {Array.from({ length: editMaxDays }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>

                  <select
                    value={editEthMonth}
                    onChange={(e) => setEditEthMonth(Number(e.target.value))}
                    className="col-span-5 erp-input h-10 px-2 font-semibold text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {ETHIOPIAN_MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    value={editEthYear}
                    onChange={(e) => setEditEthYear(Number(e.target.value))}
                    className="col-span-4 erp-input h-10 px-2 font-mono font-bold text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {[editEthYear - 3, editEthYear - 2, editEthYear - 1, editEthYear, editEthYear + 1, editEthYear + 2].map(
                      (y) => (
                        <option key={y} value={y}>
                          {y} ዓ.ም
                        </option>
                      )
                    )}
                  </select>
                </div>
                <input
                  type="hidden"
                  name="expense_date"
                  value={ethiopicToGregorian(editEthYear, editEthMonth, editEthDay)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">ማስታወሻ</label>
                <input
                  name="notes"
                  defaultValue={editingItem.notes || ''}
                  className="erp-input h-10 px-3 text-xs text-slate-900 w-full"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  ሰርዝ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  አስቀምጥ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE EXPENSE MODAL */}
      {deletingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setDeletingItem(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">ይህ ወጪ ይሰረዝ?</h3>
              <p className="text-xs text-slate-500 mt-1">
                <strong>&quot;{deletingItem.item_name}&quot;</strong> ({formatCurrency(deletingItem.amount)}) በቋሚነት ይጠፋል።
              </p>
            </div>
            <form action={deleteExpense} className="flex items-center gap-2 pt-1">
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="id" value={deletingItem.id} />
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="flex-1 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold cursor-pointer"
              >
                ተመለስ
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                አዎ፣ ሰርዝ
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
