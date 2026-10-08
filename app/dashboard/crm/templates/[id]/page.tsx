"use client";

import { useParams } from "next/navigation";
import { TemplateEditor } from "@/components/crm/template-editor";

export default function EditCrmTemplatePage() {
  const params = useParams<{ id: string }>();
  return <TemplateEditor templateId={params.id} />;
}
