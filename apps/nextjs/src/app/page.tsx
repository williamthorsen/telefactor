'use client';

import { type ReactElement, useEffect, useState } from 'react';

import Layout from '#src/components/Layout.tsx';

export default function HomePage(): ReactElement {
  const [date, setDate] = useState<Date | undefined>();

  useEffect(() => {
    // Defer the first update to a microtask so first paint matches the server's empty render (no hydration mismatch); a synchronous setState in the effect body would trip `react-hooks/set-state-in-effect`.
    queueMicrotask(() => setDate(new Date()));
    const timerId = setInterval(() => setDate(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  return (
    <Layout title="Home | Next.js App">
      <h1 className="h1">Hello Next.js 👋</h1>
      <p>The current time is {date && date.toString()}</p>
    </Layout>
  );
}
