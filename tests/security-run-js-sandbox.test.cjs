require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react-jsx',
  },
});

const assert = require('node:assert/strict');

const { runJsSandboxTool, validateSandboxCode } = require('../src/renderer/tools/runJsSandbox.ts');

(async () => {
  assert.equal(
    validateSandboxCode('const values = [1, 2, 3]; result = values.reduce((a, b) => a + b, 0);'),
    null,
    'ordinary data calculation should be accepted',
  );
  assert.match(
    validateSandboxCode('result = Object.constructor("return globalThis")().fetch'),
    /constructor|globalThis/i,
    'constructor-based global escape should be rejected before execution',
  );
  assert.match(
    validateSandboxCode('while (true) { }'),
    /loop|循环|timeout|超时/i,
    'obvious infinite loops should be rejected before execution',
  );
  assert.match(
    validateSandboxCode('result = eval("2 + 2")'),
    /eval/i,
    'eval should be rejected before execution',
  );

  const output = await runJsSandboxTool.execute({
    code: 'const values = [1, 2, 3]; result = values.reduce((a, b) => a + b, 0);',
  });
  assert.match(output, /6/, 'sandbox should support assigning the final value to result');

  const blocked = await runJsSandboxTool.execute({
    code: 'result = Object.constructor("return globalThis")()',
  });
  assert.match(blocked, /沙箱执行失败|禁止模式|constructor/i, 'sandbox execute should reject constructor escape attempts');

  console.log('security run js sandbox guard ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
