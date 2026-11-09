import { useState } from 'react';
import { Table, Badge, EmptyState, LoadingSpinner, Input } from '../../components/ui';
import { useVisitQueue } from './useVisitQueue';
import { format } from 'date-fns';

export const QueuePage = ({ onVisitClick }: { onVisitClick: (id: string) => void }) => {
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');

  const role = (window as any).userRole || 'nurse';
  const { visits, isLoading, isPolling } = useVisitQueue();

  const columns = [
    { header: 'Patient', accessor: 'patient' },
    { header: 'No.', accessor: 'patient_number' },
    { header: 'Reason', accessor: 'reason' },
    { header: 'Status', accessor: 'status' },
    { header: 'Wait Time', accessor: 'wait_time' },
  ];

  const formatWaitTime = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);

    // Reset times to midnight for calendar-day calculation
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const createdMidnight = new Date(created.getFullYear(), created.getMonth(), created.getDate());

    const diffMs = todayMidnight.getTime() - createdMidnight.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Just now';
    if (diffDays === 0) {
      // For today, show minutes/hours
      const actualDiffMs = now.getTime() - created.getTime();
      const diffMins = Math.floor(actualDiffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 60) return `${diffMins} min`;
      return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else if (diffDays < 3) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return created.toLocaleDateString();
    }
  };

  const filterVisitsByDate = (visitsList: any[]) => {
    if (!visitsList) return [];

    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

    return visitsList.filter(v => {
      const visitDate = format(new Date(v.created_at), 'yyyy-MM-dd');

      if (dateFilter === 'today') return visitDate === today;
      if (dateFilter === 'yesterday') return visitDate === yesterday;
      if (dateFilter === 'custom' && customDate) return visitDate === customDate;

      return true;
    });
  };

  const filteredVisits = filterVisitsByDate(visits);

  const tableData = filteredVisits.map(v => {
    return {
      ...v,
      patient: (
        <div className="flex flex-col cursor-pointer hover:text-primary" onClick={() => onVisitClick(v.id)}>
          <span className="font-medium">{v.patients?.full_name}</span>
        </div>
      ),
      patient_number: v.patients?.patient_number,
      status: <Badge variant={v.status === 'completed' ? 'success' : v.status === 'cancelled' ? 'neutral' : v.status === 'waiting_doctor' ? 'warning' : 'neutral'}>{v.status.replace('_', ' ')}</Badge>,
      wait_time: formatWaitTime(v.created_at),
    };
  }) || [];

  const sortedData = [...tableData].sort((a, b) => {
    const priority = role === 'doctor' ? ['waiting_doctor', 'waiting_triage', 'in_consultation'] : ['waiting_triage', 'waiting_doctor', 'in_consultation'];

    const aIsFinal = a.status === 'completed' || a.status === 'cancelled';
    const bIsFinal = b.status === 'completed' || b.status === 'cancelled';

    if (aIsFinal !== bIsFinal) {
      return aIsFinal ? 1 : -1;
    }

    if (!aIsFinal) {
      const aIdx = priority.indexOf(a.status?.toString() || '');
      const bIdx = priority.indexOf(b.status?.toString() || '');
      const aFinalIdx = aIdx === -1 ? 50 : aIdx;
      const bFinalIdx = bIdx === -1 ? 50 : bIdx;

      if (aFinalIdx !== bFinalIdx) return aFinalIdx - bFinalIdx;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clinical Queue</h1>
          <p className="text-sm text-muted-foreground">Real-time patient flow</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-muted p-1 rounded-control">
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${dateFilter === 'today' ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/50'}`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter('yesterday')}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${dateFilter === 'yesterday' ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/50'}`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setDateFilter('custom')}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${dateFilter === 'custom' ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/50'}`}
            >
              Custom
            </button>
          </div>

          {dateFilter === 'custom' && (
            <Input
              type="date"
              className="w-40 h-9 text-xs"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
            />
          )}

          {isPolling && (
            <Badge variant="warning" className="animate-pulse">
              Polling Mode
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : filteredVisits.length === 0 ? (
        <EmptyState
          title="No visits found"
          description={`No patient records available for ${dateFilter === 'custom' ? customDate : dateFilter}.`}
        />
      ) : (
        <Table columns={columns} data={sortedData} />
      )}
    </div>
  );
};
