import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("all local HTML assets and JavaScript modules exist with exact casing", async () => {
  const references = [];
  const index = await readFile(path.join(root, "index.html"), "utf8");

  for (const match of index.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (isLocalReference(match[1])) references.push(match[1]);
  }

  const visitedModules = new Set();
  const moduleQueue = references
    .filter((reference) => stripQuery(reference).endsWith(".js"))
    .map((reference) => stripQuery(reference));

  while (moduleQueue.length) {
    const modulePath = moduleQueue.shift();
    if (visitedModules.has(modulePath)) continue;
    visitedModules.add(modulePath);
    const source = await readFile(path.join(root, modulePath), "utf8");

    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      if (!isLocalReference(match[1])) continue;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(modulePath), stripQuery(match[1])),
      );
      references.push(resolved);
      if (resolved.endsWith(".js")) moduleQueue.push(resolved);
    }
  }

  for (const reference of references) {
    await assertExactPath(stripQuery(reference));
  }
});

test("browser asset references use one shared cache version", async () => {
  const files = ["index.html", "js/app.js", "js/ai.js"];
  const versions = [];

  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    versions.push(...[...source.matchAll(/[?&]v=([0-9-]+)/g)].map((match) => match[1]));
  }

  assert.ok(versions.length >= 3);
  assert.equal(new Set(versions).size, 1, `Cache versions differ: ${versions.join(", ")}`);
});

test("Apache configuration prevents stale HTML, CSS, and JavaScript", async () => {
  const configuration = await readFile(path.join(root, ".htaccess"), "utf8");
  assert.match(configuration, /FilesMatch\s+"\\\.\(html\|css\|js\)\$"/);
  assert.match(configuration, /Cache-Control\s+"no-cache, no-store, must-revalidate"/);
  assert.match(configuration, /Pragma\s+"no-cache"/);
  assert.match(configuration, /Expires\s+"0"/);
});

test("human players retain suggestion tuning controls", async () => {
  const index = await readFile(path.join(root, "index.html"), "utf8");
  assert.equal((index.match(/<label>Skill Level/g) ?? []).length, 2);
  assert.equal((index.match(/<label>Aggressiveness/g) ?? []).length, 2);
  assert.equal(index.includes("computer-only"), false);
});

test("narrow options use compact label and control rows", async () => {
  const styles = await readFile(path.join(root, "css", "styles.css"), "utf8");
  assert.match(styles, /\.options-body label,\s*\n\s*\.options-body \.field\s*\{\s*\n\s*grid-template-columns:/);
  assert.match(styles, /\.player-tuning\s*\{\s*display:\s*contents;\s*\}/);
});

test("wide options use a wider dialog and three-column layout", async () => {
  const styles = await readFile(path.join(root, "css", "styles.css"), "utf8");
  assert.match(styles, /\.options-dialog\s*\{\s*width:\s*min\(1180px,\s*calc\(100% - 20px\)\)/);
  assert.match(styles, /\.options-body\s*\{\s*overflow-y:\s*auto;\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

async function assertExactPath(relativePath) {
  const segments = relativePath.split("/").filter(Boolean);
  let current = root;

  for (const segment of segments) {
    const entries = await readdir(current);
    assert.ok(entries.includes(segment), `Missing or incorrectly cased path: ${relativePath}`);
    current = path.join(current, segment);
  }

  assert.equal((await stat(current)).isFile(), true, `Expected a file: ${relativePath}`);
}

function stripQuery(reference) {
  return reference.split(/[?#]/, 1)[0];
}

function isLocalReference(reference) {
  return !/^(?:[a-z]+:|\/\/|#)/i.test(reference);
}
