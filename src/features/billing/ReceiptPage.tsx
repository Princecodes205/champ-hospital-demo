import { useState } from 'react';
import { Button } from '../../components/ui';
import { useInvoice } from './useInvoices';
import { useHospitalSettings } from './useBillingActions';
import { formatNaira } from '../../lib/formatters';
import { METHOD_LABEL } from './types';

// POS / thermal outlet receipt size: 80mm wide roll
const PRINT_STYLES = `
  @page {
    size: 80mm auto;
    margin: 0;
  }
  @media print {
    body {
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body * {
      visibility: hidden !important;
    }
    #receipt, #receipt * {
      visibility: visible !important;
    }
    #receipt {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-shadow: none !important;
      background: #fff !important;
      color: #111 !important;
    }
    .no-print {
      display: none !important;
    }
  }
`;

export const ReceiptPage = ({ invoiceId }: { invoiceId: string }) => {
  const [isPrinting, setIsPrinting] = useState(false);

  const { data, isLoading, error } = useInvoice(invoiceId);
  const { data: settings } = useHospitalSettings();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading receipt…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-red-600 text-xl">!</span>
          </div>
          <h3 className="text-lg font-bold">Receipt not found</h3>
          <p className="text-muted-foreground">
            We couldn't load this receipt. It may have been removed or the invoice ID is invalid.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              window.history.pushState({}, '', '/invoices');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="w-full mt-4"
          >
            Back to invoices
          </Button>
        </div>
      </div>
    );
  }

  const { invoice, items, payments } = data;
  const activePayments = payments.filter(p => !p.reversed);
  const patients = (invoice as any).patients as
    | { full_name: string; patient_number: string }
    | undefined;
  const balance = (invoice.total_naira ?? 0) - (invoice.amount_paid_naira ?? 0);
  const canPrint = invoice.status === 'paid';

  const handlePrint = () => {
    setIsPrinting(true);
    window.print();
    setIsPrinting(false);
  };

  const formattedDate = new Date(invoice.created_at).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = new Date(invoice.created_at).toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-background p-2 md:p-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `@page receipt-page { size: 80mm auto; margin: 0; }
            #receipt { page: receipt-page; }`,
        }}
      />

      {/* Screen-only header & action (hidden on print) */}
      <div className="no-print mx-auto mb-8 sm:mb-12">
        <div className="max-w-[80mm]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Receipt {invoice.invoice_number}</h1>
              <p className="text-sm text-muted-foreground">
                {patients?.full_name ?? invoice.patient_id}
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              <Button
                onClick={handlePrint}
                isLoading={isPrinting}
                disabled={!canPrint}
                className="w-full sm:w-auto"
              >
                Print receipt
              </Button>
              {!canPrint && (
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  Receipts are only available for paid invoices.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Printable receipt card — 80mm POS/thermal width */}
      <div
        id="receipt"
        className="bg-white text-foreground rounded-2xl shadow-lg border border-border/50 overflow-hidden mx-auto mb-12 max-w-[80mm]"
      >
        {/* Hospital header */}
        <div className="bg-gradient-to-b from-primary via-primary/90 to-primary text-white text-center p-5">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-primary text-xs font-bold mb-2 shadow-sm">
            C
          </div>
          <div className="text-xs font-bold tracking-wider uppercase opacity-95">
            {settings?.name ?? 'CHAMP HOSPITAL'}
          </div>
          <div className="text-[10px] opacity-85 mt-1">
            {settings?.address ?? '123 Medical Street, Lagos, Nigeria'}
          </div>
          <div className="text-[10px] opacity-85">
            Phone: {settings?.phone ?? '0800 000 0000'}
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Receipt info */}
          <div className="grid grid-cols-2 gap-4 text-[10px] border-b border-border pb-3">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Receipt No.</span>
              <span className="font-semibold">{invoice.invoice_number}</span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <span className="text-muted-foreground">Date</span>
              <span className="font-semibold">{formattedDate}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Patient</span>
              <span className="font-semibold">{patients?.full_name ?? invoice.patient_id}</span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <span className="text-muted-foreground">Time</span>
              <span className="font-semibold">{formattedTime}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-[10px] border-b border-border pb-3 mb-3">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Visit</span>
              <span className="font-semibold">{invoice.visit_id}</span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-semibold text-xs capitalize ${
                invoice.status === 'paid' ? 'text-status-success' : 'text-status-error'
              }`}>
                {invoice.status}
              </span>
            </div>
          </div>

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[9px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-1.5 text-muted-foreground font-normal uppercase tracking-wider text-[9px]">
                    Item
                  </th>
                  <th className="pb-1.5 text-right text-muted-foreground font-normal uppercase tracking-wider text-[9px]">
                    Qty
                  </th>
                  <th className="pb-1.5 text-right text-muted-foreground font-normal uppercase tracking-wider text-[9px]">
                    Unit
                  </th>
                  <th className="pb-1.5 text-right text-muted-foreground font-normal uppercase tracking-wider text-[9px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`
                      border-b border-border/50
                      ${idx % 2 === 1 ? 'bg-muted/15' : ''}
                    `}
                  >
                    <td className="py-2.5">{item.description}</td>
                    <td className="py-2.5 text-right">{item.quantity}</td>
                    <td className="py-2.5 text-right">
                      {formatNaira(item.unit_price_naira ?? 0)}
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {formatNaira(item.line_total_naira ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-right">{formatNaira(invoice.subtotal_naira ?? 0)}</span>
            </div>
            {invoice.discount_naira > 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium text-right text-status-error">
                  -{formatNaira(invoice.discount_naira ?? 0)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs font-bold border-t border-border pt-2.5">
              <span>Total</span>
              <span className="text-right">{formatNaira(invoice.total_naira ?? 0)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Paid</span>
              <span className="font-medium text-right">
                {formatNaira(invoice.amount_paid_naira ?? 0)}
              </span>
            </div>
            <div className="flex justify-between text-[10px] font-medium text-status-error">
              <span>Balance</span>
              <span className="text-right">{formatNaira(balance)}</span>
            </div>
          </div>

          {/* Payments */}
          {activePayments.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Payments
              </div>
              {activePayments.map(p => (
                <div
                  key={p.id}
                  className="flex justify-between text-[9px] text-muted-foreground"
                >
                  <span>
                    {p.receipt_number ?? ''} •{' '}
                    {METHOD_LABEL[p.method as keyof typeof METHOD_LABEL]}
                  </span>
                  <span className="text-right">{formatNaira(p.amount_naira ?? 0)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-border text-center">
            <div className="text-[9px] font-bold mb-0.5">
              {invoice.status === 'paid' ? 'Thank you for your payment!' : 'Balance outstanding.'}
            </div>
            <div className="text-[9px] opacity-70">
              Thank you for visiting Champ Hospital
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
