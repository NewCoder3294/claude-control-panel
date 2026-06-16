/**
 * Typed API errors carrying an HTTP status so server.ts can map cleanly.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

export const badRequest = (m: string): ApiHttpError => new ApiHttpError(400, m);
export const forbidden = (m: string): ApiHttpError => new ApiHttpError(403, m);
export const notFound = (m: string): ApiHttpError => new ApiHttpError(404, m);
