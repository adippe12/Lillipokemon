/**
 * LILLIPEDEX listener — Worker entry point.
 * Everything (including /health) is handled by the singleton Durable Object,
 * which owns the always-on Twitch IRC connection.
 */
import { ChatListener } from "./listener";

export { ChatListener };

export interface Env {
  LISTENER: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  DEBUG_TOKEN?: string;
}

interface DurableObjectNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stub = env.LISTENER.get(env.LISTENER.idFromName("singleton"));
    return stub.fetch(request);
  },
};
