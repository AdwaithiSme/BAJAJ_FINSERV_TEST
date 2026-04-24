const express = require("express");
const cors = require("cors");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const USER_ID = process.env.USER_ID || "johndoe_17091999";
const EMAIL_ID = process.env.EMAIL_ID || "john.doe@srmist.edu.in";
const COLLEGE_ROLL = process.env.COLLEGE_ROLL || "RA2211003010001";     

function parseEntry(raw) {
  const entry = raw.trim();
  if (!entry) return { invalid: raw };

  const match = entry.match(/^([A-Z])->([A-Z])$/);
  if (!match) return { invalid: entry };

  const [, parent, child] = match;
  if (parent === child) return { invalid: entry }; // self-loop
  return { valid: true, parent, child, edge: entry };
}

function buildTree(node, children) {
  const obj = {};
  for (const child of (children[node] || [])) {
    obj[child] = buildTree(child, children);
  }
  return obj;
}

function hasCycle(start, children) {
  const visited = new Set();
  const stack = new Set();
  function dfs(node) {
    visited.add(node);
    stack.add(node);
    for (const child of (children[node] || [])) {
      if (!visited.has(child)) {
        if (dfs(child)) return true;
      } else if (stack.has(child)) {
        return true;
      }
    }
    stack.delete(node);
    return false;
  }
  return dfs(start);
}

function calcDepth(node, children) {
  const kids = children[node] || [];
  if (kids.length === 0) return 1;
  return 1 + Math.max(...kids.map(c => calcDepth(c, children)));
}

app.post("/bfhl", (req, res) => {
  const data = req.body?.data;
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: "data must be an array of strings" });
  }

  const invalid_entries = [];
  const duplicate_edges = [];
  const seenEdges = new Set();
  const childParent = {};     
  const children = {}; 
  const allNodes = new Set();

  for (const raw of data) {
    const result = parseEntry(String(raw));
    if (!result.valid) {
      invalid_entries.push(result.invalid);
      continue;
    }
    const { parent, child, edge } = result;

    if (seenEdges.has(edge)) {
      if (!duplicate_edges.includes(edge)) duplicate_edges.push(edge);
      continue;
    }
    seenEdges.add(edge);

    if (child in childParent) continue;

    childParent[child] = parent;
    if (!children[parent]) children[parent] = [];
    children[parent].push(child);
    allNodes.add(parent);
    allNodes.add(child);
  }

  const undirected = {};
  for (const node of allNodes) undirected[node] = new Set();
  for (const [child, parent] of Object.entries(childParent)) {
    undirected[parent].add(child);
    undirected[child].add(parent);
  }

  const visited = new Set();
  const groups = [];
  for (const node of [...allNodes].sort()) {
    if (visited.has(node)) continue;
    const group = new Set();
    const queue = [node];
    while (queue.length) {
      const n = queue.shift();
      if (group.has(n)) continue;
      group.add(n);
      visited.add(n);
      for (const nb of (undirected[n] || [])) {
        if (!group.has(nb)) queue.push(nb);
      }
    }
    groups.push([...group]);
  }

  const hierarchies = [];

  for (const group of groups) {
    const groupSet = new Set(group);
    const roots = group.filter(n => !(n in childParent) || !groupSet.has(childParent[n]));
    const root = roots.length > 0
      ? roots.sort()[0]
      : [...group].sort()[0];

    const cycle = hasCycle(root, children);

    if (cycle) {
      hierarchies.push({ root, tree: {}, has_cycle: true });
    } else {
      const tree = { [root]: buildTree(root, children) };
      const depth = calcDepth(root, children);
      hierarchies.push({ root, tree, depth });
    }
  }

  hierarchies.sort((a, b) => {
    if (!!a.has_cycle !== !!b.has_cycle) return a.has_cycle ? 1 : -1;
    return a.root.localeCompare(b.root);
  });

  const nonCyclic = hierarchies.filter(h => !h.has_cycle);
  const total_trees = nonCyclic.length;
  const total_cycles = hierarchies.filter(h => h.has_cycle).length;

  let largest_tree_root = "";
  let maxDepth = -1;
  for (const h of nonCyclic) {
    if (h.depth > maxDepth || (h.depth === maxDepth && h.root < largest_tree_root)) {
      maxDepth = h.depth;
      largest_tree_root = h.root;
    }
  }

  return res.json({
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: COLLEGE_ROLL,
    hierarchies,
    invalid_entries,
    duplicate_edges,
    summary: { total_trees, total_cycles, largest_tree_root },
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));