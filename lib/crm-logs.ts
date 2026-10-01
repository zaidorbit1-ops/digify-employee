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
      p_metadata: input.metadata ?? {},
    });
    if (error) console.error("[crm-logs] log write failed", error.message);
  } catch (error) {
    console.error("[crm-logs] log write failed", error instanceof Error ? error.message : "Unknown error");
  }
}

type RouteHandler = (...args: any[]) => Response | Promise<Response>;

export function withCrmApiLogging<THandler extends RouteHandler>(handler: THandler): (...args: Parameters<THandler>) => Promise<Response> {
  return async (...args: Parameters<THandler>) => {
    const request = args[0] as Request;
    const startedAt = performance.now();
    const requestId = request.headers.get("x-request-id")?.slice(0, 100) || randomUUID();
    const route = new URL(request.url).pathname.replace(/\b\d+\b/g, ":id");

    try {
      const response = await handler(...args);
      if (request.method !== "GET" && request.method !== "HEAD") {
        const level: CrmLogLevel = response.status >= 500 ? "error" : response.status >= 400 ? "warning" : "success";
        await writeCrmLog({
          level,
          source: "crm-api",
          event: "api.mutation",
          message: `${request.method} ${route} responded ${response.status}`,
          route,
          requestId,
          metadata: { status: response.status, duration_ms: Math.round(performance.now() - startedAt) },
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
        metadata: { duration_ms: Math.round(performance.now() - startedAt) },
      });
      throw error;
    }
  };
}