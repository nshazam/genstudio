// Calls the PRIVATE Cloud Run worker with a Google-signed ID token.
// The service account (GOOGLE_APPLICATION_CREDENTIALS_JSON) must have roles/run.invoker
// on the worker service. audience = the worker's base URL.
import { GoogleAuth } from "google-auth-library";

const WORKER_URL = process.env.WORKER_URL!;        // https://genstudio-worker-xxxx.run.app
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

let _auth: GoogleAuth | null = null;
function auth() {
  if (!_auth) {
    _auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!),
    });
  }
  return _auth;
}

export type GenOut = { modality: string; ext: string; b64: string };

export async function callWorker(input: {
  modality: string; prompt: string; params: Record<string, unknown>;
}): Promise<GenOut> {
  const client = await auth().getIdTokenClient(WORKER_URL);
  const res = await client.request<GenOut>({
    url: `${WORKER_URL}/generate`,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Worker-Secret": WORKER_SECRET },
    data: input,
    timeout: 900_000,
  });
  return res.data;
}
