const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>图表验证</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; }
    #chart { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="chart"></div>
  <script>
    const chart = echarts.init(document.getElementById('chart'));
    chart.setOption({
      title: { text: '销售趋势验证' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月'] },
      yAxis: { type: 'value' },
      series: [{
        data: [120, 200, 150, 280, 320],
        type: 'line',
        smooth: true,
        areaStyle: {}
      }]
    });
  </script>
</body>
</html>`;

const outPath = path.join(process.cwd(), 'release', 'chart-preview-test.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log(outPath);
