import type { ReactNode } from "react";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <div className="crm-responsive min-w-0 w-full">{children}</div>;
}