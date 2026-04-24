import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const skillsRoot = path.join(repoRoot, 'skills');
const skillEntries = await readdir(skillsRoot, { withFileTypes: true });

for (const entry of skillEntries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const skillDir = path.join(skillsRoot, entry.name);
  const evalsFile = path.join(skillDir, 'evals', 'evals.json');
  if (!fs.existsSync(evalsFile)) {
    continue;
  }

  const evalPayload = JSON.parse(await readFile(evalsFile, 'utf8'));
  assert.equal(evalPayload.skill_name, entry.name, `eval skill_name should match ${entry.name}`);
  assert.ok(Array.isArray(evalPayload.evals) && evalPayload.evals.length > 0, `${entry.name} should define at least one eval case`);

  for (const item of evalPayload.evals) {
    assert.equal(typeof item.id, 'number', `${entry.name} eval should include a numeric id`);
    assert.equal(typeof item.prompt, 'string', `${entry.name} eval should include a prompt`);
    assert.equal(typeof item.expected_output, 'string', `${entry.name} eval should include expected_output`);
    assert.ok(Array.isArray(item.files) && item.files.length > 0, `${entry.name} eval should reference files`);
    assert.ok(Array.isArray(item.expectations) && item.expectations.length > 0, `${entry.name} eval should include expectations`);

    for (const relativeFile of item.files) {
      const resolvedPath = path.join(skillDir, relativeFile);
      assert.equal(fs.existsSync(resolvedPath), true, `missing eval file reference: ${path.relative(repoRoot, resolvedPath)}`);
    }
  }
}

console.log('eval validation ok');