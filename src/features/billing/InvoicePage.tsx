import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input, Table, Badge, Dialog, useToast } from '../../components/ui';
import { useInvoice } from './useInvoices';
import {
  useRecordPayment,
  useApplyDiscount,
  useAddInvoiceLine,
  useReversePayment,
  useVoidInvoice,
} from './useBillingActions';
import {
  formatNaira,
  parseNaira,
  formatDateTime,
} from '../../lib/formatters';
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  METHOD_LABEL,
  type PaymentMethod,
} from './types';

export const InvoicePage = () => {
  const { id: invoiceId } = useParams<{ id: string }>();

  const { data, isLoading } = useInvoice(invoiceId ?? '');
  const recordPayment = useRecordPayment();
  const applyDiscount = useApplyDiscount();
  const addInvoiceLine = useAddInvoiceLine();
  const reversePayment = useReversePayment();
  const voidInvoice = useVoidInvoice();

  const { addToast } = useToast();

  // Local form state
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);
  const [isReverseOpen, setIsReverseOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [recordError, setRecordError] = useState<string | null>(null);

  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const [lineDescription, setLineDescription] = useState('');
  const [lineQuantity, setLineQuantity] = useState('1');
  const [lineUnitPrice, setLineUnitPrice] = useState('');
  const [lineReason, setLineReason] = useState('');

  const [reverseReason, setReverseReason] = useState('');
  const [voidReason, setVoidReason] = useState('');

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex flex-col space-y-2">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-64 w-full bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-center">Invoice not found.</div>;
  }

  const { invoice, items, payments } = data;
  const activePayments = payments.filter(p => !p.reversed);
  const latestPayment = activePayments[activePayments.length - 1];
  const balance = invoice.total_kobo - invoice.amount_paid_kobo;
  const isOwner = (window as any).userRole === 'owner';

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecordError(null);
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        method: paymentMethod,
        reference: paymentReference,
        idempotencyKey,
      });
      setIsRecordOpen(false);
      setPaymentReference('');
      setIdempotencyKey(crypto.randomUUID());
      addToast(`Payment of ${formatNaira(invoice.total_kobo)} recorded successfully.`, 'success');
    } catch (err: any) {
      setRecordError(err.message || 'Failed to record payment. Please try again.');
      addToast(err.message || 'Failed to record payment.', 'error');
    }
  };

  const handleRetryPayment = async () => {
    setRecordError(null);
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        method: paymentMethod,
        reference: paymentReference,
        idempotencyKey,
      });
      setIsRecordOpen(false);
      setPaymentReference('');
      setIdempotencyKey(crypto.randomUUID());
      addToast(`Payment of ${formatNaira(invoice.total_kobo)} recorded successfully.`, 'success');
    } catch (err: any) {
      setRecordError(err.message || 'Failed to record payment. Please try again.');
      addToast(err.message || 'Failed to record payment.', 'error');
    }
  };

  const handleApplyDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountKobo = parseNaira(discountAmount);
    if (amountKobo <= 0) {
      addToast('Enter a valid discount amount.', 'error');
      return;
    }
    if (!discountReason.trim()) {
      addToast('A reason is required.', 'error');
      return;
    }
    try {
      await applyDiscount.mutateAsync({
        invoiceId: invoice.id,
        amountKobo: amountKobo,
        reason: discountReason,
      });
      setIsDiscountOpen(false);
      setDiscountAmount('');
      setDiscountReason('');
      addToast('Discount applied successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to apply discount.', 'error');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = parseInt(lineQuantity, 10);
    const unitPriceKobo = parseNaira(lineUnitPrice);
    if (
      !lineDescription.trim() ||
      isNaN(quantity) ||
      quantity <= 0 ||
      unitPriceKobo < 0 ||
      !lineReason.trim()
    ) {
      addToast('Enter valid line details and a reason.', 'error');
      return;
    }
    try {
      await addInvoiceLine.mutateAsync({
        invoiceId: invoice.id,
        description: lineDescription,
        quantity,
        unitPriceKobo,
        reason: lineReason,
      });
      setIsAddLineOpen(false);
      setLineDescription('');
      setLineQuantity('1');
      setLineUnitPrice('');
      setLineReason('');
      addToast('Line item added successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to add invoice line.', 'error');
    }
  };

  const handleReversePayment = async () => {
    if (!reverseReason.trim()) {
      addToast('A reason is required.', 'error');
      return;
    }
    const payment = latestPayment;
    if (!payment) return;
    try {
      await reversePayment.mutateAsync({
        paymentId: payment.id,
        reason: reverseReason,
      });
      setIsReverseOpen(false);
      setReverseReason('');
      addToast('Payment reversed successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to reverse payment.', 'error');
    }
  };

  const handleVoidInvoice = async () => {
    if (!voidReason.trim()) {
      addToast('A reason is required.', 'error');
      return;
    }
    try {
      await voidInvoice.mutateAsync({
        invoiceId: invoice.id,
        reason: voidReason,
      });
      setIsVoidOpen(false);
      setVoidReason('');
      addToast('Invoice voided successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to void invoice.', 'error');
    }
  };

  const canRecordPayment = invoice.status !== 'paid' && invoice.status !== 'void';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold">Invoice {invoice.invoice_number}</h1>
          <p className="text-sm text-muted-foreground">
            Patient: {invoice.patients?.full_name ?? invoice.patient_id} ({invoice.patients?.patient_number ?? '-'})
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Visit: {invoice.visit_id} • Created {new Date(invoice.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-3">
          <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
            {INVOICE_STATUS_LABEL[invoice.status]}
          </Badge>
          {canRecordPayment && (
            <Button onClick={() => setIsRecordOpen(true)}>Record Payment</Button>
          )}
          {isOwner && invoice.status !== 'paid' && invoice.status !== 'void' && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setIsDiscountOpen(true)}>
                Apply Discount
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsAddLineOpen(true)}>
                Add Line
              </Button>
            </>
          )}
          {isOwner && invoice.status === 'unpaid' && (
            <Button variant="danger" size="sm" onClick={() => setIsVoidOpen(true)}>
              Void Invoice
            </Button>
          )}
          {isOwner && activePayments.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setIsReverseOpen(true)}>
              Reverse Payment
            </Button>
          )}
        </div>
      </div>

      {/* Invoice details grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <section className="p-4 border rounded-card bg-card">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Amount</h3>
            <div className="space-y-3 mt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-right">{formatNaira(invoice.subtotal_kobo)}</span>
              </div>
              {invoice.discount_kobo > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-right text-status-error">
                    -{formatNaira(invoice.discount_kobo)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-3">
                <span>Total</span>
                <span className="text-right">{formatNaira(invoice.total_kobo)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-right">{formatNaira(invoice.amount_paid_kobo)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Balance</span>
                <span className="text-right">{formatNaira(balance)}</span>
              </div>
            </div>
          </section>

          <section className="p-4 border rounded-card bg-card">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Payments
            </h3>
            <div className="space-y-3 mt-3">
              {activePayments.length === 0 ? (
                <div className="text-sm text-muted-foreground">No payments recorded yet.</div>
              ) : (
                <Table
                  columns={[
                    { header: 'Receipt No.', accessor: 'receipt_number' },
                    { header: 'Amount', accessor: 'amount_kobo' },
                    { header: 'Method', accessor: 'method' },
                    { header: 'Reference', accessor: 'reference' },
                    { header: 'Received by', accessor: 'received_by' },
                    { header: 'At', accessor: 'paid_at' },
                  ]}
                  data={activePayments.map(p => ({
                    ...p,
                    amount_kobo: formatNaira(p.amount_kobo),
                    method: METHOD_LABEL[p.method as keyof typeof METHOD_LABEL],
                    reference: p.reference ?? '-',
                    received_by: p.received_by.slice(0, 8),
                    paid_at: formatDateTime(p.paid_at),
                  }))}
                />
              )}
              {payments.filter(p => p.reversed).length > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Reversed payments are kept on record and never deleted.
                </div>
              )}
            </div>
          </section>

          {invoice.void_reason && (
            <section className="p-4 border border-destructive/30 bg-destructive/5 rounded-card">
              <div className="flex items-start gap-2">
                <span className="text-destructive font-bold text-xs uppercase tracking-wider">
                  Voided:
                </span>
                <p className="text-sm text-foreground/80">{invoice.void_reason}</p>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="p-4 border rounded-card bg-card">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Line Items
            </h3>
            <Table
              columns={[
                { header: 'Description', accessor: 'description' },
                { header: 'Source', accessor: 'source' },
                { header: 'Qty', accessor: 'quantity' },
                { header: 'Unit Price', accessor: 'unit_price_kobo' },
                { header: 'Total', accessor: 'line_total_kobo' },
              ]}
              data={items.map(item => ({
                ...item,
                unit_price_kobo: formatNaira(item.unit_price_kobo),
                line_total_kobo: formatNaira(item.line_total_kobo),
              }))}
            />
          </section>

          {invoice.status === 'unpaid' && isOwner && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setIsDiscountOpen(true)} className="w-full">
                Apply Discount
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsAddLineOpen(true)} className="w-full">
                Add Line Item
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog
        isOpen={isRecordOpen}
        onClose={() => setIsRecordOpen(false)}
        title="Record Payment"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div className="p-3 bg-muted rounded-control space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span>Amount due</span>
              <span className="font-bold">{formatNaira(balance)}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Invoices are paid in full in a single payment — no part payments.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground/80">Method</label>
            <select
              className="px-3 py-2 rounded-control border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(METHOD_LABEL).map(([m, label]) => (
                <option key={m} value={m as PaymentMethod}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Reference (optional)"
            placeholder="e.g. transfer ref or POS receipt no."
            value={paymentReference}
            onChange={e => setPaymentReference(e.target.value)}
          />

          {recordError && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-control text-destructive text-sm">
              {recordError}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              isLoading={recordPayment.isPending}
              disabled={recordPayment.isPending}
            >
              Record payment of {formatNaira(invoice.total_kobo)}
            </Button>
            {recordError && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleRetryPayment}
                disabled={recordPayment.isPending}
              >
                Retry
              </Button>
            )}
          </div>
        </form>
      </Dialog>

      {/* Apply Discount Dialog (owner only) */}
      {isOwner && (
        <Dialog
          isOpen={isDiscountOpen}
          onClose={() => setIsDiscountOpen(false)}
          title="Apply Discount"
        >
          <form onSubmit={handleApplyDiscount} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Discounts can only be applied while the invoice is not fully paid.
            </p>
            <Input
              label="Discount amount (₦)"
              type="number"
              value={discountAmount}
              onChange={e => setDiscountAmount(e.target.value)}
              required
            />
            <Input
              label="Reason (required)"
              placeholder="e.g. NHIS waiver, staff courtesy"
              value={discountReason}
              onChange={e => setDiscountReason(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" isLoading={applyDiscount.isPending}>
              Apply Discount
            </Button>
          </form>
        </Dialog>
      )}

      {/* Add Line Item Dialog (owner only) */}
      {isOwner && (
        <Dialog
          isOpen={isAddLineOpen}
          onClose={() => setIsAddLineOpen(false)}
          title="Add Line Item"
        >
          <form onSubmit={handleAddLine} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Line items can be added to correct an unpaid or part-paid invoice.
            </p>
            <Input
              label="Description"
              placeholder="e.g. Consultation fee"
              value={lineDescription}
              onChange={e => setLineDescription(e.target.value)}
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Quantity"
                type="number"
                value={lineQuantity}
                onChange={e => setLineQuantity(e.target.value)}
                required
              />
              <Input
                label="Unit price (₦)"
                type="number"
                value={lineUnitPrice}
                onChange={e => setLineUnitPrice(e.target.value)}
                required
              />
              <Input
                label="Reason (required)"
                placeholder="Why is this line being added?"
                value={lineReason}
                onChange={e => setLineReason(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" isLoading={addInvoiceLine.isPending}>
              Add Line Item
            </Button>
          </form>
        </Dialog>
      )}

      {/* Reverse Payment Dialog (owner only) */}
      {isOwner && activePayments.length > 0 && (
        <Dialog
          isOpen={isReverseOpen}
          onClose={() => setIsReverseOpen(false)}
          title="Reverse Payment"
        >
          <form onSubmit={(e) => { e.preventDefault(); handleReversePayment(); }} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Reversing marks this payment as reversed (never deleted) and recomputes the invoice status.
            </p>
            <Input
              label="Reason (required)"
              placeholder="Why is this payment being reversed?"
              value={reverseReason}
              onChange={e => setReverseReason(e.target.value)}
              required
            />
            <Button variant="danger" type="submit" className="w-full" isLoading={reversePayment.isPending}>
              Confirm Reverse
            </Button>
          </form>
        </Dialog>
      )}

      {/* Void Invoice Dialog (owner only) */}
      {isOwner && invoice.status === 'unpaid' && (
        <Dialog
          isOpen={isVoidOpen}
          onClose={() => setIsVoidOpen(false)}
          title="Void Invoice"
        >
          <form onSubmit={(e) => { e.preventDefault(); handleVoidInvoice(); }} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Voiding marks this invoice as void. Only unpaid invoices with no active payments can be voided.
            </p>
            <Input
              label="Reason (required)"
              placeholder="Why is this invoice being voided?"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              required
            />
            <Button variant="danger" type="submit" className="w-full" isLoading={voidInvoice.isPending}>
              Confirm Void
            </Button>
          </form>
        </Dialog>
      )}
    </div>
  );
};
