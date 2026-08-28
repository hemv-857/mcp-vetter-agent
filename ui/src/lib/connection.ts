import { useCallback, useEffect } from "react";
import { useStore } from "../store";
import { checkHealth, connect } from "./mcp";

const HEALTH_INTERVAL = 5000;

/**
 * Establishes and keeps the probe-server connection, and picks up a `?target=`
 * deep link. Every surface that can start an audit needs this, so it lives in
 * one place rather than in whichever component happens to be the entry point —
 * a second entry point that forgot to call it would sit at "connecting"
 * forever with no capabilities to report.
 *
 * Returns the probe itself so a failure banner can offer a manual retry.
 */
export function useProbeConnection(): () => void {
  const setConnection = useStore((s) => s.setConnection);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("target");
    if (target) useStore.setState({ repoUrl: target });
  }, []);

  const probe = useCallback(async () => {
    try {
      const health = await checkHealth();
      await connect();
      setConnection("connected", health);
    } catch {
      setConnection("disconnected", null);
    }
  }, [setConnection]);

  useEffect(() => {
    void probe();
    const id = window.setInterval(() => {
      const { phase } = useStore.getState();
      // never interrupt a running audit with a health round-trip
      if (phase === "scanning" || phase === "synthesizing" || phase === "filing") return;
      void probe();
    }, HEALTH_INTERVAL);
    return () => window.clearInterval(id);
  }, [probe]);

  return probe;
}
