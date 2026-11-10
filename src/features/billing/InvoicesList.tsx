import { useState } from 'react';
import { Button, Input, Table, EmptyState, LoadingSpinner } from '../../components/ui';
import { useInvoices } from './useInvoices';
import { useBillingSummary } from './useBillingActions';
import { formatNaira } from '../../lib/formatters';
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  type InvoiceStatus,
  type StatusFilter,
} from './types';

type StatusFilterValue = StatusFilter;

export const InvoicesList = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const today = new Date().toISOString().split('T')[0];

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
      totalKoboFormatted: formatNaira(inv.total_kobo),
      balanceKobo: inv.total_kobo - inv.amount_paid_kobo,
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
        <Button>New Invoice</Button>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-card bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Billed</div>
          <div className="text-lg font-bold">
            {summaryLoading ? '--' : formatNaira(summary?.[0]?.total_billed_kobo ?? 0)}
          </div>
        </div>
        <div className="p-4 border rounded-card bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Collected</div>
          <div className="text-lg font-bold text-status-success">
            {summaryLoading ? '--' : formatNaira(summary?.[0]?.total_collected_kobo ?? 0)}
          </div>
        </div>
        <div className="p-4 border rounded-card bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Outstanding</div>
          <div className="text-lg font-bold text-status-error">
            {summaryLoading ? '--' : formatNaira(summary?.[0]?.total_outstanding_kobo ?? 0)}
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
    </div>
  );
};
