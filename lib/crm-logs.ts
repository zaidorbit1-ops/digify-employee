import { randomUUID } from "node:crypto";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type CrmLogLevel = "success" | "info" | "warning" | "error";

export type CrmLogInput = {
  level: CrmLogLevel;
  source: string;
  event: string;
  message: string;
  route?: string | null;
  requestId?: string | null;
  companyId?: number | null;
  metadata?: Record<string, unknown>;
};

function clean(value: string, limit: number) {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, limit);
}

function cleanMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") return clean(value, 240);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => cleanMetadata(item, depth + 1));
  if (typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, item]) => [clean(key, 80), cleanMetadata(item, depth + 1)]));
}

export async function writeCrmLog(input: CrmLogInput) {
  try {
    const client = getSupabaseServiceRoleClient();
    const { error } = await client.rpc("insert_crm_system_log", {
      p_level: input.level,
      p_source: clean(input.source, 80),
      p_event: clean(input.event, 120),
      p_message: clean(input.message, 500),
      p_route: input.route ? clean(input.route, 240) : null,
      p_request_id: input.requestId ? clean(input.requestId, 100) : null,
      p_company_id: input.companyId ?? null,
      p_metadata: cleanMetadata(input.metadata ?? {}) as Record<string, unknown>,
    });
    if (error) console.error("[crm-logs] log write failed", error.message);
  } catch (error) {
    console.error("[crm-logs] log write failed", error instanceof Error ? error.message : "Unknown error");
  }
}

type RouteHandler = (...args: any[]) => Response | Promise<Response>;

const contextIdFields = ["company_id", "mailbox_id", "campaign_id", "campaign_message_id", "lead_id", "contact_id", "template_id", "website_id", "integration_id", "order_id", "expert_id", "notification_id"] as const;

function entityType(route: string) {
  const resource = route.split("/").filter(Boolean).at(-1) ?? "api";
  const types: Record<string, string> = { campaigns: "campaign", leads: "lead", contacts: "contact", mailboxes: "mailbox", templates: "template", orders: "order", companies: "company", websites: "website", segments: "segment", "contact-lists": "contact list", experts: "expert", webmail: "email" };
  const parent = route.split("/").filter(Boolean).at(-2) ?? "";
  return /^\d+$/.test(resource) ? types[parent] ?? "record" : types[resource] ?? resource.replace(/-/g, " ");
}

async function mutationContext(request: Request, route: string) {
  const query = new URL(request.url).searchParams;
  const context: Record<string, number | string> = { resource_type: entityType(route) };
  const pathId = route.match(/\/(\d+)$/)?.[1];
  const queryId = query.get("id");
  if (pathId || queryId) context.resource_id = Number(pathId || queryId);

  for (const [key, value] of query.entries()) {
    if (key === "id" || !contextIdFields.includes(key as (typeof contextIdFields)[number])) continue;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) context[key] = parsed;
  }

  let body: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const parsed = await request.clone().json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    }
    else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.clone().formData();
      body = Object.fromEntries(form.entries());
    }
  } catch {
    body = {};
  }

  for (const key of contextIdFields) {
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) context[key] = parsed;
  }
  if (!context.resource_id && body.id !== undefined) {
    const parsed = Number(body.id);
    if (Number.isSafeInteger(parsed) && parsed > 0) context.resource_id = parsed;
  }
  if (typeof body.action === "string") context.action = clean(body.action, 60);
  if (typeof body.status === "string") context.requested_status = clean(body.status, 40);
  if (typeof body.subject === "string" && body.subject.trim()) context.email_subject = clean(body.subject, 180);
  return context;
}

async function responseFailure(response: Response) {
  try {
    const parsed = await response.clone().json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: null, code: null, resourceId: null, resourceType: null };
    const body = parsed as Record<string, unknown>;
    const error = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
    const code = typeof body.code === "string" ? body.code : null;
    const entities = ["campaign", "lead", "contact", "template", "order", "expert", "website", "list", "segment", "integration", "mailbox"];
    const entity = entities.map((key) => [key, body[key]] as const).find(([, value]) => value && typeof value === "object" && "id" in value);
    const entityId = entity && Number((entity[1] as Record<string, unknown>).id);
    return { error: error ? clean(error, 420) : null, code, resourceId: Number.isSafeInteger(entityId) && entityId! > 0 ? entityId : null, resourceType: entity?.[0] ?? null };
  } catch {
    return { error: null, code: null, resourceId: null, resourceType: null };
  }
}

export function withCrmApiLogging<THandler extends RouteHandler>(handler: THandler): (...args: Parameters<THandler>) => Promise<Response> {
  return async (...args: Parameters<THandler>) => {
    const request = args[0] as Request;
    const startedAt = performance.now();
    const requestId = request.headers.get("x-request-id")?.slice(0, 100) || randomUUID();
    const route = new URL(request.url).pathname.replace(/\b\d+\b/g, ":id");
    const context = await mutationContext(request, new URL(request.url).pathname);
    const companyId = typeof context.company_id === "number" ? context.company_id : null;

    try {
      const response = await handler(...args);
      if (request.method !== "GET" && request.method !== "HEAD") {
        const level: CrmLogLevel = response.status >= 500 ? "error" : response.status >= 400 ? "warning" : "success";
        const responseContext = await responseFailure(response);
        const failure = response.status >= 400 ? responseContext : { ...responseContext, error: null, code: null };
        if (!context.resource_id && responseContext.resourceId) context.resource_id = responseContext.resourceId;
        if (responseContext.resourceType) context.resource_type = responseContext.resourceType;
        const operation = typeof context.action === "string" ? context.action : request.method.toLowerCase();
        await writeCrmLog({
          level,
          source: "crm-api",
          event: "api.mutation",
          message: failure.error || `${operation} ${context.resource_type}${context.resource_id ? ` #${context.resource_id}` : ""} ${response.status >= 400 ? `failed (${response.status})` : "completed successfully"}.`,
          route,
          requestId,
          companyId,
          metadata: { ...context, status: response.status, error_code: failure.code, duration_ms: Math.round(performance.now() - startedAt) },
        });
      }
      return response;
    } catch (error) {
      await writeCrmLog({
        level: "error",
        source: "crm-api",
        event: "api.exception",
        message: error instanceof Error ? error.message : "Unhandled API exception.",
        route,
        requestId,
        companyId,
        metadata: { ...context, duration_ms: Math.round(performance.now() - startedAt) },
      });
      throw error;
    }
  };
}