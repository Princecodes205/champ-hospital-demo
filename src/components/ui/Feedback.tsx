import React from 'react';

export const Toast = ({ message, type = 'info', onClose }: { message: string; type?: 'info' | 'error' | 'success'; onClose?: () => void }) => (
  <div className={`fixed bottom-4 right-4 p-4 rounded-card shadow-lg border flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-4 ${
    type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
    type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
    'bg-background border-input text-foreground'
  }`}>
    <div className="flex-1 text-sm font-medium">{message}</div>
    {onClose && (
      <button onClick={onClose} className="text-lg leading-none hover:opacity-70">✕</button>
    )}
  </div>
);

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`bg-muted animate-pulse rounded ${className}`} />
);

export const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
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
