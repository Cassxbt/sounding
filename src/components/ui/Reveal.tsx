/** Reveal on scroll in CSS (see .reveal-view): content is present for no-JS readers, full-page captures and reduced motion. */
export function Reveal({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "section" | "li" }) {
  return <Tag className={`reveal-view ${className ?? ""}`}>{children}</Tag>;
}
