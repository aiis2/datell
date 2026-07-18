require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react-jsx',
  },
});

const assert = require('node:assert/strict');

const { runJsSandboxTool } = require('../src/renderer/tools/runJsSandbox.ts');

(async () => {
  const output = await runJsSandboxTool.execute({
    code: 'const values = [1, 2, 3]; console.log("sum", 6); result = { sum: values.reduce((a, b) => a + b, 0) };',
  });
  assert.match(output, /sum 6/, 'sandbox should capture console.log output');
  assert.match(output, /"sum": 6/, 'sandbox should return JSON-compatible result values');

  const isolatedEval = await runJsSandboxTool.execute({
    code: 'result = eval("2 + 2")',
  });
  assert.match(isolatedEval, /\b4\b/, 'QuickJS eval should remain available inside the isolated realm');

  const capabilityProbe = await runJsSandboxTool.execute({
    code: `result = Object['con' + 'structor'](
      'return ({["pro"+"cess"]:typeof pro'+"cess"+
      ',["req"+"uire"]:typeof req'+"uire"+
      ',["fe"+"tch"]:typeof fe'+"tch"+
      ',["doc"+"ument"]:typeof doc'+"ument"+
      ',["win"+"dow"]:typeof win'+"dow"+'})'
    )()`,
  });
  for (const capability of ['process', 'require', 'fetch', 'document', 'window']) {
    assert.match(
      capabilityProbe,
      new RegExp(`"${capability}": "undefined"`),
      `${capability} must not exist in the isolated runtime`,
    );
  }

  const startedAt = Date.now();
  const interrupted = await runJsSandboxTool.execute({
    code: 'for (let iterations = 0; ; iterations += 1) {}',
    timeout_ms: 1000,
  });
  assert.match(interrupted, /沙箱执行失败.*(?:超时|interrupt)/i, 'infinite loops should be interrupted');
  assert.ok(Date.now() - startedAt < 5000, 'timeout should return control within a bounded interval');

  const memoryLimited = await runJsSandboxTool.execute({
    code: `
      const chunks = [];
      for (;;) chunks.push(new Array(100000).fill('memory-pressure-sentinel'));
    `,
    timeout_ms: 5000,
  });
  assert.match(
    memoryLimited,
    /沙箱执行失败.*(?:内存|memory|allocation)/i,
    'excessive allocation should hit the sandbox memory limit',
  );

  console.log('security run js sandbox guard ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
