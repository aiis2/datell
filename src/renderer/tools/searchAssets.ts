import type { AgentToolDefinition } from '../types';

export const searchAssetsTool: AgentToolDefinition = {
  name: 'searchAssets',
  description: '搜索可用的自带插画(unDraw)和图标(Tabler Icons)名称，用于丰富报告排版和配图。返回匹配的资源标签(slug/name)。',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: '搜索的英文关键词，例如 "business", "data", "nature", "success"',
      required: true,
    },
    {
      name: 'type',
      type: 'string',
      description: '要搜索的资源类型： "illustrations"（插画）或 "icons"（小图标）',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>, context?: any) => {
    const query = (args.query as string).toLowerCase();
    const type = args.type as string;

    try {
      if (type === 'illustrations') {
        const response = await fetch('/vendor/undraw-catalog.json');
        if (!response.ok) return '无法加载插画库';
        const catalog = await response.json();
        
        const results = catalog.filter((item: any) => 
          item.title?.toLowerCase().includes(query) || 
          item.slug?.toLowerCase().includes(query)
        ).slice(0, 15);

        if (results.length === 0) return '未找到匹配的插画，请尝试其他英文关键词。';

        return '查找到以下插画，可用作 <img src="https://cdn.undraw.co/illustration/{slug}.svg?color={主色号(去掉#)}">\n\n' + 
          results.map((r: any) => `- slug: ${r.slug} (标题: ${r.title})`).join('\n');
      } else if (type === 'icons') {
        // Tabler icons or similar from our list
        const response = await fetch('/vendor/icons-list.json');
        if (!response.ok) return '尝试使用 Tabler Icons 的英文名即可（无需搜索通常可直接猜对）。';
        const icons = await response.json();
        const results = icons.filter((icon: string) => icon.toLowerCase().includes(query)).slice(0, 30);
        
        if (results.length === 0) return '未找到匹配的图标，请尝试其他常用的英文单词。';
        return '查找到以下图标可用于内联 svg sprite引用：\n' + results.join(', ');
      }
    } catch (e) {
      return '搜索异常：' + String(e);
    }
    
    return '未知的搜索类型';
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  getActivityDescription: (args) => {
    return `搜索资源: ${String(args.query ?? args.keyword ?? '')}`;
  },
};
