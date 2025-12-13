import type { ReactNode } from 'react';

export default function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          {eyebrow && <div className="text-sm font-medium text-[#F44336]">{eyebrow}</div>}
          <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-dark-900 dark:text-dark-100">
            {title}
          </h2>
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

