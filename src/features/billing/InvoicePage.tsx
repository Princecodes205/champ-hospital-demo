import { useState } from 'react';
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

export const InvoicePage = ({ invoiceId }: { invoiceId: string }) => {
  const { data, isLoading } = useInvoice(invoiceId);
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
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col space-y-2">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-64 w-full bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-4 md:p-8 text-center">Invoice not found.</div>;
  }

  const { invoice, items, payments } = data;
  const activePayments = payments.filter(p => !p.reversed);
  const latestPayment = activePayments[activePayments.length - 1];
  const balance = (invoice.total_naira ?? 0) - (invoice.amount_paid_naira ?? 0);
  const userRole = (window as any).userRole;
  const isOwner = userRole === 'owner';
  const isStaff = userRole === 'nurse' || userRole === 'doctor';

  const canRecordPayment = invoice.status !== 'paid' && invoice.status !== 'void';

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
      addToast(`Payment of ${formatNaira(invoice.total_naira ?? 0)} recorded successfully.`, 'success');
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
      addToast(`Payment of ${formatNaira(invoice.total_naira ?? 0)} recorded successfully.`, 'success');
    } catch (err: any) {
      setRecordError(err.message || 'Failed to record payment. Please try again.');
      addToast(err.message || 'Failed to record payment.', 'error');
    }
  };

  const handleApplyDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNaira = parseNaira(discountAmount);
    if (amountNaira <= 0) {
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
        amountNaira: amountNaira,
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
    const unitPriceNaira = parseNaira(lineUnitPrice);
    if (
      !lineDescription.trim() ||
      isNaN(quantity) ||
      quantity <= 0 ||
      unitPriceNaira < 0 ||
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
        unitPriceNaira,
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

  const patientName = invoice.patients?.full_name ?? invoice.patient_id;
  const patientNumber = invoice.patients?.patient_number ?? '-';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back link */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
          onClick={() => {
            window.history.pushState({}, '', '/invoices');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        >
          ← Back to invoices
        </Button>
      </div>

      {/* Invoice header card */}
      <section className="border border-b-2 border-b-primary rounded-xl bg-card p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                Invoice {invoice.invoice_number}
              </h1>
              <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Patient: {patientName} ({patientNumber})
            </p>
            <p className="text-sm text-muted-foreground">
              Visit {invoice.visit_id} • Created{' '}
              {new Date(invoice.created_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>

          <div className="flex items-end gap-3 w-full md:w-auto md:flex-nowrap">
            <div className="flex flex-col items-end gap-1 md:text-right">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Total due
              </span>
              <span className="text-2xl md:text-3xl font-bold">
                {formatNaira(invoice.total_naira ?? 0)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canRecordPayment && (
                <Button onClick={() => setIsRecordOpen(true)} className="w-full md:w-auto">
                  Record Payment
                </Button>
              )}
              {isOwner && invoice.status === 'unpaid' && (
                <Button variant="danger" size="sm" onClick={() => setIsVoidOpen(true)} className="w-full md:w-auto">
                  Void Invoice
                </Button>
              )}
              {isOwner && activePayments.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setIsReverseOpen(true)} className="w-full md:w-auto">
                  Reverse Payment
                </Button>
              )}
              {isStaff && invoice.status !== 'void' && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={invoice.status === 'paid'}
                    onClick={() => setIsDiscountOpen(true)}
                    className="w-full md:w-auto"
                  >
                    Apply Discount
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={invoice.status === 'paid'}
                    onClick={() => setIsAddLineOpen(true)}
                    className="w-full md:w-auto"
                  >
                    Add Line
                  </Button>
                  {invoice.status === 'paid' && (
                    <span className="text-xs text-muted-foreground">
                      Reverse the payment first.
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {invoice.status === 'paid' && activePayments.length > 0 && latestPayment && (
          <div className="mt-4 pt-4 border-t border-muted/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium">Paid:</span>
              <span>{formatNaira(invoice.amount_paid_naira ?? 0)}</span>
              <span className="text-xs text-muted-foreground">• {latestPayment.method}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium">Receipt:</span>
              <span className="font-medium text-foreground">{latestPayment.receipt_number ?? '-'}</span>
            </div>
          </div>
        )}
      </section>

      {/* Body grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: amount breakdown + line items */}
        <div className="md:col-span-2 space-y-6">
          <section className="border rounded-xl bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Amount breakdown
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-right font-medium">{formatNaira(invoice.subtotal_naira ?? 0)}</span>
              </div>
              {invoice.discount_naira > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-right font-medium text-status-error">
                    -{formatNaira(invoice.discount_naira ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-3">
                <span>Total</span>
                <span className="text-right">{formatNaira(invoice.total_naira ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-right font-medium">{formatNaira(invoice.amount_paid_naira ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium text-status-error">
                <span>Balance</span>
                <span className="text-right">{formatNaira(balance)}</span>
              </div>
            </div>
          </section>

          <section className="border rounded-xl bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Line items
              </h3>
              {invoice.status !== 'void' && isStaff && (
                <Button variant="ghost" size="sm" onClick={() => setIsAddLineOpen(true)}>
                  Add line
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table
                columns={[
                  { header: 'Description', accessor: 'description' },
                  { header: 'Source', accessor: 'source' },
                  { header: 'Qty', accessor: 'quantity' },
                  { header: 'Unit Price', accessor: 'unit_price_naira' },
                  { header: 'Total', accessor: 'line_total_naira' },
                ]}
                data={items.map(item => ({
                  ...item,
                  unit_price_naira: formatNaira(item.unit_price_naira ?? 0),
                  line_total_naira: formatNaira(item.line_total_naira ?? 0),
                }))}
              />
            </div>
            {items.length === 0 && (
              <div className="mt-4 p-4 text-center text-sm text-muted-foreground bg-muted/50 rounded-lg">
                No line items.
              </div>
            )}
          </section>

          {invoice.void_reason && (
            <section className="border border-destructive/30 bg-destructive/5 rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="text-destructive font-bold text-xs uppercase tracking-wider">
                  Voided
                </span>
                <p className="text-sm text-foreground/80">{invoice.void_reason}</p>
              </div>
            </section>
          )}
        </div>

        {/* Right column: payments + actions */}
        <div className="space-y-6">
          <section className="border rounded-xl bg-card p-5 shadow-sm sticky top-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Payments
              </h3>
            </div>
            {activePayments.length === 0 ? (
              <div className="text-sm text-muted-foreground">No payments recorded yet.</div>
            ) : (
              <div className="space-y-3">
                <Table
                  columns={[
                    { header: 'Receipt No.', accessor: 'receipt_number' },
                    { header: 'Amount', accessor: 'amount_naira' },
                    { header: 'Method', accessor: 'method' },
                    { header: 'At', accessor: 'paid_at' },
                  ]}
                  data={activePayments.map(p => ({
                    ...p,
                    amount_naira: formatNaira(p.amount_naira ?? 0),
                    method: METHOD_LABEL[p.method as keyof typeof METHOD_LABEL],
                    paid_at: formatDateTime(p.paid_at),
                  }))}
                />
              </div>
            )}
            {payments.filter(p => p.reversed).length > 0 && (
              <div className="mt-3 p-3 text-xs text-muted-foreground bg-muted/50 rounded-lg">
                Reversed payments are kept on record and never deleted.
              </div>
            )}
            <Button
              onClick={() => {
                window.history.pushState({}, '', `/receipt/${invoice.id}`);
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="mt-4 w-full"
            >
              Print Receipt
            </Button>
          </section>

          {invoice.status !== 'void' && isStaff && (
            <section className="border rounded-xl bg-card p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Adjustments
              </h3>
              <div className="space-y-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={invoice.status === 'paid'}
                  onClick={() => setIsDiscountOpen(true)}
                  className="w-full"
                >
                  Apply Discount
                </Button>
                {invoice.status === 'paid' && (
                  <p className="text-xs text-muted-foreground">
                    Reverse the payment first.
                  </p>
                )}
              </div>
            </section>
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
              Record payment of {formatNaira(invoice.total_naira ?? 0)}
            </Button>
            {recordError && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleRetryPayment}
                isLoading={recordPayment.isPending}
                disabled={recordPayment.isPending}
              >
                Retry
              </Button>
            )}
          </div>
        </form>
      </Dialog>

      {/* Apply Discount Dialog */}
      {isStaff && (
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

      {/* Add Line Item Dialog */}
      {isStaff && (
        <Dialog
          isOpen={isAddLineOpen}
          onClose={() => setIsAddLineOpen(false)}
          title="Add Line Item"
        >
          <form onSubmit={handleAddLine} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Line items can be added to correct an unpaid invoice.
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
              Voiding marks this invoice as void. Only unpaid invoices can be voided.
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
