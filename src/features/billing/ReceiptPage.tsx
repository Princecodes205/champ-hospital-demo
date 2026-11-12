import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, useToast } from '../../components/ui';
import { useInvoice } from './useInvoices';
import { useHospitalSettings } from './useBillingActions';
import { formatNaira } from '../../lib/formatters';
import { METHOD_LABEL } from './types';

const PRINT_STYLES = `
  @page {
    size: auto;
    margin: 0;
  }
  @media print {
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
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-shadow: none !important;
    }
    .no-print {
      display: none !important;
    }
    @page thermal {
      size: 80mm auto;
      margin: 0;
    }
  }
`;

export const ReceiptPage = () => {
  const { id: invoiceId } = useParams<{ id: string }>();
  const [isPrinting, setIsPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();

  const { data, isLoading } = useInvoice(invoiceId ?? '');
  const { data: settings } = useHospitalSettings();

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex flex-col space-y-2">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-center">Receipt not found.</div>;
  }

  const { invoice, items, payments } = data;
  const activePayments = payments.filter(p => !p.reversed);
  const patients = (invoice as any).patients as
    | { full_name: string; patient_number: string }
    | undefined;
  const balance = invoice.total_kobo - invoice.amount_paid_kobo;

  const receiptText = buildReceiptText(
    invoice,
    items,
    activePayments,
    patients,
    settings,
  );

  const handlePrint = () => {
    setIsPrinting(true);
    window.print();
    setIsPrinting(false);
  };

  const handleCopy = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Receipt ${invoice.invoice_number}`, text: receiptText });
      } else {
        await navigator.clipboard.writeText(receiptText);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      addToast('Failed to copy receipt text.', 'error');
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto no-print">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receipt {invoice.invoice_number}</h1>
          <p className="text-sm text-muted-foreground">
            Patient: {patients?.full_name ?? invoice.patient_id}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCopy} isLoading={copied}>
            {copied ? 'Copied!' : 'Copy receipt text'}
          </Button>
          <Button onClick={handlePrint} isLoading={isPrinting}>
            Print receipt
          </Button>
        </div>
      </div>

      {/* Print-only receipt (A5 / 80mm thermal) */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <div
        id="receipt"
        className="bg-foreground p-4 text-foreground text-xs font-mono max-w-xs mx-auto border border-foreground"
      >
        <div className="text-center mb-2">
          <div className="text-sm font-bold">
            {settings?.name ?? 'CHAMP HOSPITAL'}
          </div>
          <div className="text-[10px]">{settings?.name ?? 'Placeholder Hospital'}</div>
          <div className="text-[10px]">
            {settings?.address ?? '123 Medical Street, Lagos, Nigeria'}
          </div>
          <div className="text-[10px]">
            Phone: {settings?.phone ?? '0800 000 0000'}
          </div>
        </div>
        <hr className="border-black my-2" />
        <div className="flex justify-between mb-1">
          <span>Receipt:</span>
          <span className="font-bold">{invoice.invoice_number}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Patient:</span>
          <span>{patients?.full_name ?? invoice.patient_id}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Patient No.:</span>
          <span>{patients?.patient_number ?? '-'}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Visit:</span>
          <span>{invoice.visit_id}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Date:</span>
          <span>{new Date(invoice.created_at).toLocaleString()}</span>
        </div>
        <hr className="border-black my-2" />
        <div className="overflow-x-auto mb-2">
          <table className="text-left text-[10px] w-full">
            <thead>
              <tr>
                <th className="pb-1">Item</th>
                <th className="pb-1 text-right">Qty</th>
                <th className="pb-1 text-right">Unit</th>
                <th className="pb-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="mb-1">
                  <td className="text-[10px]">{item.description}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">{formatNaira(item.unit_price_kobo)}</td>
                  <td className="text-right">{formatNaira(item.line_total_kobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <hr className="border-black my-2" />
        <div className="flex justify-between mb-1">
          <span className="font-bold">Subtotal:</span>
          <span className="font-bold text-right">{formatNaira(invoice.subtotal_kobo)}</span>
        </div>
        {invoice.discount_kobo > 0 && (
          <div className="flex justify-between mb-1">
            <span className="font-bold">Discount:</span>
            <span className="text-right text-status-error">
              -{formatNaira(invoice.discount_kobo)}
            </span>
          </div>
        )}
        <div className="flex justify-between mb-1 border-t pt-1">
          <span className="font-bold">Total:</span>
          <span className="font-bold text-right">{formatNaira(invoice.total_kobo)}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Paid:</span>
          <span className="text-right">{formatNaira(invoice.amount_paid_kobo)}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="font-bold">Balance:</span>
          <span className="font-bold text-right">{formatNaira(balance)}</span>
        </div>
        <hr className="border-black my-2" />
        <div className="mb-2">
          <div className="font-bold text-[10px] mb-1">Payments:</div>
          {activePayments.map(p => (
            <div key={p.id} className="flex justify-between text-[10px] mb-1">
              <span>
                {p.receipt_number} • {METHOD_LABEL[p.method as keyof typeof METHOD_LABEL]}
              </span>
              <span className="text-right">{formatNaira(p.amount_kobo)}</span>
            </div>
          ))}
        </div>
        <hr className="border-black my-2" />
        <div className="text-[9px] text-center mb-2">
          {invoice.status === 'paid' ? 'Thank you for your payment!' : 'Balance outstanding.'}
        </div>
        <div className="text-[9px] text-center">Thank you for visiting Champ Hospital</div>
      </div>
    </div>
  );
};

function buildReceiptText(
  invoice: any,
  items: any[],
  payments: any[],
  patients: { full_name: string; patient_number: string } | undefined,
  settings: { name?: string | null; address?: string | null; phone?: string | null; receipt_footer?: string | null } | undefined,
): string {
  const lines: string[] = [];
  lines.push(settings?.name ?? 'CHAMP HOSPITAL');
  lines.push(settings?.name ?? 'Placeholder Hospital');
  lines.push(settings?.address ?? '123 Medical Street, Lagos, Nigeria');
  lines.push(`Phone: ${settings?.phone ?? '0800 000 0000'}`);
  lines.push('');
  lines.push(`Receipt: ${invoice.invoice_number}`);
  lines.push(`Patient: ${patients?.full_name ?? invoice.patient_id}`);
  lines.push(`Patient No.: ${patients?.patient_number ?? '-'}`);
  lines.push(`Visit: ${invoice.visit_id}`);
  lines.push(`Date: ${new Date(invoice.created_at).toLocaleString()}`);
  lines.push('');
  lines.push('Item                           Qty   Unit      Total');
  lines.push('-----------------------------------------------------');
  for (const item of items) {
    const name = item.description.slice(0, 30).padEnd(30);
    lines.push(
      `${name} ${String(item.quantity).padStart(3)} ${formatNaira(item.unit_price_kobo).padStart(9)} ${formatNaira(item.line_total_kobo)}`,
    );
  }
  lines.push('-----------------------------------------------------');
  lines.push(`Subtotal:                      ${formatNaira(invoice.subtotal_kobo)}`);
  if (invoice.discount_kobo > 0) {
    lines.push(`Discount:                     -${formatNaira(invoice.discount_kobo)}`);
  }
  lines.push(`Total:                        ${formatNaira(invoice.total_kobo)}`);
  lines.push(`Paid:                         ${formatNaira(invoice.amount_paid_kobo)}`);
  lines.push(`Balance:                      ${formatNaira(invoice.total_kobo - invoice.amount_paid_kobo)}`);
  lines.push('');
  lines.push('Payments:');
  for (const p of payments) {
    lines.push(
      `  ${p.receipt_number} ${METHOD_LABEL[p.method as keyof typeof METHOD_LABEL]} ${formatNaira(p.amount_kobo)}`,
    );
  }
  lines.push('');
  lines.push(
    invoice.status === 'paid'
      ? 'Thank you for your payment!'
      : 'Balance outstanding.',
  );
  lines.push(settings?.receipt_footer ?? 'Thank you for visiting Champ Hospital');
  return lines.join('\n');
}
