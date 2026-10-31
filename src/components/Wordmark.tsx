/** The "Needle" name, set in the brand typeface. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-brand font-semibold tracking-tight ${className}`}>Needle</span>;
}
