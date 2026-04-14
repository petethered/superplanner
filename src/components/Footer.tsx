import { useState, useEffect } from "react";

interface FooterProps {
  lastSync: number | null;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Footer({ lastSync }: FooterProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!lastSync) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [lastSync]);

  return (
    <footer className="border-t border-gray-200 bg-white px-4 py-3 text-center text-sm text-gray-500">
      {lastSync
        ? `Last synced: ${formatTimeAgo(lastSync)}`
        : "Not yet synced"}
    </footer>
  );
}
