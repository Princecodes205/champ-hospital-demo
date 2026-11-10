import { useEffect, useState } from 'react';
import { Button, Input } from '../../components/ui';
import {
  useHospitalSettings,
  useUpdateHospitalSettings,
} from './useBillingActions';

export const HospitalSettingsPage = () => {
  const { data, isLoading } = useHospitalSettings();
  const updateSettings = useUpdateHospitalSettings();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [footer, setFooter] = useState('');
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Populate form from loaded settings (runs once after data arrives)
  useEffect(() => {
    if (data) {
      setName(data.name);
      setAddress(data.address || '');
      setPhone(data.phone || '');
      setFooter(data.receipt_footer || '');
      setSettingsId(data.id);
    }
  }, [data]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsId) return;
    try {
      await updateSettings.mutateAsync({
        id: settingsId,
        updates: {
          name: name.trim(),
          address: address.trim() || null,
          phone: phone.trim() || null,
          receipt_footer: footer.trim() || null,
        },
      });
      alert('Hospital settings saved.');
    } catch (err: any) {
      alert(err.message || 'Failed to save settings.');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Hospital Settings</h1>
        <p className="text-sm text-muted-foreground">
          These details appear on printed receipts.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4 p-4 border rounded-card bg-card">
        <Input
          label="Hospital name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <Input
          label="Address"
          value={address}
          onChange={e => setAddress(e.target.value)}
        />
        <Input
          label="Phone"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
        <Input
          label="Receipt footer"
          value={footer}
          onChange={e => setFooter(e.target.value)}
          placeholder="e.g. Thank you for visiting Champ Hospital"
        />
        <Button type="submit" className="w-full" isLoading={updateSettings.isPending}>
          Save Settings
        </Button>
      </form>
    </div>
  );
};
