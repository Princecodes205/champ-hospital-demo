import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'neutral';
}

export const Badge = ({ children, variant = 'neutral' }: BadgeProps) => {
  const variants = {
    success: 'bg-status-success-bg text-status-success',
    error: 'bg-status-error-bg text-status-error',
    warning: 'bg-status-warning-bg text-status-warning',
    neutral: 'bg-muted text-muted-foreground',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};
