import React, { useState } from 'react';
import { Button, Input, Table, Badge, Dialog, useToast } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/supabase';

export const StaffPage = () => {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({ username: '', password: '', full_name: '', role: 'doctor' });
  const [isAdding, setIsAdding] = useState(false);
  const { addToast } = useToast();

  const fetchStaff = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (!error && data) setStaff(data);
    setIsLoading(false);
  };

  React.useEffect(() => {
    (async () => {
      setIsLoading(true);
      await fetchStaff();
    })();
  }, []);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      const { error } = await supabase.functions.invoke('create-staff', {
        body: newStaff,
      });
      if (error) throw error;
      await fetchStaff();
      setIsAddOpen(false);
      setNewStaff({ username: '', password: '', full_name: '', role: 'doctor' });
      addToast('Staff member added successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to add staff.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const confirmMsg = `Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this account?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const { error } = await supabase.functions.invoke('toggle-staff-status', {
        body: { userId: id, is_active: !currentStatus },
      });
      if (error) throw error;
      await fetchStaff();
      addToast(`Account ${currentStatus ? 'deactivated' : 'activated'} successfully.`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update account status.', 'error');
    }
  };

  const handleResetPassword = async (id: string) => {
    const newPassword = window.prompt('Enter new password:');
    if (!newPassword) return;
    try {
      const { error } = await supabase.functions.invoke('reset-staff-password', {
        body: { userId: id, password: newPassword },
      });
      if (error) throw error;
      addToast('Password reset successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to reset password.', 'error');
    }
  };

  const columns = [
    { header: 'Name', accessor: 'full_name' },
    { header: 'Username', accessor: 'username' },
    { header: 'Role', accessor: 'role' },
    { header: 'Status', accessor: 'status' },
    { header: 'Actions', accessor: 'actions' },
  ];

  const tableData = (staff || []).map(s => {
    if (!s) return {};
    return {
      ...s,
      status: <Badge variant={s.is_active ? 'success' : 'error'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>,
      actions: (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => s.id && handleResetPassword(s.id)} className="text-xs py-1 px-2">
            Reset Pwd
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => s.id && handleToggleStatus(s.id, s.is_active)}
            className="text-xs py-1 px-2"
          >
            {s.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      )
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="text-sm text-muted-foreground">Manage hospital personnel and access</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>Add Staff</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
          <div className="border rounded-lg p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-5 gap-4 py-2 border-b last:border-0">
                <div className="h-4 bg-muted animate-pulse rounded col-span-2" />
                <div className="h-4 bg-muted animate-pulse rounded" />
                <div className="h-4 bg-muted animate-pulse rounded" />
                <div className="h-4 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}

      <Dialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Staff">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <Input
            label="Full Name"
            value={newStaff.full_name}
            onChange={e => setNewStaff({...newStaff, full_name: e.target.value})}
            required
          />
          <Input
            label="Username"
            value={newStaff.username}
            onChange={e => setNewStaff({...newStaff, username: e.target.value})}
            required
          />
          <Input
            label="Password"
            type="password"
            value={newStaff.password}
            onChange={e => setNewStaff({...newStaff, password: e.target.value})}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground/80">Role</label>
            <select
              className="px-3 py-2 rounded-control border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={newStaff.role}
              onChange={e => setNewStaff({...newStaff, role: e.target.value as any})}
            >
              <option value="doctor">Doctor</option>
              <option value="nurse">Nurse</option>
            </select>
          </div>
          <Button type="submit" className="w-full" isLoading={isAdding}>Create Account</Button>
        </form>
      </Dialog>
    </div>
  );
};
