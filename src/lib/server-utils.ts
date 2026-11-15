import "server-only";
import { connection } from "next/server";

/** Opt into request-time rendering and return the current time. */
export async function requestNow(): Promise<number> {
  await connection();
  return Date.now();
}

export type Attempt<T> = { ok: true; data: T } | { ok: false; message: string };

/** Run a data loader and turn thrown errors into a value the page can render. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Unexpected error." };
  }
}
