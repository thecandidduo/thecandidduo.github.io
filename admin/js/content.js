// Hand-rolled front matter + simple-YAML read/write. No library: the shapes
// this CMS touches are fixed and small (flat front matter; `_data/*.yml` is
// always a dict of arrays-of-flat-objects), so a full YAML parser is more
// risk than it's worth. Every rewritten file is a full re-serialization, not
// a format-preserving edit — same trade-off Decap itself makes.

function parseScalar(raw) {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => parseScalar(item.trim()));
  }
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}

function quoteString(str) {
  return '"' + String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

// `fieldTypes`: { [key]: 'date' | 'boolean' | 'tags' | 'number' | anything-else(string) }
// Dates are written bare (unquoted YAML timestamp) so Jekyll/Psych parses
// them as real Time objects, not strings — quoting `date:` breaks post
// sorting and date filters.
function serializeScalar(value, type) {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return String(!!value);
  if (type === "date") {
    const s = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : quoteString(s);
  }
  if (type === "number") return String(value);
  if (type === "tags" || Array.isArray(value)) {
    const items = Array.isArray(value) ? value : [value];
    return "[" + items.map((v) => quoteString(v)).join(", ") + "]";
  }
  return quoteString(value);
}

export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) return { data: {}, body: normalized };
  const lines = normalized.split("\n");
  let i = 1;
  const fmLines = [];
  for (; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      i++;
      break;
    }
    fmLines.push(lines[i]);
  }
  const body = lines.slice(i).join("\n").replace(/^\n+/, "");
  const data = {};
  for (const line of fmLines) {
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    data[m[1]] = parseScalar(m[2]);
  }
  return { data, body };
}

// `fields`: schema field list (order + type), used so output is stable and
// correctly typed. Fields absent/empty in `data` are omitted, matching how
// optional front matter fields look in hand-written posts.
export function serializeFrontmatter(data, body, fields) {
  const lines = ["---"];
  for (const f of fields) {
    if (f.isBody) continue;
    const v = data[f.name];
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    lines.push(`${f.name}: ${serializeScalar(v, f.type)}`);
  }
  lines.push("---", "", (body || "").trim(), "");
  return lines.join("\n");
}

// ---- `_data/*.yml`: a dict of top-level keys, each a block sequence of
// flat objects, e.g.:
//   hero:
//     - image: /a.jpg
//       title: Hi
//     - image: /b.jpg
//       title: Bye
export function parseListsYaml(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const result = {};
  let currentKey = null;
  let currentItem = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const topMatch = rawLine.match(/^([A-Za-z0-9_]+):\s*$/);
    if (topMatch) {
      currentKey = topMatch[1];
      result[currentKey] = [];
      currentItem = null;
      continue;
    }
    const itemStart = rawLine.match(/^\s*-\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (itemStart && currentKey) {
      currentItem = {};
      result[currentKey].push(currentItem);
      currentItem[itemStart[1]] = parseScalar(itemStart[2]);
      continue;
    }
    const cont = rawLine.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (cont && currentItem) {
      currentItem[cont[1]] = parseScalar(cont[2]);
      continue;
    }
  }
  return result;
}

// `sections`: [{ key, itemFields: [{name,type}, ...] }] — controls key order
// and typing per section, since object key order in `data` isn't guaranteed
// to match the schema after form editing.
export function serializeListsYaml(data, sections) {
  const out = [];
  for (const section of sections) {
    const items = data[section.key] || [];
    out.push(`${section.key}:`);
    if (items.length === 0) {
      out.push("  []");
      continue;
    }
    for (const item of items) {
      let first = true;
      for (const f of section.itemFields) {
        const v = item[f.name];
        if (v === null || v === undefined || v === "") continue;
        const prefix = first ? "  - " : "    ";
        out.push(`${prefix}${f.name}: ${serializeScalar(v, f.type)}`);
        first = false;
      }
    }
  }
  out.push("");
  return out.join("\n");
}
