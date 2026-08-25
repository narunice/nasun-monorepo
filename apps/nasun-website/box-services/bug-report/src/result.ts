// Shared handler result shape. Handlers return { status, body }; server.ts serializes it to a JSON response
// with the CORS headers applied by the global middleware.
export interface Result {
  status: number;
  body: unknown;
}
