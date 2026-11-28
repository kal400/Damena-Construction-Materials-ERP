import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/server';
import ExpensesPage, { type ExpenseRecord } from '@/app/expenses/expenses-page';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await client
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'manager') {
    redirect('/manager/expenses');
  }

  const isAdmin = profile?.role !== 'super_admin';

  let expenses: ExpenseRecord[] = [];
  let tableMissing = false;

  const serviceClient = getServiceClient() || client;
  const columnsWithDelivery =
    'id,expense_date,category,item_name,amount,quantity,delivery_status,verified_quantity,notes,created_at,profiles:recorded_by(display_name)';
  const baseColumns =
    'id,expense_date,category,item_name,amount,notes,created_at,profiles:recorded_by(display_name)';

  let rawData: unknown[] | null = null;
  const initialRes = await serviceClient
    .from('expenses')
    .select(columnsWithDelivery)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  let error = initialRes.error;
  if (!error) {
    rawData = initialRes.data;
  } else if (error.message?.includes('column') || error.code === '42703') {
    const fallbackRes = await serviceClient
      .from('expenses')
      .select(baseColumns)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });
    rawData = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      tableMissing = true;
    }
  } else {
    expenses = (rawData as unknown as ExpenseRecord[]) || [];
  }

  // SECURITY: Admin must NEVER see cement prices — exclude cement expenses from admin view
  const visibleExpenses = isAdmin
    ? expenses.filter(
        (e) =>
          !e.item_name.includes('ሲሚንቶ') &&
          !e.item_name.toLowerCase().includes('cement')
      )
    : expenses;

  return (
    <ExpensesPage
      expenses={visibleExpenses}
      returnTo="/app/expenses"
      title="ወጪ (ግዢ)"
      description="ለቴራሶ እና ብሎኬት (አሸዋ፣ ኮሚቼ፣ ጠጠር)፣ ለባትሪ አሲድ እና ለሌሎች ወጪዎች የሚወጣውን ገንዘብ ይመዝግቡ።"
      searchParams={await searchParams}
      tableMissing={tableMissing}
      hideCementPreset={isAdmin}
    />
  );
}
