import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  basePath?: string;
}

export default function Breadcrumbs({ items = [], basePath = '/files' }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link
        to={basePath}
        className="flex items-center gap-1 text-dark-500 hover:text-dark-900 dark:hover:text-white transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>Home</span>
      </Link>

      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-dark-400" />
          {index === items.length - 1 ? (
            <span className="font-medium text-dark-900 dark:text-white">
              {item.name}
            </span>
          ) : (
            <Link
              to={`${basePath}?folder=${item.id}`}
              className="text-dark-500 hover:text-dark-900 dark:hover:text-white transition-colors"
            >
              {item.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
