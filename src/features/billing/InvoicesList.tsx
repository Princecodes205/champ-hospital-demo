import { useState, useEffect } from 'react';
import { Button, Input, Table, EmptyState, LoadingSpinner, Dialog } from '../../components/ui';
import { useInvoices } from './useInvoices';
import { supabase } from '../../lib/supabase';
import { useBillingSummary } from './useBillingActions';
import { formatNaira } from '../../lib/formatters';
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  type InvoiceStatus,
  type StatusFilter,
} from './types';

type StatusFilterValue = StatusFilter;

const navigateToInvoice = (invoiceId: string) => {
  window.history.pushState({}, '', `/invoice/${invoiceId}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const InvoicesList = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [newInvoiceVisits, setNewInvoiceVisits] = useState<{
    id: string;
    patient_id: string;
    patient_name: string;
    patient_number: string;
    created_at: string;
  }[]>([]);
  const [newInvoiceLoading, setNewInvoiceLoading] = useState(false);
  const [newInvoiceError, setNewInvoiceError] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  // Load completed visits that don't already have an invoice (one invoice per visit).
  useEffect(() => {
    let mounted = true;
    const loadVisits = async () => {
      try {
        const { data: visits, error } = await supabase
          .from('visits')
          .select('id, patient_id, created_at, patients(full_name, patient_number)')
          .eq('status', 'completed')
          .order('created_at', { ascending: false });
        if (error) throw error;

        const { data: invoices, error: invError } = await supabase
          .from('invoices')
          .select('visit_id');
        if (invError) throw invError;

        const invoicedVisitIds = new Set((invoices ?? []).map(i => i.visit_id));

        const eligible = (visits ?? [])
          .filter(v => !invoicedVisitIds.has(v.id))
          .map(v => ({
            id: v.id,
            patient_id: v.patient_id,
            patient_name: (v as any).patients?.full_name ?? '-',
            patient_number: (v as any).patients?.patient_number ?? '-',
            created_at: v.created_at,
          }));

        if (mounted) setNewInvoiceVisits(eligible);
      } catch (err: any) {
        if (mounted) setNewInvoiceError(err.message || 'Failed to load visits.');
      }
    };
    loadVisits();
    return () => { mounted = false; };
  }, []);

  const handleCreateInvoice = async () => {
    if (!selectedVisitId) {
      setNewInvoiceError('Please select a visit.');
      return;
    }
    setNewInvoiceLoading(true);
    setNewInvoiceError(null);
    try {
      const visit = newInvoiceVisits.find(v => v.id === selectedVisitId);
      if (!visit) throw new Error('Visit not found.');

      const { data: services } = await supabase
        .from('services')
        .select('id, name, unit_price_kobo, is_visit_fee')
        .eq('is_active', true);

      const visitFee = services?.find(s => s.is_visit_fee);
      let subtotal = 0;

      // The live database still uses `_kobo` column names (migration 0010 has not been applied).
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          patient_id: visit.patient_id,
          visit_id: visit.id,
          invoice_number:
            'INV-' + String(Math.floor(100000 + Math.random() * 900000)).padStart(6, '0'),
          status: 'unpaid',
          subtotal_kobo: 0,
          discount_kobo: 0,
          total_kobo: 0,
          amount_paid_kobo: 0,
          created_by: (window as any).userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (invError) throw invError;

      // Add line items for visit fee + charges.
      const items: any[] = [];
      if (visitFee) {
        items.push({
          invoice_id: invoice.id,
          description: visitFee.name,
          quantity: 1,
          unit_price_kobo: visitFee.unit_price_kobo,
          line_total_kobo: visitFee.unit_price_kobo,
          source: 'visit_fee',
        });
        subtotal += visitFee.unit_price_kobo;
      }

      // Fetch visit charges for this visit.
      const { data: charges } = await supabase
        .from('visit_charges')
        .select('*, services(name, unit_price_kobo)')
        .eq('visit_id', visit.id);
      for (const c of charges ?? []) {
        const price =
          (c as any).services?.unit_price_kobo ?? (c as any).unit_price_kobo ?? 0;
        const lineTotal = price * (c.quantity || 1);
        items.push({
          invoice_id: invoice.id,
          description: (c as any).services?.name ?? 'Charge',
          quantity: c.quantity || 1,
          unit_price_kobo: price,
          line_total_kobo: lineTotal,
          source: 'service',
        });
        subtotal += lineTotal;
      }

      for (const item of items) {
        const { error: itemError } = await supabase.from('invoice_items').insert(item);
        if (itemError) throw itemError;
      }

      const { error: updError } = await supabase
        .from('invoices')
        .update({
          subtotal_kobo: subtotal,
          total_kobo: subtotal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);
      if (updError) throw updError;

      setIsNewInvoiceOpen(false);
      setSelectedVisitId(null);
      setNewInvoiceLoading(false);
      // Refresh list.
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err: any) {
      setNewInvoiceLoading(false);
      setNewInvoiceError(err.message || 'Failed to create invoice.');
    }
  };

  const { data, isLoading } = useInvoices({
    status: statusFilter,
    search: search || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate ? `${toDate}T23:59:59` : undefined,
    page,
    pageSize: 25,
  });

  const { data: summary, isLoading: summaryLoading } = useBillingSummary(
    fromDate || `${new Date(Date.now() - 13 * 86400000).toISOString().split('T')[0]}T00:00:00`,
    toDate ? `${toDate}T23:59:59` : today + 'T23:59:59',
  );

  const invoices = data?.invoices ?? [];
  const count = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / 25));

  const statusOptions: StatusFilterValue[] = ['all', 'unpaid', 'paid', 'void'];

  const tableData = invoices.map(inv => {
    const patients = (inv as any).patients as
      | { full_name: string; patient_number: string }
      | undefined;
    return {
      ...inv,
      patientName: patients?.full_name ?? '-',
      patientNumber: patients?.patient_number ?? '-',
      statusLabel: INVOICE_STATUS_LABEL[inv.status as InvoiceStatus],
      statusVariant: INVOICE_STATUS_VARIANT[inv.status as InvoiceStatus],
      totalKoboFormatted: formatNaira(inv.total_naira ?? 0),
      balanceKobo: (inv.total_naira ?? 0) - (inv.amount_paid_naira ?? 0),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Invoices are created when a visit is completed. Paid in full in a single payment.
          </p>
        </div>
        <Button
          onClick={() => {
            setNewInvoiceError(null);
            setSelectedVisitId(null);
            setIsNewInvoiceOpen(true);
          }}
        >
          New Invoice
        </Button>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-card bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Billed
          </div>
          <div className="text-lg font-bold">
            {summaryLoading ? '--' : formatNaira(summary?.[0]?.total_billed_naira ?? 0)}
          </div>
        </div>
        <div className="p-4 border rounded-card bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Collected
          </div>
          <div className="text-lg font-bold text-status-success">
            {summaryLoading ? '--' : formatNaira(summary?.[0]?.total_collected_naira ?? 0)}
          </div>
        </div>
        <div className="p-4 border rounded-card bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Outstanding
          </div>
          <div className="text-lg font-bold text-status-error">
            {summaryLoading ? '--' : formatNaira(summary?.[0]?.total_outstanding_naira ?? 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-control border bg-background px-2 py-1">
          {statusOptions.map(option => (
            <button
              key={option}
              onClick={() => setStatusFilter(option)}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                statusFilter === option
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted/50 text-foreground/70'
              }`}
            >
              {option === 'all' ? 'All' : INVOICE_STATUS_LABEL[option as InvoiceStatus]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40 h-9 text-xs px-2"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            placeholder="From"
          />
          <Input
            type="date"
            className="w-40 h-9 text-xs px-2"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            placeholder="To"
          />
        </div>

        <Input
          placeholder="Search invoice, patient name or number..."
          className="max-w-md"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : invoices.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description="Try adjusting your search, status or date filter."
        />
      ) : (
        <>
          <Table
            columns={[
              { header: 'Invoice No.', accessor: 'invoice_number' },
              { header: 'Patient', accessor: 'patientName' },
              { header: 'Patient No.', accessor: 'patientNumber' },
              { header: 'Total', accessor: 'totalKoboFormatted' },
              { header: 'Balance', accessor: 'balanceKobo' },
              { header: 'Status', accessor: 'statusLabel' },
            ]}
            data={tableData.map(row => ({
              ...row,
              balanceKobo: formatNaira(row.balanceKobo),
            }))}
            onRowClick={row => navigateToInvoice(row.id)}
          />

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Page {page} of {pageCount} ({count} invoices)
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Invoice Dialog */}
      <Dialog
        isOpen={isNewInvoiceOpen}
        onClose={() => setIsNewInvoiceOpen(false)}
        title="Create New Invoice"
      >
        <form className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create an invoice for a completed visit. One invoice per visit.
          </p>

          {newInvoiceError && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-control text-destructive text-sm">
              {newInvoiceError}
            </div>
          )}

          {newInvoiceVisits.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground bg-muted/50 rounded-lg">
              No completed visits without an invoice.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto border rounded-control p-2 bg-background">
              {newInvoiceVisits.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setSelectedVisitId(v.id);
                    setNewInvoiceError(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-control border transition-colors ${
                    selectedVisitId === v.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground hover:bg-muted/50 border-input'
                  }`}
                >
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{v.patient_name}</span>
                    <span className="text-muted-foreground">{v.patient_number}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Visit {v.created_at.slice(0, 10)}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsNewInvoiceOpen(false)}
              isLoading={newInvoiceLoading}
              disabled={newInvoiceLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedVisitId || newInvoiceLoading}
              isLoading={newInvoiceLoading}
              onClick={e => {
                e.preventDefault();
                handleCreateInvoice();
              }}
            >
              Create Invoice
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
