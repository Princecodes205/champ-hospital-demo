import { EmptyState } from '../../components/ui/Feedback';

export const NotFoundPage = () => (
  <EmptyState
    title="404 - Page Not Found"
    description="The page you are looking for doesn't exist or has been moved."
    action={<a href="/" className="text-primary font-medium hover:underline">Return to Home</a>}
  />
);
