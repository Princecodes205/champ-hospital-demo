import { useState } from 'react';
import { Button, Input, Table, Badge, Dialog } from '../../components/ui';
import {
  useServices,
  useCreateService,
  useUpdateService,
} from './useServices';
import { formatNaira } from '../../lib/formatters';
import type { Service } from './types';

export const ServicesPage = () => {
  const { data: services, isLoading } = useServices();
  const createService = useCreateService();
  const updateService = useUpdateService();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newIsVisitFee, setNewIsVisitFee] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(newPrice, 10);
    if (!newName.trim() || isNaN(price) || price < 0) {
      alert('Enter a valid name and price.');
      return;
    }
    try {
      await createService.mutateAsync({
        name: newName.trim(),
        unit_price_kobo: price,
        is_visit_fee: newIsVisitFee,
      });
      setIsAddOpen(false);
      setNewName('');
      setNewPrice('');
      setNewIsVisitFee(false);
    } catch (err: any) {
      alert(err.message || 'Failed to create service.');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(editPrice, 10);
    if (!editingId || !editName.trim() || isNaN(price) || price < 0) {
      alert('Enter a valid name and price.');
      return;
    }
    try {
      await updateService.mutateAsync({
        id: editingId,
        updates: {
          name: editName.trim(),
          unit_price_kobo: price,
          is_active: editIsActive,
        },
      });
      setIsEditOpen(false);
      setEditingId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update service.');
    }
  };

  const handleEdit = (service: Service) => {
    setEditingId(service.id);
    setEditName(service.name);
    setEditPrice(service.unit_price_kobo.toString());
    setEditIsActive(service.is_active);
    setIsEditOpen(true);
  };

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

  const list = services || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Services & Prices</h1>
          <p className="text-sm text-muted-foreground">
            Price changes affect only future invoices. Existing invoices are unchanged.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>Add Service</Button>
      </div>

      {isLoading ? (
        <div className="h-64 w-full bg-muted animate-pulse rounded-lg" />
      ) : list.length === 0 ? (
        <EmptyStateInline title="No services" description="Add your first service." />
      ) : (
        <Table
          columns={[
            { header: 'Service', accessor: 'name' },
            { header: 'Type', accessor: 'type' },
            { header: 'Price', accessor: 'price' },
            { header: 'Status', accessor: 'status' },
            { header: 'Action', accessor: 'action' },
          ]}
          data={list.map((s) => ({
            ...s,
            type: s.is_visit_fee ? 'Visit fee' : 'Service',
            price: formatNaira(s.unit_price_kobo),
            status: <Badge variant={s.is_active ? 'success' : 'error'}>
              {s.is_active ? 'Active' : 'Inactive'}
            </Badge>,
            action: (
              <Button variant="ghost" size="sm" onClick={() => handleEdit(s)}>
                Edit
              </Button>
            ),
          }))}
        />
      )}

      {/* Add Service Dialog */}
      <Dialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Service"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Service name"
            placeholder="e.g. Injection, Dressing"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Unit price (₦)"
              type="number"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              placeholder="e.g. 2000"
              required
            />
            <div className="flex items-center gap-2 py-8">
              <input
                type="checkbox"
                id="is_visit_fee"
                checked={newIsVisitFee}
                onChange={e => setNewIsVisitFee(e.target.checked)}
              />
              <label htmlFor="is_visit_fee" className="text-sm text-foreground/80">
                This is the consultation (visit) fee
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Exactly one active visit fee is allowed. Placeholder price only — not market data.
          </p>
          <Button type="submit" className="w-full" isLoading={createService.isPending}>
            Create Service
          </Button>
        </form>
      </Dialog>

      {/* Edit Service Dialog */}
      {isEditOpen && editingId && (
        <Dialog
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title="Edit Service"
        >
          <form onSubmit={handleUpdate} className="space-y-4">
            <Input
              label="Service name"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              required
            />
            <Input
              label="Unit price (₦)"
              type="number"
              value={editPrice}
              onChange={e => setEditPrice(e.target.value)}
              required
            />
            <div className="flex items-center gap-2 py-8">
              <input
                type="checkbox"
                id="edit_is_active"
                checked={editIsActive}
                onChange={e => setEditIsActive(e.target.checked)}
              />
              <label htmlFor="edit_is_active" className="text-sm text-foreground/80">
                Active
              </label>
            </div>
            <Button type="submit" className="w-full" isLoading={updateService.isPending}>
              Save Changes
            </Button>
          </form>
        </Dialog>
      )}
    </div>
  );
};

function EmptyStateInline({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <span className="text-2xl">🏥</span>
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-xs mb-6">{description}</p>
    </div>
  );
}
