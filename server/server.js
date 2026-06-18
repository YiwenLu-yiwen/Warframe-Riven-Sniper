import { createServer } from "node:http";
import { handleRequest } from "./app.js";

const port = Number(process.env.PORT || 4173);
const server = createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error(error);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } }));
  });
});

server.listen(port, () => {
  console.log(`Riven Sniper prototype server listening on http://localhost:${port}`);
});
