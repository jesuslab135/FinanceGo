export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

export function toApiError(status: number, body: unknown): ApiError {
  const e = (body as ErrorBody | undefined)?.error;
  return new ApiError(status, e?.code ?? "internal", e?.message ?? `HTTP ${status}`, e?.fields ?? {});
}
