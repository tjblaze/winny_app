export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = Omit<RequestInit, "credentials">;

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });
  const text = await response.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError("The server returned an unreadable response.", response.status);
    }
  }
  if (!response.ok) {
    const result =
      body && typeof body === "object" ? (body as { message?: unknown }).message : undefined;
    const message = Array.isArray(result)
      ? result.filter((value): value is string => typeof value === "string").join(" ")
      : typeof result === "string"
        ? result
        : "The request could not be completed.";
    throw new ApiError(message, response.status);
  }
  return body as T;
}
