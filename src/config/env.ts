/**
 * Environment access helpers.
 *
 * Env var names are CASE-SENSITIVE on Linux (Render, Docker, most CI). A var
 * set as `database_url` is NOT visible as `DATABASE_URL` there, so a config
 * that reads only the uppercase name silently gets `undefined` and the app
 * fails to connect with a confusing error. We look up both spellings.
 */
export function env(name: string): string | undefined {
  return process.env[name] ?? process.env[name.toLowerCase()] ?? process.env[name.toUpperCase()];
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Required environment variable ${name} is not set.`);
  return value;
}

export function envBool(name: string, fallback = false): boolean {
  const value = env(name);
  if (value === undefined) return fallback;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

export const isProduction = (): boolean => (env("NODE_ENV") ?? "").toLowerCase() === "production";
