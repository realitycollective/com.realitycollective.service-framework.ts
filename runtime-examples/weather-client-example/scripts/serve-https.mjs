import { createServer } from "node:https";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import selfsigned from "selfsigned";

const port = Number(process.env.PORT ?? 4174);
const root = join(process.cwd(), "dist");

if (!existsSync(root)) {
  console.error("dist folder was not found. Run the build first.");
  process.exit(1);
}

const certificate = selfsigned.generate(
  [{ name: "commonName", value: "localhost" }],
  {
    days: 30,
    keySize: 2048,
    algorithm: "sha256"
  }
);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function resolveAssetPath(urlPath) {
  const sanitizedPath = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolvedPath = join(root, sanitizedPath);

  if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
    return resolvedPath;
  }

  return join(root, "index.html");
}

createServer(
  {
    key: certificate.private,
    cert: certificate.cert
  },
  (request, response) => {
    const url = request.url ?? "/";
    const filePath = resolveAssetPath(url === "/" ? "/index.html" : url);
    const extension = extname(filePath);
    const contentType = contentTypes[extension] ?? "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });

    createReadStream(filePath).pipe(response);
  }
).listen(port, () => {
  console.log(`HTTPS weather example available at https://localhost:${port}`);
});
