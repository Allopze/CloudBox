import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const isExternalHref = (href: string) => /^https?:\/\//i.test(href) || /^mailto:/i.test(href);

export default function AnchorLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  if (href.startsWith('#')) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
