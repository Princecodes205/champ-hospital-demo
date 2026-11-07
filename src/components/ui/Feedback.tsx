import React from 'react';

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`bg-muted animate-pulse rounded ${className}`} />
);

export const EmptyState = ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
      <span className="text-2xl">🏥</span>
    </div>
    <h3 className="text-lg font-semibold mb-1">{title}</h3>
    <p className="text-muted-foreground text-sm max-w-xs mb-6">{description}</p>
    {action}
  </div>
);
