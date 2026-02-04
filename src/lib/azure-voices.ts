/**
 * Azure TTS 中文音色库
 * 包含普通话（zh-CN）的神经网络语音
 * 
 * 参考：https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/language-support?tabs=tts
 */

export interface AzureVoice {
  id: string           // 音色ID（即 voiceName）
  name: string         // 显示名称
  gender: 'male' | 'female'
  description: string  // 描述
  style?: string[]     // 支持的风格
  isDefault?: boolean  // 是否默认音色
}

/**
 * 中文普通话神经网络语音列表
 * 使用经过验证的官方音色
 */
export const AZURE_CHINESE_VOICES: AzureVoice[] = [
  // ============ 男声 ============
  {
    id: 'zh-CN-YunxiNeural',
    name: '云希',
    gender: 'male',
    description: '年轻男声，阳光活力，适合旁白解说',
    style: ['narration-professional', 'newscast', 'assistant'],
    isDefault: true
  },
  {
    id: 'zh-CN-YunjianNeural',
    name: '云健',
    gender: 'male',
    description: '成熟男声，沉稳大气，适合纪录片',
    style: ['narration-professional', 'sports-commentary', 'documentary-narration']
  },
  {
    id: 'zh-CN-YunyangNeural',
    name: '云扬',
    gender: 'male',
    description: '新闻主播风格，专业播报',
    style: ['newscast-casual', 'narration-professional', 'customerservice']
  },
  {
    id: 'zh-CN-YunyeNeural',
    name: '云野',
    gender: 'male',
    description: '故事讲述者，娓娓道来',
    style: ['narration-relaxed', 'embarrassed', 'fearful', 'sad', 'angry']
  },
  {
    id: 'zh-CN-YunhaoNeural',
    name: '云皓',
    gender: 'male',
    description: '年轻活力，适合广告配音',
    style: ['advertisement-upbeat']
  },
  {
    id: 'zh-CN-YunzeNeural',
    name: '云泽',
    gender: 'male',
    description: '温和男声，亲切自然',
    style: ['calm', 'narration-relaxed', 'documentary-narration']
  },
  {
    id: 'zh-CN-YunfengNeural',
    name: '云枫',
    gender: 'male',
    description: '中年男声，稳重可靠',
    style: ['narration-professional']
  },
  {
    id: 'zh-CN-YunxiaNeural',
    name: '云夏',
    gender: 'male',
    description: '少年音，清新明朗',
    style: ['narration-relaxed', 'chat']
  },
  {
    id: 'zh-CN-YunjieNeural',
    name: '云杰',
    gender: 'male',
    description: '播客风格，轻松随意',
    style: ['chat', 'narration-relaxed']
  },

  // ============ 女声 ============
  {
    id: 'zh-CN-XiaoxiaoNeural',
    name: '晓晓',
    gender: 'female',
    description: '年轻女声，甜美亲切，适合助手对话',
    style: ['affectionate', 'angry', 'assistant', 'calm', 'chat', 'cheerful', 'gentle', 'lyrical', 'newscast', 'poetry-reading', 'sad', 'serious'],
    isDefault: true
  },
  {
    id: 'zh-CN-XiaoyiNeural',
    name: '晓伊',
    gender: 'female',
    description: '温柔知性，适合有声书',
    style: ['affectionate', 'angry', 'cheerful', 'disgruntled', 'embarrassed', 'fearful', 'gentle', 'sad', 'serious']
  },
  {
    id: 'zh-CN-XiaohanNeural',
    name: '晓涵',
    gender: 'female',
    description: '成熟女声，端庄优雅',
    style: ['affectionate', 'angry', 'calm', 'cheerful', 'disgruntled', 'embarrassed', 'fearful', 'gentle', 'sad', 'serious']
  },
  {
    id: 'zh-CN-XiaomengNeural',
    name: '晓梦',
    gender: 'female',
    description: '可爱少女音，活泼俏皮',
    style: ['chat']
  },
  {
    id: 'zh-CN-XiaomoNeural',
    name: '晓墨',
    gender: 'female',
    description: '御姐音，成熟魅惑',
    style: ['affectionate', 'angry', 'calm', 'cheerful', 'depressed', 'disgruntled', 'embarrassed', 'envious', 'fearful', 'gentle', 'sad', 'serious']
  },
  {
    id: 'zh-CN-XiaoruiNeural',
    name: '晓睿',
    gender: 'female',
    description: '资深女声，沉稳专业',
    style: ['calm', 'fearful', 'angry', 'sad']
  },
  {
    id: 'zh-CN-XiaoshuangNeural',
    name: '晓双',
    gender: 'female',
    description: '童声，天真可爱',
    style: ['chat']
  },
  {
    id: 'zh-CN-XiaoxuanNeural',
    name: '晓萱',
    gender: 'female',
    description: '温婉女声，适合情感内容',
    style: ['angry', 'calm', 'cheerful', 'depressed', 'disgruntled', 'fearful', 'gentle', 'sad', 'serious']
  },
  {
    id: 'zh-CN-XiaoyanNeural',
    name: '晓颜',
    gender: 'female',
    description: '客服风格，专业亲和',
    style: ['calm', 'cheerful', 'customerservice']
  },
  {
    id: 'zh-CN-XiaoyouNeural',
    name: '晓悠',
    gender: 'female',
    description: '儿童故事，童趣温馨',
    style: []
  },
  {
    id: 'zh-CN-XiaozhenNeural',
    name: '晓甄',
    gender: 'female',
    description: '纪录片解说，沉静有力',
    style: ['angry', 'cheerful', 'disgruntled', 'documentary-narration', 'fearful', 'sad', 'serious']
  },
  {
    id: 'zh-CN-XiaochenNeural',
    name: '晓辰',
    gender: 'female',
    description: '轻快活泼，适合广告',
    style: ['lively']
  }
]

/**
 * 获取默认男声
 */
export function getDefaultMaleVoice(): AzureVoice {
  return AZURE_CHINESE_VOICES.find(v => v.gender === 'male' && v.isDefault) 
    || AZURE_CHINESE_VOICES.find(v => v.gender === 'male')!
}

/**
 * 获取默认女声
 */
export function getDefaultFemaleVoice(): AzureVoice {
  return AZURE_CHINESE_VOICES.find(v => v.gender === 'female' && v.isDefault)
    || AZURE_CHINESE_VOICES.find(v => v.gender === 'female')!
}

/**
 * 根据ID获取音色
 */
export function getVoiceById(id: string): AzureVoice | undefined {
  return AZURE_CHINESE_VOICES.find(v => v.id === id)
}

/**
 * 获取所有男声
 */
export function getMaleVoices(): AzureVoice[] {
  return AZURE_CHINESE_VOICES.filter(v => v.gender === 'male')
}

/**
 * 获取所有女声
 */
export function getFemaleVoices(): AzureVoice[] {
  return AZURE_CHINESE_VOICES.filter(v => v.gender === 'female')
}
