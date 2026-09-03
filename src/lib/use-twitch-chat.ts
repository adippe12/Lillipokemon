"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { buildTriggerRegex, findMonInText } from "./mons";

export type TwitchStatus = "idle" | "connecting" | "live" | "reconnecting";
export type ChatMessage = {
  id: string;
  user: string;
  displayName: string;
  color: string | null;
  text: string;
  ts: number;
};

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";

function parseIrcLine(line: string): ChatMessage | null {
  // Format: @tag1=v1;tag2=v2 :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :message
  let tagsStr = "";
  let rest = line;
  if (line.startsWith("@")) {
    const spaceIdx = line.indexOf(" ");
    tagsStr = line.slice(1, spaceIdx);
    rest = line.slice(spaceIdx + 1);
  }
  const privIdx = rest.indexOf(" PRIVMSG ");
  if (privIdx === -1) return null;
  const colonIdx = rest.indexOf(" :", privIdx);
  if (colonIdx === -1) return null;
  const text = rest.slice(colonIdx + 2);
  const prefix = rest.slice(rest.indexOf(":") + 1, privIdx); // nick!nick@nick.tmi.twitch.tv
  const user = prefix.split("!")[0] || "anonymous";

  const tags: Record<string, string> = {};
  for (const pair of tagsStr.split(";")) {
    const eq = pair.indexOf("=");
    if (eq > -1) tags[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  return {
    id: tags["id"] || `${user}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user,
    displayName: tags["display-name"] || user,
    color: tags["color"] || null,
    text,
    ts: tags["tmi-sent-ts"] ? Number(tags["tmi-sent-ts"]) : Date.now(),
  };
}

type UseTwitchChatOpts = {
  channel: string;
  triggers: string[];
  reserved?: string[];
  enabled?: boolean;
  onMatch?: (msg: ChatMessage, canonical: string) => void;
};

/**
 * Anonymous read-only Twitch chat listener over IRC WebSocket.
 * No API key, no OAuth — Twitch supports anonymous "justinfan" connections.
 */
export function useTwitchChat({ channel, triggers, reserved = [], enabled = true, onMatch }: UseTwitchChatOpts) {
  const [status, setStatus] = useState<TwitchStatus>("idle");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attempts = useRef(0);
  const mounted = useRef(true);
  const onMatchRef = useRef(onMatch);
  // indirection so connect <-> reconnect can reference each other safely
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    onMatchRef.current = onMatch;
  }, [onMatch]);

  const regexRef = useRef<RegExp | null>(null);
  useEffect(() => {
    regexRef.current = buildTriggerRegex(triggers);
  }, [triggers]);

  const reservedRef = useRef<string[]>([]);
  useEffect(() => {
    reservedRef.current = reserved;
  }, [reserved]);

  const scheduleReconnect = useCallback(() => {
    if (!mounted.current || !enabled) return;
    if (reconnectTimer.current) return;
    attempts.current += 1;
    const delay =
      Math.min(30000, 1500 * Math.pow(1.6, Math.min(attempts.current, 8))) +
      Math.random() * 800;
    setStatus((s) => (s === "idle" ? s : "reconnecting"));
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connectRef.current();
    }, delay);
  }, [enabled]);

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setStatus(attempts.current === 0 ? "connecting" : "reconnecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(IRC_URL);
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
      ws.send(`JOIN #${channel.toLowerCase()}`);
    };

    ws.onmessage = (event) => {
      const lines = String(event.data).split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) {
          ws.send(`PONG ${line.slice(5)}`);
          continue;
        }
        if (line.includes(" JOIN #") || line.includes(" 366 ")) {
          if (mounted.current) setStatus("live");
          attempts.current = 0;
          continue;
        }
        if (!line.includes(" PRIVMSG ")) continue;
        const msg = parseIrcLine(line);
        if (!msg) continue;
        if (!msg.text) continue;
        // admin trigger words first, then ANY word ending in "mon" (minus reserved)
        const canonical = findMonInText(msg.text, regexRef.current, reservedRef.current);
        if (canonical) {
          onMatchRef.current?.(msg, canonical);
        }
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }, [channel, enabled, scheduleReconnect]);

  useEffect(() => {
    mounted.current = true;
    connectRef.current = connect;
    // defer first connect so status changes don't fire synchronously in the effect
    const boot = setTimeout(() => connectRef.current(), 0);

    // keepalive: ping Twitch every 3.5 min so half-open sockets are detected
    keepaliveRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send("PING :tmi.twitch.tv");
        } catch {
          /* noop */
        }
      }
    }, 210_000);

    return () => {
      mounted.current = false;
      clearTimeout(boot);
      clearTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
      setStatus("idle");
    };
  }, [connect, clearTimers]);

  return { status };
}
