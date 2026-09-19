import { IconArrowRight, IconBriefcase } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function CrmModulePlaceholder({ title, description }: { title: string; description: string }) {
  return <>
    <PageHeader eyebrow={`Business CRM / ${title}`} title={title} description={description} />
    <Card className="max-w-3xl overflow-hidden p-0"><div className="h-1.5 bg-primary" /><div className="p-8 sm:p-10"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><IconBriefcase className="h-6 w-6" /></div><div className="mt-6 flex items-start justify-between gap-5"><div><Badge tone="primary">Planned module</Badge><h2 className="mt-3 text-xl font-bold">{title} is ready for its own workspace</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted">This page has its own route and navigation entry. Its functionality will be implemented in the approved CRM stage for this module.</p></div><IconArrowRight className="mt-1 h-5 w-5 shrink-0 text-primary" /></div></div></Card>
  </>;
}